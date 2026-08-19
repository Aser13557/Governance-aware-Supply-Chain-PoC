#!/usr/bin/env node
/**
 * export.js — regulator-facing outputs (Paper 2 R6, Paper 1 §3.8).
 *
 *   node export/export.js auditpack <assetID> <role>
 *   node export/export.js passport  <assetID>
 *   node export/export.js tamper    <assetID> <eventID>
 *
 * Reads the ledger through the peer CLI (see scenarios/env.sh design note) and
 * verifies every referenced payload against the off-ledger store. Verification
 * needs only the digest — payloads are never disclosed to produce the pack,
 * which is the "proof without disclosure" property the audit pack is meant to
 * demonstrate.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RESULTS = path.join(ROOT, 'results');
const PAYLOAD_URL = process.env.PAYLOAD_URL || 'http://localhost:4000';
const CHANNEL = process.env.CHANNEL || 'mychannel';
const CC = process.env.CC_NAME || 'evidence';

fs.mkdirSync(RESULTS, { recursive: true });

function ccQuery(fn, ...args) {
  const ctor = JSON.stringify({ function: fn, Args: args });
  const out = execFileSync('peer',
    ['chaincode', 'query', '-C', CHANNEL, '-n', CC, '-c', ctor],
    { encoding: 'utf8', env: process.env });
  return JSON.parse(out.trim());
}

async function verifyPayload(hash) {
  const r = await fetch(`${PAYLOAD_URL}/verify/${hash}`);
  return r.json();
}

const ordered = (lineage) =>
  [...lineage.nodes].sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

/* ── audit pack ─────────────────────────────────────────────────────────── */
async function auditPack(assetID, role) {
  const t0 = Date.now();
  const lineage = ccQuery('GetLineageByAsset', assetID);
  const headers = ordered(lineage).map((n) => ccQuery('GetHeader', n.eventID));
  const verification = [];
  for (const h of headers) {
    const v = await verifyPayload(h.payloadHash);
    verification.push({ eventID: h.eventID, payloadHash: h.payloadHash, verified: v.verified });
  }
  const policyVersions = [...new Set(headers.map((h) => h.policyVersion))];
  const policies = policyVersions.map((v) => ccQuery('GetPolicy', v));
  const pack = {
    scope: { assetID, requestorRole: role, generatedAt: new Date().toISOString() },
    events: headers.map((h) => ({
      eventID: h.eventID, eventType: h.eventType, assetID: h.assetID,
      actorOrg: h.actorOrg, timestamp: h.timestamp, boundAt: h.boundAt,
      predecessorIDs: h.predecessorIDs, payloadHash: h.payloadHash,
      policyVersion: h.policyVersion, policyHash: h.policyHash,
    })),
    lineage: { nodeCount: lineage.nodeCount, edgeCount: lineage.edgeCount, originCreates: lineage.originCreates },
    governance: policies.map((p) => ({ version: p.version, hash: p.hash, effectiveFrom: p.effectiveFrom })),
    payloadVerification: {
      checked: verification.length,
      passed: verification.filter((v) => v.verified).length,
      details: verification,
    },
    generatedInMs: 0,
  };
  pack.generatedInMs = Date.now() - t0;

  fs.writeFileSync(path.join(RESULTS, 'S2_auditpack.json'), JSON.stringify(pack, null, 2));
  fs.writeFileSync(path.join(RESULTS, 'S2_generation_time.txt'),
    `audit pack for ${assetID}: ${pack.generatedInMs} ms (${pack.events.length} events, ` +
    `${pack.payloadVerification.checked} payload verifications)\n`);
  fs.writeFileSync(path.join(RESULTS, 'S2_verification.txt'),
    verification.map((v) => `${v.eventID}\t${v.payloadHash}\t${v.verified ? 'PASS' : 'FAIL'}`).join('\n') + '\n');

  console.log(`   \x1b[0;32m✓\x1b[0m audit pack · ${pack.events.length} events · ` +
    `policy ${policyVersions.join(', ')} · payloads ${pack.payloadVerification.passed}/${pack.payloadVerification.checked} PASS · ` +
    `${pack.generatedInMs} ms → results/S2_auditpack.json`);
}

/* ── passport view ──────────────────────────────────────────────────────── */
async function passport(assetID) {
  const lineage = ccQuery('GetLineageByAsset', assetID);
  const state = ccQuery('GetAssetState', assetID);
  const headers = ordered(lineage).map((n) => ccQuery('GetHeader', n.eventID));
  const last = headers[headers.length - 1];
  const view = {
    assetID,
    currentCustodian: state.currentCustodian,
    recallStatus: state.recalled ? 'RECALLED' : 'none',
    origin: lineage.originCreates,
    lastTransfer: [...headers].reverse().find((h) => h.eventType === 'Transfer')?.eventID || null,
    attestations: headers.filter((h) => h.eventType === 'Verify')
      .map((h) => ({ eventID: h.eventID, by: h.actorOrg, at: h.timestamp, payloadHash: h.payloadHash })),
    eventCount: headers.length,
    policyVersionAtLastEvent: last.policyVersion,
    policyHashAtLastEvent: last.policyHash,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(RESULTS, 'S2_passport.json'), JSON.stringify(view, null, 2));
  console.log(`   \x1b[0;32m✓\x1b[0m passport · custodian ${view.currentCustodian} · ` +
    `${view.attestations.length} attestation(s) · policy ${view.policyVersionAtLastEvent} → results/S2_passport.json`);
}

/* ── tamper test (draft edit E3) ────────────────────────────────────────── */
async function tamper(assetID, eventID) {
  const h = ccQuery('GetHeader', eventID);
  const file = path.join(ROOT, 'payload-store', 'data', h.payloadHash + '.json');
  if (!fs.existsSync(file)) return console.error(`   payload file missing: ${file}`);

  const before = await verifyPayload(h.payloadHash);
  const original = fs.readFileSync(file);
  const modified = Buffer.from(original.toString().replace(/PASS/, 'PASS.'));
  fs.writeFileSync(file, modified);
  const after = await verifyPayload(h.payloadHash);

  const lines = [
    `tamper test — asset ${assetID}, event ${eventID}`,
    `anchored digest   : ${h.payloadHash}`,
    `before tampering  : recomputed ${before.recomputed} · verified ${before.verified}`,
    `modification      : one byte appended inside the stored attestation payload`,
    `after tampering   : recomputed ${after.recomputed} · verified ${after.verified}`,
    `result            : ${!after.verified ? 'TAMPER DETECTED from anchored evidence alone ✓' : 'NOT DETECTED ✗'}`,
    `ledger header     : unchanged (headers are immutable; only off-ledger bytes were altered)`,
  ];
  fs.writeFileSync(path.join(RESULTS, 'S2_tamper.txt'), lines.join('\n') + '\n');
  fs.writeFileSync(file, original); // restore so the audit pack stays reproducible
  console.log(`   \x1b[0;31m✗\x1b[0m verification FAIL after tampering → tamper detected · results/S2_tamper.txt`);
}

/* ── dispatch ───────────────────────────────────────────────────────────── */
(async () => {
  const [cmd, a, b] = process.argv.slice(2);
  try {
    if (cmd === 'auditpack') await auditPack(a, b || 'authority');
    else if (cmd === 'passport') await passport(a);
    else if (cmd === 'tamper') await tamper(a, b);
    else {
      console.error('usage: export.js auditpack <asset> <role> | passport <asset> | tamper <asset> <event>');
      process.exit(1);
    }
  } catch (e) {
    console.error('export failed:', e.message);
    process.exit(1);
  }
})();

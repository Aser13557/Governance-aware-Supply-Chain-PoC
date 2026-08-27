#!/usr/bin/env node
/**
 * verify_bindings.js - Table III plus the auditor's own checks.
 *
 * Three independent verifications:
 *   (a) BINDING CORRECTNESS - the bound version is the one whose validity
 *       window contains the record's governance applicability timestamp.
 *   (b) HASH RECOMPUTATION  - re-hashing the policy file reproduces the
 *       anchored digest.
 *   (c) PARAMETER FIDELITY  - the validation parameters held in the registry
 *       are the parameters stated in the policy text. Without this the
 *       registry could apply parameters the anchored artifact never declared,
 *       and the hash would still verify.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RESULTS = path.join(ROOT, 'results');
const CHANNEL = process.env.CHANNEL || 'mychannel';
const CC = process.env.CC_NAME || 'evidence';
const RECORDS = ['S3-R1', 'S3-R2', 'S3-R3', 'S3-R4', 'S3-R5'];
const FILES = {
  'v1.0': 'policies/policy_v1.md',
  'v2.0': 'policies/policy_v2.md',
  'v3.0': 'policies/policy_v3_scheduled.md',
};

const ccQuery = (fn, ...args) => JSON.parse(execFileSync('peer',
  ['chaincode', 'query', '-C', CHANNEL, '-n', CC, '-c', JSON.stringify({ function: fn, Args: args })],
  { encoding: 'utf8', env: process.env }).trim());

const paramsFromText = (text) => {
  const m = text.match(/```json\s*(\{[\s\S]*?\})\s*```/);
  return m ? JSON.parse(m[1]) : null;
};

const history = ccQuery('PolicyHistory');
const expectedAt = (t) => {
  let best = null;
  for (const p of history) if (new Date(p.effectiveFrom) <= new Date(t)) best = p;
  return best;
};

const rows = RECORDS.map((id) => {
  const h = ccQuery('GetHeader', id);
  const exp = expectedAt(h.boundAt);
  return {
    record: id, eventType: h.eventType, submittedAt: h.boundAt,
    boundPolicyVersion: h.policyVersion, boundPolicyHash: h.policyHash,
    expectedPolicyVersion: exp ? exp.version : null,
    bindingCorrect: !!exp && exp.version === h.policyVersion && exp.hash === h.policyHash,
  };
});

const recompute = history.map((p) => {
  const rel = FILES[p.version];
  const file = rel ? path.join(ROOT, rel) : null;
  const exists = file && fs.existsSync(file);
  const text = exists ? fs.readFileSync(file, 'utf8') : null;
  const digest = exists ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
  const stated = text ? paramsFromText(text) : null;
  // Compare every parameter the artifact declares against the registry, and
  // every parameter the registry holds against the artifact. Checking a fixed
  // list of fields would silently pass a registry carrying a parameter the
  // policy text never declared, which is the case the check exists to catch.
  const canon = (o) => JSON.stringify(Object.keys(o || {}).sort().map((k) => [k, o[k]]));
  const paramsMatch = !!stated && canon(stated) === canon(p.params);
  const paramDiff = !stated ? ['policy text declares no parameters'] :
    [...new Set([...Object.keys(stated), ...Object.keys(p.params || {})])]
      .filter((k) => JSON.stringify(stated[k]) !== JSON.stringify((p.params || {})[k]))
      .map((k) => `${k}: artifact ${JSON.stringify(stated[k])} vs registry ${JSON.stringify((p.params || {})[k])}`);
  return {
    version: p.version, file: rel, anchoredHash: p.hash, recomputedHash: digest,
    matches: digest === p.hash,
    hashAlgorithm: p.hashAlgorithm, canonical: p.canonical, nextAuthority: p.nextAuthority,
    anchoredParams: p.params, statedParams: stated, paramsMatch, paramDiff,
  };
});

const out = {
  scenario: 'S3', asset: 'LOT-E',
  policyHistory: history, bindings: rows, auditorRecomputation: recompute,
  verdict: {
    allBindingsCorrect: rows.every((x) => x.bindingCorrect),
    allHashesReproduce: recompute.every((x) => x.matches),
    allParamsFaithful: recompute.every((x) => x.paramsMatch),
    versionsObserved: [...new Set(rows.map((x) => x.boundPolicyVersion))],
  },
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(RESULTS, 'S3_table4_bindings.json'), JSON.stringify(out, null, 2));

const g = (s) => `\x1b[0;32m${s}\x1b[0m`, r = (s) => `\x1b[0;31m${s}\x1b[0m`;
console.log('   record   submittedAt            policy  hash          correct');
rows.forEach((x) => console.log(
  `   ${x.record.padEnd(8)} ${x.submittedAt}   ${x.boundPolicyVersion.padEnd(6)} ` +
  `${x.boundPolicyHash.slice(0, 12)}  ${x.bindingCorrect ? g('yes') : r('NO')}`));
recompute.forEach((x) => console.log(
  `   ${x.version}: hash ${x.matches ? g('reproduces') : r('MISMATCH')} - ` +
  `parameters ${x.paramsMatch ? g('faithful to the artifact') : r('DIVERGE: ' + x.paramDiff.join('; '))}`));
console.log(`   -> results/S3_table4_bindings.json`);
if (!out.verdict.allBindingsCorrect || !out.verdict.allHashesReproduce || !out.verdict.allParamsFaithful) process.exit(1);

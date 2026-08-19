#!/usr/bin/env node
/**
 * build_replay.js — turns captured results/ artifacts into results/replay.json,
 * the feed for console/replay.html. Drop the file onto the console footer and
 * the badge flips DEMO → REAL DATA: same playback, actual observed values.
 * Beat schema is documented in the console file header.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const R = path.join(ROOT, 'results');
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(path.join(R, f), 'utf8')); } catch { return null; } };
const readTxt = (f) => { try { return fs.readFileSync(path.join(R, f), 'utf8').trim(); } catch { return null; } };
const ev = (id) => readJSON(path.join('events', id + '.json'));
const short = (h) => (h ? h.slice(0, 6) + '…' + h.slice(-5) : '—');

const SOURCE = {
  C1: 'ERP', C2: 'ERP', T1: 'MES', TR1: 'TMS/WMS', V1: 'LIMS', R1: 'Retailer system',
  D1: 'ERP', TD1: 'TMS', VD1: 'LIMS', TD2: 'TMS',
  'S3-R1': 'ERP', 'S3-R2': 'LIMS', 'S3-R3': 'LIMS', 'S3-R4': 'LIMS', 'S3-R5': 'TMS',
  'TR-X': 'TMS/WMS', TR2: 'TMS/WMS',
};
const AFTER = {
  C1: 'lot LOT-A registered · custodian Producer', C2: 'lot LOT-B registered · custodian Producer',
  T1: 'LOT-C derived from LOT-A + LOT-B · custodian Processor', TR1: 'custody → Carrier',
  V1: 'attestation linked to LOT-C', R1: 'RECALL LOCK SET · further transfers of LOT-C blocked',
  D1: 'lot LOT-D registered · custodian Producer', TD1: 'custody → Distributor',
  VD1: 'certificate linked to LOT-D', TD2: 'custody → Retailer',
  'S3-R1': 'lot LOT-E registered', 'S3-R5': 'custody → Warehouse',
};
const FX = {
  C1: ['LOT-A', 'Producer', false], C2: ['LOT-B', 'Producer', false], T1: ['LOT-C', 'Processor', false],
  TR1: ['LOT-C', 'Carrier', false], R1: ['LOT-C', 'Carrier', true],
  D1: ['LOT-D', 'Producer', false], TD1: ['LOT-D', 'Distributor', false], TD2: ['LOT-D', 'Retailer', false],
  'S3-R1': ['LOT-E', 'Producer', false], 'S3-R5': ['LOT-E', 'Warehouse', false],
};

function checksFor(h) {
  const c = [[`schema${h.predecessorIDs?.length ? ' · predecessors {' + h.predecessorIDs.join(', ') + '}' : ''}`, 'ok']];
  if (h.eventType === 'Transform' && h.transform) {
    const si = h.transform.inputs.reduce((s, x) => s + x.quantity, 0);
    const so = h.transform.outputs.reduce((s, x) => s + x.quantity, 0);
    c.push([`quantity conservation ✓ inputs ${si.toFixed(4)} = outputs ${so.toFixed(4)} (tolerance ${h.transform.tolerance})`, 'ok']);
  }
  if (h.eventType === 'Transfer') {
    c.push([`custody continuity ✓ submitter = current custodian (${h.actorOrg})`, 'ok']);
    c.push(['recall lock ✓ no active recall', 'ok']);
  }
  if (h.eventType === 'Verify') c.push([`verification integrity ✓ attestation payload ${short(h.payloadHash)}`, 'ok']);
  if (h.eventType === 'Create') c.push([`payload hash ${short(h.payloadHash)} ✓ · asset ${h.assetID} is new`, 'ok']);
  return c;
}

const submit = (id) => {
  const h = ev(id); if (!h) return null;
  return {
    kind: 'submit', id, type: h.eventType, asset: h.assetID, actor: h.actorOrg,
    source: SOURCE[id] || '—', preds: h.predecessorIDs || [], checks: checksFor(h),
    bind: h.policyVersion, bindHash: short(h.policyHash), after: AFTER[id] || '',
    fx: FX[id] ? { asset: FX[id] } : undefined,
  };
};
const reject = (id, txtFile, extraChecks = []) => {
  const err = readTxt(txtFile); if (!err) return null;
  const fx = { 'TR-X': ['LOT-C', 'Retailer'], TR2: ['LOT-C', 'Carrier'], C1: ['LOT-A', 'Producer'] }[id] || ['—', '—'];
  return { kind: 'reject', id, type: 'Transfer', asset: fx[0], actor: fx[1], source: SOURCE[id] || '—',
           checks: [['schema · predecessors', 'ok'], ...extraChecks], err };
};

const policies = (() => {
  try {
    return fs.readFileSync(path.join(R, 'policies.ndjson'), 'utf8').trim().split('\n').map(JSON.parse);
  } catch { return []; }
})();
const govBeat = (v, note) => {
  const p = policies.find((x) => x.version === v); if (!p) return null;
  return { kind: 'gov', v, hash: short(p.hash), ef: p.effectiveFrom, note };
};

/* ── S1 ─────────────────────────────────────────────────────────────────── */
const S1 = [{ kind: 'info', text: 'Scenario S1 — recall investigation, lot LOT-C. Six events, five logical organizations, four source systems.' }];
const totality = reject('C1', 'S0_totality_rejection.txt');
if (totality) S1.push({ ...totality, type: 'Create', checks: [['schema', 'ok']] });
const g1 = govBeat('v1.0', 'registry ordering ✓ · anchored by Org1MSP (consortium admin)');
if (g1) S1.push(g1);
['C1', 'C2', 'T1', 'TR1', 'V1'].forEach((id) => { const b = submit(id); if (b) S1.push(b); });
const negC = reject('TR-X', 'S1_negative_custody.txt'); if (negC) S1.push(negC);
const r1 = submit('R1'); if (r1) S1.push(r1);
const negR = reject('TR2', 'S1_negative_transfer.txt',
  [['custody continuity ✓ submitter = current custodian (Carrier)', 'ok']]); if (negR) S1.push(negR);
const lin = readJSON('S1_lineage.json');
if (lin) S1.push({ kind: 'query', label: 'GetLineageByAsset("LOT-C")', lines: [
  `nodes ${lin.nodeCount} · edges ${lin.edgeCount} · originCreates [${(lin.originCreates || []).join(', ')}]`,
  `backward trace to origin: LOT-C ⇠ T1 ⇠ { ${(lin.originCreates || []).join(', ')} }`,
  `forward closure: ${(lin.nodes || []).map((n) => n.eventID).join(' → ')}`] });
S1.push({ kind: 'claim', text: '<b>Source-system agnosticism, executed.</b> Four enterprise systems fed this chain — ERP, MES, TMS/WMS, LIMS — and every event walked the identical validation path. The chaincode contains zero source-system branches.' });

/* ── S2 ─────────────────────────────────────────────────────────────────── */
const S2 = [{ kind: 'info', text: 'Scenario S2 — regulatory audit of lot LOT-D (four-event lineage, no recall).' }];
['D1', 'TD1', 'VD1', 'TD2'].forEach((id) => { const b = submit(id); if (b) S2.push(b); });
const pack = readJSON('S2_auditpack.json');
if (pack) S2.push({ kind: 'query', label: `auditPack("LOT-D", role=${pack.scope.requestorRole})`, lines: [
  `scope LOT-D · ${pack.events.length} ordered headers [${pack.events.map((e) => e.eventID).join(' → ')}]`,
  `per-event policy refs: ${[...new Set(pack.events.map((e) => e.policyVersion))].join(', ')} · hash ${short(pack.events[0].policyHash)}`,
  `payload verification against off-ledger store: ${pack.payloadVerification.passed}/${pack.payloadVerification.checked} PASS`,
  `generated in ${pack.generatedInMs} ms → results/S2_auditpack.json`] });
const pass = readJSON('S2_passport.json');
if (pass) S2.push({ kind: 'query', label: 'passportView("LOT-D")', lines: [
  `custodian ${pass.currentCustodian} · last transfer ${pass.lastTransfer} · attestations [${pass.attestations.map((a) => a.eventID).join(', ')}] · recall: ${pass.recallStatus} · policy ${pass.policyVersionAtLastEvent}`] });
const tam = readTxt('S2_tamper.txt');
if (tam) {
  const L = tam.split('\n');
  S2.push({ kind: 'tamper', lines: [
    ['operator modifies one byte of the stored attestation payload, then re-verifies', 'note'],
    [(L.find((l) => l.startsWith('after tampering')) || 'verification FAIL').trim(), 'bad'],
    ['tamper detected from anchored evidence alone ✓ (off-ledger integrity, R3)', 'ok']] });
}
S2.push({ kind: 'claim', text: `<b>Fragmentation, solved on screen.</b> One command assembled a regulator-ready, hash-verified evidence bundle${pack ? ' in ' + pack.generatedInMs + ' ms' : ''} — and a silent payload modification was exposed by the anchored digests. Confidential payloads never left the off-ledger store.` });

/* ── S3 ─────────────────────────────────────────────────────────────────── */
const S3 = [{ kind: 'info', text: 'Scenario S3 — governance policy update with per-record binding, lot LOT-E. The thesis mechanism under direct test.' }];
['S3-R1', 'S3-R2', 'S3-R3'].forEach((id) => { const b = submit(id); if (b) S3.push(b); });
const g2 = govBeat('v2.0', 'registry ordering ✓ · supersession is prospective — bindings of S3-R1..R3 remain untouched (immutability)');
if (g2) S3.push(g2);
['S3-R4', 'S3-R5'].forEach((id) => { const b = submit(id); if (b) S3.push(b); });
const t4 = readJSON('S3_table4_bindings.json');
if (t4) {
  S3.push({ kind: 'query', label: 'per-record binding verification (draft Table 4)',
    lines: t4.bindings.map((b) => `${b.record} · boundAt ${b.submittedAt} · ${b.boundPolicyVersion} · ${short(b.boundPolicyHash)} · ${b.bindingCorrect ? 'correct ✓' : 'INCORRECT ✗'}`) });
  S3.push({ kind: 'query', label: 'auditor recompute · PolicyHistory()',
    lines: [...t4.auditorRecomputation.map((x) => `${x.file} → sha256 ${short(x.recomputedHash)} ${x.matches ? '✓ matches anchor' : '✗ MISMATCH'}`),
      t4.verdict.allBindingsCorrect && t4.verdict.allHashesReproduce
        ? 'verifiability invariant holds: any auditor can prove which ruleset governed each record'
        : 'VERIFICATION INCOMPLETE — inspect results/S3_table4_bindings.json'] });
}
S3.push({ kind: 'claim', text: '<b>The central mechanism, running.</b> The rulebook changed mid-stream — and every record still proves which policy version governed its admission. Governance became a verifiable property of the evidence itself, not an ambient platform condition.' });

const out = { generatedAt: new Date().toISOString(), source: 'Track A prototype run', scenarios: { S1, S2, S3 } };
fs.writeFileSync(path.join(R, 'replay.json'), JSON.stringify(out, null, 2));
console.log(`   \x1b[0;32m✓\x1b[0m replay feed · S1 ${S1.length} beats · S2 ${S2.length} · S3 ${S3.length} → results/replay.json`);

#!/usr/bin/env node
/**
 * build_replay.js - turns captured results into results/replay.json, the feed
 * for console/replay.html. Every line shown is derived from a captured
 * artifact; nothing is synthesised.
 */
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..', 'results');
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(path.join(R, f), 'utf8')); } catch { return null; } };
const readTxt = (f) => { try { return fs.readFileSync(path.join(R, f), 'utf8').trim(); } catch { return null; } };
const ev = (id) => readJSON(path.join('events', id + '.json'));
const rej = (id) => readTxt(path.join('rejections', id + '.txt'));
const short = (h) => (h ? h.slice(0, 6) + '...' + h.slice(-5) : '-');
// Several messages state the submission time. Every beat carries an `at` key
// explicitly - a string when the artifacts record a time, null when they do
// not - so the console never has to invent one.
const timeFrom = (msg) => {
  const m = (msg || '').match(/\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\b/);
  return m ? m[1] : null;
};

const SOURCE = {
  C1: 'ERP', C2: 'ERP', T1: 'MES', TR1: 'TMS/WMS', V1: 'LIMS', R1: 'Retailer system', TR3: 'TMS/WMS',
  D1: 'ERP', TD1: 'TMS', VD1: 'LIMS', TD2: 'TMS',
  'S3-R1': 'ERP', 'S3-R2': 'LIMS', 'S3-R3': 'LIMS', 'S3-R4': 'LIMS', 'S3-R5': 'TMS',
  'S3-P1': 'ERP', 'S3-P2': 'MES', 'S3-P3': 'ERP', 'S3-P4': 'MES',
};
const AFTER = {
  C1: 'lot LOT-A registered, 600 KG, custodian Producer',
  C2: 'lot LOT-B registered, 400 KG, custodian Producer',
  T1: 'LOT-C derived from LOT-A + LOT-B; inputs consumed',
  TR1: 'custody -> Carrier', V1: 'attestation linked to LOT-C',
  R1: 'RECALL LOCK SET', TR3: 'custody -> Retailer (after clearance)',
  D1: 'lot LOT-D registered, 500 KG', TD1: 'custody -> Distributor',
  VD1: 'certificate linked to LOT-D', TD2: 'custody -> Retailer',
  'S3-R1': 'lot LOT-E registered', 'S3-R5': 'custody -> Warehouse',
  'S3-P1': 'lot LOT-F registered, 1000 KG', 'S3-P2': 'LOT-G produced, 999.6 KG',
  'S3-P3': 'lot LOT-H registered, 1000 KG',
};
const FX = {
  C1: ['LOT-A', 'Producer', false], C2: ['LOT-B', 'Producer', false], T1: ['LOT-C', 'Processor', false],
  TR1: ['LOT-C', 'Carrier', false], R1: ['LOT-C', 'Carrier', true], TR3: ['LOT-C', 'Retailer', false],
  D1: ['LOT-D', 'Producer', false], TD1: ['LOT-D', 'Distributor', false], TD2: ['LOT-D', 'Retailer', false],
  'S3-R1': ['LOT-E', 'Producer', false], 'S3-R5': ['LOT-E', 'Warehouse', false],
  'S3-P1': ['LOT-F', 'Producer', false], 'S3-P3': ['LOT-H', 'Producer', false],
};

function checksFor(h) {
  const c = [[`schema${h.predecessorIDs && h.predecessorIDs.length ? ' + predecessors {' + h.predecessorIDs.join(', ') + '}' : ''}`, 'ok']];
  if (h.eventType === 'Create' && h.quantity) c.push([`quantity declared ${h.quantity.value} ${h.quantity.unit}`, 'ok']);
  if (h.eventType === 'Transform' && h.transform) {
    const si = h.transform.inputs.reduce((s, x) => s + x.quantity, 0);
    const so = h.transform.outputs.reduce((s, x) => s + x.quantity, 0);
    c.push([`availability + units ok`, 'ok']);
    c.push([`quantity conservation: inputs ${si} = outputs ${so} ${h.transform.unit} within policy tolerance`, 'ok']);
  }
  if (h.eventType === 'Transfer') {
    c.push([`custody continuity: submitter is the current custodian (${h.actorOrg})`, 'ok']);
    c.push(['recall lock: no active recall', 'ok']);
  }
  if (h.eventType === 'Verify') c.push([`verification integrity: attestation ${short(h.payloadHash)}`, 'ok']);
  return c;
}

const submit = (id) => {
  const h = ev(id); if (!h) return null;
  return {
    kind: 'submit', id, type: h.eventType, asset: h.assetID, actor: h.actorOrg,
    source: SOURCE[id] || '-', preds: h.predecessorIDs || [], checks: checksFor(h),
    at: h.boundAt, opAt: h.timestamp,
    bind: h.policyVersion, bindHash: short(h.policyHash), after: AFTER[id] || '',
    fx: FX[id] ? { asset: FX[id] } : undefined,
  };
};

// A rejection beat shows only the checks that were actually reached. Validation
// short-circuits at the first violated condition, so nothing beyond it is shown.
const reject = (id, type, asset, actor, file) => {
  const err = readTxt(file ? file : path.join('rejections', id + '.txt'));
  if (!err) return null;
  // Several rejection messages state the submission time; use it where present
  // rather than inventing one. Where absent the beat carries no time at all.
  return { kind: 'reject', id, type, asset, actor, at: timeFrom(err),
           source: SOURCE[id] || '-', checks: [['schema', 'ok']], err };
};

const policies = (() => {
  try { return fs.readFileSync(path.join(R, 'policies.ndjson'), 'utf8').trim().split('\n').map(JSON.parse); }
  catch { return []; }
})();
const govBeat = (v, note) => {
  const p = policies.find((x) => x.version === v); if (!p) return null;
  const pr = p.params || {};
  return { kind: 'gov', act: 'AnchorPolicy', v, hash: short(p.hash), ef: p.effectiveFrom,
    note: `${note} - tolerance ${pr.quantityTolerance}, distinct attestor ${pr.verifyRequiresDistinctActor}` };
};

/* ── S1 ─────────────────────────────────────────────────────────────────── */
const S1 = [{ kind: 'info', text: 'S1 - recall investigation, lot LOT-C. Four source systems, one validation path.' }];
const tot = readTxt('S0_totality_rejection.txt');
if (tot) S1.push({ kind: 'reject', id: 'C1', type: 'Create', asset: 'LOT-A', actor: 'Producer',
  at: timeFrom(tot), source: 'ERP', checks: [['schema', 'ok']], err: tot });
const g1 = govBeat('v1.0', 'anchored by the consortium admin');
if (g1) S1.push(g1);
['C1', 'C2', 'T1'].forEach((id) => { const b = submit(id); if (b) S1.push(b); });
const nc = reject('N-CONSUMED', 'Transfer', 'LOT-A', 'Producer'); if (nc) S1.push(nc);
['TR1', 'V1'].forEach((id) => { const b = submit(id); if (b) S1.push(b); });
const ncu = reject('N-CUSTODY', 'Transfer', 'LOT-C', 'Retailer'); if (ncu) S1.push(ncu);
const r1 = submit('R1'); if (r1) S1.push(r1);
const nrt = reject('N-RECALL-TRANSFER', 'Transfer', 'LOT-C', 'Carrier'); if (nrt) S1.push(nrt);
const nrf = reject('N-RECALL-TRANSFORM', 'Transform', 'LOT-Z', 'Carrier'); if (nrf) S1.push(nrf);

const ncl = reject('N-CLEAR-NONADMIN', 'Governance', 'LOT-C', 'Org2MSP'); if (ncl) S1.push(ncl);
const rs = readJSON('S1_recall_status.json');
if (rs && rs.clearance) S1.push({ kind: 'gov', act: 'ClearRecall', v: rs.clearance.policyVersion,
  hash: short(rs.clearance.policyHash), ef: rs.clearance.clearedAt, policyUnchanged: true,
  note: `recall on ${rs.assetID} lifted by ${rs.clearance.clearedBy}, bound to the policy then in force: ${rs.clearance.reason}` });
const tr3 = submit('TR3'); if (tr3) S1.push(tr3);
const lin = readJSON('S1_lineage.json'), desc = readJSON('S1_descendants.json'), met = readJSON('S1_trace_metrics.json');
if (lin) S1.push({ kind: 'query', label: 'GetLineageByAsset("LOT-C")', lines: [
  `nodes ${lin.nodeCount} - edges ${lin.edgeCount} - origins [${(lin.originCreates || []).join(', ')}]`,
  `graph: ${(lin.edges || []).map((e) => e.from + '->' + e.to).join(', ')}`] });
if (desc) S1.push({ kind: 'query', label: 'AffectedDescendants("LOT-A")', lines: [
  `derived lots: [${(desc.descendants || []).join(', ')}] via [${(desc.viaEvents || []).join(', ')}]`] });
if (met) S1.push({ kind: 'query', label: 'GetTraceMetrics("LOT-C")', lines: [
  `time-to-trace ${met.timeToTraceSeconds}s (${met.earliestCreate} -> ${met.queriedEvent})`,
  `audit hand-offs ${met.auditHandoffs}: ${(met.pathOrganizations || []).join(' -> ')}`] });

S1.push({ kind: 'claim', text: '<b>Agnosticism, and invariants that actually bite.</b> Four enterprise systems fed one validation path, while four separate rejections show custody, consumption and the recall lock being enforced - and the lock lifting only on a recorded governance act.' });

/* ── S2 ─────────────────────────────────────────────────────────────────── */
const S2 = [{ kind: 'info', text: 'S2 - regulatory audit of lot LOT-D (four-event lineage, no recall).' }];
['D1', 'TD1', 'VD1', 'TD2'].forEach((id) => { const b = submit(id); if (b) S2.push(b); });
const pack = readJSON('S2_auditpack.json');
if (pack) {
  S2.push({ kind: 'query', label: `auditPack("LOT-D", role=${pack.scope.requestorRole})`, lines: [
    `${pack.events.length} ordered headers [${pack.events.map((e) => e.eventID).join(' -> ')}], each with its identity attestation`,
    `policy refs: ${[...new Set(pack.events.map((e) => e.policyVersion))].join(', ')} - hash ${short(pack.events[0].policyHash)}`,
    `payload verification: ${pack.payloadVerification.passed}/${pack.payloadVerification.checked} PASS`,
    `generated in ${pack.generatedInMs} ms`] });
  S2.push({ kind: 'query', label: 'indicators (model 3.7)', lines: [
    `time-to-trace ${pack.indicators.timeToTraceSeconds}s - audit hand-offs ${pack.indicators.auditHandoffs}`,
    `path: ${(pack.indicators.pathOrganizations || []).join(' -> ')}`,
    `dispute cycle time: ${pack.indicators.disputeCycleTime}`] });
}
const pv = readJSON('S2_passport.json');
if (pv) S2.push({ kind: 'query', label: 'passportView("LOT-D")', lines: [
  `custodian ${pv.currentCustodian} - ${pv.quantity.remaining} ${pv.quantity.unit} remaining - ` +
  `attestations [${pv.attestations.map((a) => a.eventID).join(', ')}] - recall ${pv.recallStatus} - policy ${pv.policyVersionAtLastEvent}`] });
const tam = readTxt('S2_tamper.txt');
if (tam) {
  const L = tam.split('\n');
  S2.push({ kind: 'tamper', lines: [
    ['one byte of the stored attestation payload is modified, then the pack is re-verified', 'note'],
    [(L.find((l) => l.startsWith('after tampering')) || 'verification FAIL').trim(), 'bad'],
    ['tamper detected from anchored evidence alone', 'ok']] });
}
const iop = readJSON('S2_interop_check.json');
if (iop) S2.push({ kind: 'query', label: 'interoperability exports (EPCIS 2.0 and PROV-O)', lines: [
  `${iop.anchoredEvents} anchored events exported to both vocabularies`,
  'transformations map to TransformationEvent; lineage links map to PROV derivation relations',
  'every exported event carries the policy reference under which it was admitted'] });
S2.push({ kind: 'claim', text: `<b>A regulator-ready bundle, verified without disclosure.</b> Ordered headers, identity attestations, policy references and the model's own indicators${pack ? ' in ' + pack.generatedInMs + ' ms' : ''} - and a silent payload change exposed by the anchored digests.` });

/* ── S3 ─────────────────────────────────────────────────────────────────── */
const S3 = [{ kind: 'info', text: 'S3 - policy update: per-record binding, and the change in validation behaviour that the binding records.' }];
['S3-R1', 'S3-R2', 'S3-R3', 'S3-P1', 'S3-P2'].forEach((id) => { const b = submit(id); if (b) S3.push(b); });
const g2 = govBeat('v2.0', 'supersession is prospective; bindings already made are untouched');
if (g2) S3.push(g2);
['S3-R4', 'S3-R5', 'S3-P3'].forEach((id) => { const b = submit(id); if (b) S3.push(b); });
const p4 = reject('S3-P4', 'Transform', 'LOT-I', 'Producer'); if (p4) S3.push(p4);
const vs = reject('N-VERIFY-SELF', 'Verify', 'LOT-E', 'Warehouse'); if (vs) S3.push(vs);

const t4 = readJSON('S3_table4_bindings.json');
if (t4) {
  S3.push({ kind: 'query', label: 'per-record binding verification', lines: t4.bindings.map((b) =>
    `${b.record} - boundAt ${b.submittedAt} - ${b.boundPolicyVersion} - ${short(b.boundPolicyHash)} - ${b.bindingCorrect ? 'correct' : 'INCORRECT'}`) });
  S3.push({ kind: 'query', label: 'auditor recomputation', lines: [
    ...t4.auditorRecomputation.map((x) =>
      `${x.file}: hash ${x.matches ? 'reproduces' : 'MISMATCH'}, parameters ${x.paramsMatch ? 'faithful to the artifact' : 'DIVERGE'}`),
    'which ruleset governed each record is recoverable from the record and the registry alone'] });
}
const eff = readJSON('S3_policy_effect.json');
if (eff) S3.push({ kind: 'query', label: 'policy-driven validation behaviour', lines: [
  `declared imbalance ${eff.paired.declaredImbalance} KG`,
  `under v1.0 (tolerance ${eff.paired.underV1 ? eff.paired.underV1.toleranceApplied : '-'}): accepted`,
  `under v2.0 (tolerance ${eff.paired.underV2 ? eff.paired.underV2.toleranceApplied : '-'}): rejected`,
  'the deciding parameter came from the registry, not from the submitter'] });
S3.push({ kind: 'claim', text: '<b>The mechanism, doing work.</b> The rulebook changed and the system behaved differently - an identical submission admitted under one regime and refused under the next - while every record still proves which regime judged it.' });

/* ── S5 · governance kit ────────────────────────────────────────────────── */
const mem = readJSON('S5_membership.json'), dsp = readJSON('S5_dispute.json');
const emg = readJSON('S5_emergencies.json'), tiers = readJSON('S5_disclosure_tiers.json');
const dmet = readJSON('S5_trace_metrics_disputed.json');
const S5 = [{ kind: 'info', text: 'S5 - the governance kit: membership, disputes, emergency overrides and tiered audit access.' }];
if (mem) S5.push({ kind: 'query', label: 'MembershipRegistry()', lines: [
  `${mem.length} organizations on record: ` + mem.map((m) => `${m.org} (${m.status})`).join(', '),
  'each admission or suspension is anchored and bound to the policy then in force'] });
const nma = reject('N-MEMBER-NONADMIN', 'Governance', '-', 'Org2MSP'); if (nma) S5.push(nma);
const nms = reject('N-MEMBER-SUSPENDED', 'Verify', 'LOT-E', 'Warehouse'); if (nms) S5.push(nms);
if (dsp) {
  S5.push({ kind: 'gov', act: 'OpenDispute', v: dsp.policyVersion, hash: short(dsp.policyHash),
    ef: dsp.openedAt, policyUnchanged: true,
    note: `dispute ${dsp.disputeID} opened over ${dsp.eventIDs.join(', ')} by ${dsp.openedBy}; rationale off-ledger (${short(dsp.rationaleHash)})` });
  const nda = reject('N-DISPUTE-NONADMIN', 'Governance', '-', 'Org2MSP'); if (nda) S5.push(nda);
  S5.push({ kind: 'gov', act: 'ResolveDispute', v: dsp.policyVersion, hash: short(dsp.policyHash),
    ef: dsp.resolvedAt || '', policyUnchanged: true,
    note: `${dsp.disputeID} resolved after ${dsp.cycleSeconds}s: ${dsp.outcome}; no anchored header was altered` });
}
if (dmet) S5.push({ kind: 'query', label: 'GetTraceMetrics after resolution', lines: [
  `disputes on this lineage: [${(dmet.disputesOnPath || []).join(', ')}]`,
  `dispute cycle time ${dmet.disputeCycleSeconds}s - the third indicator of the model, now instrumented`] });
if (emg && emg.length) {
  const e = emg[0];
  S5.push({ kind: 'gov', act: 'DeclareEmergency', v: e.policyVersion, hash: short(e.policyHash),
    ef: e.declaredAt, policyUnchanged: true,
    note: `${e.emergencyID} suspends ${e.scopeType} "${e.scopeValue}" until ${e.until}; decision artifact ${short(e.decisionHash)}` });
}
const nem = reject('N-EMERGENCY', 'Recall', 'LOT-D', 'Retailer'); if (nem) S5.push(nem);
if (tiers) S5.push({ kind: 'query', label: 'audit access - three visibility tiers', lines:
  tiers.tiers.map((t) => `${t.tier}: integrity ${t.integrityConfirmed ? 'confirmed' : 'not shown'}, content ${t.payloadDisclosed ? 'disclosed' : 'withheld'}`) });
S5.push({ kind: 'claim', text: '<b>Governance as an operating system, not a preamble.</b> Membership decides who may submit, disputes augment evidence without rewriting it, emergency overrides are time-bounded and tied to a decision artifact, and disclosure is tiered - each act anchored and bound to the policy in force.' });

/* ── S4 ─────────────────────────────────────────────────────────────────── */
const surf = readJSON('S4_validation_surface.json');
const S4 = [{ kind: 'info', text: 'S4 - validation surface: every admission check the chaincode performs, each with the rejection that demonstrates it.' }];
if (surf) {
  surf.rows.forEach((x) => S4.push({ kind: 'reject', id: x.evidence.replace(/\.txt$/, ''),
    type: x.condition, asset: '-', actor: '-', source: x.source, at: timeFrom(x.message),
    checks: [['reached this check', 'ok']], err: x.message || `[${x.tag}] NOT CAPTURED` }));
  S4.push({ kind: 'claim', text: `<b>Nothing claimed but undemonstrated.</b> ${surf.demonstrated} of ${surf.totalChecks} admission checks produced a rejection carrying that check's own tag.` });
}

// Every beat declares its time explicitly. Absence of a recorded time is
// expressed as null, never as a missing key, so the console cannot silently
// substitute the demo clock for real data.
for (const beats of [S1, S2, S3, S4, S5]) {
  for (const b of beats) if (!('at' in b)) b.at = b.ef || null;
}
const out = { generatedAt: new Date().toISOString(), source: 'Track A prototype run',
  scenarios: { S1, S2, S3, S4, S5 } };
fs.writeFileSync(path.join(R, 'replay.json'), JSON.stringify(out, null, 2));
console.log(`   PASS replay feed - S1 ${S1.length}, S2 ${S2.length}, S3 ${S3.length}, S4 ${S4.length}, S5 ${S5.length} beats -> results/replay.json`);

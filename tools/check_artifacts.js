#!/usr/bin/env node
/**
 * check_artifacts.js - the gate between "the scripts ran" and "the paper has
 * its evidence". Fails the run if any artifact is missing or any verdict is
 * false, so a partially successful run cannot be mistaken for a complete one.
 */
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..', 'results');

const REQUIRED = [
  ['S0_totality_rejection.txt', 'totality precondition'],
  ['S1_table3_observed.json', 'S1 observed events'],
  ['S1_lineage.json', 'lineage node/edge counts'],
  ['S1_descendants.json', 'forward trace to derived lots'],
  ['S1_trace_metrics.json', 'time-to-trace and audit hand-offs'],
  ['S1_recall_status.json', 'recall clearance record'],
  ['S1_negative_custody.txt', 'custody continuity rejection'],
  ['S1_negative_transfer.txt', 'recall lock rejection (transfer)'],
  ['S1_negative_transform.txt', 'recall lock rejection (transform)'],
  ['S1_negative_consumed.txt', 'consumed-lot rejection'],
  ['S2_auditpack.json', 'audit pack'],
  ['S2_verification.txt', 'payload verification'],
  ['S2_generation_time.txt', 'audit pack generation time'],
  ['S2_indicators.txt', 'KPI instrumentation'],
  ['S2_passport.json', 'passport view'],
  ['S2_tamper.txt', 'tamper detection'],
  ['S3_table4_bindings.json', 'per-record policy binding'],
  ['S3_policy_history.json', 'governance registry state'],
  ['S3_policy_effect.json', 'policy-driven validation behaviour'],
  ['S3_policy_effect_rejection.txt', 'tolerance rejection under v2.0'],
  ['S3_selfattestation_rejection.txt', 'self-attestation rejection under v2.0'],
  ['S2_epcis_export.json', 'EPCIS 2.0 export'],
  ['S2_prov_export.json', 'PROV-O lineage export'],
  ['S2_interop_check.json', 'interoperability cross-check'],
  ['S5_membership.json', 'membership registry'],
  ['S5_disputes.json', 'dispute registry'],
  ['S5_dispute.json', 'resolved dispute with its cycle time'],
  ['S5_emergencies.json', 'emergency override registry'],
  ['S5_disclosure_tiers.json', 'three audit-visibility tiers'],
  ['S5_trace_metrics_disputed.json', 'dispute cycle time on a disputed lineage'],
  ['S5_auditpack.json', 'audit pack carrying dispute state'],
  ['S4_validation_surface.json', 'validation surface report'],
  ['S4_validation_surface.md', 'validation surface table'],
  ['replay.json', 'replay console feed'],
  ['feasibility_summary.md', 'filled sentence stems'],
];

let fail = 0;
const g = (s) => `\x1b[0;32m${s}\x1b[0m`, r = (s) => `\x1b[0;31m${s}\x1b[0m`;

console.log('artifact check\n');
for (const [file, why] of REQUIRED) {
  const p = path.join(R, file);
  const ok = fs.existsSync(p) && fs.statSync(p).size > 0;
  console.log(`  ${ok ? g('ok') : r('XX')} ${file.padEnd(34)} ${why}`);
  if (!ok) fail++;
}

const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(path.join(R, f), 'utf8')); } catch { return null; } };
const readTxt = (f) => { try { return fs.readFileSync(path.join(R, f), 'utf8'); } catch { return ''; } };
const assert = (cond, msg) => { console.log(`  ${cond ? g('ok') : r('XX')} ${msg}`); if (!cond) fail++; };

console.log('\nverdicts\n');
const t4 = readJSON('S3_table4_bindings.json');
assert(!!t4 && t4.verdict.allBindingsCorrect, 'every S3 record bound the policy active at submission');
assert(!!t4 && t4.verdict.allHashesReproduce, 'policy hashes recompute from the anchored artifacts');
assert(!!t4 && t4.verdict.allParamsFaithful, 'registry parameters match those stated in the artifacts');
assert(!!t4 && t4.verdict.versionsObserved && t4.verdict.versionsObserved.length === 2, 'two policy versions observed');

const eff = readJSON('S3_policy_effect.json');
assert(!!eff && eff.verdict.identicalSubmissionDecidedDifferently, 'an identical submission was decided differently under the two regimes');
assert(!!eff && eff.verdict.decidingParameterCameFromRegistry, 'the deciding parameter came from the governance registry');
assert(!!eff && eff.verdict.secondaryParameterAlsoEffective, 'a second policy parameter also changed admissibility');

const surf = readJSON('S4_validation_surface.json');
assert(!!surf && surf.verdict.allChecksDemonstrated,
  `all admission checks demonstrated (${surf ? surf.demonstrated + '/' + surf.totalChecks : '—'})`);

const pack = readJSON('S2_auditpack.json');
assert(!!pack && pack.payloadVerification.passed === pack.payloadVerification.checked,
  `audit pack payload verification ${pack ? pack.payloadVerification.passed + '/' + pack.payloadVerification.checked : '—'} PASS`);
assert(!!pack && pack.events.every((e) => !!e.actorSignature), 'every header in the audit pack carries its actor identity attestation');
assert(!!pack && typeof pack.indicators.timeToTraceSeconds === 'number', 'audit pack reports time-to-trace');
assert(!!pack && typeof pack.indicators.auditHandoffs === 'number', 'audit pack reports audit hand-offs');

const lin = readJSON('S1_lineage.json');
assert(!!lin && lin.nodeCount === 7 && lin.edgeCount === 6, `S1 lineage reconstructed 7 nodes / 6 edges (got ${lin ? lin.nodeCount + '/' + lin.edgeCount : '—'})`);
assert(!!lin && (lin.originCreates || []).length === 2, 'backward trace resolved both origin Create events');

const desc = readJSON('S1_descendants.json');
assert(!!desc && desc.count >= 1, 'forward trace identified at least one derived lot');

const rec = readJSON('S1_recall_status.json');
assert(!!rec && rec.recalled === false && !!rec.clearance, 'recall lock was lifted by a recorded governance clearance');

assert(/TAMPER DETECTED/.test(readTxt('S2_tamper.txt')), 'tampered payload failed verification');

const iop = readJSON('S2_interop_check.json');
assert(!!iop && iop.verdict, 'every anchored event exported to EPCIS and PROV, each carrying its policy reference');

const tiers = readJSON('S5_disclosure_tiers.json');
assert(!!tiers && tiers.verdict.allTiersBehaveAsSpecified, 'public, consortium and authority visibility tiers behave as specified');

const disp = readJSON('S5_dispute.json');
assert(!!disp && disp.state === 'resolved' && disp.cycleSeconds >= 0,
  `dispute resolved and its cycle time recorded (${disp ? disp.cycleSeconds + 's' : '-'})`);

const dm = readJSON('S5_trace_metrics_disputed.json');
assert(!!dm && dm.disputeCycleReported === true && dm.disputeCycleSeconds >= 0,
  `dispute cycle time reported on the disputed lineage (${dm ? dm.disputeCycleSeconds + 's' : '-'})`);
const dpack = readJSON('S5_auditpack.json');
assert(!!dpack && Array.isArray(dpack.disputes) && dpack.disputes.length > 0,
  'audit pack carries the dispute state affecting its evidence');

const iopDoc = readJSON('S2_epcis_export.json');
assert(!!iopDoc && iopDoc.epcisBody.eventList.some((e) => e.type === 'TransformationEvent'),
  'a transformation is exported as an EPCIS TransformationEvent');

const mem = readJSON('S5_membership.json');
assert(Array.isArray(mem) && mem.some((m) => m.status === 'suspended'),
  'membership registry records a suspension');
assert(Array.isArray(mem) && mem.every((m) => !!m.policyHash),
  'every membership act is bound to the policy in force');

const emg = readJSON('S5_emergencies.json');
assert(Array.isArray(emg) && emg.length > 0 && emg.every((e) => !!e.until && !!e.decisionHash),
  'every emergency override is time-bounded and linked to a decision artifact');

const pols = readJSON('S3_policy_history.json');
assert(Array.isArray(pols) && pols.every((p) => p.hashAlgorithm && p.nextAuthority),
  'every policy version records its hash algorithm and its successor authority');

console.log(fail === 0
  ? `\n${g('all artifacts present and all verdicts hold - results/ is citable')}`
  : `\n${r(fail + ' check(s) failed - results/ is NOT complete; do not cite this run')}`);
process.exit(fail === 0 ? 0 : 1);

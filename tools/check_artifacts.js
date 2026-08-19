#!/usr/bin/env node
/**
 * check_artifacts.js — gate between "the scripts ran" and "the paper has its
 * evidence". Fails loudly if any artifact cited in Paper 3 §6 is missing,
 * empty, or reports a failed verdict, so a partially-successful run can never
 * be mistaken for a complete one.
 */
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..', 'results');

const REQUIRED = [
  ['S0_totality_rejection.txt', 'totality precondition (§5.1)'],
  ['S1_table3_observed.json', 'Table 3 observed column'],
  ['S1_lineage.json', 'lineage node/edge counts (§6.1)'],
  ['S1_negative_custody.txt', 'custody continuity rejection'],
  ['S1_negative_transfer.txt', 'recall lock rejection'],
  ['S2_auditpack.json', 'audit pack (§6.2)'],
  ['S2_verification.txt', 'payload verification results'],
  ['S2_generation_time.txt', 'audit pack generation time'],
  ['S2_passport.json', 'passport view'],
  ['S2_tamper.txt', 'tamper detection (edit E3)'],
  ['S3_table4_bindings.json', 'Table 4 per-record binding'],
  ['S3_policy_history.json', 'governance registry state'],
  ['replay.json', 'replay console feed'],
  ['feasibility_summary.md', '§6.4 sentence stems'],
];

let fail = 0;
const g = (s) => `\x1b[0;32m${s}\x1b[0m`, r = (s) => `\x1b[0;31m${s}\x1b[0m`;

console.log('artifact check\n');
for (const [file, why] of REQUIRED) {
  const p = path.join(R, file);
  const ok = fs.existsSync(p) && fs.statSync(p).size > 0;
  console.log(`  ${ok ? g('✓') : r('✗')} ${file.padEnd(30)} ${why}`);
  if (!ok) fail++;
}

/* content assertions — presence is not correctness */
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(path.join(R, f), 'utf8')); } catch { return null; } };
const assert = (cond, msg) => { console.log(`  ${cond ? g('✓') : r('✗')} ${msg}`); if (!cond) fail++; };

console.log('\nverdicts\n');
const t4 = readJSON('S3_table4_bindings.json');
assert(!!t4 && t4.verdict.allBindingsCorrect, 'every S3 record bound the policy active at submission time');
assert(!!t4 && t4.verdict.allHashesReproduce, 'policy hashes recompute from the anchored artifacts');
assert(!!t4 && t4.verdict.versionsObserved?.length === 2, 'two policy versions observed across the run');

const pack = readJSON('S2_auditpack.json');
assert(!!pack && pack.payloadVerification.passed === pack.payloadVerification.checked,
  `audit pack payload verification ${pack ? pack.payloadVerification.passed + '/' + pack.payloadVerification.checked : '—'} PASS`);
assert(!!pack && pack.events.length >= 4, 'audit pack contains the full four-event lineage');

const lin = readJSON('S1_lineage.json');
assert(!!lin && lin.nodeCount === 6 && lin.edgeCount === 5, 'S1 lineage reconstructed 6 nodes / 5 edges');
assert(!!lin && (lin.originCreates || []).length === 2, 'backward trace resolved both origin Create events');

const tamper = (() => { try { return fs.readFileSync(path.join(R, 'S2_tamper.txt'), 'utf8'); } catch { return ''; } })();
assert(/TAMPER DETECTED/.test(tamper), 'tampered payload failed verification');

const rej = (f) => { try { return fs.readFileSync(path.join(R, f), 'utf8'); } catch { return ''; } };
assert(/\[custody continuity\]/.test(rej('S1_negative_custody.txt')), 'custody rejection names the invariant');
assert(/\[recall lock\]/.test(rej('S1_negative_transfer.txt')), 'recall rejection names the invariant');
assert(/\[totality\]/.test(rej('S0_totality_rejection.txt')), 'pre-policy rejection names totality');

console.log(fail === 0
  ? `\n${g('all artifacts present and all verdicts hold — results/ is citable')}`
  : `\n${r(fail + ' check(s) failed — results/ is NOT complete; do not cite this run')}`);
process.exit(fail === 0 ? 0 : 1);

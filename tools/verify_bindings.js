#!/usr/bin/env node
/**
 * verify_bindings.js — produces draft Table 4 and performs the auditor check.
 *
 * Two independent verifications:
 *   (a) BINDING CORRECTNESS — for each record, the bound policy version is the
 *       one whose effectiveFrom window contains the record's boundAt time,
 *       i.e. the chaincode really applied active(t) and not something else.
 *   (b) HASH RECOMPUTATION — re-hashing the policy file on disk reproduces the
 *       anchored hash, so an auditor holding only the ledger and the policy
 *       text can prove which ruleset governed each record. This is the
 *       verifiability property of policy-hash anchoring.
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
const POLICY_FILES = { 'v1.0': 'policies/policy_v1.md', 'v2.0': 'policies/policy_v2.md' };

const ccQuery = (fn, ...args) => JSON.parse(execFileSync('peer',
  ['chaincode', 'query', '-C', CHANNEL, '-n', CC, '-c', JSON.stringify({ function: fn, Args: args })],
  { encoding: 'utf8', env: process.env }).trim());

const history = ccQuery('PolicyHistory');

// (a) expected version at time t = greatest effectiveFrom <= t
const expectedAt = (t) => {
  let best = null;
  for (const p of history) if (new Date(p.effectiveFrom) <= new Date(t)) best = p;
  return best;
};

const rows = RECORDS.map((id) => {
  const h = ccQuery('GetHeader', id);
  const exp = expectedAt(h.boundAt);
  return {
    record: id,
    eventType: h.eventType,
    submittedAt: h.boundAt,
    boundPolicyVersion: h.policyVersion,
    boundPolicyHash: h.policyHash,
    expectedPolicyVersion: exp ? exp.version : null,
    bindingCorrect: !!exp && exp.version === h.policyVersion && exp.hash === h.policyHash,
  };
});

// (b) auditor recomputation
const recompute = history.map((p) => {
  const file = path.join(ROOT, POLICY_FILES[p.version] || '');
  const exists = fs.existsSync(file);
  const digest = exists ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
  return { version: p.version, file: POLICY_FILES[p.version] || null, anchoredHash: p.hash, recomputedHash: digest, matches: digest === p.hash };
});

const out = {
  scenario: 'S3',
  asset: 'LOT-E',
  policyHistory: history,
  bindings: rows,
  auditorRecomputation: recompute,
  verdict: {
    allBindingsCorrect: rows.every((r) => r.bindingCorrect),
    allHashesReproduce: recompute.every((r) => r.matches),
    versionsObserved: [...new Set(rows.map((r) => r.boundPolicyVersion))],
  },
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(RESULTS, 'S3_table4_bindings.json'), JSON.stringify(out, null, 2));

const g = (s) => `\x1b[0;32m${s}\x1b[0m`, r = (s) => `\x1b[0;31m${s}\x1b[0m`;
console.log('   record   submittedAt            policy  hash          correct');
rows.forEach((x) => console.log(
  `   ${x.record.padEnd(8)} ${x.submittedAt}   ${x.boundPolicyVersion.padEnd(6)} ` +
  `${x.boundPolicyHash.slice(0, 12)}…  ${x.bindingCorrect ? g('✓') : r('✗')}`));
recompute.forEach((x) => console.log(
  `   recompute ${x.version}: ${x.matches ? g('✓ matches anchored hash') : r('✗ MISMATCH')}`));
console.log(`   \x1b[0;32m✓\x1b[0m → results/S3_table4_bindings.json`);
if (!out.verdict.allBindingsCorrect || !out.verdict.allHashesReproduce) process.exit(1);

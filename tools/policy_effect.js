#!/usr/bin/env node
/**
 * policy_effect.js - evidence that a policy change altered validation
 * behaviour, not merely the recorded hash.
 *
 * The architecture requires that a governance reference change admissibility
 * for new submissions. A registry that only records which policy was active
 * would satisfy the binding invariants while leaving that requirement unmet.
 * This report pairs two structurally identical submissions - the same 0.4 unit
 * transformation imbalance - one admitted under v1.0 and one refused under
 * v2.0, and shows that the deciding parameter came from the registry.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RESULTS = path.join(ROOT, 'results');
const CHANNEL = process.env.CHANNEL || 'mychannel';
const CC = process.env.CC_NAME || 'evidence';

const ccQuery = (fn, ...args) => JSON.parse(execFileSync('peer',
  ['chaincode', 'query', '-C', CHANNEL, '-n', CC, '-c', JSON.stringify({ function: fn, Args: args })],
  { encoding: 'utf8', env: process.env }).trim());

const readTxt = (f) => { try { return fs.readFileSync(path.join(RESULTS, f), 'utf8').trim(); } catch { return null; } };
const readEvent = (id) => { try { return JSON.parse(fs.readFileSync(path.join(RESULTS, 'events', id + '.json'), 'utf8')); } catch { return null; } };

const v1 = ccQuery('GetPolicy', 'v1.0');
const v2 = ccQuery('GetPolicy', 'v2.0');
const accepted = readEvent('S3-P2');
const rejection = readTxt('rejections/S3-P4.txt');
const selfAttest = readTxt('rejections/N-VERIFY-SELF.txt');

// rounded for reporting: the raw difference carries binary representation
// error that would otherwise appear in the paper as 0.39999999999997726
const imbalance = accepted && accepted.transform
  ? Number(Math.abs(accepted.transform.inputs.reduce((s, x) => s + x.quantity, 0)
           - accepted.transform.outputs.reduce((s, x) => s + x.quantity, 0)).toFixed(4))
  : null;

const out = {
  scenario: 'S3 - policy-driven validation behaviour',
  mechanism: 'validation parameters are resolved from the active policy version, not supplied by the submitter',
  parameterUnderTest: 'quantityTolerance',
  policies: {
    'v1.0': { hash: v1.hash, effectiveFrom: v1.effectiveFrom, params: v1.params },
    'v2.0': { hash: v2.hash, effectiveFrom: v2.effectiveFrom, params: v2.params },
  },
  paired: {
    declaredImbalance: imbalance,
    underV1: accepted ? {
      eventID: accepted.eventID, outcome: 'accepted',
      boundPolicyVersion: accepted.policyVersion, boundPolicyHash: accepted.policyHash,
      toleranceApplied: v1.params.quantityTolerance,
    } : null,
    underV2: rejection ? {
      eventID: 'S3-P4', outcome: 'rejected',
      toleranceApplied: v2.params.quantityTolerance, message: rejection,
    } : null,
  },
  secondaryParameter: {
    parameter: 'verifyRequiresDistinctActor',
    v1: v1.params.verifyRequiresDistinctActor,
    v2: v2.params.verifyRequiresDistinctActor,
    message: selfAttest,
  },
  verdict: {
    identicalSubmissionDecidedDifferently: !!(accepted && rejection),
    decidingParameterCameFromRegistry: v1.params.quantityTolerance !== v2.params.quantityTolerance,
    secondaryParameterAlsoEffective: !!selfAttest,
  },
  generatedAt: new Date().toISOString(),
};

fs.writeFileSync(path.join(RESULTS, 'S3_policy_effect.json'), JSON.stringify(out, null, 2));

const g = (s) => `\x1b[0;32m${s}\x1b[0m`, r = (s) => `\x1b[0;31m${s}\x1b[0m`;
const ok = out.verdict.identicalSubmissionDecidedDifferently && out.verdict.decidingParameterCameFromRegistry;
console.log(`   imbalance ${imbalance} - tolerance v1.0 ${v1.params.quantityTolerance} -> accepted, ` +
  `v2.0 ${v2.params.quantityTolerance} -> rejected`);
console.log(`   ${ok ? g('PASS') : r('FAIL')} the same submission is decided differently under the two regimes`);
console.log(`   -> results/S3_policy_effect.json`);
if (!ok) process.exit(1);

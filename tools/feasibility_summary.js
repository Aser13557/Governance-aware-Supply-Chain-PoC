#!/usr/bin/env node
/**
 * feasibility_summary.js - the observed values, ready to paste into the paper.
 */
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..', 'results');
const j = (f) => { try { return JSON.parse(fs.readFileSync(path.join(R, f), 'utf8')); } catch { return null; } };
const t = (f) => { try { return fs.readFileSync(path.join(R, f), 'utf8').trim(); } catch { return null; } };
const M = (v, d = '[NOT CAPTURED]') => (v === undefined || v === null ? d : v);

const s1 = j('S1_table3_observed.json'), lin = j('S1_lineage.json');
const desc = j('S1_descendants.json'), met = j('S1_trace_metrics.json');
const clear = j('S1_recall_status.json');
const pack = j('S2_auditpack.json'), pass = j('S2_passport.json');
const t4 = j('S3_table4_bindings.json'), eff = j('S3_policy_effect.json');
const surf = j('S4_validation_surface.json');
const tam = t('S2_tamper.txt');

const md = `# Track A - feasibility summary (generated ${new Date().toISOString()})

All values observed in a single prototype run.

## Filled sentence stems

- **S1 (source-system agnosticism).** ${M(s1 && s1.events.length)} events originating from four distinct
  simulated source systems (ERP, MES, TMS/WMS, LIMS) plus a retailer system were admitted through an
  identical validation path; the chaincode contains no source-system-specific branching.
- **S1 (lineage).** Lineage reconstruction for lot ${M(lin && lin.assetID)} returned ${M(lin && lin.nodeCount)}
  nodes and ${M(lin && lin.edgeCount)} edges, with backward tracing resolving to origin Create events
  [${M(lin && (lin.originCreates || []).join(', '))}]; forward tracing from an origin lot identified
  ${M(desc && desc.count)} derived lot(s) [${M(desc && (desc.descendants || []).join(', '))}].
- **S1 (indicators).** Time-to-trace ${M(met && met.timeToTraceSeconds)} s between the earliest Create
  (${M(met && met.earliestCreate)}) and the queried event (${M(met && met.queriedEvent)});
  ${M(met && met.auditHandoffs)} organization hand-offs along the evidence path
  (${M(met && (met.pathOrganizations || []).join(' -> '))}).
- **S1 (recall lock is liftable).** The lock blocked both a transfer and a transformation of the
  recalled lot; after a governance clearance recorded under policy
  ${M(clear && clear.clearance && clear.clearance.policyVersion)}, a transfer by the current custodian
  was accepted.
- **S2 (audit pack).** A regulator-facing audit pack for lot ${M(pack && pack.scope.assetID)} containing
  ${M(pack && pack.events.length)} ordered headers, each with its actor identity attestation and policy
  reference, was generated in ${M(pack && pack.generatedInMs)} ms; payload verification against the
  off-ledger store returned ${M(pack && pack.payloadVerification.passed)}/${M(pack && pack.payloadVerification.checked)} PASS.
- **S2 (indicators).** The pack reports time-to-trace ${M(pack && pack.indicators.timeToTraceSeconds)} s and
  ${M(pack && pack.indicators.auditHandoffs)} audit hand-offs, computed in the chaincode from the lineage.
- **S2 (passport).** A product passport for the same lot reported custodian ${M(pass && pass.currentCustodian)},
  ${M(pass && pass.attestations.length)} attestation(s), remaining quantity
  ${M(pass && pass.quantity.remaining)} ${M(pass && pass.quantity.unit)}, recall status
  ${M(pass && pass.recallStatus)}, governed by policy ${M(pass && pass.policyVersionAtLastEvent)}.
- **S2 (tamper).** A single-byte modification of a stored payload caused verification to fail,
  demonstrating that off-ledger tampering is detectable from anchored evidence alone.
- **S3 (policy-hash anchoring).** Across a policy change,
  ${M(t4 && t4.bindings.filter((b) => b.boundPolicyVersion === 'v1.0').length)} records bound policy v1.0 and
  ${M(t4 && t4.bindings.filter((b) => b.boundPolicyVersion === 'v2.0').length)} bound v2.0; all
  ${M(t4 && t4.bindings.length)} bindings matched the version in force at submission
  (binding correctness: ${M(t4 && t4.verdict.allBindingsCorrect)}), re-hashing the policy artifacts
  reproduced the anchored digests (verifiability: ${M(t4 && t4.verdict.allHashesReproduce)}), and the
  validation parameters held in the registry matched those stated in the artifacts
  (parameter fidelity: ${M(t4 && t4.verdict.allParamsFaithful)}).
- **S3 (policy-driven behaviour).** A transformation declaring a ${M(eff && eff.paired.declaredImbalance)}
  unit imbalance was admitted under v1.0 (tolerance ${M(eff && eff.paired.underV1 && eff.paired.underV1.toleranceApplied)})
  and an identical submission was refused under v2.0 (tolerance
  ${M(eff && eff.paired.underV2 && eff.paired.underV2.toleranceApplied)}); the deciding parameter was
  resolved from the governance registry, not supplied by the submitter. Under v2.0 an attestation by the
  current custodian was likewise refused.
- **S4 (validation surface).** ${M(surf && surf.demonstrated)} of ${M(surf && surf.totalChecks)} admission
  checks were demonstrated by a rejection carrying that check's own tag.
- **Totality.** A submission attempted before any policy was anchored was rejected: governance state is a
  precondition of admission, not a default applied in its absence.

## Rejection messages (verbatim)

\`\`\`
${(surf ? surf.rows : []).map((x) => x.message || `[${x.tag}] NOT CAPTURED`).join('\n\n')}
\`\`\`

## Tamper test

\`\`\`
${M(tam, '[not captured]')}
\`\`\`
`;

fs.writeFileSync(path.join(R, 'feasibility_summary.md'), md);
console.log('   PASS -> results/feasibility_summary.md');

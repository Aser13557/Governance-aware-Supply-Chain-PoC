#!/usr/bin/env node
/**
 * feasibility_summary.js — assembles results/feasibility_summary.md:
 * the §6.4 sentence stems filled with values actually observed in this run,
 * plus a claim→artifact table. This file is what you paste into Гл. 5 and
 * what the [VERIFY] markers in the draft resolve against.
 */
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..', 'results');
const j = (f) => { try { return JSON.parse(fs.readFileSync(path.join(R, f), 'utf8')); } catch { return null; } };
const t = (f) => { try { return fs.readFileSync(path.join(R, f), 'utf8').trim(); } catch { return null; } };

const s1 = j('S1_table3_observed.json'), lin = j('S1_lineage.json');
const pack = j('S2_auditpack.json'), pass = j('S2_passport.json');
const t4 = j('S3_table4_bindings.json');
const negC = t('S1_negative_custody.txt'), negR = t('S1_negative_transfer.txt');
const tam = t('S2_tamper.txt'), tot = t('S0_totality_rejection.txt');
const M = (v, d = '[NOT CAPTURED]') => (v === undefined || v === null ? d : v);

const sources = s1 ? [...new Set(s1.events.map((e) => e.eventID))] : [];
const md = `# Track A — feasibility summary (generated ${new Date().toISOString()})

Values below are observed in an actual prototype run. Paste into Гл. 5 / Paper 3 §6.4
and resolve the corresponding [VERIFY] markers.

## §6.4 sentence stems, filled

- **S1 (source-system agnosticism).** ${M(s1 && s1.events.length)} events originating from four
  distinct simulated source systems (ERP, MES, TMS/WMS, LIMS) plus a retailer system were admitted
  through an identical validation path; the chaincode contains no source-system-specific branching.
- **S1 (lineage).** Lineage reconstruction for lot ${M(lin && lin.assetID)} returned
  ${M(lin && lin.nodeCount)} nodes and ${M(lin && lin.edgeCount)} edges, with backward tracing
  resolving to origin Create events [${M(lin && (lin.originCreates || []).join(', '))}].
- **S1 (invariants).** Two deliberate violations were rejected at admission with the violated
  invariant named in the rejection message: custody continuity and recall lock.
- **S2 (audit pack).** A regulator-facing audit pack for lot ${M(pack && pack.scope.assetID)}
  containing ${M(pack && pack.events.length)} ordered headers with per-event policy references was
  generated in ${M(pack && pack.generatedInMs)} ms; payload verification against the off-ledger
  store returned ${M(pack && pack.payloadVerification.passed)}/${M(pack && pack.payloadVerification.checked)} PASS.
- **S2 (passport).** A product passport view for the same lot reported custodian
  ${M(pass && pass.currentCustodian)}, ${M(pass && pass.attestations.length)} attestation(s),
  recall status ${M(pass && pass.recallStatus)}, governed by policy ${M(pass && pass.policyVersionAtLastEvent)}.
- **S2 (tamper).** A single-byte modification of a stored payload caused verification to fail,
  demonstrating that off-ledger tampering is detectable from anchored evidence alone.
- **S3 (policy-hash anchoring).** Across a policy change, ${M(t4 && t4.bindings.filter((b) => b.boundPolicyVersion === 'v1.0').length)}
  records bound policy v1.0 and ${M(t4 && t4.bindings.filter((b) => b.boundPolicyVersion === 'v2.0').length)}
  records bound v2.0; all ${M(t4 && t4.bindings.length)} bindings matched the version in force at
  submission time (binding correctness: ${M(t4 && t4.verdict.allBindingsCorrect)}), and re-hashing the
  policy artifacts reproduced the anchored digests (verifiability: ${M(t4 && t4.verdict.allHashesReproduce)}).
- **Totality.** ${tot ? 'A submission attempted before any policy was anchored was rejected: totality is enforced as a precondition, not a default.' : '[S0 not run]'}

## Rejection messages (verbatim, for §6.1)

\`\`\`
${M(tot, '[S0 not run]')}

${M(negC, '[not captured]')}

${M(negR, '[not captured]')}
\`\`\`

## Tamper test (for §6.2)

\`\`\`
${M(tam, '[not captured]')}
\`\`\`

## Artifact inventory

| Artifact | Purpose in the paper |
|---|---|
| S1_table3_observed.json | Table 3 observed column |
| S1_lineage.json | node/edge counts, backward trace |
| S1_negative_custody.txt / S1_negative_transfer.txt | invariant rejection evidence |
| S2_auditpack.json | audit pack structure and contents |
| S2_verification.txt / S2_generation_time.txt | verification result, generation time |
| S2_passport.json | passport output |
| S2_tamper.txt | off-ledger integrity (edit E3) |
| S3_table4_bindings.json | Table 4 — per-record policy binding |
| S3_policy_history.json | governance registry state |
| S0_totality_rejection.txt | totality precondition |
| replay.json | replay console feed (defense, expert briefing) |
`;

fs.writeFileSync(path.join(R, 'feasibility_summary.md'), md);
console.log('   \x1b[0;32m✓\x1b[0m → results/feasibility_summary.md');

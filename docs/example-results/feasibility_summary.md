# Track A — feasibility summary (generated 2026-08-17T19:52:40.946Z)

Values below are observed in an actual prototype run. Paste into Гл. 5 / Paper 3 §6.4
and resolve the corresponding [VERIFY] markers.

## §6.4 sentence stems, filled

- **S1 (source-system agnosticism).** 6 events originating from four
  distinct simulated source systems (ERP, MES, TMS/WMS, LIMS) plus a retailer system were admitted
  through an identical validation path; the chaincode contains no source-system-specific branching.
- **S1 (lineage).** Lineage reconstruction for lot LOT-C returned
  6 nodes and 5 edges, with backward tracing
  resolving to origin Create events [C1, C2].
- **S1 (invariants).** Two deliberate violations were rejected at admission with the violated
  invariant named in the rejection message: custody continuity and recall lock.
- **S2 (audit pack).** A regulator-facing audit pack for lot LOT-D
  containing 4 ordered headers with per-event policy references was
  generated in 321 ms; payload verification against the off-ledger
  store returned 4/4 PASS.
- **S2 (passport).** A product passport view for the same lot reported custodian
  Retailer, 1 attestation(s),
  recall status none, governed by policy v1.0.
- **S2 (tamper).** A single-byte modification of a stored payload caused verification to fail,
  demonstrating that off-ledger tampering is detectable from anchored evidence alone.
- **S3 (policy-hash anchoring).** Across a policy change, 3
  records bound policy v1.0 and 2
  records bound v2.0; all 5 bindings matched the version in force at
  submission time (binding correctness: true), and re-hashing the
  policy artifacts reproduced the anchored digests (verifiability: true).
- **Totality.** A submission attempted before any policy was anchored was rejected: totality is enforced as a precondition, not a default.

## Rejection messages (verbatim, for §6.1)

```
INVARIANT VIOLATION [totality]: no governance policy is active at submission time 2026-07-20T08:59:41Z; every accepted header must bind exactly one policy hash

INVARIANT VIOLATION [custody continuity]: Transfer of asset "LOT-C" submitted by "Retailer", but current custodian is "Carrier" — only the current custodian may record a transfer

INVARIANT VIOLATION [recall lock]: asset "LOT-C" is under recall; further transfers are blocked until the recall is cleared
```

## Tamper test (for §6.2)

```
tamper test — asset LOT-D, event VD1
anchored digest   : 6e6f63a6ac83164a6a3af60065e482a6d97cd9f58f6588536d6fd1a1c9f48571
before tampering  : recomputed 6e6f63a6ac83164a6a3af60065e482a6d97cd9f58f6588536d6fd1a1c9f48571 · verified true
modification      : one byte appended inside the stored attestation payload
after tampering   : recomputed 770a4dc9d93b22b8e0d3aa975786c4264eb29433dfeb8f1b7b6ac0fcd56c084a · verified false
result            : TAMPER DETECTED from anchored evidence alone ✓
ledger header     : unchanged (headers are immutable; only off-ledger bytes were altered)
```

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

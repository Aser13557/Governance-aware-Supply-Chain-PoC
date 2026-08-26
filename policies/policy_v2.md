# Consortium Evidence Governance Policy — v2.0

Supersedes v1.0 prospectively from the anchored effectiveFrom timestamp.

## Changes relative to v1.0

C1 Attestation independence — a Verify event may no longer be submitted by the
   party holding custody of the lot. Self-attestation by the current custodian
   is inadmissible.
C2 Conservation tolerance — the permitted imbalance between transformation
   inputs and outputs is tightened from 0.5 to 0.25 units.
C3 Transfer notice — unchanged from v1.0: Transfer events must name the
   receiving custodian explicitly.

## 1-5

All other clauses of v1.0 remain in force unchanged: admissible event types,
validation invariants V1-V4, disclosure rules, and prospective change control.

## Auditor note

Records submitted before this version's effectiveFrom remain bound to the v1.0
hash and were judged under the v1.0 parameters. Determining which ruleset
governed a given record requires no external record-keeping: the binding is
carried by the record itself, and the parameters that ruleset applied are
recoverable from the artifact whose hash is bound.

## 6. Machine-readable parameters

```json
{"quantityTolerance":0.25,"verifyRequiresDistinctActor":true,"recallBlocksTransform":true}
```

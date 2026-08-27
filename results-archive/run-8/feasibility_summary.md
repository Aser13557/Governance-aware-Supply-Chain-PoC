# Track A - feasibility summary (generated 2026-08-27T19:18:13.642Z)

All values observed in a single prototype run.

## Filled sentence stems

- **S1 (source-system agnosticism).** 7 events originating from four distinct
  simulated source systems (ERP, MES, TMS/WMS, LIMS) plus a retailer system were admitted through an
  identical validation path; the chaincode contains no source-system-specific branching.
- **S1 (lineage).** Lineage reconstruction for lot LOT-C returned 7
  nodes and 6 edges, with backward tracing resolving to origin Create events
  [C1, C2]; forward tracing from an origin lot identified
  1 derived lot(s) [LOT-C].
- **S1 (indicators).** Time-to-trace 7200 s between the earliest Create
  (C1) and the queried event (TR3);
  4 organization hand-offs along the evidence path
  (Producer -> Processor -> Processor -> Laboratory -> Retailer -> Carrier).
- **S1 (recall lock is liftable).** The lock blocked both a transfer and a transformation of the
  recalled lot; after a governance clearance recorded under policy
  v1.0, a transfer by the current custodian
  was accepted.
- **S2 (audit pack).** A regulator-facing audit pack for lot LOT-D containing
  4 ordered headers, each with its actor identity attestation and policy
  reference, was generated in 580 ms; payload verification against the
  off-ledger store returned 4/4 PASS.
- **S2 (indicators).** The pack reports time-to-trace 3900 s and
  2 audit hand-offs, computed in the chaincode from the lineage.
- **S2 (passport).** A product passport for the same lot reported custodian Retailer,
  1 attestation(s), remaining quantity
  500 KG, recall status
  none, governed by policy v1.0.
- **S2 (tamper).** A single-byte modification of a stored payload caused verification to fail,
  demonstrating that off-ledger tampering is detectable from anchored evidence alone.
- **S3 (policy-hash anchoring).** Across a policy change,
  3 records bound policy v1.0 and
  2 bound v2.0; all
  5 bindings matched the version in force at submission
  (binding correctness: true), re-hashing the policy artifacts
  reproduced the anchored digests (verifiability: true), and the
  validation parameters held in the registry matched those stated in the artifacts
  (parameter fidelity: true).
- **S3 (policy-driven behaviour).** A transformation declaring a 0.4
  unit imbalance was admitted under v1.0 (tolerance 0.5)
  and an identical submission was refused under v2.0 (tolerance
  0.25); the deciding parameter was
  resolved from the governance registry, not supplied by the submitter. Under v2.0 an attestation by the
  current custodian was likewise refused.
- **S2 (interoperability).** The same anchored evidence was exported to EPCIS 2.0 and to PROV-O:
  7 events in both, transformations expressed as TransformationEvent and
  lineage links as PROV derivation relations, each exported event carrying the policy reference under
  which it was admitted.
- **S5 (membership).** 7 organizations were admitted before any evidence was
  accepted; a suspension then removed future submission rights prospectively while leaving anchored
  evidence untouched. Every membership act is anchored and bound to the policy in force, with its
  rationale referenced by digest only.
- **S5 (disputes).** A dispute over an anchored event was opened by a consortium member and resolved by
  the designated authority after 5 s; no anchored header was altered, and the
  dispute now appears in the audit pack and trace metrics for the affected lineage.
- **S5 (dispute cycle time).** The third indicator of the model is instrumented:
  5 s for the lineage carrying the disputed event.
- **S5 (emergency overrides).** A time-bounded suspension of a submission category, linked to a
  governance decision artifact by digest, refused submissions in its scope and was then lifted.
- **S5 (audit access).** Three visibility tiers behaved as specified: the public tier could confirm
  integrity without receiving content, the consortium and authority tiers could retrieve it, and an
  unauthenticated request was refused.
- **S4 (validation surface).** 22 of 22 admission
  checks were demonstrated by a rejection carrying that check's own tag.
- **Totality.** A submission attempted before any policy was anchored was rejected: governance state is a
  precondition of admission, not a default applied in its absence.

## Rejection messages (verbatim)

```
INVARIANT VIOLATION [totality]: no governance policy is active at submission time 2026-08-27T19:15:59Z; every accepted header must bind exactly one policy hash

INVARIANT VIOLATION [custody continuity]: Transfer of asset "LOT-C" submitted by "Retailer", but current custodian is "Carrier"; only the current custodian may record a transfer

INVARIANT VIOLATION [recall lock]: asset "LOT-C" is under recall; further transfers are blocked until the recall is cleared

INVARIANT VIOLATION [recall lock]: asset "LOT-C" is under recall and may not be an input to a transformation until cleared

INVARIANT VIOLATION [quantity conservation]: inputs total 100.0000 KG, outputs total 90.0000 KG, difference 10.0000 exceeds the tolerance 0.2500 set by policy v2.0

INVARIANT VIOLATION [quantity conservation]: transformation consumes 5000.0000 KG of asset "LOT-D" but only 500.0000 KG remains

INVARIANT VIOLATION [quantity conservation]: input asset "LOT-D" is recorded in "KG" but the manifest declares "L"; quantities in different units cannot be balanced

INVARIANT VIOLATION [quantity conservation]: inputs total 1000.0000 KG, outputs total 999.6000 KG, difference 0.4000 exceeds the tolerance 0.2500 set by policy v2.0

INVARIANT VIOLATION [verification integrity]: a Verify event must reference a well-formed attestation payload digest; got "not-a-digest"

INVARIANT VIOLATION [verification integrity]: policy v2.0 requires an attestation from a party other than the current custodian, but "Warehouse" holds custody of asset "LOT-E"

REJECTED [asset]: asset "LOT-A" has been fully consumed by a transformation and can no longer be transferred

REJECTED [schema]: eventType "Inspect" is not one of Create|Transform|Transfer|Verify|Recall

REJECTED [lineage]: predecessor event "NO-SUCH-EVENT" does not exist

REJECTED [duplicate]: eventID "D1" is already anchored; anchored headers are immutable

GOVERNANCE REJECTION [change control]: AnchorPolicy is restricted to the authority designated for the next version (Org1MSP); caller is Org2MSP

GOVERNANCE REJECTION [change control]: ClearRecall is restricted to the authority designated by policy v1.0 (Org1MSP); caller is Org2MSP

GOVERNANCE REJECTION [retroactivity]: effectiveFrom 2026-08-27T19:07:51Z precedes the anchoring time 2026-08-27T19:17:51Z; a policy version may not be declared in force before it was anchored

GOVERNANCE REJECTION [ordering]: effectiveFrom 2026-08-27T19:47:54Z must be strictly after existing version v3.0 (2026-08-27T20:17:51Z); policy supersession is prospective

GOVERNANCE REJECTION [membership]: organization "Warehouse" is suspended and may not submit evidence

GOVERNANCE REJECTION [change control]: AdmitOrganization is restricted to the authority designated by policy v2.0 (Org1MSP); caller is Org2MSP

GOVERNANCE REJECTION [change control]: ResolveDispute is restricted to the authority designated by policy v2.0 (Org1MSP); caller is Org2MSP

GOVERNANCE REJECTION [emergency]: submission is suspended by emergency EMG-1 (eventType "Recall") until 2026-08-27T19:48:06Z
```

## Tamper test

```
tamper test - asset LOT-D, event VD1
anchored digest   : 10e033499a6ef8e1968aeff843778d933c800425b82940699e64d94c766b2fdd
before tampering  : recomputed 10e033499a6ef8e1968aeff843778d933c800425b82940699e64d94c766b2fdd - verified true
modification      : one byte appended inside the stored attestation payload
after tampering   : recomputed 80068bf4f70acd5e9e6fbacbb444fa70ea1ad057b5388acbd77ad87b0e0575f5 - verified false
result            : TAMPER DETECTED from anchored evidence alone
ledger header     : unchanged (headers are immutable; only off-ledger bytes were altered)
```

# Consortium Evidence Governance Policy — v1.0
Effective from the anchored effectiveFrom timestamp.

## 1. Admissible evidence
Accepted event types: Create, Transform, Transfer, Verify, Recall.
Every submission carries an evidence header conforming to schema
`scmt-header-v1` and a payload digest (SHA-256) resolvable in the
consortium payload store.

## 2. Validation invariants
V1 Custody continuity — only the current custodian may record a Transfer.
V2 Quantity conservation — Transform inputs must equal outputs within the
   declared tolerance.
V3 Verification integrity — a Verify event must reference a retrievable
   attestation payload.
V4 Recall lock — once an asset is recalled, further Transfers are blocked.

## 3. Attestation
Laboratory attestations are admissible from accredited laboratory actors.
Tolerance for quantity conservation: 0.5 units unless a sector annex
specifies otherwise.

## 4. Disclosure
Audit packs are released to roles auditor and authority. Payload disclosure
is governed by the custody rules of the payload store; verification without
disclosure is always permitted.

## 5. Change control
Policy versions are anchored by the consortium administrator. Supersession is
prospective: a new version governs only records submitted after its
effectiveFrom timestamp.

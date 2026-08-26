# Consortium Evidence Governance Policy — v1.0

Effective from the anchored effectiveFrom timestamp.

## 1. Admissible evidence

Accepted event types: Create, Transform, Transfer, Verify, Recall. Every
submission carries an evidence header conforming to schema `scmt-header-v1` and
a payload digest (SHA-256) resolvable in the consortium payload store.

## 2. Validation invariants

V1 Custody continuity — only the current custodian may record a Transfer, and
   the receiving custodian must be named and distinct from the submitter.
V2 Quantity conservation — a Transform must balance inputs and outputs within
   the tolerance set by this policy, may not consume more of a lot than
   remains, and may not mix units.
V3 Verification integrity — a Verify event must reference a well-formed,
   retrievable attestation payload digest.
V4 Recall lock — a lot under recall may neither be transferred nor consumed by
   a transformation until the recall is cleared by the consortium.

## 3. Attestation

Laboratory attestations are admissible from accredited laboratory actors. Under
this version, an attestation from the current custodian of the lot is
admissible.

## 4. Disclosure

Audit packs are released to roles auditor and authority. Verification without
disclosure is always permitted.

## 5. Change control

Policy versions are anchored by the consortium administrator. Supersession is
prospective: a version governs only records submitted at or after its
effectiveFrom timestamp, and a version may not be declared in force before the
moment it was anchored.

## 6. Machine-readable parameters

The values below are the enforceable form of the clauses above. They are part
of this artifact, so the anchored hash covers them and an auditor can confirm
that the parameters held in the governance registry are the parameters stated
in this text.

```json
{"quantityTolerance":0.5,"verifyRequiresDistinctActor":false,"recallBlocksTransform":true}
```

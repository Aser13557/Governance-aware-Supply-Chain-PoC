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

## 5. Governance kit

Membership — organizations must be admitted before they may submit evidence.
Suspension removes future submission rights prospectively and leaves anchored
evidence untouched. Admission, suspension and reinstatement are anchored acts
whose detailed rationale remains off-ledger, referenced by digest.

Change control — policy versions are anchored by the authority designated in
the version currently in force; the authority for this first version comes from
the consortium's founding agreement. Supersession is prospective, and a version
may not be declared in force before the moment it was anchored.

Disputes — a contested reading of anchored evidence is registered as a dispute
naming the events it concerns and the policy then in force. A dispute never
withdraws a header; it augments the context in which the header is read.

Emergencies — admissibility may be suspended for a scope of submissions, time
bounded and linked to a governance decision artifact, so that a temporary
measure remains reviewable once normal policy resumes.

Audit access — three visibility tiers are distinguished: public lineage
visibility, consortium-internal evidence visibility, and authority-facing audit
visibility. Only the latter two may retrieve payload content.

## 5a. Successor authority

The authority permitted to anchor the version that supersedes this one is
recorded in the registry entry for this version.

## 6. Machine-readable parameters

The values below are the enforceable form of the clauses above. They are part
of this artifact, so the anchored hash covers them and an auditor can confirm
that the parameters held in the governance registry are the parameters stated
in this text.

```json
{"quantityTolerance":0.5,"verifyRequiresDistinctActor":false,"recallBlocksTransform":true,"enforceMembership":true,"maxEventTimeDivergenceHours":0}
```

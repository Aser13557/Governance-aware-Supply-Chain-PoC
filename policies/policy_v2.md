# Consortium Evidence Governance Policy — v2.0
Supersedes v1.0 prospectively from the anchored effectiveFrom timestamp.

## Changes relative to v1.0
C1 Attestation scope — Verify events must reference an attestation issued by
   a laboratory holding current ISO/IEC 17025 accreditation; the accreditation
   reference is a required payload field.
C2 Transfer notice — Transfer events must record the receiving custodian
   explicitly (field newCustodian) prior to physical handover.
C3 Tolerance — quantity-conservation tolerance is tightened to 0.25 units for
   food-sector lots.

## 1–5
All other clauses of v1.0 remain in force unchanged: admissible event types,
validation invariants V1–V4, disclosure rules, and prospective change control.

## Auditor note
Records submitted before this version's effectiveFrom remain bound to the
v1.0 hash. Determining which ruleset governed a given record requires no
external record-keeping: the binding is carried by the record itself.

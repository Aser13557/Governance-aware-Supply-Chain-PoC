# Paper3_Empirical_Validation_DRAFT — edits E1–E3

Paste-ready blocks keyed to anchor sentences. Apply before coding continues so
methodology text and prototype cannot drift.

---

## E1 · §4.2 · INSERT AFTER
**Anchor:** "…using a two-organization test network with a single channel."

> Scenario actors (producer, processor, carrier, laboratory, retailer) are
> represented as logical organizations through the actorOrg header field and
> are mapped onto the two Membership Service Provider identities of the test
> network. The number of network MSPs is orthogonal to the mechanisms under
> test — header validation, invariant enforcement, and policy-hash binding
> operate on header content rather than on network topology — so a two-MSP
> network suffices to exercise all three scenarios.

**Why:** resolves the internal tension between §4.2 ("two-organization test
network") and §6.1 ("three organizations") / Table 3 (five actor roles).

---

## E2a · §4.2 · REPLACE
**Anchor:** sentence beginning "Scenario S1 (recall investigation) runs a
five-event chain…"

> Scenario S1 (recall investigation) runs a six-event chain exercising all
> five event types — two Create events registering Lots A and B, a Transform
> combining them into Lot C, a Transfer, a Verify, and a Recall — across five
> logical organizations, with each event's payload constructed as the
> normalized output of a simulated enterprise source system (ERP for the
> Create events, MES for Transform, the shipper's TMS/WMS for Transfer, LIMS
> for Verify, and the retailer's system for Recall).

## E2b · §6.1 · REPLACE
**Anchor:** "Setup. Five events across three organizations trace a lot from
creation to recall."

> Setup. Six events across five logical organizations trace a lot from
> creation through transformation to recall, exercising all five event types;
> the two Create events register the input lots whose quantities the
> Transform's conservation check consumes.

**Table 3:** insert new row 2
`| 2 | Create C2 | ERP | — (initial creation) | Lot B registered | [INSERT] |`
and renumber remaining steps 3–6.

**Why:** without Create C2 (Lot B), the quantity-conservation check at the
Transform step fails at runtime — the draft's Expected column ("Lot C derived
from A+B") already presupposes Lot B exists. Bonus: the executed chain becomes
literally identical to Paper 1 Figure 2 / Table 2 (Глава 3 ↔ Глава 5
coherence).

---

## E3 · §6.2 · INSERT AFTER
**Anchor:** "…payload hashes each of which verifies against off-ledger
content."

> As a negative integrity check, one stored payload is deliberately modified
> after anchoring; its hash verification must then fail, demonstrating that
> off-ledger tampering is detectable from the anchored evidence alone.

Also extend §6.2's results-INSERT list with: "tamper-check result
(pass/fail)".

---

## Code-side notes (no paper edit required)

- S3 record IDs carry the `S3-` prefix in code and results files to avoid
  colliding with S1's Recall event "R1"; Table 4's context disambiguates in
  the paper.
- Fixture rule: TR1 is submitted by the **Processor** (current custodian per
  Paper 1 §3.6) with `newCustodian: Carrier`; source system = shipper's
  TMS/WMS. Defense rebuttal for the §3.6-vs-Table-2 tension is logged in the
  repo README.

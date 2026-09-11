# Expert evaluation questionnaire — Track B instrument, as fielded

Reconstructed verbatim from the deployed Google Form ("Expert Evaluation Questionnaire — Supply Chain Traceability Design") and the response export. This is the instrument the 12 respondents answered (29 Aug – 10 Sep 2026). It supersedes the earlier design-stage rendering that was exported from the dissertation appendix: the Likert block is unchanged, but the open questions (C1–C4), the scenario item (D1) and the role options differ from what was fielded. Приложение А of the dissertation must be the Bulgarian translation of *this* text.

**Item count convention.** 26 substantive items in four blocks: A1–A5 (5), B1–B16 (16), C1–C4 (4), D1 (1). Not counted: the consent item A0, the conditional follow-up to A5, and the two optional contact fields (name, e-mail) for a follow-up interview. Dimension order in the form is D1, D2, D3, D6, D4, D5, D7, D8 — map by item text, never by position. Scale: 1 = strongly disagree … 5 = strongly agree; "N/A – outside my expertise" is excluded from the denominator.

## Information page (verbatim)

You are invited to take part in a doctoral research study at Sofia University "St. Kliment Ohridski" (Faculty of Mathematics and Informatics) evaluating a traceability model and evidence architecture for supply chains. Completing this questionnaire takes about 15 minutes. Participation is voluntary; you may stop at any time by closing the form, and you may skip any open question. The questionnaire is anonymous: no names, employers, IP addresses, or other identifying data are collected. Responses are analysed in aggregate and reported only in anonymised form. If you volunteer contact details at the end, they are used solely to arrange a follow-up interview, stored separately from your answers, and deleted after the study. Contact: Aleksandar Panayotov — alex.panayotov@fmi.uni-sofia.bg

## Block A — About you

- A0. Consent to participate (required): "I have read the information above and I agree to participate."
- A1. Which best describes your primary professional role? (check all that apply) — Academic researcher / IT / blockchain architect or engineer / Regulatory, compliance, or audit professional / Supply chain operations professional / Other (free text)
- A2. Years of professional experience in your primary field: Under 3 / 3–7 / 8–15 / Over 15
- A3. How familiar are you with blockchain / distributed ledger concepts? (1 = No familiarity … 5 = Expert)
- A4. How familiar are you with traceability standards such as GS1 EPCIS or W3C PROV? (1–5)
- A5. Have you participated in a traceability, recall, audit, or compliance project? (Yes / No) — If yes, briefly describe your role (free text, optional)

## Briefing §1 — The event model (verbatim)

The model expresses every traceability action as one of five event types: Create, Transform, Transfer, Verify, Recall. Each event records who, when, which item, and which earlier events it follows — so history can be traced backward to origin and forward to everything affected. The five types are intended as a common core across sectors rather than a vocabulary tailored to one. Sector-specific detail is carried in the underlying document, and further event types can be added as extensions without changing the core. Four built-in checks reject broken records before they reach an audit: only the current holder may transfer (custody continuity); transformations must balance inputs and outputs within a tolerance the consortium sets (quantity conservation); an attestation must be valid (verification integrity); a recalled item cannot move (recall lock). Rate each statement 1–5, or select "N/A – outside my expertise" rather than estimating.

*Figure: "Lineage example — How events link together": Create Lot A and Create Lot B → Transform (→ Lot C) → Transfer (Shipment C1) → Verify (lab result) → Recall (under investigation); arrows "trace backward to origin" and "trace forward to everything affected".*

## Briefing §2 — Confidentiality and existing systems (verbatim)

Only a short signed header is shared: what happened, to which item, by whom, when, which events preceded it, and a fingerprint (hash) of the underlying document. The document — production order, transport document, laboratory report, certificate — stays with its owner. The hash proves the document exists and has not changed, without revealing its contents. No existing system is replaced. Each participant keeps its ERP (enterprise resource planning), WMS (warehouse management), TMS (transport management), MES (manufacturing execution), and LIMS (laboratory information management) systems as they are. A small component called an adapter sits between each system and the shared layer: it takes a record the system already produces — a goods receipt, a production order confirmation, a shipment dispatch, a laboratory result — and translates it into one of the five event types. Different organisations run different systems and different adapters, but the resulting evidence has the same shape.

*Figures: "Public and private data distribution" (shared ledger: event ID · type · asset · actor · timestamp; links to earlier events; hash of the detailed record; hash of the governance policy in force — vs. your systems: production order, transport document, laboratory report, certificate, never transmitted) and "How existing systems connect" (ERP / WMS / MES / TMS / LIMS → adapter → one common event shape).*

## Briefing §3 — Governance (verbatim)

Consortium rules cover five areas: who may join, how rules change, how disputes are handled, what happens in emergencies, and who may audit. They are kept as a versioned rulebook whose fingerprint is recorded in the shared ledger. Every accepted record is stamped with the rulebook version in force at the moment it was accepted. This differs from how shared systems usually work: normally an administrator configures who may do what, and that configuration describes the rules as they are now — it changes over time without leaving a trace attached to the data. If a dispute arises three years later about a record submitted under earlier rules, the configuration cannot show which rules applied then; that has to be reconstructed from minutes, email, and recollection. Stamping each record instead makes the question "under which rules was this admitted?" answerable from the evidence itself.

*Figure: "Policy binding timeline example — Which rules governed this record?": records accepted under rulebook v1.0, the consortium changes the rules, records accepted under v2.0; the stamp stays attached permanently.*

## Briefing §4 — Measures and outputs (verbatim)

Three indicators are defined in the model itself: time-to-trace (how long it takes to reconstruct a full product history), audit hand-offs (how many organisational boundaries an evidence trail crosses), and dispute cycle time (from disputed claim to resolution). Defining them in the model, rather than letting each deployment invent its own, is intended to make results comparable between implementations and over time — so that "our trace takes four hours" means the same thing in two different consortia. Two outputs are produced. A product passport is a compact signed view of a lot or shipment: identifiers, status, key attestations, any open recall. An audit pack bundles the ordered event records, proofs, and references to the underlying documents for a given scope, so a regulator can verify a trace without requesting every internal document.

*Figure: "What comes out": Product passport (identifiers; current status; key attestations; recall state) and Audit pack (ordered event records; proofs — signatures and hashes; the policy version governing each record; references to the underlying documents).*

## Block B — Likert statements (form questions 8–11; one grid of four rows per briefing section)

| Dimension | Item | Statement (verbatim) |
|---|---|---|
| D1 | B1 | The five event types (Create, Transform, Transfer, Verify, Recall) are sufficient to represent the essential traceability operations in supply chains I am familiar with. |
| D1 | B2 | A small, cross-sector event vocabulary is preferable to a richer sector-specific vocabulary for a shared traceability core, provided extensions are possible. |
| D2 | B3 | Explicit predecessor links between events are a credible basis for reconstructing product history backward to origin and forward to affected descendants across organizational boundaries. |
| D2 | B4 | The four validation invariants (custody continuity, quantity conservation, verification integrity, recall lock) would catch the most consequential invalid trace states before they surface in an audit. |
| D3 | B5 | Keeping detailed payloads off-ledger and anchoring only compact signed headers and hashes on-ledger is a workable way to protect confidential business data in a multi-party setting. |
| D3 | B6 | Hash linkage between on-ledger headers and off-ledger payloads provides sufficient integrity assurance for audit and dispute purposes. |
| D6 | B7 | Adapter-based ingestion is a feasible way to connect existing enterprise systems (ERP, WMS, TMS, MES, LIMS) to a shared evidence layer without replacing them. |
| D6 | B8 | Normalizing heterogeneous enterprise records into a common five-event evidence schema is achievable in practice. |
| D4 | B9 | The five governance domains (membership, change control, disputes, emergencies, audit access) cover the decisions a real traceability consortium must be able to govern. |
| D4 | B10 | Maintaining consortium policy as a versioned artifact whose hash is anchored on-ledger is realistic for organizations I am familiar with. |
| D5 | B11 | Binding each evidence record to the exact policy hash active at submission time adds meaningful audit value beyond platform-level membership and access control. |
| D5 | B12 | The ability to verify, years later, which governance rule set governed a past record would be valuable in dispute or compliance situations I know of. |
| D7 | B13 | Time-to-trace, audit hand-offs, and dispute cycle time are meaningful indicators of traceability performance. |
| D7 | B14 | Defining these indicators directly in the model would improve comparability across traceability implementations. |
| D8 | B15 | A product passport view (identifiers, current status, key attestations, recall state) would be usable by auditors or public authorities in my context. |
| D8 | B16 | An audit pack (ordered event headers, proofs, and payload references) would materially reduce the effort of regulatory evidence collection. |

## Block C — Open questions (form questions 12–15; optional)

- C1. Which elements of the model or architecture do you consider most practically adequate, and why?
- C2. Which essential elements — event types, invariants, governance rules, or outputs — are missing or under-specified for the settings you know?
- C3. Based on consortium or multi-party projects you have observed: under what circumstances would the governance kit and policy-hash anchoring fail in practice?
- C4. Would the product passport and audit pack be accepted as evidence by auditors or regulators in your context? What would need to change for acceptance?

## Block D — Scenario (form question 16; optional)

*Scenario text (verbatim):* A laboratory analysing samples from Shipment C1 (carrying Lot C, produced from Lots A and B) detects possible contamination. The laboratory records a Verify event referencing its analysis. The retailer opens a Recall for the affected item. Using the lineage graph, the system identifies the originating Create events and all descendant lots. The recall-lock invariant blocks further Transfer events until the item is cleared. An auditor runs a trace to origin and generates an audit pack; the regulator verifies signatures, hashes, and the applicable policy version without requesting the underlying internal documents.

- D1. In your judgment, which step of this flow is most likely to fail in a real multi-organization deployment, and why? What single change would most improve it?

## Follow-up interview (optional; excluded from the analysis data)

Name; Email. No respondent's contact data is present in the analysis export.

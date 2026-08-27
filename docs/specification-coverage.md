# Specification coverage

Every normative statement in the conceptual model [1] and the reference
architecture [2], and where the prototype implements and demonstrates it.

## Conceptual model

| § | Statement | Implementation | Demonstrated by |
|---|---|---|---|
| 3.1 | Five actor groups | logical organizations in `actorOrg`, mapped onto the network MSPs | all scenarios |
| 3.2 | Events submitted, validated, linked, added to the lineage graph | `CreateHeader` | S1–S3 |
| 3.2 | Governance rules determine who may submit, read, or change artifacts | membership; disclosure tiers; policy authority chain | S5 |
| 3.2 | Outputs: passport, audit pack, KPIs | `export.js` | S2 |
| 3.3 | Five event types | `validTypes`; a sixth is refused | S1, S4 (`[schema]`) |
| 3.3 | Backward tracing to origin | `GetLineageByAsset.originCreates` | S1 |
| 3.3 | Forward tracing to affected descendants | `AffectedDescendants` | S1 |
| 3.3 | EPCIS / PROV mapping preserves semantic interoperability | `interop.js` | S2 |
| 3.4 | Header/payload separation, linked by payload hash | evidence header + payload store | all |
| 3.4 | Header field set | `EvidenceHeader` | all |
| 3.4 | Policy text off-ledger, its hash anchored | governance registry | S3 |
| 3.5 | Governance kit: membership | `AdmitOrganization`, `SuspendOrganization` | S5 |
| 3.5 | Governance kit: change control | `AnchorPolicy` with the designated authority | S3, S4 |
| 3.5 | Governance kit: disputes | `OpenDispute`, `ResolveDispute` | S5 |
| 3.5 | Governance kit: emergencies | `DeclareEmergency`, `LiftEmergency` | S5 |
| 3.5 | Governance kit: audit access | three visibility tiers | S5 |
| 3.6 | Custody continuity | Transfer branch | S1 (`[custody continuity]`) |
| 3.6 | Quantity conservation | manifest, availability, units, policy tolerance | S3, S4 (4 rejections) |
| 3.6 | Verification integrity | digest well-formedness; distinct attestor under v2.0 | S3, S4 |
| 3.6 | Recall lock, until cleared | Transfer and Transform blocked; `ClearRecall` | S1 (2 rejections + clearance) |
| 3.7 | Time-to-trace | `GetTraceMetrics` | S1, S2 |
| 3.7 | Audit hand-offs along the minimal evidence path | shortest predecessor chain | S1, S2 |
| 3.7 | Dispute cycle time | recorded on resolution | S5 |
| 3.8 | Product passport | `passport` | S2 |
| 3.8 | Audit pack: scope, ordered headers, signatures, payload references | `auditPack` | S2 |
| 3.8 | Recall investigation identifies descendant lots | `AffectedDescendants` | S1 |

## Reference architecture

| § | Statement | Implementation | Demonstrated by |
|---|---|---|---|
| III.B R1 | Adapters normalise in; export mappings preserve interoperability | 5 adapters; EPCIS and PROV exports | S1, S2 |
| III.B R2 | Minimal shared disclosure | header on-ledger, payload off | all |
| III.B R3 | Verifiable off-ledger integrity | payload digests, identity attestation, lineage links | S2 |
| III.B R4 | Governance-linked admissibility | validation parameters resolved from the registry | S3 |
| III.B R5 | Legacy-system integration | ERP, MES, TMS/WMS, LIMS, retailer adapters | S1 |
| III.B R6 | Portable evidence outputs | audit, lineage, passport, EPCIS, PROV | S2 |
| IV.A | Header field set including policy-hash reference | `EvidenceHeader` | all |
| IV.B | Validation checks identity, role, schema, predecessors, policy state | `CreateHeader` | S4 |
| IV.B | Policy hash and payload hash are complementary | distinct fields, distinct failures | S2, S3 |
| IV.B | Policy-state evidence, not policy-compliance evidence | stated in the README limitations | — |
| V.A | Stable identifier, effective-from, anchored hash per version | `PolicyVersion` | S3 |
| V.A | Canonical form before hashing | `canonical` recorded on each version | S3 |
| V.A | Hash algorithm recorded alongside the digest | `hashAlgorithm` | S3 |
| V.A | Authority designated by the preceding version | `nextAuthority`, checked on anchoring | S3, S4 |
| V.A | Registry retains every superseded version | no delete path | S3 |
| V.A | active(t) = H(Pi) for ti ≤ t < ti+1 | `activeAt` | S3 |
| V.A | Totality | refusal when no policy is in force | S0 |
| V.A | Binding immutability; prospective supersession | no update path; ordering rule | S3, S4 |
| V.A | Verifiability by recomputation | hash and parameter fidelity checks | S3 |
| V.A | Submission time assigned by the validation layer | transaction timestamp | all |
| V.A | Maximum event-time divergence as a policy rule | `maxEventTimeDivergenceHours` | S3 (v2.0) |
| V.B | Membership admission and revocation as anchored acts | membership registry | S5 |
| V.B | Three visibility tiers | payload store tiers | S5 |
| V.C | Disputes augment rather than replace | dispute registry; exports carry state | S5 |
| V.C | Emergency overrides versioned, time-bounded, linked to a decision | emergency registry | S5 |
| VI | EPCIS/CBV-compatible objects; PROV lineage views; passport outputs | `interop.js`, `export.js` | S2 |
| VII Table V | Recall investigation | S1 |
| VII Table V | Regulatory audit | S2 |
| VII Table V | Cross-organizational dispute | S5 |
| VII Table V | DPP-style query | S2 passport |
| VII Table V | Emergency suspension of a submission category | S5 |

## Deliberately not implemented

| Item | Source | Why |
|---|---|---|
| Performance benchmarking | architecture VII | the architecture bounds its own claims to analytical adequacy; measuring here would exceed them |
| Fabric private data collections | model 2 | off-ledger custody is realised by the external store; PDCs are an alternative instantiation |
| Live enterprise integrations | R5 | agnosticism is proven by the normalised schema and a branch-free validation path |
| Key-management infrastructure | model 3.9 | assumed by both papers |
| Sector schema extensions | model 3.9 | the model is a cross-sector core |
| Conformance certification for EPCIS/PROV | architecture VI | the architecture claims compatibility, not certification |

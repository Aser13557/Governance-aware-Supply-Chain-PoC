# Governance-aware Supply Chain PoC — Track A prototype

Proof-of-concept instantiation on Hyperledger Fabric 2.5 of the governance-aware evidence infrastructure for supply chain traceability described in "A Reusable Governance-Aware Evidence Infrastructure for Traceability Applications" (reference architecture) and validated in "Empirical Validation of a Governance-Aware Evidence Infrastructure for Supply Chain Traceability: Prototype Demonstration and Multi-Stakeholder Expert Evaluation" / Chapter 5 of the dissertation. A component exists here only if it produces an artifact cited in those texts; run 12 (see Reproducibility below) is the canonical run from which every reported value derives.

## Publications this repository supports

1. Panayotov, A., Lambov, I., Atanasova, M. (2026). *A Governance-Aware, Privacy-Preserving, Event-Driven Conceptual Model for Supply Chain Traceability.* Engineering Proceedings, 150(1), art. 4. https://doi.org/10.3390/engproc2026150004 — the conceptual model.
2. Panayotov, A., Lambov, I., Atanasova, M. (2026). *A Reusable Governance-Aware Evidence Infrastructure for Traceability Applications.* Proceedings of the 13th IEEE International Conference on Intelligent Systems (IS), Varna, September 2026, in press — the reference architecture instantiated here.
3. Panayotov, A., Lambov, I., Atanasova, M. (2026). *Empirical Validation of a Governance-Aware Evidence Infrastructure for Supply Chain Traceability: Prototype Demonstration and Multi-Stakeholder Expert Evaluation.* Manuscript — the validation reported from this prototype (Track A) and the expert evaluation (Track B).

The dissertation *Blockchain Smart Contracts and Protocols: a governance-aware evidence infrastructure for supply chain traceability* (Sofia University "St. Kliment Ohridski", FMI, 2026) reports the same run in Chapter 5.


## How to run it

**No install (recommended) → `CLOUD.md`.** Push this repo to GitHub, open the
Actions tab, click *Run workflow*. ~15 minutes later you download `results/`
as a zip. Free, and the run log doubles as reproducibility evidence for Гл. 5.
For an interactive terminal, open the repo in a GitHub Codespace — the
`.devcontainer/` config installs everything automatically.

**Locally on Windows 11 → `SETUP-WINDOWS.md`.** Fabric has no native Windows
build, so the stack runs inside WSL2:

```bash
bash setup/wsl-bootstrap.sh     # one-time: Go, Node, jq, fabric-samples 2.5
./run-all.sh                    # network → chaincode → payload store → S1,S2,S3 → results/
```

Either path produces the identical `results/` folder.

## What it produces

| Artifact in `results/` | Where it goes in the paper |
|---|---|
| `feasibility_summary.md` | filled sentence stems with observed values |
| `S4_validation_surface.md` / `.json` | every admission check with the rejection that demonstrates it |
| `S1_table3_observed.json` | observed events, per source system |
| `S1_lineage.json`, `S1_descendants.json` | backward trace to origin, forward trace to derived lots |
| `S1_trace_metrics.json` | time-to-trace and audit hand-offs (model 3.7) |
| `S1_recall_status.json` | the governance act that lifted the recall lock |
| `S1_negative_*.txt` | custody, recall-lock and consumed-lot rejections |
| `S0_totality_rejection.txt` | governance state as a precondition of admission |
| `S2_auditpack.json` | ordered headers with identity attestations, policy references and indicators |
| `S2_verification.txt`, `S2_generation_time.txt`, `S2_indicators.txt` | verification result, generation time, KPI values |
| `S2_passport.json` | passport with custody, quantity and recall status |
| `S2_tamper.txt` | off-ledger tamper detection |
| `S3_table4_bindings.json` | per-record binding, hash recomputation and parameter fidelity |
| `S3_policy_effect.json` | the same submission decided differently under two regimes |
| `S3_policy_history.json` | governance registry state |
| `replay.json` | feed for `console/replay.html` |
| `render_check.txt` | every line the console will display, verified and archived |

## What the prototype demonstrates

| Requirement | Source | How |
|---|---|---|
| Five-event vocabulary | model 3.2 | all five types exercised; a sixth is refused |
| Lineage, backward and forward | model 3.3 | `GetLineageByAsset`, `AffectedDescendants` |
| Governance kit, change control | model 3.5 | anchoring and recall clearance restricted to the consortium admin |
| Four validation invariants | model 3.6 | each enforced at admission and each demonstrated by a tagged rejection |
| KPI instrumentation | model 3.7 | time-to-trace and audit hand-offs computed in the chaincode; dispute cycle time reported as not instrumented |
| Passport and audit pack | model 3.8 | both generated, with signatures and policy references |
| Governance-linked admissibility | architecture R4 | validation parameters resolved from the active policy, never from the submitter |
| Policy-hash anchoring | architecture 5.1 | totality, immutability, verifiability, plus non-retroactive and ordered validity intervals |

## Layout

```
.github/         Actions workflow — full run on a clean Ubuntu runner
.devcontainer/   Codespaces config — Go, Node, Docker, Fabric 2.5
setup/           WSL2 bootstrap (Go, Node, jq, fabric-samples 2.5)
chaincode/       Go chaincode: governed validation, invariants, policy registry
payload-store/   off-ledger payload custody service
adapters/        ERP / MES / TMS-WMS / LIMS / retailer adapters + fixtures
export/          audit pack · passport · tamper test
scenarios/       s0 totality, anchor_v1, s1 recall, s2 audit, s3 policy, s4 validation, summarize
tools/           binding verification, policy effect, validation surface, replay feed, render check, summary, artifact gate
policies/        policy_v1.md, policy_v2.md (the artifacts whose hashes get anchored)
console/         replay.html
results/         all generated artifacts
docs/            Track B instrument set · dissertation→artifact map · S4 validation-surface note · model-level observations
results-archive/ permanent copies of cited runs (artifacts expire in 90 days)
```

## Canonical fixtures

**S1 - LOT-C recall investigation.** Create C1 (LOT-A, 600 KG, ERP) and C2
(LOT-B, 400 KG, ERP) -> Transform T1 (MES; 600 + 400 -> 1000 KG, inputs
consumed) -> Transfer TR1 (TMS/WMS) -> Verify V1 (LIMS) -> Recall R1 (retailer
system) -> governance clearance -> Transfer TR3. Negative: transfer of a
consumed lot, transfer by a non-custodian, transfer of a recalled lot,
transformation of a recalled lot, clearance attempted by a non-admin.

**S2 - LOT-D audit.** D1 -> TD1 -> VD1 -> TD2, then audit pack, passport,
indicators and the tamper test.

**S3 - LOT-E policy change.** S3-R1..R3 under v1.0, v2.0 anchored, S3-R4..R5
under v2.0. Alongside them a paired transformation declaring the same 0.4 KG
imbalance: admitted under v1.0 (tolerance 0.5) and refused under v2.0
(tolerance 0.25). Under v2.0 a custodian's attestation to its own lot is
likewise refused.

**S4 - validation surface.** Quantity tolerance, availability and unit
mismatch; malformed attestation digest; unknown event type; unknown
predecessor; duplicate identifier; non-admin anchoring; retroactive validity
start; a validity start undercutting a scheduled version.

> Fixture note: the model's own walkthrough has the processor transform lots
> whose custodian is the producer, with no intervening transfer. Custody
> continuity is defined for transfers only, so the prototype follows the model
> rather than widening the invariant. That and five other points where building
> the artifact revealed something the specification leaves open are recorded in
> `docs/model-observations.md`; they are findings for the paper's discussion,
> not prototype defects.

## Instantiation choices

1. Binding uses the **transaction timestamp**, not the client's event time -
   `timestamp` is operational event time, `boundAt` is governance
   applicability time.
2. **Totality is a hard precondition**: with no active policy every submission
   is refused, and governance is resolved *before* the invariants because the
   parameters they apply belong to the policy, not the submission.
3. **Validation parameters come from the registry.** The transformation
   tolerance and the distinct-attestor rule are policy properties; a submitter
   cannot choose the terms on which its own submission is judged.
4. **Immutability by absence**: no update or delete path exists for headers.
   Validity intervals are ordered and non-retroactive, and a scheduled version
   may not be undercut.
5. **Quantities sit in the header**, minimally, so conservation is enforceable
   without payload disclosure; everything else stays off-ledger.
6. **Recall clearance is a governance object, not an event**, keeping the
   five-event vocabulary intact while making "until cleared" an operation.
7. Actors are logical organizations in `actorOrg`, mapped onto the two
   test-network MSPs.
8. The `peer` CLI replaces the Gateway SDK; transactions are still signed by
   real MSP identities.

## Out of scope

No UI beyond the replay console · no performance benchmarks (one wall-clock
observation for S2 only) · no Fabric Private Data Collections (off-ledger
custody via the external store; PDCs noted as an alternative instantiation) ·
no live enterprise integrations · no dispute/emergency governance domains
(analytical coverage in "A Reusable Governance-Aware Evidence Infrastructure for Traceability Applications", Table 5; both domains are exercised as governance acts in scenario S5 of run 12) · no key-management infrastructure ·
no sector schema extensions.

## Reproducibility (dissertation and "Empirical Validation of a Governance-Aware Evidence Infrastructure for Supply Chain Traceability: Prototype Demonstration and Multi-Stakeholder Expert Evaluation")

All values reported in the dissertation (Chapter 5) and in "Empirical Validation of a Governance-Aware Evidence Infrastructure for Supply Chain Traceability: Prototype Demonstration and Multi-Stakeholder Expert Evaluation" derive from **run 12** of the Track A workflow.

| Item | Value |
|---|---|
| Workflow | `.github/workflows/track-a.yml` |
| GitHub Actions run | 33194969585 (28 Aug 2026, 5 m 22 s) |
| Source code | commit `2687e4aba8b46c097f3781cb36b7d28fe88ea1e2` (`2687e4a`), branch `main` |
| Run-12 archive | commit `49825fc` |
| Platform | Hyperledger Fabric 2.5.9; chaincode in Go (`fabric-contract-api-go` v1.2.2); two organizations, one channel, Raft ordering, LevelDB; `peer` CLI clients |
| Scenarios | S0 totality precondition · S1 recall investigation (7 events, 4 source systems, 5 logical organizations, 4 tagged rejections, clearance as a governance act) · S2 regulatory audit (LOT-D pack, 560 ms, single-byte tamper detection; EPCIS 2.0 / PROV-O export of the S1 lineage) · S3 policy change v1.0 → v2.0 (5 correct bindings, parameter fidelity, identical submission admitted then refused) · S4 validation surface (22 tagged rejections, 10/4/8) · S5 governance kit (all five domains) |
| Completion gates | (1) every expected artifact exists with its recorded verdict; (2) every replay-console line is reproduced and traced to its artifact |

One automated run in an ephemeral environment: network creation, chaincode build/install/approve/commit, off-ledger payload service, scenarios in sequence, then both gates. Documentation describing earlier drafts (three scenarios, four source systems, a 377 ms audit pack, a 9/4/8 split) has been removed.

The Track B instrument set is under `docs/instrument/` (questionnaire, coverage matrix, codebook). `docs/DISSERTATION_MAP.md` maps each dissertation claim to the artifact that evidences it.

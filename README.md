# fabric-poc — Track A of Paper 3 (Empirical Validation)

Proof-of-concept instantiation of the governance-aware evidence infrastructure
(Paper 2) on Hyperledger Fabric 2.5. Scope is exactly what
`Paper3_Empirical_Validation_DRAFT.docx` §4.2 and §6.1–6.4 commit to: a
component exists here only if it produces an artifact cited in the paper /
Глава 5.

> **Uploading to GitHub? Read `UPLOAD-CHECKLIST.md` first.** The web uploader
> silently skips dot-folders, so `.github/workflows/track-a.yml` must be created
> by hand — without it nothing runs and no error is shown.

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
| `feasibility_summary.md` | §6.4 sentence stems, filled with observed values |
| `S1_table3_observed.json` | Table 3 — observed column |
| `S1_lineage.json` | node/edge counts, backward trace to origin |
| `S1_negative_custody.txt`, `S1_negative_transfer.txt` | invariant rejection evidence (verbatim) |
| `S0_totality_rejection.txt` | totality enforced as a precondition |
| `S2_auditpack.json`, `S2_verification.txt`, `S2_generation_time.txt` | audit pack, 4/4 verification, generation time |
| `S2_passport.json` | product passport output |
| `S2_tamper.txt` | off-ledger tamper detection (draft edit E3) |
| `S3_table4_bindings.json` | Table 4 — per-record policy binding + auditor recompute |
| `S3_policy_history.json` | governance registry state |
| `replay.json` | feed for `console/replay.html` (defense, expert briefing, §6 figure) |

## Stack

| Layer | Implementation | Why this and not more |
|---|---|---|
| Ledger | Fabric 2.5 test-network, 2 orgs, 1 channel, unmodified `fabric-samples` | zero network engineering; MSP count is orthogonal to every claim |
| Governed validation | Go chaincode (`chaincode/evidence`) — 4 invariants, policy registry, `active(t)` binding, lineage DAG | the mechanisms under test |
| Off-ledger custody | Node/Express, SHA-256 content addressing, role-gated reads (`payload-store/`) | proves the on/off-ledger split and makes tampering detectable |
| Source systems | 5 virtual adapters + fixtures (`adapters/`) | S1's agnosticism proof: heterogeneous inputs, one validation path |
| Regulator outputs | Node export service (`export/`) — audit pack, passport, tamper test | R6 outputs, generation time |
| Orchestration | bash scenario runners driving the `peer` CLI (`scenarios/`) | no Gateway SDK, no wallets — removes a layer no claim depends on |
| Presentation | `console/replay.html` — replays `results/replay.json` as a live log | defense + expert briefing; reads artifacts, changes nothing |
| Execution env | GitHub Actions workflow + devcontainer, or WSL2 locally | clean-environment runs; artifact completeness gated by `tools/check_artifacts.js` |

## Layout

```
.github/         Actions workflow — full run on a clean Ubuntu runner
.devcontainer/   Codespaces config — Go, Node, Docker, Fabric 2.5
setup/           WSL2 bootstrap (Go, Node, jq, fabric-samples 2.5)
chaincode/       Go chaincode: governed validation, invariants, policy registry
payload-store/   off-ledger payload custody service
adapters/        ERP / MES / TMS-WMS / LIMS / retailer adapters + fixtures
export/          audit pack · passport · tamper test
scenarios/       s0 totality · anchor_v1 · s1 recall · s2 audit · s3 policy · summarize
tools/           binding verification · replay feed · feasibility summary · artifact gate
policies/        policy_v1.md, policy_v2.md (the artifacts whose hashes get anchored)
console/         replay.html
results/         all generated artifacts
docs/            Paper 3 DRAFT edits E1–E3 + example results
results-archive/ permanent copies of cited runs (artifacts expire in 90 days)
```

## Claim → scenario → artifact

| Claim (source) | Scenario | Artifact |
|---|---|---|
| Policy-hash anchoring: totality, immutability, verifiability (P2 §5.1) | S3 + S0 | `S3_table4_bindings.json`, `S0_totality_rejection.txt` |
| Source-system agnosticism (P1 adapters, P2 R5) | S1 | `S1_table3_observed.json` |
| Lineage reconstruction (P1 §3.3) | S1 | `S1_lineage.json` |
| Validation invariants (P1 §3.6) | S1 | two rejection files + T1 conservation check |
| Regulator-ready outputs (P1 §3.8, P2 R6) | S2 | `S2_auditpack.json`, `S2_passport.json` |
| On/off-ledger integrity (P2 R2–R3) | S2 | `S2_verification.txt`, `S2_tamper.txt` |

## Canonical fixtures

**S1 · LOT-C recall** — Create C1 (LOT-A, ERP) → Create C2 (LOT-B, ERP) →
Transform T1 (MES; 600 + 400 → 1000, tolerance 0.5) → Transfer TR1
(TMS/WMS) → Verify V1 (LIMS) → Recall R1 (retailer system).
Negatives: **TR-X** Transfer by a non-custodian → `[custody continuity]`;
**TR2** Transfer after recall → `[recall lock]`.

**S2 · LOT-D audit** — D1 → TD1 → VD1 → TD2 (four events, no recall), then
audit pack + passport + generation time + tamper test.

**S3 · LOT-E policy binding** — S3-R1..R3 under v1.0 → anchor v2.0 → S3-R4..R5
under v2.0; every binding checked against `active(t)` and every policy hash
recomputed from the file on disk.

> Fixture rule / defense note: Paper 1 §3.6 says only the current custodian may
> record a Transfer, while Paper 1 Table 2 lists the Carrier as TR1's actor.
> The chaincode enforces §3.6, so TR1 is submitted by the **Processor** with
> `newCustodian: Carrier`, source system = shipper's TMS/WMS. Rebuttal if
> asked: Table 2's actor column denotes the party responsible for the transport
> leg; the submitting custodian per §3.6 is the processor.

## Instantiation choices to state in the paper

1. Binding uses the **transaction timestamp**, not the client's event time —
   `timestamp` is operational event time, `boundAt` is governance
   applicability time (Paper 2 §5.1 made executable).
2. **Totality is a hard precondition**: with no active policy every submission
   is rejected (S0 demonstrates this).
3. **Immutability by absence**: the chaincode has no update or delete path for
   headers; supersession is prospective via the `AnchorPolicy` ordering rule.
4. **Quantity conservation from a header-level manifest**, so the invariant is
   enforceable without payload disclosure.
5. Actors are logical organizations carried in `actorOrg`, mapped onto the two
   test-network MSPs (draft edit E1).
6. The `peer` CLI replaces the Gateway SDK; transactions are still signed by
   real MSP identities.

## Out of scope (state, don't build)

No UI beyond the replay console · no performance benchmarks (one wall-clock
observation for S2 only) · no Fabric Private Data Collections (off-ledger
custody via the external store; PDCs noted as an alternative instantiation) ·
no live enterprise integrations · no dispute/emergency governance domains
(analytical coverage in Paper 2 Table 5) · no key-management infrastructure ·
no sector schema extensions.

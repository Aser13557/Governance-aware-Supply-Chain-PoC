# Provenance — Track A run 10 (canonical)

The run cited in Глава 5 and in Paper 3. It supersedes runs 1–9, which were
produced by earlier versions of the prototype and must not be cited.

```
run number   : 10
commit       : cc19f99
fabric       : 2.5.9
contract-api : fabric-contract-api-go v1.2.2
runner       : ubuntu-latest (GitHub-hosted)
repository   : https://github.com/Aser13557/Governance-aware-Supply-Chain-PoC
workflow run : https://github.com/Aser13557/Governance-aware-Supply-Chain-PoC/actions/runs/33113337835
date         : 2026-08-27
duration     : 5 min 23 s total (job: 5 min 19 s)
verdicts     : all artifact checks passed (tools/check_artifacts.js)
```

## Artifact integrity

Digests reported by GitHub Actions. The files archived here are the unzipped
contents of both, so these digests allow an independent check that the copies
are what CI produced.

```
track-a-results-10  55 KB  sha256:5fca20c2eea044419d087caf3c5fca96d46e24688b55812861953a64169644fc
track-a-events-10   11 KB  sha256:155c16c37827728b2e9bc058d6db1f30ae5612b2c7083ce4379af25310fd86a6
```

## What this run executed

Six scenarios on a clean, ephemeral environment with no local state: a
two-organization Hyperledger Fabric 2.5.9 test network, the `evidence`
chaincode compiled and committed on both peers, the off-ledger payload store,
and the scenario suite in order.

| Scenario | Demonstrates |
|---|---|
| S0 | totality — with no policy anchored, submission is refused |
| S1 | four source systems through one validation path; custody, consumption and recall-lock rejections; lineage, derived lots, indicators; a recall lifted only by a recorded governance act, after which transfer resumes |
| S2 | audit pack with identity attestations, policy references and indicators; passport; tamper detection; the same evidence exported to EPCIS 2.0 and PROV-O |
| S3 | per-record binding across a policy change, and the change of validation behaviour that binding records |
| S4 | the validation surface: 22 admission checks, each with a rejection carrying that check's own tag |
| S5 | the governance kit: membership, disputes, emergency overrides and three audit-visibility tiers |

## Headline observations

| | |
|---|---|
| anchored evidence headers | 19 |
| admission checks demonstrated | 22 of 22 |
| policy versions anchored | 3 (v1.0, v2.0, and v3.0 scheduled but never in force) |
| organizations admitted, then one suspended | 7 |
| lineage for LOT-C | 7 nodes, 6 edges, origins C1 and C2 |
| indicators | time-to-trace, audit hand-offs, and dispute cycle time all instrumented |
| audit pack payload verification | 7/7 and 4/4 PASS |
| interoperability | every anchored event exported to both vocabularies; the lineage graph is recoverable from either |

## Verifying this run independently

Everything needed is in the repository at commit `cc19f99`.

1. Hash `policies/policy_v1.md` and compare against the `policyHash` of any
   record bound to v1.0; likewise `policy_v2.md` for v2.0 and
   `policy_v3_scheduled.md` for the scheduled version.
2. The machine-readable parameter block inside each policy file is covered by
   that hash, so the tolerance, attestation and membership rules that decided
   each admission are recoverable from the artifact itself.
3. `S3_table4_bindings.json` reports both checks already performed: hash
   recomputation and parameter fidelity across all five parameters.
4. Governance acts reference their rationale by digest only. Hashing the
   rationale text reproduces the value recorded in `S5_membership.json`,
   `S5_dispute.json` and `S5_emergencies.json`.
5. `S2_interop_check.json` confirms that every anchored event appears in both
   the EPCIS and PROV exports; the lineage edges can be reconstructed from
   either document and compared against `S1_lineage.json`.

## Reproducibility statement for Глава 5

> The complete scenario suite was executed end to end on a GitHub-hosted
> `ubuntu-latest` runner against Hyperledger Fabric 2.5.9, from commit
> `cc19f99`, with no local state. A completion gate asserts that every expected
> artifact exists and that its recorded verdict holds, so a partially
> successful run cannot be reported as a complete one. The run log and all
> generated artifacts are archived alongside this record.

## A note on the replay console

`console/replay.html` renders `replay.json` as an animated log of this run. It
is a derived view: every line comes from an artifact in this directory, every
timestamp is one the artifacts record, and where no time is on record none is
shown. The artifacts, not the console, are authoritative.

## Contents of this directory

- the unzipped `track-a-results-10` artifact
- `events/` — every anchored header, from `track-a-events-10`
- `rejections/` — raw peer output and parsed message for each refused submission
- `run-10_workflow-summary_cc19f99_2026-08-27.pdf` — the workflow summary page

Observed values are in `feasibility_summary.md`; the specification mapping is in
`docs/specification-coverage.md`. Actions artifacts expire after 90 days; the
copies here are permanent.

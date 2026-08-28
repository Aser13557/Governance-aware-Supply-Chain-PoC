# Provenance — Track A run 12 (canonical)

The run cited in Глава 5 and in Paper 3. It supersedes runs 1–11, which were
produced by earlier versions of the prototype and must not be cited.

```
run number   : 12
commit       : 2687e4a
fabric       : 2.5.9
contract-api : fabric-contract-api-go v1.2.2
runner       : ubuntu-latest (GitHub-hosted)
repository   : https://github.com/Aser13557/Governance-aware-Supply-Chain-PoC
workflow run : https://github.com/Aser13557/Governance-aware-Supply-Chain-PoC/actions/runs/33194969585
date         : 2026-08-28
duration     : 5 min 22 s total (job: 5 min 18 s)
verdicts     : all artifact checks passed (tools/check_artifacts.js)
               all rendered console lines verified (tools/render_check.js)
```

## Artifact integrity

Digests reported by GitHub Actions for the two artifacts produced by this run.
The files archived here are their unzipped contents, so these digests allow an
independent check that the copies are what CI produced.

```
track-a-results-12  59.6 KB  sha256:4574d55ec8eeaf2779e05b1f45defcdc6617ad5f47fba29effe2f2b1382afc04
track-a-events-12   11 KB    sha256:02ce51331a105743d6d357be36d16afc378e296eae33d21fac1c58d21fd51766
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

## Observed values

| | |
|---|---|
| anchored evidence headers | 19 |
| admission checks demonstrated | 22 of 22 |
| policy versions anchored | 3 — v1.0 (17:33:02Z), v2.0 (17:34:32Z), and v3.0 scheduled but never in force |
| records governed by each version | 16 under v1.0, 3 under v2.0 |
| organizations admitted, then one suspended | 7 |
| lineage for LOT-C | 7 nodes, 6 edges, origins C1 and C2 |
| time-to-trace / audit hand-offs | 7200 s / 4 |
| dispute cycle time | 5 s |
| audit pack verification | 4/4 (LOT-D) and 7/7 (LOT-C) PASS |
| audit pack generation | 560 ms |
| interoperability | 7 events exported to both vocabularies; the lineage graph is recoverable from either |

The timing figures are single observations within one automated run on a
two-organization test network. They show that the indicators are computed from
the evidence, not that they characterise operational performance.

## Verifying this run independently

Everything needed is in the repository at commit `2687e4a`.

1. Hash `policies/policy_v1.md` and compare against the `policyHash` of any
   record bound to v1.0; likewise `policy_v2.md` for v2.0 and
   `policy_v3_scheduled.md` for the scheduled version.
2. The machine-readable parameter block inside each policy file is covered by
   that hash, so the tolerance, attestation and membership rules that decided
   each admission are recoverable from the artifact itself.
3. `S3_table4_bindings.json` reports three checks already performed: binding
   correctness, hash recomputation, and parameter fidelity across all five
   parameters.
4. Governance acts reference their rationale by digest only. Hashing the
   rationale text reproduces the value recorded in `S5_membership.json`,
   `S5_dispute.json` and `S5_emergencies.json`.
5. `S2_interop_check.json` confirms that every anchored event appears in both
   the EPCIS and PROV exports; the lineage edges reconstruct from either
   document and can be compared against `S1_lineage.json`.
6. Each row of `S4_validation_surface.json` names the file holding the
   rejection that demonstrates it; every parsed message appears verbatim inside
   the `.raw.txt` peer output archived beside it.

## Reproducibility statement for Глава 5

> The complete scenario suite was executed end to end on a GitHub-hosted
> `ubuntu-latest` runner against Hyperledger Fabric 2.5.9, from commit
> `2687e4a`, with no local state. Two completion gates run after the scenarios:
> one asserts that every expected artifact exists and that its recorded verdict
> holds, the other reproduces every line the replay console will display and
> traces it to the artifact it reports. A partially successful run therefore
> cannot be reported as a complete one, and the presentation cannot show a value
> the run did not produce. The run log and all generated artifacts are archived
> alongside this record.

## A note on the replay console

`console/replay.html` renders `replay.json` as an animated log of this run. It
is a derived view, and `render_check.txt` records its verification: every line
was reproduced as text and traced to the artifact it reports, so the console
shows no value the run did not produce and no timestamp the artifacts do not
record. Where no time is on record, none is displayed. The artifacts, not the
console, remain authoritative.

## Contents of this directory

- the unzipped `track-a-results-12` artifact
- `events/` — every anchored header, from `track-a-events-12`
- `rejections/` — the raw peer output and the parsed message for each refused
  submission
- `run-12_workflow-summary_2687e4a_2026-08-28.pdf` — the workflow summary page

Observed values are in `feasibility_summary.md`; the mapping from every
normative statement in the two source papers to its implementation and
demonstrating scenario is in `docs/specification-coverage.md`. Actions
artifacts expire after 90 days; the copies here are permanent.

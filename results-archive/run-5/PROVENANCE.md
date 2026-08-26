# Provenance — Track A run 5 (canonical)

The run cited in Глава 5 and in Paper 3. It supersedes runs 1–4, which were
produced by earlier versions of the prototype and must not be cited.

```
run number   : 5
commit       : f56314f
fabric       : 2.5.9
contract-api : fabric-contract-api-go v1.2.2
runner       : ubuntu-latest (GitHub-hosted)
trigger      : manual (workflow_dispatch)
repository   : https://github.com/Aser13557/Governance-aware-Supply-Chain-PoC
workflow run : https://github.com/Aser13557/Governance-aware-Supply-Chain-PoC/actions/runs/33019935840
date         : 2026-08-27
duration     : 4 min 31 s total (job: 4 min 26 s)
verdicts     : all artifact checks passed (tools/check_artifacts.js)
```

## Artifact integrity

Digests reported by GitHub Actions. The files archived here are the unzipped
contents of both, so these digests allow an independent check that the copies
are what CI produced.

```
track-a-results-5  39.6 KB  sha256:6452c53df4c6af03285376136718b72e5a484e5e96a40afcce91e23ab714b62b
track-a-events-5   11 KB    sha256:c0c61d2019b3b226f0a87042818baf0ba768676fdcc85c2ca91b401aabd89bd4
```

## What this run executed

Five scenarios on a clean, ephemeral environment with no local state: a
two-organization Hyperledger Fabric 2.5.9 test network, the `evidence`
chaincode compiled and committed on both peers, the off-ledger payload store,
and the scenario suite in order.

| Scenario | Demonstrates |
|---|---|
| S0 | totality — with no policy anchored, submission is refused |
| S1 | four source systems through one validation path; custody, consumption and recall-lock rejections; lineage, derived lots, indicators; a recall lifted only by a recorded governance act, after which transfer resumes |
| S2 | audit pack with identity attestations, policy references and the model's indicators; passport; tamper detection |
| S3 | per-record binding across a policy change, and the change of validation behaviour that binding records |
| S4 | the full validation surface: 18 admission checks, each with a rejection carrying that check's own tag |

## Verifying this run independently

Everything needed is in the repository at commit `f56314f`.

1. Hash `policies/policy_v1.md` and compare against the `policyHash` of any
   record bound to v1.0; likewise `policies/policy_v2.md` for v2.0.
2. The machine-readable parameter block inside each policy file is covered by
   that hash, so the tolerance and distinct-attestor rule that decided each
   admission are recoverable from the artifact itself.
3. `S3_table4_bindings.json` reports both checks already performed:
   hash recomputation and parameter fidelity.

## Reproducibility statement for Глава 5

> The complete scenario suite was executed end to end on a GitHub-hosted
> `ubuntu-latest` runner against Hyperledger Fabric 2.5.9, from commit
> `f56314f`, with no local state. A completion gate asserts that every expected
> artifact exists and that its recorded verdict holds, so a partially
> successful run cannot be reported as a complete one. The run log and all
> generated artifacts are archived alongside this record.

## Contents of this directory

- the unzipped `track-a-results-5` artifact: `feasibility_summary.md`,
  `S0_*`, `S1_*`, `S2_*`, `S3_*`, `S4_*`, `replay.json`, `policies.ndjson`,
  `run.log`
- `rejections/` — the raw peer output and the parsed message for each of the
  18 refused submissions
- `events/` — the unzipped `track-a-events-5` artifact: every anchored header

Observed values are in `feasibility_summary.md`. Actions artifacts expire after
90 days; the copies here are permanent.

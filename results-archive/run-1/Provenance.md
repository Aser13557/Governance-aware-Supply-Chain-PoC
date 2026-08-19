# Provenance — Track A run 1

Canonical prototype run cited in Глава 5 (Track A, empirical validation).

```
run number   : 1
commit       : a9dbb1f
commit (full): a9dbb1fcd77b727d436b579f882a5ec9c7c89451
fabric       : 2.5.9
contract-api : fabric-contract-api-go v1.2.2
runner       : ubuntu-latest (GitHub-hosted)
repository   : https://github.com/Aser13557/Governance-aware-Supply-Chain-PoC
workflow run : https://github.com/Aser13557/Governance-aware-Supply-Chain-PoC/actions/runs/32221091980
date         : 2026-08-19
verdicts     : all artifact checks passed (tools/check_artifacts.js)
```

## What this run executed

The complete Track A scenario suite on a clean, ephemeral environment with no
local state: a two-organization Hyperledger Fabric 2.5.9 test network, the
`evidence` chaincode compiled and committed on both peers, the off-ledger
payload store, and scenarios S0–S3 including the negative tests.

| Scenario | Demonstrates |
|---|---|
| S0 | Totality — with no policy anchored, every submission is rejected |
| S1 | Source-system agnosticism, lineage reconstruction, custody continuity and recall lock |
| S2 | Regulator-ready audit pack and passport, payload verification, tamper detection |
| S3 | Policy-hash anchoring across a mid-stream governance change |

## Why the run passed the gate

`tools/check_artifacts.js` runs after the scenarios and fails the workflow
unless every artifact exists **and** every verdict holds: each S3 record bound
the policy version active at its submission time, both policy hashes recomputed
from the anchored artifacts, audit-pack payload verification returned all-pass,
the lineage query returned the expected node and edge counts, the tampered
payload failed verification, and each rejection message named its invariant.
A partially successful run therefore cannot be mistaken for a complete one.

## Reproducibility statement for Глава 5

> The complete scenario suite was executed end to end on a GitHub-hosted
> `ubuntu-latest` runner against Hyperledger Fabric 2.5.9, from commit
> `a9dbb1f`, with no local state. The run log and generated artifacts are
> archived alongside this record.

## Contents of this directory

The unzipped `track-a-results-1` artifact. Artifacts expire from GitHub Actions
after 90 days; the copies here are permanent.

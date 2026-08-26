# scenarios - run order and artifact mapping

Order is mandatory. Totality means nothing can be admitted before a policy is
anchored, and the validation-surface scenario depends on state built earlier.

| Script | What it establishes |
|---|---|
| `s0_totality.sh` | with no policy anchored, a submission is refused |
| `anchor_v1.sh` | policy v1.0 anchored with its machine-readable parameters |
| `s1_recall.sh` | four source systems, one validation path; custody, consumption and recall-lock rejections; lineage, descendants, indicators; the recall lifted only by a recorded governance act |
| `s2_audit.sh` | audit pack with identity attestations and indicators; passport; tamper detection |
| `s3_policy.sh` | per-record binding across a policy change, and the change of validation behaviour that binding records |
| `s4_validation.sh` | every remaining admission check, plus the registry's own controls |
| `summarize.sh` | replay feed and the filled sentence stems |

`submit_event <id> [tag]` asserts the outcome: with no tag the submission must
be accepted; with one it must be refused AND carry that exact bracketed tag, so
a rejection for the wrong reason fails the run rather than passing quietly.

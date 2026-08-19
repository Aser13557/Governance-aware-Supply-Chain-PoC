# scenarios (Day 5) — run order + artifact mapping

Order is mandatory (totality): 0? → v1.0 → S1 → S2 → S3.

- `s0_totality.sh` (optional, 5 lines): attempt CreateHeader BEFORE any policy → capture `[totality]` rejection → results/S0_totality_rejection.txt
- `anchor_v1.sh`   : sha256 policy_v1.md → AnchorPolicy v1.0
- `s1_recall.sh`   : C1,C2,T1,TR1,V1,R1 + negatives TR-X (custody) and TR2 (recall lock) → results/S1_table3_observed.json, S1_negative_custody.txt, S1_negative_transfer.txt, S1_lineage.json
- `s2_audit.sh`    : D1,TD1,VD1,TD2 → auditPack + passport + timing; tamper one payload byte → re-verify → results/S2_auditpack.json, S2_passport.json, S2_verification.txt, S2_generation_time.txt, S2_tamper.txt
- `s3_policy.sh`   : S3-R1..R3 under v1.0 → AnchorPolicy v2.0 (effectiveFrom=now) → S3-R4..R5 → dump per-record {submittedAt(boundAt), policyVersion, policyHash} + PolicyHistory recompute check → results/S3_table4_bindings.json
- `summarize.sh`   : assemble results/feasibility_summary.md (§6.4 sentence stems with actual values)

Every artifact name maps 1:1 to a draft table/INSERT — see root README table.

## Replay console feed

`summarize.sh` additionally emits `results/replay.json` in the beat schema
documented in `console/replay.html` (the embedded demo data IS the schema
example). Dropping that file onto the console flips it from DEMO to REAL data
— same playback, actual observed values. Used in: defense presentation,
expert briefing (Track B stimulus), and one screenshot figure for §6.

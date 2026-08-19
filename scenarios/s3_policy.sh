#!/usr/bin/env bash
# S3 — governance policy update with per-record binding. Artifact: results/S3_table4_bindings.json
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
c_head "S3 · policy update and per-record binding (LOT-E)"

c_step "three records under policy v1.0"
switch_org 1; submit_event S3-R1
switch_org 2; submit_event S3-R2
switch_org 2; submit_event S3-R3

c_step "governance change — anchor policy v2.0, effective now"
EF=$(date -u -d '+2 seconds' +%Y-%m-%dT%H:%M:%SZ)
anchor_policy "v2.0" "${ROOT}/policies/policy_v2.md" "$EF"
sleep 3

c_step "two records under policy v2.0"
switch_org 2; submit_event S3-R4
switch_org 1; submit_event S3-R5

c_step "Table 4 — per-record binding verification"
cc_query PolicyHistory | jq '.' > "${RESULTS}/S3_policy_history.json"
node "${ROOT}/tools/verify_bindings.js"

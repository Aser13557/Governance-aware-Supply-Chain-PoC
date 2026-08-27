#!/usr/bin/env bash
# S3 - governance policy update: per-record binding AND the change of
# validation behaviour that the binding records.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
c_head "S3 - policy update, per-record binding and policy-driven behaviour (LOT-E)"

c_step "three records under policy v1.0"
switch_org 1; submit_event S3-R1
switch_org 2; submit_event S3-R2
switch_org 2; submit_event S3-R3

c_step "under v1.0: a 0.4 KG transformation imbalance is within tolerance (0.5)"
switch_org 1; submit_event S3-P1
switch_org 1; submit_event S3-P2
c_ok "accepted under v1.0"

c_step "governance change - anchor policy v2.0"
EF=$(date -u -d '+6 seconds' +%Y-%m-%dT%H:%M:%SZ)
anchor_policy "v2.0" "${ROOT}/policies/policy_v2.md" "$EF" "Org1MSP"
sleep 8

c_step "two records under policy v2.0"
switch_org 2; submit_event S3-R4
switch_org 1; submit_event S3-R5

c_step "under v2.0: the SAME 0.4 KG imbalance now exceeds tolerance (0.25)"
switch_org 1; submit_event S3-P3
switch_org 1; submit_event S3-P4 "quantity conservation"
cp "${RESULTS}/rejections/S3-P4.txt" "${RESULTS}/S3_policy_effect_rejection.txt"

c_step "under v2.0: the custodian may no longer attest to its own lot"
switch_org 2; submit_event N-VERIFY-SELF "verification integrity"
cp "${RESULTS}/rejections/N-VERIFY-SELF.txt" "${RESULTS}/S3_selfattestation_rejection.txt"

c_step "Table III - per-record binding verification"
cc_query PolicyHistory | jq '.' > "${RESULTS}/S3_policy_history.json"
node "${ROOT}/tools/verify_bindings.js"
node "${ROOT}/tools/policy_effect.js"

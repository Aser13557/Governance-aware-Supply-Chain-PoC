#!/usr/bin/env bash
# S4 - validation surface: every remaining admission check exercised once, so
# that no check the chaincode performs is claimed but undemonstrated.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
c_head "S4 - validation surface"

c_step "quantity conservation"
switch_org 1; submit_event N-QTY-TOLERANCE "quantity conservation"
switch_org 1; submit_event N-QTY-AVAILABLE "quantity conservation"
switch_org 1; submit_event N-QTY-UNIT      "quantity conservation"

c_step "verification integrity"
switch_org 2; submit_event N-VERIFY-DIGEST "verification integrity"

c_step "schema, lineage and duplicate suppression"
switch_org 1; submit_event N-SCHEMA-TYPE  "schema"
switch_org 2; submit_event N-PREDECESSOR  "lineage"
switch_org 1; submit_event N-DUPLICATE    "duplicate"

c_step "governance registry controls"
switch_org 2
H=$(sha_file "${ROOT}/policies/policy_v2.md")
P=$(policy_params "${ROOT}/policies/policy_v2.md")
EF=$(date -u -d '+60 seconds' +%Y-%m-%dT%H:%M:%SZ)
expect_gov_reject "N-POLICY-NONADMIN" "change control" AnchorPolicy "v9.9" "$H" "$EF" "$P" "Org1MSP"
switch_org 1
PAST=$(date -u -d '-10 minutes' +%Y-%m-%dT%H:%M:%SZ)
expect_gov_reject "N-POLICY-RETRO" "retroactivity" AnchorPolicy "v9.8" "$H" "$PAST" "$P" "Org1MSP"

# The ordering rule can only be exercised against a validity start that has not
# yet passed: a start in the past is refused as retroactive before ordering is
# ever reached. Scheduling a version ahead of time is itself a registry
# capability worth demonstrating, so v3.0 is anchored for a future date and the
# ordering attempt then tries to undercut it.
c_step "a version may be scheduled ahead of time"
FUTURE=$(date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%SZ)
anchor_policy "v3.0" "${ROOT}/policies/policy_v3_scheduled.md" "$FUTURE" "Org1MSP"
c_ok "still in force now: $(cc_query GetActivePolicy "" | jq -r '.version')"


c_step "and a later anchoring may not undercut a scheduled one"
H3=$(sha_file "${ROOT}/policies/policy_v3_scheduled.md")
P3=$(policy_params "${ROOT}/policies/policy_v3_scheduled.md")
EARLIER=$(date -u -d '+30 minutes' +%Y-%m-%dT%H:%M:%SZ)
expect_gov_reject "N-POLICY-ORDER" "ordering" AnchorPolicy "v9.7" "$H3" "$EARLIER" "$P3" "Org1MSP"

c_step "governance kit: membership, disputes and emergency overrides"
switch_org 2
expect_gov_reject "N-MEMBER-NONADMIN" "change control" AdmitOrganization "Interloper" "$(rationale_digest 'unauthorised admission attempt')"
switch_org 1
cc_invoke SuspendOrganization "Warehouse" "$(rationale_digest 'audit finding: identity controls lapsed')" >/dev/null
sleep 1
c_gov "Warehouse suspended - anchored act, rationale off-ledger"
switch_org 1; submit_event N-MEMBER-SUSPENDED "membership"

switch_org 2
DR=$(rationale_digest 'carrier contests the recorded handover time on TR1')
cc_invoke OpenDispute "DSP-1" "TR1" "$DR" >/dev/null
sleep 1
c_gov "dispute DSP-1 opened over TR1 by a consortium member"
switch_org 2
expect_gov_reject "N-DISPUTE-NONADMIN" "change control" ResolveDispute "DSP-1" "upheld" "$(rationale_digest 'unauthorised resolution attempt')"
sleep 2
switch_org 1
cc_invoke ResolveDispute "DSP-1" "resolved: handover time corrected in the source system; header stands" "$(rationale_digest 'dispute resolution memorandum DSP-1')" >/dev/null
sleep 1
cc_query GetDispute "DSP-1" | jq '.' > "${RESULTS}/S5_dispute.json"
c_ok "dispute resolved; the anchored header was never altered"

c_step "export and query behaviour take dispute state into account"
cc_query GetTraceMetrics LOT-C | jq '.' > "${RESULTS}/S5_trace_metrics_disputed.json"
node "${ROOT}/export/export.js" auditpack LOT-C authority S5
DC=$(jq -r ".disputeCycleSeconds" "${RESULTS}/S5_trace_metrics_disputed.json")
c_ok "dispute cycle time ${DC}s now reported on the lineage that carries the disputed event"

switch_org 1
UNTIL=$(date -u -d '+30 minutes' +%Y-%m-%dT%H:%M:%SZ)
cc_invoke DeclareEmergency "EMG-1" "eventType" "Recall" "$UNTIL" "$(rationale_digest 'board decision 2026-14: recall submissions frozen pending review')" >/dev/null
sleep 1
c_gov "emergency EMG-1 - Recall submissions suspended until $UNTIL"
switch_org 1; submit_event N-EMERGENCY "emergency"
switch_org 1
cc_invoke LiftEmergency "EMG-1" >/dev/null
sleep 1
cc_query EmergencyRegistry | jq '.' > "${RESULTS}/S5_emergencies.json"
cc_query MembershipRegistry | jq '.' > "${RESULTS}/S5_membership.json"
cc_query DisputeRegistry   | jq '.' > "${RESULTS}/S5_disputes.json"
c_ok "governance registries captured"

c_step "audit access: three visibility tiers"
node "${ROOT}/tools/disclosure_tiers.js"

c_step "collecting the validation surface report"
node "${ROOT}/tools/validation_surface.js"

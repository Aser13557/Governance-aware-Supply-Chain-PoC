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
expect_gov_reject "N-POLICY-NONADMIN" "change control" AnchorPolicy "v9.9" "$H" "$EF" "$P"
switch_org 1
PAST=$(date -u -d '-10 minutes' +%Y-%m-%dT%H:%M:%SZ)
expect_gov_reject "N-POLICY-RETRO" "retroactivity" AnchorPolicy "v9.8" "$H" "$PAST" "$P"

# The ordering rule can only be exercised against a validity start that has not
# yet passed: a start in the past is refused as retroactive before ordering is
# ever reached. Scheduling a version ahead of time is itself a registry
# capability worth demonstrating, so v3.0 is anchored for a future date and the
# ordering attempt then tries to undercut it.
c_step "a version may be scheduled ahead of time"
FUTURE=$(date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%SZ)
anchor_policy "v3.0" "${ROOT}/policies/policy_v3_scheduled.md" "$FUTURE"
c_ok "still in force now: $(cc_query GetActivePolicy "" | jq -r '.version')"


c_step "and a later anchoring may not undercut a scheduled one"
H3=$(sha_file "${ROOT}/policies/policy_v3_scheduled.md")
P3=$(policy_params "${ROOT}/policies/policy_v3_scheduled.md")
EARLIER=$(date -u -d '+30 minutes' +%Y-%m-%dT%H:%M:%SZ)
expect_gov_reject "N-POLICY-ORDER" "ordering" AnchorPolicy "v9.7" "$H3" "$EARLIER" "$P3"

c_step "collecting the validation surface report"
node "${ROOT}/tools/validation_surface.js"

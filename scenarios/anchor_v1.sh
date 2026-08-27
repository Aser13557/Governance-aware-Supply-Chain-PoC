#!/usr/bin/env bash
# Anchor the initial governance policy. MUST run before any event (totality).
# effectiveFrom is set slightly ahead of now because the registry refuses a
# validity start earlier than the anchoring transaction's own timestamp.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
c_head "governance - anchor policy v1.0"
EF=$(date -u -d '+6 seconds' +%Y-%m-%dT%H:%M:%SZ)
anchor_policy "v1.0" "${ROOT}/policies/policy_v1.md" "$EF" "Org1MSP"
c_step "waiting for v1.0 to take effect"
sleep 8
cc_query GetActivePolicy "" | jq -c '{version,hash,hashAlgorithm,effectiveFrom,nextAuthority,params}'

c_step "membership - the consortium admits the organizations that may submit"
for o in Producer Processor Carrier Laboratory Retailer Distributor Warehouse; do
  admit_org "$o" "founding consortium member: $o"
done
cc_query MembershipRegistry | jq -r '.[] | "  \(.org)\t\(.status)\t\(.policyVersion)"'
c_ok "7 organizations admitted"

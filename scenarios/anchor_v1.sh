#!/usr/bin/env bash
# Anchor the initial governance policy. MUST run before any event (totality).
# effectiveFrom is set slightly ahead of now because the registry refuses a
# validity start earlier than the anchoring transaction's own timestamp.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
c_head "governance - anchor policy v1.0"
EF=$(date -u -d '+6 seconds' +%Y-%m-%dT%H:%M:%SZ)
anchor_policy "v1.0" "${ROOT}/policies/policy_v1.md" "$EF"
c_step "waiting for v1.0 to take effect"
sleep 8
cc_query GetActivePolicy "" | jq -c '{version,hash,effectiveFrom,params}'

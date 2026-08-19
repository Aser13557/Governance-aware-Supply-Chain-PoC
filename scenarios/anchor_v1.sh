#!/usr/bin/env bash
# Anchor the initial governance policy. MUST run before any event (totality).
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
c_head "governance · anchor policy v1.0"
EF=$(date -u -d '-1 minute' +%Y-%m-%dT%H:%M:%SZ)
anchor_policy "v1.0" "${ROOT}/policies/policy_v1.md" "$EF"
cc_query GetActivePolicy "" | jq -c '{version,hash,effectiveFrom}'

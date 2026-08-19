#!/usr/bin/env bash
# S2 — regulatory audit pack + passport + tamper test. Artifacts: results/S2_*
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
c_head "S2 · regulatory audit (LOT-D)"

c_step "four-event chain: Create (ERP) → Transfer (TMS) → Verify (LIMS) → Transfer (TMS)"
switch_org 1; submit_event D1
switch_org 1; submit_event TD1
switch_org 2; submit_event VD1
switch_org 2; submit_event TD2

c_step "audit pack generation (role: authority)"
node "${ROOT}/export/export.js" auditpack LOT-D authority
c_step "product passport"
node "${ROOT}/export/export.js" passport LOT-D

c_step "tamper test (draft edit E3)"
node "${ROOT}/export/export.js" tamper LOT-D VD1

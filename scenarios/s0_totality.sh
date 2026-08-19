#!/usr/bin/env bash
# S0 — totality precondition: with NO policy anchored, every submission is rejected.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
wait_for_chaincode
c_head "S0 · totality precondition (no policy in force)"
switch_org 1
submit_event C1 "totality" || true
if [ -f "${RESULTS}/rejections/C1.txt" ]; then
  mv "${RESULTS}/rejections/C1.txt" "${RESULTS}/S0_totality_rejection.txt"
  c_ok "captured → results/S0_totality_rejection.txt"
else
  c_bad "no rejection captured — is a policy already anchored? run ./run-all.sh --clean"
fi

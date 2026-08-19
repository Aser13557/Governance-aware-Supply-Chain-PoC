#!/usr/bin/env bash
# S1 — recall investigation. Six events, five logical orgs, four source systems,
#      plus two negative tests. Artifacts: results/S1_*
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
c_head "S1 · recall investigation (LOT-C)"

c_step "chain: two Creates (ERP) → Transform (MES) → Transfer (TMS/WMS) → Verify (LIMS) → Recall"
switch_org 1; submit_event C1
switch_org 1; submit_event C2
switch_org 2; submit_event T1
switch_org 2; submit_event TR1
switch_org 2; submit_event V1

c_step "negative test 1 — Transfer by a non-custodian (expect: custody continuity)"
switch_org 2; submit_event TR-X "custody continuity" || true
[ -f "${RESULTS}/rejections/TR-X.txt" ] && cp "${RESULTS}/rejections/TR-X.txt" "${RESULTS}/S1_negative_custody.txt"

c_step "recall"
switch_org 1; submit_event R1

c_step "negative test 2 — Transfer of a recalled lot (expect: recall lock)"
switch_org 2; submit_event TR2 "recall lock" || true
[ -f "${RESULTS}/rejections/TR2.txt" ] && cp "${RESULTS}/rejections/TR2.txt" "${RESULTS}/S1_negative_transfer.txt"

c_step "lineage reconstruction"
cc_query GetLineageByAsset LOT-C | jq '.' > "${RESULTS}/S1_lineage.json"
N=$(jq -r '.nodeCount' "${RESULTS}/S1_lineage.json"); E=$(jq -r '.edgeCount' "${RESULTS}/S1_lineage.json")
O=$(jq -rc '.originCreates' "${RESULTS}/S1_lineage.json")
c_ok "nodes ${N} · edges ${E} · originCreates ${O} → results/S1_lineage.json"

c_step "Table 3 — observed results, per source system"
jq -s '{scenario:"S1",asset:"LOT-C",events:[.[]|{eventID,eventType,assetID,actorOrg,timestamp,policyVersion,policyHash,payloadHash}]}' \
  "${RESULTS}"/events/{C1,C2,T1,TR1,V1,R1}.json > "${RESULTS}/S1_table3_observed.json"
jq -r '.events[]|"  \(.eventID)\t\(.eventType)\t\(.actorOrg)\t\(.policyVersion)"' "${RESULTS}/S1_table3_observed.json"
c_ok "→ results/S1_table3_observed.json"

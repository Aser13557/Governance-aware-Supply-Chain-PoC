#!/usr/bin/env bash
# S1 - recall investigation across four source systems, with the invariants
# that guard the chain demonstrated positively and negatively, and the recall
# lock shown to be liftable only by governance.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
c_head "S1 - recall investigation (LOT-C)"

c_step "chain: two Creates (ERP) -> Transform (MES) -> Transfer (TMS/WMS) -> Verify (LIMS)"
switch_org 1; submit_event C1
switch_org 1; submit_event C2
switch_org 2; submit_event T1
switch_org 2; submit_event TR1
switch_org 2; submit_event V1

c_step "negative: a lot consumed by the transformation can no longer move"
switch_org 1; submit_event N-CONSUMED "asset"
cp "${RESULTS}/rejections/N-CONSUMED.txt" "${RESULTS}/S1_negative_consumed.txt"

c_step "negative: transfer by a party that is not the current custodian"
switch_org 2; submit_event N-CUSTODY "custody continuity"
cp "${RESULTS}/rejections/N-CUSTODY.txt" "${RESULTS}/S1_negative_custody.txt"

c_step "recall"
switch_org 1; submit_event R1

c_step "negative: transfer of a recalled lot"
switch_org 2; submit_event N-RECALL-TRANSFER "recall lock"
cp "${RESULTS}/rejections/N-RECALL-TRANSFER.txt" "${RESULTS}/S1_negative_transfer.txt"

c_step "negative: transforming a recalled lot out of the recall"
switch_org 2; submit_event N-RECALL-TRANSFORM "recall lock"
cp "${RESULTS}/rejections/N-RECALL-TRANSFORM.txt" "${RESULTS}/S1_negative_transform.txt"

c_step "governance lifts the recall, and only then can the lot move"
switch_org 2
expect_gov_reject "N-CLEAR-NONADMIN" "change control" ClearRecall LOT-C "attempt by a non-admin organization"
switch_org 1
cc_invoke ClearRecall LOT-C "root cause traced to a labelling error; lot released" >/dev/null
sleep 1
cc_query GetRecallStatus LOT-C | jq '.' > "${RESULTS}/S1_recall_status.json"
c_gov "recall cleared -> results/S1_recall_status.json"
switch_org 2; submit_event TR3
c_ok "transfer after clearance accepted - the lock is liftable, not permanent"

c_step "lineage, descendants and trace metrics"
cc_query GetLineageByAsset LOT-C | jq '.' > "${RESULTS}/S1_lineage.json"
cc_query AffectedDescendants LOT-A | jq '.' > "${RESULTS}/S1_descendants.json"
cc_query GetTraceMetrics LOT-C | jq '.' > "${RESULTS}/S1_trace_metrics.json"
N=$(jq -r '.nodeCount' "${RESULTS}/S1_lineage.json"); E=$(jq -r '.edgeCount' "${RESULTS}/S1_lineage.json")
O=$(jq -rc '.originCreates' "${RESULTS}/S1_lineage.json")
D=$(jq -rc '.descendants' "${RESULTS}/S1_descendants.json")
TT=$(jq -r '.timeToTraceSeconds' "${RESULTS}/S1_trace_metrics.json")
HO=$(jq -r '.auditHandoffs' "${RESULTS}/S1_trace_metrics.json")
c_ok "lineage nodes ${N} edges ${E} origins ${O}"
c_ok "descendants of LOT-A: ${D}"
c_ok "time-to-trace ${TT}s - audit hand-offs ${HO}"


c_step "Table III - observed results, per source system"
jq -s '{scenario:"S1",asset:"LOT-C",events:[.[]|{eventID,eventType,assetID,actorOrg,timestamp,boundAt,policyVersion,policyHash,payloadHash,actorSignature}]}' \
  "${RESULTS}"/events/{C1,C2,T1,TR1,V1,R1,TR3}.json > "${RESULTS}/S1_table3_observed.json"
jq -r '.events[]|"  \(.eventID)\t\(.eventType)\t\(.actorOrg)\t\(.policyVersion)"' "${RESULTS}/S1_table3_observed.json"

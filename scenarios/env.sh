#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# env.sh - shared helpers for the scenario runners.
#
# Design note for the paper: the prototype drives the ledger through the `peer`
# CLI rather than the Fabric Gateway SDK. Transactions are still signed by real
# MSP identities - the CLI uses the same credentials - so nothing about the
# evidence or the invariants changes. It removes the wallet/enrolment layer,
# which is not part of any claim under test.
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FABRIC_SAMPLES="${FABRIC_SAMPLES:-$HOME/fabric-samples}"
TN="${FABRIC_SAMPLES}/test-network"
CHANNEL="${CHANNEL:-mychannel}"
CC_NAME="${CC_NAME:-evidence}"
PAYLOAD_URL="${PAYLOAD_URL:-http://localhost:4000}"
RESULTS="${ROOT}/results"
FIX="${ROOT}/adapters/fixtures"

mkdir -p "$RESULTS" "$RESULTS/events" "$RESULTS/rejections"

export PATH="${FABRIC_SAMPLES}/bin:$PATH"
export FABRIC_CFG_PATH="${FABRIC_SAMPLES}/config"
export CORE_PEER_TLS_ENABLED=true

ORDERER_CA="${TN}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"
P1_TLS="${TN}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
P2_TLS="${TN}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"

# Default endorsement on test-network requires BOTH orgs, so every invoke
# targets both peers.
PEER_CONN=(--peerAddresses localhost:7051 --tlsRootCertFiles "$P1_TLS"
           --peerAddresses localhost:9051 --tlsRootCertFiles "$P2_TLS")

c_ok(){   printf '   \033[0;32mPASS\033[0m %s\n' "$1"; }
c_bad(){  printf '   \033[0;31mFAIL\033[0m %s\n' "$1"; }
c_rej(){  printf '   \033[0;33mREJ \033[0m %s\n' "$1"; }
c_gov(){  printf '   \033[1;33mGOV \033[0m %s\n' "$1"; }
c_step(){ printf '\n\033[1;36m> %s\033[0m\n' "$1"; }
c_head(){ printf '\n\033[1;37m==== %s ====\033[0m\n' "$1"; }

# switch_org 1|2 - selects the submitting identity.
switch_org(){
  if [ "$1" = "1" ]; then
    export CORE_PEER_LOCALMSPID=Org1MSP
    export CORE_PEER_TLS_ROOTCERT_FILE="$P1_TLS"
    export CORE_PEER_MSPCONFIGPATH="${TN}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
    export CORE_PEER_ADDRESS=localhost:7051
  else
    export CORE_PEER_LOCALMSPID=Org2MSP
    export CORE_PEER_TLS_ROOTCERT_FILE="$P2_TLS"
    export CORE_PEER_MSPCONFIGPATH="${TN}/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp"
    export CORE_PEER_ADDRESS=localhost:9051
  fi
}

cc_invoke(){
  local fn="$1"; shift
  local ctor; ctor=$(jq -nc --arg f "$fn" '{function:$f,Args:$ARGS.positional}' --args "$@")
  peer chaincode invoke -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com --tls --cafile "$ORDERER_CA" \
    -C "$CHANNEL" -n "$CC_NAME" "${PEER_CONN[@]}" --waitForEvent -c "$ctor" 2>&1
}

cc_query(){
  local fn="$1"; shift
  local ctor; ctor=$(jq -nc --arg f "$fn" '{function:$f,Args:$ARGS.positional}' --args "$@")
  peer chaincode query -C "$CHANNEL" -n "$CC_NAME" -c "$ctor" 2>&1
}

sha_file(){ sha256sum "$1" | cut -d' ' -f1; }

# grab_first <regex> <text> - first match, or empty.
# Runs with errexit and pipefail disabled: grep exits 1 on no match and head
# closes the pipe early (SIGPIPE, 141); under `set -euo pipefail` either would
# abort the script silently, before any diagnostic could be printed.
grab_first(){
  local re="$1" text="$2" out
  set +e +o pipefail
  out=$(printf '%s\n' "$text" | grep -oE "$re" | head -1)
  set -e -o pipefail
  printf '%s' "$out"
}

# clean_message <raw peer output> - the chaincode message, unwrapped.
# Matches to end of line rather than to the first quote: messages embed asset
# identifiers via Go's %q, which peer escapes as \" - a [^"]* pattern truncates
# the message exactly where the substance begins.
clean_message(){
  local out="$1" msg
  msg=$(grab_first '(INVARIANT VIOLATION|REJECTED|GOVERNANCE REJECTION) \[[^]]+\].*' "$out")
  msg="${msg%"${msg##*[![:space:]]}"}"
  msg="${msg%\"}"
  msg="${msg//\\\"/\"}"
  printf '%s' "$msg"
}

# tag_of <message> - the bracketed invariant/condition name.
tag_of(){ grab_first '\[[^]]+\]' "$1"; }

wait_for_chaincode(){
  local i last=""
  switch_org 1
  for i in $(seq 1 20); do
    if last=$(cc_query PolicyHistory 2>&1); then c_ok "chaincode responding"; return 0; fi
    sleep 2
  done
  c_bad "chaincode not confirmed ready after 40s - continuing anyway; last response:"
  printf '%s\n' "$last"
  return 0
}

# store_payload <eventID> - echoes the SHA-256 returned by the payload store.
store_payload(){
  local id="$1" resp hash
  resp=$(curl -sS -X POST "${PAYLOAD_URL}/payload" \
    -H 'Content-Type: application/json' \
    --data-binary "@${FIX}/${id}.payload.json") || {
      c_bad "payload store unreachable at ${PAYLOAD_URL} while storing ${id}"; return 1; }
  hash=$(printf '%s' "$resp" | jq -r '.hash // empty')
  if ! [[ "$hash" =~ ^[0-9a-f]{64}$ ]]; then
    c_bad "payload store returned no usable digest for ${id}: ${resp}"; return 1
  fi
  printf '%s' "$hash"
}

# ---------------------------------------------------------------------------
# submit_event <eventID> [expectedTag]
#
# With no expectedTag the submission must be accepted. With one, it must be
# rejected AND the rejection must carry that exact bracketed tag: a rejection
# for the wrong reason is a failure, not a pass. That distinction is what makes
# the negative results evidence of a specific invariant rather than evidence
# that something went wrong.
# ---------------------------------------------------------------------------
submit_event(){
  local id="$1" expect="${2:-}"
  local hash header out rc msg tag

  if [ -f "${FIX}/${id}.forcehash" ]; then
    hash=$(cat "${FIX}/${id}.forcehash")          # deliberately malformed digest
  else
    hash=$(store_payload "$id")
  fi
  header=$(jq -c --arg h "$hash" '. + {payloadHash:$h}' "${FIX}/${id}.header.json")

  set +e
  out=$(cc_invoke CreateHeader "$header"); rc=$?
  set -e

  if [ $rc -eq 0 ] && ! grep -qE 'INVARIANT VIOLATION|REJECTED|GOVERNANCE REJECTION' <<<"$out"; then
    if [ -n "$expect" ]; then
      c_bad "$id ACCEPTED but a rejection tagged [$expect] was required"; return 1
    fi
    sleep 1
    cc_query GetHeader "$id" | jq '.' > "${RESULTS}/events/${id}.json"
    local pv ph
    pv=$(jq -r '.policyVersion' "${RESULTS}/events/${id}.json")
    ph=$(jq -r '.policyHash' "${RESULTS}/events/${id}.json")
    c_ok "$id anchored - payload ${hash:0:12}... - bound ${pv} ${ph:0:12}..."
    return 0
  fi

  printf '%s\n' "$out" > "${RESULTS}/rejections/${id}.raw.txt"
  msg=$(clean_message "$out")
  [ -z "$msg" ] && msg="$out"
  printf '%s\n' "$msg" > "${RESULTS}/rejections/${id}.txt"

  if [ -z "$expect" ]; then
    c_bad "$id UNEXPECTED FAILURE (exit ${rc})"
    printf '\033[0;31m%s\033[0m\n' "----- raw peer output for ${id} -----"
    printf '%s\n' "$out"
    printf '\033[0;31m%s\033[0m\n' "-------------------------------------"
    return 1
  fi

  tag=$(tag_of "$msg")
  if [ "$tag" != "[$expect]" ]; then
    c_bad "$id rejected, but tagged ${tag:-<none>} instead of [$expect]"
    printf '%s\n' "$msg"
    return 1
  fi
  c_rej "$id rejected as designed ${tag}"
  printf '   %s\n' "$msg"
  return 0
}

# policy_params <policyFile> - the machine-readable block, which the anchored
# hash covers, so registry parameters remain verifiable against the policy text.
policy_params(){
  local f="$1" p
  set +e +o pipefail
  p=$(sed -n '/```json/,/```/p' "$f" | grep '^{' | head -1)
  set -e -o pipefail
  printf '%s' "$p"
}

# anchor_policy <version> <policyFile> <effectiveFrom>
anchor_policy(){
  local v="$1" f="$2" ef="$3" next="${4:-Org1MSP}" h params
  h=$(sha_file "$f")
  params=$(policy_params "$f")
  if [ -z "$params" ]; then c_bad "no machine-readable parameters found in $f"; return 1; fi
  switch_org 1                       # anchoring is restricted to the designated authority
  cc_invoke AnchorPolicy "$v" "$h" "$ef" "$params" "$next" >/dev/null
  sleep 1
  c_gov "policy $v anchored - sha256 ${h:0:12}... - effectiveFrom $ef - params $params"
  jq -nc --arg v "$v" --arg h "$h" --arg ef "$ef" --arg f "$(basename "$f")" --argjson p "$params" \
    '{version:$v,hash:$h,effectiveFrom:$ef,file:$f,params:$p}' >> "${RESULTS}/policies.ndjson"
}

# digest of an off-ledger governance rationale. Governance acts reference their
# rationale by digest; the document itself never goes on-ledger.
rationale_digest(){ printf '%s' "$1" | sha256sum | cut -d" " -f1; }

# admit_org <name> <rationale text>
admit_org(){
  switch_org 1
  cc_invoke AdmitOrganization "$1" "$(rationale_digest "$2")" >/dev/null
  sleep 1
}

# expect_gov_reject <label> <expectedTag> <fn> [args...]
# For governance operations that must be refused. Captures the message under
# results/rejections/<label>.txt and asserts the tag.
expect_gov_reject(){
  local label="$1" expect="$2"; shift 2
  local out rc msg tag
  set +e
  out=$(cc_invoke "$@"); rc=$?
  set -e
  printf '%s\n' "$out" > "${RESULTS}/rejections/${label}.raw.txt"
  msg=$(clean_message "$out")
  [ -z "$msg" ] && msg="$out"
  printf '%s\n' "$msg" > "${RESULTS}/rejections/${label}.txt"
  if [ $rc -eq 0 ] && ! grep -qE 'INVARIANT VIOLATION|REJECTED|GOVERNANCE REJECTION' <<<"$out"; then
    c_bad "$label ACCEPTED but a rejection tagged [$expect] was required"; return 1
  fi
  tag=$(tag_of "$msg")
  if [ "$tag" != "[$expect]" ]; then
    c_bad "$label rejected, but tagged ${tag:-<none>} instead of [$expect]"
    printf '%s\n' "$msg"; return 1
  fi
  c_rej "$label rejected as designed ${tag}"
  printf '   %s\n' "$msg"
  return 0
}

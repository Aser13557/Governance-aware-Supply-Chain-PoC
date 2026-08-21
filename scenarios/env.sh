#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# env.sh — shared helpers for the scenario runners.
#
# Design note for the paper: the prototype drives the ledger through the
# `peer` CLI rather than the Fabric Gateway SDK. Transactions are still signed
# by real MSP identities — the CLI uses the same credentials — so nothing about
# the evidence or the invariants changes. It removes the wallet/enrolment layer,
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

mkdir -p "$RESULTS"

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

c_ok(){   printf '   \033[0;32m✓\033[0m %s\n' "$1"; }
c_bad(){  printf '   \033[0;31m✗\033[0m %s\n' "$1"; }
c_gov(){  printf '   \033[1;33m⟐\033[0m %s\n' "$1"; }
c_step(){ printf '\n\033[1;36m▸ %s\033[0m\n' "$1"; }
c_head(){ printf '\n\033[1;37m════ %s ════\033[0m\n' "$1"; }

# switch_org 1|2 — selects the submitting identity.
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

# cc_invoke <fn> [args...]  → stdout: peer output; non-zero on chaincode rejection
cc_invoke(){
  local fn="$1"; shift
  local ctor; ctor=$(jq -nc --arg f "$fn" '{function:$f,Args:$ARGS.positional}' --args "$@")
  peer chaincode invoke -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com --tls --cafile "$ORDERER_CA" \
    -C "$CHANNEL" -n "$CC_NAME" "${PEER_CONN[@]}" --waitForEvent -c "$ctor" 2>&1
}

# cc_query <fn> [args...] → stdout: JSON result
cc_query(){
  local fn="$1"; shift
  local ctor; ctor=$(jq -nc --arg f "$fn" '{function:$f,Args:$ARGS.positional}' --args "$@")
  peer chaincode query -C "$CHANNEL" -n "$CC_NAME" -c "$ctor" 2>&1
}

# sha256 of a file, portable
sha_file(){ sha256sum "$1" | cut -d' ' -f1; }

# store_payload <eventID> → echoes the SHA-256 returned by the payload store.
# Validates the digest: an empty or malformed hash would otherwise be injected
# into the header and surface later as a confusing [schema] rejection.
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

# grab_first <regex> <text> — first match, or empty. Deliberately runs with
# errexit and pipefail disabled: `grep` exits 1 when it finds nothing, and
# `head -1` closes the pipe early, which makes grep exit 141 (SIGPIPE). Under
# `set -euo pipefail` either outcome aborts the script silently, before any
# diagnostic is printed. That masking is what hid the real error in run #2.
grab_first(){
  local re="$1" text="$2" out
  set +e +o pipefail
  out=$(printf '%s\n' "$text" | grep -oE "$re" | head -1)
  set -e -o pipefail
  printf '%s' "$out"
}

# wait_for_chaincode — the chaincode container starts lazily on first use.
# Poll until it answers before the scenarios begin.
#
# Two things this must get right: it needs a signing identity (peer queries
# fail without CORE_PEER_MSPCONFIGPATH, so switch_org comes first), and it must
# never abort the run — a readiness probe that blocks the scenarios it protects
# is worse than no probe, so a timeout warns and continues.
wait_for_chaincode(){
  local i last=""
  switch_org 1
  for i in $(seq 1 20); do
    if last=$(cc_query PolicyHistory 2>&1); then c_ok "chaincode responding"; return 0; fi
    sleep 2
  done
  c_bad "chaincode not confirmed ready after 40s — continuing anyway; last response:"
  printf '%s\n' "$last"
  return 0
}

# submit_event <eventID> [expectReject]
#   1. store payload off-ledger        → digest
#   2. inject digest into the header   → the on/off-ledger binding
#   3. CreateHeader on the ledger      → invariants + policy binding
#   4. re-query the bound header       → captured for the results tables
# Writes results/events/<id>.json on success, or the rejection text on failure.
submit_event(){
  local id="$1" expect="${2:-}"
  local hash header out rc
  mkdir -p "${RESULTS}/events" "${RESULTS}/rejections"

  hash=$(store_payload "$id")
  header=$(jq -c --arg h "$hash" '. + {payloadHash:$h}' "${FIX}/${id}.header.json")

  set +e
  out=$(cc_invoke CreateHeader "$header"); rc=$?
  set -e

  if [ $rc -eq 0 ] && ! grep -qE 'INVARIANT VIOLATION|REJECTED|GOVERNANCE REJECTION' <<<"$out"; then
    if [ -n "$expect" ]; then
      c_bad "$id UNEXPECTEDLY ACCEPTED — expected rejection [$expect]"; return 1
    fi
    sleep 1
    cc_query GetHeader "$id" | jq '.' > "${RESULTS}/events/${id}.json"
    local pv ph
    pv=$(jq -r '.policyVersion' "${RESULTS}/events/${id}.json")
    ph=$(jq -r '.policyHash' "${RESULTS}/events/${id}.json")
    c_ok "$id anchored · payload ${hash:0:12}… · bound ${pv} · ${ph:0:12}…"
  else
    local msg
    # Always keep the raw peer output — if the failure is infrastructural
    # rather than a chaincode rejection, this is the only record of it.
    printf '%s\n' "$out" > "${RESULTS}/rejections/${id}.raw.txt"
    # Match to end of line, not up to the first quote: chaincode messages embed
    # asset IDs via Go's %q, which peer escapes as \" — a [^"]* pattern truncates
    # the message at the first backslash, exactly where the substance begins.
    msg=$(grab_first '(INVARIANT VIOLATION|REJECTED|GOVERNANCE REJECTION) \[[^]]+\].*' "$out")
    msg="${msg%"${msg##*[![:space:]]}"}"   # trim trailing whitespace
    msg="${msg%\"}"                        # drop peer's closing quote
    msg="${msg//\\\"/\"}"                  # unescape embedded quotes
    [ -z "$msg" ] && msg="$out"
    printf '%s\n' "$msg" > "${RESULTS}/rejections/${id}.txt"
    if [ -n "$expect" ]; then
      c_bad "$id rejected as designed → $msg"
    else
      c_bad "$id UNEXPECTED FAILURE (exit ${rc})"
      printf '\033[0;31m%s\033[0m\n' "----- raw peer output for ${id} -----"
      printf '%s\n' "$out"
      printf '\033[0;31m%s\033[0m\n' "-------------------------------------"
      return 1
    fi
  fi
}

# anchor_policy <version> <policyFile> <effectiveFrom>
anchor_policy(){
  local v="$1" f="$2" ef="$3" h
  h=$(sha_file "$f")
  switch_org 1                       # AnchorPolicy is admin-only (Org1MSP)
  cc_invoke AnchorPolicy "$v" "$h" "$ef" >/dev/null
  sleep 1
  c_gov "policy $v anchored · sha256 ${h:0:12}… · effectiveFrom $ef"
  jq -n --arg v "$v" --arg h "$h" --arg ef "$ef" --arg f "$(basename "$f")" \
    '{version:$v,hash:$h,effectiveFrom:$ef,file:$f}' >> "${RESULTS}/policies.ndjson"
}

#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# run-all.sh — full Track A run, start to finish.
#
#   ./run-all.sh            run everything (brings the network up if it is down)
#   ./run-all.sh --clean    tear the network down first, then run from zero
#   ./run-all.sh --down     tear everything down and exit
#
# Ledger state cannot be reset in place, so a repeatable run means a clean
# network. Every artifact lands in results/.
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FABRIC_SAMPLES="${FABRIC_SAMPLES:-$HOME/fabric-samples}"
TN="${FABRIC_SAMPLES}/test-network"
CHANNEL="${CHANNEL:-mychannel}"
CC_NAME="${CC_NAME:-evidence}"
export FABRIC_SAMPLES CHANNEL CC_NAME
export PATH="${FABRIC_SAMPLES}/bin:/usr/local/go/bin:$HOME/go/bin:$PATH"

say(){ printf '\n\033[1;33m══ %s\033[0m\n' "$1"; }
ok(){  printf '   \033[0;32m✓\033[0m %s\n' "$1"; }
die(){ printf '   \033[0;31m✗ %s\033[0m\n' "$1"; exit 1; }

PS_PID=""
cleanup(){ [ -n "$PS_PID" ] && kill "$PS_PID" 2>/dev/null || true; }
trap cleanup EXIT

# ── preflight ──────────────────────────────────────────────────────────────
[ -d "$TN" ] || die "fabric-samples not found at ${FABRIC_SAMPLES} — run setup/wsl-bootstrap.sh"
for c in docker jq node go curl; do command -v "$c" >/dev/null || die "missing: $c — run setup/wsl-bootstrap.sh"; done
docker version >/dev/null 2>&1 || die "Docker daemon unreachable — start Docker Desktop and enable WSL integration"
case "$ROOT" in /mnt/c/*|/mnt/d/*) printf '\033[0;31m   ! repo is on a Windows drive — move it to ~/ or Fabric will fail on permissions\033[0m\n';; esac

if [ "${1:-}" = "--down" ]; then
  say "tearing down"; (cd "$TN" && ./network.sh down); ok "network down"; exit 0
fi
if [ "${1:-}" = "--clean" ]; then
  say "clean start"; (cd "$TN" && ./network.sh down) || true
  rm -rf "${ROOT}/results" "${ROOT}/payload-store/data"; mkdir -p "${ROOT}/results"; ok "state cleared"
fi

# ── 1. network ─────────────────────────────────────────────────────────────
say "1/6  Fabric test network"
if docker ps --format '{{.Names}}' | grep -q '^peer0.org1.example.com$'; then
  ok "already running"
else
  (cd "$TN" && ./network.sh up createChannel -c "$CHANNEL" -ca)
  ok "2 orgs · channel ${CHANNEL}"
fi

# ── 2. chaincode ───────────────────────────────────────────────────────────
say "2/6  chaincode"
cd "${ROOT}/chaincode/evidence"
go mod tidy >/dev/null 2>&1 || die "go mod tidy failed — check network access"
go vet ./... >/dev/null 2>&1 || die "chaincode does not compile — paste the output of 'go build ./...' for a fix"
go mod vendor >/dev/null 2>&1        # self-contained build inside the CC container
ok "compiles · dependencies vendored"
if (cd "$TN" && peer lifecycle chaincode querycommitted -C "$CHANNEL" -n "$CC_NAME" >/dev/null 2>&1); then
  ok "already deployed"
else
  (cd "$TN" && ./network.sh deployCC -ccn "$CC_NAME" -ccp "${ROOT}/chaincode/evidence" -ccl go -c "$CHANNEL")
  ok "deployed as '${CC_NAME}'"
fi

# ── 3. payload store ───────────────────────────────────────────────────────
say "3/6  off-ledger payload store"
cd "${ROOT}/payload-store"
[ -d node_modules ] || npm install --silent
node server.js > "${ROOT}/results/payload-store.log" 2>&1 &
PS_PID=$!
for i in $(seq 1 20); do curl -sf http://localhost:4000/health >/dev/null && break || sleep 0.5; done
curl -sf http://localhost:4000/health >/dev/null || die "payload store did not start — see results/payload-store.log"
ok "listening on :4000"

# ── 4. fixtures ────────────────────────────────────────────────────────────
say "4/6  adapters and fixtures"
cd "$ROOT" && node adapters/build-fixtures.js | head -1
ok "17 events across 5 source systems"

# ── 5. scenarios ───────────────────────────────────────────────────────────
say "5/6  scenarios"
cd "$ROOT"
bash scenarios/s0_totality.sh
bash scenarios/anchor_v1.sh
bash scenarios/s1_recall.sh
bash scenarios/s2_audit.sh
bash scenarios/s3_policy.sh

# ── 6. summarize ───────────────────────────────────────────────────────────
say "6/6  artifacts"
bash scenarios/summarize.sh

cat <<EOF

\033[1;32m════ run complete ════\033[0m
  artifacts   : ${ROOT}/results/
  paper text  : results/feasibility_summary.md
  console feed: results/replay.json  → drop onto console/replay.html

  stop the network:  ./run-all.sh --down
EOF

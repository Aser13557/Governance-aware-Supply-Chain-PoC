#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# wsl-bootstrap.sh — one-time toolchain setup inside WSL2 Ubuntu.
# Idempotent: re-run safely; anything already installed is skipped.
# ---------------------------------------------------------------------------
set -euo pipefail

GO_VER=1.21.13
FABRIC_VER=2.5.9
CA_VER=1.5.13
SAMPLES_DIR="${HOME}/fabric-samples"

say(){ printf '\n\033[1;33m== %s\033[0m\n' "$1"; }
ok(){  printf '   \033[0;32m✓\033[0m %s\n' "$1"; }
die(){ printf '   \033[0;31m✗ %s\033[0m\n' "$1"; exit 1; }

say "1/5  base packages"
sudo apt-get update -qq
sudo apt-get install -y -qq curl git jq unzip dos2unix build-essential ca-certificates
ok "curl git jq unzip dos2unix"

say "2/5  Docker reachable from WSL"
command -v docker >/dev/null || die "docker not found — install Docker Desktop on Windows and enable WSL Integration for this distro"
docker version >/dev/null 2>&1 || die "Docker daemon unreachable — start Docker Desktop, then re-run"
ok "$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo running)"

say "3/5  Go ${GO_VER}"
if command -v go >/dev/null && go version | grep -q "go1.2[1-9]"; then
  ok "$(go version)"
else
  curl -sSL "https://go.dev/dl/go${GO_VER}.linux-amd64.tar.gz" -o /tmp/go.tgz
  sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf /tmp/go.tgz && rm /tmp/go.tgz
  grep -q '/usr/local/go/bin' "${HOME}/.bashrc" || \
    echo 'export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin' >> "${HOME}/.bashrc"
  export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin
  ok "$(go version)"
fi

say "4/5  Node.js 20"
if command -v node >/dev/null && [ "$(node -v | cut -c2-3)" -ge 18 ] 2>/dev/null; then
  ok "node $(node -v)"
else
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >/dev/null
  sudo apt-get install -y -qq nodejs
  ok "node $(node -v)"
fi

say "5/5  fabric-samples + Fabric ${FABRIC_VER} binaries and images"
if [ -d "${SAMPLES_DIR}/test-network" ]; then
  ok "already present at ${SAMPLES_DIR}"
else
  cd "${HOME}"
  curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
  chmod +x install-fabric.sh
  ./install-fabric.sh --fabric-version "${FABRIC_VER}" --ca-version "${CA_VER}" docker samples binary
  ok "installed to ${SAMPLES_DIR}"
fi

[ -x "${SAMPLES_DIR}/test-network/network.sh" ] || die "test-network missing — re-run install-fabric.sh"
"${SAMPLES_DIR}/bin/peer" version >/dev/null 2>&1 && ok "peer CLI works"

cat <<EOF

\033[1;32mBootstrap complete.\033[0m
  fabric-samples : ${SAMPLES_DIR}
  next           : cd $(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd) && ./run-all.sh

If 'go' is not found in a new shell, run:  source ~/.bashrc
EOF

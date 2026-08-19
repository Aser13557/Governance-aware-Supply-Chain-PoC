#!/usr/bin/env bash
# Pulls Fabric 2.5 binaries, Docker images and fabric-samples into the codespace.
# Runs once at container creation; cached in the codespace image afterwards.
set -euo pipefail
cd "$HOME"
if [ -d fabric-samples/test-network ]; then echo "fabric-samples already present"; exit 0; fi
curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
chmod +x install-fabric.sh
./install-fabric.sh --fabric-version 2.5.9 --ca-version 1.5.13 docker samples binary
echo 'export PATH=$PATH:$HOME/fabric-samples/bin' >> "$HOME/.bashrc"
echo 'export FABRIC_CFG_PATH=$HOME/fabric-samples/config' >> "$HOME/.bashrc"
echo "fabric-samples ready at $HOME/fabric-samples"

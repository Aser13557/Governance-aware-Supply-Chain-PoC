# Running the Track A prototype on Windows 11

Hyperledger Fabric does not run natively on Windows. The whole stack runs
**inside WSL2 (Ubuntu)** — that is the supported path and the one this repo is
written for. You edit files in VS Code on Windows; everything executes in
Linux.

Total setup: ~60–90 minutes, most of it downloads.

---

## Step 1 — WSL2 + Ubuntu (PowerShell as Administrator)

```powershell
wsl --install -d Ubuntu-22.04
```

Reboot if prompted. Launch **Ubuntu** from the Start menu, create your Linux
username and password. Verify you are on version 2:

```powershell
wsl -l -v      # Ubuntu-22.04 must show VERSION 2
```

## Step 2 — Docker Desktop

Install Docker Desktop for Windows, then in **Settings → General** enable
*Use the WSL 2 based engine*, and in **Settings → Resources → WSL Integration**
enable your **Ubuntu-22.04** distro. Apply & restart.

Give it room — Fabric runs ~8 containers. Create `C:\Users\<you>\.wslconfig`:

```ini
[wsl2]
memory=8GB
processors=4
```

Then `wsl --shutdown` in PowerShell and reopen Ubuntu. Verify **inside Ubuntu**:

```bash
docker version && docker compose version
```

## Step 3 — Toolchain (inside Ubuntu)

```bash
cd ~
# copy this repo into WSL first — see the warning below
bash fabric-poc/setup/wsl-bootstrap.sh
```

The script installs Go 1.21, Node 20, jq, curl, git, then downloads
`fabric-samples` with Fabric **2.5** binaries and Docker images, and verifies
each one. Re-runnable; it skips anything already present.

## Step 4 — Run everything

```bash
cd ~/fabric-poc
./run-all.sh
```

That brings up the test network, deploys the chaincode, starts the payload
store, executes S1–S3 with the negative tests, and writes every artifact into
`results/` — including `replay.json` for the console.

---

## The four ways this breaks on Windows

**1. Repo stored on the C: drive.** If the project lives under `/mnt/c/...`,
Fabric's scripts fail on file permissions and run ~10× slower. **Keep the repo
in the Linux filesystem** (`~/fabric-poc`). Open it from Windows via VS Code's
*WSL* extension, or browse to `\\wsl$\Ubuntu-22.04\home\<you>\fabric-poc`.

**2. CRLF line endings.** Windows-edited `.sh` files fail with
`bad interpreter: No such file or directory`. Fix:

```bash
sudo apt install -y dos2unix && find ~/fabric-poc -name "*.sh" -exec dos2unix {} \;
git config --global core.autocrlf input
```

**3. Chaincode build has no network.** Fabric builds Go chaincode in a
container that must fetch modules. Vendor them once so the build is
self-contained — `run-all.sh` does this automatically:

```bash
cd ~/fabric-poc/chaincode/evidence && go mod tidy && go mod vendor
```

**4. Docker not started / WSL integration off.** `Cannot connect to the Docker
daemon` means Docker Desktop isn't running on Windows or the Ubuntu distro
isn't ticked in WSL Integration. Both must be true every session.

---

## Getting the repo into WSL

From Ubuntu, with the zip in your Windows Downloads folder:

```bash
cd ~ && cp /mnt/c/Users/<YourWindowsUser>/Downloads/fabric-poc.zip .
unzip fabric-poc.zip && cd fabric-poc && find . -name "*.sh" -exec chmod +x {} \;
```

## Reset between runs

```bash
cd ~/fabric-poc && ./run-all.sh --clean     # tears the network down and starts fresh
```

Ledger state is not resettable in place — a clean run is the only way to
re-execute a scenario from zero, which is also why the scenarios are designed
to run start-to-finish in one pass.

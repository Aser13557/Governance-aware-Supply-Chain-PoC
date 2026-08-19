# Running without installing anything

Two cloud paths, both free, neither requires WSL2, Docker, or Ubuntu on your PC.
Use them together: **Codespaces to build and debug, Actions for the official
run that produces citable artifacts.**

---

## Path A — GitHub Actions (the official run)

Best for producing the artifacts cited in Гл. 5. Fully automated, ~15 minutes,
and the run log itself is reproducibility evidence.

1. Create a GitHub account (free) and a new repository.
2. Upload the contents of this repo — drag the unzipped folder onto the
   repository page's "uploading an existing file" link, or use GitHub Desktop.
   The `.github/workflows/track-a.yml` file must be at the repository root.
3. Open the **Actions** tab → **Track A — prototype run** → **Run workflow**.
4. Wait ~15 minutes. The run summary shows the filled §6.4 sentences directly
   on the page.
5. Download **`track-a-results-N`** from the Artifacts section. That zip is
   your `results/` folder.

Cost: public repositories get unlimited free runner minutes. Private
repositories on the free plan get 2,000 Linux minutes per month — roughly 130
runs of this workflow.

What the workflow does: installs Fabric 2.5, compiles the chaincode, brings up
the test network, runs S0–S3 with the negative tests, verifies every artifact
exists **and** that its verdicts hold (`tools/check_artifacts.js`), then tears
the network down. If any artifact is missing or any verdict is false, the run
fails red — a partial run can never be mistaken for a complete one.

### For the dissertation

A CI run supports a claim a laptop run cannot:

> The complete scenario suite executes end-to-end in a clean, publicly
> documented environment (GitHub-hosted `ubuntu-latest` runner, Hyperledger
> Fabric 2.5.9), with no local state. Run logs and generated artifacts are
> archived per execution.

Record in Гл. 5: the run number, the commit hash, and the Fabric version — all
three appear in the workflow summary. Archive the artifact zip alongside the
dissertation appendix.

---

## Path B — GitHub Codespaces (when you need a terminal)

Best for debugging a failure, or making changes and re-running quickly.

1. In your repository: **Code ▾ → Codespaces → Create codespace on main**.
2. Wait ~5 minutes for first creation (`.devcontainer/` installs Go, Node,
   Docker, and Fabric 2.5 automatically).
3. In the terminal: `./run-all.sh`

You get full VS Code in the browser, a real Linux terminal, and the repo on a
Linux filesystem. Free tier: 120 core-hours per month — about 60 hours on the
2-core machine, or 30 on the 4-core machine this devcontainer requests.

Stop the codespace when you're done (**Codespaces → ⋯ → Stop**); stopped
codespaces don't consume compute hours, only storage.

---

## Viewing the results on Windows

`console/replay.html` is a plain file — double-click it on Windows, no Linux
involved. Drag `replay.json` from the downloaded artifact zip onto the footer
bar and the console replays your actual run: the badge flips from DEMO to REAL
DATA and every value shown is the one your prototype produced.

---

## Which to use

| | Actions | Codespaces | WSL2 (local) |
|---|---|---|---|
| Installs on your PC | nothing | nothing | ~60 min setup |
| Interactive terminal | no | yes | yes |
| Free allowance | unlimited (public repos) | 60 h/month | unlimited |
| Produces citable run log | yes | no | no |
| Works offline | no | no | yes |

Recommended order: Actions first. If it goes green on the first try, you never
need the other two.

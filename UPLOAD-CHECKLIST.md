# Uploading this repo to GitHub — read first

The GitHub web uploader **silently skips folders whose names begin with a dot**.
This repo has two of them, and one is essential:

| Folder | Contains | If missing |
|---|---|---|
| `.github/` | the Actions workflow | **nothing runs at all** — the Actions tab stays empty and no error is shown |
| `.devcontainer/` | Codespaces config | Codespaces works but installs nothing automatically |
| `.gitignore` | ignore rules | build artifacts get committed |

## Recommended order

1. **Create the repository.** Public (unlimited free Actions minutes). Leave
   "Add README", ".gitignore" and "license" **off** — this repo brings its own.

2. **Upload everything except the dot-folders.**
   *Add file → Upload files*, drag the contents of `fabric-poc/` (the files
   **inside** the folder, not the folder itself). Commit.

3. **Create the workflow by hand** — this is the step that matters.
   *Add file → Create new file*, and type this exact filename:

   ```
   .github/workflows/track-a.yml
   ```

   Typing the slashes creates the folders. Paste the contents of
   `.github/workflows/track-a.yml` from this package. Commit.

   The commit triggers the first run automatically.

4. **Optional, same method:** `.gitignore`, and
   `.devcontainer/devcontainer.json` + `.devcontainer/install-fabric.sh`.

## Verify before waiting on a run

- The repo root file list shows `.github` (dot-folders sort first, above `adapters`)
- The **Actions** tab shows *Track A — prototype run*
- The sidebar no longer suggests "Suggested workflows" (that panel only appears
  when a repo has zero workflows)

## Committing several files without triggering a run each time

Put `[skip ci]` anywhere in the commit message and Actions will ignore that
commit. Useful when landing a multi-file change; leave it off the last commit.

## Before you cite a run in the dissertation

Actions artifacts expire after 90 days. Once a run is green, download
`track-a-results-N` and commit it back under `results-archive/run-N/`, or attach
it to a tagged Release, so the evidence has a permanent URL. Record the run
number, the commit hash, and the Fabric version — all three appear on the
workflow summary page.

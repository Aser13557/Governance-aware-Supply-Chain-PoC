# results-archive

GitHub Actions artifacts are deleted after 90 days. Any run cited in the
dissertation is copied here so the evidence has a permanent URL.

## For each cited run

Create `run-<N>/` containing:

- the unzipped contents of the `track-a-results-<N>` artifact
- a `PROVENANCE.md` recording where the run came from

## PROVENANCE.md template

Copy this and fill in the bracketed values — all of them are visible on the
workflow run page:

```
run number   : [N — the number beside the run title, e.g. 1]
commit       : [7-character hash shown on the run page]
fabric       : 2.5.9
runner       : ubuntu-latest (GitHub-hosted)
workflow run : [full URL of the run page from the address bar]
date         : [YYYY-MM-DD of the run]
verdicts     : all artifact checks passed (tools/check_artifacts.js)
```

Those seven lines are the reproducibility statement for Глава 5. The commit
hash is the important one: it pins the exact source that produced the results,
so the run can be reproduced from the same state.

## Cite one run, not several

Pick a single green run as the canonical one and cite it throughout the
chapter. Numbers taken from different runs will disagree in the small details —
timestamps, generation time in milliseconds — and a committee member comparing
two figures should never find a mismatch.

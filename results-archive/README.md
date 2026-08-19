# results-archive

Actions artifacts expire after 90 days, so a green run's output is copied here
to give the dissertation evidence a permanent location.

For each cited run, create `run-<N>/` containing the unzipped
`track-a-results-<N>` artifact plus a short `PROVENANCE.md`:

```
run number   : 8
commit       : 2d6662e
fabric       : 2.5.9
runner       : ubuntu-latest (GitHub-hosted)
workflow run : https://github.com/<owner>/<repo>/actions/runs/<id>
date         : YYYY-MM-DD
verdicts     : all artifact checks passed (tools/check_artifacts.js)
```

Those five lines are the reproducibility statement for Глава 5.

#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
c_head "summarize"
node "${ROOT}/tools/build_replay.js"
node "${ROOT}/tools/render_check.js" --print | tee "${RESULTS}/render_check.txt"
node "${ROOT}/tools/feasibility_summary.js"

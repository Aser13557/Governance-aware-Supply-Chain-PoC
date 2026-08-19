#!/usr/bin/env bash
# Assemble the §6.4 feasibility summary and the replay console feed.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
c_head "summarize"
node "${ROOT}/tools/build_replay.js"
node "${ROOT}/tools/feasibility_summary.js"

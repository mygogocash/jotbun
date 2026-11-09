#!/bin/bash
# R100's fast local gate for P4-T13 in a scratch tree: bash fast-gate.sh <tree> <log dir>.
# No route, app config or app entry changes, so no typecheck:routes and no export:web. Each
# command's log goes to <log dir>, and its exit code to <log dir>/exits.txt.
tree="$1"; logs="$2"
mkdir -p "$logs"
cd "$tree" || exit 2
run() { local name="$1"; shift; "$@" > "$logs/$name.log" 2>&1; echo "$name exit=$?" >> "$logs/exits.txt"; }
: > "$logs/exits.txt"
run typecheck-app npm run typecheck:app
run test-app npm run test:app
run test-unit npm run test:unit

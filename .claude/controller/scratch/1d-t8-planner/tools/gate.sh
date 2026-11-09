#!/bin/zsh
# The app gate in a scratch tree: gate.sh <tree> <logdir>. Each command's log and exit code go to <logdir>.
tree="$1"; logs="$2"
mkdir -p "$logs"
cd "$tree" || exit 2
run() { local name="$1"; shift; "$@" > "$logs/$name.log" 2>&1; echo "$name exit=$?" >> "$logs/exits.txt"; }
: > "$logs/exits.txt"
run typecheck-app npm run typecheck:app
run typecheck-routes npm run typecheck:routes -w gogospend-app
run test-app npm run test:app
run test-unit npm run test:unit
run test-render npm run test:render -w gogospend-app
run export-web npm run export:web -w gogospend-app -- --max-workers 2

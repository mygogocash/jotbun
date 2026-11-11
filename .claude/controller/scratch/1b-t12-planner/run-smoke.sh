#!/bin/bash
# Planner proof: one run of the local files smoke (test/vault-files.smoke.db.test.ts) in the tree, under the heavy lock.
# It starts the built vault Worker in workerd (wrangler dev) and no database. Environment passes through
# (SMOKE_OUT, SMOKE_EXPECTED, SMOKE_BACKGROUND). A run that is stopped gives the lock back.
# Usage: run-smoke.sh <log path> [extra vitest arguments...]
P=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t12-planner
T="${TREE:-$P/tree}"
LOG="$1"; shift
LOCK=/private/tmp/claude-501/jotbun-heavy.lock
until mkdir "$LOCK" 2>/dev/null; do sleep 20; done
echo "locked $(date +%T)"
set -m
(cd "$T/apps/edge" && exec npx vitest run --config vitest.db.config.ts --reporter=verbose test/vault-files.smoke.db.test.ts "$@" > "$LOG" 2>&1) &
child=$!
trap 'kill -TERM -- -"$child" 2>/dev/null; wait "$child" 2>/dev/null; rmdir "$LOCK"; echo "stopped; unlocked $(date +%T)"; exit 143' TERM INT HUP
wait "$child"
rc=$?
rmdir "$LOCK"
echo "smoke exit $rc; unlocked $(date +%T)"
exit $rc

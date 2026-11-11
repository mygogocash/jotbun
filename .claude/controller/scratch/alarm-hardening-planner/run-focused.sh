#!/bin/bash
# Planner proof: one focused workers run in the tree (the files and vitest arguments given), under the heavy lock.
# A run that is stopped (TERM, INT or HUP) stops its vitest process group and gives the lock back.
# Usage: run-focused.sh <log path> <vitest arguments...>
P=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/alarm-hardening-planner
T="${TREE:-$P/tree}"
LOG="$1"; shift
LOCK=/private/tmp/claude-501/jotbun-heavy.lock
until mkdir "$LOCK" 2>/dev/null; do sleep 20; done
echo "locked $(date +%T)"
set -m
(cd "$T/apps/edge" && exec npx vitest run --config vitest.workers.config.ts --reporter=verbose "$@" > "$LOG" 2>&1) &
child=$!
trap 'kill -TERM -- -"$child" 2>/dev/null; wait "$child" 2>/dev/null; rmdir "$LOCK"; echo "stopped; unlocked $(date +%T)"; exit 143' TERM INT HUP
wait "$child"
rc=$?
rmdir "$LOCK"
echo "focused exit $rc; unlocked $(date +%T)"
exit $rc

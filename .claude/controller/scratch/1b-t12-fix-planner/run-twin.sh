#!/bin/bash
# 1B-T12 fix kit: one run of a test file under apps/edge/test through the twin config (vitest.twin.config.ts with
# test/twin-mocks.ts: no PostgreSQL, no NestJS; the vault Worker is real), under the heavy lock (taken with mkdir,
# given back after a failure or a stop too). TREE names the repo root to run in (the kit's tree by default; the
# fixer passes its worktree). Environment passes through (TWIN_EXPECTED).
# Usage: run-twin.sh <test file under apps/edge/test> <log path> [vitest arguments...]
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t12-fix-planner
T="${TREE:-$K/tree}"
FILE="$1"; LOG="$2"; shift; shift
LOCK=/private/tmp/claude-501/jotbun-heavy.lock
until mkdir "$LOCK" 2>/dev/null; do sleep 20; done
echo "locked $(date +%T)"
set -m
(cd "$T/apps/edge" && exec npx vitest run --config vitest.twin.config.ts --reporter=verbose "test/$FILE" "$@" > "$LOG" 2>&1) &
child=$!
trap 'kill -TERM -- -"$child" 2>/dev/null; wait "$child" 2>/dev/null; rmdir "$LOCK"; echo "stopped; unlocked $(date +%T)"; exit 143' TERM INT HUP
wait "$child"
rc=$?
rmdir "$LOCK"
echo "twin exit $rc; unlocked $(date +%T)"
exit $rc

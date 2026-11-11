#!/bin/bash
# Planner proof: runs one command under the heavy lock, its output to <log>, and gives the lock back
# however the command ends (a stopped run too). Never removes a lock it did not take.
# Usage: locked.sh <log> <dir> <command...>
LOCK=/private/tmp/claude-501/jotbun-heavy.lock
LOG="$1"; DIR="$2"; shift 2
until mkdir "$LOCK" 2>/dev/null; do sleep 20; done
echo "locked $(date +%T)"
set -m
(cd "$DIR" && exec "$@" > "$LOG" 2>&1) &
child=$!
trap 'kill -TERM -- -"$child" 2>/dev/null; wait "$child" 2>/dev/null; rmdir "$LOCK"; echo "stopped; unlocked $(date +%T)"; exit 143' TERM INT HUP
wait "$child"
rc=$?
rmdir "$LOCK"
echo "exit $rc; unlocked $(date +%T)"
exit $rc

#!/bin/bash
# Runs workers test files under the heavy lock.
# Usage: run-focused.sh <apps/edge dir> <log file> <test file>...
edge="$1"; log="$2"; shift 2
until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done
cd "$edge" && npx vitest run --config vitest.workers.config.ts --reporter=verbose "$@" > "$log" 2>&1
rc=$?
rmdir /private/tmp/claude-501/jotbun-heavy.lock
echo "rc=$rc"
exit $rc

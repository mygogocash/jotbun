#!/bin/bash
# Runs mutants.py under the heavy lock, then checks every mutated file against its real/ copy.
# Usage: run-mutants.sh <apps/edge dir> <scratch dir> [LABEL ...]
pl="$(cd "$(dirname "$0")" && pwd)"
edge="$1"; scratch="$2"; shift 2
mkdir -p "$scratch"
until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done
python3 -I "$pl/mutants.py" "$edge" "$scratch" "$@" > "$scratch/mutants.out" 2>&1
rc=$?
rmdir /private/tmp/claude-501/jotbun-heavy.lock
echo "rc=$rc"
exit $rc

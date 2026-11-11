#!/bin/bash
# Runs mutants.py under the heavy lock.
# Usage: run-mutants.sh <apps/edge dir> <scratch dir> <out name> [--red | LABEL ...]
pl="$(cd "$(dirname "$0")" && pwd)"
edge="$1"; scratch="$2"; out="$3"; shift 3
mkdir -p "$scratch"
until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done
if [ "${1:-}" = "--red" ]; then
  python3 -I "$pl/mutants.py" --red "$edge" "$scratch" > "$scratch/$out" 2>&1
else
  python3 -I "$pl/mutants.py" "$edge" "$scratch" "$@" > "$scratch/$out" 2>&1
fi
rc=$?
rmdir /private/tmp/claude-501/jotbun-heavy.lock
echo "rc=$rc"
exit $rc

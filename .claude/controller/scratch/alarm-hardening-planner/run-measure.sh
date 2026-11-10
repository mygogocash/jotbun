#!/bin/bash
# Planner proof for m4: the per-write due-time reads on the base (every changed file at its base, no 0004) and on the
# real files, with the same scratch measurement file (explore/zz-planner-measure.test.ts), each run under the lock.
P=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/alarm-hardening-planner
E="$P/tree/apps/edge"
M=test/workers/zz-planner-measure.test.ts
cd "$P/orig" && find . -type f | sort | while read -r f; do cp "$f" "$E/$f"; done
rm -f "$E/src/vault/migrations/0004_alarm_bounds.sql"
cp "$P/explore/zz-planner-measure.test.ts" "$E/$M"
"$P/run-focused.sh" "$P/proof/measure-before.log" "$M"; echo "before exit $?"
cd "$P/real" && find . -type f | sort | while read -r f; do mkdir -p "$E/$(dirname "$f")"; cp "$f" "$E/$f"; done
"$P/run-focused.sh" "$P/proof/measure-after.log" "$M"; echo "after exit $?"
rm -f "$E/$M"
cd "$P/real" && find . -type f | sort | while read -r f; do cmp -s "$f" "$E/$f" || echo "DIFF $f"; done; echo "tree back to real"

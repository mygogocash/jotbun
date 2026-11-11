#!/bin/bash
# Planner proof: the RED stage in a tree that holds the base, the stubs and the new tests (brief Steps 1 and 2).
# Node: c1-shape, route-coverage and ready (no lock). Then the build of the old Worker, the C1 Worker test on it,
# and the two new ai.test.ts cases, each under the heavy lock (locked.sh).
# Usage: run-red.sh <repo root> <output folder>
P=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t13-planner
T="$1"; OUT="$2"; E="$T/apps/edge"
mkdir -p "$OUT"
(cd "$E" && npx vitest run --reporter=verbose test/c1-shape.test.ts test/route-coverage.test.ts test/ready.test.ts > "$OUT/red-node.log" 2>&1); echo "red node exit $?"
(cd "$T" && npm run build:edge > "$OUT/red-build.log" 2>&1); echo "red build exit $?"
"$P/locked.sh" "$OUT/red-c1.log" "$E" npx vitest run --config vitest.db.config.ts --reporter=verbose test/c1-worker.db.test.ts; echo "red c1 exit $?"
"$P/locked.sh" "$OUT/red-ai.log" "$E" npx vitest run --config vitest.workers.config.ts --reporter=verbose test/workers/ai.test.ts -t "before 1970"; echo "red ai exit $?"
for f in red-node red-c1 red-ai; do echo "$f: $(grep -E '^ +Tests ' "$OUT/$f.log" | tail -1)"; done

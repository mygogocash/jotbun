#!/bin/bash
# Planner proof: the GREEN stage in tree/ (brief Step 4) and the fast local gate (R100).
# Usage: run-green.sh <repo root> <output folder>
P=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p3-t4-planner
T="${1:-$P/tree}"; OUT="${2:-$P/proof/green}"; E="$T/apps/edge"
mkdir -p "$OUT"
(cd "$E" && npx vitest run --reporter=verbose test/ai-transport.test.ts > "$OUT/green-node.log" 2>&1); echo "green node exit $?"
(cd "$T" && npm run typecheck:edge > "$OUT/green-typecheck.log" 2>&1); echo "green typecheck exit $?"
(cd "$T" && npm run build:edge > "$OUT/green-build.log" 2>&1); echo "green build exit $?"
"$P/locked.sh" "$OUT/green-workers-ai.log" "$E" npx vitest run --config vitest.workers.config.ts --reporter=verbose test/workers/ai.test.ts; echo "green workers ai exit $?"
(cd "$T" && npm run test:edge > "$OUT/green-test-edge.log" 2>&1); echo "green test:edge exit $?"
for f in green-node green-workers-ai; do echo "$f: $(grep -E '^ +Tests ' "$OUT/$f.log" | tail -1)"; done

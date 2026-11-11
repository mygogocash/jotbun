#!/bin/bash
# Planner proof: the RED stage in red/ (brief Steps 1 and 2).
# Usage: run-red.sh <repo root> <output folder>
P=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p3-t4-planner
T="${1:-$P/red}"; OUT="${2:-$P/proof/red}"; E="$T/apps/edge"
mkdir -p "$OUT"
(cd "$E" && npx vitest run --reporter=verbose test/ai-transport.test.ts > "$OUT/red-node.log" 2>&1); echo "red node exit $?"
echo "red-node: $(grep -E '^ +Tests ' "$OUT/red-node.log" | tail -1)"

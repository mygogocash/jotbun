#!/bin/bash
# Planner proof, in one chain: RED in red/, GREEN in tree/, and the mutants in tree/ only when every GREEN run
# passed. Every workerd or wrangler run inside takes the heavy lock on its own (locked.sh).
# Usage: run-all.sh   (outputs in proof/red, proof/green and proof/mutants)
P=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t13-planner
echo "start $(date +%T)"
"$P/run-red.sh" "$P/red" "$P/proof/red"
for f in "$P"/smoke/*.ts; do cp "$f" "$P/tree/apps/edge/test/"; done
"$P/run-green.sh" "$P/tree" "$P/proof/green" | tee "$P/proof/green/run-green.out"
if grep -q "exit [1-9]" "$P/proof/green/run-green.out"; then echo "GREEN had a failing run: no mutants"; exit 1; fi
python3 -I "$P/mutants.py" --tree "$P/tree" --out "$P/proof/mutants" > "$P/proof/mutants.out" 2>&1
echo "mutants exit $?: $(tail -1 "$P/proof/mutants.out")"
echo "end $(date +%T)"

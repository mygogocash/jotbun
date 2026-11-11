#!/bin/bash
# The planner's whole proof of the fix round, in order (tools/prove.sh's stages); each stage's line goes to logs/summary.txt.
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/tray-hardening-fix-planner
for stage in base red green probes mutants gate; do bash "$K/tools/prove.sh" "$stage"; done

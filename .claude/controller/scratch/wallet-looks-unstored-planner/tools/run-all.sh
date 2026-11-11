#!/bin/bash
# Every stage in order: the base, RED, GREEN, the mutants, the fast local gate.
set -u
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/wallet-looks-unstored-planner
for stage in base red green mutants gate; do bash "$K/tools/prove.sh" "$stage"; done

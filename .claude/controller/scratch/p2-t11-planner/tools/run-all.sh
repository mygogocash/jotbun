#!/bin/bash
# Every stage in order, with the final files: red, green, the mutants, the gate.
set -u
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t11-planner
L=$K/logs
stamp() { echo "[$(date +%T) load $(sysctl -n vm.loadavg | tr -d '{}' | awk '{print $1}')] $*" | tee -a "$L/summary.txt"; }
bash "$K/tools/prove.sh" red
bash "$K/tools/prove.sh" green
stamp "mutants: start"
(cd "$K" && python3 -I tools/mutants.py work logs/mutant-logs > logs/mutants.out 2>&1); stamp "mutants exit=$? $(tail -1 "$L/mutants.out")"
bash "$K/tools/prove.sh" gate

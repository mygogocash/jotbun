#!/bin/bash
# The planner's whole proof of the second fix round, in order (tools/prove.sh's stages); each stage's line goes to
# logs/summary.txt. Then the controls (tools/controls.py, logs/controls.out).
K=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/tray-hardening-fix2-planner
for stage in base red redm3 green probes model mutants gate; do bash "$K/tools/prove.sh" "$stage"; done
python3 -I "$K/tools/controls.py" "$K/work" > "$K/logs/controls.out" 2>&1
echo "[$(date +%T)] controls exit=$? $(grep -c '(expected' "$K/logs/controls.out") lines, $(grep -c 'NOT AS EXPECTED' "$K/logs/controls.out") not as expected" | tee -a "$K/logs/summary.txt"

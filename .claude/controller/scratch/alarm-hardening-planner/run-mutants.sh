#!/bin/bash
# Planner proof: the mutants on the real files, under the heavy lock, then a byte-for-byte check of every mutated file.
# A run that is stopped gives the lock back.
P=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/alarm-hardening-planner
E="$P/tree/apps/edge"
LOCK=/private/tmp/claude-501/jotbun-heavy.lock
cd "$E" || exit 2
shasum -a 256 src/vault/files/jobs.ts src/vault/user-vault.ts src/vault/files/attachments.ts src/vault/files/previews.ts src/vault/migrations/0004_alarm_bounds.sql src/vault/schema.ts > "$P/proof/mutant-files.sha256"
python3 -I "$P/mutants.py" --check "$E" > "$P/proof/mutants-check.out" 2>&1; echo "mutants check exit $?"
until mkdir "$LOCK" 2>/dev/null; do sleep 20; done; echo "locked $(date +%T)"
trap 'rmdir "$LOCK"; echo "stopped; unlocked $(date +%T)"; exit 143' TERM INT HUP
python3 -I "$P/mutants.py" "$E" "$P/proof" "$@" > "$P/proof/mutants.out" 2>&1; rc=$?
rmdir "$LOCK"; echo "mutants exit $rc; unlocked $(date +%T)"
shasum -a 256 -c "$P/proof/mutant-files.sha256"

#!/bin/bash
# Planner proof: RED on the typed stubs (the four changed source files at their base, 0004 as a table only), then
# GREEN on the real files, each with its typecheck and one FOCUSED run under the heavy lock (run-focused.sh takes and
# gives back the lock per run).
P=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/alarm-hardening-planner
E="$P/tree/apps/edge"
FOCUSED="test/workers/files-alarm.test.ts test/workers/vault-schema.test.ts"
# RED: every real file, then the four source files back at their base and the stub 0004.
cd "$P/real" && find . -type f | sort | while read -r f; do mkdir -p "$E/$(dirname "$f")"; cp "$f" "$E/$f"; done
for f in src/vault/files/jobs.ts src/vault/user-vault.ts src/vault/files/attachments.ts src/vault/files/previews.ts; do cp "$P/orig/$f" "$E/$f"; done
cp "$P/stubs/src/vault/migrations/0004_alarm_bounds.sql" "$E/src/vault/migrations/0004_alarm_bounds.sql"
(cd "$P/tree" && npm run typecheck:edge) > "$P/proof/red-typecheck.log" 2>&1; echo "red typecheck exit $?"
"$P/run-focused.sh" "$P/proof/red.log" $FOCUSED; echo "red exit $?"
# GREEN: every real file.
cd "$P/real" && find . -type f | sort | while read -r f; do mkdir -p "$E/$(dirname "$f")"; cp "$f" "$E/$f"; done
(cd "$P/tree" && npm run typecheck:edge) > "$P/proof/green-typecheck.log" 2>&1; echo "green typecheck exit $?"
"$P/run-focused.sh" "$P/proof/green.log" $FOCUSED; echo "green exit $?"

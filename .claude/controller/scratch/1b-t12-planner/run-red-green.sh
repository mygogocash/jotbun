#!/bin/bash
# Planner proof: RED on the typed stub (vault-worker.ts copies the built config unchanged, so background work
# advances), then GREEN on the real files. Each stage: copy, typecheck, one smoke run under the heavy lock
# (run-smoke.sh takes and gives back the lock), checked against smoke/expected-nest.json.
# Usage: run-red-green.sh <tag>   (logs and runs go to proof/<tag>-*)
P=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t12-planner
E="$P/tree/apps/edge"
TAG="${1:-1}"
for f in test/support/files-session.ts test/parity-files.db.test.ts test/vault-parity-files.db.test.ts; do cp "$P/real/apps/edge/$f" "$E/$f"; done
cp "$P/smoke/vault-files.smoke.db.test.ts" "$E/test/vault-files.smoke.db.test.ts"
# RED: the stub.
cp "$P/stubs/apps/edge/test/support/vault-worker.ts" "$E/test/support/vault-worker.ts"
(cd "$P/tree" && npm run typecheck:edge) > "$P/proof/$TAG-red-typecheck.log" 2>&1; echo "red typecheck exit $?"
SMOKE_EXPECTED="$P/smoke/expected-nest.json" SMOKE_OUT="$P/proof/$TAG-red-run.json" "$P/run-smoke.sh" "$P/proof/$TAG-red.log"; echo "red exit $?"
# GREEN: the real file.
cp "$P/real/apps/edge/test/support/vault-worker.ts" "$E/test/support/vault-worker.ts"
(cd "$P/tree" && npm run typecheck:edge) > "$P/proof/$TAG-green-typecheck.log" 2>&1; echo "green typecheck exit $?"
SMOKE_EXPECTED="$P/smoke/expected-nest.json" SMOKE_OUT="$P/proof/$TAG-green-run.json" "$P/run-smoke.sh" "$P/proof/$TAG-green.log"; echo "green exit $?"

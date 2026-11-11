#!/bin/bash
# Planner proof: the GREEN stage in a tree that holds the final files (brief Step 4). Node: the new and changed
# Node files (no lock). Then the build, the C1 Worker test, the focused workers files and the three local smokes
# on the built one Worker, each under the heavy lock (locked.sh). The smokes must already be in apps/edge/test.
# Usage: run-green.sh <repo root> <output folder>
P=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t13-planner
T="$1"; OUT="$2"; E="$T/apps/edge"
mkdir -p "$OUT"
(cd "$E" && npx vitest run --reporter=verbose test/c1-shape.test.ts test/route-coverage.test.ts test/ready.test.ts test/request.test.ts test/posthog-proxy.test.ts > "$OUT/green-node.log" 2>&1); echo "green node exit $?"
(cd "$T" && npm run build:edge > "$OUT/green-build.log" 2>&1); echo "green build exit $?"
"$P/locked.sh" "$OUT/green-c1.log" "$E" npx vitest run --config vitest.db.config.ts --reporter=verbose test/c1-worker.db.test.ts; echo "green c1 exit $?"
"$P/locked.sh" "$OUT/green-workers.log" "$E" npx vitest run --config vitest.workers.config.ts --reporter=verbose test/workers/ai.test.ts test/workers/imports-parse.test.ts test/workers/vault-schema.test.ts test/workers/config.test.ts test/workers/auth/schema.test.ts test/workers/auth/email-code.test.ts test/workers/auth/jwt.test.ts; echo "green workers exit $?"
"$P/locked.sh" "$OUT/green-smoke-money.log" "$E" npx vitest run --config vitest.db.config.ts --reporter=verbose test/vault-money.smoke.db.test.ts; echo "green money smoke exit $?"
SMOKE_OUT="$OUT/green-files-run.json" "$P/locked.sh" "$OUT/green-smoke-files.log" "$E" npx vitest run --config vitest.db.config.ts --reporter=verbose test/vault-files.smoke.db.test.ts; echo "green files smoke exit $?"
"$P/locked.sh" "$OUT/green-smoke-live.log" "$E" npx vitest run --config vitest.db.config.ts --reporter=verbose test/live.smoke.db.test.ts; echo "green live smoke exit $?"
for f in green-node green-c1 green-workers green-smoke-money green-smoke-files green-smoke-live; do echo "$f: $(grep -E '^ +Tests ' "$OUT/$f.log" | tail -1)"; done

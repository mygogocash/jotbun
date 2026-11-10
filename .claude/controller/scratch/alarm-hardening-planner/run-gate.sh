#!/bin/bash
# Planner proof: the fast local gate (R100) on the real files. The focused files' GREEN run is run-red-green.sh's.
P=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/alarm-hardening-planner
E="$P/tree/apps/edge"
cd "$P/real" && find . -type f | sort | while read -r f; do cmp -s "$f" "$E/$f" || echo "DIFF $f"; done; echo "tree equals real"
(cd "$P/tree" && npm run typecheck:edge) > "$P/proof/gate-typecheck.log" 2>&1; echo "typecheck:edge exit $?"
(cd "$P/tree" && npm run test:edge) > "$P/proof/gate-test-edge.log" 2>&1; echo "test:edge exit $?"
(cd "$P/tree" && npm run build:edge) > "$P/proof/gate-build-edge.log" 2>&1; echo "build:edge exit $?"
"$P/run-focused.sh" "$P/proof/gate-affected.log" test/workers/attachments.test.ts test/workers/imports-review.test.ts test/workers/imports-parse.test.ts test/workers/snapshots.test.ts test/workers/retention.test.ts test/workers/live.test.ts test/workers/currency-migration.test.ts test/workers/sync.test.ts test/workers/files-erase.test.ts; echo "affected exit $?"
cd "$P" && find real -type f | sort | sed 's|^real/||' | while read -r f; do if [ -f "orig/$f" ]; then out=$(/usr/bin/git diff --no-index --check "orig/$f" "real/$f" 2>&1); else out=$(/usr/bin/git diff --no-index --check /dev/null "real/$f" 2>&1); fi; [ -n "$out" ] && echo "WHITESPACE $f: $out"; done; echo "whitespace check done"

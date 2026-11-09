#!/bin/bash
# The 1D-T6 planner's proof, on HEAD = origin/claude/p1a-vault-core 3ab4d0a + P2-T2's patch
# + the PostHog install (npm ci done there already). Usage: prove.sh [red|green|mutants|gate|all]
# Resets every file 1D-T6 touches before RED, so a rerun starts from the same state.
set -u
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t6-planner
H=$PL/head
A=apps/app/src
L=$PL/logs/run
mkdir -p "$L"
PHASE=${1:-all}

EDITED="app/_layout.tsx src/screens/redesign/RootLayout.render.test.tsx src/api/client.ts src/api/client.test.ts src/api/sharedV1.ts src/config/env.ts src/spend/v1/ai/AiCompanionProvider.tsx src/spend/v1/DeviceDiaryProvider.tsx src/mascot/bunSettingsErase.render.test.tsx src/analytics/controller.ts src/analytics/controller.test.ts"
TESTS="analytics/posthogOptions.test.ts analytics/analyticsServer.test.ts analytics/consentStorage.render.test.tsx analytics/AnalyticsUpkeep.render.test.tsx config/env.test.ts api/sharedV1.render.test.tsx"
STUBS="analytics/posthogOptions.ts analytics/analyticsServer.ts analytics/consentStorage.ts analytics/AnalyticsUpkeep.tsx"
CODE="analytics/posthogOptions.ts analytics/analyticsServer.ts analytics/consentStorage.ts analytics/AnalyticsUpkeep.tsx analytics/appAnalytics.ts analytics/posthogClient.ts"
UNIT_FILES="src/analytics/posthogOptions.test.ts src/analytics/analyticsServer.test.ts src/analytics/controller.test.ts src/config/env.test.ts"
RENDER_FILES="src/analytics/AnalyticsUpkeep.render.test.tsx src/analytics/consentStorage.render.test.tsx src/api/sharedV1.render.test.tsx src/mascot/bunSettingsErase.render.test.tsx src/screens/redesign/RootLayout.render.test.tsx"

focused() { # $1 = label
  (cd "$H" && npm run test:unit -w gogospend-app -- $UNIT_FILES) > "$L/$1-unit.log" 2>&1; echo "$1 unit exit=$?"
  grep -E '^ℹ (tests|pass|fail) ' "$L/$1-unit.log"
  (cd "$H" && npm run test:app) > "$L/$1-app.log" 2>&1; echo "$1 test:app exit=$?"
  grep -E '^ℹ (tests|pass|fail) ' "$L/$1-app.log"
  (cd "$H" && npm run test:render -w gogospend-app -- $RENDER_FILES) > "$L/$1-render.log" 2>&1; echo "$1 render exit=$?"
  grep -E '^ +(Test Files|Tests) ' "$L/$1-render.log"
  grep -hE '^✖ |^ +× ' "$L/$1-unit.log" "$L/$1-app.log" "$L/$1-render.log" | grep -v 'failing tests' | sed -E 's/ \([0-9.]+ms\)$//; s/ [0-9]+ms$//' | sort -u
}

if [ "$PHASE" = red ] || [ "$PHASE" = all ]; then
  for f in $EDITED; do cp "$PL/base-p2/apps/app/$f" "$H/apps/app/$f"; done
  for f in $TESTS $CODE; do rm -f "$H/$A/$f"; done
  cp "$PL/final/apps/app/package.json" "$H/apps/app/package.json"
  cp "$PL/final/package-lock.json" "$H/package-lock.json"
  for f in $TESTS; do cp "$PL/final/$A/$f" "$H/$A/$f"; done
  for f in $STUBS; do cp "$PL/stubs/$A/$f" "$H/$A/$f"; done
  python3 -I "$PL/tools/edits.py" "$H" red > "$L/red-edits.log" || { cat "$L/red-edits.log"; exit 1; }
  focused red
fi

if [ "$PHASE" = green ] || [ "$PHASE" = all ]; then
  for f in $CODE; do cp "$PL/final/$A/$f" "$H/$A/$f"; done
  python3 -I "$PL/tools/edits.py" "$H" green > "$L/green-edits.log" || { cat "$L/green-edits.log"; exit 1; }
  (cd "$H/apps/app" && npx tsc --noEmit) > "$L/green-tsc.log" 2>&1; echo "green tsc exit=$?"
  focused green
  # Every touched file must equal the planner's verified result.
  for f in $EDITED; do cmp -s "$H/apps/app/$f" "$PL/final/apps/app/$f" || echo "DIFFERS from final: apps/app/$f"; done
  for f in $TESTS $CODE; do cmp -s "$H/$A/$f" "$PL/final/$A/$f" || echo "DIFFERS from final: $A/$f"; done
fi

if [ "$PHASE" = mutants ] || [ "$PHASE" = all ]; then
  python3 -I "$PL/tools/mutants.py" "$H" "$L/mutants" > "$L/mutants.out" 2>&1; echo "mutants exit=$?"
  cat "$L/mutants.out"
fi

if [ "$PHASE" = gate ] || [ "$PHASE" = all ]; then
  cd "$H" || exit 1
  npm run typecheck:app > "$L/gate-typecheck-app.log" 2>&1; echo "typecheck:app exit=$?"
  npm run typecheck:routes -w gogospend-app > "$L/gate-typecheck-routes.log" 2>&1; echo "typecheck:routes exit=$?"
  npm run test:app > "$L/gate-test-app.log" 2>&1; echo "test:app exit=$?"; grep -E '^ℹ (tests|pass|fail) ' "$L/gate-test-app.log"
  npm run test:unit > "$L/gate-test-unit.log" 2>&1; echo "test:unit exit=$?"; grep -E '^ℹ (tests|pass|fail) ' "$L/gate-test-unit.log"
  npm run test:render -w gogospend-app > "$L/gate-test-render.log" 2>&1; echo "test:render exit=$?"; grep -E '^ +(Test Files|Tests) ' "$L/gate-test-render.log"
  npm run export:web -w gogospend-app -- --max-workers 2 > "$L/gate-export-web.log" 2>&1; echo "export:web exit=$?"; grep -E 'Web Bundled|modules|Exported' "$L/gate-export-web.log" | tail -3
  rm -rf "$H/apps/app/dist"
  (cd apps/app && CI=1 npx expo export --platform ios --output-dir "$PL/logs/ios-dist") > "$L/gate-export-ios.log" 2>&1; echo "export ios exit=$?"; grep -E 'iOS Bundled|modules|Exported' "$L/gate-export-ios.log" | tail -3
  rm -rf "$PL/logs/ios-dist"
  node --test scripts/ci/lockfile-bindings.test.mjs > "$L/gate-lockfile-bindings.log" 2>&1; echo "lockfile-bindings exit=$?"
  npm run test:ops > "$L/gate-test-ops.log" 2>&1; echo "test:ops exit=$?"; grep -E '^ℹ (tests|pass|fail|skipped) ' "$L/gate-test-ops.log"
  for f in $EDITED; do /usr/bin/git diff --no-index --check "$PL/base-p2/apps/app/$f" "$H/apps/app/$f"; done > "$L/gate-diff-check.log" 2>&1
  for f in $TESTS $CODE; do /usr/bin/git diff --no-index --check /dev/null "$H/$A/$f"; done >> "$L/gate-diff-check.log" 2>&1
  echo "diff --check findings: $(grep -c . "$L/gate-diff-check.log")"
fi

#!/bin/bash
# P2-T31 fix round, the planner's stages, run in PL/work: a `git archive` of the
# PR head afc19276 with node_modules linked from the fixer's worktree.
#   base:  afc19276's files (orig/);
#   red:   base, the two tests from real/ and the three stubs from stubs/;
#   green: every file from real/;
#   gate:  green, then test:app, test:unit and a whitespace check of the round.
# Usage: prove.sh <stage> where stage is base | red | green | gate | lay-base | lay-red | lay-green.
# Each run stage lays its files, then logs every command to PL/logs/<stage>-*.log.
set -u
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t31-fix-planner
W=$PL/work
APP=$W/apps/app
LOGS=$PL/logs
TESTS="apps/app/src/ui/dateStep.test.ts apps/app/src/wallet/insights/WalletInsights.render.test.tsx"
STUBS="apps/app/src/wallet/insights/WalletInsightsScreen.tsx apps/app/src/dev/catalogue/wallet/insightsSections.tsx apps/app/src/ui/dateStep.ts"
NODE_FILES="src/ui/dateStep.test.ts src/wallet/insights/calendarShade.test.ts src/wallet/copy/draftText.test.ts"
INSIGHTS="src/wallet/insights/WalletInsights.render.test.tsx"
ROUTES="src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx"
NEIGHBOURS="src/wallet/card/CardStack.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx src/screens/redesign/insights/InsightsScreen.render.test.tsx src/screens/redesign/insights/RecapScreen.render.test.tsx"
CATALOGUE="src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx"

lay_base() {
  while read -r f; do
    if [ -f "$PL/orig/$f" ]; then cp "$PL/orig/$f" "$W/$f"; else rm -f "$W/$f"; fi
  done < "$PL/files.txt"
}

lay_red() {
  lay_base
  for f in $TESTS; do cp "$PL/real/$f" "$W/$f"; done
  for f in $STUBS; do cp "$PL/stubs/$f" "$W/$f"; done
}

lay_green() {
  while read -r f; do mkdir -p "$(dirname "$W/$f")"; cp "$PL/real/$f" "$W/$f"; done < "$PL/files.txt"
}

run() {
  local name=$1; shift
  ( cd "$1" && shift && "$@" ) > "$LOGS/$name.log" 2>&1
  echo "$name exit=$?"
}

stage=${1:?stage}
case "$stage" in
  lay-base) lay_base ;;
  lay-red) lay_red ;;
  lay-green) lay_green ;;
  base)
    lay_base
    run base-typecheck "$W" npm run typecheck:app
    run base-unit "$APP" npm run test:unit -- $NODE_FILES
    run base-render "$APP" npx vitest run --config vitest.render.config.ts $INSIGHTS $ROUTES $NEIGHBOURS
    run base-catalogue "$APP" npx vitest run --config vitest.render.config.ts $CATALOGUE -t "bw-"
    ;;
  red)
    lay_red
    run red-typecheck "$W" npm run typecheck:app
    run red-unit "$APP" npm run test:unit -- $NODE_FILES
    run red-render "$APP" npx vitest run --config vitest.render.config.ts --reporter=verbose $INSIGHTS
    ;;
  green)
    lay_green
    run green-typecheck "$W" npm run typecheck:app
    run green-unit "$APP" npm run test:unit -- $NODE_FILES
    run green-render "$APP" npx vitest run --config vitest.render.config.ts --reporter=verbose $INSIGHTS
    run green-routes "$APP" npx vitest run --config vitest.render.config.ts $ROUTES
    run green-neighbours "$APP" npx vitest run --config vitest.render.config.ts $NEIGHBOURS
    run green-catalogue "$APP" npx vitest run --config vitest.render.config.ts $CATALOGUE -t "bw-"
    ;;
  gate)
    lay_green
    run gate-typecheck "$W" npm run typecheck:app
    run gate-test-app "$W" npm run test:app
    run gate-test-unit "$W" npm run test:unit
    # The fixer runs `git diff --check`; here the round's files are checked against their base without a repository.
    ( cd "$PL" && while read -r f; do
        if [ -f "orig/$f" ]; then /usr/bin/git diff --no-index --check "orig/$f" "real/$f"; else /usr/bin/git diff --no-index --check /dev/null "real/$f"; fi
      done < files.txt ) > "$LOGS/gate-diff-check.log" 2>&1
    echo "gate-diff-check lines=$(wc -l < "$LOGS/gate-diff-check.log")"
    ;;
  *) echo "unknown stage $stage"; exit 2 ;;
esac

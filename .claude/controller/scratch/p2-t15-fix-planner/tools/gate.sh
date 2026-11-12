#!/bin/sh
# The planner's GREEN runs and fast local gate (R100) on a tree at GREEN: gate.sh <tree> <logs folder>
set -u
T=$1
L=$2
FP=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t15-fix-planner
cd "$T" || exit 2
npm run typecheck:app > "$L/green-typecheck.log" 2>&1
echo "green typecheck exit $?"
cd "$T/apps/app" || exit 2
npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/add/AddSteps.render.test.tsx > "$L/green-render.log" 2>&1
echo "green render exit $?"
sh "$FP/tools/focused.sh" "$T" "$L/green"
cd "$T" || exit 2
npm run typecheck:app > "$L/gate-1-typecheck.log" 2>&1
echo "gate 1 typecheck:app exit $?"
npm run test:app > "$L/gate-2-test-app.log" 2>&1
echo "gate 2 test:app exit $?"
npm run test:unit > "$L/gate-3-test-unit.log" 2>&1
echo "gate 3 test:unit exit $?"
cd "$T/apps/app" || exit 2
npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/add/AddSteps.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/card/CardStack.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx > "$L/gate-4-focused.log" 2>&1
echo "gate 4 focused exit $?"
npx vitest run --config vitest.render.config.ts --reporter=verbose src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx src/dev/catalogue/catalogueRoute.render.test.tsx > "$L/gate-5-routes.log" 2>&1
echo "gate 5 routes exit $?"
npx vitest run --config vitest.render.config.ts --reporter=verbose src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-" > "$L/gate-6-catalogue.log" 2>&1
echo "gate 6 catalogue exit $?"

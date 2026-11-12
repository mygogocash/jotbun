#!/bin/bash
# The planner's run of the brief's fast local gate (Step 6) and Step 4's
# catalogue and registry checks, on the proof copy at GREEN. Logs: logs/gate-*.
set -u
PL=/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-planner
W=$PL/work
L=$PL/logs
run() { local name=$1; shift; ( "$@" ) > "$L/gate-$name.log" 2>&1; echo "$name exit $?"; }
cd "$W" || exit 2
run typecheck npm run typecheck:app
run typecheck-routes npm run typecheck:routes -w gogospend-app
run test-app npm run test:app
run test-unit npm run test:unit
cd "$W/apps/app" || exit 2
run unit npm run test:unit -- src/wallet/copy/draftText.test.ts
run render npx vitest run --config vitest.render.config.ts --reporter=verbose \
  src/wallet/wallets/NewWallet.render.test.tsx src/wallet/wallets/WalletEdit.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx \
  src/wallet/wallets/WalletsList.render.test.tsx src/screens/redesign/planning/walletCommands.render.test.tsx src/wallet/motion/useWalletMotion.render.test.tsx \
  src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx \
  src/screens/redesign/planning/WalletsScreen.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx \
  src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/add/AmountStep.render.test.tsx \
  src/wallet/card/WalletCard.render.test.tsx src/wallet/card/CardStack.render.test.tsx
run catalogue npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-"
run registry npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx -t "registry has a section"
cd "$W" || exit 2
run export-web npm run export:web -w gogospend-app -- --max-workers 2
run diff-check bash "$PL/tools/diffcheck.sh"

#!/bin/sh
# Runs the focused set on a tree and writes one log per command: focused.sh <tree> <log prefix>
#   <prefix>-unit.log        the add flow's Node files, the tray's and P2-T3's draft check
#   <prefix>-neighbours.log  the render files that read the add folder or the tray, and the eight that import the
#                            wallet catalogue index (the controller's rule): AddSteps, AmountStep, Tray, WalletsList,
#                            CardStack, Lock, WalletLooks, PrivateMode, walletHarness; and Quick add's suite and its hooks'
#                            (QuickAddScreen, entrySave), which the host shares (the plan's Step 4)
#   <prefix>-catalogue.log   the wallet sections in the every-section and screen-reader suites (-t "bw-")
#   <prefix>-registry.log    the registry rule
set -u
T=$1
P=$2
APP=$T/apps/app
cd "$APP" || exit 2
npm run test:unit -- src/wallet/add/addFlow.test.ts src/wallet/add/amountStepNative.test.ts src/wallet/add/addStepsNative.test.ts src/wallet/tray/trayGesture.test.ts src/wallet/copy/draftText.test.ts > "$P-unit.log" 2>&1
echo "unit exit $?"
npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/add/AddSteps.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx src/wallet/card/CardStack.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/screens/redesign/entry/entrySave.render.test.tsx src/screens/redesign/QuickAddScreen.render.test.tsx > "$P-neighbours.log" 2>&1
echo "neighbours exit $?"
npx vitest run --config vitest.render.config.ts --reporter=verbose src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-" > "$P-catalogue.log" 2>&1
echo "catalogue exit $?"
npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx -t "registry has a section" > "$P-registry.log" 2>&1
echo "registry exit $?"

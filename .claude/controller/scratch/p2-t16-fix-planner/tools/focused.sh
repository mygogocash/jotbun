# The fix round's focused files, from apps/app, each named (R117's gate: as before, plus the eight kit render files,
# test:unit and the four routes tests).
# The round's render suite.
ROUND="src/wallet/add/AddTray.render.test.tsx"
# The eight kit render files that import the wallet catalogue index.
KIT8="src/wallet/card/CardStack.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx"
# The four routes tests.
ROUTES4="src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx"
# The first round's other focused render files: the steps, Quick add's suite and its save hook's (the host shares the
# hook), and the catalogue's route.
REST="src/wallet/add/AddSteps.render.test.tsx src/screens/redesign/entry/entrySave.render.test.tsx src/screens/redesign/QuickAddScreen.render.test.tsx src/dev/catalogue/catalogueRoute.render.test.tsx"
# The add flow's Node files, the tray's, and the draft check (copy.ts gains a line).
UNIT="src/wallet/add/addFlow.test.ts src/wallet/add/amountStepNative.test.ts src/wallet/add/addStepsNative.test.ts src/wallet/tray/trayGesture.test.ts src/wallet/copy/draftText.test.ts"
VITEST="npx vitest run --config vitest.render.config.ts"

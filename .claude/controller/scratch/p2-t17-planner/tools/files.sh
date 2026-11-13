# P2-T17's files, at their repo paths (sourced by the other tools).
S=apps/app/src
# The eight files this task creates (the receipt is the implementer's own).
NEW="$S/wallet/saved/savedMoment.ts $S/wallet/saved/savedMoment.test.ts $S/wallet/saved/SavedToastHost.tsx $S/wallet/saved/SaveFlight.tsx $S/wallet/saved/copy.ts $S/wallet/saved/SavedMoment.render.test.tsx $S/dev/catalogue/wallet/savedSections.tsx $S/dev/catalogue/wallet/savedScreens.tsx"
# The five existing files it changes (orig/ holds them as the head has them).
SHARED="$S/dev/catalogue/wallet/index.ts $S/wallet/tray/TextLink.tsx $S/wallet/WalletText.tsx $S/wallet/wallets/WalletsList.render.test.tsx $S/wallet/add/AddTray.render.test.tsx"
# The three code files that have a RED stub (stubs/).
STUBBED="$S/wallet/saved/savedMoment.ts $S/wallet/saved/SavedToastHost.tsx $S/wallet/saved/SaveFlight.tsx"
# What RED copies from real/: the two test files and the copy table (data only).
RED_REAL="$S/wallet/saved/savedMoment.test.ts $S/wallet/saved/SavedMoment.render.test.tsx $S/wallet/saved/copy.ts"
# The focused runs (from apps/app).
UNIT="src/wallet/saved/savedMoment.test.ts src/wallet/copy/draftText.test.ts src/wallet/money/walletMoney.test.ts src/wallet/motion/walletMotion.test.ts src/spend/v1/redesign/shared.test.ts"
ROUND="src/wallet/saved/SavedMoment.render.test.tsx"
KIT8="src/wallet/card/CardStack.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx"
ROUTES4="src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx"
# The other render files that read what this task changes: the add tray's host and steps (one line of AddTray, and
# both import the wallet catalogue index), TextLink's and WalletText's other users' suites that name a tone.
REST="src/wallet/add/AddTray.render.test.tsx src/wallet/add/AddSteps.render.test.tsx src/wallet/WalletText.render.test.tsx src/wallet/recap/WalletRecap.render.test.tsx src/wallet/bunai/WalletAiSettings.render.test.tsx"
VITEST="npx vitest run --config vitest.render.config.ts"

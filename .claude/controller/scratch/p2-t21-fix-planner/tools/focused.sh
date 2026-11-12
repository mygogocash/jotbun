# The fix round's focused render files, from apps/app, each named (R115's gate).
# The round's two render suites.
ROUND="src/wallet/wallets/NewWallet.render.test.tsx src/wallet/wallets/WalletEdit.render.test.tsx"
# The eight kit render files that import the wallet catalogue index.
KIT8="src/wallet/card/CardStack.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx"
# The four routes tests.
ROUTES4="src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx"
# The first round's other render files and its other neighbours: the hook, the drop, today's Wallets screen, the card.
REST="src/screens/redesign/planning/walletCommands.render.test.tsx src/wallet/motion/useWalletMotion.render.test.tsx src/screens/redesign/planning/WalletsScreen.render.test.tsx src/wallet/card/WalletCard.render.test.tsx"
VITEST="npx vitest run --config vitest.render.config.ts"

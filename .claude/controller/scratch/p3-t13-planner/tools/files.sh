# P3-T13's files, at their repo paths (sourced by the other tools).
S=apps/app/src
# The two files this task creates (the receipt is the implementer's own).
NEW="$S/wallet/add/draftOrigin.ts $S/wallet/add/draftOrigin.test.ts"
# The eight existing files it changes (orig/ holds them as the base has them: the head, with P2-T17's AddTray.render.test.tsx).
SHARED="$S/spend/v1/redesign/quickAddModel.ts $S/spend/v1/redesign/quickAddModel.test.ts $S/screens/redesign/entry/entrySave.ts $S/screens/redesign/entry/entrySave.render.test.tsx $S/wallet/add/AddTrayHost.tsx $S/wallet/add/AddTray.render.test.tsx $S/spend/v1/ai/draftReview.ts $S/spend/v1/ai/draftReview.test.ts"
# The four code files that have a RED stub (stubs/): each with the plan's signatures and none of its behaviour.
STUBBED="$S/wallet/add/draftOrigin.ts $S/spend/v1/redesign/quickAddModel.ts $S/screens/redesign/entry/entrySave.ts $S/wallet/add/AddTrayHost.tsx"
# What RED copies from real/: the five test files. draftReview.ts stays as orig/ has it (its m1 guard is what RED tests).
RED_REAL="$S/wallet/add/draftOrigin.test.ts $S/spend/v1/redesign/quickAddModel.test.ts $S/screens/redesign/entry/entrySave.render.test.tsx $S/wallet/add/AddTray.render.test.tsx $S/spend/v1/ai/draftReview.test.ts"
# The focused runs (from apps/app).
UNIT="src/wallet/add/draftOrigin.test.ts src/spend/v1/redesign/quickAddModel.test.ts src/spend/v1/ai/draftReview.test.ts"
# The Node neighbours: what reads the changed modules (the add flow, the record model's builds, the saved moment's
# notices, the tally, the emitters and the outbox's draft check).
NEAR="src/wallet/add/addFlow.test.ts src/spend/v1/redesign/recordModel.test.ts src/wallet/saved/savedMoment.test.ts src/dev/draftTally.test.ts src/analytics/events.test.ts src/storage/diaryRepository.test.ts"
ROUND="src/screens/redesign/entry/entrySave.render.test.tsx src/wallet/add/AddTray.render.test.tsx"
KIT8="src/wallet/card/CardStack.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx"
ROUTES4="src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx"
# The other render files that read what this task changes: Quick add (entrySave's other caller; the plan's "Quick add's
# suite unchanged"), the steps the host draws, the review hook's own suite, the saved moment (it reads SavedEntry and
# mounts the host's sections' neighbours) and the catalogue route.
REST="src/screens/redesign/QuickAddScreen.render.test.tsx src/wallet/add/AddSteps.render.test.tsx src/spend/v1/ai/useDraftReview.render.test.tsx src/wallet/saved/SavedMoment.render.test.tsx src/dev/catalogue/catalogueRoute.render.test.tsx"
VITEST="npx vitest run --config vitest.render.config.ts"

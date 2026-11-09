## Summary
- Packages and the gesture root (P2-T2). Adds `react-native-gesture-handler`, `react-native-reanimated` and `react-native-worklets` at the versions Expo SDK 58.0.12 lists (4.7.1, 0.13.0, ~3.3.0). They were already in the lockfile as expo-router peers, so the install downloads nothing.
- The lockfile diff is three dependency lines in the `apps/app` block, a comma on `react-native-web`, and eight `"peer": true` removals; it keeps 1457 entries.
- New `WalletRoot` (the gesture root, plus the reduced-motion provider in `wallet/motion/reducedMotion.tsx`) wraps the app inside `ThemeProvider` in `app/_layout.tsx`. The wallet redesign area is added to `featureFlags.ts`, off until approved.
- The planner's calls were accepted by the controller (receipt, Deviations). The one to look at: `vitest.render.config.ts` gains `define: { __DEV__: 'true' }`, because Gesture Handler reads `__DEV__` when it loads. The full render suite passes under it. There are also extra tests, including a mount test in `RootLayout.render.test.tsx`.
- Note for 1D-T6 (PostHog), which is built on top of this PR and starts after it merges: its `<AnalyticsUpkeep />` goes after `<LocaleUpkeep />` inside `<WalletRoot>`. The receipt is its own file under R87: `docs/implementation/receipts/P2-T2.md`.

## Test plan
- [x] RED: 8 of 15 failing in the two render files, all assertions. GREEN: 18 of 18 focused.
- [x] 15 of 16 mutants killed; M13 is equivalent (the root view's default style).
- [x] `typecheck:app`, `typecheck:routes`, `test:app` 32, `test:unit` 875, full `test:render` 88 files and 1628 tests (on the rerun; the first run hit the known HistoryReturn load flake, which passes 6 of 6 alone).
- [x] `export:web` 4772 modules and the iOS export 5560 modules: the brief's counts plus #351's three new contract modules. Also the API build, release graph, `test:ops`, `git diff --check`.
- [ ] SKIPPED: a development client on a device (the repo keeps no native folders).
- [ ] CI on this pull request is green.
- [ ] Independent review.

Closes #148 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

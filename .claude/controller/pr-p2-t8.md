## Summary
- The wallet test harness and the catalogue list (P2-T8).
- New `apps/app/src/wallet/testing/walletHarness.tsx` renders wallet screens inside the providers the app nests them in, P2-T2's `WalletRoot` included. It uses Testing Library's `wrapper`, so `rerender` keeps the providers mounted.
  - `answerReducedMotion` answers a `'pending'` mount once, and throws otherwise.
  - The harness installs no analytics. A test that counts events, such as P2-T20 and P2-T21's `wallet_added`, installs `recordAnalytics()` itself before it mounts.
- New `apps/app/src/dev/catalogue/wallet/index.ts` adds an empty `WALLET_SECTIONS` list, for the wallet screens to fill.
- `registry.tsx` (shared): one import, one spread placed last, and one sentence in the header. The registry already imports today's Wallets screen's `WALLET_SECTIONS`, so the new list arrives as `BUN_WALLET_SECTIONS`. The header's "last", from 1D-T9's conflict sections, becomes "next".
- The controller accepted planner calls P1 to P12. The receipt is its own file under R87: `docs/implementation/receipts/P2-T8.md`.

## Test plan
- [x] RED on the typed stub: 6 of 6 failing, every one an assertion. GREEN: 6 of 6; the focused catalogue run passes 539.
- [x] 38 mutants: 35 killed and 3 equivalent, each with its reason (no `SafeAreaProvider`, no `BunIntensityProvider`, no inner `IntlProvider`). Every file was restored byte for byte.
- [x] `typecheck:app`, `typecheck:routes`; `test:app` 33, `test:unit` 894; the full `test:render`, 94 files and 1712 tests (the head's measured 93 files and 1706 tests, plus 1 and 6); `export:web` 4785 modules (+0: the catalogue is dev-only); `git diff --check`.
- [ ] CI on this pull request is green.
- [ ] Independent review.

Closes #154 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

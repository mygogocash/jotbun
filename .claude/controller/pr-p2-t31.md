## Summary
- **P2-T31: Bun Wallet insights** (`WalletInsightsScreen`, boards `bw-insights`, `wc-calendar` and `es-empty-insights`). Three tabs:
  - **Spending:** the month's top categories, and six months of readable bars (`MonthBars`, the current month in `barNow`, the budget as a dashed guide, and one spoken summary);
  - **In and out:** money in against money out;
  - **Calendar:** each day shaded by what was spent (`calendarShade`, pure), with 50 pt day buttons and a legend.
  - An info tray (`InfoTray`, on the wallet's `Tray`, so the motion follows Reduce Motion), and an early state for a new diary.
- **Reads all the data it needs** (P4): the month's summary, the categories, six comparison months, and every page of the month's history, read to the end with no early stop.
- **Failure paths** (P2): a load failure says why in plain words (`recapProblem`), in an alert with Try again. Offline shows the sync banner.
- **Private mode** (R65, P7): no amount on screen or in any label. The bars' spoken summary drops figures, and the calendar draws neutral days with no day amounts or legend values. Checked in Thai, English and dark mode.
- **The wallet kit only** (P5, P8):
  - no raw hex;
  - tabs at least 44 pt, day buttons 50 pt, and every control named;
  - no one-line clamps at the largest text sizes;
  - bars darkened to at least 3:1 against white (spec 5.3).
- **Thai first** (P6): every line through `useDraftCopy`. The English lines are drafts for E2-B.
- **The route:** `app/spend/insights.tsx` shows the wallet screen under the `wallet` area.
  - `InsightsRoutes.render.test.tsx` stubs `WalletInsightsScreen`, as it stubs every other screen, and gains a wallet-flag case. Its 3-way merge with #411's stub in the same file is clean either way.
- **Catalogue:** six `bw-insights*` sections draw the real tabs on fakes, loaded lazily (P3). `index.ts` gains one spread, in plan order.
- **The controller merged the integration head (with #416) into this branch** as `afc19276`. `index.ts` takes the kit's proven merge `index.t20-then-t31.ts` (sha256 `7e85c123…`, the same in both orders): KIT, STACK, TRAY, ADD, LIST, INSIGHTS, then LOCK. On the merged tree: `typecheck:app` 0, and insights, the wallets list, the harness and the four routes tests 45 of 45.
- **The controller accepted the planner's calls P1 to P11.**
  - Planned and built on Gemini 3.8 Flash. A Flash brief review caught the routes-test fault before the build (B1, M1).
  - The controller checked the commit: all 15 `real/` files are byte-identical.
  - The receipt is its own file under R87: `docs/implementation/receipts/P2-T31.md`.
  - No package, lockfile, edge or database change.

## Test plan
- [x] RED: `calendarShade` 2 of 3 and `WalletInsights.render` 11 of 11 failing, every one an `AssertionError`, with 0 lookup or module errors. The RED typecheck passes.
- [x] GREEN:
  - `calendarShade` 3;
  - `draftText` 4;
  - `WalletInsights.render` 11;
  - `walletHarness.render` 9;
  - the four routes tests 12.
- [x] 23 of 23 mutants killed: the shading boundaries, private mode in each tab, the bar colours, the budget guide, the early state, and future days.
- [x] R100's fast gate: `typecheck:app`, the focused files, the routes tests, `export:web` (the route changed) and `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs, including the full render suite and the iOS export.
- [ ] Independent review (Opus), and a second review: the screen shows money, and private mode governs it.
- [ ] SKIPPED: device checks (VoiceOver over the bars and the calendar, AX5 by hand for E2-B).

Closes #177 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

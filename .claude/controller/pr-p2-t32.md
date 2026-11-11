## Summary
- **P2-T32: the month recap.** The Bun Wallet's recap screen for a past month (`WalletRecapScreen`, rh-recap): the month's totals, the biggest day, the share card, and a confetti moment the first time a finished month opens.
- **Shared data (P1):** `useRecapData` and `shareText` move into `screens/redesign/insights/recapData.ts`, so today's `RecapScreen` and the wallet's screen read the same data. `RecapScreen` keeps its behaviour: its suite passes 36 of 36.
- **The pure rules, Node-tested:**
  - `biggestDay` (the day with the most money out, with a fixed tie-breaker);
  - `recapShare` (the share text).
- **Private mode (P5, D41):** `WalletAmount` masks each amount on screen. The share text says no amount while private mode is on.
- **Confetti and haptic (P4, R66):** they play only on the first opening of a past month's recap, which is then stored as seen. There is no motion under Reduce Motion.
- **Copy (P6):** the share button says `recap.share` (แชร์สรุป), never the board's การ์ด wording.
- **Catalogue (P7):** four `bw-recap*` sections in `recapSections.tsx`. One import and one spread go in `index.ts`; `PL/merge/` proves the merge with #407 (P2-T14) and #406 (P2-T33).
- **The controller accepted the planner's calls P1 to P8.**
  - The route `app/spend/recap/[month].tsx` now draws the wallet's screen behind the `wallet` area.
  - No package, lockfile, edge, API or database change.
  - Planned and built on Gemini 3.8 Flash; the planner was steered on asserting lookups and per-guard mutants. The controller checked the commit: all 13 `real/` files are byte-identical.
  - The receipt is its own file under R87: `docs/implementation/receipts/P2-T32.md`.

## Test plan
- [x] RED: 15 of 15 failing, every one an `AssertionError`, with no lookup errors and no type errors (`biggestDay` 2, `recapShare` 2, `WalletRecap.render` 11). The RED typecheck passes.
- [x] GREEN:
  - the three new files: 15 of 15;
  - `RecapScreen.render`: 36 of 36;
  - `walletHarness.render`: 9 of 9;
  - with the other neighbours, 45.
- [x] 31 of 31 mutants killed, one per guard: private-mode masking, dates, numbers, the tie-breaker, motion timing, and the empty and offline states.
- [x] R100's fast gate: typecheck, the focused files and `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs, including the full render suite, `export:web` and the iOS export.
- [ ] Independent review (Opus), and a second review: the recap shows the month's money, and private mode governs the share text.
- [ ] SKIPPED: device checks (confetti and haptic on a phone, the share sheet).

Closes #178 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

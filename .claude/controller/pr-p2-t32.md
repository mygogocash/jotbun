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
- [x] Independent review (Opus): Needs fixes on `71b2255e` for eight majors (`.claude/controller/reviews/P2-T32.md`): confetti asked the phone for reduced motion itself and raced a timer (W6, R66); share failures were swallowed; the cashback card ignored the bridge off-switch and the 7-day floor (A5, R73); the catalogue drew hand-made mocks; the recap read the month with a reader that stops early; raw colours and type outside the wallet kit (dark contrast); English-first loading and error states; and the suite missed the plan's cases. The second review (`reviews/P2-T32-second.md`, money and privacy) approved with one nit (the dates, m1).
- [x] **Fix round** (`b4a99b6e` on the sync merge `dbfd5bb4`; brief `.claude/controller/briefs/P2-T32-fix.md`; ruling R110 with the planner's P1 to P16). The changes:
  - the celebration reads the wallet's one motion answer (`motionFor('recap', ...)`), and nothing moves under Reduce Motion or while the answer is pending;
  - a failed or unsupported share says so in Thai first, with a way to try again; `trackRecapShared` fires only after the sheet resolves;
  - the cashback card shares the insights card's catalogue rule (`useCashbackCatalogue`), shows a count, not baht, and opens nothing (R73);
  - `bw-recap`, `bw-recap-over`, `bw-recap-private` and `bw-recap-cashback` draw the real screen on August 2026 fakes, loaded lazily;
  - the whole month is read (`readAllPages`) for the biggest day and the cashback count;
  - every colour and type from the wallet kit (no colour literal left in `src/wallet/recap`), with the left-over amount on `under` in light and dark;
  - Thai-first loading, error, empty and not-started states; `dayLabel` and `monthLabel` for dates; `biggestDay` matches salary by category, not a string.
  - The proofs: RED on typed stubs, every failing case an assertion; GREEN with neighbours 112 and catalogue `bw-` 44; **91 of 91 mutants killed** (F18 equivalent). All 16 fix-kit files are byte-identical.
  - Planned on Claude Opus (finished on Gemini 3.8 Flash after Claude's weekly limit), built on Gemini 3.8 Flash.
- [x] Controller fix `9add4415`, found before the push: `InsightsRoutes.render.test.tsx` could not load, because the recap route imports the real `WalletRecapScreen`. It now stubs that screen, as it stubs every other. The four routes tests, `RecapScreen`, `SpendLayout`, `InsightsScreen` and `WalletRecap`: 126 of 126; `typecheck:app` clean.
- [ ] CI on this pull request is green at `9add4415`: the nine jobs, including the full render suite, `export:web` and the iOS export.
- [ ] Confirming review (Opus) of the fix commits.
- [ ] SKIPPED: device checks (confetti and haptic on a phone, the share sheet).

Closes #178 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

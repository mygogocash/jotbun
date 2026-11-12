## Summary
- **P2-T25: Recently deleted.** The Bun Wallet's recently-deleted screen (`WalletDeletedScreen`, board `rh-deleted`): deleted records from the last 30 days, each with its days left and a restore button.
- **Shared rules (P2, P3):** paging, `loadMore`, `restore`, the frozen state of an unconfirmed restore, and the refusal text move into a pure hook, `useRecentlyDeleted` (`screens/redesign/deleted/deletedData.ts`). Today's `RecentlyDeletedScreen` reads it, with no change on screen; its suite passes 17 of 17.
  - Nothing is carried (R109.2): 1D-T7 (#138) adds `trackRecordRestored` to the hook with its own case.
- **Board fidelity (P4):**
  - restore buttons at least 44 pt, as a pill;
  - the last day in bold;
  - the 30-day retention line;
  - a sleepy-Bun empty state;
  - back falls back to `/spend/all`.
- **Restores:**
  - an unconfirmed restore freezes the others and turns into "Try again", resending the same command key;
  - a definite refusal says why in plain words (deleted, conflict, invalid, category archived) and reloads the list in place;
  - the row's version is the one sent.
- **Private mode:** amounts are masked on screen and in each restore button's spoken label. A confirmed restore while private mode is on is worded without its amount (`records.restoredHidden`), on screen and in the live region (M1, R109.1).
- **Catalogue (P5, fix round P2):** `bw-deleted` stages the real `WalletDeletedScreen` on its own fakes (`deletedSection.tsx`), loaded with `lazy()` from `recordSections.tsx` so the kit suites never load the router. One import and one spread go in `index.ts`, in plan order (ADD, RECORD, LOCK); the fix kit proves `index.ts` for every order with #416 and #411.
- **The controller accepted the planner's calls P1 to P6,** and the rework it asked for: every lookup asserts, a refusal case, and 19 mutants.
  - No package, lockfile, edge, API or database change.
  - Planned and built on Gemini 3.8 Flash. The controller checked the commit: all 8 `real/` files are byte-identical.
  - The receipt is its own file under R87: `docs/implementation/receipts/P2-T25.md`.

## Test plan
- [x] RED: 9 of 9 failing, every one an `AssertionError` from the asserting helpers, with 0 lookup errors, 0 type errors and 0 timeouts.
- [x] GREEN: 9 of 9.
  - `RecentlyDeletedScreen`: 17 of 17.
  - `walletHarness`: 9 of 9.
  - `Tray`: 27 of 27.
- [x] 19 of 19 mutants killed:
  - the days left;
  - the bold last day;
  - private mode, on screen and spoken;
  - 44 pt and the pill;
  - the freeze, "Try again" and the same command key;
  - refusal words and the reload;
  - the row version;
  - the carry rule;
  - the empty state;
  - the back fallback;
  - the retention line.
- [x] R100's fast gate: `typecheck:app` and `typecheck:routes` (0 errors), `test:unit`, the focused render files and `git diff --check`.
- [x] Independent review (Opus): Needs fixes on `b840c195` for B1 (the `bw-deleted` section drew the screen with no fakes, so both catalogue suites failed), M1 (private mode leaked the restored amount on screen and to a screen reader) and M2 (`trackRecordRestored` was added, not carried) (`.claude/controller/reviews/P2-T25.md`). The second review (`reviews/P2-T25-second.md`) added nothing beyond the controller's ruling R109.
- [x] **Fix round** (`0be9ba27` on the merge `52d647bf` of `a00fff7c`; brief `.claude/controller/briefs/P2-T25-fix.md`; ruling R109 with the planner's P1 to P18). The changes:
  - B1: `bw-deleted` draws the real screen on its own fakes (rent yesterday, the salary four days ago, lunch nine days ago, a taxi on its last day), behind `lazy()`;
  - M1: the hook says what was restored (`RestoreNotice.restored`), and the wallet screen words it without the amount while private mode is on;
  - M2: nothing carried;
  - m1 to m6 and n1 to n5: no one-line clamp or fixed height at AX5, income as `+฿` in violet, the six survivors pinned, `dayLabel` for each row's day, the safe-area top, the split receipts, the Back label in both languages, light and dark checks, role-based leading, one copy table.
  - The proofs: RED 8 of 15 render cases and the two catalogue `bw-deleted` cases, all assertions; the six survivors killed by their pins; GREEN 15 and 17, neighbours 88, catalogue `bw-` 38; **48 of 48 mutants killed**. All 8 fix-kit files are byte-identical, and the merged `index.ts` equals the kit's proven merge.
  - Planned on Claude Opus (finished on Gemini 3.8 Flash after Claude's weekly limit), built on Gemini 3.8 Flash.
- [x] CI at `0be9ba27`: 8 of 9. The render job could not load `SpendRoutes.render.test.tsx` (`SyntaxError: Unexpected token 'typeof'`): the route imports the real `WalletDeletedScreen`, which now reads the safe-area inset (m5), and that package cannot load in vitest. The local gate (R100) never ran that file.
- [x] Controller fix `272aa84b`: the routes test stubs `WalletDeletedScreen`, as it stubs every other screen (it tests only the route's rule). SpendRoutes, HistoryReturn, SpendLayout, HistoryScreen and WalletDeleted: 76 of 76; `typecheck:app` clean.
- [x] CI on this pull request is green at `272aa84b`: 9 of 9, including the full render suite, `export:web` and the iOS export.
- [ ] Confirming review (Opus) of the fix commit.
- [ ] SKIPPED: device checks (none for this screen beyond E2's captures).

Closes #171 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

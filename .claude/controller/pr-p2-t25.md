## Summary
- **P2-T25: Recently deleted.** The Bun Wallet's recently-deleted screen (`WalletDeletedScreen`, board `rh-deleted`): deleted records from the last 30 days, each with its days left and a restore button.
- **Shared rules (P2, P3):** paging, `loadMore`, `restore`, the frozen state of an unconfirmed restore, and the refusal text move into a pure hook, `useRecentlyDeleted` (`screens/redesign/deleted/deletedData.ts`). Today's `RecentlyDeletedScreen` reads it, with no change on screen; its suite passes 17 of 17.
  - 1D-T7's carry rule moves with it: `trackRecordRestored` on each restore.
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
- **Private mode:** amounts are masked on screen and in each restore button's spoken label.
- **Catalogue (P5):** the `bw-deleted` section is in `recordSections.tsx`, loaded with `lazy()` so the kit suites never load the router. One import and one spread go in `index.ts`; `PL/merge/` proves the merge with #407 and #406.
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
- [ ] CI on this pull request is green: the nine jobs, including the full render suite, `export:web` and the iOS export.
- [ ] Independent review (Opus), and a second review: restores re-create money records, and private mode masks their amounts.
- [ ] SKIPPED: device checks (none for this screen beyond E2's captures).

Closes #171 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

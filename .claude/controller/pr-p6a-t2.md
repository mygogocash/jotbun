## Summary
- **P6A-T2: the widget snapshot** (`apps/app/src/wallet/outside/widgetSnapshot.ts`): display-ready faces for the home-screen and lock-screen widgets, with entries that roll over at Bangkok midnight. Pure functions with Node tests; nothing native draws them until P6A-T8.
- **The lock** (P17): with the Face ID lock on, every lock-screen face shows ฿•••• and no gauge figure; the words, the day and the count stay. Home-screen faces follow private mode only; masking them under the lock is the owner's Q9. The snapshot never holds text the person wrote (R114).
- **The budget figure** (P4): each face works out its figure from the limit and estimated spending, with its own day's days left, so it equals the plan's figures whenever Home's pace is for today and cannot divide by zero.
- **No stale figures:** a pace for another month draws none (P5), so at 00:30 on the 1st no October figure shows, and a limit of zero draws none (P6).
- **Money is exact:** the only `Number()` is on the gauge fraction, after it is capped at 1000 thousandths (P8).
- **Copy:** `outsideCopy.draft.ts` and `useOutsideCopy` (`useDraftCopy(OUTSIDE_DRAFT)`, P10), Thai first.
- **`dateStep.ts`** gains `monthIndex`, `monthName` and `shortDayName`, appended after P2-T31's functions with nothing reordered.
- **The controller accepted the planner's calls P1 to P20.**
  - Planned on Claude Opus, built on Claude Haiku 5.5.
  - The controller checked the commit: 7 of 8 `real/` files are byte-identical; the receipt differs only in its base SHA (`c7f947c5`, a controller-state sync).
  - The receipt is its own file under R87: `docs/implementation/receipts/P6A-T2.md`. It carries P6A-T3a's notes: `WidgetFacts` has no day of its own, and the bridge must wait for private mode's `ready` (P2-T10's followup).
  - No package, lockfile, route, screen, edge or database change.

## Test plan
- [x] RED: 20 of 32 failing, every one an `AssertionError`, matching the planner's names. `typecheck:app` passes on the stubs.
- [x] GREEN: 32 of 32.
- [x] 51 of 51 mutants killed, the plan's five among them; the output is identical to the planner's.
- [x] R100's fast gate:
  - `typecheck:app`;
  - `test:app` 36 and `test:unit` 1069;
  - the four routes tests (route screens load `dateStep.ts`): 15;
  - `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs.
- [ ] Independent review (Opus), and a second review: the lock faces, the money and the midnight and month-end entries.
- [ ] SKIPPED: device checks (nothing native draws the snapshot until P6A-T8).

Closes #269 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

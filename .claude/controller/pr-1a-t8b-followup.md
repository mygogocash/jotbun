## Summary
- Turns on Task 7's money journey now that 1A-T7 (#339) and 1A-T8b (#344) have merged. The test "seeds built-ins, records spending, and reads it back through history, summary, budgets, status and sync" changes from `it.todo` to `it`.
- Pins two retention guards that 1A-T8b's review found unpinned:
  - X1: the S1 case now fires at exactly its armed time, `t0 + 61 * DAY`, so the prune's inclusive boundary is held.
  - X3: a new case, "a purge retried after the prune moved the retention line never moves it back".
- Makes three restore-window cases deterministic: one in `transactions.test.ts`, two in `history.test.ts`. They backdated `deleted_at` by SQL and could arm an alarm in the past that fired mid-test. They now pin the vault clock a week ahead, and each ends by checking that the alarm is in the future and the expired record is still there.
- Fixes the 1B plan's wording at line 1130: the money journey was turned on in 1A-T8b, not 1A-T8a.
- Test files and the plan only; nothing under `apps/edge/src` changes. Under R87 the receipt is its own file, `docs/implementation/receipts/1A-T8b-followup.md`.

## Test plan
- [x] RED: 3 failed, 77 passed, 1 todo in 3 of 3 runs (exactly the three restore-window cases). GREEN: 81 passed in 5 of 5 runs.
- [x] 6 of 6 mutants killed: MJ, the money journey (drop `'budgets.put'`); X1; X3; U1 to U3, each clock pin undone.
- [x] `typecheck:edge`, `test:edge` 162, `test:edge:workers` 343 passed plus 3 todo (was 341 plus 4) under the heavy lock, `build:edge`.
- [ ] CI on this pull request is green.
- [ ] Independent review.

Part of 1A-T8b (#102, closed when #344 merged).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

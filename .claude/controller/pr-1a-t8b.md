## Summary
- Runs retention on the UserVault's alarm (1A-T8b). It covers:
  - `retention.ts`, with three jobs: purge deleted records, prune the change log, drop receipt digests;
  - `nextDue`, the alarm and its re-arming after every commit;
  - `createLunch` for tests.

  It ports `gogospend_purge_entities`, the latest `gogospend_prune_account` (0015_privacy.sql) and the receipt-digest drop.
- Controller rulings (8 November), recorded as deviations in the receipt:
  - The prune is due 30 days after the oldest change group above the retention line, the API's own rule. The plan's literal wording put the alarm in the past and looped.
  - "30 days" is inclusive (`<=`) in all three jobs, so the alarm acts at exactly deletion + 30 days.
  - A failed job is logged by class name only and the others still run. The alarm comes back no sooner than a minute later, and `runDue` returns the failed jobs.
- Independent Opus review of `4ada8f8`: Approved, with no blocker or major. What it checked:
  - A 140-day simulation over three seeds and 234 alarms: nothing was purged early, nothing was left overdue, and no purged record came back to a syncing client.
  - A literal SQLite port of the API's purge gives an identical result; the prune removes a superset of the API's rows, all below the old line.
  - After `erase()` no retention runs and no alarm is kept.
  - It combines cleanly with 1B-T4 (#341; 282 workers passed) and 1A-T7 (#339; 305 passed with the money journey on).
- Follow-ups, not folded in:
  - Pin the prune's inclusive boundary (mutant X1) and the `max(...)` that keeps `pruned_through` from going down (mutant X3).
  - Port the API's `transactions_deleted_idx` and `entity_changes_entity_idx`: `nextDue` scans the table on every write, 2.91 ms at 60,000 transactions against 0.02 ms indexed. This belongs to 1B-T11.
  - Tests that backdate `deleted_at` by SQL arm an alarm in the past.
  - Fix the 1B plan's wording, which says "turned on in 1A-T8a".
- The money journey stays `it.todo`. Once #339 and this merge, a one-line follow-up turns it on (`it.todo` to `it` in `history.test.ts`), with its receipt under `docs/implementation/receipts/` per R87.
- The branch is one task commit on `8f04a3b` and a merge of the integration head `239c3a1`, with no conflicts.

## Test plan
- [x] RED 12 failed, 14 passed, 3 todo on typed stubs. GREEN 26 passed, 3 todo. 16 of 16 mutants killed; 3 equivalent mutants survive and are explained in the receipt.
- [x] `typecheck:edge`; `test:edge` 156; `test:edge:workers` 262 plus 3 todo under the heavy lock; `build:edge` (the vault bundle has no PostgreSQL import). `typecheck:edge` again after the merge.
- [ ] CI on this pull request is green. `test:edge:db` was skipped locally because Docker is stopped.

Closes #102 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## Summary
- Serves history, deleted history (recently deleted) and the monthly summary from the UserVault (1A-T7), ported from the API's own queries. That brings the vault's ported routes from 27 to 30 and empties `VAULT_PENDING_ROUTES`.
- The independent Opus review of `e006074` approved it with no blocker or major. Checked against `apps/api`:
  - filters, ordering, paging, cursors and totals match;
  - recently deleted pads the stored milliseconds to the API's six-digit cursor form;
  - the 30-day window shares the vault restore's cutoff, so the list and restore agree at the boundary;
  - amounts leave SQLite as `CAST(... AS TEXT)`, and every value is bound.
- One deviation, accepted by the controller on 28 October: text search uses SQLite `LIKE`, which ignores case only for ASCII letters ('Café' does not match 'CAFÉ'). Thai has no case and is unaffected.
- The money journey stays `it.todo`. The review showed it passes once switched on; 1A-T8b turns it on after this merges.
- Follow-ups from the review, not folded in:
  - test the search's `ESCAPE '\'` clause with literal `50%`, `a_b` and `\`;
  - pin four lines that survive mutation (the chain revision in both lists, merchant search, and summary category order, which Task 9's parity session will compare);
  - order recently deleted by its cursor key;
  - note the missing `deleted_at` index for 8b's purge.
- The branch is one task commit on `800680d` and a merge of the integration head `f33cdf0`, which had no conflicts.

## Test plan
- [x] RED: 42 of 43 failed on stubs (1 todo). GREEN: 42 passed plus 1 todo. 13 of 13 mutants killed.
- [x] `typecheck:edge`, `test:edge` 156, `test:edge:workers` 290 plus 1 todo (under the heavy lock), and `build:edge`: the vault bundle has no `pg`, `make_interval` or `ILIKE`. On the review's merged tree, all of these passed again. `typecheck:edge` passed again after the final merge.
- [ ] CI on this pull request is green (`test:edge:db` was skipped locally because Docker is stopped)

Closes #100 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

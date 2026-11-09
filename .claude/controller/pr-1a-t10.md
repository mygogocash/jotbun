## Summary
- CI, docs and the phase 1A receipt (1A-T10).
- The plan's workflow step, running `test:edge:workers` in CI, already landed in `b1befec` on 25 October. So `.github/workflows/backend.yml` does not change (P1). Instead, `scripts/ci/backend-workflow.test.mjs` gains one case. It pins the six edge steps in the database job, in order, with the workers suite between the unit tests and the build. It also catches a step moved to another job or run twice (P3).
- `apps/edge/README.md`: five edits, in "The Workers" and "Tests" (P5).
- The phase 1A receipt is its own file under R87 (P4): `docs/implementation/receipts/1A-T10.md`. It covers:
  - the task receipt, then the phase's closing receipt: 29 routes served, 27 deferred and 6 retired;
  - the not-applicable cases from Tasks 3 to 8;
  - 81 mutants killed;
  - the SKIPPED hosted checks and the items still open.

  `premium-progress.md` gains only a two-line pointer, a pure insertion far from the end of the file.
- The controller accepted planner calls P1 to P11. P11: the plan's review of the whole 1A range is the controller's to schedule, after this PR's own review. Closing epic #83 is the owner's call.

## Test plan
- [x] RED on a probe of the workflow from before `b1befec`: `tests 6, pass 5, fail 1`, failing on the new case. GREEN: `test:ops` gives 108 tests, 107 passed and 1 skipped (it was 107, with 106 passed).
- [x] 6 of 6 workflow mutants killed: the step dropped, placed after the build, placed before the unit tests, moved to another job, run twice, or with PostgreSQL before the build.
- [x] `typecheck` and `typecheck:edge`; `test:edge` 14 files and 174 tests; `test:edge:workers` 24 files, 488 passed and 3 todo. Both are unchanged. `build:edge`; `git diff --check`.
- [ ] SKIPPED: `test:edge:db` (Docker is stopped; CI's database job runs it).
- [ ] CI on this pull request is green.
- [ ] Independent review.

Closes #104 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

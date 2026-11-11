## Summary
Fixes the flaky tests that failed CI on most pull requests since 27 October. Test files only, except one two-line API change under R88 (below).
- **Render timeouts near 4 s (RemindersScreen, RecentlyDeletedScreen, QuickAddScreen) and HistoryScreen's fast "toolbar" failure.** The CI runner was not too slow. react-native-web hands a button its new `disabled`/`onPress`, and a new row its long-press handler, in an effect React can run after `findBy` has already returned. Under load, a test pressed a Save that was still disabled, or long-pressed a row that was not wired yet. Now `apps/app/src/testing/renderSetup.ts` wraps Testing Library's `asyncWrapper`, so every `findBy`/`waitFor` also waits for React's queued work.
  - Delaying React's scheduler by 20 ms: 19 to 20 failures in 150 tests before, 150 of 150 after; removing the new wait brings them back.
  - Under CPU load: 31 of 36 runs passed before, 36 of 36 after.
  - The full render suite is the same size (85 files, 1,603 tests) and takes no measurably longer.
- **`apps/api/src/auth/request-context.spec.ts` (R85).** The test asserted that no log contains `6500`, and a random request id sometimes did. It now checks each request id's shape and looks for the amount in every other field. All 10 log-leak mutants are still caught.
- **`apps/api/src/privacy/retention.integration.spec.ts` (R85).** This was not clock skew. The test built an accepted row's acceptance and expiry from two separate `Date.now()` calls, so a 1 ms tick made the gap 24 h + 1 ms and broke `import_uploads_check3`. It now reads the time once.
- R85 (controller, 8 November): `apps/api` is frozen, but these two test-only changes are allowed.
- **`apps/api/src/imports/upload-intake.ts` (R88, second commit `aa73f4b`).** A body that kept trickling was sometimes recorded as `upload_stalled`, when the absolute receive deadline had passed and it should have been `upload_timeout`. When less than the idle limit is left, the wait is the deadline itself, but the reason was chosen with `Date.now() >= deadline`, and Node's timer can fire a millisecond early. The reason now follows the wait it used. Only the recorded reason changes: the 408 and the moment the body ends stay the same. A new deterministic test (a `Date.now` spy, restored in `finally`) fails on the old code. R88 (controller, 8 November) allows this production change in the frozen `apps/api`.
- Independent Opus review of both commits: Approved, with no blocker or major. It reproduced the race and confirmed the cause is react-native-web's late effect, not the runner. The wait cannot hang, and the assertions keep their meaning. The full render suite passed: 86 files, 1,609 tests. Follow-ups, not folded in:
  - The receipt still says no API source changed and `test:api` 955; it is fixed in the ledger consolidation.
  - Assert that each logged `request_id` is one of the responses' `x-request-id` headers.
  - Add a once-only guard on the wrapper, in case test isolation is ever turned off.
- Follow-up, not fixed: an ImportReview 1 ms poll race, so far not seen on CI.

## Test plan
- [x] Render flake counts before and after (above); full `test:render` 85 files, 1603 tests, 0 act warnings, 0 unhandled errors
- [x] `typecheck`, `typecheck:app`, `test:api` 956, API build, release graph; `upload-intake.spec.ts` 97 of 97 five times in a row
- [ ] CI on this pull request is green (`test:db`, the only suite that runs the retention spec, was skipped locally because Docker is stopped)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## Summary
Fixes two flaky tests in the frozen API's database suite. Test files only; no production code changes. Ruling R91 (controller, 8 November).
- **`command-executor.integration.spec.ts`, "commit order is revision order" (R-A).** The test recorded "first" when the first command's caller got its reply. PostgreSQL wakes the waiting second command inside the first one's COMMIT, before that reply is sent, so on a busy runner the second's mutation ran first. The locking was still correct throughout. The test now reads the account revision inside the second command's mutation and asserts `'1'`, which proves the first one had committed. It keeps the checks that the second waited during the hold and that revisions run in order.
- **`export.integration.spec.ts`, "at most four export downloads run at once" (R-C).** The test could deadlock itself. When one of the four held downloads was slow, the fifth took its slot, and the test then waited on the fifth, whose body could only finish after the test opened its own gate. A longer timeout would still hang. The test now waits until four files are open, instead of a fixed 300 ms, holds back only those four, and fails at once if a held download ends early.
- **Not in this PR, R-B (waiting on the owner):** `attachments.integration.spec.ts`, "two records retaining one image … one copy", is a real but minor production race. `gogospend_reserve_receipt_copy` (migration 0017) checks "receipt exists" and "copy in flight" in two statements, so two requests can each reserve a copy. The wasted copy is deleted at the next sweep. The fix is a new migration (`0020_receipt_copy_once.sql`) in the frozen API, which needs the API's migration step wherever it runs. Until the owner decides, that test stays a rare known flake.
- The receipt is in `docs/implementation/receipts/fix-api-db-flakes.md` (R87).

## Test plan
- [x] Database-free models of both races fail on the old test logic and pass on the new, 5 runs in a row. Three model mutants were caught.
- [x] `typecheck`, `test:api` 981, the API build and the release graph check all pass.
- [ ] CI's SQL job is green. It is the first real run of the two changed specs, because Docker is stopped locally.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

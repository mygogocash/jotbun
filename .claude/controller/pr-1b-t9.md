## Summary
- Receipt attachments on the vault (1B-T9):
  - the retain and replace Worker routes, which copy a preview's sanitized image inside R2 between two vault steps;
  - the remove command;
  - the five-minute, session-bound grant;
  - the download route.
- New files: `src/vault/files/attachments.ts` and `src/v1/files/receipts.ts`, with `test/workers/attachments.test.ts` (52 cases).
- Nine shared files take additive edits after 1B-T6's, in the places 1B-T6's brief reserved: the protocol ids, the routes, the worker routes, `downloads.ts`'s `serveReceiptFile` under `// 1B-T9: receipts.`, the vault routes, the command registry (after the export entries), `transactions.ts`, the route-coverage test and the files test support.
- **R-B does not reach the vault (P2).** `prepareReceipt` decides "receipt exists" and "copy in flight" in one block, and the command publishes the copy and records the receipt in one block, so a second copy of the same image can never be reserved. Two cases pin it. The owner's migration 0020 question concerns `apps/api` only.
- The controller accepted planner calls P1 to P17. Look first at:
  - P1: a copy past its own three-minute deadline answers 422, not 500;
  - P3: the copy slot is taken before the prepare step, as the API does;
  - P5: the copy is a `copy` then a `head` under one deadline;
  - P7: 40 of the API's 45 cases are ported, and 5 are not applicable;
  - P11: the command kinds come from `attachments.service`, with no PostgreSQL driver in the bundle;
  - P13: R96's HEAD cases (`headOf` reads the dropped body to its end).
- R97: an aborted download keeping its slot is a separate follow-up task covering every vault download; this PR does not change it. The receipt is its own file under R87: `docs/implementation/receipts/1B-T9.md`.

## Test plan
- [x] RED: 50 of 52 failing, every one an assertion; the 2 that pass are by design. GREEN: 52 of 52, with nothing on stderr.
- [x] 49 of 49 mutants killed, every file restored byte for byte.
- [x] `typecheck:edge`; `test:edge` 15 files and 176 tests (+0); `test:edge:workers` 26 files, 576 passed and 3 todo (the head's 524, plus 52).
- [x] `build:edge`: every PostgreSQL driver marker counts 0 (R95); `git diff --check` is clean.
- [ ] SKIPPED: `test:edge:db` (Docker is stopped; CI's database job runs it); nothing is deployed, so there is no R2 bucket or lifecycle rule to check.
- [ ] CI on this pull request is green.
- [ ] Independent review.

Closes #113 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

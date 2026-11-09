## Summary
- Import previews, review and confirmation on the vault (1B-T10). A person reviews a statement import's preview and confirms it in batches of 500.
  - New: `src/vault/files/previews.ts` and `src/vault/files/confirmation.ts`, with `test/workers/imports-review.test.ts` (62 cases).
- Shared files take additive edits after 1B-T9's: the protocol ids, the routes, the worker routes, the vault routes, the command registry, the route-coverage test and the files test support.
  - From 1B-T9: `receipts.ts`'s `prepare` is generalized and gains `confirmRoute`; `attachments.ts` exports `ready` and `SOURCE_MARGIN_MS`.
  - Two other tasks' pinned lists are extended additively (P19): 1A-T8a's registered entities in `sync.test.ts`, and 1B-T5's steps in `imports-intake.test.ts`.
- The controller accepted planner calls P1 to P19. Look first at:
  - P1: the two steps.
  - P2: the plan's `PreparedCopy` gains a `refused` answer, so a batch whose checks refuse before any copy, but whose command then passes, gets the API's 503.
  - P8: a plain `JOIN` made the 5,000-row freeze quadratic (6.2 s against 0.15 s). It now uses `CROSS JOIN`, pinned by a 2-second bound.
  - P10: the retention rules. Each due time is acted on inclusively, and `importsDueAt` never names a synced record before its preview or selection expires.
  - P12: 44 cases ported (12 in changed form), 8 not applicable, and 18 added.
- 1B-T8 and 1B-T7 follow in this lane, after the `// 1B-T10` entries. The receipt is its own file under R87: `docs/implementation/receipts/1B-T10.md`.

## Test plan
- [x] RED: 60 of 62 failing, every one an assertion; the 2 the brief names pass. GREEN: 62 of 62, with nothing on stderr.
- [x] 84 of 84 mutants killed, every file restored byte for byte.
- [x] `typecheck:edge`; `test:edge` 15 files and 176 tests (+0); `test:edge:workers` 27 files, 638 passed and 3 todo (the head's 576, plus 62).
- [x] `build:edge`: every PostgreSQL driver marker counts 0 (R95); `git diff --check` is clean.
- [ ] SKIPPED: `test:edge:db` (Docker is stopped; CI's database job runs it); nothing is deployed.
- [ ] CI on this pull request is green.
- [ ] Independent review.

Closes #114 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

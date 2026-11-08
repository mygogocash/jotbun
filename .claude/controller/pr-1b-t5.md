## Summary
- Statement uploads and the parse pipeline on the vault (1B-T5, critical path):
  - `POST /v1/imports` streams a statement into R2 quarantine through the vault's object registry, in parts with reservations and deadlines.
  - An accepted import is queued (`parse-consumer.ts` on a Queue with `max_concurrency` 1) and parsed by the stateless parser Container (`statement-parser.ts`, built from `apps/api`'s parser).
  - The preview and its candidates are recorded back in the vault (`recordPreview`). The import's state reads through `uploadStatus`.
- New code: `src/vault/files/intake.ts`, `src/vault/files/parse.ts`, `src/v1/files/uploads.ts`, `src/background/statement-parser.ts`, `src/background/parse-consumer.ts`, with 81 Workers cases (43 intake, 38 parse). Shared files take additive edits in named places, and 1D-T10's lines are untouched.
- The planner's calls P1 to P17 were accepted by the controller (receipt, Deviations). The ones to look at first:
  - **P1:** four upload steps (`reservePart`, `abort`, `discarded`, `bytesWait`) skip the vault's session and policy checks (`anySession`), as in the API. A person who signs out mid-upload doesn't leave parts in R2 until the deadline; `begin` and `finish` still check.
  - **P4:** the parse starter also re-sends an import left `parsing` once `PARSE_RESEND_MS` has passed, so a consumer that died mid-parse can't leave a job stuck.
  - **P6:** every publish builds its context after its PUT and checks its own deadline, as #348 requires. `finishUpload` needs `delete_after > now` on every part; the image publish also needs `created_at + RESERVATION_GRACE_MS > now`.
  - **P17:** an import sent twice by overlapping starts is parsed once.
- R92 does not apply: both routes answer `ImportJobDto` from plain columns. The receipt tells 1B-T10 that the two stored `issues` columns are jsonb on the NestJS side and must go through `jsonbOrder`.
- No cloud resource was created and nothing was deployed. The container path is untested locally, because Miniflare runs with containers disabled. The receipt is its own file under R87: `docs/implementation/receipts/1B-T5.md`.

## Test plan
- [x] RED pass 1 (every new module a typed stub): 78 of 81 failing. RED pass 2 (intake real, pipeline stubbed): 39 of 81 failing. All failures are assertions. GREEN: 81 of 81.
- [x] 27 of 27 mutants killed, every file restored.
- [x] `typecheck:edge`; `test:edge` 173; `test:edge:workers` 473 passed plus 3 todo in 24 files, under the heavy lock; `build:edge` names the queue, the `PARSER` binding and `StatementParser`.
- [ ] SKIPPED locally: `test:edge:db` and the plan's Docker proof (Docker stopped); CI's database job runs the database suites.
- [ ] CI on this pull request is green.
- [ ] Independent review.

Closes #109 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

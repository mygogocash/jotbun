## Summary
- **1B-T12, the files parity session against the vault Worker.** A new test, `vault-parity-files.db.test.ts`, runs the v1 files session against NestJS and against the vault Worker started with background work off. It then compares the 40 compared steps, normalized exactly as the PostgreSQL edge's parity test does.
- **No vault code changes.** With background work off, the vault already gives the answers the planner traced through the API's code, step by step (brief Appendix B). Nothing under `apps/edge/src` changes.
- **The session is shared:**
  - The files session and its user builders move into `test/support/files-session.ts` (P2). `parity-files.db.test.ts` keeps running the PostgreSQL edge through it, with the same 42 steps.
  - `startVaultWorker` gains a background option and exposes the config it started (`test/support/vault-worker.ts`). With its defaults, 1A-T9's money session still gets its 49 statuses (the money smoke).
- **Beyond the plan:**
  - P4 adds a third case that checks B13's config as written: no Workflows, queue consumers or containers, and `PARSE_QUEUE`'s producer kept. A kept queue consumer shows in the comparison only by a race, and a kept container not at all.
  - P5: the comparison's message names R92, since vitest prints keys sorted.
  - P6: `afterAll` stops the vault Worker, NestJS and the database.
- **n8, listed and not changed (P3):** from about day 8 to day 30 after a build, NestJS answers a snapshot's status and a resend with `expired`, where the vault answers 404. The session cannot reach that window. The fix would edit the snapshot files fix-download-aborts holds now. The difference is written in the new test's header and in the receipt; an optional follow-up is in the controller's notes.
- **Carry-ins:**
  - 404 for the preview of a never-accepted upload: proven by the planner's local probe (mutants M11 and M12); the committed pin stays with fix-download-aborts.
  - R101 is not reached, since no build runs in the session.
  - The session has no AI step.
- The controller accepted the planner's calls P1 to P11 (receipt, Deviations). No route, package, lockfile, app, API or database change. The receipt is its own file under R87: `docs/implementation/receipts/1B-T12.md`.

## Test plan
- [x] RED, with the background stub: 2 of 4 failing. Steps 3, 5, 15 and 17 listed, and the B13 case failing on the kept `workflows`.
- [x] GREEN: 4 of 4 in three runs, with no step listed.
- [x] The local smokes in workerd, under the heavy lock:
  - the vault's 40 answers against `expected-nest.json`;
  - 1A-T9's money session (49 statuses) through the edited helper.
- [x] 12 of 12 mutants killed, each listing the steps the brief's table gives; the four files match the planner's verified copies.
- [x] R100's fast gate:
  - `typecheck:edge`;
  - `test:edge`: 15 files and 176 tests, under the heavy lock;
  - `build:edge`, with every PostgreSQL marker at 0;
  - `git diff --check`.
- [ ] CI on this pull request is green. The `edge` job runs `test:edge:db`, which holds the real NestJS comparison: the new file adds 1 file and 3 cases. GitHub Actions is paused for billing; CI runs once that is fixed.
- [ ] Independent review (Sonnet: size S).
- [ ] SKIPPED: `test:edge:db` locally (Docker stopped; CI runs it).

Closes #116 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

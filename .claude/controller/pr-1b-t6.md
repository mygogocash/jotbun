## Summary
- Exports on the vault (1B-T6):
  - the request command, behind a fresh sign-in;
  - the status, grant and download routes;
  - the vault's write of the CSV into R2, published before its deadline;
  - `ExportWorkflow` and its starter;
  - `pruneExports` with `exportsDueAt`.

  The Worker streams a download only behind a five-minute grant.
- New files: `src/vault/files/exports.ts`, `src/background/export-workflow.ts`, `test/workers/exports.test.ts` (33 cases) and `test/exports-port.test.ts` (Node, 2 cases).
- Thirteen shared files each take an additive edit, in the places the brief names, after 1B-T5's:
  - `protocol.ts`, `routes.ts`, `worker-routes.ts`, `downloads.ts`, `vault/routes.ts`;
  - the command registry, `user-vault.ts`, `work.ts`, `roles/vault.ts`;
  - `cloudflare-workers.d.ts` and `wrangler.vault.jsonc`, which gain the `workflows` entry and `limits.cpu_ms` 120000;
  - the route-coverage and sync tests.
- The controller accepted the planner's calls P1 to P14. The ones to look at first:
  - P1: the writer's context function, built after the PUT, as 1B-T4's follow-up asked;
  - P2: the API export service's two names, restated with a Node pin test, because that service imports `pg`;
  - P3: the deadline throw;
  - P4: a start made twice;
  - P6: the ported cases.
- Built on `38361b1`, after 1B-T5 merged. #352 had changed two of the shared test files, so they carry the planner's edits on top of #352's lines.
- R95: the build check for "no PostgreSQL code in the vault bundle" now counts driver markers (0), not the word `node-postgres`, which #352's `jsonbOrder` doc comment uses in prose. The receipt is its own file under R87: `docs/implementation/receipts/1B-T6.md`.

## Fix round (review of 34798c8, ruling R96)
- A HEAD on the download route held a download slot for good: `headOf` dropped the GET's body without releasing it, so four HEADs made every member's export download answer 503 in that isolate. `headOf` in `src/v1/handler.ts` now reads the dropped body to its end before answering (R96, as amended: cancelling does not reach the slot in workerd, proven under `wrangler dev`). It sits at the front door, so 1B-T8's and 1B-T9's downloads are covered too.
- Three new cases: HEADs on a multi-chunk export, then a GET that answers 200, with each HEAD reading the whole file; the vault-active check at the start of the write (review m-1); and the slot returned after a failed download (m-2).

## Test plan
- [x] RED: Node 1 of 2 failing, and workers 33 of 33 failing, every one an assertion. GREEN: 2 of 2 and 33 of 33.
- [x] 27 of 27 mutants killed, every file restored byte for byte.
- [x] `typecheck:edge`; `test:edge` 15 files and 176 tests; `test:edge:workers` 25 files, 521 passed and 3 todo. Those are the head's 174 and 488, plus this task's 2 and 33.
- [x] `build:edge`: the built vault config carries `ExportWorkflow` and `{'cpu_ms': 120000}`, and no PostgreSQL driver code (R95). `git diff --check` is clean.
- [ ] SKIPPED: `test:edge:db` (Docker is stopped; CI's database job runs it); the deployed Workflow, the CPU limit and retention, because nothing is deployed.
- [x] Fix round: RED 1 of 36 (the HEAD case), GREEN 36 of 36; 4 of 4 mutants killed (the old `headOf`, cancelling instead of reading, the active check, the slot release); `test:edge` 176; workers 25 files, 524 passed and 3 todo.
- [ ] CI on this pull request is green.
- [x] Independent review (Needs fixes: M-1, fixed in the round above).
- [ ] Confirming review of the fix round.

Closes #110 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

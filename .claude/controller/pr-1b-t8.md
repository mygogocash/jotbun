## Summary
- Resync snapshots in the vault (1B-T8). `POST /v1/sync/snapshots` requests one: a ready or open snapshot is reused, and a resend answers its own. The status route grants its chunks.
- SnapshotWorkflow builds a snapshot from one synchronous read of the entity heads, in the API's order (by entity, then id). Each chunk is stored in R2 under its own reservation. The snapshot is recorded only while that view is still current and the vault still active, and never past the build's own deadline (P1 to P3, the 1B-T4 follow-up).
- **R101 (controller):** a build whose view was read below the purge watermark throws, so the Workflow step retries with a fresh read, as the API retries `snapshot_not_recorded`. The plan said `skipped`, which would leave the snapshot pending with its Workflow finished. A snapshot no longer pending, or a vault no longer active, still answers `skipped`.
- Chunk downloads stream from a slot pool of their own (4 per isolate), checking size and digest as they go. A HEAD reads the whole chunk, so it frees its slot (R96). In workerd, an aborted GET still keeps its slot (R97); the follow-up fix-download-aborts covers `serveSnapshotChunk` with the other downloads.
- **The ten-times memory proof:** 33,000 records, a 50.1 MB vault, in 19 chunks. The build holds at most what it stores plus one chunk and the longest line (`peakHeldBytes` 20,644,119 against a bound of 20,644,976), and the export at most twice its CSV. Every assertion compares bytes and counts, never time, and the case runs only under the heavy lock.
- The three snapshot cases 1A-T8a left in `test/workers/sync.test.ts` now run SnapshotWorkflow through the front door; the focused todos go from 3 to 1.
- The controller accepted the planner's calls P1 to P17 (receipt, Deviations). R92: snapshot values go through `jsonbOrder`. R95: every PostgreSQL driver marker counts 0 in the vault bundle, and the vault config names both Workflows.
- No package, lockfile, app, API or database change. The receipt is its own file under R87: `docs/implementation/receipts/1B-T8.md`.

## Test plan
- [x] RED on typed stubs: 38 of 53 failing, every one an assertion. GREEN: 52 passed and 1 todo in the two focused files.
- [x] 62 of 62 mutants killed, each file restored; the 16 files match the planner's verified copies.
- [x] R100's fast gate: `typecheck:edge`; the focused run with the ten-times case (52 passed, 1 todo, under the heavy lock); `test:edge` 15 files and 176 tests; `build:edge` (no driver markers; `ExportWorkflow` and `SnapshotWorkflow` in the config); `git diff --check`.
- [ ] CI on this pull request is green: the full workers suite (+1 file, +37 passed, -2 todo) and the database suites run there.
- [ ] Independent review.
- [ ] SKIPPED: `test:edge:db` locally (Docker stopped; CI's database job runs it), hosted checks (nothing is deployed), and the deployed 128 MB isolate limit (the named risk).

Closes #112 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

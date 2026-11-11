## Summary
- **The fix-download-aborts follow-up (ruling R97).** In workerd, a download whose client goes away mid-body keeps its download slot. Four such downloads closed that download kind for every member in the isolate (503). This must land before 1B-T13.
- **The fix: one helper, `untilReturned(w, release)`, in the new `src/v1/files/slots.ts` (P1).**
  - It hands `w.waitUntil` a promise and returns a release that gives the slot back and ends that promise.
  - The runtime therefore keeps the request until its slot is returned: at the body's end, on failure, on cancel (`bodyStream`'s `onClose`) or in the `catch`.
  - A request refused before it takes a slot (404, 503) hands nothing over (P2).
- **Wired at five call sites:**
  - `serveExportFile`, `serveSnapshotChunk` and `serveReceiptFile` (`downloads.ts`);
  - `prepare`'s copy slot (`receipts.ts`, P3);
  - the upload's place among the isolate's 16 (`uploads.ts`, P4, the planner's addition, accepted).

  Locally, retains and uploads do not leak, because `wrangler dev` runs a handler on after its client leaves. Cloudflare documents that the deployed runtime may cancel that work unless it is passed to `ctx.waitUntil()`, so the wrapper covers it.
- **`handler.ts`:** the two `headOf` returns inside the `try` are awaited (1B-T6's confirming review, n-1; P8, equivalent today). R96's HEAD drain is unchanged (P10).
- **The test pins the wiring, not the leak (P5, P6):**
  - The Workers test runtime keeps every request alive, so the new `download-aborts.test.ts` (5 cases) watches the promises handed to `waitUntil`: pending while a slot is held, ended once it is returned.
  - Each case makes one download more than the person's slots, so a slot that is never returned refuses one of them.
- **The `wrangler dev` proof** is in the planner's kit; its seeding entry is never committed (P7).
  - Base: export, snapshot chunk and receipt each answer 503 after four aborted GETs.
  - Fix, on this tree:
    - export, snapshot chunk and receipt are each served whole after four aborted GETs, and again 5 s later;
    - four aborted retains, then a retain answers 200;
    - sixteen aborted uploads, then an upload answers 202.
- **Residual (P9):** `waitUntil` keeps a request at most 30 s after its client goes away. A copy still running 30 s after its client left would be cut and keep its slot. This cannot be shown locally; the receipt names it.
- **The test-only pins** from the reviews of 1B-T6 to 1B-T11 are a second brief, `download-pins`, sharing no file with this one. Its every item's home is in this brief's table.
- The controller accepted the planner's calls P1 to P11 (receipt, Deviations). No route, package, lockfile, app, API or database change. The receipt is its own file under R87: `docs/implementation/receipts/fix-download-aborts.md`.

## Test plan
- [x] RED: 5 of 5 failing on the typed stub, every one an assertion ("pending" checks). GREEN: 5 of 5.
- [x] 9 of 9 mutants killed; the six files match the planner's verified copies.
- [x] R100's fast gate:
  - `typecheck:edge`;
  - the 11 affected workers files, 335 passed and 1 todo, under the heavy lock;
  - `test:edge`, 15 files and 176 tests;
  - `build:edge`, with every driver marker at 0;
  - `git diff --check`.
- [x] The `wrangler dev` proof on this tree, under the heavy lock: 6 of 6.
- [ ] CI on this pull request is green (the nine jobs: workers +1 file and +5 passed). GitHub Actions is paused for billing; CI runs once that is fixed.
- [ ] Independent review (Opus: size M).
- [ ] SKIPPED:
  - `test:edge:db` locally (Docker stopped; CI runs it);
  - hosted checks: the deployed runtime's cancellation (P3, P4) and the 30-second limit (P9). Nothing is deployed.

No task issue: a follow-up from the reviews of 1B-T6 to 1B-T11 (ruling R97).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

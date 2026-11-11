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
- **The fix round (the review's m1 and n2 to n4; commit `763edb3f`, test-only):** the review approved `d0cc479` and turned its minors into pins. `download-aborts.test.ts` goes from 5 cases to 7:
  - a retain that waited on another request's copy hands `waitUntil` a promise on its later attempt too (m1);
  - an upload turned away at the isolate's limit (503) hands nothing over (n2);
  - each download case is refused with 404 after it took its slot, so all three `catch` paths are pinned (n3);
  - each case takes its own slots inside its `try` and records the count, so a leaked slot shows in the case's lines (n4).
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
- [x] CI on this pull request is green: 9 of 9 jobs at `763edb3f`, on the local runners.
  - The SQL job's first attempt hit a flake in `apps/api`, which this PR does not touch: `retry_after` was 181 where at most 180 is expected. It passed on a rerun.
  - The edge job: `test:edge` 176, `test:edge:workers` 774 passed and 1 todo, `test:edge:db` 68.
- [x] Independent review (Opus): Approved on `d0cc479`; its minors went into a test-only fix round (`.claude/controller/reviews/fix-download-aborts.md`).
- [x] Fix round (`763edb3f`, brief `.claude/controller/briefs/fix-download-aborts-fix.md`):
  - RED: R11, R13, R13b, R13c and R14 each fail exactly their own case.
  - GREEN 7 of 7, and 14 of 14 mutants killed.
  - The test file is byte-identical to the planner's kit (sha256 `07dbb573…`).
  - Gate: `typecheck:edge`, `test:edge` 176, `build:edge`, `git diff --check` and gitleaks are all clean.
- [x] The fix is test-only, so the controller checked it instead of a second review. Only the test file and the receipt changed.
- [ ] SKIPPED:
  - `test:edge:db` locally (Docker stopped; CI runs it);
  - hosted checks: the deployed runtime's cancellation (P3, P4) and the 30-second limit (P9). Nothing is deployed.

No task issue: a follow-up from the reviews of 1B-T6 to 1B-T11 (ruling R97).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

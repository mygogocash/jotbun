# 1B-T6 confirming review: the fix round (PR #362, 2cf8315)

- **Reviewer:** Opus, read-only. The fix round is one commit, `2cf8315` on `p1/1b-t6-exports`, on top of the reviewed `34798c8`, with no merge. It changes `apps/edge/src/v1/handler.ts` (`headOf` and its comment), appends three cases to `apps/edge/test/workers/exports.test.ts`, and appends a section to `docs/implementation/receipts/1B-T6.md`. All three files are byte-identical to the fix planner's kit (`f2e6afa3…`, `aa63244b…`, and the brief's `47033b7d…`).
- **Scratch:** `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t6-confirm/`. `tree/` is `git archive 2cf8315` with the worktree's `node_modules` linked. Every probe edit there was restored byte for byte (`before-mutants.txt` and `before-instrument.txt` check OK), and the last build is clean. The worktree is untouched (`git status` clean, HEAD `2cf8315`).
- **Verdict:** Needs fixes, for one major that is **not in this round's diff**.
  - The fix round itself is right. Every focus item holds in both runtimes, and the gate, the mutants and CI match the receipt.
  - But rerunning the real-runtime proof showed that a GET whose client goes away mid-download keeps its slot. The mechanism is the one that made the cancel fail (MA-1).
  - If the controller rules MA-1 a follow-up, nothing else here blocks.

## Findings

### Major

**MA-1. A download whose client goes away before the end keeps its slot (outside this round's diff: in 34798c8).**

- **Where:**
  - `serveExportFile` (`src/v1/files/downloads.ts:58-62`) returns its slot only when `bodyStream` ends, fails or is cancelled (`src/server/http/files.ts:79-86`, `97-108`). `fileResponse` puts that stream behind a `FixedLengthStream` (`files.ts:119-120`).
  - The fix round's own proof (R96's amendment) is that in the Workers runtime, a cancel on the response does not reach the stream behind the `FixedLengthStream` before the request ends. When a client disconnects mid-download, the runtime issues exactly that cancel.
  - 2cf8315 does not touch the GET path, as it should not. The first review's M-1 assumed a cancel returns the slot. The fix planner's proof that it does not is what exposes this.
- **Evidence:** `wrangler dev` on the built vault Worker (the repo's `test/support/vault-worker.ts` harness), with my probe `tree/apps/edge/test/confirm-head.test.ts`, under the heavy lock.
  - **On 2cf8315 as built:**
    - The export is 568,346 bytes. Four GETs whose client aborts right after the headers each answer 200.
    - The next GET answers 503 `SERVICE_UNAVAILABLE`, and 503 again 5 seconds later (`observations-drain.txt`).
  - **With logging added** to the slot and to `bodyStream` (scratch only, restored):
    - Each aborted GET logs `slot-taken` and then nothing: no `body-end`, `body-cancel`, `body-error` or `slot-released`.
    - In the same Worker, every HEAD and every full GET logs `body-end` and then `slot-released` (`observations-instrumented.txt`).
  - **With one more scratch change:** `serveExportFile` hands `w.waitUntil` a promise that its `release` settles.
    - The same four aborted GETs each log `body-cancel` and then `slot-released`.
    - The next GET answers 200, and 200 again 5 seconds later (`observations-waituntil.txt`).
- **Impact:** the same as M-1.
  - Four interrupted downloads close export downloads in that isolate for every member, until the isolate is recycled. Typical causes: an app sent to the background, a dropped mobile connection, a cancelled download, or a member doing it on purpose.
  - A HEAD whose client goes away before its read ends has the same window (not probed).
- **The reference code has the same flaw:**
  - The PostgreSQL edge's export and attachment downloads (`src/server/app/routes.ts:341-346` and `429-437`) return their slots the same way.
  - The API does not leak: it returns the slot on the response's `close` (`apps/api/src/exports/exports.controller.ts:94-95`).
- **Fix direction, for the controller to rule on:**
  - In `serveExportFile` (this task's file), hand `w.waitUntil` a promise that settles when the slot is returned, so the request stays alive until the runtime's cancel reaches `bodyStream`. This is the scratch change above.
  - `bodyStream` and `fileResponse` stay as the plan names them, and `src/server/http/files.ts` (reference code) is not touched.
  - The Workers test runtime cannot show this leak: a test's request context lives on, as the brief says of the cancel. The proof has to be a `wrangler dev` probe like this one, plus a case that pins the `waitUntil` promise: pending while the body is unread, settled once the body ends or is cancelled.
  - The v1 test client's `settle()` awaits every `waitUntil` promise. A case that leaves a download unread before `settle()` would then wait on it.
  - With that change in place, R96's HEAD could go back to a cancel instead of a full read. I did not probe this.

### Minor

None.

### Nits

- **n-1. Two callers return `headOf(...)` inside `try` without `await`** (`handler.ts:129` and `:147`).
  - Now that `headOf` is async, a rejection there would skip the `catch` and `errorResponse`.
  - It cannot reject today. The `.catch` covers the read, and the one synchronous throw, a locked body, is unreachable. So this matters only if `headOf` changes.
  - `return await headOf(...)` would remove the reliance on the comment's "Never rejects". The third caller (`:181`) is already awaited, through `return await runWorker(...)`.
- **n-2. The HEAD case's byte counter is shared by its four HEADs.**
  - A read still running after HEAD n answers is counted in HEAD n+1's entry.
  - My mutant F5 (the read started but not awaited) is killed, steadily (2 of 2 runs), but only through HEAD 1's entry (`0`). HEADs 2 to 4 show 369,116, read for the HEAD before them.
  - A counter per HEAD would make each entry its own proof. Carried below for 1B-T8 and 1B-T9.
- **n-3. The receipt's Base line is one docs file out of date.**
  - It says the integration head gained nothing under `apps/edge` since `34798c8`. But #363, merged at 15:46, three minutes before the fix commit, changed `apps/edge/README.md` and `scripts/ci/backend-workflow.test.mjs`.
  - Neither is code the edge suites run. CI's run on 2cf8315 started at 15:50 and passed, and GitHub reports #362 `MERGEABLE` (`CLEAN`).

## What holds

### 1. R96, as amended

- **What `headOf` does** (`handler.ts:209-213`):
  - For any method but HEAD, it returns the response object it was given, unchanged, so no GET changes.
  - For a HEAD, it awaits `response.body?.pipeTo(new WritableStream())`, swallows a failed read, then answers with the status and headers and no body.
  - Its three callers are `:129` (the public policy list), `:147` (every vault call) and `:181` (Worker routes).
- **Every HEAD-able route.** `match.ts:15` serves HEAD from the GET route, so all 17 GET routes are HEAD-able.
  - **JSON answers:** the policy list, the catalogue (a `VaultReply`) and every vault call answer through `jsonResponse` or `problemResponse`. The body is a string, or there is none for a 204.
  - **`GET /v1/export-files/:grant`:** a stream of the recorded length that ends or fails. Either way, `bodyStream` returns the slot. Probe P1 below covers a file that fails mid-read.
  - **`/v1/sync/live` and every thrown error** return before `headOf`, so nothing there is read.
  - So no body that reaches `headOf` is endless. An R2 read that stalls holds a HEAD as long as it holds the GET's body: `serveExportFile` sets no idle limit, and neither does the reference edge's export route.
- **The real runtime, rerun** (`wrangler dev` on the built vault Worker of 2cf8315, under the lock):
  - **Four HEADs, then a GET** (`observations-drain.txt`):
    - On a 233,886-byte export, each HEAD answers 200 with `content-length: 233886` and no body, in 6 to 10 ms.
    - The GET then answers 200 with all 233,886 bytes and the recorded SHA-256, and 200 again 10 seconds later. Another member's download answers 200.
    - In the instrumented build, each HEAD logs `slot-taken`, `body-end` and `slot-released`.
  - **R96's first wording**, rebuilt with `headOf` cancelling the body (scratch only, restored; `observations-cancel.txt`):
    - Each HEAD logs `slot-taken`, `head-cancel` and `cancel-resolved`, and never `body-cancel` or `slot-released`.
    - The GET answers 503, and 503 again 10 seconds later. Another member's download also answers 503.
    - This matches the fix planner's `proof-wrangler-cancel*.log`. The amendment is needed.
  - **A HEAD on 17 other paths:** the 15 JSON GET routes, `/v1/sync/live` and a bad export grant.
    - Each answers its GET's status (200, 400, 404 or 422), with no body, in 1 to 5 ms.
    - That includes `/v1/sync/changes`, whose GET body is 278,176 bytes.
- **Probe P1** (Workers runtime, scratch only; `probe-p1*.log`):
  - The setup: a stored file swapped for same-size bytes under the same recorded digest.
  - Five HEADs (one more than `EXPORT_SLOTS`) each answer 200, with the recorded length and no body.
  - The GET answers 200, and its body fails with `file does not match its record`. A good export then downloads, with its SHA-256.
  - So `headOf` does not reject when the read fails, and a failed read returns its slot.
  - P1 passed alone, and after the file's 36 cases.
- **Cost, as the brief says:** a HEAD now does a GET's R2 read and digest, and holds a slot while it reads (6 to 10 ms for 233 KB locally). The read budget bounds it, as it bounds a GET.

### 2. The cases pin the fix

- **The planner's runner** (`mutants.py`, its checksum OK), run on my copy under the lock (`mutants.out`):
  - **F1, the old `headOf`:** kills the HEAD case. The HEADs read 0 and 8,192 of 369,116 bytes, and the GET answers `[503, null]`.
  - **F2, a cancel:** kills the HEAD case through the byte counts alone (0 and 8,192 of 369,116). The `file` half matches `[200, digest]`, so the byte count is the only thing that catches F2.
  - **F3:** kills the m-1 case (`expected 1 to be +0`, one `put`).
  - **F4:** kills the m-2 case (`[404, 404, 404, 503, 503]`; the earlier tampered-file case keeps one slot under F4), and the HEAD case.
  - All four files were restored: `shasum -c` gives 4 OK.
- **My own runner** (`confirm_mutants.py`, `confirm-mutants.out`):
  - F5 (the read not awaited) is killed in both runs (see n-2).
  - F6 (read one chunk, then cancel) is killed: 4,096 and 12,288 of 369,116 bytes.
- **What m-1 and m-2 pin:**
  - m-1 pins the read-time check at `exports.ts:233`. The publish's check is at line 259.
  - m-2 pins the `release()` in the `catch` at `downloads.ts:63-66`.
  - The m-1 case calls the module's `writeExport` with the vault's own `isActive` (`writerOf`), so `UserVault#writeExport`'s own checks cannot mask F3.

### 3. The gate, on the scratch copy of 2cf8315

- `typecheck:edge`: exit 0.
- `test:edge`: `Test Files 15 passed (15)`, `Tests 176 passed (176)`.
- `test:edge:workers`, under the lock: `Test Files 25 passed (25)`, `Tests 524 passed | 3 todo (527)`.
- The focused `exports.test.ts`: 36 passed. The stderr events are as the receipt says:
  - `export_write_failed` 1 and `object_delete_failed` 1;
  - two `Uncaught (in promise)` lines.
- `build:edge`: exit 0.
  - The vault's `wrangler.json` has `ExportWorkflow` and `{'cpu_ms': 120000}`.
  - The R95 driver count is 0.
  - `pipeTo(new WritableStream())` appears once in the vault bundle, and 0 times in the jobs, deletion and security bundles.
- `git diff --check`, on both `origin/claude/p1a-vault-core...2cf8315` and `34798c8 2cf8315`: clean.
- `test:edge:db`: **SKIPPED** (Docker stopped). CI ran it.

### 4. Scope

- 3 files: 131 insertions and 3 deletions.
  - In `handler.ts`, only `headOf` and its comment change.
  - No package, no lockfile, no `premium-progress.md` (R87), and no merge.
- The PostgreSQL dispatcher's cancel (`src/server/app/dispatch.ts:82-84`) is left as it is. It is recorded for 1B-T13 in the receipt's notes.

### 5. The lock

- The lock was free when I started (15:52) and is free now.
- I took and released it eight times, keeping exit codes in variables and running `rmdir` after each run.
- No workerd, wrangler or edge vitest process is left from the fixer's runs or mine, and the harness's temporary stores were removed.

### CI on PR #362

- Run `42588838342` (`pull_request`, head `2cf8315`, started 15:50 +0700). All three checks pass:
  - "Release image and smoke (never pushed)";
  - "SQL integration and ops (local PostgreSQL 17 container)";
  - "Typecheck, unit, render, build, export".
- The database job's log shows:
  - `test:db`: 41 suites;
  - `test:edge`: 15 files and 176 tests;
  - `test:edge:workers`: 25 files, 524 passed and 3 todo;
  - `test:edge:db`: 9 files and 64 passed.
- GitHub reports the PR `MERGEABLE` (`CLEAN`).

### The receipt

- Its counts match the fixer's logs and mine:
  - **RED:** `1 failed | 35 passed (36)`. There is one `AssertionError` and no other error prefix: the HEADs read 0 and 8,192 bytes, and the GET answers `[503, null]`.
  - **GREEN:** 36 passed.
  - **Mutants:** 4 of 4 killed.
  - **The gate:** the counts in section 3.
- The one exception is the Base line (n-3).
- Its notes for later tasks hold, and MA-1 adds one.

## Notes for later tasks

- **1B-T8 (`serveSnapshotChunk`) and 1B-T9 (`serveReceiptFile`):**
  - Whatever MA-1's ruling, each download must give its slot back when its client goes away mid-download. Prove it with a `wrangler dev` probe of aborted GETs; the Workers test runtime cannot show it.
  - `RECEIPT_SLOTS` allows two per account, so two interrupted receipt downloads would close that person's receipts in the isolate.
  - In their HEAD cases, give each HEAD its own byte counter (n-2).
- **The PostgreSQL edge (1B-T13 or followups):** while that edge serves traffic, two gaps stay open.
  - Its export and attachment downloads (`src/server/app/routes.ts:341-346` and `429-437`) have MA-1's leak.
  - Its dispatcher's HEAD cancel (`dispatch.ts:82-84`) has M-1's gap.

## Scratch evidence

All paths are under `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t6-confirm/`.

- **The gate:** `gate-typecheck.log`, `gate-node.log`, `gate-workers.log`, `gate-build.log` and `green-focused.log`.
- **Mutants:**
  - `mutants.out` (the planner's runner, F1 to F4);
  - `confirm_mutants.py` and `confirm-mutants.out` (F5, F5b and F6);
  - `mutant-logs/*.log` and `before-mutants.txt`.
- **The real runtime:**
  - The probe: `tree/apps/edge/test/confirm-head.test.ts`.
  - `proof-drain.log` with `observations-drain.txt`: 2cf8315 as built.
  - `proof-instrumented.log` with `observations-instrumented.txt`: with logging.
  - `proof-cancel.log` with `observations-cancel.txt`: `headOf` cancelling, with logging.
  - `proof-waituntil.log` with `observations-waituntil.txt`: the `waitUntil` experiment.
  - `build-*.log`, `before-instrument.txt` and the `*.keep` copies used for the restores.
- **The Workers-runtime probe P1:** `probe-p1.log` and `probe-p1-whole-file.log`.
- **CI:** `ci-db-job.log`.

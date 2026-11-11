# Brief fix-download-aborts: An aborted download gives back its slot: waitUntil on every vault download, proven under wrangler dev

You are the implementer (Haiku) for the follow-up task fix-download-aborts (ruling R97). In workerd, a GET whose client goes away mid-download keeps its download slot, and four of them close a download kind for every member in the isolate. You add one helper, `untilReturned(w, release)`, that hands `w.waitUntil` a promise the slot's return settles, and take every slot the vault Worker holds through it: the three downloads (exports, snapshot chunks, receipts), the receipt copy, and the upload's place. You also make `headOf`'s two returns inside the `try` awaited, and add one workers file that pins the `waitUntil` wiring. The planner wrote every file below and proved it on the base **`ecc00b7`** (`origin/claude/p1a-vault-core` at planning; its code is 1B-T11's merge `c8929f2`, and nothing outside `.claude/` changed since), in a scratch copy whose edge, API, packages and root package files are byte for byte that commit's: RED on a typed stub, GREEN, 9 of 9 mutants killed, the fast local gate (R100), and the `wrangler dev` proof (RED twice on the base, GREEN three times on the fix). Do exactly what this brief says.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. Its opening notes apply: **R100** (the whole workers suite is CI's; the local gate is the "Fast local gate"), durable files live under `/Users/kunanonjarat/Developer/jotbun/.claude/controller/`, never `/private/tmp` (only the heavy lock is there), and **R87**: your receipt is its own file, `docs/implementation/receipts/fix-download-aborts.md`. You do not edit `docs/implementation/premium-progress.md`.
2. The rulings: R97 and R96 in `/Users/kunanonjarat/Developer/jotbun/.claude/controller/handover.md` ("Rulings this session"), and the task's entry in `/Users/kunanonjarat/Developer/jotbun/.claude/controller/followups.md` (search for `fix-download-aborts`). The lesson behind the proof is in `/Users/kunanonjarat/Developer/jotbun/.claude/skills/jotbun-controller/references/lessons.md` ("Cancelling a dropped body does not release what it holds in workerd").
3. The plan: `docs/superpowers/plans/2026-10-25-jotbun-p1b-vault-files.md`, "Global Constraints" (lines 62 to 86: `src/server/http/files.ts` is reference code, read-only), `### Task 1B-T5` line 600 (the upload's isolate limit), `### Task 1B-T6` line 688 (`serveExportFile`), `### Task 1B-T8` (the chunk download), and `### Task 1B-T9` Step 4 (lines 892 to 895: the copy slot and `serveReceiptFile`).
4. The receipts this task builds on: `docs/implementation/receipts/1B-T6.md` (R96's `headOf`), `1B-T8.md` and `1B-T9.md` (their notes for this task).

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-download-aborts` (branch `fix/download-aborts`, made by the orchestrator from `origin/claude/p1a-vault-core`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-download-aborts`, your scratch folder. Create it with `mkdir -p`. Logs and backups go only there.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-download-aborts-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the verified final copy of every file this task creates or changes (6 files, paths relative to `apps/edge`);
  - `stubs/`: the RED typed stub of the new module (`src/v1/files/slots.ts`, whose `untilReturned` hands nothing to `waitUntil`);
  - `orig/`: the 4 shared files as the base has them (`ecc00b7`);
  - `diffs/`: one unified diff per shared file (`orig` to `real`), quoted again in Appendix A;
  - `mutants.py` (the mutant runner), `run-focused.sh`, `run-mutants.sh` and `run-proof.sh` (each takes the heavy lock itself);
  - `wrangler/`: the `wrangler dev` proof, `vault-proof.ts` (a proof-only vault entry that seeds data) and `aborts.proof.test.ts` (the probe);
  - `SHA256SUMS` (Appendix D) covering all of the above, plus `proof/mutants.out` and the proof's observation files `proof/wrangler-*.txt`;
  - the planner's logs in `proof/` and `logs/`, with their own `SHA256SUMS.logs`. `*.log` files are gitignored, so they may be missing on another machine: never check `SHA256SUMS.logs` as a gate, only `SHA256SUMS`.
  - If PL is missing or a line of `PL/SHA256SUMS` does not answer `OK`, stop: BLOCKED.
- Every shell call starts in a fresh directory, so type full paths. Git: `/usr/bin/git -C <WT> <command>`, one git command per call. Below, WT, S and PL stand for the full paths above: type them out. The shell is zsh: `status` is read-only there, so keep an exit code in `rc` (`cmd; rc=$?`).
- **The heavy lock** wraps every workers run, the mutant runner and the `wrangler dev` proof: `until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done` before, `rmdir /private/tmp/claude-501/jotbun-heavy.lock` after, after a failure too. The three PL scripts take and release it themselves; never wrap them in a second lock. Never remove a lock you did not take; other agents share it.
- **FOCUSED** (under the lock, through the script): `PL/run-focused.sh WT/apps/edge <log> test/workers/download-aborts.test.ts`. The file is new; it is this task's only test file.
- **AFFECTED** (once, in Step 5.3): `PL/run-focused.sh WT/apps/edge S/gate-affected.log` with the 11 files `test/workers/download-aborts.test.ts test/workers/exports.test.ts test/workers/attachments.test.ts test/workers/snapshots.test.ts test/workers/sync.test.ts test/workers/imports-review.test.ts test/workers/imports-intake.test.ts test/workers/files-objects.test.ts test/workers/files-front-door.test.ts test/workers/front-door.test.ts test/workers/files-alarm.test.ts`: every workers file that downloads, copies, uploads or calls `settle()`. It checks that no case now waits on a slot's promise.
- **R100: do not run `npm run test:edge:workers`.** CI runs the whole workers suite on the pull request; record it as "CI" in the receipt. Docker is stopped and stays stopped: `npm run test:edge:db` is recorded **SKIPPED** (CI's edge job runs it).
- **Load.** The machine is shared. FOCUSED took about 5 seconds here (each case 0.15 to 0.3 seconds); AFFECTED about 10 seconds; the mutant run about 2 minutes; the `wrangler dev` proof about 1 minute including its build. If a workers run fails on a timeout, rerun it once and record both runs; a second failure is BLOCKED with the output.
- If a result differs from an "Expected" line, stop and report BLOCKED with the output. Do not change tests or code to make them pass unless a step says so.

## Readiness (the planner checked it)

- **Starts after 1B-T6, 1B-T9, 1B-T8, 1B-T7 and 1B-T11:** all merged (`de738f9`, `5b7609e`, `1c14dd1`, `365ec2e` and `c8929f2`). The head at planning is `ecc00b7`; since `c8929f2` only `.claude/` files changed. At the brief's writing the head is `d1111f8`, which adds only `apps/app` (#391) and `.claude/` changes: `apps/edge`, `apps/api`, `packages` and the root package files are still `ecc00b7`'s. 1B-T7's three `handler.ts` edits touch no `headOf` line, and the two `headOf` returns inside the `try` are at `handler.ts:133` and `:151`.
- **No new package, no lockfile change, no Cloudflare resource, no owner decision.** The `wrangler dev` proof runs the built vault Worker locally (wrangler 4.152.0 is installed), as 1B-T6's confirming review did.
- **The parallel work** is clear of this task's files: the 1B-T12 planner works in `apps/edge/test/support/` (this task only reads `test/support/edge-harness.ts` and `wrangler-dev.ts`, from the PL probe, in a copy), alarm-hardening edits `jobs.ts`, `user-vault.ts` and `files-alarm.test.ts`, and the app lane is `apps/app`. The second brief, download-pins, edits five other test files (see "How this task meets the other open work").

## Scope

| File (under `apps/edge`) | Change |
| --- | --- |
| `src/v1/files/slots.ts` | **new.** `untilReturned(w, release)`. |
| `src/v1/files/downloads.ts` | **shared.** One import; `serveExportFile`, `serveSnapshotChunk` and `serveReceiptFile` take their slots through `untilReturned`; four comments. |
| `src/v1/files/receipts.ts` | **shared.** One import; `prepare` takes its `COPY_SLOTS` slot through `untilReturned`; its comment. |
| `src/v1/files/uploads.ts` | **shared.** One import; `uploadRoute` returns its place among `MAX_UPLOADS_PER_ISOLATE` through `untilReturned` (P4); its comment. |
| `src/v1/handler.ts` | **shared.** `return await headOf(...)` at `:133` and `:151` (the 1B-T6 confirming review's n-1); `headOf`'s comment. |
| `test/workers/download-aborts.test.ts` | **new.** 5 cases. |
| `docs/implementation/receipts/fix-download-aborts.md` | **new.** Your receipt (R87). |

Not in this task: `src/server/http/files.ts` (`DownloadSlots`, `bodyStream`, `fileResponse`: reference code, unchanged, P1); `test/workers/support/` and `test/support/` (unchanged: the cases use `V1Client.settle()`, P5); R96's `headOf` drain (unchanged, P10); the PostgreSQL edge's identical leak in `src/server/app/routes.ts` (retires at 1B-T13; never port it); the test-only pins of the 1B-T6 to 1B-T11 reviews (the second brief, download-pins; every item's home is in the table below); anything under `apps/api`, `packages/contracts` or `vendor/`; no new package.

**Size: M** (one new module of 30 lines, four shared files with one-line wiring each, one workers file of 5 cases, and a scripted `wrangler dev` proof). One commit.

## Interfaces (as `real/` has them)

```ts
// src/v1/files/slots.ts
export function untilReturned(w: Pick<WorkerContext, 'waitUntil'>, release: () => void): () => void
// Hands w.waitUntil a promise, then returns a function that calls `release` and ends that promise.

// The five call sites
const release = untilReturned(w, EXPORT_SLOTS.take())                     // serveExportFile
const release = untilReturned(w, SNAPSHOT_SLOTS.take())                   // serveSnapshotChunk
const release = untilReturned(w, RECEIPT_SLOTS.take(w.claims.accountId))  // serveReceiptFile
const slot = untilReturned(w, COPY_SLOTS.take())                          // receipts.ts prepare, each attempt
const done = untilReturned(w, () => { uploading -= 1 })                   // uploadRoute, after `uploading += 1`; `finally { done() }`
```

Nothing else changes shape: every `release` was already called on each path that returns the slot (`bodyStream`'s `onClose`, each `catch`, each `finally`), so each now also ends its promise.

## Planner rulings (the calls this brief makes, with the reason for each)

- **P1. One helper, in a new module.** R97: "each `serve*File` hands `w.waitUntil` a promise that its `release` settles". `untilReturned` is that, written once. It lives in `src/v1/files/slots.ts` because `receipts.ts` and `uploads.ts` need it too, and `downloads.ts` already imports `receipts.ts` (`RECEIPT_LIMITS`): putting it in `downloads.ts` would make an import cycle, which the 1B-T11 review's n5 warns against. `slots.ts` imports only a type. `src/server/http/files.ts`, where `DownloadSlots` and `bodyStream` live, is reference code (Global Constraints), so it stays as it is. Pinned by A1 to A9.
- **P2. The promise is handed over with the slot just taken, and ends when the slot is returned.** `untilReturned(w, X_SLOTS.take())` runs `take()` first: a request turned away for want of a slot (503) hands nothing over, and neither does one the vault refuses at its step (404, before any slot). The promise ends on every path that returns the slot: the body's end, its failure or its cancel (`bodyStream`'s `onClose`), or the `catch`. Pinned by A9 (a promise handed over before the vault step stays pending for a refused grant) and by each case's 404 and 503 lines.
- **P3. The copy slot takes the wrapper too, though `wrangler dev` cannot show its leak.** The controller asked to prove four aborted retains, then a retain answering 200. The planner's probe aborts each retain halfway through its copy (12 MiB, the largest receipt; the copy took 95 to 242 ms, and the abort came at half that). On the base and on the fix alike, another member's retain then answers 200, and wrangler's log shows each aborted retain still answering `200 OK` after its client left: locally, a handler that has not answered yet runs on to its answer. So the base does not leak here. Cloudflare's documentation says the deployed runtime may cancel such work: "When the client disconnects or the response is complete, outstanding work may be canceled unless it is passed to `ctx.waitUntil()`" (Workers platform limits, "Subrequests"; "Duration" says the same). A cancelled retain would never reach its `finally`, and four would close copying in the isolate. The wrapper costs one line, so it covers that case. Its proof is the wiring pin (A4) and the probe's "no harm" round.
- **P4. The upload's place takes the wrapper too, beyond the controller's list (the planner's call).** `uploadRoute` holds one of `MAX_UPLOADS_PER_ISOLATE` (16) across the whole intake and gives it back in `finally`: the copy slot's shape, so the same documented risk, and a phone that loses its signal mid-upload is the most common abort of all. One more call site and one more case (A5). The probe sends sixteen uploads that each stop halfway through their body and abort, then another member's upload answers 202, on the base and on the fix (no local leak, as in P3). If the controller wants only the listed kinds, drop the `uploads.ts` hunk, the upload case and A5; nothing else depends on them.
- **P5. The test pins the wiring, not the leak.** The Workers test runtime keeps every request alive, so the leak shows only under `wrangler dev` (lessons.md; R96). Each case watches the promises the front door hands to `waitUntil` through the test client's own `settle()` (it awaits all of them): a check races `settle()` against 100 ms ("pending") or up to 5 seconds ("ended"; it answers as soon as they end). A held slot's promise can only end when the case lets it, so 100 ms is no timing guess. Bodies are served in 16-byte pieces whose last piece waits at a gate the case opens, so "pending while unread" holds for any file size: a one-piece body drains through FixedLengthStream by itself (the note in the HEAD cases). No support file changes.
- **P6. Each download case makes one download more than the person's slots.** A GET read to its end, a GET cancelled, a HEAD, then `slots` more GETs (4 for exports and chunks, 2 per account for receipts), then a GET of a grant the vault refuses (404) and a GET with every slot taken (503). A slot that is never returned refuses one of them (A8). The copy case runs five retains (`COPY_SLOTS` holds 4) and a retain with every copy slot taken.
- **P7. The `wrangler dev` proof is the planner's kit, not a committed test.** It needs data the front door cannot make under `wrangler dev`: a receipt photo's import image (no parser container runs there), a large ledger (the front door's write budget is 60 a minute), and a snapshot with 8 MiB chunks. The vault's own 1 MiB chunks fit in the loopback socket buffers: with them the base answered 503 in two runs and 200 in one (`PL/proof/wrangler-early-red-*.txt`). `PL/wrangler/vault-proof.ts` is a proof-only vault entry whose `/__proof/` routes write those rows the way the Workers tests' `seedImportImage` and `seedLedger` write them, and build the snapshot with `buildSnapshot` and 8 MiB chunks. Every other request goes to the real entry, and `run-proof.sh` copies the files under test byte for byte. Committing it would put a seeding route in production code. You run it once on your tree (Step 7), GREEN only: the planner's RED runs are in PL.
- **P8. `return await headOf(...)` has no behaviour to pin.** `headOf` never rejects (its read is caught, and a locked body cannot reach it), so the awaited returns change nothing today; they keep a future rejection inside the `try`, as the 1B-T6 confirming review asked (n-1). No mutant: the change is equivalent by construction. The comment says why.
- **P9. The 30-second limit is a residual.** `waitUntil` keeps a request at most 30 seconds after its client goes away (Cloudflare's `ctx.waitUntil()` documentation). A download's cancel and a copy's end arrive in milliseconds; a copy still running 30 seconds after its client left (`copyDeadlineMs` is 60 seconds) would be cut and keep its slot. This cannot be shown locally. Named in the receipt.
- **P10. R96's HEAD stays a full read.** The 1B-T6 confirming review noted that with `waitUntil` a HEAD could go back to cancelling its body. This task leaves `headOf`'s drain as R96 rules: a cancel would need its own `wrangler dev` proof, and the drain is proven.
- **P11. Hosted checks are SKIPPED.** Nothing is deployed, and the deployed runtime's cancellation (P3, P4, P9) is not exercised. `test:edge:db` is SKIPPED (Docker stopped), and the whole workers suite is CI's (R100).

## The controller's notes, and where this task meets each

| Note | Where it is met | Pinned by |
| --- | --- | --- |
| R97: each `serve*File` hands `w.waitUntil` a promise that its `release` settles: `serveExportFile`, `serveReceiptFile`, `serveSnapshotChunk` (`GET /v1/sync/snapshot-chunks/:grant`, `SNAPSHOT_SLOTS`). | P1, P2. | A1, A2, A3, A6 to A9 |
| Prove it under `wrangler dev`: four aborted GETs, then a GET answers 200, for each kind. | P7, Step 7. Base: export, snapshot chunk and receipt each 503 after four aborted GETs (and 503 five seconds later); fix: each 200 with the whole file and its digest. | `PL/proof/wrangler-red-1.txt`, `-red-2.txt`, `-green-1.txt` to `-green-3.txt` |
| Receipts allow two slots per account. | The receipt round: on the base, aborted GETs 3 and 4 already answer 503 (`[200,200,503,503]`), and so does the next GET; with the fix all four are 200 and the next GET is served. | the same files |
| Retain and replace hold a copy slot across awaits: four aborted retains, then a retain answers 200. | P3: 200 on the base and on the fix (no local leak); the wrapper covers the documented deployed cancellation. | A4; the retain round |
| A test that pins the `waitUntil` wiring. | P5, P6: `download-aborts.test.ts`. | A1 to A9 |
| 1B-T6's n-1: the `headOf` returns at `:133` and `:151` become awaited returns. | P8. | (equivalent) |
| Build on 1B-T7 and 1B-T11 as merged. | Readiness. | Step 0.7 |
| Keep clear of the 1B-T12 planner's `apps/edge/test/support/`. | Unchanged. | Step 8.2 |

### Every item of the followups entry, and its home

| Item (followups.md, `fix-download-aborts`) | Home |
| --- | --- |
| R97: the `waitUntil` wrapper on the three downloads, the `wrangler dev` proof, a wiring test | **this brief** (P1, P2, P5 to P7) |
| 1B-T9 review: four aborted retains, then a retain answers 200 | **this brief** (P3, Step 7) |
| 1B-T6 confirming review n-1: awaited `headOf` returns | **this brief** (P8) |
| (planner) the upload's place, the same shape as the copy slot | **this brief** (P4) |
| 1B-T6 confirming review n-2: the export HEAD case's byte counter, per HEAD | download-pins |
| 1B-T9 review m-1 (prepare's session and policy check, probes AC-1 to AC-3) | download-pins |
| 1B-T9 review m-2 (the receipt HEAD case counts bytes per HEAD, probe HD-1) | download-pins |
| 1B-T9 review m-3 (`attachmentsDueAt`'s two guards, probes DU-1 and DU-2) | download-pins |
| 1B-T9 review n-1 to n-4 (the poll deadline CP-1, unknown body fields AC-5, the preview's `ready` status CP-2, the robust "two records at once" RB-2) | download-pins |
| 1B-T9 review n-5 (the receipt misfiles five ported cases; the test header's counts) | download-pins fixes the header; the merged receipt's labels are controller housekeeping |
| 1B-T9 review n-6 (the 3 kB bundle gap) | nothing to change: the review explained it (path comments) |
| 1B-T7 review m-2 (`ai.consume` session pin W7) and n-1 (the P2 input probes) | download-pins |
| 1B-T7 review n-8 (line references) | used here: `handler.ts:133` and `:151`; `attachments.prepare` at `routes.ts:155` |
| 1B-T8 review m-2 (the spy), m-3 (not pending, X6), n-1 (digest as a chunk streams, probe E), n-2 (reuse at the watermark, probe C2) | download-pins |
| 1B-T10 review m-1 (R57 on corrections) and m-2 (the preview's accepted-upload guard) | download-pins |
| 1B-T10 review n-2 (two changed-form cases lack their comment) | download-pins |
| 1B-T10 review n-3 (`pruneImports` has no `MAX_PURGE_PASSES` cap) | already ruled by 1B-T11's P14 (not capped: unreachable and unpinnable); alarm-hardening carries the related n9 |
| 1B-T11 review m3 (`snapshotsDueAt`'s stale term) and n6 (`pruneSnapshots`' tombstone guard) | download-pins |

## How this task meets the other open work

- **download-pins (the second brief, test-only).** It edits `test/workers/exports.test.ts`, `attachments.test.ts`, `snapshots.test.ts`, `imports-review.test.ts` and `ai.test.ts`; this task edits none of them, and download-pins edits no file of this task. They can run in parallel and merge in either order: the planner ran both together (12 workers files, 392 passed and 1 todo) and checked that each task's mutants apply on the other's files. This brief comes first in the controller's queue, because it is the fix R97 asks for before 1B-T13.
- **1B-T12 (the files parity session).** Its parity run starts the vault Worker without Workflows, queues or Containers (B13). Nothing here changes a reply; a download's request now lives until its body ends, which a parity client never sees.
- **alarm-hardening.** No shared file.
- **1B-T13 (C1).** The PostgreSQL edge's export and attachment downloads (`src/server/app/routes.ts:341-346` and `429-437`) have the same leak and retire there. When the vault moves into the HTTP Worker, `untilReturned` moves with `src/v1`.

---

## Step 0: Sync, install, and check the base

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date." or a clean merge.
2. `/usr/bin/git -C WT rev-parse --short HEAD`. Record it.
3. Install what is missing (the orchestrator may have pre-installed the worktree): `test -d WT/node_modules || (cd WT && npm ci --ignore-scripts --no-audit --no-fund)`, then `test -d WT/apps/edge/node_modules || (cd WT && npm run install:edge)`.
4. `mkdir -p S`. Verify the planner's files: `cd PL && shasum -a 256 -c SHA256SUMS`. Expected: 31 lines, every line `OK`. Any other answer: BLOCKED.
5. `ls WT/apps/edge/src/v1/files/slots.ts WT/apps/edge/test/workers/download-aborts.test.ts 2>&1`. Expected: two "No such file or directory".
6. `grep -c 'pipeTo(' WT/apps/edge/src/v1/handler.ts` prints `1` (R96's `headOf`), and `grep -n "return headOf(" WT/apps/edge/src/v1/handler.ts` prints three lines: `:133` and `:151` (inside the `try`; this task awaits them) and `:185` (`runWorker`'s, already awaited by its caller, unchanged). Otherwise stop: BLOCKED, "the base's handler.ts is not the planned one".
7. Base checksums of the 4 shared files: `cd WT/apps/edge && shasum -a 256 src/v1/files/downloads.ts src/v1/files/receipts.ts src/v1/files/uploads.ts src/v1/handler.ts`. Compare each with the `orig/` line for the same file in Appendix D.
   - A file whose checksum matches: Step 1 copies `PL/real/<file>` over it.
   - A file whose checksum differs (another task merged first): apply that file's hunks from Appendix A with the Edit tool instead. Each Edit's `old_string` is the hunk's context and `-` lines; it must match exactly once. If one does not, stop: BLOCKED, with `/usr/bin/git -C WT log --oneline -3 -- apps/edge/<file>` and the hunk that failed.

## Step 1: The shared files and the RED stub

1. In this order, `cp PL/real/<file> WT/apps/edge/<file>` (or its Appendix A Edits, per Step 0.7): `src/v1/files/downloads.ts`, `src/v1/files/receipts.ts`, `src/v1/files/uploads.ts`, `src/v1/handler.ts`.
2. The new module's RED stub: `cp PL/stubs/src/v1/files/slots.ts WT/apps/edge/src/v1/files/slots.ts` (Appendix B: `untilReturned` returns `release` as given and hands nothing to `waitUntil`).
3. The test file: `cp PL/real/test/workers/download-aborts.test.ts WT/apps/edge/test/workers/download-aborts.test.ts`.
4. `cd WT && npm run typecheck:edge`. Expected: exit 0.

## Step 2: RED

FOCUSED, saving to `S/red.log`: `PL/run-focused.sh WT/apps/edge S/red.log test/workers/download-aborts.test.ts`. Expected: it prints `rc=1`; the log has `Test Files  1 failed (1)` and `Tests  5 failed (5)`. Every failure is an `AssertionError` on a "pending" line (with the stub nothing is handed to `waitUntil`, so each check finds every promise already ended): `grep -cE "^(TypeError|ReferenceError|RangeError|SyntaxError|Error):" S/red.log` prints `0`, and `grep -c "^AssertionError" S/red.log` prints `5`.

## Step 3: GREEN

1. `cp PL/real/src/v1/files/slots.ts WT/apps/edge/src/v1/files/slots.ts`.
2. `cd WT && npm run typecheck:edge`. Expected: exit 0.
3. FOCUSED, saving to `S/green.log`. Expected: `rc=0`, `Test Files  1 passed (1)` and `Tests  5 passed (5)`.
4. Checksums: `cd WT/apps/edge && shasum -a 256 src/v1/files/slots.ts src/v1/files/downloads.ts src/v1/files/receipts.ts src/v1/files/uploads.ts src/v1/handler.ts test/workers/download-aborts.test.ts > S/green-sums.txt`. Each must equal its `real/` line in Appendix D. A shared file you edited from Appendix A may differ; then `diff` it against `PL/real/<file>` and confirm that only the other task's lines differ.

## Step 4: Mutation check

First, without the lock: `python3 -I PL/mutants.py --check WT/apps/edge`. Expected: `9 mutants, 5 cases; old text found exactly once and every required case exists: True`.

Then `PL/run-mutants.sh WT/apps/edge S` (it takes the lock and writes `S/mutants.out` and `S/mutant-logs/`). The runner applies each mutant, runs `test/workers/download-aborts.test.ts` alone, restores the file byte for byte, and prints `KILLED` or `SURVIVED` with the failing cases. Expected: `rc=0`, and every line `KILLED ... restored=True`, with exactly the cases below failing (A6 to A8 fail all five). The run took about 2 minutes here; A6 waits out its 5-second checks. Then:
- `cd WT/apps/edge && shasum -a 256 -c S/green-sums.txt`: all `OK`;
- `/usr/bin/git -C WT status --short`: only this task's files.

| Mutant | File | Change | Must fail |
| --- | --- | --- | --- |
| A1 | `downloads.ts` | the export download takes its slot without `untilReturned` | the export case |
| A2 | `downloads.ts` | the snapshot chunk download, the same | the snapshot chunk case |
| A3 | `downloads.ts` | the receipt download, the same | the receipt case |
| A4 | `receipts.ts` | the copy takes its slot without `untilReturned` | the retain case |
| A5 | `uploads.ts` | the upload holds its place without `untilReturned` | the upload case |
| A6 | `slots.ts` | `untilReturned`'s promise never ends | all five |
| A7 | `slots.ts` | `untilReturned`'s promise ends at once | all five |
| A8 | `slots.ts` | `untilReturned` ends its promise but never returns the slot | all five |
| A9 | `downloads.ts` | the export download hands its promise over before its vault step | the export case |

The case names, in file order: `an export download hands waitUntil a promise that is pending while its body is unread and ends once the body is read, cancelled or answered to a HEAD`; `a snapshot chunk download hands waitUntil ...` (the same ending); `a receipt download hands waitUntil ...` (the same ending); `a retain hands waitUntil a promise that is pending while it holds a copy slot and ends once the slot is back; a retain turned away for want of a slot hands over nothing`; `an upload hands waitUntil a promise that is pending while it holds its place among the isolate's uploads and ends once it gives the place back`.

## Step 5: The gate (R100's fast local gate)

From `WT`, in order, saving each output under `S/`:
1. `npm run typecheck:edge`. Expected: exit 0.
2. FOCUSED once more after the mutants, saving to `S/gate-focused.log`. Expected: as in Step 3.3.
3. AFFECTED once, saving to `S/gate-affected.log`. Expected: `rc=0`, `Test Files  11 passed (11)`, no failed case and no `Errors` line (the planner's run: 335 passed and 1 todo; a count that differs because the head moved is not a failure).
4. `npm run test:edge`. Expected: exit 0 and no failed test. This task adds no Node case; record the counts the run prints (the planner's: 15 files, 176 tests).
5. `npm run build:edge`. Expected: exit 0, and no PostgreSQL driver in the vault bundle (ruling R95: count driver markers): `for m in pg-protocol pg-pool pg-types drizzle-orm/node-postgres 'from "pg"'; do printf '%s %s\n' "$m" "$(grep -c -- "$m" WT/apps/edge/dist/jotbun_vault/index.js)"; done` prints a count of `0` for each. (The bundle's code gains only `untilReturned` and its five calls. Its size moves with the path comments of where it is built, so it is not compared; the planner's scratch build read 1,672.80 kB.)
6. `npm run test:edge:workers`: **CI** (R100). `npm run test:edge:db`: **SKIPPED**, Docker is stopped by the controller's order; CI's edge job runs it. For the controller's CI check, this task's deltas (R100: deltas, never totals): `test:edge` +0; `test:edge:workers` +1 file (`download-aborts.test.ts`) and +5 passed; `test:edge:db` +0.
7. `/usr/bin/git -C WT diff --check` before the commit and `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD` after it. Expected: no output.

## Step 6: The named risks (SKIPPED)

The deployed runtime's cancellation of a handler whose client went away (P3, P4) and the 30-second `waitUntil` limit (P9) cannot be exercised locally. The receipt names both as SKIPPED until a hosted environment exists.

## Step 7: The `wrangler dev` proof (GREEN on your tree)

`PL/run-proof.sh WT WT S/wrangler green` (it builds a copy, so it writes nothing into WT; it takes the lock around the probe). It copies `WT/apps/edge`, `apps/api` and `packages` into `S/wrangler/root` (no `node_modules`, `dist` or `.wrangler`), links WT's `node_modules`, adds `PL/wrangler/vault-proof.ts` as the vault entry and `PL/wrangler/aborts.proof.test.ts` as the probe, builds, and runs the probe under `wrangler dev`. It prints the observation lines. Expected: `rc=0`, and lines like the planner's (`PL/proof/wrangler-green-1.txt`):

```
export (5394226 bytes): aborted GETs [200,200,200,200]; then GET 200 5394226 bytes, sha256 matches; 5 s later GET 200 ...
snapshot chunk (7119885 bytes): aborted GETs [200,200,200,200]; then GET 200 7119885 bytes, sha256 matches; 5 s later GET 200 ...
receipt (4194304 bytes): aborted GETs [200,200,200,200]; then GET 200 4194304 bytes, sha256 matches; 5 s later GET 200 ...
retain (12582912-byte copies, ...): aborted retains ["AbortError","AbortError","AbortError","AbortError"]; then another member's retain 200 ...
upload: aborted uploads {"AbortError":16}; then another member's upload 202 ...
answers {"export":"200","snapshot":"200","receipt":"200","retain":"200","upload":"202"}
```

The byte counts can differ by a few bytes (random ids). Keep `S/wrangler/observations-green.txt` for the receipt; then `rm -rf S/wrangler/root` (a copy of the tree). Do not rerun the base: the planner's RED runs are `PL/proof/wrangler-red-1.txt` and `-red-2.txt` (`answers {"export":"503","snapshot":"503","receipt":"503","retain":"200","upload":"202"}`). If your run fails, rerun it once with a new out dir (`S/wrangler-2`); a second failure is BLOCKED with both outputs.

## Step 8: Receipt and commit

1. Write `WT/docs/implementation/receipts/fix-download-aborts.md` from the template in Appendix C, with your own counts, SHA and the gate's results. Do not edit `docs/implementation/premium-progress.md`.
2. `/usr/bin/git -C WT add apps/edge docs/implementation/receipts/fix-download-aborts.md`, then `/usr/bin/git -C WT status --short`: only the files of the Scope table (6 under `apps/edge`, and the receipt). Nothing under `apps/edge/test/support/` or `test/workers/support/`.
3. Commit, one command, with this message:
   ```
   Keep each vault request alive until its download, copy or upload slot is back

   In workerd a client that goes away mid-download ends the request before the
   cancel reaches the body, so the slot was never returned and four aborted
   downloads closed that kind for the isolate. Every slot the vault Worker
   takes now hands waitUntil a promise its return settles: the export, chunk
   and receipt downloads, the receipt copy and the upload. Proven under
   wrangler dev; a workers file pins the wiring.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```

## Your final message

As the protocol says: `STATUS: DONE` (or `STATUS: BLOCKED` with the blocker) on the first line; the commit SHA and branch; the files changed; the RED counts and the GREEN counts; the mutants (killed, survivors); each gate command with its result and counts, `test:edge:workers` as CI; the `wrangler dev` answers line; SKIPPED items (`test:edge:db`, hosted checks, the deployed cancellation and the 30-second limit); deviations, including any shared file you edited from Appendix A, and what the reviewer should look at first (P3 and P4: the copy and upload wrappers rest on Cloudflare's documented cancellation, not a local repro; P5 the `settle()` race; P7 the proof-only seeding entry).

---

## Appendix A: the shared-file edits (unified diffs, `orig/` to `real/`)

Use these only for a shared file whose base checksum differed in Step 0.7. Each hunk becomes one Edit: `old_string` is the hunk's context and `-` lines, `new_string` its context and `+` lines (without the leading markers). The same diffs are in `PL/diffs/`.

### `src/v1/files/downloads.ts`

```diff
--- a/src/v1/files/downloads.ts
+++ b/src/v1/files/downloads.ts
@@ -11,12 +11,15 @@ import type { V1Env } from '../env'
 import type { VaultReply } from '../protocol'
 import type { WorkerContext } from '../worker-routes'
 import { RECEIPT_LIMITS } from './receipts'
+import { untilReturned } from './slots'

 // File downloads the Worker streams from R2. Each download takes a slot first,
 // as the API counts downloads per process; here the count is per isolate.
 // A download asks the caller's vault, in one step, which stored file its grant
 // names (the vault's refusal is the answer when it names none), then streams
 // that object only while it matches what the vault recorded (matchingObject).
+// Each slot is taken through untilReturned, so the request stays alive until
+// the slot is back, even when the client goes away mid-download (ruling R97).
 // 1B-T6 (serveExportFile), 1B-T8 (serveSnapshotChunk) and 1B-T9
 // (serveReceiptFile) add their serve functions below, in that order, each
 // under its own `// 1B-Tn:` line.
@@ -51,14 +54,15 @@ export async function matchingObject(env: Pick<V1Env, 'OBJECTS'>, file: StoredFi
  * that is not current or not this person's is the vault's 404. Then the CSV
  * streams from R2 with its recorded length and its download name, its digest
  * checked as it goes. At most EXPORT_SLOTS downloads stream at once in an
- * isolate; more are 503 with a retry. The slot is returned when the body ends.
+ * isolate; more are 503 with a retry. The slot is returned when the body ends,
+ * fails or is cancelled, and the request lives until then (R97).
  */
 export async function serveExportFile(w: WorkerContext): Promise<Response | VaultReply> {
   if (!w.vault) throw new Error('an export download needs a session')
   const reply = await w.vault.call('exports.file', { params: { grant: w.params.grant ?? '' } })
   if (!reply.ok) return reply
   const file = reply.body as StoredExportFile
-  const release = EXPORT_SLOTS.take()
+  const release = untilReturned(w, EXPORT_SLOTS.take())
   try {
     const body = await matchingObject(w.env, file)
     const chunks = verifiedChunks(body, file.bytes, file.sha256)[Symbol.asyncIterator]()
@@ -85,16 +89,15 @@ export const SNAPSHOT_SLOTS = new DownloadSlots(4)
  * anything else is the vault's 404. Then a SNAPSHOT_SLOTS slot (503 with a
  * retry when none is free), the object only while it matches its record (404
  * otherwise), and the JSON streamed with its recorded length, its digest
- * checked as it goes. The slot is returned when the body ends. A client that
- * goes away mid-download keeps the slot in workerd (ruling R97): the follow-up
- * fix-download-aborts fixes this download with the others.
+ * checked as it goes. The slot is returned when the body ends, fails or is
+ * cancelled, and the request lives until then (R97).
  */
 export async function serveSnapshotChunk(w: WorkerContext): Promise<Response | VaultReply> {
   if (!w.vault) throw new Error('a snapshot chunk download needs a session')
   const reply = await w.vault.call('snapshots.chunk', { params: { grant: w.params.grant ?? '' } })
   if (!reply.ok) return reply
   const file = reply.body as StoredFile
-  const release = SNAPSHOT_SLOTS.take()
+  const release = untilReturned(w, SNAPSHOT_SLOTS.take())
   try {
     const body = await matchingObject(w.env, file)
     const chunks = verifiedChunks(body, file.bytes, file.sha256)[Symbol.asyncIterator]()
@@ -117,14 +120,15 @@ export async function serveSnapshotChunk(w: WorkerContext): Promise<Response | V
  * chunk is read within downloadIdleMs before any header, so a failure up to
  * then is 503 with a retry, never the failure's text; after it, a stall past
  * downloadIdleMs or a body still running at downloadTotalMs cuts the
- * connection. The slot is returned when the body ends.
+ * connection. The slot is returned when the body ends, fails or is
+ * cancelled, and the request lives until then (R97).
  */
 export async function serveReceiptFile(w: WorkerContext): Promise<Response | VaultReply> {
   if (!w.vault || !w.claims) throw new Error('a receipt download needs a session')
   const reply = await w.vault.call('attachments.file', { params: { grant: w.params.grant ?? '' } })
   if (!reply.ok) return reply
   const file = reply.body as StoredReceiptFile
-  const release = RECEIPT_SLOTS.take(w.claims.accountId)
+  const release = untilReturned(w, RECEIPT_SLOTS.take(w.claims.accountId))
   let chunks: AsyncIterator<Uint8Array> | undefined
   try {
     const body = await matchingObject(w.env, file)
```

### `src/v1/files/receipts.ts`

```diff
--- a/src/v1/files/receipts.ts
+++ b/src/v1/files/receipts.ts
@@ -15,6 +15,7 @@ import type { ConfirmPrepared, ConfirmReceipt } from '../../vault/files/confirma
 import type { V1Env } from '../env'
 import type { VaultReply, VaultRouteId } from '../protocol'
 import type { VaultSession, WorkerContext } from '../worker-routes'
+import { untilReturned } from './slots'

 // Retaining and replacing a receipt on the vault (1B-T9): ports of
 // AttachmentService.withReceipt and prepare. The copy runs here, in the Worker,
@@ -97,15 +98,17 @@ async function copyOf(vault: VaultSession, env: Pick<V1Env, 'OBJECTS'>, prepared
  * `imports.confirmPrepare`; the request's first, charged call) and, when it
  * answers `copy`, the copy. Each attempt holds a COPY_SLOTS slot from before
  * the step until the copy ends, so a busy isolate answers 503 before anything
- * is reserved. While another request is copying the same image (`wait`) it
- * looks again every 75 ms, up to copyDeadlineMs, then answers 503. A 429 from
- * the step is the answer. `refused` (a confirmation's read-only checks would
- * refuse its batch) reserves and copies nothing.
+ * is reserved, and the request lives until the slot is back, even when its
+ * client goes away mid-copy (untilReturned, R97). While another request is
+ * copying the same image (`wait`) it looks again every 75 ms, up to
+ * copyDeadlineMs, then answers 503. A 429 from the step is the answer.
+ * `refused` (a confirmation's read-only checks would refuse its batch)
+ * reserves and copies nothing.
  */
 async function prepare(w: WorkerContext, vault: VaultSession, route: 'attachments.prepare' | 'imports.confirmPrepare', input: unknown, params: Record<string, string> = {}): Promise<StoredCopy | null | 'refused'> {
   const deadline = Date.now() + RECEIPT_LIMITS.copyDeadlineMs
   for (;;) {
-    const slot = COPY_SLOTS.take()
+    const slot = untilReturned(w, COPY_SLOTS.take())
     try {
       const prepared = await step<ConfirmPrepared>(vault, route, { params, body: input })
       if (prepared.kind === 'refused') return 'refused'
```

### `src/v1/files/uploads.ts`

```diff
--- a/src/v1/files/uploads.ts
+++ b/src/v1/files/uploads.ts
@@ -8,6 +8,7 @@ import { UploadIntake } from '@api/imports/upload-intake'
 import { R2ObjectStore, UnavailableObjectStore } from '../../server/storage/r2-object-store'
 import type { VaultClaims, VaultReply, VaultRouteId } from '../protocol'
 import type { VaultSession, WorkerContext } from '../worker-routes'
+import { untilReturned } from './slots'

 // POST /v1/imports on the vault (1B-T5): the API's UploadIntake, unchanged,
 // streams the body into R2 quarantine while each of its database steps is one
@@ -71,7 +72,9 @@ async function* emptyBody(): AsyncIterable<Uint8Array> {}
  * The `import.upload` Worker route. The front door has already applied the
  * `uploads` and `imports` gates (404 while uploads are off), the client
  * version and the token. An image needs the `ocr` gate open, before any byte
- * is read; then the intake answers 202 with the accepted import.
+ * is read; then the intake answers 202 with the accepted import. The upload's
+ * place among the isolate's uploads keeps the request alive until it is given
+ * back, even when the client goes away mid-upload (untilReturned, R97).
  */
 export async function uploadRoute(w: WorkerContext): Promise<VaultReply> {
   if (!w.vault || !w.claims) throw new Error('an upload needs a session')
@@ -79,6 +82,9 @@ export async function uploadRoute(w: WorkerContext): Promise<VaultReply> {
   if (format === 'jpeg' || format === 'png' || format === 'webp') w.gates.assertOpen('ocr')
   if (uploading >= MAX_UPLOADS_PER_ISOLATE) throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 })
   uploading += 1
+  const done = untilReturned(w, () => {
+    uploading -= 1
+  })
   try {
     const store = w.env.OBJECTS ? new R2ObjectStore(w.env.OBJECTS) : new UnavailableObjectStore()
     const accepted = await new UploadIntake(vaultIntakeRepository(w.vault), store).accept(sessionContextOf(w.claims), w.stream ?? emptyBody(), {
@@ -89,7 +95,7 @@ export async function uploadRoute(w: WorkerContext): Promise<VaultReply> {
     })
     return { ok: true, status: 202, body: accepted }
   } finally {
-    uploading -= 1
+    done()
   }
 }
```

### `src/v1/handler.ts`

```diff
--- a/src/v1/handler.ts
+++ b/src/v1/handler.ts
@@ -130,7 +130,7 @@ export async function handleVaultV1(request: Request, env: V1Env, deps: V1Deps =
         waitUntil: deps.waitUntil ?? waitUntil,
       })
     }
-    if (route.access === 'public') return headOf(jsonResponse(200, latestPerKind(policies), requestId), method)
+    if (route.access === 'public') return await headOf(jsonResponse(200, latestPerKind(policies), requestId), method)
     const claims = await authenticate(request, env, deps, config, route.access)
     const stub = env.VAULT.get(env.VAULT.idFromName(claims.accountId), { locationHint: 'apac' })
     // The live socket (1D-T10): after every check above, the vault's fetch answers it in place of the vault call.
@@ -148,7 +148,7 @@ export async function handleVaultV1(request: Request, env: V1Env, deps: V1Deps =
       body,
     })
     if (startsWork(route, reply.status)) handOffWork(deps, stub)
-    return headOf(replyResponse(reply, requestId), method)
+    return await headOf(replyResponse(reply, requestId), method)
   } catch (error) {
     return errorResponse(error, requestId, `${route.method} ${route.path}`)
   }
@@ -208,7 +208,9 @@ function withV1Headers(response: Response, requestId: string): Response {
  * holds is given back before the HEAD is answered: a download returns its slot
  * and finishes its R2 read (R96). Cancelling the body is not enough: the
  * Workers runtime ends the request before a cancel reaches the stream behind
- * a download's FixedLengthStream, and the slot would stay taken. Never rejects.
+ * a download's FixedLengthStream, and the slot would stay taken. Never rejects;
+ * its callers inside a `try` still await it, so a rejection would reach
+ * errorResponse (the 1B-T6 confirming review's n-1).
  */
 async function headOf(response: Response, method: string): Promise<Response> {
   if (method !== 'HEAD') return response
```

## Appendix B: the RED stub of the new module (`PL/stubs/src/v1/files/slots.ts`)

```ts
import type { WorkerContext } from '../worker-routes'

// RED stub (fix-download-aborts): the slot's return as given, with nothing
// handed to waitUntil. The real untilReturned keeps the request alive until the
// slot is back (ruling R97).

export function untilReturned(_w: Pick<WorkerContext, 'waitUntil'>, release: () => void): () => void {
  return release
}
```

## Appendix C: the receipt template

Write `docs/implementation/receipts/fix-download-aborts.md` in this shape, with your own numbers in the brackets. Keep the house style: plain sentences, no emoji, no em-dash.

```markdown
# fix-download-aborts: An aborted download gives back its slot (ruling R97)

- **Status:** built and verified locally on `fix/download-aborts`, from `[base SHA]` (which contains 1B-T6 to 1B-T11). Not pushed. Under ruling R87 this receipt is its own file; `premium-progress.md` is not edited. Under ruling R100 the whole workers suite is CI's. The independent review is the controller's, after this receipt.
- **Files:** new `src/v1/files/slots.ts` (`untilReturned`) and `test/workers/download-aborts.test.ts` (5 cases); shared `src/v1/files/downloads.ts` (the three downloads take their slots through `untilReturned`), `src/v1/files/receipts.ts` (the copy slot), `src/v1/files/uploads.ts` (the upload's place) and `src/v1/handler.ts` (two awaited `headOf` returns) [say which shared files, if any, took Appendix A's hunks].
- **RED to GREEN** (`PL/run-focused.sh` on `test/workers/download-aborts.test.ts`, under the heavy lock):
  - RED, `untilReturned` as a typed stub that hands nothing to `waitUntil`: `[5 failed (5)]`, every failure an `AssertionError` on a "pending" line.
  - GREEN: `[5 passed (5)]`.
- **Mutation check:** `[9]` mutants, `[9]` killed, no survivor ([one line per mutant: label, what it changes, the cases that failed]). Every file restored byte for byte (`shasum -c` OK).
- **The `wrangler dev` proof** (the planner's kit, P7): on this tree, `[the answers line]` (export `[bytes]`, snapshot chunk `[bytes]`, receipt `[bytes]`, each served whole after four aborted GETs and again five seconds later; four retains aborted mid-copy, then another member's retain 200; sixteen uploads aborted mid-body, then another member's upload 202). The planner's runs on the base: export, snapshot chunk and receipt 503 after four aborted GETs, twice; retain 200 and upload 202 (no local leak: under `wrangler dev` a handler whose client left runs on to its answer, P3).
- **Gate** (R100's fast local gate, from the worktree root): `typecheck:edge` [result]; FOCUSED [counts]; AFFECTED, 11 files [counts]; `test:edge` [counts]; `build:edge` [result; each driver marker counts 0 in the vault bundle]; `test:edge:workers` **CI** (R100); `test:edge:db` **SKIPPED** (Docker is stopped by the controller's order; this task changes no PostgreSQL code; CI's edge job runs it); `git diff --check` clean.
- **SKIPPED (hosted):** nothing deployed. The deployed runtime's cancellation of a handler whose client went away (the reason the copy and upload take the wrapper, P3 and P4) and the 30-second `waitUntil` limit (P9) are not exercised locally.
- **Deviations and calls:** the brief's planner rulings P1 to P11, each in one line (one helper in a new module; handed over with the slot just taken; the copy slot; the upload's place, beyond the listed kinds; the wiring test and `settle()`; one download more than the slots; the proof as a kit; the equivalent `await`; the 30-second residual; R96 unchanged; hosted checks).
- **Notes for later tasks:**
  - 1B-T13: the PostgreSQL edge's export and attachment downloads have the same leak and retire with it; `untilReturned` moves with `src/v1`. Any new slot or per-isolate count the Worker holds across awaits takes `untilReturned`.
  - download-pins: no shared file; the planner ran both briefs together.
  - A hosted environment: repeat the proof against the deployed Worker, including an aborted retain and upload (P3, P4, P9).
```

## Appendix D: the planner's files and their checksums

`PL/SHA256SUMS` (paths relative to PL) covers every file you copy or run from PL: `real/` (6 files, paths relative to `apps/edge`), `stubs/` (1), `orig/` (the 4 shared files at `ecc00b7`), `diffs/` (4), `mutants.py`, the three scripts, `wrangler/` (2), and the planner's `proof/mutants.out` and `proof/wrangler-*.txt`. Check it with `cd PL && shasum -a 256 -c SHA256SUMS` (Step 0.4). The planner's logs (`proof/*.log`, `proof/mutant-logs/`, `logs/`) have their own `PL/SHA256SUMS.logs`; they are gitignored and may be missing on another machine, so they are not part of any check you run. The folder also holds the planner's working copies (`tree/`, the proof tree, and `base/`, the base's source for the RED runs); the checksums do not cover them.

```
483f8e9f89303347839e5335963bbafcbba0284e989075776169804a7bca5dd7  diffs/src_v1_files_downloads.ts.diff
7e9b3de863672dbbda2fa363cf9e88fa1228928311915b2425babb27797252f9  diffs/src_v1_files_receipts.ts.diff
1b527822ada4f6d50e072eb12c72b7710a9e9b47bbf6e3817e037d4c7cc51886  diffs/src_v1_files_uploads.ts.diff
b10c662360fd4acaf9b0dfe8cb8ba13aca321aaad91cf608245076090c6bc810  diffs/src_v1_handler.ts.diff
3c2a3bb5de3c6cf4f41ea0dc52eacb8b32a862ef3d76248eed1e9e9582f5b85a  mutants.py
5718c57ddcf0e1eb10580adf7062dc8fd2266b5a28022ce0d391e50411009536  orig/src/v1/files/downloads.ts
2fe649355ce2b33a9ec2bd0f31034a775452499fece1faca26a9e25e46f79886  orig/src/v1/files/receipts.ts
4e5be95a21880ef108a2fd6956dc3d58fd4f84644e3c73f748a275d029e2c9e7  orig/src/v1/files/uploads.ts
c08a95fc544323ddd8558269ae1a49f4bfe78db7946a6df7e2f34ad150e0dac2  orig/src/v1/handler.ts
ad5d6a4d71a5f8312199db57f2191b283c3c262cb9479ee25aa0ff8b7e211aa9  proof/mutants.out
a68d7b8ff46d43f1dd9b0a123e43ed0af912600a84594f11eea0d2c9300c34c6  proof/wrangler-early-green-1.txt
73db7418c52b12e4e0e8526b644c8daaede51f02764cd5d64c21a2831ae68787  proof/wrangler-early-red-1.txt
bbde8e83317f13d28e40936ab4f1755327a9b6775648688bee35b11461563adf  proof/wrangler-early-red-2.txt
5276aa188e4f79d761e42fc99dbcd93b6d7c06d80a2505b9e54539850247125b  proof/wrangler-early-red-3.txt
3495c751a4adade8ff691e73f2abef393e93dbb8126d993cb658ae14fe60d050  proof/wrangler-green-1.txt
f18979579300d77e11dc19974d3c49abd6ec9cb45af284a70f93d07ce99f7227  proof/wrangler-green-2.txt
c083356e642eb3b4625226519d801531f76c78e91827bac2df4fbf9c92ff5bd7  proof/wrangler-green-3.txt
4bb7942dd5b68607beada9590d51a785d59e3f5427291042cf8c8ec476409fa5  proof/wrangler-red-1.txt
c8f630abcdba1ea4b8078c2381adb35e7b27abe5ea24645a9e689ea699b7443d  proof/wrangler-red-2.txt
9926a7275a5dde620b01dc75d5f450ab6c56038ce8487e16c081d78cadb2acf4  real/src/v1/files/downloads.ts
a957b6253033e9d7fd0b504200cef247de68aa05f5a1a540cc7d3b58c8730227  real/src/v1/files/receipts.ts
800cfec19411277f2056313d5e0ef082932e1848509e5a8a74168dacab850580  real/src/v1/files/slots.ts
dea1fc8865e70ce93c2470a129f9dd8a890626e9939fab94ba1a99d929a1f3d6  real/src/v1/files/uploads.ts
1417fe49c35f7afcd79fb1110796a0aa3227ad986e56519f106ac5047431ec3d  real/src/v1/handler.ts
e43cb9abeb75614fbd0cf2a73c15c1e6296ccc57935ff5db74e26414c57c84c0  real/test/workers/download-aborts.test.ts
7fb6fb4104f8679d98ef51e96586fff281d23f998e7fb5c25534f807d5607518  run-focused.sh
e3a9f443dc88b13e14ec3df1ad871fc476aeeaeecc16318c3188ed173f3de47b  run-mutants.sh
30a900c874815b14408ef0d86f47b322b274ad9f4f653d1b75559876708e471b  run-proof.sh
9a37ffa2591bc1ed4070b48de8298474eb541d25bf806b71e699c0f8ae14d944  stubs/src/v1/files/slots.ts
37ccb6f37bf981db82944e2ec83c5a83c2b5159ee37d1a6390e91e1cb8374977  wrangler/aborts.proof.test.ts
42ba8a8d731dc56551f94936ae962ea06df318d7df07352e118f330e1ea36f3f  wrangler/vault-proof.ts
```

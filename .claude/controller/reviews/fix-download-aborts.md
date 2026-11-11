# fix-download-aborts review: Downloads, copies and uploads return their slot when the client goes away (PR #396)

- **Reviewer:** independent Opus review, run as a workflow. Two lens reviewers covered separate areas, one after the other:
  - the **fix lens**: `untilReturned` and its five call sites (P1, P2, P4), Cloudflare's documented cancellation and the 30-second limit (P3, P9), the awaited `headOf` returns and R96's drain (P8, P10), and the `wrangler dev` proof;
  - the **tests lens**: `download-aborts.test.ts` (P5, P6), the planner's mutants and its own, the shared files against the work in flight (download-pins #397, alarm-hardening #398, 1B-T12 #394), and CI.

  This file is the synthesis. Neither lens reported a blocker or a major, so no skeptic pass ran and nothing is left unverified.
- **Read-only.** Probes ran only in scratch copies under `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-download-aborts-review/`. Paths below are relative to that folder.
  - `fix/tree/` (the fix lens) and `tests/tree/` (the tests lens): each is `git archive d0cc479`, with `node_modules` linked from the worktree. The tests lens also built `combined/` (with #397) and `triple/` (with #397 and #398).
  - `synth/tree/`: the same, for my own spot-check.

  Every workers, mutant and `wrangler dev` run held the heavy lock and released it. The worktree is clean at `d0cc479`. Nothing in it or in the main checkout was edited.
- **Reviewed:** `d0cc479` on `fix/download-aborts` (PR #396), range `origin/claude/p1a-vault-core...d0cc479`, merge base `e7b61d7`. One commit, 7 files, all under `apps/edge` except the receipt:
  - new: `src/v1/files/slots.ts` (`untilReturned`) and `test/workers/download-aborts.test.ts` (5 cases);
  - shared, each a wiring edit: `src/v1/files/downloads.ts`, `src/v1/files/receipts.ts`, `src/v1/files/uploads.ts` and `src/v1/handler.ts`;
  - the receipt, `docs/implementation/receipts/fix-download-aborts.md` (R87). `premium-progress.md` is not touched.

  All 6 code and test files are byte-identical to the planner's `real/` copies (`fix/commit-vs-real.sums`; my `synth/green.sums` has the same six hashes). At the merge base the four shared files equal the planner's `orig/`. The commit message has the Haiku trailer.
- **The base has moved since, in controller files only.** `origin/claude/p1a-vault-core` is now `f91d86a`, and `git diff --name-only e7b61d7 f91d86a` lists only `.claude/` paths. GitHub reports PR #396 `MERGEABLE`.
- **Against:**
  - rulings R97 and R96 (`handover.md`) and followups.md's fix-download-aborts entry;
  - the brief `briefs/fix-download-aborts.md`, whose P1 to P11 the controller accepted (P4 included), with the plan's Global Constraints (`src/server/http/files.ts` is reference code) and the 1B-T5, 1B-T6, 1B-T8 and 1B-T9 clauses it cites;
  - the receipt and the protocol.

## Summary

**Approved.** There is no blocker and no major. One minor and seven nits remain, each with a carrier. **CI never ran** (GitHub Actions is paused for billing), so the merge waits for the nine jobs.

- **The fix does what R97 asks.**
  - `untilReturned` hands `waitUntil` exactly one promise, after `take()` has succeeded, and that promise ends when the returned function runs. A request turned away at the slot (503) or refused at the vault step (404) hands nothing over.
  - Each of the five call sites already called its release on every path that returns the slot: `bodyStream`'s `onClose` (the body's end, failure or cancel), each `catch` and each `finally`. Each path now also ends the promise. Nothing returns between `take()` and the wrapper.
  - The upload's `uploading += 1` and its `finally { done() }` still pair one to one (P4). No pool's give-back can throw.
- **The proof holds on the commit.** The fix lens reran the planner's `wrangler dev` kit on `d0cc479`, GREEN only: 200, 200, 200, 200 and 202, every file whole with its digest. A proof-only read shows every pool at 0 right after each kind's four aborted requests.
- **Cloudflare's documentation is quoted correctly** (P3, P9), checked through Context7 against the current pages. Only the code comments leave out the 30-second cap (n5).
- **The test pins the wiring.** All 9 planner mutants are killed. A wrapper missing on any one site is killed by that site's case alone, and so is a slot taken after the wrapper, except at the upload (n2).
- **Three paths that P2 names are right in the code but unpinned:** prepare's copy attempts after a `wait` (m1), an upload turned away at the isolate limit (n2), and a download's `catch` after it took its slot (n3). For each one, a ready probe (PB, PA, PC) passes on `d0cc479` and kills the lens's mutant. I reran PB and its mutant.
- **One residual outside R97 (n1).** After an aborted retain's copy ends, its promise has ended, so the command step and the copy's release run with nothing pending in `waitUntil`. The deployed runtime may skip both. The effect is bounded (the copy stays reserved for 180 seconds), and it predates this change.
- **The shared files are clear of the work in flight.** #396, #397, #398 and #394 change disjoint files, the merged runs pass, and every mutant set applies, except download-pins' V3 once #398 is in (n7, not a #396 defect).

## CI

### Run 42745408105 on `d0cc479`: never started (billing)

`gh pr checks 396 --repo mygogocash/jotbun` lists nine failed checks. None of them ran a step.

| Job | Result |
| --- | --- |
| Typecheck, unit, API, build | not started, failed after 2 s |
| Exports (web and iOS bundles) | not started, 2 s |
| Render (every file but the per-section suites) | not started, 3 s |
| Render, per-section suites (three jobs) | not started, 3 s, 2 s and 2 s |
| Edge Worker (types, unit, workerd, build, PostgreSQL container) | not started, 3 s |
| SQL integration and ops (local PostgreSQL 17 container) | not started, 2 s |
| Release image and smoke (never pushed) | not started, 3 s |

- Every job has 0 steps. Each annotation reads: "The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings".
- It is the only run on `fix/download-aborts` (workflow `backend`, created 2026-11-10 02:49:53 UTC).
- **So no suite ran,** and there are no counts to read. **The merge waits for the nine jobs,** with this delta over a base run of the same integration head:
  - `test:edge:workers`: +1 file (`download-aborts.test.ts`) and +5 passed;
  - `test:edge`: +0;
  - `test:edge:db`: +0.
- **Local stand-ins** (not a substitute for CI), each on a scratch copy under the heavy lock:
  - `download-aborts.test.ts`: 5 of 5 in six runs (the tests lens), and 5 of 5 again in my run;
  - `d0cc479` with #397: 6 files, 247 passed. With #397 and #398: 5 files, 179 passed;
  - `tsc --noEmit` on the three-way merge exits 0, and `git diff --check` is clean on the range.

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. No test covers prepare's copy attempts after a `wait`. A mutant that wraps only the first attempt survives.** (tests lens m1)

- **Where:** `receipts.ts:110-121` takes every attempt's `COPY_SLOTS` slot through `untilReturned`. The brief's Interfaces table and the receipt both say "each attempt". P3 gives the reason for the copy wrapper: a cancelled retain never reaches its `finally`.
- **Why the tests miss it:**
  - The retain case (`download-aborts.test.ts:248-307`) runs one retain at a time, each with a new image, so it never reaches `wait`. Only attempt 1 is ever observed.
  - `attachments.test.ts` reaches `wait` ("two records retaining one image at once", `:690`), but it makes no `settle()` call, so it cannot see the promise.
- **Mutant R14** (`const slot = attempt++ === 0 ? untilReturned(w, COPY_SLOTS.take()) : COPY_SLOTS.take()`) passes `download-aborts.test.ts`, 5 of 5 (`tests/my-mutants.out`, `tests/my-mutants/mutant-logs/R14.log`).
- **Probe PB** (`tests/zz-review-lens2-probes.test.ts:65`) uses two clients. The first copy fails. The second, which polled meanwhile (`wait`), copies the image on a later attempt.
  - On `d0cc479` it passes. The promise is pending while that attempt copies, then the retain answers 200 and the promise ends (`tests/probes/green.log`).
  - Under R14 it fails with `[503, true, 200, true]` against `[503, false, 200, true]`. The second item says whether every promise had ended within 100 ms while the second client copies (`tests/probes/mutant-logs/R14p.log`).
  - My rerun agrees. On `d0cc479` the five cases and PA, PB and PC pass, 8 of 8 (`synth/green.log`). Under R14 the five cases pass and only PB fails, with the same line (`synth/mutant-R14.log`).
  - The fix lens's Node probe also kills R14. Its case "wait, wait, then none" reads `['ended']` against three ended promises (`synth/lens1-probe-R14.log`).
- **Why it matters:** such a regression would bring back R97's slot leak on the `wait` path in the deployed runtime, and no test would fail.
- **The code is right;** only the test is missing.
- **Fix:** add PB to `download-aborts.test.ts`. It needs no support change.
- **Carrier:** a follow-up.

### Nit

**n1. After an aborted retain's copy slot is back, its command step and the copy's release run with nothing pending in `waitUntil`.** (fix lens L1-n1)
- **Where:** each prepare attempt ends its promise in `finally { slot() }` (`receipts.ts:111`, `:117-119`). After that, `withReceipt`'s `return await vault.call(route, ...)` and `finally { if (copy) await release(vault, copy.key) }` (`:147-149`) run with nothing handed to `waitUntil`, and so do `confirmRoute`'s (`:186-188`).
- **Probe:** the fix lens's case "copy: pending while the copy runs, ended before the command step" reads `stateAtCommand` as `['ended']`, with the calls `prepare`, `retain` and `release` (`fix/probe-lens1-run3.log`; my rerun, `synth/lens1-probe.log`).
- **When it could bite:** the brief rests on Cloudflare's documented cancellation (P3: "outstanding work may be canceled unless it is passed to `ctx.waitUntil()`"). So once the slot is back, the deployed runtime may skip both steps. This is unverified, because it cannot be shown locally.
  - A skipped release leaves the copy reserved for `RECEIPT_COPY_GRACE_MS`, 180 seconds (`src/vault/files/attachments.ts:31`, `:142`).
  - Meanwhile a retry of the same image gets `wait` (`attachments.ts:132`), then 503 after `copyDeadlineMs` (`receipts.ts:120`).
  - The reservation also counts toward `COPIES_IN_FLIGHT`, 4 per vault, past which prepare answers 429 (`attachments.ts:35`, `:133-136`).
- **Bounded:** it heals itself and no slot leaks. It predates this change (before it, the whole retain was unprotected), and it is outside R97's scope.
- **The receipt's hosted note** ("repeat the proof ... including an aborted retain") should also check that the release runs.
- **A possible fix:** keep one promise pending until `withReceipt`'s and `confirmRoute`'s `finally` has released the copy.
- **Carrier:** a follow-up.

**n2. No case checks that an upload turned away at the isolate limit (503) hands nothing over, though P2 says each case's 503 line does.** (tests lens n1)
- **The code is right:** `uploads.ts:83-87` runs the 503 check and `uploading += 1` before `untilReturned`.
- **Why the tests miss it:** P2 says "Pinned by A9 ... and by each case's 404 and 503 lines", but the upload case (`download-aborts.test.ts:309-326`) has neither line. `imports-intake.test.ts`'s 16-upload 503 case makes no `settle()` call, so it cannot see the promise.
- **Mutant R11** (`untilReturned` moved above the check at `:83`) passes `download-aborts.test.ts` and `imports-intake.test.ts`, 55 of 55 (`tests/my-mutants/mutant-logs/R11.log`).
- **Probe PA** (`tests/zz-review-lens2-probes.test.ts:40`) holds 16 uploads on one client and sends the 17th from a second client. It answers 503 and its promises end. PA passes on `d0cc479` (also in `synth/green.log`) and fails under R11 (`tests/probes/mutant-logs/R11p.log`).
- **The harm of such a regression is small:** a turned-away upload stays alive for up to `waitUntil`'s 30 seconds, and no place leaks.
- **Fix:** add PA.
- **Carrier:** a follow-up.

**n3. No case checks that a download refused after it took its slot (the `catch` path) ends its promise.** (tests lens n2)
- **The code is right:** `downloads.ts:70-72`, `:105-106` and `:139-141` call the wrapped release in each `catch`. P2 says the promise "ends on every path that returns the slot: ... or the `catch`".
- **Why the tests miss it:** the only refusal in the download cases is the vault's 404, which comes before any slot is taken (`download-aborts.test.ts:157-160`). The lens's R12a to R12c confirm that each `refusedUrl` is refused at the vault step.
- **Mutant R13** (the export's `catch` returns the raw slot without ending the promise) passes `download-aborts.test.ts` and `exports.test.ts`, 41 of 41 (`tests/my-mutants/mutant-logs/R13.log`).
- **Probe PC** (`tests/zz-review-lens2-probes.test.ts:119`) removes the export's object, so the download answers 404 after taking its slot, and its promises end. PC passes on `d0cc479` (also in `synth/green.log`) and fails under R13 (`tests/probes/mutant-logs/R13p.log`).
- **The harm of such a regression is small:** the slot is still returned, and the request stays alive for up to 30 seconds.
- **Fix:** add PC.
- **Carrier:** a follow-up.

**n4. When a slot leaks, each slot case fails on the test's own `take()` (`download-aborts.test.ts:162` and `:289`), not on the expected-lines diff.** (tests lens n3)
- **Evidence:** in the lens's rerun of A8 (a slot never returned), the export, chunk and receipt cases throw `ProblemException` `SERVICE_UNAVAILABLE` from `Array.from({ length: d.slots }, () => d.take())` at `:162`, and the retain case throws at `:289` (`tests/planner-mutants/mutant-logs/A8.log`). None of them reaches `expect(lines)`.
- **Only the failure message suffers.** A8 is still killed. But P6's claim that "a slot that is never returned refuses one of them" never shows in the output: the refused GET or retain is hidden behind the test's own 503.
- The takes also run before the `try`, so a take that throws partway leaves the test's own slots taken. Nothing cascades, because each pool serves only one case of this file.
- **Fix:** take the slots inside the `try`, or record the take's 503 as a line.
- **Carrier:** a follow-up.

**n5. The code comments say a request lives until its slot is back, without Cloudflare's 30-second cap.** (fix lens L1-n2)
- **Where:** `slots.ts:16-18` ("While a waitUntil promise is pending, the request runs on until the slot comes back"). `uploads.ts:75-77`, `receipts.ts:101-102` and `downloads.ts:57-58`, `:92-93` and `:123-124` say the same with no bound.
- **The documentation** (Context API, current): "`ctx.waitUntil()` can extend execution for up to 30 seconds after the response is sent or the client disconnects ... shared across all `waitUntil()` calls within the same request. If any Promises have not settled after 30 seconds, they are canceled."
- The brief (P9) and the receipt (SKIPPED) both name this residual. Only the comments read as unbounded, and `slots.ts` is where the receipt sends later slots ("Any new slot ... takes `untilReturned`").
- **Fix:** one clause in `slots.ts`: a slot still held 30 seconds after the client left is cut and lost, for example a copy past 30 seconds of its 60-second `copyDeadlineMs`.
- **Carrier:** 1B-T13.

**n6. `untilReturned`'s returned function is neither idempotent nor exception-safe. It has no effect today.** (fix lens L1-n3)
- **Where:** `slots.ts:30-33` calls `release()` and then `returned()`, with no guard.
- **Probes** (`fix/tree/apps/edge/test/review-lens1.probe.test.ts`; `fix/probe-lens1-run3.log`, and my rerun `synth/lens1-probe.log`):
  - a counter release called twice counts twice. The upload's give-back is `uploading -= 1`, which is why the doc comment says "call once";
  - a release that throws escapes, and its promise is still pending after 100 ms (deployed, until the 30-second cap).
- **Neither happens today:**
  - every site calls the function once: `bodyStream`'s `close()` guard or the `catch` for downloads, and `finally` for the copy and the upload;
  - `DownloadSlots`' give-back is guarded by `given`, and it cannot throw: it is a flag, integer arithmetic and `Map` get, set and delete (`src/server/http/files.ts:22-30`). The probe calls each give-back repeatedly, with its per-account entry cleared, and it never throws;
  - the upload's give-back is `uploading -= 1` (`uploads.ts:85-87`).
- **Optional hardening:** a `given` flag, and `try { release() } finally { returned() }`.
- **Carrier:** 1B-T13.

**n7. Not a #396 defect: alarm-hardening's receipt (#398) still assigns download-pins' items to fix-download-aborts, and download-pins' V3 no longer applies once #398 is merged.** (tests lens n4)
- **Where:** in PR #398 (head `14844b9`), lines 4, 97 and 108 of `docs/implementation/receipts/alarm-hardening.md` name fix-download-aborts as the owner of 1B-T11's m3 and n6 and of the 1B-T9 X5 re-target.
- **Since the brief was split,** these belong to download-pins: its mutants V14, V15 and V3 (`scratch/download-pins-planner/mutants.py`), and line 121 of this task's brief (the item table). #396 changes neither `attachments.ts` nor `snapshots.ts`.
- **Probe:** download-pins' `mutants.py --check` applies 20 of 20 on `d0cc479` with #397. With #398 as well, it reports "V3 old text found 0 times in src/vault/files/attachments.ts" (`tests/check-download-pins-on-combined.out`, `tests/check-download-pins-on-triple.out`).
- **So** any download-pins mutant run after #398 merges must use alarm-hardening's A1 text for V3, as alarm-hardening's brief already says for "X5".
- **Carrier:** alarm-hardening.

## What was checked and found right

### 1. `untilReturned` (P1, P2): holds

- `slots.ts:23-34` hands over exactly one promise, after the slot is taken: `take()` is its argument and is evaluated first. The promise stays pending until the returned function runs, then ends.
- The fix lens's Node probe drives `untilReturned` and the five call sites with fake contexts. It passes 33 of 33 on the commit and fails 24 on the RED stub (`fix/probe-lens1-run3.log`, `fix/probe-lens1-redstub.log`). My rerun: 33 of 33 (`synth/lens1-probe.log`).
- **A release called twice:** a `DownloadSlots` slot is given back once (`given`, `files.ts:22-25`), the promise ends, and the pool's count is exact afterwards.
- **A release that throws:** no pool's give-back can throw. The four `DownloadSlots` pools and the upload counter only update counts (n6 is the hardening).
- **`slots.ts` imports only a type,** so no import cycle is added (P1), and `src/server/http/files.ts` is unchanged (Global Constraints).

### 2. The five call sites: hold

- **Downloads** (export, snapshot chunk and receipt):
  - a refusal at the vault step (404) and a full pool (503) hand nothing over (`downloads.ts:63`/`:65`, `:98`/`:100`, `:129`/`:131`);
  - a missing object (404 after the slot), a body read to its end, a cancel, a digest failure at the end, and the receipt's stall before its first chunk (503 at `downloadIdleMs`) each end the promise and return the slot.
- **The copy, per attempt** (`receipts.ts:108-123`):
  - with every `COPY_SLOTS` slot taken, a retain is 503 with nothing handed over and no vault call;
  - a refused prepare (404), a 429, and "wait, wait, none" (one promise per attempt, the slot held during each step, each ended) all end their promises;
  - a copy's promise is pending during the copy, and has ended before the command step (n1);
  - `confirmRoute`'s prepare goes through the same wrapper.
- **The upload** (`uploads.ts:83-99`, P4): `uploading += 1` pairs one to one with `untilReturned` and `finally { done() }`.
  - With sixteen held at the begin step, a seventeenth upload is 503 before the increment, with nothing handed over. Once they are released, all sixteen promises end and `uploadsInFlight` is back to 0.
  - An image upload with the `ocr` gate closed is refused before it takes a place.
- **Nothing returns early** between `take()` and the wrapper at any of the five sites.
- **No slot is missed.** The four `DownloadSlots` pools and `uploading` are the only per-isolate slots or counts that the vault Worker's front door holds across awaits (a grep of `src/v1` and `src/server`). All five uses go through `untilReturned`.

### 3. Cloudflare's documentation (P3, P4, P9): quoted correctly

- **P3's quote** matches the current Workers limits page, "Subrequests", word for word (Context7): "When the client disconnects or the response is complete, outstanding work may be canceled unless it is passed to ctx.waitUntil(), which can extend execution for up to 30 seconds." "Duration" says the same in other words.
- **P9's residual is stated correctly.** The Context API page says "up to 30 seconds after the response is sent or the client disconnects", shared across all `waitUntil()` calls of a request, and unsettled promises are canceled. "You can call waitUntil() multiple times", with no numeric cap, which covers the copy's one promise per attempt. `copyDeadlineMs` is 60 seconds (`apps/api/src/attachments/attachment-limits.ts:32`).
- **My own Context7 check** of the same pages agrees. The `waitUntil` limit: "If any Promises have not settled after 30 seconds, they are canceled." "Duration": "When the client disconnects or the response is complete, tasks associated with that request may be canceled."
- **The module-level `waitUntil`** from `cloudflare:workers` (`handler.ts:1`, `:130`) behaves like the request's `ctx.waitUntil`. workerd's types declare it as a standalone function, so calling it as `w.waitUntil(...)` is safe. Cloudflare's 2025-08-08 changelog says it "works the same way as ctx.waitUntil()".

### 4. `headOf` (P8) and R96's drain (P10): hold

- `headOf` cannot reject at `handler.ts:133` or `:151`. Its bodies are fresh and unlocked, the drain has a `.catch`, and the status is one an earlier `Response` already accepted. So `return await` is equivalent today, as P8 says, and the comment says why.
- `:185` needs no change, because its caller awaits it inside the `try` (`:117`).
- R96's drain (`handler.ts:217`, `pipeTo` into a discarding `WritableStream`) is unchanged. The diff touches only `:133`, `:151` and the comment.

### 5. The `wrangler dev` proof: holds

- **Read:** the planner's RED runs (export, snapshot chunk and receipt 503 after four aborted GETs, twice; the receipt `[200,200,503,503]`), its three GREEN runs, and the implementer's GREEN. They are consistent.
- **The fix lens's rerun on the commit** (`git archive d0cc479`, GREEN only, the kit's `run-proof.sh`, which took and released the heavy lock) answers 200, 200, 200, 200 and 202, with every file whole and its sha256 matching (`fix/run-proof-green-review.out`).
  - A proof-only `/__proof/slots` route read every pool at 0 right after each kind's four aborted GETs, and 2 seconds later (`fix/wrangler-green/observations-green-review.txt`).
- **Positive controls on the same build** (`fix/wrangler-green/positive-green.txt`):
  - an unread receipt GET reads `receipt` 1 until it is aborted, and 0 after;
  - an upload whose body never ends reads `uploads` 1 from 102 to 3002 ms, and 0 after its abort. So the proof's upload round really held places. Its sixteen aborted uploads show in wrangler's full log as ProxyWorker "Network connection lost" lines, which the probe's filter drops;
  - a 12 MiB retain could not be observed holding its copy slot, because a concurrent read is answered only after the retain ends. So the retain round's mid-copy timing is unverified. The round is a no-harm check either way, as P3 says.
- Afterwards no `wrangler` or `workerd` process of the lens remained (`fix/ps-after.txt` is empty), the lock was released, and no temporary persist folder was left.

### 6. The test file (P5, P6): sound

- **Runs:** 5 of 5 in six runs on a scratch copy, each case taking 0.14 to 0.28 s, and 5 of 5 in my run. `tsconfig` includes `test/`, so `typecheck:edge` covers the file. It has no `.only`, `.skip` or `.todo`, and its five `it()` cases match the expected +5.
- **The races (P5):**
  - with `PENDING_MS` at 2,000 (T1) the file still passes, so "pending" does not depend on timing;
  - with `ENDED_MS` at 50 (T2) it still passes, so the 5-second limit has a margin of 100 times or more;
  - the RED stub flips each case's first "pending" line;
  - the only `waitUntil` callers under `src/v1` are `handOffWork`, which resolves at once under `startWork: 'manual'` (retains and downloads start no work), and `slots.ts`. So every check sees only slot promises. No flake path was found: the upload's `eventually()` allows 5 seconds for an in-process step.
- **The 16-byte pieces:**
  - `TINY_JPEG` is 159 bytes, so 10 pieces, and the receipt's `holdLast` reads 2 ahead;
  - the held prefixes `export/`, `sync_snapshot/` and `receipt/` match the schema's key checks, and the fake's `arrayBuffer` rejects, so streaming is pinned;
  - with the gate off (T3), and with the gate off and one-piece bodies (T4), the file still passes. In this harness an unread body's backpressure alone holds the slot, so the gate is extra insurance. P5's "a one-piece body drains by itself" comes from the HEAD-cancel cases and does not reproduce here.
- **The slot arithmetic (P6):** export and chunk make 3 + 4 downloads against 4 slots. The receipt makes 3 + 2 against 2 per account; its 503 line shows that `RECEIPT_SLOTS.take(user.sub)` is the claims' `accountId`. The copy makes 1 + 4 retains against 4 slots.

### 7. Mutants

- **The planner's 9 (R100):** the tests lens reran all nine with the planner's `run-mutants.sh` on a scratch copy. 9 of 9 were KILLED, with exactly the failing cases in the implementer's `mutants.out`, and every file was restored (`tests/planner-mutants/mutants.out`).
- **The tests lens's own mutants** (`tests/my-mutants.out`):

| Mutant | Change | Result |
| --- | --- | --- |
| R1 to R5 | one site hands its promise to a no-op `waitUntil` (the wrapper on the other four) | each KILLED by its own case only |
| R6 | `returned()` before `release()` | survives; equivalent (both run synchronously and promise reactions are microtasks; the orders differ only if a release throws, n6) |
| R7 to R10 | the slot taken after the wrapper (export, chunk, receipt, copy) | each KILLED by that case's 503 line |
| R11 | the upload hands its promise over before the isolate's 503 check | survives 55 of 55; killed by PA (n2) |
| R12a to R12c | a download refused at the vault step hands over a promise | each KILLED by the 404 line alone |
| R13 | the export's `catch` returns the slot without ending its promise | survives 41 of 41; killed by PC (n3) |
| R14 | prepare's later attempts take the copy slot without the wrapper | survives 5 of 5; killed by PB (m1) |
| R15 | the upload gives its place back twice | KILLED (`uploadsInFlight()` reads -1) |
| T1, T2 | `PENDING_MS` 2,000; `ENDED_MS` 50 | pass (P5's races hold) |
| T3, T4 | the gate never holds; and one-piece bodies | pass (the gate is extra insurance) |

- **My spot-check** (`synth/`; the runners are `run-synth.sh` and `run-synth-node.sh`, and the mutant is in `mutate.py`):
  - `green.log`: `download-aborts.test.ts` with the tests lens's probe file on `d0cc479`: 8 passed (the five cases, PA, PB and PC).
  - `mutant-R14.log`: under R14 the five cases pass and only PB fails, with `[503, true, 200, true]` against `[503, false, 200, true]` (m1).
  - `lens1-probe.log`: the fix lens's Node probe on `d0cc479`: 33 of 33, including the copy-ordering case (n1) and the release cases (n6).
  - `lens1-probe-R14.log`: R14 against the Node probe. Only "wait, wait, then none" fails (`['ended']` against three), so it is a second ready pin for m1.
  - `receipts.ts` was restored after each mutant run, and `shasum -c green.sums` answers OK for all six files. Every run held the heavy lock and released it (`lock.txt`).

### 8. The shared files against the work in flight: clear (n7 aside)

- **Disjoint files:** #396, #397 (download-pins), #398 (alarm-hardening) and #394 (1B-T12) change disjoint files.
  - download-pins' `orig/` equals `d0cc479`'s five files, and #397 (`3894e58`) equals download-pins' `real/`.
  - #398 (`14844b9`) equals alarm-hardening's `real/`, and alarm-hardening's `orig/` equals `d0cc479`'s nine files.
- **Kit checksums:** this task's planner 31 of 31, download-pins 20 of 20 and alarm-hardening 45 of 45, all OK.
- **The mutant sets apply.** On `d0cc479` with #397: download-pins 20 of 20 and fix-download-aborts 9 of 9. With #398 as well: alarm-hardening 28 of 28, fix-download-aborts 9 of 9 and download-pins 19 of 20 (n7).
- **download-pins' six mutants on #396's shared files** (V4, V5 and V7 in `receipts.ts`; V8 and V9 in `handler.ts`; V12 in `downloads.ts`), run on `d0cc479` with #397: 6 of 6 KILLED, files restored. Its HEAD cases call no `settle()`, so `untilReturned` cannot hide V8 or V9.
- **Merged runs:**
  - `d0cc479` with #397, 6 files (download-aborts, exports, attachments, snapshots, imports-review and ai): 247 passed;
  - with #398 as well, 5 files (download-aborts, files-alarm, vault-schema, attachments and imports-review): 179 passed;
  - `tsc --noEmit` on the three-way merge exits 0.

  The new `settle()` calls in alarm-hardening are a local `setTimeout(0)` helper, not `V1Client.settle`. The "uncaught exception" lines in the logs are existing workflow-mock noise; they also appear in the implementer's and the download-pins planner's logs.

### 9. Integrity, the receipt's gate and hygiene

- The commit's 6 code and test files equal the planner's `real/`, and at the merge base the four shared files equal its `orig/`. Nothing outside `.claude/` has changed on the base since.
- **The receipt's gate** (the implementer's): `typecheck:edge` exit 0; the focused file 5 of 5; the 11 affected workers files, 335 passed and 1 todo; `test:edge` 15 files, 176 passed; `build:edge` exit 0 with no driver marker (R95); `git diff --check` clean. `test:edge:workers` is CI's (R100), and `test:edge:db` is SKIPPED (Docker stopped).
- **Hygiene:** both lenses and I took and released the heavy lock for every workers, mutant or `wrangler dev` run. The task worktree is clean, every scratch file was restored byte for byte, no `wrangler` or `workerd` process is left, Docker was not touched, and nothing is kept under `/private/tmp`.

## Notes for later tasks

- **A follow-up for the slot wiring: m1 and n1 to n4.** m1 and n2 to n4 are test-only. They could go in one small task with n1. The ready material:
  - m1, n2 and n3: add PB, PA and PC from `tests/zz-review-lens2-probes.test.ts` to `download-aborts.test.ts`. Each passes on `d0cc479` and kills R14, R11 or R13 in turn (`tests/probes/mutants.out`), with no support change. The fix lens's Node case "wait, wait, then none" also kills R14.
  - n4: take the test's own slots inside the `try` (`download-aborts.test.ts:162` and `:289`), or record the take's 503 as a line, so that a leak shows as the refused request in the expected-lines diff.
  - n1: keep one promise pending until `withReceipt`'s and `confirmRoute`'s `finally` has released the copy, so that the command step and the release run inside `waitUntil`'s 30 seconds. Or accept the bounded residual and name it.
- **1B-T13:**
  - n5: one clause in `slots.ts` on the 30-second cap: a slot still held 30 seconds after the client left is cut and lost.
  - n6: make `untilReturned`'s returned function idempotent and exception-safe (a `given` flag, and `try { release() } finally { returned() }`).
  - The receipt's notes stand. The PostgreSQL edge's export and attachment downloads (`src/server/app/routes.ts:341-346` and `:429-437`) have the same leak and retire there, and `untilReturned` moves with `src/v1`.
  - The hosted check: repeat the `wrangler dev` proof against the deployed Worker, with aborted retains and uploads (P3, P4, P9), and check that an aborted retain's copy is released (n1).
- **alarm-hardening (#398), n7:** correct its receipt's lines 4, 97 and 108, because 1B-T11's m3 and n6 and the X5 re-target are download-pins'. Any download-pins mutant run after #398 merges takes A1's text for V3.
- **The controller:**
  - **The merge waits for CI's nine jobs** (run 42745408105 never started, for billing). Read the edge job for `test:edge:workers` +1 file and +5 passed, `test:edge` +0 and `test:edge:db` +0, against a base run of the same integration head.
  - followups.md still names fix-download-aborts for 1B-T11's m3 and n6: under 1B-T11's entry (lines 342 to 344), and in the 1B-T12 planner note "snapshot-parity-window" (lines 365 and 370), which waits for "fix-download-aborts merges". Since the brief was split, those pins are download-pins' (#397), and #396 touches neither `snapshots.ts` nor `snapshots.test.ts`. So snapshot-parity-window should wait for #397. This is the same stale owner as n7 (from my spot-check).
  - The probes and runners:
    - the fix lens's: `scratch/fix-download-aborts-review/fix/` (`tree/apps/edge/test/review-lens1.probe.test.ts`, `wrangler-green/`, `commit-vs-real.sums`);
    - the tests lens's: `scratch/fix-download-aborts-review/tests/` (`zz-review-lens2-probes.test.ts`, `my_mutants.py`, `my-mutants.out`, `planner-mutants/`, `probes/`, `dp-mutants/`, `check-*.out`, `c1-combined-6files.log`, `c2-triple-5files.log`);
    - mine: `scratch/fix-download-aborts-review/synth/`.

VERDICT: Approved

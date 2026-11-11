# download-pins review: Pin the 1B-T6 to 1B-T11 reviews' guards in the vault's workers tests (PR #397)

- **Reviewer:** independent Opus review, run as a workflow. Two lens reviewers covered separate areas:
  - the **pins lens**: does each pin pin what its review asked? It walked the home table row by row and checked P1 (the RED set), P2 (the adaptations), P3 (the spy), P4 (the per-body counters), P6 (the tombstone case) and P8 (R57).
  - the **robustness lens**: flakiness under load, state leaking between cases, no source change, the merges with #396 and alarm-hardening (#398), and CI.

  This file is the synthesis. Neither lens reported a blocker or a major, so no skeptic pass ran and nothing is left unverified.
- **Read-only.** Probes ran only in scratch copies under `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/download-pins-review/`. Paths below are relative to that folder.
  - `pins/tree/`: `git archive 3894e58`, with `node_modules` linked from the worktree.
  - `robust/repo/`: a scratch clone for the merges. `robust/c396/`, `robust/c398/` and `robust/call/` are its merged trees, and `robust/v4probe/` holds the leak probes.
  - `synth/tree/`: `git archive 3894e58` (the same setup), for my own spot-check.

  Every workers run held the heavy lock and released it. The worktree is clean at `3894e58`. Nothing in it or in the main checkout was edited.
- **Reviewed:** `3894e58` on `fix/download-pins` (PR #397), range `origin/claude/p1a-vault-core...3894e58`, merge base `402c1df`. One commit, 6 files:
  - the five test files under `apps/edge/test/workers/`: `exports`, `attachments`, `snapshots`, `imports-review` and `ai`;
  - the receipt, `docs/implementation/receipts/download-pins.md` (R87). `premium-progress.md` is not touched.

  The diff is 622 insertions and 21 deletions, and 555 of the insertions are in the tests, as the receipt says. All five test files are byte-identical to the planner's `real/` copies, and all 20 lines of the planner's `SHA256SUMS` answer OK. The commit message is the brief's (Step 6.3), with the Haiku trailer.
- **The base moved after the review began.** The integration head is now `52c6f5f`. Since `402c1df`, only `.claude/` has changed. The head's `apps/edge`, `apps/api`, `packages` and root package files are byte for byte `c8929f2`'s (1B-T11's merge), and `3894e58` merges cleanly with it (`git merge-tree`).
- **Against:**
  - followups.md's `fix-download-aborts` entry, and its home table in `briefs/fix-download-aborts.md` ("Every item of the followups entry, and its home");
  - the brief `briefs/download-pins.md`, whose P1 to P11 the controller accepted;
  - the reviews it cites: `1B-T6-confirm.md` (n-2), `1B-T9.md`, `1B-T8.md`, `1B-T7.md`, `1B-T10.md` and `1B-T11.md`, with their scratch probes;
  - R100, R87, the receipt and the protocol.

## Summary

**Approved.** There is no blocker and no major. One minor and three nits remain, each with a carrier.

- **Every row the home table gives download-pins is met.** Each row has its case or in-place edit. Each new case fails under its review's own mutant and passes on the commit. Each mutant's text equals the review's own (V17 is the planner's extension).
- **The RED set holds (P1).** The 17 surviving mutants, applied at once, fail exactly the 20 expected cases in the pins lens's own run. Both 1B-T8 spy cases fail for P3's reason: a revoked proxy read at `readChunks`.
- **The mutants hold.** The implementer killed 20 of 20, one at a time. The lenses made 18 reruns, of 14 distinct mutants: 8 on the commit and 10 on the merged trees. All were killed, and every file was restored.
- **The adaptations are the same checks (P2):** `sendAs`, `preparesSeen` and AC-2's own client.
- **The spy lets the real read pass (P3), and the ten-times proof is unchanged.** It does not catch a reader that copies each row as it reads, and its comment claims it does (n1).
- **P4, P6, P7 and P8 hold.**
- **No source file changed.** The new cases pass alone and when moved to run first. The merges with #396 and with alarm-hardening (#398) are clean, and every pin passes on both and on all three together.
- **One minor (m1):** under V4 and `--red`, CP-1's designed timeout leaves `RECEIPT_LIMITS.copyDeadlineMs` at 400, and a held copy, for the rest of `attachments.test.ts`. RB-2 then passes `--red` only by about a 2x timing margin. CI runs unmutated code, so it is not affected.
- **CI never started.** GitHub Actions refused all nine jobs for billing. The merge waits for the nine jobs. Expected: workers +0 files and +19 passed.

## CI

### Run 42748341937 on `3894e58`: no job started (billing)

`gh pr checks 397 --repo mygogocash/jotbun` lists all nine jobs as `fail` after 3 s. Each one carries the annotation: "The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings". So no job ran, and there are no counts to read.

| Job | Result |
| --- | --- |
| Typecheck, unit, API, build | not started (billing), 3s |
| Exports (web and iOS bundles) | not started (billing), 3s |
| Render (every file but the per-section suites) | not started (billing), 3s |
| Render, per-section suites (three jobs) | not started (billing), 3s each |
| Edge Worker (types, unit, workerd, build, PostgreSQL container) | not started (billing), 3s |
| SQL integration and ops (local PostgreSQL 17 container) | not started (billing), 3s |
| Release image and smoke (never pushed) | not started (billing), 3s |

GitHub reports the PR `MERGEABLE`, with merge state `UNSTABLE` because of the refused checks.

**The merge waits for the nine jobs.** The comparison base is `c8929f2`'s last green edge job (run 42734393509, job 129559935780). Its `apps/edge`, `apps/api` and `packages` equal this PR's base and the current integration head.

| Step | Base (run 42734393509) | Expected on this PR | Delta |
| --- | --- | --- | --- |
| `test:edge` | 15 files, 176 passed | 15 files, 176 passed | +0 |
| `test:edge:workers` | 30 files, 736 passed, 1 todo (737) | 30 files, 755 passed, 1 todo (756) | +0 files, +19 passed |
| `test:edge:db` | 9 files, 64 passed | 9 files, 64 passed | +0 |

- **By file:** `imports-review` 62 to 64, `attachments` 52 to 61, `snapshots` 35 to 40, `exports` 36 to 36 and `ai` 38 to 41. The robustness lens's local runs give these counts, and so do mine (my A0 run has 62 in `attachments`: the 61 plus my probe).
- **Elsewhere:** no source file changed, so the vault bundle and every other job should match the base.
- **Time:** in the base job, each of the five files ran in under 10.2 s. The workers step took 147.7 s.

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. Under V4 and `--red`, CP-1's designed 15-second timeout leaves `RECEIPT_LIMITS.copyDeadlineMs` at 400, and its held copy, for the rest of `attachments.test.ts`. RB-2 then passes `--red` only while its first copy ends inside 400 ms.** (robustness lens L2-m1)

- **How it happens:**
  - CP-1 runs its second retain inside `withLimits({ copyDeadlineMs: 400 })` (`attachments.test.ts:1824`).
  - V4 removes the deadline check (`receipts.ts:117`), so under V4 that retain never settles. Two `finally` blocks then never run before the file ends:
    - `withLimits`' own (`:125-133`);
    - the case's own (`:1829-1832`: `hold.open()` and `kit.reset()`).
  - `copyOf` reads `RECEIPT_LIMITS.copyDeadlineMs` for each copy (`receipts.ts:80`), so every later copy in the file aborts at 400 ms.
  - CP-1's first retain also stays parked in its `get` hook and holds one of `COPY_SLOTS`' four slots. Its second retain polls every 75 ms, with no deadline.
- **Why it matters:**
  - RB-2 (`:1857`) is not in `--red`'s expected set, so it must pass there. It holds its first copy at the receipt HEAD, under that 400 ms abort.
  - It passes because it ends in 178 to 192 ms, about a 2x margin. Those times come from the implementer's and the planner's `RED.log` and `V4.log`.
  - On a slower or busier machine, `--red` would report `FAILED BUT NOT EXPECTED: RB-2`.
  - CI runs unmutated code, where nothing leaks, so CI is not affected. Only the `--red` gate, and any rerun of V4, is fragile.
- **Probes** (`robust/v4probe/apps/edge/test/workers/attachments.test.ts:1905-1950`, run by `robust/own-mutants.py V4P`):
  - **L1** checks that the limits are back at their load-time values. It passes on the commit (`robust/v4probe-green2.log`, 63 passed). Under V4 it fails: `copyDeadlineMs` is 400, not 60000 (`robust/own-logs/V4P.log:102-103`).
  - **L2** is RB-2 with its hold kept until 12 waits, about 900 ms.
    - On the commit it passes, in 968 ms.
    - Under V4 it sees only 6 waits (`V4P.log:121`). The first copy is aborted at the leaked 400 ms, and the second request then copies the image itself.
    - A first version, held until 6 waits (about 450 ms), still passed under V4 (`robust/own-v4p.out`).
- **My spot-check agrees** (`synth/spot.out`):
  - My probe S1 checks the same thing as L1. It passes on the commit (A0: 62 passed).
  - Under V4 it fails, with `copyDeadlineMs` 60000 expected and 400 received (A1).
  - In A1, CP-1 times out at 15,005 ms and RB-2 passes in 183 ms.
- **Fix:** one of these:
  - inside `withLimits`, race CP-1's second retain against a timer of about 3 s. CP-1 then fails fast under V4, and both `finally` blocks run. This also cuts 12 s from each V4 and RED run.
  - restore the limits and open the hold from `onTestFinished`.
- **Carrier:** a follow-up.

### Nit

**n1. `watchedSql`'s doc comment claims more than the spy enforces. A reader that copies each row as it reads it (`Array.from` with a mapper) still holds every row at once, and both spy cases pass.** (pins lens L1-n1)
- **Where:** `snapshots.test.ts:136-140` says the spy also catches "a reader that collects the rows before using them (a spread, Array.from)", and that "the read must turn each row into its line before it reads the next".
- **Mutant L2** changes `snapshots.ts:196` to `for (const row of Array.from(c.sql.exec<HeadRow>(ENTITY_READ), (r) => ({ ...r }))) {`.
  - The mapper copies each row before the next pull, so no revoked proxy is ever read. Yet every row is held at once. That is the same materialisation as the 1B-T8 review's X1 (V10).
  - Under L2, both spy cases pass, in two runs (`pins/own.out`, `pins/own-l2.out`): `reads every row before the first R2 call` and the ten-times case.
  - The ten-times line does not move: `peakHeldBytes` is 20,050,112 under L2, against 20,050,107 on GREEN.
  - The control, L2b (a plain `Array.from` with no mapper), is killed by both cases, as V10 is.
- **My spot-check agrees** (`synth/spot.out`):
  - B1 (L2): both cases pass, with `peakHeldBytes` 20,050,102.
  - B0 (the planner's V10, a spread): both cases fail with "Cannot perform 'get' on a proxy that has been revoked" at `readChunks` (`snapshots.ts:197`).
- **So m-2's ask is met.** The spy is the 1B-T8 review's own suggested fix (`streamingOnlySql` in `scratch/1b-t8-review/`), and it kills the review's X1. What remains is a gap in the spy, and a comment that claims more than the spy enforces.
- **Fix:** narrow the comment to readers that keep the row objects past the next pull: a spread, or `Array.from` without a mapper. A check that also catches per-row copies is not cheap.
- **Carrier:** a follow-up.

**n2. Once alarm-hardening (#398) merges, download-pins' `mutants.py` V3 no longer applies as text. DU-2 still kills the new form.** (robustness lens L2-n2)
- **Where `--check` fails:** `mutants.py --check` passes on the commit and on the #396 merge. On the #398 merge, and on the merge of all three PRs, it prints `V3 old text found 0 times in src/vault/files/attachments.ts`. #398 rewrote `attachmentsDueAt`'s safety net to read through `attachment_checks`.
- **The lens's V3AH** drops that term, the same change as alarm-hardening's own A1. DU-2 kills it on the #398 merge (`robust/own-v3ah.out`: 1 failed, the DU-2 case, `restored=True`).
- **Already recorded:** `briefs/alarm-hardening.md:259` says that a mutant run after both tasks merge must use A1's text for X5. This only confirms it.
- **Carrier:** alarm-hardening. Whoever reruns download-pins' mutants after both merge should swap V3's text for A1's.

**n3. The receipt says `test:edge` needs no heavy lock. The lesson recorded since `9ddb949` says it does.** (robustness lens L2-n1)
- **The receipt** (`docs/implementation/receipts/download-pins.md:65`): "`test:edge` and `build:edge` are not workers runs, so they took no lock."
- **The lesson** (`.claude/skills/jotbun-controller/references/lessons.md:16` on the integration branch): "`npm run test:edge` needs the heavy lock too". The reason is that `r2-object-store.test.ts` starts Miniflare (workerd) (`apps/edge/test/r2-object-store.test.ts:6` and `:31`).
- **Stale, not skipped:** the lesson landed after this PR's base (`402c1df`), so the receipt line is out of date rather than a step left out. No result depends on it.
- **Carrier:** a follow-up.

## What was checked and found right

### 1. The home table, row by row

Each row that `briefs/fix-download-aborts.md` gives download-pins has its case or edit. Each review's mutant fails it, in the implementer's run (`scratch/download-pins/mutants.out`) and in the lenses' reruns.

| Home table item | Case or edit (file) | Review's mutant | Result |
| --- | --- | --- | --- |
| 1B-T6 confirming n-2: the export HEAD's counter, per HEAD | `a HEAD on a download answers its headers, reads its file to the end and gives its slot back` (`exports`, changed in place: `reads[i]`) | V8 (X7), V9 (F5) | killed |
| 1B-T9 m-1: prepare's session, policy and account check (AC-1 to AC-3) | the three cases of the m-1 block (`attachments`) | V1 (X1) | 3 failed |
| 1B-T9 m-2: the receipt HEAD's counter, per HEAD (HD-1) | `a HEAD on a receipt download answers its headers, reads its image to the end and gives its slot back (ruling R96)` (`attachments`, changed and renamed) | V8 (X7), V9 | killed; before, V8 passed the receipt case (only the export and chunk HEAD cases caught it) |
| 1B-T9 m-3: `attachmentsDueAt`'s two guards (DU-1, DU-2) | the two cases of the m-3 block (`attachments`) | V2 (X4), V3 (X5) | 1 failed each |
| 1B-T9 n-1: the poll deadline (CP-1) | `a request waiting on another copy of the same image gives up at copyDeadlineMs with 503` | V4 (X2) | killed (by its timeout; see m1) |
| 1B-T9 n-2: unknown body fields (AC-5) | `an unknown body field is refused before anything is reserved or copied, ...` | V5 (X3) | killed |
| 1B-T9 n-3: the preview's `ready` status (CP-2) | `the image of a preview that is no longer ready is not copied, ...` | V6 (X6) | killed |
| 1B-T9 n-4: the robust "two records at once" (RB-2) | `a second request for an image whose copy is held only waits, ...` | V7 (M38) | killed, with 1 wait seen (fewer than 2), no sleep |
| 1B-T9 n-5: the test header's counts | the header (`attachments.test.ts:1-6`) | none | right; the merged receipt's labels are the controller's |
| 1B-T7 m-2: `ai.consume`'s session pin (W7) | `a session signed out between the context step and the use is refused at the use: ...` (`ai`) | V19 (W7) | killed |
| 1B-T7 n-1: the P2 input probes (W5) | the two 422 cases (`ai`) | V20 (W5) | 2 failed |
| 1B-T8 m-2: the spy | `watchedSql` yields revocable rows (`snapshots`); no new case (P3) | V10 (X1) | both spy cases fail; see n1 |
| 1B-T8 m-3: not pending (X6) | `a build of a snapshot that is no longer pending reads nothing and stores nothing` | V11 (X6) | killed |
| 1B-T8 n-1: digest as a chunk streams (probe E) | `a chunk whose stored bytes no longer match its digest, ...` | V12 (X2) | killed |
| 1B-T8 n-2: reuse at the watermark (probe C2) | `a snapshot read exactly at the purge revision, ...` | V13 (X3) | killed |
| 1B-T10 m-1: R57 on corrections | `a correction of 500 rows at once, ...` (`imports-review`) | V16 (U9); V17 (the planner's extension) | killed; also the pins lens's L1 |
| 1B-T10 m-2: the preview's accepted-upload guard (U1) | `an upload that was never accepted ... has no preview: 404, ...` | V18 (U1) | killed |
| 1B-T10 n-2: two changed-form cases lack their comment | "Changed form:" comments at `imports-review.test.ts:904-905` and `:1294-1295` | none | in the house style |
| 1B-T11 m3: `snapshotsDueAt`'s stale term | `a ready snapshot that is not stale is due only a week past its expiry, ...` | V14 (R1) | killed |
| 1B-T11 n6: `pruneSnapshots`' tombstone guard | `pruneSnapshots leaves a stale snapshot's tombstones their own day: ...` (the planner's own) | V15 (R2) | killed |

- **Mutant fidelity (pins lens):** each planner mutant's text equals its review's mutant:
  - from the 1B-T9 review's `own_mutants.py`: V1 = X1, V2 = X4, V3 = X5, V4 = X2, V5 = X3, V6 = X6 and V8 = X7;
  - V7 = M38 and V9 = F5;
  - from 1B-T8: V10 = X1, V11 = X6, V12 = X2 and V13 = X3;
  - from 1B-T11: V14 = R1 and V15 = R2;
  - from 1B-T10: V16 = U9 and V18 = U1;
  - from 1B-T7: V19 = W7 and V20 = W5.

  V17 is the planner's own extension.
- **The header (1B-T9 n-5):** its counts are right. The file has 40 ported cases, the controller's 2, the plan's 6, the planner's 4 and the 9 review pins: 61 cases.
- **Labels:** each new case names its review and probe label in a comment.
- **The rows that are not this task's** are where the table puts them:
  - R97, 1B-T9's four aborted retains, 1B-T6's n-1 and the upload's place belong to fix-download-aborts;
  - 1B-T9's n-6 needs no change;
  - 1B-T7's n-8 is used by fix-download-aborts;
  - 1B-T10's n-3 was ruled by 1B-T11's P14.

  followups.md's entry matches the table.

### 2. P1, the RED set: holds

- **The pins lens's own `--red` run,** on a `git archive` copy of `3894e58`: `[20 failed | 222 passed (242)]`. That is exactly the 20 expected, with `restored=True` (`pins/planner-red/red.out`). It equals the implementer's and the planner's runs.
- **Both 1B-T8 spy cases fail for the reason P3 gives:** "Cannot perform 'get' on a proxy that has been revoked", at `readChunks` (`snapshots.ts:197`). My B0 run shows the same error under V10 alone.
- **The not-pending case under RED** fails on that same proxy error, because V11 lets the read run. V11 alone fails it on its own assertion, `['skipped', 1, 1]` (the implementer's `V11.log`).

### 3. P2, the adaptations: each is the same check

- **`sendAs` for `send`:**
  - The three AI cases, `recordingVault` and `MALFORMED` are byte-identical to the 1B-T7 wiring probes once `send` is renamed `sendAs` and `model` is renamed `own`.
  - I reran that mechanical diff (`pins/commit-ai-*.txt` against `pins/probe-ai-*.txt`). In the cases, only the probes' labels (`P2 (accepted):`, `P2 parity:`, `P5:`) and blank lines differ, as P2 says. The probe's `rawAs` is dropped, and none of the three cases used it.
  - V19 and V20 fail the cases.
- **`preparesSeen` for `observedVault`:**
  - It forwards every other property of the namespace and of the stub (a `Proxy` plus `bind`), and records the same prepare kinds as `observedVault`.
  - RB-2 kills V7 deterministically: it sees 1 wait, fewer than 2, without the old case's 250 ms sleep.
- **AC-2's own client:**
  - Its config is `DEFAULT_CONFIG` plus terms v2 only. `readEdgeConfig` reads KV on every request, with no cache.
  - Its `finally { setup() }` writes `DEFAULT_CONFIG` back, so a failing AC-2 cannot spill into the next case. The probe restored outside a `finally`.
  - Every later case writes its own config first (robustness lens).
- **No other adapted probe drops an assertion.** HD-1, U1 and AC-3 are equal or stronger.
- **AC-3's name says "the release step still runs", and the case pins it.** The pins lens's L3 (`attachments.release` without `anySession`) fails AC-3.

### 4. P3, the spy: a real read passes, and the proof still proves what it did (n1 aside)

- **A real read still passes.** The real read turns each row into its line before the next pull (`snapshots.ts:196-211`), and GREEN passes.
- **The ten-times line is the same** in the planner's, the implementer's and the pins lens's GREEN runs:
  - 32,002 entities in 19 chunks;
  - 19,001,807 bytes stored;
  - `peakHeldBytes` about 20,050,1xx;
  - a build of about 550 ms.
- **The revocable rows add no measurable cost.** After the change, the ten-times build takes 534 to 554 ms locally, against 503 to 658 ms before (CI before: 1,645 ms). The case's timeout is 300 s, and it asserts no wall time.

### 5. P4, the per-body HEAD counters: hold

- **Under V9:** every export entry reads 0 and every receipt entry reads 8,192, so each entry is its own proof.
- **Under V8:** all three HEAD cases fail.
- **Under F6** (the 1B-T6 confirming review's mutant: read one chunk, then cancel; the pins lens's L4): all three HEAD cases fail too.
- **The export indexing is exact.** `readyExport` reads no file through the counting bucket, so `reads[0..3]` are exactly the four HEADs (robustness lens).

### 6. P6, the planner's tombstone case: fails for the right reason

Under V15 the case fails at its last assertion: `[['tombstone', 0]]` against `expires + TOMBSTONE_MS`. That assertion comes after `pruneSnapshots` dropped the stale snapshot's chunk rows, which proves the `STALE_CHUNKS` path ran.

### 7. P7, the ready-due case and the clocks: hold

- **The case:** it is the 1B-T11 review's ready pin (R1F), with a `finally` added.
- **Its alarm half is not vacuous.** The pins lens's scratch probe (`pins/zz-lens1-probe.test.ts`) shows the schedule after the alarm:
  - `delete_objects` at `t + 1 day`;
  - `prune_files` at `t + 8 days`.

  That half alone also kills V14 (`pins/own-l5.out`).
- **It is the only new `setVaultClock`.** It restores the clock in `finally` (`snapshots.test.ts:1229`). Its forced alarm rearms from the vault clock (now plus a day), so it never fires on its own.
- **DU-1 and DU-2** call prune, sweep and `attachmentsDueAt` at an explicit `t0`, and do not rearm.
- **No self-fired alarm can race a new case.** Every call rearms at least `CALL_ALARM_DELAY_MS` (60 s) ahead, which is longer than a file's run.
- **C2's forced alarm can fire on its own vault.** Its snapshot sits exactly at the purge watermark, though, so it is not stale, and its checks still hold.

### 8. P8, R57 on corrections: holds at all three reads

- **Under V16 and V17,** R57 fails with `[500, undefined]`.
- **The third read is pinned too.** The pins lens's L1 binds one `?` per row id in `correctRows`' current-row read (`confirmation.ts:110-117`), the third read that 1B-T10's m-1 lists. Only R57 fails under it, so R57 pins all three reads.
- **Time:** the case takes 33 to 45 ms against its 60 s timeout. It seeds through `seedPreview` (`parsedImport`, `imports-review.test.ts:170`), not a parse.

### 9. Robustness under load, and leaks between cases: hold (m1 aside)

- **Alone:** the new and changed cases pass with no earlier case in their files: 21 passed, 221 skipped (`robust/alone.log`).
- **Moved to run first:** with each file's new block moved before its first `describe` (`robust/make-reorder.py`), all 206 cases of the four files pass (`robust/reorder.log`). So the new cases leave nothing that the existing cases notice.
- **The limits after the copy-path block:** on the commit, `RECEIPT_LIMITS` is back at its load-time values (the lens's L1, and my S1 in A0).
- **Timing margins:**
  - CP-1 takes 426 to 507 ms, against its `< 3_000` check and its 15 s timeout.
  - RB-2 takes about 180 ms. Its loop allows at least 2 s for two waits, and the second request's default deadline is 60 s.
  - Every new case without its own timeout takes 0.25 s or less, against vitest's 5 s default.
- **Probe E:** `bodyStream` calls `controller.error` and then releases the slot in the same turn (`server/http/files.ts:101-103`), so the sixth download always finds a free slot.

### 10. Scope and integrity: hold

- **Scope:**
  - `git diff --stat origin/claude/p1a-vault-core...3894e58` lists only the five test files and the receipt.
  - No source file, package, lockfile, `test/workers/support/` or `test/support/` file changed.
  - `git diff --check` is clean.
- **The kit:** the five files equal `PL/real/` by SHA-256, and `PL/SHA256SUMS` answers 20 of 20 OK.
- **Scratch hygiene:**
  - The pins lens's scratch tree matched `3894e58` on all 184 edge `src` and test files after every run.
  - My three touched files match `3894e58` again, checked against `git show`.

### 11. The merges: clean, and every pin passes

- **#396, fix-download-aborts** (`fix/download-aborts`, still at `d0cc479`):
  - Merged into `3894e58` cleanly with the ort strategy (scratch commit `dc73b2b`).
  - The five files plus `download-aborts.test.ts` give 6 files, 247 passed (`robust/c396-focused.log`).
  - P11 holds: no added line calls `settle()`.
  - V4, V5, V7, V8, V9 and V12 are each killed there, and `mutants.py --check` passes.
  - #396's pending fix round (`briefs/fix-download-aborts-fix.md`) replaces only `download-aborts.test.ts` and extends its own receipt, so this result stands after it lands.
- **alarm-hardening** (PR #398, at `14844b9`):
  - Its kit's `real/` files are byte for byte the PR head's, all 10 of them.
  - Its merge with `3894e58` is clean (`8538a95`), and equals laying `real/` over the commit.
  - `attachments`, `snapshots` and `imports-review` give 165 passed (`robust/c398-focused.log`). DU-1, DU-2 and the five snapshot pins pass.
  - V2, V14, V15 and V18 are each killed there. V3's alarm-hardening form (A1) is killed by DU-2 (n2).
- **All three merged** (`53b7d8a`):
  - The merge is clean.
  - The five files plus `download-aborts.test.ts` give 247 passed (`robust/call-focused.log`).
  - `tsc --noEmit` exits 0, with `test/` included.

### 12. Mutants

- **The implementer's run:** 20 of 20 killed one at a time, each with `restored=True`. Every failing count matches the receipt's.
- **The lenses' reruns of the planner's mutants (R100):**
  - the pins lens reran V1, V7, V8, V9, V10, V15, V16 and V17 on the commit (`pins/planner-sample/mutants.out`);
  - the robustness lens reran V4, V5, V7, V8, V9 and V12 on the #396 merge, and V2, V14, V15 and V18 on the #398 merge (`robust/mut-c396/`, `robust/mut-c398/`).

  All were killed, and every file was restored.
- **The lenses' own mutants:**

| Mutant | Change | Result |
| --- | --- | --- |
| pins L1 | `correctRows`' current-row read binds one `?` per row id (the third R57 read) | KILLED by R57 alone |
| pins L2 | the entity read copies every row (`Array.from` with a mapper) before it encodes any | survives both spy cases (n1) |
| pins L2b | the entity read collects every row with `Array.from` (no mapper) | KILLED by both spy cases |
| pins L3 | `attachments.release` without `anySession` | KILLED by AC-3 |
| pins L4 | `headOf` reads one chunk, then cancels (1B-T6 confirming F6) | KILLED by the three HEAD cases |
| pins L5 | V14, against the ready-due case's alarm half alone (scratch probe) | KILLED |
| robust V4P | V4, with the leak probes L1 and L2 | CP-1 times out as designed; L1 and L2 fail (m1) |
| robust V3AH | V3's alarm-hardening form (A1), on the #398 merge | KILLED by DU-2 (n2) |

- **My spot-check** (`synth/`: the runner is `spot.py`, its output `spot.out`, its logs in `synth/out/`). Each run held the heavy lock and released it:
  - **A0:** my probe S1 (the receipt limits equal their load-time values) on the commit: 62 passed.
  - **A1:** S1 with V4. CP-1 timed out at 15,005 ms, RB-2 passed in 183 ms, and S1 failed: `copyDeadlineMs` 60000 expected, 400 received (m1).
  - **B1:** the pins lens's L2 against the two spy cases: both passed, with `peakHeldBytes` 20,050,102 (n1).
  - **B0:** the planner's V10, as the control: both spy cases failed on the revoked proxy at `snapshots.ts:197`.
  - Every edited file was restored (`restored=True`) and matches `3894e58` in `git show`.

## Notes for later tasks

- **A follow-up for the tests (m1, n1, n3).** They could go in one small task, with this ready material:
  - **m1:** make CP-1 fail fast under V4. Either race the second retain against a timer of about 3 s inside `withLimits`, or restore the limits and open the hold from `onTestFinished`.
    - The robustness lens's probes L1 and L2 (`robust/v4probe/apps/edge/test/workers/attachments.test.ts:1905-1950`) pass on the commit and fail under V4 today. With the fix, both should pass under V4 as well.
    - Each V4 and RED run also gets 12 s shorter.
  - **n1:** narrow `watchedSql`'s comment (`snapshots.test.ts:136-140`) to readers that keep the row objects past the next pull.
  - **n3:** correct the lock line in `receipts/download-pins.md:65`. Under the controller's lesson "Fix small doc errors yourself", this can be a one-line commit before merge, or a housekeeping commit after it.
- **alarm-hardening (n2):** after both tasks merge, a rerun of download-pins' mutants needs A1's text for V3. Its brief's line 259 already says the same for X5.
- **The controller:**
  - **CI:** once GitHub Actions runs again, rerun the PR's checks and compare them with the CI table above: workers +0 files and +19 passed, with `test:edge` and `test:edge:db` +0. The merge waits for the nine jobs.
  - **1B-T9's receipt:** its n-5 labels in the merged `receipts/1B-T9.md` are the controller's housekeeping, as the home table says. The same receipt's line 46 names the receipt HEAD case by its old name, `a HEAD on a receipt download answers its headers and gives its slot back (ruling R96)`. It was correct when written; this task renamed the case to `... reads its image to the end and gives its slot back (ruling R96)`.
  - **Optional regression cases:** 1B-T12 and 1B-T13 may take the review probes that passed (the receipt's note). None is required.
  - **The probes and runners:**
    - the pins lens's: `scratch/download-pins-review/pins/` (`lens1_mutants.py`, `zz-lens1-probe.test.ts`, `planner-red/`, `planner-sample/`);
    - the robustness lens's: `scratch/download-pins-review/robust/` (`own-mutants.py`, `make-reorder.py`, `vt.sh`, `locked.sh`, `v4probe/`, and the merge clone `repo/`);
    - mine: `scratch/download-pins-review/synth/` (`spot.py`, `spot.out`, `out/`).

VERDICT: Approved

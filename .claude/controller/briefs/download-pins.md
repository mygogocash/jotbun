# Brief download-pins: Pin the checks the 1B-T6 to 1B-T11 reviews found untested

You are the implementer (Haiku) for download-pins, the test-only half of the follow-up task fix-download-aborts (its brief, `briefs/fix-download-aborts.md`, is the fix of ruling R97; this brief carries the review pins the controller listed with it). The code is right today; the reviews of 1B-T6, 1B-T7, 1B-T8, 1B-T9, 1B-T10 and 1B-T11 each found checks that no case pins, and left ready probes. You add those probes as cases, adapted to their host files, in five existing workers test files. No source file changes. The planner wrote every file below and proved it on the base **`ecc00b7`** (`origin/claude/p1a-vault-core` at planning; its code is 1B-T11's merge `c8929f2`), in a scratch copy whose edge, API, packages and root package files are byte for byte that commit's: RED (the reviewers' 17 surviving mutants applied at once fail exactly the 20 expected cases), GREEN, 20 of 20 mutants killed one at a time, the fast local gate (R100), and a combined run with fix-download-aborts' files. Do exactly what this brief says.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md` (R100, R87: your receipt is `docs/implementation/receipts/download-pins.md`).
2. The task's entry in `/Users/kunanonjarat/Developer/jotbun/.claude/controller/followups.md` (search for `fix-download-aborts`; this brief takes its review pins), and the reviews it cites: `reviews/1B-T9.md` (m-1 to m-3, n-1 to n-5), `reviews/1B-T8.md` (m-2, m-3, n-1, n-2), `reviews/1B-T7.md` (m-2, n-1), `reviews/1B-T10.md` (m-1, m-2, n-2), `reviews/1B-T11.md` (m3, n6) and `reviews/1B-T6-confirm.md` (n-2), all under `/Users/kunanonjarat/Developer/jotbun/.claude/controller/`.
3. `briefs/fix-download-aborts.md`, "Every item of the followups entry, and its home": the table that splits the entry between the two briefs.

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/download-pins` (branch `fix/download-pins`, made by the orchestrator from `origin/claude/p1a-vault-core`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/download-pins`, your scratch folder. Create it with `mkdir -p`. Logs and backups go only there.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/download-pins-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the verified final copy of the 5 test files (paths relative to `apps/edge`);
  - `orig/`: the same 5 files as the base has them (`ecc00b7`);
  - `diffs/`: one unified diff per file (`orig` to `real`);
  - no `stubs/`: nothing is stubbed, because no code changes; the RED is the reviewers' surviving mutants, applied by `mutants.py --red` (P1);
  - `mutants.py` (the mutant runner, with `--check` and `--red`), `run-focused.sh` and `run-mutants.sh` (each takes the heavy lock itself);
  - `SHA256SUMS` (Appendix B) covering all of the above, plus the planner's `proof/red.out` and `proof/mutants.out`;
  - the planner's logs in `proof/` and `logs/`, with their own `SHA256SUMS.logs`. `*.log` files are gitignored, so they may be missing on another machine: never check `SHA256SUMS.logs` as a gate, only `SHA256SUMS`.
  - If PL is missing or a line of `PL/SHA256SUMS` does not answer `OK`, stop: BLOCKED.
- Every shell call starts in a fresh directory, so type full paths. Git: `/usr/bin/git -C <WT> <command>`, one git command per call. The shell is zsh: keep an exit code in `rc` (`cmd; rc=$?`), never `status`.
- **The heavy lock** wraps every workers run and every mutant run: the two PL scripts take it and release it themselves (`until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done` before, `rmdir /private/tmp/claude-501/jotbun-heavy.lock` after, after a failure too); never wrap them in a second lock, and never remove a lock you did not take.
- **FOCUSED** (under the lock, through the script): `PL/run-focused.sh WT/apps/edge <log> test/workers/exports.test.ts test/workers/attachments.test.ts test/workers/snapshots.test.ts test/workers/imports-review.test.ts test/workers/ai.test.ts`: the five files this task edits.
- **R100: do not run `npm run test:edge:workers`.** CI runs the whole workers suite; record it as "CI". Docker is stopped: `npm run test:edge:db` is **SKIPPED**.
- **Load.** FOCUSED took about 10 seconds here, `--red` about 23 and the twenty mutants about 2.5 minutes. Under `--red` and V4 the CP-1 case fails by its 15-second timeout, by design (its mutant removes the deadline it pins). If a run fails on any other timeout, rerun it once and record both runs; a second failure is BLOCKED with the output.
- If a result differs from an "Expected" line, stop and report BLOCKED with the output. Do not change tests or code to make them pass unless a step says so.

## Readiness (the planner checked it)

- Every host file and every guard the pins target is on the head as merged (1B-T6 `de738f9`, 1B-T9 `5b7609e`, 1B-T10 `2ffd195`, 1B-T8 `1c14dd1`, 1B-T7 `365ec2e`, 1B-T11 `c8929f2`); `mutants.py --check` finds each mutated text exactly once. At the brief's writing the head is `d1111f8`, which adds only `apps/app` (#391) and `.claude/` changes to `ecc00b7`: the edge, the API and the packages are unchanged.
- No package, no lockfile change, no Cloudflare resource, no owner decision.
- **fix-download-aborts shares no file with this task** (it edits `src/v1/files/*.ts`, `src/v1/handler.ts` and adds `test/workers/download-aborts.test.ts`). The planner applied both and ran 12 workers files together: 392 passed and 1 todo, and each task's `mutants.py --check` passes on the combined tree. Either may merge first.
- Clear of the parallel work: alarm-hardening edits `files-alarm.test.ts` (not touched here), the 1B-T12 planner works in `apps/edge/test/support/` (not touched here), the app lane is `apps/app`.

## Scope

| File (under `apps/edge`) | Change | Items |
| --- | --- | --- |
| `test/workers/exports.test.ts` | The HEAD case counts bytes per download body (one counter per `get`), as the chunk HEAD case does. No new case. | 1B-T6 confirming review n-2 |
| `test/workers/attachments.test.ts` | The header's counts; the receipt HEAD case counts bytes per download body (renamed `... reads its image to the end ...`); at the end, `preparesSeen` and three `describe` blocks with 9 cases. | 1B-T9 review m-1 (AC-1 to AC-3), m-2 (HD-1), m-3 (DU-1, DU-2), n-1 (CP-1), n-2 (AC-5), n-3 (CP-2), n-4 (RB-2), n-5 (the header) |
| `test/workers/snapshots.test.ts` | `watchedSql` hands each row out as a revocable proxy; `TOMBSTONE_MS` joins one import; at the end, one `describe` block with 5 cases. | 1B-T8 review m-2, m-3, n-1 (probe E), n-2 (probe C2); 1B-T11 review m3, n6 |
| `test/workers/imports-review.test.ts` | Two comments; at the end, one `describe` block with 2 cases. | 1B-T10 review m-1 (probe R57), m-2 (probe U1), n-2 |
| `test/workers/ai.test.ts` | Two type imports; at the end, `recordingVault`, `MALFORMED`, `sendAs`, `routesOf` and one `describe` block with 3 cases. | 1B-T7 review m-2 (W7), n-1 (W5) |
| `docs/implementation/receipts/download-pins.md` | **new.** Your receipt (R87). | |

Not in this task: any source file (the code is right; that is what the reviews found); `test/workers/support/` and `test/support/` (each new helper lives in the file that uses it); the R97 fix and its proof (fix-download-aborts); the items the home table gives elsewhere (1B-T10's n-3 `pruneImports` cap, ruled by 1B-T11's P14; 1B-T9's n-6, which needs no change; 1B-T9's n-5 labels inside the merged `receipts/1B-T9.md`, which are the controller's housekeeping).

**Size: L, test-only** (five files, 19 new cases and four in-place edits, 20 mutants). One commit.

## The new and changed cases (as `real/` has them)

`exports.test.ts`
- `a HEAD on a download answers its headers, reads its file to the end and gives its slot back` (changed: `reads[i]`, a counter per download body).

`attachments.test.ts`
- `a HEAD on a receipt download answers its headers, reads its image to the end and gives its slot back (ruling R96)` (changed and renamed from `... answers its headers and gives its slot back (ruling R96)`: a counter per download body, 3 HEADs on a 256 KiB receipt).
- Block `the 1B-T9 review: prepare checks the session, the policy and the account before it reserves or copies (m-1)`: `a signed-out session is refused at the prepare step, and nothing is reserved or copied`; `a session without the current terms is refused at the prepare step of a retain and a replace, and at a removal, and nothing is reserved or copied`; `a deleting account refuses retain, replace, remove, the grant and the download without reserving or copying, and the release step still runs`.
- Block `the 1B-T9 review: attachmentsDueAt keeps both of its guards (m-3, R37)`: `a stamped release whose object is still live is not due yet; once the object is gone, the row is due 30 days after its release`; `a retained receipt that nothing holds makes attachmentsDueAt now, so the safety net is scheduled`.
- Block `the 1B-T9 review: the copy path (n-1 to n-4)`: `a request waiting on another copy of the same image gives up at copyDeadlineMs with 503`; `an unknown body field is refused before anything is reserved or copied, as the API controller reads the body`; `the image of a preview that is no longer ready is not copied, though its image is still published`; `a second request for an image whose copy is held only waits, until the first attaches the receipt both then hold`.

`snapshots.test.ts` (block `the 1B-T8 and 1B-T11 reviews' pins (brief download-pins)`)
- `a build of a snapshot that is no longer pending reads nothing and stores nothing`; `a chunk whose stored bytes no longer match its digest, at the same length, fails as it streams, and gives its slot back`; `a snapshot read exactly at the purge revision, with nothing after the purge, is recorded, served and reused`; `a ready snapshot that is not stale is due only a week past its expiry, and an alarm with one leaves nothing due now`; `pruneSnapshots leaves a stale snapshot's tombstones their own day: keys deleted at its expiry are not made due again at once`.

`imports-review.test.ts` (block `the 1B-T10 review's pins (brief download-pins)`)
- `a correction of 500 rows at once, the most a correction takes, binds its row ids as one parameter and is saved`; `an upload that was never accepted (still receiving, or refused at intake) has no preview: 404, as the API answers`.

`ai.test.ts` (block `the 1B-T7 review's pins: what each AI route checks, and in what order`)
- `a signed-out session with a malformed body gets 422, with no vault call and no model call; a well-formed body is 401 at its first step`; `a signed-in person without consent who sends a malformed body gets 422, as the PostgreSQL route parsed before AiService checked consent, with no vault call`; `a session signed out between the context step and the use is refused at the use: 401, no model call and no use spent`.

## Planner rulings (the calls this brief makes, with the reason for each)

- **P1. RED is the reviewers' surviving mutants, applied at once; there are no stubs.** No code changes, so there is nothing to stub. Each pin's guard already exists, and each review proved its mutant survives the committed cases. `mutants.py --red` applies the 17 survivors together (V1 to V6 and V10 to V20, across 9 source files), runs the five files, and restores every file byte for byte. Exactly 20 cases must fail: the 18 new pins it targets, plus the two existing cases that 1B-T8's spy now arms (V10). Nothing else may fail. V7 to V9 are killed by existing cases as well, so they are left out of `--red` and checked alone (P5).
- **P2. Each probe is taken as written where it still applies, adapted to its host file's helpers.** The adaptations: the attachments probes use the file's `setup`, `retain`, `replace`, `remove`, `grantOf`, `stepCall`, `receiptRows`, `withLimits`, `prune` and `sweep` (AC-2 builds its own client for the pending policy and restores the file's config after); RB-2 records prepare replies through `preparesSeen`, the review's `observedVault` written as a forwarding proxy; the AI probes keep `recordingVault` unchanged and rename the probe's `send` helper to `sendAs`, since `send` already names the model call throughout the file (`startV1`'s `send` option, `model.send`); the snapshot probes use the file's `diary`, `deletedLunch`, `age`, `readySnapshot`, `drain`, `headOf` and `revisionOf`. Each case names its review and probe label in a comment. The probes' labels are not in the case names.
- **P3. 1B-T8's m-2 is the spy itself; no new case.** `watchedSql` now yields each entity row as a revocable proxy and revokes it once the next row is read, as the review's `streamingOnlySql` does. The two cases that use it, `reads every row before the first R2 call` and the ten-times case, now fail under X1 (V10: reading the rows with a spread). The real read turns each row into its line before it reads the next, so both still pass.
- **P4. The two HEAD cases count bytes per download body.** n-2 (1B-T6) and HD-1 (1B-T9 m-2) both ask for a counter per HEAD. A shared counter lets a read still running after one HEAD count for the next. The changed cases mirror the chunk HEAD case (`reads.push(0) - 1` per `get`). Under V9 (`headOf` answers before its read ends) every entry of the export case now reads 0, not only the first (`PL/proof/mutant-logs/V9.log`). V8 (`headOf` cancels instead of reading, R96's first wording) fails the receipt case, which no case caught before.
- **P5. Three mutants are checked alone only.** V7 (1B-T9's M38: a copy in flight answered 503 at once) is also killed by the existing `two records retaining one image at once ...`. RB-2 kills it without that case's 250 ms sleep (n-4). V8 and V9 are also killed by the export and chunk HEAD cases.
- **P6. 1B-T11's n6 had no probe: the planner wrote it.** A ready snapshot's keys are deleted at its expiry and kept a day as tombstones (`deleteDueObjects` at `expires_at`; delete_after `expires + TOMBSTONE_MS`). A purge then makes the snapshot stale inside that day (`age` and `runDue`, as the existing prune case does). `pruneSnapshots` an hour later drops its chunk rows but leaves the tombstones their own deadline. Under V15 (no `status <> 'tombstone'`) their deadline becomes 0.
- **P7. 1B-T11's m3 takes the reviewer's ready pin as a new case,** not the one-line alternative inside the existing R37 case at `snapshots.test.ts:748`. The case 1B-T11 wrote stays as it is, and the new case states its own reason. It sets the vault clock a day ahead and restores it in `finally`.
- **P8. R57 on corrections is pinned at both of its checks.** The 500-row correction (the patch maximum) kills V16 (one `?` per row id at the known-row check, the review's U9) and V17 (the same at the committed-row check); either would answer 500 for a correction of more than 100 rows. Its 60-second timeout covers seeding 600 rows.
- **P9. New cases go at the end of each file, in their own blocks.** No existing line moves except the five in-place edits: the export HEAD case, the receipt HEAD case, the attachments header, `watchedSql`, and the two comments in `imports-review.test.ts`. This keeps a merge with other tasks' additions simple.
- **P10. Every item of the entry has a home.** The table is in `briefs/fix-download-aborts.md`. Three of them are not code in either brief: 1B-T10's n-3 was ruled by 1B-T11's P14 (the cap is unreachable and could not be pinned), 1B-T9's n-6 needs no change, and 1B-T9's n-5 labels live in a merged receipt.
- **P11. No case here calls `settle()` or holds a download unread at its end,** so none waits on fix-download-aborts' slot promises when the two meet. The planner's combined run is the evidence.

---

## Step 0: Sync, install, and check the base

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date." or a clean merge.
2. `/usr/bin/git -C WT rev-parse --short HEAD`. Record it.
3. Install what is missing: `test -d WT/node_modules || (cd WT && npm ci --ignore-scripts --no-audit --no-fund)`, then `test -d WT/apps/edge/node_modules || (cd WT && npm run install:edge)`.
4. `mkdir -p S`. `cd PL && shasum -a 256 -c SHA256SUMS`. Expected: 20 lines, every line `OK`. Any other answer: BLOCKED.
5. Base checksums of the 5 files: `cd WT/apps/edge && shasum -a 256 test/workers/exports.test.ts test/workers/attachments.test.ts test/workers/snapshots.test.ts test/workers/imports-review.test.ts test/workers/ai.test.ts`. Compare each with its `orig/` line in Appendix B.
   - A file whose checksum matches: Step 1 copies `PL/real/<file>` over it.
   - A file whose checksum differs (another task merged first): apply its hunks from `PL/diffs/test_workers_<name>.diff` with the Edit tool instead, one Edit per hunk (`old_string` is the hunk's context and `-` lines, `new_string` its context and `+` lines). Each must match exactly once; if one does not, stop: BLOCKED, with `/usr/bin/git -C WT log --oneline -3 -- apps/edge/<file>` and the hunk that failed. A hunk that appends a block at the end of a file goes after whatever the file now ends with.

## Step 1: The test files

1. `cp PL/real/test/workers/<name>.test.ts WT/apps/edge/test/workers/<name>.test.ts` for `exports`, `attachments`, `snapshots`, `imports-review` and `ai` (or the Edits of Step 0.5).
2. `cd WT && npm run typecheck:edge`. Expected: exit 0.
3. `python3 -I PL/mutants.py --check WT/apps/edge`. Expected: `20 mutants, 242 cases in the five files; old text found exactly once and every required case exists: True` (the case count differs only if another task added cases to these files).

## Step 2: RED

`PL/run-mutants.sh WT/apps/edge S red.out --red` (it takes the lock). Expected: it prints `rc=0`, and `S/red.out` reads `RED with V1, V2, V3, V4, V5, V6, V10, V11, V12, V13, V14, V15, V16, V17, V18, V19, V20 [workers 20 failed | 222 passed (242)] restored=True`, `failed 20, expected 20`, then 20 `failed as expected:` lines, and no `EXPECTED TO FAIL BUT PASSED` or `FAILED BUT NOT EXPECTED` line. Then `/usr/bin/git -C WT status --short`: only the five test files (every source file is back).

## Step 3: GREEN

FOCUSED, saving to `S/green.log`: `PL/run-focused.sh WT/apps/edge S/green.log test/workers/exports.test.ts test/workers/attachments.test.ts test/workers/snapshots.test.ts test/workers/imports-review.test.ts test/workers/ai.test.ts`. Expected: `rc=0`, `Test Files  5 passed (5)` and no failed case (the planner's: `Tests  242 passed (242)`). Then `cd WT/apps/edge && shasum -a 256 test/workers/exports.test.ts test/workers/attachments.test.ts test/workers/snapshots.test.ts test/workers/imports-review.test.ts test/workers/ai.test.ts > S/green-sums.txt`; each line must equal its `real/` line in Appendix B (a file you edited from its diff may differ only in another task's lines).

## Step 4: Mutation check, one mutant at a time

`PL/run-mutants.sh WT/apps/edge S mutants.out` (it takes the lock). Each mutant is applied alone, the files of its pins run, the file is restored and compared. Expected: `rc=0`, and in `S/mutants.out` twenty lines `V<n> KILLED ... restored=True` with no `REQUIRED BUT PASSED` line. The planner's run took about 2.5 minutes; V4 waits out CP-1's 15-second timeout. Then `cd WT/apps/edge && shasum -a 256 -c S/green-sums.txt` (all `OK`) and `/usr/bin/git -C WT status --short` (only the five test files).

| Mutant | File (under `src`) | Change (the review's label) | Must fail |
| --- | --- | --- | --- |
| V1 | `v1/routes.ts` | `attachments.prepare` runs with `anySession` (1B-T9 X1) | AC-1, AC-2, AC-3 |
| V2 | `vault/files/attachments.ts` | `attachmentsDueAt` counts a release whose object is still live (X4) | DU-1 |
| V3 | `vault/files/attachments.ts` | `attachmentsDueAt` ignores a retained receipt nothing holds (X5) | DU-2 |
| V4 | `v1/files/receipts.ts` | a waiting request polls with no deadline (X2) | CP-1 |
| V5 | `v1/files/receipts.ts` | unknown body fields are not refused (X3) | AC-5 |
| V6 | `vault/files/attachments.ts` | prepare copies the image of a preview that is no longer ready (X6) | CP-2 |
| V7 | `v1/files/receipts.ts` | a copy in flight is answered 503 at once (the 1B-T9 planner's M38) | RB-2 and `two records retaining one image at once ...` |
| V8 | `v1/handler.ts` | `headOf` cancels the body it drops (R96's first wording, X7) | the receipt, export and chunk HEAD cases |
| V9 | `v1/handler.ts` | `headOf` answers before its read of the body ends (1B-T6 F5) | the export, receipt and chunk HEAD cases |
| V10 | `vault/files/snapshots.ts` | the entity read collects every row by spread (1B-T8 X1) | `reads every row before the first R2 call`, the ten-times case |
| V11 | `vault/files/snapshots.ts` | the read does not check that the snapshot is still pending (X6) | the not-pending case |
| V12 | `v1/files/downloads.ts` | the chunk download streams without `verifiedChunks` (X2) | probe E |
| V13 | `vault/files/snapshots.ts` | reuse is strict at the purge watermark (X3) | probe C2 |
| V14 | `vault/files/snapshots.ts` | `snapshotsDueAt`'s stale term counts every chunk row (1B-T11 R1) | the ready-due case |
| V15 | `vault/files/snapshots.ts` | `pruneSnapshots` makes a stale snapshot's tombstones due too (R2) | the tombstone case |
| V16 | `vault/files/confirmation.ts` | the correction's known-row check binds one `?` per id (1B-T10 U9) | R57 |
| V17 | `vault/files/confirmation.ts` | the correction's committed-row check binds one `?` per id | R57 |
| V18 | `vault/files/previews.ts` | the preview reads an upload that was never accepted (U1) | U1 |
| V19 | `v1/routes.ts` | `ai.consume` runs with `anySession` (1B-T7 W7) | the consume case |
| V20 | `v1/ai/routes.ts` | Ask Bun makes its first step before it reads its input (W5) | both P2 cases |

If fix-download-aborts merged first, its `downloads.ts`, `receipts.ts` and `handler.ts` are on your base; every mutant text above is unchanged by it (`--check` in Step 1.3 proves it).

## Step 5: The gate (R100's fast local gate)

From `WT`, in order, saving each output under `S/`:
1. `npm run typecheck:edge`. Expected: exit 0.
2. FOCUSED once more after the mutants, saving to `S/gate-focused.log`. Expected: as in Step 3.
3. `npm run test:edge`. Expected: exit 0 and no failed test (no Node file changes; record the counts it prints).
4. `npm run build:edge`. Expected: exit 0, and every driver marker counts 0 in the vault bundle (R95): `for m in pg-protocol pg-pool pg-types drizzle-orm/node-postgres 'from "pg"'; do printf '%s %s\n' "$m" "$(grep -c -- "$m" WT/apps/edge/dist/jotbun_vault/index.js)"; done`. No source changed, so the bundle is the base's.
5. `npm run test:edge:workers`: **CI** (R100). `npm run test:edge:db`: **SKIPPED** (Docker stopped; CI's edge job runs it). This task's deltas for the controller's CI check: `test:edge` +0; `test:edge:workers` +0 files and +19 passed (attachments +9, snapshots +5, ai +3, imports-review +2); `test:edge:db` +0.
6. `/usr/bin/git -C WT diff --check` before the commit and `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD` after it. Expected: no output.

## Step 6: Receipt and commit

1. Write `WT/docs/implementation/receipts/download-pins.md` from Appendix A, with your own numbers. Do not edit `premium-progress.md`.
2. `/usr/bin/git -C WT add apps/edge/test/workers docs/implementation/receipts/download-pins.md`, then `/usr/bin/git -C WT status --short`: the five test files and the receipt, nothing else.
3. Commit, one command, with this message:
   ```
   Pin the checks the 1B-T6 to 1B-T11 reviews found untested

   The reviews of the vault's files work left ready probes for checks no case
   pinned: prepare's session and policy check, attachmentsDueAt's guards, the
   copy path, R57 on corrections, the preview's accepted-upload guard, the
   snapshot read and prune guards, the AI routes' step order, and a byte
   counter per HEAD. Each is a case now, and each review's surviving mutant
   fails it. No source changes.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```

## Your final message

As the protocol says: `STATUS: DONE` (or `STATUS: BLOCKED` with the blocker) on the first line; the commit SHA and branch; the files changed; the RED line of `S/red.out` (`failed 20, expected 20`); the GREEN counts; the mutants (20 killed, survivors); each gate command with its result, `test:edge:workers` as CI; SKIPPED items; deviations (any file you edited from its diff), and what the reviewer should look at first (P1 the `--red` set, P2 the adaptations, P6 the planner's tombstone case, P4 the per-body counters).

---

## Appendix A: the receipt template

```markdown
# download-pins: Pin the checks the 1B-T6 to 1B-T11 reviews found untested

- **Status:** built and verified locally on `fix/download-pins`, from `[base SHA]`. Not pushed. Under ruling R87 this receipt is its own file; `premium-progress.md` is not edited. Under ruling R100 the whole workers suite is CI's. The independent review is the controller's, after this receipt. Test-only: no source file changes.
- **Files:** `test/workers/exports.test.ts` (the HEAD case counts per download body), `attachments.test.ts` (the header, the receipt HEAD case per body, 9 cases), `snapshots.test.ts` (`watchedSql`'s revocable rows, 5 cases), `imports-review.test.ts` (2 comments, 2 cases), `ai.test.ts` (3 cases) [say which, if any, took their diff's hunks].
- **The items and their cases:** [one line per review item: the review, its label, the case name].
- **RED** (`mutants.py --red`, the 17 surviving mutants at once): `[20 failed | 222 passed (242)]`, exactly the expected 20 (the 18 new pins and the two cases the 1B-T8 spy arms), every source file restored.
- **GREEN** (the five files, under the heavy lock): `[counts]`.
- **Mutation check:** `[20]` mutants, `[20]` killed one at a time ([one line per mutant]). Every file restored byte for byte.
- **Gate:** `typecheck:edge` [result]; FOCUSED [counts]; `test:edge` [counts]; `build:edge` [result; driver markers 0]; `test:edge:workers` **CI**; `test:edge:db` **SKIPPED** (Docker stopped); `git diff --check` clean.
- **Deviations and calls:** the brief's P1 to P11, one line each.
- **Notes for later tasks:** 1B-T12 and 1B-T13 can take the remaining review probes that passed (1B-T9's RB-1, RB-3, RB-4, AC-4, CP-3, ID-1; 1B-T10's S-a, S-b, P4, P2, C, R37, T) as regression cases if they want them; none is required.
```

## Appendix B: the planner's files and their checksums

`PL/SHA256SUMS` (paths relative to PL) covers `real/` (5), `orig/` (5, at `ecc00b7`), `diffs/` (5), `mutants.py`, the two scripts, and the planner's `proof/red.out` and `proof/mutants.out`. Check it with `cd PL && shasum -a 256 -c SHA256SUMS` (Step 0.4). The planner's logs have their own `PL/SHA256SUMS.logs`, never a gate. The folder also holds the planner's working copies `tree/` (the base with these files) and `combined/` (with fix-download-aborts' files too); the checksums do not cover them.

```
bdd0272916be30f7282fa28470c677d32dc506447ebcc33cc2cc22faf8dd0445  diffs/test_workers_ai.test.ts.diff
1299bf70db60875c049c24db95742c65e2d9090ae38751ec00b9b9762e51df29  diffs/test_workers_attachments.test.ts.diff
2b79435baa22abf47f52b5b7711957c4d99ec384ed8f344469d1b8b55afcb96f  diffs/test_workers_exports.test.ts.diff
8fa1a8b717b2f021f6e5891707e412ed17fd222b47ecc7aabcf9f311755fb5f6  diffs/test_workers_imports-review.test.ts.diff
4d5d8a1338e19a2c67c8402334b1620f12d013a61c1e8b4a516d04be662806bd  diffs/test_workers_snapshots.test.ts.diff
295b4bddccd94311b2233b2003a8d1d6f0eba6f1c52e7208b555715bcb51bc34  mutants.py
90f711979ae9f8e01783a4e69f3a0b2c065a5f5e046c6696b48c42fc4c38b34a  orig/test/workers/ai.test.ts
f6dc7cebcc8466fac11ca99c593350bab72a1c8457c45cfc6ee109e4a05a96ee  orig/test/workers/attachments.test.ts
aa63244bf21bbc6c1600a4745a87a0b0d8f9bd503f17437be3475fcd5fd00ef8  orig/test/workers/exports.test.ts
77bc2144ace8300e1e119ec77193bdc2046c038645f06b2b5b9030ed18658845  orig/test/workers/imports-review.test.ts
ef04fb446e265e5091721cca702bbe5229da95d3c58ef6a83110fd2a4098676c  orig/test/workers/snapshots.test.ts
34ad4f8adb957af0d4906e55c1af32e40e0bf4ffc2cc51789eb2cf111c4fc844  proof/mutants.out
1eb5e815199fb8473c236da0b334554fd48ac3e5563f397b1f98a04da3a97932  proof/red.out
67aa41bd862dbaab0d0d2381f1f3d0b5b03597e2319e597eda183c600552b808  real/test/workers/ai.test.ts
48571326cf007ff863b9a71d5762313147397fc37b604c6ff85e74ec2aafc067  real/test/workers/attachments.test.ts
785b597c097344ccc2117ae6421a637adb9d35a37051779c64eb74c2799d74b3  real/test/workers/exports.test.ts
e7365fad9894cc6d4863e34bc64da766a386b4750cc7dfdf38b9d946f251cfb3  real/test/workers/imports-review.test.ts
bcb2ba67ad2ca65a9184a661243ed45974f873d10d8598e8eb11f202c87482f4  real/test/workers/snapshots.test.ts
7fb6fb4104f8679d98ef51e96586fff281d23f998e7fb5c25534f807d5607518  run-focused.sh
04d54c8b09f78ca276eb6aceabcb319a13371b5d2caca1f9552625a5044100ee  run-mutants.sh
```

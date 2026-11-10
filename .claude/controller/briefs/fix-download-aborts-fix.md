# Brief fix-download-aborts fix round: pin the copy's later attempts, a turned-away upload and each download's catch path (review m1, n2 to n4)

You are the fixer (Haiku) for fix-download-aborts' fix round. PR #396 (branch `fix/download-aborts`, commit `d0cc479`) adds `untilReturned` and its wiring test. Its two-lens Opus review approved it, with one minor and three nits that the controller folds into the same PR, because CI cannot run before billing is fixed. All four are **test-only**: the code is right, and three paths it handles have no pin. You replace one test file, `apps/edge/test/workers/download-aborts.test.ts`, with the planner's version, prove it with the review's mutants and the planner's own, run the fast gate, add a section to the receipt, and commit. No source file changes. The planner wrote the file and proved it on `d0cc479` in a scratch copy: RED (each of the five RED mutants fails exactly its own case), GREEN (7 of 7), 14 of 14 mutants killed, and the fast gate (R100).

**The four findings** (`reviews/fix-download-aborts.md`):
- **m1:** no case covers `prepare`'s copy attempts after a `wait` (`receipts.ts:110-121`). The review's mutant R14 wraps only the first attempt and survives. Probe PB becomes a case.
- **n2:** no case checks that an upload turned away at the isolate's limit (503) hands nothing over. R11 survives. Probe PA becomes a case.
- **n3:** no case checks that a download refused after it took its slot (the `catch` path) ends its promise. R13 survives. Probe PC becomes a line in each download case (P1).
- **n4:** when a slot leaks, each slot case fails on the test's own `take()` (`download-aborts.test.ts:162` and `:289`), not on its lines. The case now takes its slots inside the `try` and records how many it got as a line (P4).

Not in this round (the controller's ruling): n1 (a hosted check), n5 and n6 (1B-T13), n7 (the controller's housekeeping).

Read first: the protocol `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md` (binding; R100; R87: your receipt is the task's own `docs/implementation/receipts/fix-download-aborts.md`, which exists, and you do not edit `premium-progress.md`), then the review `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/fix-download-aborts.md` (m1 and n2 to n4).

## Paths

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-download-aborts` (branch `fix/download-aborts`, head `d0cc479`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-download-aborts-fix`. Create it with `mkdir -p`. Logs go there.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-download-aborts-fix-planner`, the planner's kit. Read and `cp` from it; never write into it. It holds `real/test/workers/download-aborts.test.ts` (the file you install), `orig/` (the same file at `d0cc479`), `diffs/test_workers_download-aborts.test.ts.diff`, `mutants.py` (with `--check` and `--red`), `run-focused.sh` and `run-mutants.sh` (each takes the heavy lock itself), and `SHA256SUMS` (Appendix B), plus the planner's logs with their own `SHA256SUMS.logs` (never a gate).
- Git: `/usr/bin/git -C WT <command>`, one git command per call. Type full paths in every call. The shell is zsh: keep an exit code in `rc` (`cmd; rc=$?`), never `status`.
- **The heavy lock** wraps every workers run, every mutant run **and `npm run test:edge`** (it starts Miniflare): `until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done` before, `rmdir /private/tmp/claude-501/jotbun-heavy.lock` after, after a failure too. The two PL scripts take and release it themselves; never wrap them in a second lock. Never remove a lock you did not take.
- **FOCUSED** = `PL/run-focused.sh WT/apps/edge <log> test/workers/download-aborts.test.ts` (it takes the lock).
- **R100:** do not run `npm run test:edge:workers`; it is CI's. Docker is stopped and stays stopped: `test:edge:db` is SKIPPED. No `wrangler dev` rerun: no source changes.
- **Load.** FOCUSED took about 6 seconds here, the RED run about 40 seconds and the 14 mutants about 3 minutes (A6 and R11 wait out 5-second checks). If a run fails on a timeout, rerun it once and record both runs; a second failure is BLOCKED with the output.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass.

## Planner rulings (the calls this brief makes, with the reason for each)

- **P1. PC is a line in each download case, not one export case.** n3 names all three `catch` paths (`downloads.ts:70-72`, `:105-106` and `:139-141`), but the probe only checks the export's. `heldBodies` gains `lose(gone)`. While an object is lost, its key reads as gone, so the download is refused with 404 after it took its slot. `pinnedDownload` makes that GET after its extra GETs and records `['GET refused after it took its slot (its object is gone)', 404, true]`. It kills R13 (the export's `catch`, the review's mutant) and also R13b and R13c (the same mutant at the chunk and the receipt). The three download cases' names now end "... answered to a HEAD or refused after it took its slot" (P5).
- **P2. PB as written, made deterministic.** The probe gives request B 250 ms to be told `wait` before A's copy fails. If B asked only after that, B's first attempt would copy, R14 would survive, and the case would still pass. So B's client records every prepare reply through `preparesSeen`, a forwarding proxy over `VAULT` (download-pins' `attachments.test.ts` uses the same helper), and the case waits until B has been told `wait`. It records that as a line. `reachedFirst` races each gate against its request's answer, so a request refused before its copy (for example, every copy slot leaked, under A8) never leaves the case at a gate: the case fails on its lines, not on a 30-second timeout.
- **P3. PA as written,** with its seventeenth upload from a second client, so that client's `settle()` sees only that upload. Its lines say how many places were held, what the seventeenth answered, whether its client was handed anything, and how the sixteen ended: the held replies other than 202, which should be none, and `uploadsInFlight()` after. Under R11, the turned-away upload's promise never ends. Under A8, a place leaked by the earlier upload case turns one of the sixteen away, and the lines show it.
- **P4. n4: the case takes its own slots inside the `try`, as a line.** `takeUpTo(take, count, own)` takes up to `count` slots into `own` and answers how many it got; the case records `['slots the case takes for itself', n]` (`['copy slots the case takes for itself', 4]` in the retain case) and gives `own` back in its `finally`. A leaked slot now shows in the expected-lines diff, and slots taken before a failed take are always given back. **Before and after, under A8** (a slot never returned): on `d0cc479`'s file, 4 of the 5 cases throw `ProblemException SERVICE_UNAVAILABLE` from the test's own take at `:162` or `:289` (`PL/proof/before/mutant-logs/A8.log`). With this file, all 7 fail on an `AssertionError` that shows the leak. In the export case, for example, the extra GETs read 503 and the case takes 0 of its 4 slots (`PL/proof/mutant-logs/A8.log`).
- **P5. Two new cases, three renamed.** The file has 7 cases: the five, with the three download cases renamed (P1), and PB and PA at the end. For the controller's CI check, the PR's delta becomes `test:edge:workers` +1 file and +7 passed (this round adds 2); `test:edge` and `test:edge:db` stay +0.
- **P6. The 14 mutants and their cases.** The planner's A1 to A9 keep their texts; with the new cases, A4 also fails PB, A6 and A7 fail six cases, and A8 fails all seven. A turned-away upload hands nothing over, whatever the promise does, so PA passes under A6 and A7. The review's R11, R13 and R14, and R13b and R13c (P1), each fail exactly their own case. That set is the RED (Step 5).
- **P7. No `wrangler dev` rerun and no AFFECTED run.** No source changes (the controller's note), and the only file that changes is this test file.

## Step 1: Sync and install

1. `/usr/bin/git -C WT status --short` must print nothing, and `/usr/bin/git -C WT rev-parse --short HEAD` must print `d0cc479`.
2. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: a clean merge that brings only `.claude/` files (the head moved only in controller files since `d0cc479`'s base). Check it: `/usr/bin/git -C WT diff --name-only d0cc479 HEAD` lists only paths under `.claude/`. Anything else, or a conflict: BLOCKED. Record the merge commit's SHA.
3. Install what is missing: `test -d WT/node_modules || (cd WT && npm ci --ignore-scripts --no-audit --no-fund)`, then `test -d WT/apps/edge/node_modules || (cd WT && npm run install:edge)`.
4. `mkdir -p S`. `cd PL && shasum -a 256 -c SHA256SUMS`. Expected: 9 lines, every line `OK`. Any other answer: BLOCKED.

## Step 2: Install the test file

1. `shasum -a 256 WT/apps/edge/test/workers/download-aborts.test.ts`. Expected: `e43cb9abeb75614fbd0cf2a73c15c1e6296ccc57935ff5db74e26414c57c84c0`, the `orig/` line in Appendix B. Anything else: BLOCKED (no other task edits this file).
2. `cp PL/real/test/workers/download-aborts.test.ts WT/apps/edge/test/workers/download-aborts.test.ts`.
3. `/usr/bin/git -C WT status --short`: exactly ` M apps/edge/test/workers/download-aborts.test.ts`.

## Step 3: Typecheck and the mutant table

1. `cd WT && npm run typecheck:edge`. Expected: exit 0.
2. `python3 -I PL/mutants.py --check WT/apps/edge` (no lock needed). Expected: `14 mutants, 7 cases; old text found exactly once and every required case exists: True`.

## Step 4: GREEN

FOCUSED, saving to `S/green.log`. Expected: it prints `rc=0`; the log has `Test Files  1 passed (1)` and `Tests  7 passed (7)`. Then `shasum -a 256 WT/apps/edge/test/workers/download-aborts.test.ts > S/green-sums.txt`; it must equal the `real/` line in Appendix B.

## Step 5: RED (the review's mutants, each alone)

`PL/run-mutants.sh WT/apps/edge S red.out --red` (it takes the lock). It applies each of R11, R13, R13b, R13c and R14 alone to its source file, runs the test file, and restores the source byte for byte. Expected: it prints `rc=0`, and `S/red.out` has five lines `<label> RED as expected (...) [workers 1 failed | 6 passed (7)] assertion errors 1, other errors 0, restored=True`, each followed by exactly its own case:

| Mutant | File (under `apps/edge/src`) | Change | The one case that fails |
| --- | --- | --- | --- |
| R11 | `v1/files/uploads.ts` | the upload hands its promise over before the isolate's 503 check | `an upload turned away at the isolate's limit (503) hands waitUntil nothing` |
| R13 | `v1/files/downloads.ts` | the export download's `catch` gives back the slot without ending its promise | the export case |
| R13b | `v1/files/downloads.ts` | the snapshot chunk download's `catch`, the same | the snapshot chunk case |
| R13c | `v1/files/downloads.ts` | the receipt download's `catch`, the same | the receipt case |
| R14 | `v1/files/receipts.ts` | prepare's later attempts (after a `wait`) take their copy slot without `untilReturned` | `a retain that waited on another request's copy hands waitUntil a promise on its later attempt too, pending while that attempt copies` |

Then `/usr/bin/git -C WT status --short`: still only the test file (every source file is back).

## Step 6: Mutation check (all 14, each alone)

`PL/run-mutants.sh WT/apps/edge S mutants.out` (it takes the lock). Expected: `rc=0`, and in `S/mutants.out` fourteen lines `<label> KILLED ... restored=True` with no `REQUIRED BUT PASSED` line:

| Mutant | Must fail |
| --- | --- |
| A1, A2, A3 | the export, chunk and receipt case, in turn |
| A4 | the retain case and PB |
| A5 | the upload case |
| A6, A7 | every case but PA (six) |
| A8 | all seven, each on an `AssertionError` (P4) |
| A9 | the export case |
| R11, R13, R13b, R13c, R14 | as in Step 5 |

Then `shasum -a 256 -c S/green-sums.txt` (`OK`) and `/usr/bin/git -C WT status --short` (only the test file). Check n4 on A8's log: `grep -c '^AssertionError' S/mutant-logs/A8.log` prints `7` and `grep -c 'ProblemException' S/mutant-logs/A8.log` prints `0`.

## Step 7: The gate (R100's fast local gate)

From `WT`, in order, saving each output under `S/`:
1. `npm run typecheck:edge`. Expected: exit 0.
2. FOCUSED once more, saving to `S/gate-focused.log`. Expected: as in Step 4.
3. Under the heavy lock (it starts Miniflare): `until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done`, then `cd WT && npm run test:edge > S/gate-node.log 2>&1; rc=$?`, then `rmdir /private/tmp/claude-501/jotbun-heavy.lock`. Expected: `rc` 0 and no failed test (the planner's: 15 files, 176 tests; this round adds no Node case).
4. `npm run build:edge`. Expected: exit 0, and each driver marker counts 0 in the vault bundle (R95): `for m in pg-protocol pg-pool pg-types drizzle-orm/node-postgres 'from "pg"'; do printf '%s %s\n' "$m" "$(grep -c -- "$m" WT/apps/edge/dist/jotbun_vault/index.js)"; done`. No source changes, so the bundle is `d0cc479`'s.
5. `npm run test:edge:workers`: **CI** (R100). `npm run test:edge:db`: **SKIPPED** (Docker stopped; CI's edge job runs it).
6. `/usr/bin/git -C WT diff --check` before the commit, and `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD` after it. Expected: no output.

## Step 8: Receipt

In `WT/docs/implementation/receipts/fix-download-aborts.md` (keep its style; plain sentences, no emoji, no em-dash; do not touch `premium-progress.md`), keep every earlier line as it is and add at the end:

```markdown
## Fix round (review m1, n2 to n4): the copy's later attempts, a turned-away upload and each download's catch path

- **Status:** test-only, on `fix/download-aborts` after the merge `[merge SHA]` (controller files only), commit `[fix SHA]`. The review (`reviews/fix-download-aborts.md`) approved `d0cc479` with one minor and seven nits. The controller folded m1 and n2 to n4 into this PR, since CI cannot run before billing is fixed; n1 (a hosted check), n5 and n6 (1B-T13) and n7 (the controller's housekeeping) stay with their carriers.
- **Files:** `apps/edge/test/workers/download-aborts.test.ts` only, installed from the planner's kit (`PL/real/`, checksum as in the brief). No source file changes.
- **What changed:** [one line each: PB as a case (m1), made deterministic through `preparesSeen` and `reachedFirst`; PA as a case (n2); PC as a line in each download case, so all three `catch` paths are pinned, and the three download cases renamed (n3); `takeUpTo`, so each case takes its own slots inside the `try` and records the count as a line (n4)].
- **RED** (`mutants.py --red`, each mutant alone): R11, R13, R13b, R13c and R14 each `[1 failed | 6 passed (7)]`, exactly its own case, one `AssertionError`, source restored.
- **GREEN:** `[7 passed (7)]`.
- **Mutation check:** `[14]` of 14 killed ([one line each]). Under A8, all 7 cases fail on an `AssertionError` and none throws `ProblemException` (n4; on `d0cc479`'s file, 4 cases threw from the test's own take).
- **Gate:** `typecheck:edge` [result]; FOCUSED [counts]; `test:edge` under the heavy lock [counts]; `build:edge` [result; driver markers 0]; `test:edge:workers` **CI**; `test:edge:db` **SKIPPED** (Docker stopped); `git diff --check` clean. No `wrangler dev` rerun: no source changes.
- **CI delta for the PR, now:** `test:edge:workers` +1 file and +7 passed (this round adds 2); `test:edge` +0; `test:edge:db` +0.
```

## Step 9: Commit

`/usr/bin/git -C WT add apps/edge/test/workers/download-aborts.test.ts docs/implementation/receipts/fix-download-aborts.md`, then `/usr/bin/git -C WT status --short` (those two files only), then commit with a message file in S (`S/commit-msg.txt`):

```
Pin the copy's later attempts, a turned-away upload and each download's catch

The review of the slot fix found three paths the code handles but no test
pinned: a copy attempt after a wait, an upload turned away at the isolate's
limit, and a download refused after it took its slot. Each is a case or a
line now, and each review mutant fails it. Each case also takes its own
slots inside its try and records the count, so a leaked slot shows in the
case's lines. Test-only.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
```

`/usr/bin/git -C WT commit -F S/commit-msg.txt` (full path). Then `/usr/bin/git -C WT status --short` must print nothing. Do not push.

## Your final message

As the protocol says: `STATUS: DONE` or `STATUS: BLOCKED` first; the merge and fix commit SHAs; the files changed; GREEN (7 of 7); the RED lines (five, each exactly its case); the mutants (14 killed, survivors); the A8 check (7 `AssertionError`, 0 `ProblemException`); each gate command with its result; SKIPPED items; anything the reviewer should look at first (P1, PC as a line in each download case; P2, PB's `wait` observed rather than slept for; P4, the case's own slots as a line).

---

## Appendix A: the change, in brief

The whole change is `PL/diffs/test_workers_download-aborts.test.ts.diff` (`orig/` to `real/`, 192 lines added and 15 removed). In order:
- the header comment gains one paragraph on the fix round;
- imports: `MAX_UPLOADS_PER_ISOLATE`, and the types `VaultCall`, `UserVault` and `Reply`;
- `heldBodies` gains `lose(gone)`; the new `takeUpTo` follows it;
- `pinnedDownload` gains the refused-after-its-slot GET and takes its own slots through `takeUpTo` inside its `try`; `PINNED` gains the two lines;
- `reachedFirst` and `preparesSeen` follow `retain`;
- the export, chunk and receipt cases are renamed; the retain case takes its own copy slots through `takeUpTo` and expects the extra line;
- two new cases at the end of the `describe`: PB (`a retain that waited on another request's copy ...`) and PA (`an upload turned away at the isolate's limit (503) hands waitUntil nothing`).

## Appendix B: the planner's files and their checksums

`PL/SHA256SUMS` (paths relative to PL) covers `real/` (1), `orig/` (1, `d0cc479`'s file), `diffs/` (1), `mutants.py`, the two scripts, and the planner's `proof/red.out`, `proof/mutants.out` and `proof/before/mutants.out` (A8 on `d0cc479`'s file, through the first kit's runner). The logs (`proof/**/*.log`, `logs/`) have their own `SHA256SUMS.logs`, never a gate. `tree/` is the planner's working copy (`git archive d0cc479` with this file); the checksums do not cover it.

```
33d94b8cf93cc285b5f8be8647ac5e0ae5d740c0d22e8d4b9e3f4e7feda7973f  diffs/test_workers_download-aborts.test.ts.diff
6a387f966f3d7d4515f975d1974fbd1812e1b7e0ffe077995d8d26faa0a14323  mutants.py
e43cb9abeb75614fbd0cf2a73c15c1e6296ccc57935ff5db74e26414c57c84c0  orig/test/workers/download-aborts.test.ts
611d0fb447e937615c976d4f5548f251f55c578d82e96f40e8675e8b67af1668  proof/before/mutants.out
364457eb85a0fdac0c55750324d10fb1348db6df2fe7e3d83c928b58b26bbc47  proof/mutants.out
779f56ae3e5c17875f7c7a41658eb77e685a00a13cefdc6198f19a36ed57e5f5  proof/red.out
07dbb573bb57ce5fd3858816f3eb8939f730d4fab3e5d93d9f34d225e22c9db4  real/test/workers/download-aborts.test.ts
7fb6fb4104f8679d98ef51e96586fff281d23f998e7fb5c25534f807d5607518  run-focused.sh
04d54c8b09f78ca276eb6aceabcb319a13371b5d2caca1f9552625a5044100ee  run-mutants.sh
```

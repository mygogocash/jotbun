# Brief source-pins: Source preservation pins on the vault's write paths (P3-T2 follow-up)

You are the implementer for source-pins, the follow-up of P3-T2's two reviews (m1 of both reviews, and the first review's n1). The controller names your model when it dispatches you (Claude Haiku 5.5); use that name in the commit trailer (Step 8). The code is right today: a restore, and a receipt's retain, replace and remove, each bump a record's version with an `UPDATE` that never names `source`, so the source survives. But no case held it: the reviewers' mutants that clear it (R4, R5) survived P3-T2's own cases. You add two cases to `apps/edge/test/workers/transaction-source.test.ts`, and a transfer twin of the outbox's unknown-source check to `apps/app/src/storage/diaryRepository.test.ts` (n1; the reviewer's R9 survived too). **No source file changes.** The planner wrote every file below and proved it in a scratch copy of the head **`b1ca3bfb`** (code `ab350e48`, #457's merge): RED (the three surviving mutants applied at once fail exactly the three new pins, each on an `AssertionError`, and both typechecks pass on that tree), GREEN, 3 of 3 mutants killed one at a time, the fast local gate (R100), and a dry run of this brief's own commands on a second copy. Do exactly what this brief says.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. Its opening notes apply: **R100** (whole suites are CI's; the local gate is the "Fast local gate"), durable files live under `/Users/kunanonjarat/Developer/jotbun/.claude/controller/`, never `/private/tmp` (only the heavy lock is there), and **R87**: your receipt is its own file, `docs/implementation/receipts/source-pins.md`. You do not edit `docs/implementation/premium-progress.md`.
2. The task's notes: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/followups.md`, P3-T2's entry (lines 635 to 644). Line 637 (m1) is this task; line 642 (n1) is carried; lines 636, 643 and 644 are ruled in P8. The reviews they come from: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P3-T2.md` (m1, n1, and section 2, "Set once") and `reviews/P3-T2-second.md` (m1, and focus 2's table of every write to `transactions`).
3. The plan: `docs/superpowers/plans/2026-10-25-jotbun-p3-photos-bun-ai.md`, call H9 (line 30: `source` is set once, at create; a typed record with a receipt stays `typed`) and `### Task P3-T2` (lines 156 to 204); `docs/superpowers/plans/2026-10-25-jotbun-p4-slips-statements.md`, `### Task P4-T11` (lines 628 to 659: it writes `source: 'statement'` in the import confirmation) and P4-T7's Step 4 (line 528: `transaction-source.test.ts` must keep passing unchanged).
4. The receipts this builds on: `docs/implementation/receipts/P3-T2.md` (the file this task extends) and `docs/implementation/receipts/P4-T3.md` (its ruling P4 changed the file's upgrade case).

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/source-pins` (branch `fix/source-pins`, made by the orchestrator from `origin/claude/p1a-vault-core`). Work only here. If WT does not exist, stop: BLOCKED.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/source-pins`, your scratch folder. Create it with `mkdir -p`. Logs and runs go only there.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/source-pins-planner`, the planner's folder. Read it and run its scripts; never write into it. It holds:
  - `real/`: the two final test files, at their repo paths;
  - `orig/`: the same two files as the head has them; `diffs/`: one diff per file (`orig` to `real`, named `<path with / as _>.diff`, with repo paths and full blob ids), for reading; `applycheck.sh` rebuilds `real/` from `orig/` through them with whitespace errors fatal (`proof/applycheck.out`);
  - no `stubs/`: nothing changes in the code, so nothing is stubbed; RED is the reviewers' surviving mutants, applied by `mutants.py --red` (ruling P2);
  - `SHA256SUMS.base`: the six head files this task relies on (the two test files, the three files the mutants change, and `test/workers/support/files.ts`), with paths relative to WT;
  - scripts: `mutants.py` (`--check`, `--red`, each mutant alone, and the planner's `--steps`), `locked.sh` (runs one command under the heavy lock), `make-diffs.sh` and `make-sums.sh` (the planner's own);
  - `proof/`: the planner's `check.out`, `red.out`, `mutants.out`, `steps.out` (P5), `taken-probe.py` and `taken-probe.out` (P3), `applycheck.out`, the dry run of this brief (`dryrun.sh`, its transcript `dryrun.out` and its scratch folder `dryrun-s/`), and the logs;
  - `SHA256SUMS` (every file above but the logs) and `SHA256SUMS.logs` (the `.log` files, which the state commits leave out: never check it as a gate).
  - `PL/tree/` and `PL/dry/` are the planner's working copies (their `node_modules` deleted). Never run anything in them.
  - If PL is missing or a line of `PL/SHA256SUMS` does not answer `OK`, stop: BLOCKED.
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above: type them out. Git: `/usr/bin/git -C WT <command>`, one git command per call. The shell is zsh: keep an exit code in `rc` (`cmd; rc=$?`), never `status`; never name a variable `path`.
- **The heavy lock** wraps every run that starts workerd (`test/workers/*.test.ts`), the mutant runs included. `PL/locked.sh <log> <dir> <command...>` takes it, runs the command in `<dir>` with its output in `<log>` (give an absolute log path), and gives it back however the command ends; it prints `locked`, then `exit <n>; unlocked`. `PL/mutants.py` calls `locked.sh` itself for each workers run. Never take the lock around either. If you take it by hand: `until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done` before, `rmdir /private/tmp/claude-501/jotbun-heavy.lock` after, after a failure too. Never remove a lock you did not take.
- **R100: do not run whole suites locally** (`npm run test:edge:workers`, `npm run test:edge:db`, the full render suite, `export:web`, the iOS export, `test:db`, `test:ops`). CI runs them. Docker is stopped and stays stopped.
- **Load flakes:** the machine is shared. If a case in a file this task does not touch times out under load, rerun that file alone once and record both runs. The focused workers file runs in about 5 seconds; nothing in it waits on a timer.
- If a result differs from an "Expected" line, stop and report BLOCKED with the output. Do not change a test or a kit file to make it pass.

## Readiness (the planner checked it)

- **Starts after P3-T2 and P4-T3: both merged.** P3-T2 (#420) as `25ce2661`; P4-T3 (#452), which changed this file's upgrade case (its ruling P4), as `a16a44d8`. The head at planning is `b1ca3bfb`; since `ab350e48` (#457) only controller state has moved.
- **No package, no lockfile change, no Cloudflare resource, no secret, no owner decision, no account setting.**
- **The code is right today,** as the reviews' probes showed: every new case passes on the head's code (GREEN) and fails only under the reviewers' mutants (RED). No probe found a path that loses `source`, so there is no finding to report.
- **In flight** (the planner's check at `b1ca3bfb`): no task shares a file with this one.
  - P3-T13 (building) changes `AddTrayHost.tsx`, `entrySave.ts`, `quickAddModel.ts`, `draftReview.ts` and their tests. It runs `diaryRepository.test.ts` unchanged in its focused unit lists, and the twin adds no test, so its counts do not move.
  - P3-T9 (planning) edits the AI edge files. P4-T2 (planning) adds a D1 binding to `vitest.workers.config.ts`, which this task runs but does not edit. The P2-T26 fix round is `apps/app/src/wallet/records/*`.
  - None of them edits `transaction-source.test.ts`, `diaryRepository.test.ts`, `transactions.ts`, `attachments.ts`, `confirmation.ts` or `diaryRepository.ts`. Step 0 checks the six relied-on files by content.

## Scope

| File | Change | Shared? |
| --- | --- | --- |
| `apps/edge/test/workers/transaction-source.test.ts` | `RECEIPT_RETENTION_CONSENT` joins the contracts import (line 14); `import { seedImportImage } from './support/files'` (new line 18); at the end, a comment and one `describe` block with 2 cases. 219 lines before, 264 after. | P3-T2's file (P4-T3 edited it) |
| `apps/app/src/storage/diaryRepository.test.ts` | In the case `a pending entry may carry a source, and an unknown one is refused`, three new lines after the `camera` refusal (lines 131 to 133): a comment, and a transfer with `source: 'camera'`, refused the same way. No new test. 533 lines before, 536 after. | Shared (P3-T2's case) |
| `docs/implementation/receipts/source-pins.md` | New: your receipt (R87). | New |

Not in this task: any source file (the code is right; that is what the reviews found); `confirmation.ts` and any import case (ruling P3: the source an import confirmation writes is P4-T11's); `apps/app/src/analytics/events.ts` (n3) and `docs/implementation/receipts/P3-T2.md` (ruling P8); `test/workers/support/` (the cases use `seedImportImage` as it is); `premium-progress.md`.

**Size: S, test-only** (two test files: 2 new cases, and 3 lines in an existing case; 3 mutants). One commit.

## The new and changed cases (as `real/` has them)

`transaction-source.test.ts`, block `the write paths that never name the source keep it`:
- `a restore keeps the source, in the record and in the sync feed`: a `tell_bun` expense is deleted (`deleted`, version 2) and restored (`restored`, version 3); the record reads `deleted_at: null, version: 3, source: 'tell_bun'`, and the sync feed's three snapshots each carry `tell_bun`. (The first review's R4; m1 of both reviews.)
- `a receipt kept, replaced and removed leaves the source as it was: a typed record stays typed`: a `typed` expense and two seeded import images (`seedImportImage`); retain (`POST .../attachment`, If-Match 1), replace (`PUT`, 2) and remove (`DELETE`, 3) each answer 200, and the record read after each has version 2, 3 and 4, the receipt it holds (none after the remove) and `source: 'typed'`; the sync feed's four snapshots each carry `typed`. (The first review's R5; H9's "a typed record with a receipt stays `typed`".)

`diaryRepository.test.ts`, inside `a pending entry may carry a source, and an unknown one is refused`:
- `cameraMove`, the case's own `siri` transfer with a fresh id and `source: 'camera'`, is refused with `A pending entry is not a valid create: source.` (The first review's n1, which R9 survived.)

The new block, for reading only (copy files only from `PL/real/`):

```ts
// P3-T2's reviews (m1; brief source-pins): a restore (restoreTransaction) and a receipt's
// retain, replace and remove (attachments.ts, nextVersion) bump the version with an UPDATE
// that never names source. Each keeps the record's source (H9: set once, at create); these
// cases hold it. An import confirmation writes only new records, and the source it gives
// them is P4-T11's (statement).
describe('the write paths that never name the source keep it', () => {
  it('a restore keeps the source, in the record and in the sync feed', async () => {
    const s = await setup()
    const lunch = s.expense({ source: 'tell_bun' })
    expect((await client.as(s.user).post('/v1/transactions', lunch)).status).toBe(201)
    expect(await json(await client.as(s.user).del(`/v1/transactions/${String(lunch.id)}`, { ifMatch: 1 }))).toMatchObject({ outcome: 'deleted', version: 2 })
    expect(await json(await client.as(s.user).post(`/v1/transactions/${String(lunch.id)}/restore`, {}, { ifMatch: 2 }))).toMatchObject({ outcome: 'restored', version: 3 })
    expect(await record(s, lunch.id)).toMatchObject({ deleted_at: null, version: 3, source: 'tell_bun' })
    expect((await syncSnapshots(s, lunch.id)).map((snapshot) => [snapshot.version, snapshot.source])).toEqual([[1, 'tell_bun'], [2, 'tell_bun'], [3, 'tell_bun']])
  })

  it('a receipt kept, replaced and removed leaves the source as it was: a typed record stays typed', async () => {
    const s = await setup()
    const lunch = s.expense({ source: 'typed' })
    expect((await client.as(s.user).post('/v1/transactions', lunch)).status).toBe(201)
    const first = await seedImportImage(s.user)
    const second = await seedImportImage(s.user)
    const receipt = `/v1/transactions/${String(lunch.id)}/attachment`
    const steps: [string, () => Promise<Response>][] = [
      ['retain', () => client.as(s.user).post(receipt, { attachment_id: first.attachmentId, consent: RECEIPT_RETENTION_CONSENT }, { ifMatch: 1 })],
      ['replace', () => client.as(s.user).put(receipt, { attachment_id: second.attachmentId, consent: RECEIPT_RETENTION_CONSENT }, { ifMatch: 2 })],
      ['remove', () => client.as(s.user).del(receipt, { ifMatch: 3 })],
    ]
    // Each command's answer, then the record as read after it.
    const seen: unknown[][] = []
    for (const [step, send] of steps) {
      const status = (await send()).status
      const got = await record(s, lunch.id)
      seen.push([step, status, got.version, got.attachment_id ?? null, got.source])
    }
    expect(seen).toEqual([
      ['retain', 200, 2, first.attachmentId, 'typed'],
      ['replace', 200, 3, second.attachmentId, 'typed'],
      ['remove', 200, 4, null, 'typed'],
    ])
    expect((await syncSnapshots(s, lunch.id)).map((snapshot) => [snapshot.version, snapshot.source])).toEqual([[1, 'typed'], [2, 'typed'], [3, 'typed'], [4, 'typed']])
  })
})
```

The twin, for reading only:

```ts
  // A transfer's source is checked the same way (P3-T2's review, n1).
  const cameraMove = { ...siri, id: randomUUID(), source: 'camera' as never };
  await assert.rejects(store.savePending(cameraMove, outbox(cameraMove)), { name: 'TypeError', message: 'A pending entry is not a valid create: source.' });
```

## Planner rulings (the calls this brief makes, with the reason for each)

- **P1. Ready, test-only, and nothing to report as a finding.** Both "Starts after" tasks have merged (Readiness). The reviews' probes and this kit agree that no write path loses `source`: GREEN passes on the head's code with no source change, so there is no production fix to stop for.
- **P2. RED is the reviewers' surviving mutants, applied at once; there are no stubs.** No code changes, so there is nothing to stub (download-pins' P1 did the same). `mutants.py --red` applies the first review's R4 (the restore's `UPDATE` also sets `source = NULL`, `transactions.ts:334`), R5 (the receipt commands' shared version bump, `nextVersion`, also sets `source = NULL`, `attachments.ts:222`) and R9 (the outbox checks a draft's source only when it is not a transfer, `diaryRepository.ts:153`). It then runs `typecheck:edge` and `typecheck:app` on that tree (both pass, so RED fails on assertions, not types), runs the two focused files, and writes every file back byte for byte. Exactly the three new pins fail, each on an `AssertionError` (vitest's diff, and `node:test`'s `ERR_ASSERTION` "Missing expected rejection"); nothing else fails. One case and one mutant per path, as the controller asked.
- **P3. The import confirmation waits for P4-T11: this task has nothing to pin there.**
  - A confirmation never writes an existing record. `confirmIn` inserts each open row under its derived id and skips any id already used (`taken`, `confirmation.ts:466-468`, the rule 1B-T10 ported). 1B-T10's case `a record id already used is never written again, even if its progress row were lost` (`imports-review.test.ts:479`) pins that guard: the planner's probe T1 (no `taken` filter) fails it on an `AssertionError`, `expected [ 500, 'INTERNAL_ERROR' ] to deeply equal [ 200, undefined ]` (`proof/taken-probe.py`, `proof/taken-probe.out`). With the guard in place, no statement on that path reaches an existing record's `source`, so no mutant can drop it there without failing that case first. The plan says nothing more about it (H9: set once, at create).
  - The one `source` a confirmation writes is that of its new records, and the plan gives it to P4-T11 (`createTransactionRow(c, input, { source: 'statement', slipRefId: null })`, its case `confirmed statement rows carry source statement`, its mutant "drop `source`"). The second review's X5b pins today's NULL, which is the very line P4-T11 must change, and neither home fits it: P4-T11's Files list names neither `transaction-source.test.ts` nor `imports-review.test.ts`, and its Step 4 keeps 1B-T10's suites unchanged.
  - For P4-T11 (receipt note): the second review's probe (`scratch/p3-t2-second/probes/zz-second-imports.test.ts`, the block at its line 1735) is ready to turn around: every confirmed record `statement` in the table, the sync feed and the history.
- **P4. The cases live in `transaction-source.test.ts`, P3-T2's file, in their own block at the end.** No existing line moves except the contracts import, which gains a name. The restore case needs only the file's own helpers. The receipt case needs `seedImportImage` (`support/files.ts`, a ready receipt preview written straight into the vault) and the file's plain `startV1()` client: the retain's copy reads and writes the test bucket, as `attachments.test.ts`'s hooked bucket does when no hook is set. So that 1,900-line port is not needed, and P3-T2's file keeps every source case together.
- **P5. The receipt case uses a `typed` record and checks each command.** H9 says a typed record with a receipt stays `typed`: a receipt never makes it `photo`. The case reads the record after each command and compares once, with each command's status, version and receipt id beside its source, so a failure shows which step lost it, and that each command still answered 200. The planner's step mutants S1 to S3 (`mutants.py --steps`, `proof/steps.out`), each clearing the source in one command only, are each killed by this case: it checks retain, replace and remove separately. They are proof only, not a step of this brief.
- **P6. The restore case checks the record and the sync feed.** The first review asked for the source at the restored version "and in the v4 sync snapshot" (version 3 here, since this case does not edit first). The three snapshots are the create, the delete and the restore. Under R4 the record read fails first.
- **P7. n1 is carried as three lines inside the existing case,** not a new test. The file's test count stays 25, so P3-T13's focused unit counts do not move. `cameraMove` is the case's `siri` transfer with a fresh id (so only its source is wrong) and `source: 'camera' as never`, as the `camera` line types it.
- **P8. The other notes of P3-T2's entry:**
  - Line 636 (m2, the client minimum for the owner and P6C): not this task's. It changes no contract and no build, so there is nothing to raise; P3-T13's receipt repeats it (its P10).
  - Line 643 (n3, `events.ts:6`'s inline `import('@gogospend/contracts').TransactionSource`, still there at `b1ca3bfb`): not carried. It is an app source change, and this task is test-only. The next task that edits `events.ts` is P3-T18 (`AiModelName`, followups line 612): carry it there.
  - Line 644 (housekeeping in P3-T2's receipt): `receipts/P3-T2.md` is another task's merged receipt, and this task edits only its own files. Your receipt records the three corrections in one bullet, so the record is right where the follow-up lands; changing P3-T2's file itself stays the controller's housekeeping.
- **P9. The gate.** No source file changes, so there is no `build:edge` (the controller's call; the bundle is the base's), no `export:web` and no iOS export (no route or app entry), no `typecheck:routes`, no routes tests and no catalogue render files (no screen, route or section). The app gate runs (`typecheck:app`, `test:app`, `test:unit`, which holds the Hermes guards) because a file under `apps/app` changes. The workers file runs focused, under the heavy lock.
- **P10. No new helper and no support change.** Each helper the cases use already exists (`setup`, `record`, `json`, `syncSnapshots` in the file; `seedImportImage` in `support/files.ts`), and Step 0 checks `support/files.ts` by content.

---

## Step 0: Sync, install, and check the kit and the base

0. Make your scratch folder:
   ```bash
   mkdir -p S
   ```
1. Sync the worktree:
   ```bash
   /usr/bin/git -C WT fetch origin claude/p1a-vault-core
   /usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core
   ```
   Expected: "Already up to date." or a clean merge.
2. Record HEAD:
   ```bash
   /usr/bin/git -C WT rev-parse --short HEAD
   ```
   Expected: one short SHA. Note it for the receipt and your final message.
3. Check the kit:
   ```bash
   cd PL && shasum -a 256 -c SHA256SUMS > S/kit-sums.log 2>&1; rc=$?; echo "rc=$rc"; grep -c ': OK$' S/kit-sums.log; wc -l < PL/SHA256SUMS
   ```
   Expected: `rc=0`, then `24` twice (the two numbers are equal; `wc` may pad its number with spaces).
4. Check the base files in WT:
   ```bash
   cd WT && shasum -a 256 -c PL/SHA256SUMS.base
   ```
   Expected: exactly these 6 lines:
   ```
   apps/app/src/storage/diaryRepository.test.ts: OK
   apps/edge/test/workers/transaction-source.test.ts: OK
   apps/app/src/storage/diaryRepository.ts: OK
   apps/edge/src/vault/domain/transactions.ts: OK
   apps/edge/src/vault/files/attachments.ts: OK
   apps/edge/test/workers/support/files.ts: OK
   ```
   A line that is not `OK` means a merge changed a file this task builds on: stop, BLOCKED (name the file; the planner rebases).
5. Install. The root only when missing; the edge always (it is quick):
   ```bash
   cd WT && { test -d node_modules || npm ci --ignore-scripts --no-audit --no-fund; }; echo "rc=$?"
   cd WT && npm run install:edge > S/install-edge.log 2>&1; echo "rc=$?"; tail -1 S/install-edge.log
   ```
   Expected: `rc=0` (when the root install runs, it ends `added 1416 packages in …`); then `rc=0` and `added 248 packages in …`.

## Step 1: Place the two test files

1. Copy them:
   ```bash
   cp PL/real/apps/edge/test/workers/transaction-source.test.ts WT/apps/edge/test/workers/transaction-source.test.ts
   cp PL/real/apps/app/src/storage/diaryRepository.test.ts WT/apps/app/src/storage/diaryRepository.test.ts
   ```
2. Check them:
   ```bash
   cd WT && shasum -a 256 apps/edge/test/workers/transaction-source.test.ts apps/app/src/storage/diaryRepository.test.ts
   ```
   Expected:
   ```
   e5c8fbddad0dee05483bd3b6798ad8af9ba1590f2214524482ef36f3a60c63a7  apps/edge/test/workers/transaction-source.test.ts
   e40e241d96d673725808bce8a31be8042bbe3e19ac1c4679f3fb97dc8c1309a1  apps/app/src/storage/diaryRepository.test.ts
   ```
3. Only those two changed:
   ```bash
   /usr/bin/git -C WT status --short --untracked-files=all
   ```
   Expected: exactly ` M apps/app/src/storage/diaryRepository.test.ts` and ` M apps/edge/test/workers/transaction-source.test.ts`.
4. Every mutant's text is in WT exactly once, and every case it must fail exists:
   ```bash
   cd PL && python3 -I mutants.py --check WT > S/check.out 2>&1; echo "rc=$?"; diff PL/proof/check.out S/check.out; echo compared
   ```
   Expected: `rc=0`, then only `compared` (its last line reads `3 mutants and 3 step mutants; every text found exactly once and every case present: True`).

## Step 2: Typecheck

```bash
cd WT && npm run typecheck:edge > S/typecheck-edge.log 2>&1; echo "typecheck:edge rc=$?"
cd WT && npm run typecheck:app > S/typecheck-app.log 2>&1; echo "typecheck:app rc=$?"
```
Expected: `typecheck:edge rc=0`, then `typecheck:app rc=0`.

## Step 3: RED (the three mutants at once)

```bash
cd PL && python3 -I mutants.py --red WT S/red > S/red.out 2>&1; echo "rc=$?"; diff PL/proof/red.out S/red.out; echo compared
```
It takes about three minutes (both typechecks run on the mutated tree; the workers run waits for the lock if another agent holds it). Expected: `rc=0`, then only `compared`. `S/red.out` reads:
```
RED with R4, R5, R9
typecheck:edge on the RED tree: rc=0
typecheck:app on the RED tree: rc=0
workers: 2 failed | 9 passed (11); rc=1; assertion failures 2 of 2; other errors 0
  failed as expected: a receipt kept, replaced and removed leaves the source as it was: a typed record stays typed
  failed as expected: a restore keeps the source, in the record and in the sync feed
unit: tests 25 pass 24 fail 1; rc=1; assertion failures 1 of 1; other errors 0
  failed as expected: a pending entry may carry a source, and an unknown one is refused
restored=True
RED: failed 3, expected 3; as expected
```
Then check every source file is back:
```bash
/usr/bin/git -C WT status --short --untracked-files=all
```
Expected: the same two ` M` lines as Step 1.3, and nothing else.

## Step 4: GREEN (the two focused files)

```bash
PL/locked.sh S/green-workers.log WT/apps/edge npx vitest run --config vitest.workers.config.ts --reporter=verbose test/workers/transaction-source.test.ts; echo "rc=$?"; grep -E "Test Files|Tests " S/green-workers.log
cd WT/apps/app && npm run test:unit -- src/storage/diaryRepository.test.ts > S/green-unit.log 2>&1; echo "rc=$?"; grep -E "^ℹ (tests|pass|fail) " S/green-unit.log
```
Expected: `locked`, `exit 0; unlocked`, `rc=0`, ` Test Files  1 passed (1)` and `      Tests  11 passed (11)`; then `rc=0`, `ℹ tests 25`, `ℹ pass 25`, `ℹ fail 0`.

## Step 5: Mutation check, one mutant at a time

```bash
cd PL && python3 -I mutants.py WT S/mutants > S/mutants.out 2>&1; echo "rc=$?"; diff PL/proof/mutants.out S/mutants.out; echo compared
```
About a minute, plus any wait for the lock. Expected: `rc=0`, then only `compared`. `S/mutants.out` reads:
```
R4 killed (assertion; 1 failed | 10 passed (11); failed: a restore keeps the source, in the record and in the sync feed): a restore clears the source (the first review's R4) [transactions.ts] restored=True
R5 killed (assertion; 1 failed | 10 passed (11); failed: a receipt kept, replaced and removed leaves the source as it was: a typed record stays typed): the receipt commands' version bump clears the source (the first review's R5) [attachments.ts] restored=True
R9 killed (assertion; tests 25 pass 24 fail 1; failed: a pending entry may carry a source, and an unknown one is refused): the outbox no longer checks a transfer draft's source (the first review's R9) [diaryRepository.ts] restored=True
3 of 3 killed; survivors []; not clean []; not restored []
```
"assertion" means every failing case of that run failed on an `AssertionError`, and that the one case named is the only one that failed. Then:
```bash
/usr/bin/git -C WT status --short --untracked-files=all
```
Expected: the same two ` M` lines as Step 1.3, and nothing else.

Do not run `--steps` (the planner's proof, P5).

## Step 6: Fast local gate (R100)

From WT, each log in S:
1. Typecheck:
   ```bash
   cd WT && npm run typecheck:edge > S/gate-typecheck-edge.log 2>&1; echo "typecheck:edge rc=$?"
   cd WT && npm run typecheck:app > S/gate-typecheck-app.log 2>&1; echo "typecheck:app rc=$?"
   ```
   Expected: both `rc=0`.
2. The focused files once more, after the mutants:
   ```bash
   PL/locked.sh S/gate-workers.log WT/apps/edge npx vitest run --config vitest.workers.config.ts --reporter=verbose test/workers/transaction-source.test.ts; echo "rc=$?"; grep -E "Test Files|Tests " S/gate-workers.log
   cd WT/apps/app && npm run test:unit -- src/storage/diaryRepository.test.ts > S/gate-unit-focused.log 2>&1; echo "rc=$?"; grep -E "^ℹ (tests|pass|fail) " S/gate-unit-focused.log
   ```
   Expected: as Step 4.
3. The edge's Node suite:
   ```bash
   cd WT && npm run test:edge > S/gate-test-edge.log 2>&1; echo "test:edge rc=$?"; grep -E "^ +Tests " S/gate-test-edge.log
   ```
   Expected: `test:edge rc=0` and one `Tests  <n> passed (<n>)` line with no `failed`. Record `<n>` in the receipt as your run's count; it is not a gate figure (R100).
4. The app's suites (a file under `apps/app` changed; `test:unit` holds the Hermes guards):
   ```bash
   cd WT && npm run test:app > S/gate-test-app.log 2>&1; echo "test:app rc=$?"; grep -E "^ℹ fail " S/gate-test-app.log
   cd WT && npm run test:unit > S/gate-test-unit.log 2>&1; echo "test:unit rc=$?"; grep -E "^ℹ fail " S/gate-test-unit.log
   ```
   Expected: `test:app rc=0` and `ℹ fail 0`; then `test:unit rc=0` and `ℹ fail 0`. The unit run takes a few minutes.
5. Whitespace:
   ```bash
   /usr/bin/git -C WT diff --check
   ```
   Expected: no output, exit 0.
6. Not run, and why (put this in the receipt): `build:edge` (no source file changes, so the bundle is the base's: P9); `export:web`, the iOS export and `typecheck:routes` (no route or app entry); the four routes tests and the eight kit render files (no screen, route or catalogue section); CI runs the whole workers suite, the full render suite and sections, the exports, `test:db` and `test:ops`; `test:edge:db` is **SKIPPED** locally (Docker stopped; CI's edge job runs it).

## Step 7: The receipt

Write `WT/docs/implementation/receipts/source-pins.md` from Appendix A, with your own numbers and SHAs in the brackets, from your own logs in S. Do not edit `premium-progress.md` or `receipts/P3-T2.md`.

## Step 8: Commit

1. Stage exactly this task's files:
   ```bash
   /usr/bin/git -C WT add apps/app/src/storage/diaryRepository.test.ts apps/edge/test/workers/transaction-source.test.ts docs/implementation/receipts/source-pins.md
   ```
2. Check what is staged:
   ```bash
   /usr/bin/git -C WT diff --cached --name-only
   ```
   Expected: exactly these 3 lines, in this order:
   ```
   apps/app/src/storage/diaryRepository.test.ts
   apps/edge/test/workers/transaction-source.test.ts
   docs/implementation/receipts/source-pins.md
   ```
   And `/usr/bin/git -C WT status --short --untracked-files=all` lists nothing else.
3. Write the message to `S/commit-message.txt` (use your own model name in the trailer if the controller named another):
   ```
   Pin that restore and the receipt commands keep a record's source

   P3-T2's reviews found two vault write paths that never name source:
   a restore, and a receipt's retain, replace and remove. Each keeps the
   record's source today, but no case held it. Two cases in
   transaction-source.test.ts hold it now, and the outbox's unknown-source
   case gains a transfer twin. Each fails under the reviewer's mutant
   (R4, R5, R9). No source file changes.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. Commit and check:
   ```bash
   /usr/bin/git -C WT commit -F S/commit-message.txt
   /usr/bin/git -C WT log --oneline -1
   /usr/bin/git -C WT show --stat HEAD
   /usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD
   ```
   Expected: one commit with the summary line above; 3 files changed; the last command prints nothing.

## Your final message

As the protocol says: `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker) on the first line; the commit SHA and branch; the files changed; the RED line of `S/red.out` (`RED: failed 3, expected 3; as expected`); the GREEN counts (11 of 11 workers, 25 of 25 unit); the mutants (3 of 3 killed, no survivor); each gate command with its result, the whole workers suite as CI and `test:edge:db` as SKIPPED; deviations (none expected); and what the reviewer should look at first: P3 (why the import confirmation waits for P4-T11, with the planner's T1 probe), P5 (the receipt case's per-command check and the step mutants), P7 (the twin inside the existing case) and P8 (the notes not carried).

---

## Appendix A: the receipt template

```markdown
# source-pins: Source preservation pins on the vault's write paths (P3-T2 follow-up)

- **Status:** built and verified locally on `fix/source-pins`, from `[base SHA]`. Not pushed. Under ruling R87 this receipt is its own file; `premium-progress.md` is not edited. Under ruling R100 the whole workers suite is CI's. The independent review is the controller's, after this receipt. Test-only: no source file changes.
- **Files:** `apps/edge/test/workers/transaction-source.test.ts` (`RECEIPT_RETENTION_CONSENT` and `seedImportImage` imported; a comment and the block `the write paths that never name the source keep it`, 2 cases); `apps/app/src/storage/diaryRepository.test.ts` (3 lines in `a pending entry may carry a source, and an unknown one is refused`; no new test). Both copied from the planner's `real/` (each base matched `SHA256SUMS.base`).
- **The items and their cases:**
  - Both reviews' m1, restore (`transactions.ts:334`, the first review's R4): `a restore keeps the source, in the record and in the sync feed`.
  - Both reviews' m1, a receipt's retain, replace and remove (`attachments.ts:222`, R5): `a receipt kept, replaced and removed leaves the source as it was: a typed record stays typed`.
  - Both reviews' m1, an import confirmation (`confirmation.ts:473`): no case here (the brief's P3). A confirmation never writes an existing record (`taken`, pinned by 1B-T10's `a record id already used is never written again, even if its progress row were lost`), and the source it gives its new records is P4-T11's (`statement`).
  - The first review's n1 (R9): the transfer twin `cameraMove` in `a pending entry may carry a source, and an unknown one is refused`.
- **RED** (`mutants.py --red`: R4, R5 and R9 at once, `red.out`): `typecheck:edge` and `typecheck:app` rc=0 on the RED tree; workers `[2 failed | 9 passed (11)]`, unit `[tests 25 pass 24 fail 1]`; exactly the three new pins failed, each on an `AssertionError`; every source file restored. `RED: failed 3, expected 3; as expected`.
- **GREEN:** workers, under the heavy lock, `transaction-source.test.ts` `[Tests 11 passed (11)]`; unit `diaryRepository.test.ts` `[tests 25, pass 25, fail 0]`.
- **Mutation check** (`mutants.out`): 3 mutants, 3 killed one at a time, each by its one case on an `AssertionError`, each restored byte for byte: R4 (a restore clears the source) by the restore case; R5 (the receipt commands' version bump clears it) by the receipt case; R9 (the outbox stops checking a transfer's source) by the outbox case. The planner's step mutants S1 to S3 (one command at a time) are in its kit (`proof/steps.out`), not rerun here.
- **Gate** (worktree root): `typecheck:edge` rc=0; `typecheck:app` rc=0; the focused files after the mutants (11 of 11, 25 of 25); `test:edge` rc=0 (`[n] passed`); `test:app` rc=0, fail 0; `test:unit` rc=0, fail 0; `git diff --check` clean. Not run: `build:edge` (no source change: the bundle is the base's); `export:web`, the iOS export, `typecheck:routes`, the routes tests and the kit render files (no route, screen or section). **CI:** `test:edge:workers` (whole), the full render suite, the exports, `test:db`, `test:ops`. **SKIPPED:** `test:edge:db` (Docker stopped; CI's edge job runs it).
- **Deviations and calls:** none beyond the brief's rulings (`.claude/controller/briefs/source-pins.md`):
  - P1: ready and test-only; no write path loses `source`, so there is no finding to report.
  - P2: RED is the reviewers' surviving mutants R4, R5 and R9 at once, with both typechecks run on that tree; no stubs.
  - P3: the import confirmation waits for P4-T11: a confirmation never writes an existing record (1B-T10's case pins `taken`; the planner's probe T1), and the source of its new records is P4-T11's.
  - P4: the cases live in `transaction-source.test.ts`, in their own block at the end; the receipt case seeds its images with `seedImportImage`.
  - P5: the receipt case uses a `typed` record (H9) and checks each command; the planner's step mutants S1 to S3 show it.
  - P6: the restore case checks the record and the sync feed's three snapshots.
  - P7: n1 is three lines inside the existing case; the file stays at 25 tests.
  - P8: followups lines 636, 643 and 644 are not carried here (below).
  - P9: no `build:edge`, exports, routes tests or render files (no source, route, screen or section change); the app gate runs.
  - P10: no new helper and no support file change.
- **Not carried, and where:** followups line 636 (m2, the client minimum) is the owner's and P6C's: this task changes no contract or build. Line 643 (n3, `events.ts:6`'s inline type import): an app source change, for the next task that edits `events.ts` (P3-T18). Line 644: see the corrections below.
- **Corrections to `receipts/P3-T2.md`** (followups line 644; that file is left as merged): its gate counts (`test:unit` 998, `build:edge` 266 ms) are the planner's, and the implementer's own logs said 1012 passed and 248 ms; `CreateEntryInput` and `CreateTransferInput` gained `source?: TransactionSource`, with no `| null`; `transaction-source.test.ts` had 9 cases, not 8 (11 with this task's 2).
- **Notes for later tasks:**
  - P4-T11: write `statement` through `createTransactionRow` in the confirmation, and turn the second review's probe around for `confirmed statement rows carry source statement` (`scratch/p3-t2-second/probes/zz-second-imports.test.ts`, the block at its line 1735): every confirmed record carries `statement` in the table, the sync feed and the history.
  - P4-T7 (`createTransactionRow`): its Step 4 keeps `transaction-source.test.ts` passing unchanged, these two cases included.
  - Any later task that rewrites the restore or a receipt command (its own `UPDATE`, a new column): these cases fail if the rewrite drops `source`; keep the statement free of `source`, as H9 says.
```

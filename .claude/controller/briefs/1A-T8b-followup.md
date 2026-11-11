# Brief 1A-T8b-followup: the money journey and two retention pins

You are the implementer (Haiku) for a small follow-up to 1A-T8b. The orchestrator ruled its scope on 8 November 2026, after 1A-T8b (#344) and 1A-T7 (#339) merged into `claude/p1a-vault-core` at `01a5114`. You change four existing files and add one receipt file. Nothing under `apps/edge/src/` changes. The planner proved every step below in a scratch copy of `01a5114`: the RED, the GREEN, 6 mutants and the edge gate. Do exactly what this brief says.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. Note its opening rule **R87**: your receipt is its own file, `docs/implementation/receipts/1A-T8b-followup.md`. You do not edit `docs/implementation/premium-progress.md`.
2. The 1A-T8b review: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/1A-T8b.md`. Read minor 1, minor 3 and "Follow-up 1A-T8b needs once 1A-T7 merges".
3. The plan task: `docs/superpowers/plans/2026-10-25-jotbun-p1a-vault-core.md`, `### Task 8` (line 714), and ruling R5 (the money journey "lives in test/workers/history.test.ts as it.todo in Task 7; Task 8 flips it to it in that same file"). Read also ruling R6 (retention tests use `Date.now()`, because "a past-due real alarm would fire on its own and race the test").

## Scope (the orchestrator's ruling)

1. **The money journey.** At `history.test.ts:441`, change `it.todo(` to `it(` and put the comment above it in the past tense. A mutant proves it: drop `'budgets.put'` from the vault's handlers. The workers suite gains 1 passed and loses 1 todo.
2. **Review minor 1: two retention pins.**
   - **X1 pin:** the S1 case's second alarm runs at exactly the armed time, `t0 + 61 * DAY`. This pins the inclusive prune cutoff (ruling P2).
   - **X3 pin:** a new failing-step variant. It renames the wallet after the delete and asserts that `pruned_through` never goes down. This pins `max()` in `purgeEntities`.
   - Each pin kills its mutant.
3. **Review minor 3: deterministic restore-window cases.** Three cases backdate a deletion past 30 days by SQL and then commit, which arms a past-due alarm that fires on its own mid-test:
   - `transactions.test.ts`: `restore fails after 30 days, and while a referenced wallet or category is archived`;
   - `history.test.ts`: `just inside 30 days is listed and restorable; just outside is neither, before any purge`;
   - `history.test.ts`: `exactly 30 days after its deletion a record is still listed and restorable, as the restore command decides; a millisecond more is neither`.

   Each now pins the vault clock a week ahead and backdates from that clock, so every alarm it arms is in the real future. Each ends with two checks: the alarm is in the real future, and the expired record is still there. Without the clock pin, those checks fail every time (the RED); with it, they pass every time.
4. **The 1B plan's wording.** `docs/superpowers/plans/2026-10-25-jotbun-p1b-vault-files.md` line 1130: "turned on in 1A-T8a" becomes "turned on in 1A-T8b".

Not in scope: review minor 2 (the `transactions_deleted_idx` index) is 1B-T11's, and the review's nits stay as they are. Make no route, migration, `src/` or `premium-progress.md` change.

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-1a-t8b-followup`. Its branch is `fix/1a-t8b-followup`, which the orchestrator cut from `origin/claude/p1a-vault-core` at `01a5114`. Work only here. If WT does not exist, stop: BLOCKED.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1a-t8b-followup-impl`, your scratch folder. Create it with `mkdir -p`. Keep logs and backups only there; never under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1a-t8b-followup`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `basecopy/`: the four files at `01a5114`;
  - `redstage/`: the three test files after Step 2;
  - `real/`: the four files after Step 3;
  - `scripts/edits.py`: every edit, as exact Find/Replace pairs that it checks match once;
  - `scripts/mutants.py`: the mutant runner;
  - `SHA256SUMS`.

  Appendix A quotes every edit in full.
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for those full paths; type the full path.
  - Git: `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-1a-t8b-followup <command>`, one git command per call.
  - npm: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-1a-t8b-followup && npm run <script>`.
- **The heavy lock** wraps every workers run: `npm run test:edge:workers`, each FOCUSED run, and the mutant runner. Take it with `until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done` and release it with `rmdir /private/tmp/claude-501/jotbun-heavy.lock`, after a failure too. If your shell refuses the `sleep` loop, retry the bare `mkdir` until it succeeds. Never remove a lock you did not take.
- **FOCUSED** (run from `WT/apps/edge`, under the lock):
  `cd WT/apps/edge && npx vitest run --config vitest.workers.config.ts --reporter=verbose test/workers/history.test.ts test/workers/retention.test.ts test/workers/transactions.test.ts`
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass unless a step says what to do.

## Step 1: Sync, install, check the base

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date." or a fast, clean merge.
2. `/usr/bin/git -C WT rev-parse --short HEAD`. Record it. The planner's counts are at `01a5114`.
3. Install, since the worktree is new: `cd WT && npm ci --ignore-scripts --no-audit --no-fund`, then `cd WT && npm run install:edge`.
4. Base checksums: run `shasum -a 256` on `WT/apps/edge/test/workers/history.test.ts`, `WT/apps/edge/test/workers/transactions.test.ts`, `WT/apps/edge/test/workers/retention.test.ts` and `WT/docs/superpowers/plans/2026-10-25-jotbun-p1b-vault-files.md`. Expected, from `PL/SHA256SUMS`:
   ```
   b180359c59bb5e09eeb6f73f4e913aceda9aaf6c3b7c9ae22665caa040590d39  history.test.ts
   d98bcb8e8cf427e5f81ca504894e3c57c17da23919ceb4a8ba38aa70889e146c  transactions.test.ts
   a71e355ee9aac0f1f151286ad7c4e4eca13c1477bd81f74e734df18b621c5ea0  retention.test.ts
   89549c30c5fadfe65866e7a3e801fc0c672fef6a9dc876e97efee0437a217c15  2026-10-25-jotbun-p1b-vault-files.md
   ```
   - All four equal: in Steps 2 and 3 you `cp` the verified copies.
   - Any one differs (another task merged first): in Steps 2 and 3, apply the edits with the planner's runner instead of `cp`, to all four files. Step 2 is `python3 -I PL/scripts/edits.py WT red`; Step 3 is `python3 -I PL/scripts/edits.py WT green-only`, run on top of it. The runner applies the exact Find/Replace pairs of Appendix A in order, and each Find must match exactly once. If one does not, it stops with `<label>: N matches in <file>`. Then report BLOCKED with that line and the file's diff against `01a5114`.
5. Baseline, under the lock: run FOCUSED, then `cd WT && npm run test:edge:workers`, then release the lock. Expected:
   - FOCUSED: `Test Files  3 passed (3)`, `Tests  79 passed | 1 todo (80)`.
   - workers: `Test Files  16 passed (16)`, `Tests  304 passed | 4 todo (308)`.

   Save both outputs to `S/base-focused.log` and `S/base-workers.log`.

## Step 2: RED (the end-of-case checks and the two pins, without the clock pins)

1. `mkdir -p S`. If Step 1.4 matched, copy the RED-stage files:
   - `cp PL/redstage/apps/edge/test/workers/history.test.ts WT/apps/edge/test/workers/history.test.ts`
   - `cp PL/redstage/apps/edge/test/workers/transactions.test.ts WT/apps/edge/test/workers/transactions.test.ts`
   - `cp PL/redstage/apps/edge/test/workers/retention.test.ts WT/apps/edge/test/workers/retention.test.ts`

   Otherwise run `python3 -I PL/scripts/edits.py WT red`. Expected: eight lines, `H1` to `R2: applied`.
2. Checksums (only if you copied): run `shasum -a 256` on the three files. Expected:
   ```
   d38be19d666fa2efe721ed853bf7e0774d9845bc88d8abd2d94a65055ed29d2c  history.test.ts
   0489406c64011014e8e5425578ae1deb4df7a0d90e400e975bcd2f98d1d64b8f  transactions.test.ts
   3e4ca5d458b0f116646b6e7bca011d4d268cbc1c5af7e80a272d1ec065dadd42  retention.test.ts
   ```
3. `cd WT && npm run typecheck:edge`. Expected: exit 0.
4. Under the lock, run FOCUSED **three times**, saving each to `S/red-1.log`, `S/red-2.log` and `S/red-3.log`. Then release the lock. Expected, the same in every run:
   - `Test Files  2 failed | 1 passed (3)` and `Tests  3 failed | 77 passed | 1 todo (81)`.
   - The three failures are exactly the three restore-window cases named in Scope item 3. Each is an `AssertionError` from the new end-of-case checks. The planner saw the following in 5 out of 5 runs:
     - `just inside ...`: `expected +0 to be 1` (the stray alarm had already purged `outside`);
     - `exactly 30 days ...`: `expected 0 to be greater than <ms>` (the stray alarm was due in the past or firing);
     - `restore fails after 30 days ...`: `expected [] to have a length of 1 but got +0`.

     Which of a case's two checks fails depends on whether the stray alarm has fired yet. Either one is the RED; any other failure is not.
   - The two retention pins pass here, because they pin code that is already right. Their RED is mutants X1 and X3 in Step 4, each of which fails exactly its pin.
   - The money journey is still `it.todo`. Its proof is mutant MJ in Step 4.

   Record the counts.

## Step 3: GREEN (the clock pins, the money journey, the plan wording)

1. If Step 1.4 matched, copy the final files:
   - `cp PL/real/apps/edge/test/workers/history.test.ts WT/apps/edge/test/workers/history.test.ts`
   - `cp PL/real/apps/edge/test/workers/transactions.test.ts WT/apps/edge/test/workers/transactions.test.ts`
   - `cp PL/real/apps/edge/test/workers/retention.test.ts WT/apps/edge/test/workers/retention.test.ts`
   - `cp PL/real/docs/superpowers/plans/2026-10-25-jotbun-p1b-vault-files.md WT/docs/superpowers/plans/2026-10-25-jotbun-p1b-vault-files.md`

   Otherwise run `python3 -I PL/scripts/edits.py WT green-only`. Expected: five lines, `H4`, `H5`, `H6`, `T4` and `P1: applied`. (Never run the `green` stage on top of `red`: it would apply the RED edits a second time.)
2. Checksums (only if you copied): run `shasum -a 256` on the four files. Expected:
   ```
   ceb1ee8dfed8e8cda4fcf1ce90cdb10057abfad864fb1c5acc0bc22af6774a26  history.test.ts
   83015707dcb4b3c5c7ac4891afcfbf780bd16bec0ba3cb72bf503546603de0d2  transactions.test.ts
   3e4ca5d458b0f116646b6e7bca011d4d268cbc1c5af7e80a272d1ec065dadd42  retention.test.ts
   7799ea20c628e9a88366b02d43cff22e07a8ad7b4897f677e1d9fecb81811b40  2026-10-25-jotbun-p1b-vault-files.md
   ```
3. `cd WT && npm run typecheck:edge`. Expected: exit 0.
4. Under the lock, run FOCUSED **five times**, saving each to `S/green-1.log` through `S/green-5.log`. Then release the lock. Expected in every run: `Test Files  3 passed (3)`, `Tests  81 passed (81)`. The verbose output lists `the money journey > seeds built-ins, records spending, and reads it back through history, summary, budgets, status and sync` and `a purge retried after the prune moved the retention line never moves it back` as passed.
5. `/usr/bin/git -C WT status --short`. Expected: exactly these four paths, modified:
   - `apps/edge/test/workers/history.test.ts`
   - `apps/edge/test/workers/retention.test.ts`
   - `apps/edge/test/workers/transactions.test.ts`
   - `docs/superpowers/plans/2026-10-25-jotbun-p1b-vault-files.md`

## Step 4: Mutation check

The planner's runner applies each mutant to its file, runs FOCUSED, restores the file byte for byte (with a backup in S), and compares the failing tests with the expected set. Run it once, under the lock:

```
until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done
python3 -I PL/scripts/mutants.py WT/apps/edge S > S/mutants.out 2>&1; echo exit=$?
rmdir /private/tmp/claude-501/jotbun-heavy.lock
```

(Type the full paths for PL, WT and S.) Expected: `exit=0`. Every one of the six lines in `S/mutants.out` reads `Tests  1 failed | 80 passed (81) | as expected | restored ok`:

| Mutant | Change | The one test that must fail |
| --- | --- | --- |
| MJ | drop `'budgets.put'` from `VAULT_HANDLERS` (`src/vault/routes.ts`) | `history.test.ts`: the money journey |
| X1 | the prune cut uses a strict `<` (`src/vault/retention.ts`) | `retention.test.ts`: `removes a superseded change that sat below the retention line (S1 change log)` |
| X3 | the purge sets `pruned_through` to its old revision, without `max()` (`src/vault/retention.ts`) | `retention.test.ts`: `a purge retried after the prune moved the retention line never moves it back` |
| U1 | `just inside ...` backdates from real time again (the clock pin undone) | `history.test.ts`: `just inside 30 days ...` |
| U2 | `exactly 30 days ...` pins its clock at real time again | `history.test.ts`: `exactly 30 days after its deletion ...` |
| U3 | `restore fails after 30 days ...` pins its clock at real time | `transactions.test.ts`: `restore fails after 30 days ...` |

Then run `/usr/bin/git -C WT status --short` (still only the four paths) and `shasum -a 256` on `WT/apps/edge/src/vault/routes.ts`, `WT/apps/edge/src/vault/retention.ts` and the three test files. Expected: the test files match Step 3.2. `retention.ts` is `be59fcdfedcee3b5a7b69a51a89306177ed7af8c865c49dad5b13471091fc487`, and `git diff` shows nothing under `apps/edge/src/`.

## Step 5: Gate

Run these from WT, in order, and record each result. The expected counts are at `01a5114`. If your head is newer, record what you see and say why it differs.

1. `cd WT && npm run typecheck:edge`. Expected: exit 0.
2. `cd WT && npm run test:edge`. Expected: `Test Files  13 passed (13)`, `Tests  162 passed (162)`. This task does not change it.
3. Under the lock, `cd WT && npm run test:edge:workers`, then release the lock. Expected: `Test Files  16 passed (16)`, `Tests  306 passed | 3 todo (309)`. Before this task it was 304 passed and 4 todo (308): the money journey moves from todo to passed, and the new retention case adds 1.
4. `cd WT && npm run build:edge`. Expected: it passes. Then `grep -c "vault_retention_" WT/apps/edge/dist/jotbun_vault/index.js` prints 1 or more, and `grep -cE "from ['\"]pg['\"]|node-postgres|DatabaseService|OwnerTx" WT/apps/edge/dist/jotbun_vault/index.js` prints 0.
5. `test:edge:db`: first run `docker info >/dev/null 2>&1 && echo up || echo down`. Docker is stopped on this machine. If it prints `down`, record `test:edge:db` as **SKIPPED (Docker is not running; CI runs it)** and do not start Docker. If it prints `up`, run `cd WT && npm run build -w gogospend-api`, then under the lock `cd WT && npm run test:edge:db`, and record the counts. This task changes no PostgreSQL code.
6. After the commit, run `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD`. Expected: no output.

## Step 6: Receipt (R87: its own file)

`mkdir -p WT/docs/implementation/receipts`, then create `WT/docs/implementation/receipts/1A-T8b-followup.md` with the Write tool, containing exactly the text below. Replace every `<...>` with what you saw. If a number differs from the planner's, write yours and say why under Deviations. Do not edit `docs/implementation/premium-progress.md`.

````markdown
# 1A-T8b-followup: the money journey and two retention pins

- **Status:** built and verified locally on `fix/1a-t8b-followup` (`.claude/worktrees/fix-1a-t8b-followup`), from `<head sha>`. Not pushed. This is the orchestrator's follow-up to 1A-T8b (8 November), after 1A-T8b (#344) and 1A-T7 (#339) merged. It covers the money journey (ruling R5) and the review's minor 1 and minor 3 (`.claude/controller/reviews/1A-T8b.md`), and corrects the 1B plan's wording. Minor 2 (the `transactions_deleted_idx` index) is left to 1B-T11, and the review's nits stand. The independent review is the controller's, after this receipt.
- **Files** (tests and a plan line only; nothing under `apps/edge/src/` changes):
  - `apps/edge/test/workers/history.test.ts`:
    - The money journey runs (`it.todo` becomes `it`; its comment is in the past tense).
    - `deletedAgo` takes an optional base instant. `clockAhead` pins the vault clock a week ahead, and `alarmOf` reads the alarm.
    - `just inside 30 days ...` and `exactly 30 days after its deletion ...` backdate from that clock. Each ends by checking that the alarm is in the real future and the expired record is still there.
  - `apps/edge/test/workers/transactions.test.ts`: `restore fails after 30 days, and while a referenced wallet or category is archived` does the same, and gains the imports it needs.
  - `apps/edge/test/workers/retention.test.ts`:
    - The S1 case's second alarm runs at exactly its armed time (`t0 + 61 days`), which pins the inclusive prune cutoff (ruling P2).
    - New: `a purge retried after the prune moved the retention line never moves it back`, which pins `max()` in `purgeEntities`.
  - `docs/superpowers/plans/2026-10-25-jotbun-p1b-vault-files.md` line 1130: "turned on in 1A-T8b".
- **RED to GREEN** (`npx vitest run --config vitest.workers.config.ts test/workers/history.test.ts test/workers/retention.test.ts test/workers/transactions.test.ts`):
  - Baseline at `<head sha>`: `<Tests 79 passed | 1 todo (80)>`.
  - RED: the end-of-case checks and the two pins, without the clock pins. `<Tests 3 failed | 77 passed | 1 todo (81)>` in each of `<3>` runs. Exactly the three restore-window cases fail, on `AssertionError`s: the stray alarm had either already purged the expired record (`expected +0 to be 1`, `expected [] to have a length of 1`) or was still due in the past (`expected 0 to be greater than ...`). The two pins pass at RED because they pin code that is already right; their RED is mutants X1 and X3.
  - GREEN: `<Tests 81 passed (81)>` in each of `<5>` runs.
- **Mutation check:** 6 mutants, with the planner's runner (`scripts/mutants.py`). Each was applied to its file, run against the three files above, and restored byte for byte. Each failed exactly one test, as expected:
  - MJ: `'budgets.put'` dropped, so the money journey fails;
  - X1: the prune cut strict, so the S1 case fails;
  - X3: the purge lowers the line, so the new retention case fails;
  - U1, U2 and U3: each clock pin undone, so its restore-window case fails.
- **Gate** (worktree root):
  - `typecheck:edge`: exit 0.
  - `test:edge`: `<162>` passed (`<13>` files).
  - `test:edge:workers`: `<306>` passed and `<3>` todo (`<16>` files); before this task, 304 passed and 4 todo.
  - `build:edge`: passes; the `jotbun_vault` bundle has the retention code and no PostgreSQL import.
  - `test:edge:db`: `<result, or SKIPPED: Docker is not running>`.
  - `git diff --check origin/claude/p1a-vault-core...HEAD`: `<clean>`.
- **Deviations:** `<none, or each with its reason>`. Design note: the three restore-window cases set the vault clock so that no past alarm is ever armed, rather than clearing the alarm. Clearing it afterwards cannot stop a stray alarm that fires between the commit and the clear. The end-of-case alarm checks read `getAlarm() ?? 0`, because a stray alarm that is firing reads as null; with the fallback, that is an assertion failure, not a type error.
- **SKIPPED:** nothing hosted; no Cloudflare resource was touched. `<test:edge:db: SKIPPED (Docker is not running; CI runs it)>`.
- **Notes for the integrator:** a test that backdates a deletion, a change or a receipt past 30 days and then commits should pin the vault clock ahead in the same way (`clockAhead` in `history.test.ts`). Otherwise 1A-T8b's alarm is armed in the past and races the test (ruling R6).
````

## Step 7: Commit

1. Stage the five paths: `/usr/bin/git -C WT add apps/edge/test/workers/history.test.ts apps/edge/test/workers/retention.test.ts apps/edge/test/workers/transactions.test.ts docs/superpowers/plans/2026-10-25-jotbun-p1b-vault-files.md docs/implementation/receipts/1A-T8b-followup.md`
2. `/usr/bin/git -C WT status --short`. Expected: only those five paths, staged (the receipt as new).
3. Write `S/commit-message.txt` with the Write tool, containing exactly this (a summary line of 54 characters, a body, a blank line, then the trailer):

```
Turn on the money journey and pin two retention guards

The money journey in history.test.ts runs now that Task 7 has merged. The
S1 retention case fires at exactly its armed time, pinning the inclusive
prune cutoff, and a new case keeps a retried purge from lowering the
retention line. Three restore-window cases pin the vault clock a week
ahead, so the alarm a commit arms is never past due and no purge races
them. The 1B plan now credits 1A-T8b with the journey.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
```

4. `/usr/bin/git -C WT commit -F S/commit-message.txt`, then run Step 5.6.

## Your final message

Follow the protocol:

- `STATUS: DONE` or `STATUS: BLOCKED` on the first line;
- the commit SHA and branch;
- the files;
- the RED and GREEN counts;
- the mutants (6, each as expected);
- each gate command with its counts;
- anything SKIPPED;
- any deviations of your own.

## Note for the reviewer (already checked by the planner)

- **What changed, and what did not.** No code changes, and all four diffs are additive or local to the named cases.
- **What else commits after a backdate.** No other workers file backdates past 30 days and then commits:
  - the other `deletedAgo` cases stay within 30 days, or commit nothing after backdating;
  - `sync.test.ts` backdates `committed_at` but prunes directly, with no commit;
  - `wallets.test.ts`'s 1990 deletion is followed only by refused patches.
- **Where the planner's proof lives.** The proof is in PL: `logs2/` holds the baseline, 5 RED runs, 5 GREEN runs, the full workers run and `mutants.out`.
- **A scratch-only quirk of the planner's runs.** The planner's scratch copy borrowed `node_modules` from another worktree with the same lockfile, and linked `@gogospend/contracts` back to the copy's own `packages/contracts` (`scripts/overlay.sh`). Without that link, `test/contracts/currency.test.ts` (P5-T1) reads a stale contracts package and fails 6 cases. That is a scratch artifact only; a worktree with its own `npm ci` links its own package.

---

## Appendix A: the edits, as exact Find/Replace pairs

These are the same pairs as `PL/scripts/edits.py`. Use them only when Step 1.4 found a different base.

### A.1 RED-stage edits (Step 2), in this order

#### H1: `apps/edge/test/workers/history.test.ts`

Find (exactly once):

~~~
/** Sets a deleted record's deletion instant to `ms` before now (the API's `now() - interval`). */
async function deletedAgo(user: TestUser, id: string, ms: number): Promise<void> {
  await sqlExec(user, 'UPDATE transactions SET deleted_at = ? WHERE id = ? AND deleted_at IS NOT NULL', new Date(Date.now() - ms).toISOString(), id)
}
~~~

Replace with:

~~~
/** Sets a deleted record's deletion instant to `ms` before `from` (default now; the API's `now() - interval`). */
async function deletedAgo(user: TestUser, id: string, ms: number, from = Date.now()): Promise<void> {
  await sqlExec(user, 'UPDATE transactions SET deleted_at = ? WHERE id = ? AND deleted_at IS NOT NULL', new Date(from - ms).toISOString(), id)
}

/**
 * Pins the vault clock a week ahead of real time and returns it (1A-T8b-followup). A deletion
 * backdated past 30 days from this clock is outside the restore window, yet the purge alarm the
 * next commit arms is still about a week in the real future, so no past-due alarm fires on its
 * own during the case (ruling R6).
 */
async function clockAhead(user: TestUser): Promise<number> {
  const at = Date.now() + 7 * DAY_MS
  await runInDurableObject(vaultOf(user), (vault: UserVault) => {
    vault.clock = () => new Date(at)
  })
  return at
}

/** The vault's armed alarm (epoch ms), or null (none armed, or one firing right now). */
const alarmOf = (user: TestUser) => runInDurableObject(vaultOf(user), (_vault, state) => state.storage.getAlarm())
~~~

#### H2: `apps/edge/test/workers/history.test.ts`

Find (exactly once):

~~~
    expect((await client.as(user).post(`/v1/transactions/${inside}/restore`, {}, { ifMatch: 2 })).status).toBe(200)
    expect((await fetchDeleted(user)).items).toEqual([])
  })
~~~

Replace with:

~~~
    expect((await client.as(user).post(`/v1/transactions/${inside}/restore`, {}, { ifMatch: 2 })).status).toBe(200)
    expect((await fetchDeleted(user)).items).toEqual([])
    // The restore armed the alarm in the real future, so no purge ran during the case.
    expect((await alarmOf(user)) ?? 0).toBeGreaterThan(Date.now())
    expect(await rowCount(user, outside)).toBe(1)
  })
~~~

#### H3: `apps/edge/test/workers/history.test.ts`

Find (exactly once):

~~~
    expect((await client.as(user).post(`/v1/transactions/${edge}/restore`, {}, { ifMatch: 2 })).status).toBe(200)
  })
~~~

Replace with:

~~~
    expect((await client.as(user).post(`/v1/transactions/${edge}/restore`, {}, { ifMatch: 2 })).status).toBe(200)
    // The restore armed the alarm in the real future, so no purge ran during the case.
    expect((await alarmOf(user)) ?? 0).toBeGreaterThan(Date.now())
    expect(await rowCount(user, past)).toBe(1)
  })
~~~

#### T1: `apps/edge/test/workers/transactions.test.ts`

Find (exactly once):

~~~
import { randomUUID } from 'node:crypto'

import { beforeEach, describe, expect, it } from 'vitest'
~~~

Replace with:

~~~
import { randomUUID } from 'node:crypto'

import { runInDurableObject } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
~~~

#### T2: `apps/edge/test/workers/transactions.test.ts`

Find (exactly once):

~~~
import { builtinId, moneyFixtures } from './support/money-fixtures'
import { revisionOf, countRows, sqlExec } from './support/command-fixtures'
import { startV1 } from './support/v1-client'
~~~

Replace with:

~~~
import type { UserVault } from '../../src/vault/user-vault'
import { builtinId, moneyFixtures } from './support/money-fixtures'
import { revisionOf, countRows, sqlExec, sqlRows } from './support/command-fixtures'
import { startV1, vaultOf } from './support/v1-client'
~~~

#### T3: `apps/edge/test/workers/transactions.test.ts`

Find (exactly once):

~~~
    expect((await problemOf(await client.as(s.user).post(`/v1/transactions/${food.id}/restore`, {}, { ifMatch: 2 }))).fields).toHaveProperty('category_id')
  })
~~~

Replace with:

~~~
    expect((await problemOf(await client.as(s.user).post(`/v1/transactions/${food.id}/restore`, {}, { ifMatch: 2 }))).fields).toHaveProperty('category_id')
    // Every commit above armed the alarm in the real future, so the expired record was never purged during the case.
    expect((await runInDurableObject(vaultOf(s.user), (_vault, state) => state.storage.getAlarm())) ?? 0).toBeGreaterThan(Date.now())
    expect(await sqlRows(s.user, 'SELECT 1 FROM transactions WHERE id = ?', old.id)).toHaveLength(1)
  })
~~~

#### R1: `apps/edge/test/workers/retention.test.ts`

Find (exactly once):

~~~
    expect(await alarmOf(d.user)).toBe(t0 + 61 * DAY)
    await setClock(d.user, t0 + 62 * DAY)
~~~

Replace with:

~~~
    expect(await alarmOf(d.user)).toBe(t0 + 61 * DAY)
    // At exactly that time: the prune's 30 days are inclusive (ruling P2).
    await setClock(d.user, t0 + 61 * DAY)
~~~

#### R2: `apps/edge/test/workers/retention.test.ts`

Find (exactly once):

~~~
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await headState(user, lunch)).toBe('purged')
    expect(await alarmOf(user)).toBeNull()
  })
})
~~~

Replace with:

~~~
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await headState(user, lunch)).toBe('purged')
    expect(await alarmOf(user)).toBeNull()
  })

  it('a purge retried after the prune moved the retention line never moves it back', async () => {
    // The purge fails while the prune still runs and moves the line past the lunch's deletion and the rename. The
    // retried purge's earlier changes sit below that line, so the line stays where it is: lowered, it would let a
    // cursor between the two lines read a delta missing the pruned changes, with no 410.
    const t0 = Date.now()
    const user = await member(client)
    await setClock(user, t0)
    const lunch = await createLunch(client, user)
    await client.as(user).del(`/v1/transactions/${lunch}`, { ifMatch: 1 })
    const [{ id: wallet }] = await sqlRows<{ id: string }>(user, 'SELECT id FROM wallets')
    expect((await client.as(user).patch(`/v1/wallets/${wallet}`, { name: 'Cash 2' }, { ifMatch: 1 })).status).toBe(200)
    await sqlExec(user, "CREATE TRIGGER fail_purge BEFORE DELETE ON transactions BEGIN SELECT RAISE(ABORT, 'synthetic purge failure'); END")
    try {
      await setClock(user, t0 + 31 * DAY)
      expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
      expect(await headState(user, lunch)).toBe('deleted')
    } finally {
      await sqlExec(user, 'DROP TRIGGER fail_purge')
    }
    const line = (await syncState(user)).pruned_through
    expect(BigInt(line)).toBeGreaterThan(BigInt((await headOf(user, lunch)).revision))
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await headState(user, lunch)).toBe('purged')
    expect((await syncState(user)).pruned_through).toBe(line)
  })
})
~~~

### A.2 GREEN-stage edits (Step 3), in this order, after A.1

#### H4: `apps/edge/test/workers/history.test.ts`

Find (exactly once):

~~~
  // Ported from test/dispatch.db.test.ts with its sync assertions. Plan Task 7 adds
  // it as a todo; 1A-T8b turns it on by changing it.todo to it (ruling R5).
  it.todo('seeds built-ins, records spending, and reads it back through history, summary, budgets, status and sync', async () => {
~~~

Replace with:

~~~
  // Ported from test/dispatch.db.test.ts with its sync assertions. Plan Task 7 added
  // it as a todo; 1A-T8b turned it on by changing it.todo to it (ruling R5).
  it('seeds built-ins, records spending, and reads it back through history, summary, budgets, status and sync', async () => {
~~~

#### H5: `apps/edge/test/workers/history.test.ts`

Find (exactly once):

~~~
    // A minute either side of the boundary; the request's clock is a moment later, which only moves "inside" closer.
    await deletedAgo(user, inside, 30 * DAY_MS - 60_000)
    await deletedAgo(user, outside, 30 * DAY_MS + 60_000)
~~~

Replace with:

~~~
    // A minute either side of the boundary, on a vault clock pinned a week ahead.
    const at = await clockAhead(user)
    await deletedAgo(user, inside, 30 * DAY_MS - 60_000, at)
    await deletedAgo(user, outside, 30 * DAY_MS + 60_000, at)
~~~

#### H6: `apps/edge/test/workers/history.test.ts`

Find (exactly once):

~~~
    const at = Date.now()
    await runInDurableObject(vaultOf(user), (vault: UserVault) => {
      vault.clock = () => new Date(at)
    })
    await sqlExec(user, 'UPDATE transactions SET deleted_at = ? WHERE id = ?', new Date(at - 30 * DAY_MS).toISOString(), edge)
~~~

Replace with:

~~~
    const at = await clockAhead(user)
    await sqlExec(user, 'UPDATE transactions SET deleted_at = ? WHERE id = ?', new Date(at - 30 * DAY_MS).toISOString(), edge)
~~~

#### T4: `apps/edge/test/workers/transactions.test.ts`

Find (exactly once):

~~~
    await client.as(s.user).del(`/v1/transactions/${old.id}`, { ifMatch: 1 })
    await sqlExec(s.user, 'UPDATE transactions SET deleted_at = ? WHERE id = ?', new Date(Date.now() - 31 * DAY_MS).toISOString(), old.id)
~~~

Replace with:

~~~
    await client.as(s.user).del(`/v1/transactions/${old.id}`, { ifMatch: 1 })
    // The vault clock is pinned a week ahead and the deletion backdated 31 days from it: past the restore window, yet
    // the purge alarm the next commit arms is still in the real future, so no purge runs during the case (ruling R6).
    const at = Date.now() + 7 * DAY_MS
    await runInDurableObject(vaultOf(s.user), (vault: UserVault) => {
      vault.clock = () => new Date(at)
    })
    await sqlExec(s.user, 'UPDATE transactions SET deleted_at = ? WHERE id = ?', new Date(at - 31 * DAY_MS).toISOString(), old.id)
~~~

#### P1: `docs/superpowers/plans/2026-10-25-jotbun-p1b-vault-files.md`

Find (exactly once):

~~~
| 1A-T7 (turned on in 1A-T8a), same name |
~~~

Replace with:

~~~
| 1A-T7 (turned on in 1A-T8b), same name |
~~~


## Appendix B: `PL/SHA256SUMS`

```
b180359c59bb5e09eeb6f73f4e913aceda9aaf6c3b7c9ae22665caa040590d39  basecopy/apps/edge/test/workers/history.test.ts
d98bcb8e8cf427e5f81ca504894e3c57c17da23919ceb4a8ba38aa70889e146c  basecopy/apps/edge/test/workers/transactions.test.ts
a71e355ee9aac0f1f151286ad7c4e4eca13c1477bd81f74e734df18b621c5ea0  basecopy/apps/edge/test/workers/retention.test.ts
89549c30c5fadfe65866e7a3e801fc0c672fef6a9dc876e97efee0437a217c15  basecopy/docs/superpowers/plans/2026-10-25-jotbun-p1b-vault-files.md
d38be19d666fa2efe721ed853bf7e0774d9845bc88d8abd2d94a65055ed29d2c  redstage/apps/edge/test/workers/history.test.ts
0489406c64011014e8e5425578ae1deb4df7a0d90e400e975bcd2f98d1d64b8f  redstage/apps/edge/test/workers/transactions.test.ts
3e4ca5d458b0f116646b6e7bca011d4d268cbc1c5af7e80a272d1ec065dadd42  redstage/apps/edge/test/workers/retention.test.ts
ceb1ee8dfed8e8cda4fcf1ce90cdb10057abfad864fb1c5acc0bc22af6774a26  real/apps/edge/test/workers/history.test.ts
83015707dcb4b3c5c7ac4891afcfbf780bd16bec0ba3cb72bf503546603de0d2  real/apps/edge/test/workers/transactions.test.ts
3e4ca5d458b0f116646b6e7bca011d4d268cbc1c5af7e80a272d1ec065dadd42  real/apps/edge/test/workers/retention.test.ts
7799ea20c628e9a88366b02d43cff22e07a8ad7b4897f677e1d9fecb81811b40  real/docs/superpowers/plans/2026-10-25-jotbun-p1b-vault-files.md
85494a9095eb6285498b348a2b87b868cd0bead2baaa4e63213fc2fad7152435  scripts/edits.py
aa500cb9b00f7de00e16fb65ee57f172045b141314718b24d5baee00fcfb5403  scripts/mutants.py
657f9c8251ab164bc0f598954af39b4571ef3ffa05e25038e16f2778cf576924  scripts/overlay.sh
```

# Brief: fix the render press race and the request-log test (implementer: Haiku)

Read `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md` first; it is binding. This is maintenance with no plan task: this brief is the spec. Where the protocol says "the plan", read "this brief".

| Name | Path |
| --- | --- |
| Worktree (`$WT`) | `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-flaky-tests`, branch `fix/flaky-tests`, cut from `origin/claude/p1a-vault-core` at `8f04a3b` |
| Your scratch folder (`$S`) | `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-flaky-tests/` |
| The planner's verified files (`$F`, read only) | `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-flaky/files/` |

- Work only in `$WT`. Never touch the main checkout or `.claude/worktrees/p1a-vault-core`.
- Nothing you need to keep goes under `/private/tmp`.
- Shell variables do not survive between your Bash calls. Write the full paths out in every command, or set the variables again at the start of each call.
- The Bash shell is zsh. A list of files in one variable needs `${=FILES}` in zsh; the bash script `stress.sh` takes it as one quoted argument.

**Size:** S. Two files: a test setup file and one test. Plus the receipt. No app or API source, no package, no lockfile.

**In this PR:**
1. the render press race (six CI and local failures in four files);
2. the request-context `/6500/` test.

**Not in this PR** (diagnosed below):
1. the retention integration test, which is in `apps/api`, frozen, and waits for the controller's ruling;
2. one latent ImportReview race, not yet seen on CI.

## Diagnosis (read once)

### 1. Render: one cause behind six failures in four files

| Where | Test | Failed |
| --- | --- | --- |
| CI 40616621319 (job 122580497653) | RemindersScreen "a change after saving clears the outcome…" | 4052 ms, waiting for "Saved. Your reminder is on." |
| local, ~10 agents running | RemindersScreen "saving: Save is busy…" | at once: no "Saving…" button, "Save" with `aria-busy="false"` |
| CI 40618847092 (PR #330, job 122587650517) | RemindersScreen "off: the switch is off…" | 4223 ms, waiting for "Saved. Reminders are off." |
| CI 40618918299 (PR #328, job 122587875863) | RecentlyDeletedScreen "an unconfirmed restore is frozen…" | 4068 ms, waiting for "Bills ฿12,268.00 is back in History." |
| CI 40620215604 (PR #330, job 122592374348) | HistoryScreen "deleting an entry another device already deleted…" | 271 ms: `Unable to find an accessible element with the role "toolbar"` |
| CI 40620228655 (PR #334, job 122592346772) | HistoryScreen "a delete that meets a newer version elsewhere…" | 404 ms: the same "toolbar" error |
| CI 40620221538 (PR #331, job 122592295437) | QuickAddScreen "a refused entry shows the field problem…" | 4446 ms, waiting for "Saved" |

**The 4 s budget:** `apps/app/src/testing/renderSetup.ts` sets `configure({ asyncUtilTimeout: 4000 })` (commit `7d708e7`). That is the budget of every `findBy…` and `waitFor`.
- `apps/app/vitest.render.config.ts` sets no `testTimeout`, so a test has Vitest's default 5 s.
- Heavy tests set their own: 20 s or 30 s, as #326 (`2876fc9`) gave HistoryReturn.
- The slow failures stop at 4.0x s: a `findBy…` ran out, not the test timeout.

**The cause:** each failing test pressed a control right after a `findBy…` returned, and the press was lost.
- **react-native-web wires presses in passive effects** (0.21.4, `node_modules/react-native-web/dist/modules/`):
  - `usePressEvents/index.js` gives a `Pressable`'s `PressResponder` its new `disabled` and `onPress` in `useEffect`. Until then a click uses the previous render's props.
  - `useResponderEvents/index.js` registers a newly drawn view with the responder system (`ResponderSystem.addNode`) in `useEffect`. Long-press starts from the responder system, so until then a long-press does nothing. A plain click does not need it.
- **React can run those effects in a later task.** The screens load and save outside act: the fake service's promise settles while Testing Library is waiting. React 19 then runs that commit's passive effects as a separate Scheduler task. Only sync lanes flush them at the end of the commit (`react-dom-client.development.js`). That task comes later when the commit's own task ran past the Scheduler's 5 ms slice. RemindersScreen's loaded render alone measured 6.4 ms here, in the development build.
- **On a busy machine the test pressed first.** `findBy…` sees the new DOM, then Testing Library waits one `setTimeout(0)` before returning. React's Scheduler runs on `setImmediate`, and under load the timer can come first. Then:
  - The press met the old props: a Save still disabled from loading (Reminders, QuickAdd), a Try again still `busy` from the restore (RecentlyDeleted's row button is one `PillButton` whether it says Restore or Try again). Nothing happened, and the next `findBy…` waited the full 4 s for an outcome that never comes.
  - History's `openRowActions` (`HistoryTestHarness.tsx`) long-presses a row drawn in the commit the wait saw. The row was not yet in the responder system, so no long-press began. The helper then checks for the toolbar synchronously, so the test failed at once (271 and 404 ms).

**Not an app defect.** The screens are correct. React Native's own `usePressability` also configures in an effect, and a person cannot press inside one Scheduler task.

**Why not a bigger budget, a worker cap or fake timers:**
- A bigger budget changes nothing: the press is gone, and nothing retries it.
- A worker cap only makes the flip less likely, and it would double CI's render time.
  - CI runs `npm run test:render -w gogospend-app` on `ubuntu-24.04` (a private repository; the log does not give the vCPU count).
  - The config has `maxWorkers: 2` with Vitest 4's defaults: `pool` forks, `isolate` on.
  - At `8f04a3b` the suite is 85 files and 1,603 tests: 324 s here. On CI it took 344 to 412 s wall and 570 to 690 s of test time.
  - `CatalogueScreen.render.test.tsx` alone took 352 s on one worker while the other ran the remaining files, so both workers are busy throughout.
- No real timer or animation is involved. The failing tests wait on fake-service promises.

**The fix (systemic, test setup only):** after every `findBy…` and `waitFor`, inside Testing Library's own `asyncWrapper`, the test continues only once React's Scheduler has run what it had queued.
- It queues one normal-priority task on react-dom's own Scheduler and waits for it. A normal-priority task runs after every task queued before it, so the pending passive effects have run.
- The Scheduler is resolved from react-dom's own folder, so it is the copy React uses.
- A person always presses after those effects, so the tests now press in the order the app sees.
- No test file changes.

**Evidence the planner gathered** (`8f04a3b`; you repeat the key parts in Steps 2 to 5):
- With React's Scheduler delayed 20 ms in a scratch config, so Testing Library's timer always comes first:
  - before: the four files fail `20 failed | 130 passed (150)`. All seven failures above are among them, the History ones with the same "toolbar" error;
  - after: `150 passed (150)`.
- The whole suite with the Scheduler delayed 5 ms:
  - before: `31 failed | 1572 passed (1603)` in 15 files (Home, Budget, Wallets, Categories, AddTransaction, OfflineSave, Transactions, M5Hardening, TellBun, CompanionSettings and ImportReview, besides the four);
  - after: `1 failed | 1602 passed (1603)`. The one left is ImportReview, below; it is a different cause.
- The normal suite: `85 passed (85)`, `1603 passed (1603)`, 323.6 s both before and after when run side by side. The extra wait costs nothing measurable. On a fresh `8f04a3b` copy with `$F/fix-flaky-tests.patch` applied: the same counts in 307 s, and no "not wrapped in act" warnings.
- Under real load: the four files, 12 copies at once, 3 rounds, beside 6 busy loops, with before and after running side by side under the same load.
  - Before: `runs=36 passed=30 failed=6`. The failures were "a change after saving" (twice), "off", "on with every day", "an unconfirmed restore is frozen" and History's "toolbar".
  - After: `runs=36 passed=36 failed=0`.

### 2. API: `apps/api/src/auth/request-context.spec.ts`, line 59

`expect(logs.join('\n')).not.toMatch(/SECRET_|Bearer|6500/)` searches every log line, each line's random `request_id` included.
- A UUID is lowercase hex, so the amount's digits `6500` can be part of one.
- CI 40616621319, attempt 2 (job 122583837293), logged `3b86d41e-c46d-4812-b9e2-80cd68765006` and failed.
- By chance that happens in about 1 run in 1,000: four distinct ids, about 17 four-digit windows each.

What the test sends, and what still checks each one after the fix:

| Sent as | Value | Checked by |
| --- | --- | --- |
| path parameter | `SECRET_PATH_ID` | `/SECRET_|Bearer/` over the raw log text |
| query | `token=SECRET_QUERY`, `signed=SECRET_URL` | the same |
| `authorization` header | `Bearer SECRET_HEADER` | the same |
| `x-gogospend-session` header | `SECRET_SESSION` | the same |
| `cookie` header | `sid=SECRET_COOKIE` | the same |
| body `note` | `SECRET_BODY` | the same |
| body `amount_minor` | `6500` | every entry's keys and values except `request_id`: `not.toContain('6500')` |
| the boom route's error | `SECRET_INTERNAL`, `SECRET_PASSWORD` | `/SECRET_|Bearer/` over the raw text |
| unmatched route's query key | `SECRET_UNMATCHED` | the same |
| each entry's own id | `request_id` | must match the v4 `UUID` regex, so nothing can hide in it |

- `SECRET_` and `Bearer` contain characters that are not hex digits, so a request id or a number can never contain them.
- `latency_ms` stays in the amount check: it could contain `6500` only at 6.5 s or more, past Jest's 5 s timeout.

### 3. Not in this PR: the retention integration test (needs the controller's ruling; `apps/api` is frozen)

CI 40620215604, job 122592374391: `src/privacy/retention.integration.spec.ts` "other retention › drops finished upload rows 30 days after they ended…" failed with `new row for relation "import_uploads" violates check constraint "import_uploads_check3"`.

**It is not clock skew.**
- The failing call is line 407, the `oldAccepted` row, not the receiving row (line 408). The stack is `row (…:393:7)` from `…:407:25`.
- `import_uploads_check3` is migration 0014's `CHECK (accepted_at IS NULL OR (format IS NOT NULL AND bytes IS NOT NULL AND part_count IS NOT NULL AND expires_at > accepted_at AND expires_at <= accepted_at + interval '24 hours'))`. The planner confirmed the name on a scratch PostgreSQL 16 built from the migration's `CREATE TABLE`. Postgres numbers unnamed multi-column checks in order: `_check` is the deadline, `_check1` the outcome, `_check2` the accepted status, `_check3` this one.
- No `import_uploads` check calls `now()`, so the database clock cannot break it.
- The test builds `accepted: day(40)` and `expires: day(39)` from two separate `Date.now()` reads (`day = (n) => new Date(Date.now() - n * 86_400_000)`). When the clock ticks a millisecond between the reads, `expires_at` is 24 h + 1 ms after `accepted_at`, over the limit.
- The `oldExpired` row (line 406) has the same exposure.

**Proof** (scratch PostgreSQL, the test's own `INSERT`):
- a 1 ms gap gives that exact error, for both the accepted and the expired row;
- one instant inserts fine;
- the test's own reads straddle a millisecond in 80 of 200,000 tight-loop pairs on an idle core, more often under load.

The probe is `$F/scratch-harness/retention-probe.cjs`. It takes a socket folder and a port, and needs a throwaway PostgreSQL with migration 0014's table (foreign key dropped).

**Proposal for the ruling** (test only, 1 line becomes 4): `$F/retention-proposal.patch`. It applies to `8f04a3b`.

```ts
    // One instant for every row: two reads a millisecond apart put expires_at 24 h + 1 ms after accepted_at,
    // over import_uploads_check3's 24-hour limit (PR #330's SQL job).
    const now = Date.now();
    const day = (n: number) => new Date(now - n * 86_400_000).toISOString();
```

Do not apply it in this PR unless the controller adds it to this brief.

### 4. Not in this PR: ImportReview "parsing says nothing is saved…" (latent, not seen on CI)

The one failure left with the Scheduler slowed is a different race.
- The test mounts with `pollMs={1}` and statuses `['parsing', 'ready']`.
- The screen shows "Reading your file…" only between two polls 1 ms apart. If React's render comes after the second poll, both updates land in one render, and the parsing text never reaches the DOM.
- A follow-up could hold the second preview until the test has seen the parsing text (wrap `preview` behind a promise the test releases). Do not change it here.

Also seen while planning:
- LanguageProvider failed under the planner's first slowed harness only because that harness used a `setTimeout` the test faked. The harness in `$F` keeps the real one, and LanguageProvider passes.

## Files

| File | Change | sha256 at `8f04a3b` (before) | sha256 after |
| --- | --- | --- | --- |
| `apps/app/src/testing/renderSetup.ts` | replace with `$F/apps/app/src/testing/renderSetup.ts` | `f1ebfd858190386896d7082adefa07b6f840e8e2775f4bcbb23862b9ddbe2f62` | `5c4e78b0bdfc194058792378c816b5e413e78798de4805dbf14ea994e0ec0478` |
| `apps/api/src/auth/request-context.spec.ts` | replace with `$F/apps/api/src/auth/request-context.spec.ts` (one hunk at line 59) | `083ab965defaf9cac759a7a8c05437a03ad3cec584199cb716044e02cb597473` | `f9af97811ae8d231ca0150cd6ede361ad6d873a70aea183d6192daa6a05928ee` |
| `docs/implementation/premium-progress.md` | append the receipt (Step 7) at the end | shared: append only | |

- The same two code changes as one patch: `$F/fix-flaky-tests.patch` (applies to `8f04a3b` with `git apply`).
- All checksums are in `$F/SHA256SUMS`.

What `renderSetup.ts` changes:
- **Kept:** the first five comment lines and `configure({ asyncUtilTimeout: 4000 })`.
- **Added:**
  - a second comment paragraph;
  - `createRequire`, loading the `scheduler` that `react-dom` resolves;
  - `afterQueuedReactWork()`, one `unstable_scheduleCallback(unstable_NormalPriority, …)` turned into a promise;
  - a `configure({ asyncWrapper })` that calls Testing Library's own wrapper and awaits `afterQueuedReactWork()` inside it, after the wait's callback.

Copy the file; do not retype it.

What `request-context.spec.ts` changes. Find:
```ts
    expect(logs.join('\n')).not.toMatch(/SECRET_|Bearer|6500/);
    const entries = logs.map((line) => JSON.parse(line) as Record<string, unknown>);
```
replace with:
```ts
    // SECRET_ and Bearer cannot be part of a request id (lowercase hex) or a number: looked for everywhere.
    expect(logs.join('\n')).not.toMatch(/SECRET_|Bearer/);
    const entries = logs.map((line) => JSON.parse(line) as Record<string, unknown>);
    // The amount is digits, which a random request id can contain (CI run 40616621319 logged
    // 3b86d41e-c46d-4812-b9e2-80cd68765006). So each request id is checked for its shape, and the
    // amount is looked for in every other key and value.
    for (const { request_id, ...rest } of entries) {
      expect(request_id).toMatch(UUID);
      expect(JSON.stringify(rest)).not.toContain('6500');
    }
```

Scratch-only helpers in `$F/scratch-harness/`. Never copy them into `$WT`.
- `slowScheduler.setup.ts` and `vitest.slow.config.ts`: delay React's Scheduler tasks by 20 ms (`SLOW_SCHEDULER_MS` to change it), which reproduces the busy-machine order every time.
- `stress.sh`: runs files many times at once beside busy loops.
- `api-mutants.py`: the ten logging mutants.

## Steps

The four render files, used below as `FOUR`:

```
src/screens/redesign/insights/RemindersScreen.render.test.tsx src/screens/redesign/RecentlyDeletedScreen.render.test.tsx src/screens/redesign/HistoryScreen.render.test.tsx src/screens/redesign/QuickAddScreen.render.test.tsx
```

### Step 0: Sync and install

1. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-flaky-tests`
2. `/usr/bin/git fetch origin claude/p1a-vault-core`
3. `/usr/bin/git merge --no-edit origin/claude/p1a-vault-core` (conflicts: protocol step 1).
4. If `node_modules` is missing at the worktree root: `npm ci --ignore-scripts --no-audit --no-fund`. Edge is not needed.
5. `mkdir -p /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-flaky-tests`

### Step 1: Check the two files are as planned

From `$WT`: `shasum -a 256 apps/app/src/testing/renderSetup.ts apps/api/src/auth/request-context.spec.ts`. Both must equal the "before" column.
- **If both match:** go on.
- **If one differs** (the head moved on): run `/usr/bin/git apply --check /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-flaky/files/fix-flaky-tests.patch`.
  - If it applies cleanly, use `git apply` in Step 3, and say so in the receipt.
  - If not, stop: `STATUS: BLOCKED`, with the file and its checksum.

### Step 2: RED, in a scratch copy of the code before the change

1. `mkdir -p $S/red`
2. `/usr/bin/git -C $WT archive HEAD | tar -x -C $S/red`
3. For each of `.`, `apps/api`, `apps/app` with a `node_modules` folder in `$WT`: `ln -s $WT/<dir>/node_modules $S/red/<dir>/node_modules`.
4. `cp $F/scratch-harness/slowScheduler.setup.ts $F/scratch-harness/vitest.slow.config.ts $S/red/apps/app/`
5. **API RED:** force the request id CI logged.

   Make the copy:

   ```
   { echo "jest.mock('node:crypto', () => ({ ...jest.requireActual('node:crypto'), randomUUID: () => '3b86d41e-c46d-4812-b9e2-80cd68765006' }));"; cat $S/red/apps/api/src/auth/request-context.spec.ts; } > $S/red/apps/api/src/auth/request-context.collide.spec.ts
   ```

   Run, from `$S/red/apps/api`:

   ```
   NODE_OPTIONS=--experimental-vm-modules npx jest src/auth/request-context.collide.spec.ts -t "safe request logging"
   ```

   Expect `Tests: 1 failed, 9 skipped, 10 total` and `Expected pattern: not /SECRET_|Bearer|6500/`. Only the logging test runs: the mock gives every request the same id, which the first test rightly rejects.
6. **Render RED (deterministic):** from `$S/red/apps/app`, `npx vitest run --config vitest.slow.config.ts` followed by the `FOUR` files. Expect `Test Files 4 failed (4)`, `Tests 20 failed | 130 passed (150)`. Among them:
   - RemindersScreen "off", "on with every day" and "a change after saving", each at about 4.0 to 4.1 s;
   - RemindersScreen "saving", at once, with `Unable to find an accessible element with the role "button" and name "Saving…"`;
   - RecentlyDeleted, four tests including "an unconfirmed restore is frozen…", about 4.1 s each;
   - QuickAdd, five tests including "a refused entry shows the field problem…": four at about 4.1 s, and "the cheer bun…" at once;
   - HistoryScreen, seven tests including "deleting an entry another device already deleted…" and "a delete that meets a newer version elsewhere…", each at once with `Unable to find an accessible element with the role "toolbar"`.

   Run it twice and record both counts.

### Step 3: GREEN, the change in the worktree

1. `cp $F/apps/app/src/testing/renderSetup.ts $WT/apps/app/src/testing/renderSetup.ts`
2. `cp $F/apps/api/src/auth/request-context.spec.ts $WT/apps/api/src/auth/request-context.spec.ts`

   Or `git apply` the patch, if Step 1 sent you there.
3. `shasum -a 256` both: they must equal the "after" column. They differ only when you used the patch on changed files; then record the new checksums.
4. `/usr/bin/git diff --stat`: exactly these two files.

### Step 4: GREEN proofs, in a scratch copy with the change

1. Make `$S/green` exactly as Step 2.1 to 2.4 made `$S/red`.
2. `cp` the two changed files from `$WT` into the same paths under `$S/green`.
3. **API:** remake the collide copy from the new spec (the Step 2.5 command with `green` for `red`) and run it. Expect `Tests: 9 skipped, 1 passed, 10 total`.
4. **Render, slowed:** the Step 2.6 command in `$S/green/apps/app`, three times. Expect `Tests 150 passed (150)` each time.
5. **Render under real load (required):**

   ```
   bash $F/scratch-harness/stress.sh $S/green/apps/app "<the FOUR files, space-separated>" 12 3 $S/stress-green 6
   ```

   Expect `runs=36 passed=36 failed=0`.
6. **Optional:** the same on `$S/red/apps/app` into `$S/stress-red`, to record the before count. Failures there are by chance; zero is possible, and it is not a reason to stop.

### Step 5: Mutation check (in `$S/green` only)

- **API:** `python3 $F/scratch-harness/api-mutants.py $S/green`.
  - Expect ten lines, all `KILLED`: raw URL, authorization, session header, cookie, path params, whole body, the amount alone, the amount in the route, the amount as the request id (killed by the shape check), and the error message.
  - The script restores each file. Then `diff -r -q $S/green/apps/api/src $WT/apps/api/src` lists only `request-context.collide.spec.ts`.
- **Render:** remove the wait.
  1. `grep -v '^    await afterQueuedReactWork();$' $F/apps/app/src/testing/renderSetup.ts > $S/green/apps/app/src/testing/renderSetup.ts`
  2. Rerun Step 4.4 once. Expect the 20 failures back.
  3. Restore: `cp $F/apps/app/src/testing/renderSetup.ts $S/green/apps/app/src/testing/renderSetup.ts`
  4. Rerun once: `150 passed`.
- No survivor is expected. If one survives, stop and report it.

### Step 6: Gate (from `$WT`)

1. `npm run typecheck`: passes.
2. `npm run typecheck:app`: passes.
3. The four render files: `npm run test:render -w gogospend-app --` followed by the `FOUR` files. Expect `Test Files 4 passed (4)`, `Tests 150 passed (150)`.
4. The API file: `npm run test -w gogospend-api -- src/auth/request-context.spec.ts`. Expect `Tests: 10 passed, 10 total`.
5. `npm run test:api`. It was 44 suites and 955 tests at `75b3625`; record what `8f04a3b` gives.
   - `upload-intake.spec.ts` "a body that keeps trickling…" is a known load-sensitive timer test. If only it fails, rerun once and record both runs.
   - In a copy with linked `node_modules`, `parse-server.spec.ts` and `parser-runner.spec.ts` fail (22 tests) before and after the change. That is the copy's layout. In `$WT` they must pass.
6. The full render suite, once: `npm run test:render -w gogospend-app > $S/render-full.log 2>&1`.
   - Expect `Test Files 85 passed (85)`, `Tests 1603 passed (1603)`, about 324 s here.
   - `grep -c 'not wrapped in act' $S/render-full.log` gives 0.
7. `/usr/bin/git diff --check` before the commit; `/usr/bin/git diff --check origin/claude/p1a-vault-core...HEAD` after it.
8. Not run, because nothing they load changes. Record each as "not run: untouched":
   - `test:app`, `test:unit` (Node tests that never load `renderSetup.ts`);
   - export, builds, release graph, edge and database suites.

### Step 7: Receipt

Append at the end of `docs/implementation/premium-progress.md`, after a blank line. Fill in each `<…>` from your runs.

```markdown
## Fix: two flaky tests (28 October)

Correct tests failed on CI only under load. This is a fix to test setup and one test; no screen and no API code changed.

- **Status:** built and verified locally on `fix/flaky-tests`, from `<head>`. Not pushed.
- **Files:** `apps/app/src/testing/renderSetup.ts` (every render wait) and `apps/api/src/auth/request-context.spec.ts` (the log check).
- **Cause, render:**
  - Six failures in four files: RemindersScreen "a change after saving", "off" and "saving"; RecentlyDeleted "an unconfirmed restore is frozen"; QuickAdd "a refused entry shows the field problem"; and two History deletes that failed at once with no "toolbar".
  - Each test pressed a control right after a `findBy…`. react-native-web wires presses in passive effects: a `Pressable` takes its new `onPress` and `disabled` there, and a new row joins the responder system that long-press needs. React can run those effects in a later Scheduler task than the commit the wait saw. On a busy machine Testing Library's `setTimeout(0)` came first.
  - So the press met a Save still disabled from loading, or a Try again still busy, and the wait for its outcome ran out at 4 s (`asyncUtilTimeout`). Or the long-press began nothing, and History's synchronous toolbar check failed at once.
  - Not a slow screen, not the test timeout, no timers or animations: a bigger budget or a worker cap would not fix it.
  - Every `findBy…` and `waitFor` now returns only after react-dom's Scheduler has run the tasks it had queued (one normal-priority task, inside Testing Library's own `asyncWrapper`). Not an app defect: a person always presses after those effects.
- **Cause, the log test:** it searched every line for the amount `6500`, request ids included, and a random UUID can contain those digits (CI 40616621319 logged `3b86d41e-c46d-4812-b9e2-80cd68765006`). Now `SECRET_` and `Bearer` are still looked for in the raw log, each `request_id` must be a v4 UUID, and the amount is looked for in every other key and value. Every value the test sends is still checked.
- **RED to GREEN:**
  - API, with `randomUUID` forced to the id CI logged (scratch copy): RED `1 failed`; GREEN `1 passed`.
  - Render, React's Scheduler delayed 20 ms (scratch config), the four files: RED `20 failed | 130 passed (150)` (twice); GREEN `150 passed (150)` (three times).
  - Under load (12 copies at once, 3 rounds, 6 busy loops): after `36/36` passed; before `<runs>/<failed>` if run.
- **Mutation check (scratch copy):**
  - ten logging mutants (raw URL, authorization, session, cookie, path params, body, amount, amount in the route, amount as the request id, error message): all killed;
  - removing the Scheduler wait from `renderSetup.ts` brings back the 20 slowed failures: killed.
- **Gate:**
  - `typecheck` and `typecheck:app` pass.
  - The four render files `150 passed`; `request-context.spec.ts` `10 passed`.
  - `test:api` `<suites>/<tests>`.
  - `test:render` `<files> files, <tests> tests passed` in `<duration>`, no act warnings.
  - `git diff --check` clean.
  - Not run (untouched): `test:app`, `test:unit`, export, builds, edge and database suites.
- **Deviations:** none. <or: the patch was applied with `git apply` because …>
- **SKIPPED:** nothing hosted.
- **Not fixed here:**
  - `apps/api/src/privacy/retention.integration.spec.ts` (PR #330's SQL job): `accepted` and `expires` come from two `Date.now()` reads, and a 1 ms tick puts `expires_at` past `import_uploads_check3`'s 24 hours. A one-instant fix is proposed and waits for the controller's ruling (`apps/api` is frozen).
  - ImportReview "parsing says nothing is saved": a latent race between a 1 ms poll and React's render, not seen on CI.
- **Notes for the integrator:**
  - The setup loads react-dom's own `scheduler`, resolved from react-dom's folder; it is not an app dependency of its own.
  - Tests with fake timers are unaffected: the Scheduler keeps the real `setImmediate` it took when it loaded.
```

### Step 8: Commit

1. `/usr/bin/git add apps/app/src/testing/renderSetup.ts apps/api/src/auth/request-context.spec.ts docs/implementation/premium-progress.md`
2. Write the message below to `$S/commit-message.txt`.
3. `/usr/bin/git commit -F /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-flaky-tests/commit-message.txt`

```
Fix two flaky tests: presses before React's effects, and request ids in the log check

Render tests pressed controls right after a findBy, before react-native-web
had wired them: a Pressable takes new props, and a new row joins the
responder system, in passive effects that React can run after the wait
returns. The press was lost and the next wait ran out at 4 s, or a
long-press opened nothing (RemindersScreen, RecentlyDeleted, QuickAdd,
History). Every findBy and waitFor now returns after React's Scheduler has
run the work it had queued.

The request-context log test searched every log line for the amount 6500,
which a random request id can contain (CI run 40616621319). It now checks
each request id's shape and looks for the amount in every other field;
SECRET_ and Bearer are still looked for everywhere.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
```

## Your final message

As the protocol says, plus:
- both RED counts (API, and the slowed render run);
- the stress count;
- the mutant results;
- the full render suite's files, tests and duration.

Reviewer, look first at:
- `renderSetup.ts`'s `asyncWrapper`: Testing Library's own wrapper stays the outer one, so the effects run outside act as during the wait;
- the request id shape check, which kills the "amount as the request id" mutant.

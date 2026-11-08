# Review: fix/flaky-tests (PR #342) "flaky render and API tests"

- Reviewer: Opus, read-only. Commits `708ffbb` (the fix), `5020aa3` (ledger merge) and, at the coordinator's request, `aa73f4b` (R88, receive deadline) on `fix/flaky-tests` (worktree `.claude/worktrees/fix-flaky-tests`). The orchestrator's later merges `0e0ffd6` and `5c3cebe` only bring in the integration head: `git diff origin/claude/p1a-vault-core...5c3cebe` is exactly the six files of `708ffbb` + `aa73f4b` (129 insertions, 5 deletions), and the code diff of `5650669...5020aa3` equals that of `origin/claude/p1a-vault-core...0e0ffd6`.
- Spec: brief `.claude/controller/briefs/fix-flaky-tests.md`, protocol, rulings R85 (two test-only `apps/api` changes) and R88 (the `upload-intake.ts` reason, as the coordinator described it; I found no written text of R88 under `.claude/controller/` beyond `followups.md` line 21).
- Installed versions read: react 19.3.0, react-dom 19.3.0, scheduler 0.28.0 (one copy, `node_modules/scheduler`, which `react-dom` resolves), react-native-web 0.21.4, @testing-library/react 16.3.3, @testing-library/dom 10.4.2, vitest 4.1.12, happy-dom 20.14.6.
- Scratch: `.claude/controller/scratch/fix-flaky-review/` (`red/` = archive of merge base `5650669`, `green/` = archive of `5020aa3`, `r88/` = archive of `aa73f4b`, each with `node_modules` linked from the worktree; `probe/` holds the reviewer probes and mutant scripts; `logs/`). The worktree was not touched; every mutated file in scratch was restored and compared.

## Verdict

VERDICT: Approved. No blocker and no major. Three minors and five nits. Minor 1 is a one-line ledger fix and should land before merge. Minors 2 and 3 are cheap and could land here or as a follow-up.

## What was checked and holds

### renderSetup.ts: the wrapper is correct for the installed React

- **What React does** (`react-dom-client.development.js`): a Default-lane update made outside act renders in a Scheduler task at `NormalPriority$1` (`scheduleTaskForRootDuringMicrotask`, around line 20614). The commit schedules its passive effects as a separate `scheduleCallback$1(NormalPriority$1, … flushPassiveEffects …)` (line 19551). Only sync lanes flush them at the end of the commit (`0 !== (pendingEffectsLanes & 3) && flushPendingEffects()`, line 20016). In dev, `finishedWork.actualDuration !== 0`, so the effects task is always scheduled.
- **The window is wider than the brief says, which supports the diagnosis.** `flushSpawnedWork` calls `requestPaint()` after every commit (line 19907). Scheduler 0.28 then has `needsPaint = true`, so `shouldYieldToHost()` is true at once and the work loop yields before the not-yet-expired effects task. So the passive effects of any commit that was not sync always run in a later `setImmediate`, not only when the commit overran the 5 ms slice (the brief's wording, which is not in the committed files). The race is only Node's ordering of RTL's `setTimeout(0)` (timers phase) against the Scheduler's `setImmediate` (check phase).
- **The new task.** `unstable_scheduleCallback(NormalPriority, cb)` pushes a task with `sortIndex = now + 5000` (scheduler lines 300 to 345). The task heap is ordered by expiry and then by id, so it runs after every Normal-or-higher task already queued, including the effects task. It goes out through the Scheduler's captured `localSetImmediate` (line 210, taken when the module loads).
- **Same instance as React's.** `load.resolve('scheduler', { paths: [load.resolve('react-dom')] })` resolves to the one `node_modules/scheduler/index.js`. react-dom is externalized and loaded by Node's `require`, so both share one module cache. Proof: removing the wait brings the 20 slowed failures back (implementer's mutant log), and my probe that counts calls saw exactly one Scheduler call per `waitFor`.
- **Composition.** `getConfig().asyncWrapper` read after `import '@testing-library/react'` is RTL's own wrapper, which RTL installs on import. The new wait runs inside it, so `IS_REACT_ACT_ENVIRONMENT` stays false while the effects run (0 "not wrapped in act" in my full run). A wait that fails (`await callback()` rejects) skips the extra wait, so a failure is never delayed. Nothing else in `apps/app` calls `configure` or `asyncWrapper`, and `@testing-library/user-event` is not installed. Only `vitest.render.config.ts` loads `renderSetup.ts`.

### Diagnosis reproduced, and the root cause pinned to the late effect

All runs are on the four files (150 tests), using the brief's `slowScheduler.setup.ts` and `vitest.slow.config.ts` (Scheduler delayed 20 ms).

| Probe | Result |
| --- | --- |
| Base `5650669`, slowed | `20 failed | 130 passed (150)`: the seven named tests among them. History fails at once with no "toolbar"; Reminders, RecentlyDeleted and QuickAdd fail at 4.03 to 4.12 s |
| `5020aa3`, slowed | `150 passed (150)`, 0 act warnings |
| Base, slowed, **plus react-native-web's press wiring moved to layout effects** (`probe`: a scratch-only `Module.prototype._compile` hook rewrites `usePressEvents` and `useResponderEvents` `useEffect` to `useLayoutEffect`; renderSetup unchanged) | `1 failed | 149 passed`. 19 of the 20 failures vanish without the fix, so the late passive effect is the cause. The one left, QuickAdd "the cheer bun…", depends on the screen's own passive effect (`readCheerDay` in `useEffect`, `QuickAddScreen.tsx:367`), which the fix also covers. |
| Base, slowed, `asyncUtilTimeout` 15 s and `testTimeout` 40 s | Reminders "off" fails at 15.1 s and RecentlyDeleted "an unconfirmed restore is frozen" at 15.1 s. A bigger budget does not help: the press is lost, so a slow runner is not the cause. |

### Can it hang, slow the suite, or hide bugs?

The probes are in `probe/green-probe-files/reviewProbe.render.test.tsx`. Each ran on the new setup and on the old one.

| Probe | New | Old |
| --- | --- | --- |
| A: a passive-effect update loop that never settles | `findBy` returns in 5.0 ms | 4.9 ms |
| B: a continuous stream of UserBlocking Scheduler tasks | `waitFor` returns after **4758 ms** | 5 ms |
| C: fake `setImmediate`, `performance`, `Date` | returns | returns |
| D: Vitest default fake timers with `shouldAdvanceTime` | returns | returns |
| E: unheld save; after `findBy('Saving…')`, is "Saved" there? (30 runs) | settled 30/30 | settled 30/30 |
| E, Scheduler slowed (a busy machine) | settled 30/30 | busy 29, settled 1 |

- **No new hang.** A Scheduler that never drains does not hold the wait (A): the Normal task only waits for tasks queued before it, and newer Normal tasks sort after it. Fake timers cannot stop it (C, D), because the Scheduler took the real `setImmediate` when the setup file loaded it, before any test ran. No render test uses `findBy`/`waitFor` while fake timers are on. The five files that call `useFakeTimers`, and `HistoryTestHarness.openRowActions`, use only sync `act` and timer advances.
- **The only bound is the Scheduler's own 5 s expiry** (B). Only a stream of higher-priority work can hold the wait, and React makes UserBlocking tasks only for continuous events, which these tests never fire. See nit 4.
- **Cost.** My one full run at `5020aa3` gave `Test Files 86 passed (86)`, `Tests 1609 passed (1609)`, 347.2 s, 0 act warnings, 0 unhandled. It includes `recordActions.render.test.tsx` from #335, which the implementer's 85-file run (`708ffbb`) did not have. My jest mutant runs overlapped part of it, so the time is not comparable to the 308.9 s receipt figure. The brief's side-by-side runs (323.6 s both) remain the timing evidence.
- **What a check after a wait sees (E).** On an idle machine the old setup already let the Scheduler run before RTL's `setTimeout(0)`. The new wait makes that order certain on a busy machine too. So the meaning of an assertion is the idle-machine meaning, now without the flake.
- **Intermediate-state tests.** Every test that asserts a busy state holds the service: `fake.hold`, `heldService`, `files.hold`. Examples: Reminders "saving" (`RemindersScreen.render.test.tsx:358`), QuickAdd 152 and 309, Budget 385, Wallets 372, Categories 320, RecordReceipt 216 to 230 (three transients in a row, each held), Import 455. Others assert static seeded states (Home "Saving 1 entry…" from a drafts diary). Each passed in the full run and, for the four files, in the slowed run.
- **Negative assertions.** I scanned for them: 180 `queryBy…` checks for absence sit within two lines after a wait, in 28 files. The ones about outcomes (QuickAdd 180, 332, 449, 511, 523; OfflineSave 44; M5Hardening 85; Import 187, 459) check a settled absence after a terminal outcome, or an absence while the service is held. Waiting for queued work makes them stronger, not vacuous: a wrong "Saved" that React had already queued is now on screen when the check runs. They pass vacuously only for something that appears and disappears entirely within the queued work. A point-in-time query could never catch that reliably, and none of these tests claims to.

### request-context.spec.ts (R85)

- RED and GREEN reproduced, with `randomUUID` forced to CI's `3b86d41e-…-80cd68765006`. Base: `1 failed, 9 skipped` (`Expected pattern: not /SECRET_|Bearer|6500/`). New: `9 skipped, 1 passed`.
- Each value sent is still looked for. `SECRET_PATH_ID`, `SECRET_QUERY`, `SECRET_URL`, `Bearer SECRET_HEADER`, `SECRET_SESSION`, `SECRET_COOKIE`, `SECRET_BODY`, `SECRET_INTERNAL`, `SECRET_PASSWORD` and `SECRET_UNMATCHED` are matched by `/SECRET_|Bearer/` over the raw text. `_`, `S`, `B` and `r` are not hex, so no id or number can contain them. The amount `6500` is looked for in every key and value except `request_id`.
- The implementer's ten mutants were all killed (`api-mutants.log`). Six more of mine (`probe/api-extra-mutants.py`): an amount in a UUID-shaped extra field, the amount as a number, `req.headers`, `req.query` and `req.path` are killed. **The amount smuggled inside a UUID-shaped `request_id` survives** (minor 2).

### retention.integration.spec.ts (R85)

- `import_uploads_check3` is the fourth unnamed table CHECK of `apps/api/drizzle/0014_import_intake.sql`, the one that spans several columns: `accepted_at IS NULL OR (format, bytes, part_count NOT NULL AND expires_at > accepted_at AND expires_at <= accepted_at + interval '24 hours')`. PostgreSQL names a CHECK that references one column `<table>_<column>_check`. It names the rest `_check`, `_check1`, `_check2`, `_check3` in order: the deadline, the outcome, the accepted status, then this one.
- Before the fix, `accepted: day(40)` and `expires: day(39)` were two `Date.now()` reads, so the gap was 24 h + (t2 - t1). In 200,000 tight-loop pairs here, 90 came out over 24 h. With one read: 0 over and 0 violating `> accepted AND <= accepted + 24 h`. The `oldExpired` row is fixed the same way.
- The meaning is unchanged. Every threshold the test exercises is in days (31, 2, 32, 34/33, 40/39, 0 against the 30-day rule). The single instant moves rows by milliseconds, and no `import_uploads` CHECK calls `now()`. The receiving row's deadline is still created + 10 min.
- It already ran green on CI. Run 42468711069 at `0e0ffd6`, job "SQL integration and ops (PostgreSQL 17)": `PASS src/privacy/retention.integration.spec.ts`, `Tests: 694 passed`.

### aa73f4b (R88): the receive deadline

- **The wait is unchanged.** `untilDeadline ? left : idleMs` equals the old `Math.min(idleMs, left)`, including at `left === idleMs`. The throw point, `stalledPull` and the `finally` that leaves a stalled pull alone are untouched, so the body is ended exactly when it was before.
- **Only the recorded reason changes.** `problemFor` maps `upload_stalled` and `upload_timeout` to the same `ProblemException(408, 'UPLOAD_INCOMPLETE', { messageKey: IMPORT_TIMEOUT_MESSAGE_KEY })` (`upload-intake.ts:152-154`). The client sees the same 408. Only `discard(…, 'failed', code)` records a different `outcome_code`.
- **The logic is right.** When `left <= idleMs`, the timer is `left` ms, so the client has been silent for less than the idle limit. Only the deadline can end it. The one tie, `left === idleMs`, is both, and calling it a timeout matches the absolute bound. The only other spec that expects `upload_stalled` is the idle test, at line 555 (`idleMs` 50, default `receiveMs`), which takes the `idleMs` branch.
- **The new test cannot pass vacuously.** The 408 assertion is the same for both codes, but `imports.aborted` must be exactly `[{ status: 'failed', code: 'upload_timeout' }]`. The `Date.now` spy makes the reading at the timer fire `start + 99`, against a deadline of `start + 100`, so the old code records `upload_stalled` (implementer's `r88-red.log`; my mutant R1). The spy is restored and the gate opened in `finally`. `within` uses the real `setTimeout`, which the spy does not touch.
- **My mutants** (`probe/r88-mutants.py`, whole spec, 97 tests). Killed: R1, the old clock-only reason (1 failed); R3, always a timeout (1 failed, the idle test); R5, the flag inverted (2 failed); R6, the waits swapped (2 failed). Survived: R2, the flag alone without `|| Date.now() >= deadline`; R4, a strict `<` boundary (nit 8).
- Gate: the spec at `aa73f4b` in scratch gives `97 passed`. The implementer's five runs gave 97/97 each, and `test:api` gave 956. The trickling test (`idleMs` 1000, `receiveMs` 150) now takes the `untilDeadline` branch on every pull, so the CI flake cannot recur through this path.

### Commits, receipt, whitespace

- `708ffbb`: plain imperative summary, short body, `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`. `aa73f4b`: the same shape, and it cites R88 and CI run 42468711069.
- `git diff --check origin/claude/p1a-vault-core...5c3cebe` and `git diff --check aa73f4b^ aa73f4b`: clean.
- The ledger merge `5020aa3` kept both sides: the net diff adds only the receipt at the end. `5c3cebe` merges cleanly with the current integration head (`git merge-tree`, no conflict).
- The receipt is dated 8 November, is in house style (`## Fix: … (8 November)`, like `## Fix: sheets rise above the iOS keyboard (28 October)`), cites R85 twice and R88, records the ImportReview follow-up under "Not fixed here", and records `test:db` as SKIPPED with the reason. Its numbers match the implementer's logs: API RED/GREEN, `19 and 20 failed`, stress `31/36` then `36/36`, 10 mutants, `test:api 44/955`, render `85/1603` in 308.86 s, 0 act warnings, build and release graph passed. See minor 1 and nit 7 for what is now wrong in it.

## Findings

### Blocker

None.

### Major

None.

### Minor

1. **The receipt and the PR body now say no API source changed, but `aa73f4b` changes `apps/api/src/imports/upload-intake.ts`.** At `5c3cebe`, `premium-progress.md` (the `## Fix: flaky render and API tests` section, intro line) still says "This is a fix to test setup and to three tests; no screen and no API source changed".
   - Its **Files** bullet omits `upload-intake.ts` and `upload-intake.spec.ts`.
   - Its **Gate** bullet still says `test:api` `44 suites, 955 tests`. The R88 bullet further down says 956.
   - The PR #342 body says "Test files only; no app or API code changes" and "`test:api` 955".
   - The R88 bullet is accurate, but the section contradicts itself about a frozen area.
   - Fix: update the intro, Files and Gate lines, e.g. "test setup, three tests and one API line under R88". The orchestrator should update the PR body.
2. **The request id check can be fooled by an amount shaped like a UUID.** My mutant X1 logs `request_id: \`${amount.padStart(8, '0')}-0000-4000-8000-000000000000\`` for a request with an amount. It matches the v4 `UUID` regex, the amount check skips `request_id`, and the test passes. The old spec killed it.
   - This is contrived and no real logger would do it, but the receipt's "Every value the test sends is still checked" is not quite true for the amount.
   - Fix, verified in scratch: keep each response's `x-request-id` (the middleware sets it from `randomUUID`) and add `expect(ids).toContain(request_id)` in the loop. That gives `10 passed` normally and passes the forced-collision copy (`1 passed`), and X1 is killed (`expect(received).toContain(expected)`).
   - Alternative: send a 13-digit or longer amount, which no UUID group (at most 12 hex characters) can contain, and keep the whole-log regex.
3. **The setup is not idempotent: without isolation the wrapper stacks.** `renderSetup.ts` wraps whatever `getConfig().asyncWrapper` is, and DTL's config lives in Node's module cache, which survives between files in one process.
   - Probe `pid1..4.render.test.tsx` with `--no-isolate --maxWorkers 1`: one process, and the four files made 1, 2, 3 and 4 Scheduler waits per `waitFor`.
   - Today's config (Vitest 4.1.12, forks, `isolate` left at its default of true) starts a fresh process per file: four pids, one wait each. So there is no effect now.
   - `isolate: false` is an obvious speed-up for a suite of about 5 minutes, so the stacking is latent. Fix: guard it with a marker on the wrapped function or a module-level symbol on `process`, and wrap RTL's wrapper only once.

### Nit

4. **No explicit bound on the extra wait.** It ends when the Scheduler runs the Normal task, at the latest when that task expires after 5 s. Probe B: 4758 ms under a continuous UserBlocking stream. React makes no such stream in these tests, but if one ever existed the failure would read "Test timed out in 5000ms", not a `findBy` error. Optional: race `afterQueuedReactWork()` against `asyncUtilTimeout`.
5. **The comment over `afterQueuedReactWork` is slightly too broad.** "A normal-priority task runs after those queued before it" holds for Normal and higher. Low and Idle tasks queued earlier run after it. React uses Idle only for offscreen and idle lanes, which these screens do not use.
6. **"A person always presses after those effects"** (renderSetup comment, receipt) is slightly too strong for the web build. A tap queued during a long commit can be dispatched before the effects task. This is react-native-web's (and RN `usePressability`'s) design, and a reasonable trade for the tests, but the render suite can no longer surface such a lost press.
7. **Receipt counts.**
   - "Six failures in four files" then names seven: three Reminders, one RecentlyDeleted, one QuickAdd, two History. The brief's table also has seven rows, six on CI and one local.
   - The RED line lists "`20 failed` and `19 failed` in two runs", while Deviations says the first run had 19, and the logs agree: `render-red-1` 19, `render-red-2` 20.
8. **Two R88 branches are untested.**
   - `|| Date.now() >= deadline`, which matters only when an idle-limit timer fires after the deadline (a blocked event loop), survives as R2. A `Date.now` spy that jumps past the deadline during a wait with `left > idleMs` would pin it.
   - The `<=` against `<` boundary survives as R4. It is equivalent except at exact equality, where the code's choice (timeout) is reasonable.

## Notes for the orchestrator

- CI at `5c3cebe` (run 42469871994) was still in progress when I finished. At `0e0ffd6` the SQL job passed with the retention change, and the app job failed only on the upload-intake flake that `aa73f4b` fixes. That job stopped at `test:api`, so CI has not yet shown the render suite green with the new wait. My local full run at `5020aa3` is green.
- The ImportReview "parsing says nothing is saved" race is recorded in the receipt under "Not fixed here". The new wait does not touch it: its transient is found by the test's first `findBy`, and the extra wait comes only after a wait succeeds.
- My scratch: `.claude/controller/scratch/fix-flaky-review/` (`logs/red-slow.log`, `green-slow.log`, `red-slow-layout.log`, `red-slow-big.log`, `probe-*.log`, `render-full-green.log`; `probe/` holds the probe tests, `api-extra-mutants.py`, `r88-mutants.py` and the hardened request-id check, which was tried in scratch only).

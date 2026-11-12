# Brief 1D-T7 fix round: the launch keeps what it held, the diary hears sync first, and the reviews' pins

You are the fixer for the 1D-T7 fix round. PR #444 (branch `p1/1d-t7-app-events`, head `78f91ca5`) sends the phase 1 app events. CI is green 9 of 9, and both reviews say **Needs fixes**, with the same major:
- the first review (`reviews/1D-T7.md`, Opus): M1, m1, m2 and n1 to n3;
- the second review (`reviews/1D-T7-second.md`, Sonnet): M1, m1 and n1 to n4.

The controller ruled **R119** (quoted in P21 below). The planner wrote every file below and proved it in a scratch copy of `78f91ca5` (`git archive 78f91ca5`, its own `npm ci`):
- RED: the round's eight test files over `78f91ca5`'s code, with no stub. `typecheck:app` exits 0, and 3 cases fail, each on an `AssertionError`;
- GREEN;
- 76 mutants: 75 killed by assertions, and QE, the plan's equivalent mutant, surviving as before;
- R100's fast local gate: `typecheck:app`, the four routes tests (each file named), `test:app`, `test:unit`.

You copy the planner's files, check them by checksum, prove RED, GREEN and the mutants in the worktree, place the two receipts, run the gate and commit. The planner wrote both receipts; you copy them and do not edit them. Do exactly what this brief says.

Read first:
1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only, and no whole-suite total as an expected value anywhere. R87 applies: the round's receipt is its own new file, `docs/implementation/receipts/1D-T7-fix.md`, and `1D-T7.md` takes one line pointing to it; do not edit `premium-progress.md`.
2. The reviews: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/1D-T7.md` and `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/1D-T7-second.md`.
3. The first round's brief, `/Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/1D-T7.md`. Its rulings P1 to P20 stand, except where this brief's P21 to P33 change them.

## Paths and rules

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7` (branch `p1/1d-t7-app-events`, head `78f91ca5`, installed). Work only here. Do not fetch or merge the integration branch into it: the controller merges up (P22).
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix`, your scratch folder. Your logs go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix-planner`, the planner's folder. Read it, run its scripts; never write into it. It holds:
  - `real/`: the round's 12 files at their repo paths: the two code files, the eight test files, `1D-T7.md` with its one new line, and `1D-T7-fix.md` (new);
  - `orig/`: the 11 of them that `78f91ca5` has, as it has them;
  - `diffs/`: one diff per modified file (`orig/` to `real/`, `<path with / as _>.diff`, repo paths `a/<path>` and `b/<path>`, full blob ids), for reading;
  - `mutbase/`: `78f91ca5`'s copies of the 15 sources the mutants touch that this round does not change;
  - `files.txt` (every path, with M or A and what RED holds) and four checksum lists, paths relative to WT:
    - `base-check.sha256`: the 11 files as `78f91ca5` has them;
    - `base-absent.txt`: the one new path, which must not exist yet;
    - `red-check.sha256`: the 10 files as RED leaves them (the eight test files from `real/`, the two code files as `78f91ca5` has them);
    - `real-check.sha256`: the round's 12 files in their final form;
  - scripts: `place.sh` (puts the RED, GREEN or receipt files in place, as `files.txt` says), `mutants.py` (the 76 mutants), `applycheck.sh` (the diffs rebuild `real/` from `orig/`, no whitespace errors), `make-diffs.sh` and `make-sums.sh` (the planner's), and the planner-only `reset-base.sh` (never run it);
  - `proof/` (the planner's runs and mutant results);
  - `SHA256SUMS` (every kit input, script and non-log proof file) and `SHA256SUMS.logs` (the `.log` files). Check `SHA256SUMS` as a gate.
  - There is no `stubs/`: RED needs no stub (P30). `PL/tree/` is the planner's proof tree; it is not in `SHA256SUMS`, and you never run anything in it.
- Every shell call starts in a fresh directory, so every command below is written with full paths. Type each exactly. Git: `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 <command>`, one git command per call. The shell is zsh: keep an exit code in `rc` (`cmd; rc=$?`), and never name a variable `path`.
- Run one step at a time. Never run a test while the mutant runner (Step 4) is running: it changes code files while it runs.
- No heavy lock is needed: no database suite and no workers pool. Docker is stopped and stays stopped.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests, code or receipts to make them pass. One exception, a load flake: a case that times out under load in a file this round does not touch. Rerun that file alone once, and record both runs.
- Every count you report comes from your own log in S. Never copy the planner's logs in place of one.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/analytics/controller.ts` | M1: `setAccount`'s held rule, `keepHeld = accountId === undefined \|\| (accountId === null && id !== null)`, with a three-line comment (P23). 310 lines before, 313 after. |
| `apps/app/src/sync/deviceSync.ts` | Sonnet's n2: `report(outcome)` moves to the top of `reportingSyncEvents`' callback, and its comment gains two lines (P27). 71 before, 73 after. |
| `apps/app/src/analytics/controller.test.ts` | 2 cases: the launch's first answer keeps what is held; a sign-out still drops it (P23). 870 before, 892 after. |
| `apps/app/src/analytics/appAnalytics.render.test.tsx` | 2 cases through `AnalyticsUpkeep`: a signed-out first launch, and a session restored at launch (P23). Its mocks gain `fetchAccountId` and `expo-router`. 65 before, 114 after. |
| `apps/app/src/sync/deviceSync.render.test.tsx` | 1 case: the diary hears each outcome before its events go out (P27). 40 before, 57 after. |
| `apps/app/src/screens/redesign/entry/entrySave.render.test.tsx` | The track-less save's case (`a device save calls onSaved once, after the diary kept it`) gains a recorder and one assertion: no `record_saved` (P24). 287 before, 296 after. |
| `apps/app/src/screens/redesign/QuickAddScreen.render.test.tsx` | 1 case: an income and a move record their own kinds (P26). 1164 before, 1186 after. |
| `apps/app/src/screens/redesign/RecordScreen.render.test.tsx` | 2 cases: "Use yours" reports the server copy's category (P25); an income's Restore records `income` (P26). 1039 before, 1079 after. |
| `apps/app/src/screens/redesign/HistoryScreen.render.test.tsx` | 1 case: a move's delete and undo record `transfer` (P26). 583 before, 603 after. |
| `apps/app/src/screens/redesign/RecentlyDeletedScreen.render.test.tsx` | 1 case: a restored move records `transfer` (P26). 282 before, 299 after. |
| `docs/implementation/receipts/1D-T7.md` | One line after Status, pointing to the fix round (P29). 52 before, 53 after. |
| `docs/implementation/receipts/1D-T7-fix.md` | **New:** the round's receipt (R87), written by the planner with the proven numbers (P29). |

Not in this round: `AnalyticsUpkeep.tsx`, `appAnalytics.ts`, `bus.ts` (the early list and its hand-over are right; the controller dropped what they handed over), `entrySave.ts`, `recordActions.ts`, `HistoryScreen.tsx`, `deletedData.ts` (P24 to P26 pin code that is already right), `spendMediaPermissionTelemetry.ts` (P28), any route, `en.json`, `th.json`, any package or lockfile, `premium-progress.md`.

## Planner rulings (what this round decides, with the reason for each)

- **P21. R119, the controller's ruling of 12 November, quoted:**
  1. **M1 (both reviews): the launch's first account answer keeps what is held, whether it says signed out or names an account.**
     - A sign-out (an account to `null`) and a switch (`A` to `B`) still drop held events, so L4 and P14 hold. `reset()` and `stopSessionRecording()` still run at every change.
     - This reads Task 1's "or to `null`" with its parenthetical and with L4: it means a sign-out, not the launch's first answer.
     - The Opus form is `keepHeld = accountId === undefined || (accountId === null && id !== null)`; use it, or say why the Sonnet form is better.
     - Pin it through `AnalyticsUpkeep`'s signed-out start, not only the controller's rule (the Opus `zzReviewEarly`, the Sonnet probe D). Add the controller cases: what was held before the first `setAccount(null)` survives it; an account to `null` still drops (`zzReviewHeld` PROBE 1 and 2).
  2. **Opus m1:** pin `finish`'s "no track, no event" guard (`entrySave.ts:105`). Give the track-less case `recordAnalytics()` and assert there is no `record_saved`. Kills M2.
  3. **Opus m2:** pin that "Use yours" reports the server's copy (`recordActions.ts:376`): a server copy with another category, a refused edit that changes only the amount, and the server's key asserted. Kills M3.
  4. **Sonnet m1:** pin `kind` for income and transfer at the four call sites (Quick add's save, History's delete and undo, Recently deleted, the record screen's Restore). Kills K1 to K4.
  5. **Sonnet n2:** in `deviceSync.ts`, call `report(outcome)` before the analytics, or in a `finally`, so the diary's lock on `signed_out` never waits behind analytics code. One case.
  6. **Not in this round,** for the controller's followups: n1 (the record screen's `deleted` keeps the kind) goes to P2-T26 and P2-T27; n2 and n4 (pacing and `offline`) go to the owner's dashboards (Q7); n3 (the stale comment in `spendMediaPermissionTelemetry.ts`) goes to the next task that edits it; the Sonnet n1 dev-only note is not taken.
- **P22. The base is `78f91ca5`, with no merge.** The fix commit goes on top of PR #444's reviewed head, and the controller merges the integration branch up afterwards. Nothing merged since the PR's base (`0b66c92c`) touches this round's files: the integration head (`f1ecc8bf` when the planner checked) added only #441 (`ui/dateStep*`, `wallet/outside/*`) and controller state. The planner proved every stage in `PL/tree`, a `git archive 78f91ca5` with `.claude/` removed and its own `npm ci --ignore-scripts` (1416 packages, the lockfile equal to the worktree's). The kit holds no git repository: the apply check ran with `GIT_CEILING_DIRECTORIES` in a folder it then removed.
- **P23. M1 (R119.1): the Opus form.** `controller.ts` gets `keepHeld = accountId === undefined || (accountId === null && id !== null)`. The Sonnet form (`accountId === undefined || accountId === null`) behaves the same: `setAccount` returns before this line when the account does not change, so `null` to `null` never reaches it. The Opus form says the intent in the line itself ("no one yet, then someone"), so it is used, as R119 asks. Only the launch's `undefined` to `null` changes: it now keeps what is held. Pinned by:
  - `controller.test.ts`: "what was held before the launch's first answer survives it, also when no one is signed in, and is sent after a sign-in and a yes" (PROBE 1, which fails at RED), and "signing out still drops what was held, so the next sign-in starts with nothing (P14, L4)" (PROBE 2, which passes before and after);
  - `appAnalytics.render.test.tsx`, through the real `AnalyticsUpkeep` and install on a phone with a key: "a signed-out first launch keeps the step tracked before the install, and sends it after the sign-in and a yes" (the Opus `zzReviewEarly` and the Sonnet probe D, which fails at RED), and the restored-session control (which passes before and after).
  - Mutants F1 (the first round's rule, through the controller case) and F1u (the same, through `AnalyticsUpkeep`), F2 (only the very first answer keeps) and F3 (every change keeps).
- **P24. Opus m1 (R119.2).** `entrySave.render.test.tsx`'s track-less case installs `recordAnalytics()` and, once the diary keeps the save, asserts that nothing named `record_saved` was sent. A module-level `restoreAnalytics`, run in the file's `afterEach`, puts the previous controller back (the pattern `AnalyticsUpkeep.render.test.tsx` uses), so the case keeps its shape. Kills OM2 (the review's M2).
- **P25. Opus m2 (R119.3).** A record-screen case in the `conflict` area: another phone moves the rent to Food (the server's version 2), this phone changes only the amount on version 1, the edit is refused, and "Use yours" lands. The record then has Food and ฿12,000.00, and the one `record_edited` carries `category_key: 'food'`, the server copy's. Kills OM3 (the review's M3).
- **P26. Sonnet m1 (R119.4).** Each site gets a non-expense case. Quick add saves an income (Salary) and then a move (`['income', 'salary']`, `['transfer', null]`). History deletes the move and undoes it (`record_deleted` and `undo_used`, both `transfer`, no category). Recently deleted restores a move deleted yesterday (`transfer`). The record screen restores the September salary deleted yesterday (`income`). Each checks the JSON holds none of its fixture's amounts or names. Kills K1 to K4.
- **P27. Sonnet n2 (R119.5): `report(outcome)` first.** In `reportingSyncEvents`, the diary's `report` runs before the events; the events and `previous` follow. Pinned by `deviceSync.render.test.tsx`'s "the diary hears each outcome before that outcome's events go out": the diary records how many events were sent when it heard each outcome (`[['waiting', 0], ['signed_out', 1]]`). D2 and D3 are re-pointed at the new order; D5 (the first round's order) is the new mutant.
- **P28. Not in this round (R119.6).** Opus n1 and Sonnet n3 (the record screen's `deleted` keeps the kind) go to P2-T26 and P2-T27; Opus n2 and Sonnet n4 (a 429 inside one failure episode counted twice; `offline` read as "not yet synced") go to the owner's dashboards (Q7); Opus n3 (the stale comment in `spendMediaPermissionTelemetry.ts`) goes to the next task that edits it; Sonnet n1 is not taken. The receipt names each.
- **P29. The receipts.** The planner wrote both, with the numbers this brief expects; you copy them in Step 5 and check them by checksum. `1D-T7.md` gains one line after Status, pointing to the fix round; its other lines stay true once M1 is fixed. `1D-T7-fix.md` is the round's receipt in the house style. Every number in it is an Expected line below: if one of your runs differs, you stop BLOCKED before the commit, so the receipt you commit is true.
- **P30. RED needs no stub.** The new cases use nothing `78f91ca5`'s code does not export. So RED is the round's eight test files over `78f91ca5`'s code: `typecheck:app` exits 0 (`PL/proof/red-typecheck.log`), and 3 cases fail, each on an `AssertionError`: the launch case in `controller.test.ts`, the signed-out first launch in `appAnalytics.render.test.tsx`, and `deviceSync`'s order. The other new cases pass at RED by design: they pin code that is already right (the sign-out, the restored session, the server copy, the four kinds, the track-less save).
- **P31. 76 mutants: 75 killed, QE equivalent.** The first round's 65 (`PL/mutants.py`, with D2 and D3 re-pointed at the new order), F1, F1u, F2 and F3 (P23), D5 (P27), and the reviews' survivors OM2, OM3, K1, K2, K3 and K4. Every kill is on an assertion; QE, the plan's equivalent mutant, survives as in the first round. The run takes about 75 seconds.
- **P32. The gate (R100, "as before").** `typecheck:app`; the four routes tests, each file named (`SpendRoutes`, `AccountRoutes`, `InsightsRoutes`, `PlanningRoutes`); `test:app`; `test:unit` (the Hermes guards); `git diff --check`. No route, app entry or catalogue section changes, so no `typecheck:routes`, `export:web` or kit render files. CI runs the full render suite and its sections, the exports, the database suites and `test:ops`.
- **P33. Commit.** One commit on `78f91ca5`: `Keep what the launch held until the answer, and let the diary hear each sync outcome first`, with the body in Step 7 and the trailer `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

---

## Step 1: Check the base

1. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 status --short`. Expected: no output.
2. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 rev-parse --short HEAD`. Expected: `78f91ca5`. Then `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 branch --show-current`. Expected: `p1/1d-t7-app-events`.
3. `mkdir -p /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix`
4. The kit, checked from PL:
   ```bash
   cd /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix-planner && shasum -a 256 -c SHA256SUMS > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/kit-sums.log 2>&1; rc=$?; echo "rc=$rc"; grep -c ': OK$' /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/kit-sums.log
   ```
   Expected: `rc=0` and `73`.
5. The base files:
   ```bash
   cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix-planner/base-check.sha256
   ```
   Expected: 11 `OK` lines, exit 0. Then `ls /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7/docs/implementation/receipts/1D-T7-fix.md`. Expected: "No such file or directory".
6. `ls /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7/node_modules/.package-lock.json`. Expected: the path is printed. Only if it is missing: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 && npm ci --ignore-scripts --no-audit --no-fund > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/npm-ci.log 2>&1; echo $?`. Expected: 0.
7. The focused base:
   - `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 && npm run typecheck:app > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/base-typecheck.log 2>&1; echo $?`. Expected: 0.
   - `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7/apps/app && node scripts/test-unit.mjs src/analytics/controller.test.ts > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/base-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 36`, `ℹ pass 36`, `ℹ fail 0`.
   - `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/analytics/appAnalytics.render.test.tsx src/sync/deviceSync.render.test.tsx src/screens/redesign/entry/entrySave.render.test.tsx src/screens/redesign/QuickAddScreen.render.test.tsx src/screens/redesign/RecordScreen.render.test.tsx src/screens/redesign/HistoryScreen.render.test.tsx src/screens/redesign/RecentlyDeletedScreen.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/base-render.log 2>&1; echo $?`. Expected: 0, `Test Files  7 passed (7)`, `Tests  212 passed (212)`.

   Compare with `PL/proof/base-typecheck.log`, `base-unit.log` and `base-render.log`.

## Step 2: RED (the round's eight test files over `78f91ca5`'s code)

1. Place them:
   ```bash
   /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix-planner/place.sh red /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7
   ```
   Expected: 9 lines: 8 that name a file (`red: real/...`), then `red: 8 files placed`. Then:
   ```bash
   cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix-planner/red-check.sha256
   ```
   Expected: 10 `OK` lines, exit 0.
2. The RED typecheck: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 && npm run typecheck:app > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/red-typecheck.log 2>&1; echo $?`. Expected: 0.
3. The Node file:
   ```bash
   cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7/apps/app && node scripts/test-unit.mjs src/analytics/controller.test.ts > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/red-unit.log 2>&1; echo "rc=$?"; grep -E "^ℹ (tests|pass|fail) " /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/red-unit.log; grep -c "AssertionError \[ERR_ASSERTION\]" /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/red-unit.log
   ```
   Expected: `rc=1`, `ℹ tests 38`, `ℹ pass 37`, `ℹ fail 1`, and `1`. The failing case (`grep -E "^✖ " .../red-unit.log`): "what was held before the launch's first answer survives it, also when no one is signed in, and is sent after a sign-in and a yes".
4. The seven render files:
   ```bash
   cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/analytics/appAnalytics.render.test.tsx src/sync/deviceSync.render.test.tsx src/screens/redesign/entry/entrySave.render.test.tsx src/screens/redesign/QuickAddScreen.render.test.tsx src/screens/redesign/RecordScreen.render.test.tsx src/screens/redesign/HistoryScreen.render.test.tsx src/screens/redesign/RecentlyDeletedScreen.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/red-render.log 2>&1; echo "rc=$?"; grep -E "Tests  " /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/red-render.log; grep -c "^AssertionError" /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/red-render.log; grep -cE "^(TypeError|ReferenceError|SyntaxError|Error|TestingLibraryElementError):|Cannot find module|Failed to resolve|Unhandled" /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/red-render.log
   ```
   Expected: `rc=1`, `Tests  2 failed | 218 passed (220)`, `2`, and `0`. The two failing cases (`grep -E "^ +× " .../red-render.log`), each on an `AssertionError`:
   - `appAnalytics.render.test.tsx`, "a signed-out first launch keeps the step tracked before the install, and sends it after the sign-in and a yes": `expected [ 'private', 'first_coffee' ] to deeply equal [ 'coffee', 'private', 'first_coffee' ]`;
   - `deviceSync.render.test.tsx`, "the diary hears each outcome before that outcome's events go out": `expected [ [ 'waiting', 1 ], …(1) ] to deeply equal [ [ 'waiting', +0 ], …(1) ]`.

   Compare with `PL/proof/red-typecheck.log`, `red-unit.log` and `red-render.log`.

## Step 3: GREEN

1. Place the code:
   ```bash
   /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix-planner/place.sh green /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7
   ```
   Expected: 11 lines: 10 that name a file (`green: real/...`), then `green: 10 files placed`.
2. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 status --short`. Expected: these ten lines, in any order, and nothing else:
   ```
    M apps/app/src/analytics/appAnalytics.render.test.tsx
    M apps/app/src/analytics/controller.test.ts
    M apps/app/src/analytics/controller.ts
    M apps/app/src/screens/redesign/HistoryScreen.render.test.tsx
    M apps/app/src/screens/redesign/QuickAddScreen.render.test.tsx
    M apps/app/src/screens/redesign/RecentlyDeletedScreen.render.test.tsx
    M apps/app/src/screens/redesign/RecordScreen.render.test.tsx
    M apps/app/src/screens/redesign/entry/entrySave.render.test.tsx
    M apps/app/src/sync/deviceSync.render.test.tsx
    M apps/app/src/sync/deviceSync.ts
   ```
3. The two code changes, for reference (`PL/diffs/` has every diff):
   ```diff
   --- a/apps/app/src/analytics/controller.ts
   +++ b/apps/app/src/analytics/controller.ts
        async setAccount(id) {
          if (id === accountId) return;
   -      const keepHeld = (accountId === undefined || accountId === null) && id !== null;
   +      // What is held comes from the onboarding and the sign-in that led here (L4). The
   +      // launch's first answer keeps it, also when no one is signed in yet, and so does
   +      // signing in; a sign-out (an account to null) and a switch (A to B) drop it (R119).
   +      const keepHeld = accountId === undefined || (accountId === null && id !== null);
   ```
   ```diff
   --- a/apps/app/src/sync/deviceSync.ts
   +++ b/apps/app/src/sync/deviceSync.ts
      return (outcome) => {
   +    report(outcome);
        for (const event of syncEvents(previous, outcome)) {
          if (event.name === 'sync_failed') trackSyncFailed({ reasonCode: event.properties.reason_code });
          else trackResyncRequired();
        }
        previous = outcome;
   -    report(outcome);
      };
   ```
   (`deviceSync.ts`'s comment above the function also gains two lines.)
4. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 && npm run typecheck:app > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/green-typecheck.log 2>&1; echo $?`. Expected: 0.
5. The Node file: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7/apps/app && node scripts/test-unit.mjs src/analytics/controller.test.ts > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/green-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 38`, `ℹ pass 38`, `ℹ fail 0`.
6. The seven render files: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/analytics/appAnalytics.render.test.tsx src/sync/deviceSync.render.test.tsx src/screens/redesign/entry/entrySave.render.test.tsx src/screens/redesign/QuickAddScreen.render.test.tsx src/screens/redesign/RecordScreen.render.test.tsx src/screens/redesign/HistoryScreen.render.test.tsx src/screens/redesign/RecentlyDeletedScreen.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/green-render.log 2>&1; echo $?`. Expected: 0, `Test Files  7 passed (7)`, `Tests  220 passed (220)`, and `grep -c "^stderr" /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/green-render.log` gives 0.

   Compare with `PL/proof/green-*.log`.

## Step 4: Mutation check

Run the 76 mutants (nothing else may run meanwhile):
```bash
cd /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix-planner && python3 -I mutants.py --tree /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 --out /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/mutants > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/mutants.out 2>&1; echo "rc=$?"; tail -1 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/mutants.out; grep -c "killed (assertion)" /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/mutants.out; grep -c "restored sha256 equal" /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/mutants.out
```
Expected: `rc=0`, last line `75 of 75 killed; equivalent ['QE']; survivors []; not restored []`, then `75` and `76`. The one line without "killed (assertion)" is `QE SURVIVED (equivalent, as the plan says): ...` (P31). The planner's run took 75 seconds. Compare with `PL/proof/mutants.out`. Then `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 status --short`. Expected: the same ten lines as Step 3.2.

## Step 5: The receipts

1. Place them:
   ```bash
   /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix-planner/place.sh receipt /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7
   ```
   Expected: `receipt: real/docs/implementation/receipts/1D-T7.md`, `receipt: real/docs/implementation/receipts/1D-T7-fix.md` and `receipt: 2 files placed`. Do not edit them; your logs in S back their counts.
2. Every file in its final form:
   ```bash
   cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix-planner/real-check.sha256
   ```
   Expected: 12 `OK` lines, exit 0.
3. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 status --short`. Expected: the ten lines of Step 3.2, plus ` M docs/implementation/receipts/1D-T7.md` and `?? docs/implementation/receipts/1D-T7-fix.md`, and nothing else.

## Step 6: The fast local gate (R100)

1. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 && npm run typecheck:app > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/gate-typecheck.log 2>&1; echo $?`. Expected: 0.
2. The four routes tests, each named:
   ```bash
   cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/gate-routes.log 2>&1; echo $?
   ```
   Expected: 0, `Test Files  4 passed (4)`, `Tests  17 passed (17)`.
3. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 && npm run test:app > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/gate-test-app.log 2>&1; echo $?`. Expected: 0.
4. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 && npm run test:unit > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t7-fix/gate-test-unit.log 2>&1; echo $?`. Expected: 0. Write no totals into anything (R100).
5. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 diff --check`. Expected: no output, exit 0.
6. CI runs the rest: the full render suite and sections 1 to 3, `export:web` and the iOS export, the database suites and `test:ops`.

## Step 7: Commit

1. Stage exactly the round's files:
   ```bash
   /usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 add apps/app/src/analytics/appAnalytics.render.test.tsx apps/app/src/analytics/controller.test.ts apps/app/src/analytics/controller.ts apps/app/src/screens/redesign/HistoryScreen.render.test.tsx apps/app/src/screens/redesign/QuickAddScreen.render.test.tsx apps/app/src/screens/redesign/RecentlyDeletedScreen.render.test.tsx apps/app/src/screens/redesign/RecordScreen.render.test.tsx apps/app/src/screens/redesign/entry/entrySave.render.test.tsx apps/app/src/sync/deviceSync.render.test.tsx apps/app/src/sync/deviceSync.ts docs/implementation/receipts/1D-T7-fix.md docs/implementation/receipts/1D-T7.md
   ```
2. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 diff --cached --name-only`. Expected: exactly these 12 lines, in this order (the same as `PL/proof/staged-order.txt`):
   ```
   apps/app/src/analytics/appAnalytics.render.test.tsx
   apps/app/src/analytics/controller.test.ts
   apps/app/src/analytics/controller.ts
   apps/app/src/screens/redesign/HistoryScreen.render.test.tsx
   apps/app/src/screens/redesign/QuickAddScreen.render.test.tsx
   apps/app/src/screens/redesign/RecentlyDeletedScreen.render.test.tsx
   apps/app/src/screens/redesign/RecordScreen.render.test.tsx
   apps/app/src/screens/redesign/entry/entrySave.render.test.tsx
   apps/app/src/sync/deviceSync.render.test.tsx
   apps/app/src/sync/deviceSync.ts
   docs/implementation/receipts/1D-T7-fix.md
   docs/implementation/receipts/1D-T7.md
   ```
   Then `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 diff --cached --check`. Expected: no output, exit 0.
3. Commit with three `-m` flags (git puts a blank line between them): the summary, a short body, and the trailer naming the model you run as. For Claude Haiku 5.5:
   ```bash
   /usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 commit -m "Keep what the launch held until the answer, and let the diary hear each sync outcome first" -m "The launch's first account answer keeps the events held before it, also when no one is signed in yet, so onboarding's first step reaches PostHog after the sign-in and a yes; a sign-out and an account switch still drop them. The device sync hands each outcome to the diary before its events. Tests pin a save without a track sending nothing, Use yours reporting the server copy's category, and the kind of an income and a move at Quick add, History, Recently deleted and the record screen." -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
   ```
   Expected: one new commit on `p1/1d-t7-app-events`, on top of `78f91ca5`.
4. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 status --short`. Expected: no output. Then `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t7 log --oneline -2`. Expected: your commit, then `78f91ca5 Send the phase 1 app events once each, from the rules that save, delete, restore and undo`.

## Your final message

Per the protocol: `STATUS: DONE` or `STATUS: BLOCKED` on the first line; the commit SHA and branch (on `78f91ca5`, no merge); the 12 files; RED (1 of 38 Node, 2 of 220 render, all assertions) and GREEN counts; `75 of 75 killed` with QE equivalent; each gate command's result; CI items; and what the reviewer should look at first: the held rule in `controller.ts` (P23) and its two pins through `AnalyticsUpkeep`, and the new order in `deviceSync.ts` (P27).

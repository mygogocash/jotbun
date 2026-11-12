# Brief 1D-T11 fix round: the vault doubles forward the new call, the off header as a list, and the privacy path's pins

You are the fixer for the 1D-T11 fix round. PR #445 (branch `p1/1d-t11-server-events`, head `6390b20a`) adds the server events and the analytics id. CI is red, 8 of 9: the Edge Worker job's `test:edge:workers` fails 3 of 825 cases (`Tests 3 failed | 821 passed | 1 todo (825)`, three unhandled `TypeError: The RPC receiver does not implement the method "bind"`), so CI skipped `build:edge` and `test:edge:db`. Both reviews say **Needs fixes**, with the same blocker:
- `reviews/1D-T11.md` (Opus): the blocker, m1, m2, n1 and n2;
- `reviews/1D-T11-second.md` (Sonnet): B1 and m1, with five mutants M-A to M-E.

The controller ruled **R121** (quoted in P14 below). The planner wrote every file below and proved it in a scratch copy of `6390b20a` (`git archive 6390b20a`, its own `npm ci`):
- before: CI's failure reproduced (3 failed of 111 in the three files the blocker names);
- RED: the round's four test files over `6390b20a`'s code, with no stub. `typecheck:edge` exits 0, and 1 of 159 cases fails, on an `AssertionError`;
- GREEN: 159 of 159;
- 51 mutants, all killed by assertions;
- R100's fast local gate.

You copy the planner's files, check them by checksum, prove the before state, RED, GREEN and the mutants in the worktree, run the gate, place the two receipts and commit. The planner wrote both receipts; you copy them and do not edit them. Do exactly what this brief says.

Read first:
1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only, and no whole-suite total as an expected value. R87 applies: the round's receipt is its own new file, `docs/implementation/receipts/1D-T11-fix.md`, and `1D-T11.md` takes one line pointing to it; do not edit `premium-progress.md`.
2. The reviews: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/1D-T11.md` and `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/1D-T11-second.md`.
3. The first round's brief, `/Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/1D-T11.md`. Its rulings P1 to P13 stand, except where this brief's P14 to P24 change them.

## Paths and rules

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t11` (branch `p1/1d-t11-server-events`, head `6390b20a`, installed). Work only here. Do not merge the integration branch into it: the controller merges up (P15).
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t11-fix`, your scratch folder. Create it with `mkdir -p`. Your logs go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t11-fix-planner`, the planner's folder. Read it and run its scripts; never write into it. It holds:
  - `real/`: the round's seven files at their repo paths (five code and test files, `1D-T11.md` with its new line, `1D-T11-fix.md`);
  - `orig/`: the six of them that `6390b20a` has, as it has them; `diffs/`: one unified diff per modified file (`orig/` to `real/`, `<path with / as _>.diff`); the Appendix prints them;
  - `files.txt` (every path, with M or A and what RED holds), `base-check.sha256` (the six base files by hash) and `base-absent.txt` (the new receipt's path, which must not exist yet);
  - scripts: `place.sh` (puts the RED, GREEN or receipt files in place, as `files.txt` says; its `base` stage is the planner's own reset, never run it), `locked.sh` (runs one command under the heavy lock), `mutants.py` (the 51 mutants), `killcheck.sh` (every failing case of every kill is an `AssertionError`), `applycheck.sh` (the diffs rebuild `real/`, no whitespace errors) and `make-sums.sh` (the planner's checksums);
  - `proof/` (the planner's runs and mutant results);
  - `SHA256SUMS` (35 lines: every kit input, script and non-log proof file) and `SHA256SUMS.logs` (the `.log` files). Check `SHA256SUMS` as a gate.
  - If PL is missing or a line of `PL/SHA256SUMS` does not answer `OK`, stop: BLOCKED.
  - `PL/tree/` and `PL/checks/` are the planner's scratch copies (the tree's `node_modules` are deleted). Never run anything in them.
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above: type them out. Git: `/usr/bin/git -C WT <command>`, one git command per call. The shell is zsh: `status` is read-only there, so keep an exit code in `rc` (`cmd; rc=$?`), and never name a variable `path`.
- **The heavy lock** wraps every run that starts workerd (`test/workers/*.test.ts`) and the mutant run. `PL/locked.sh <log> <dir> <command...>` takes it, runs the command in `<dir>` with its output in `<log>`, and gives it back however the command ends; it prints `locked`, then `exit <n>; unlocked`. Do not take the lock around it. `PL/mutants.py` calls `locked.sh` for each workers mutant: do not take the lock around it either. If you take the lock by hand: `until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done` before, `rmdir /private/tmp/claude-501/jotbun-heavy.lock` after, after a failure too. Never remove a lock you did not take.
- **R100: do not run whole suites locally** (`npm run test:edge:workers`, the full render suite, database suites, `test:ops`, `export:web`). Run only what this brief names. CI runs the rest.
- Run one step at a time. Never run a test while the mutant runner (Step 5) is running: it changes the code files while it runs.
- **Load flakes:** the machine is shared. If a case times out under load in a file this round does not touch, rerun that file alone once and record both runs. The five focused files run in about 15 seconds.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests, code or receipts to make them pass.
- Every count you report comes from your own log in S. Never copy the planner's logs in place of one.

## Scope

| File | Change |
| --- | --- |
| `apps/edge/src/v1/handler.ts` | `analyticsOff` reads the header as a list: a request is off when any comma-separated value, trimmed and lower-cased, is `off` (P17). +7 and −2 lines. |
| `apps/edge/test/workers/server-events.test.ts` | 7 new cases (19 before, 26 after) and the header comment (P17 to P19). +149 lines. |
| `apps/edge/test/workers/ai.test.ts` | `recordingVault` records and forwards `callWithAnalytics` as it does `call` (P16). +9 lines. **Outside the first round's list; R121.1 widens the scope to it.** |
| `apps/edge/test/workers/attachments.test.ts` | `preparesSeen` forwards `callWithAnalytics` unbound (P16). +2 lines. **Widened (R121.1).** |
| `apps/edge/test/workers/download-aborts.test.ts` | The same line in its copy of `preparesSeen` (P16). +2 lines. **Widened (R121.1).** |
| `docs/implementation/receipts/1D-T11.md` | One line after Status, pointing to the fix round (P23). |
| `docs/implementation/receipts/1D-T11-fix.md` | **New**: the round's receipt (R87), written by the planner with the proven numbers (P23). |

Not in this round (R121.5, for the controller's followups): the second review's notes for 1D-T13 and P6C (the anonymous counts go whatever the consent), the dashboards (`failure` threaded through Worker routes), later person-level events (the shared transport) and the SDK's wire format. No other file changes: no production file but `handler.ts`, no package or lockfile, no `vitest.workers.config.ts`, no `premium-progress.md`.

## Planner rulings (what this round decides, with the reason for each)

- **P14. R121, the controller's ruling of 13 November, quoted:**
  1. **The blocker (both reviews): the scope widens to three test files outside the task's list.** The files: `apps/edge/test/workers/ai.test.ts`, `attachments.test.ts` and `download-aborts.test.ts`. Their `Proxy` doubles over `env.VAULT` intercept only `call` and bind every other member, so they cannot carry `callWithAnalytics`. In `recordingVault`, record and forward `callWithAnalytics` as `call` is. In both `preparesSeen` doubles, forward it unbound. No production change. Keep `callWithAnalytics`, which the plan names. Run those three files focused, under the lock. CI shows the rest. If one shared helper under `test/workers/support/` is simpler and safe, say so. Otherwise keep the three small branches, and record the shared helper as a followup.
  2. **The privacy-path pins, all in the task's own files:** the Worker's never-throws guards, `sendServerEvents` and `countWorkerFailure` (Opus m1, Sonnet M-C and M-D); the `RESYNC_REQUIRED` code check on a 410 (Opus m2 RP3, Sonnet M-E); the off header on what a reply says (Sonnet M-A, plan Review Focus 2); a failed consent read failing closed (Sonnet M-B). One case and one mutant per guard.
  3. **Opus n1:** treat the request as off when any comma-separated token of the off header, trimmed and lower-cased, is `off` (fail closed). Pin it.
  4. **Opus n2:** pin P8 (the client is built only when there is something to send; RP7).
  5. **Not in this round,** for the controller's followups: the Sonnet notes for 1D-T13 and P6C (anonymous counts whatever the consent), the dashboards (`failure` threading), the later person-level events (the shared transport), and the SDK's wire format.
- **P15. The base is `6390b20a`, with no merge.** The fix commit goes on top of PR #445's reviewed head, and the controller merges the integration branch up afterwards. The planner proved every stage in `PL/tree`, a `git archive 6390b20a` with `.claude/` removed and its own install (`npm ci --ignore-scripts`, 1416 packages; `npm run install:edge`, 248). The kit holds no git repository (`find PL -name .git` prints nothing).
- **P16. The blocker (R121.1): three small branches, no shared helper.**
  - Why it broke: `handleVaultV1` now calls `stub.callWithAnalytics`. Each double returns any member other than `call` as `value.bind(stub)`, and on a Durable Object RPC stub every property read is an RPC property, so `.bind` is itself a remote call to a method the vault lacks. The vault route through the double answers 500, and `member()` throws "accepting the terms answered 500".
  - `ai.test.ts`'s `recordingVault` gains a `callWithAnalytics` branch that pushes `structuredClone(call)` to the log, awaits `s.callWithAnalytics(call)`, runs `after`, and returns what it answered: the double exists to log every vault call the Worker makes, and a vault route's call now arrives that way, so its log reads as it did before 1D-T11.
  - Both `preparesSeen` doubles gain `if (p === 'callWithAnalytics') return (call: VaultCall) => s.callWithAnalytics(call)` before the `.bind` fall-through. `download-aborts.test.ts` passed on `6390b20a` only because its wrapped front door serves Worker routes alone (their steps still go through `call`); it gets the line so the next vault route through it cannot fail the same way.
  - A shared helper would be safe but not simpler here: it would rewrite all three doubles (each records or inspects something different) and add a support file, in three files outside the task. R121 lets this round keep the three branches; the helper (forward every member as a call, `(...args) => stub[p](...args)` or `Reflect.apply`, never `.bind`) is recorded in the receipt as a followup.
  - The branches have no mutant: they are test doubles, not guards. Their proof is CI's failure, reproduced on `6390b20a` (Step 2) and gone at RED and GREEN.
- **P17. The off header as a list (R121.3).**
  - `analyticsOff` reads the header once; the request is off when `header !== null` and any value of `header.split(',')`, trimmed and lower-cased, is `off`. Two `X-GoGoSpend-Analytics` lines reach the Worker as one list (`off, off`), which the first round read as on. It fails closed: `on, Off` is off. A list with no value that is exactly `off` (`on, offline`) is not off. The app sends one `off` (`apps/app/src/api/client.ts` line 347), so nothing changes for it.
  - The case: "an off header sent twice, or as a list, still says off: any value, trimmed and in any case (R121.3)". Two appended lines (`off`, `off`, checked as `off, off`) and `on, Off` send nothing; `on, offline` sends one `record_saved`. It is the round's one RED.
  - Mutants: F7 (one value), F8 (the first value only), F9 (values not trimmed), F10 (a value that only contains `off`), and the first round's H2 re-pointed at the new line (only a lower-case `off`).
- **P18. The privacy path's pins (R121.2), one case and one mutant per guard.** Each pins code that was already right on `6390b20a`, so each passes at RED (P20):
  - **`sendServerEvents` never throws** (Opus m1 and RP6, Sonnet M-C): "a port that throws while sending never changes a committed create, and is logged by its class name only". A port whose `captureImmediate` throws a `TypeError` with a Thai message and an amount: the create answers 201, and the only `server_events_failed` line is `{"level":"error","event":"server_events_failed","failure":"TypeError"}`; neither the Thai text nor `1,234` is logged. Mutant F1 drops the catch: the create answers 500.
  - **`countWorkerFailure` never throws** (Opus m1 and RP5, Sonnet M-D): "an analytics client that cannot be built never changes the Worker's own 500 problem". An `analytics` dep that throws, and a Worker route that throws (the catalogue): the answer is still the 500 `INTERNAL_ERROR` problem, with one `server_events_failed` line naming `RangeError`. Mutant F2 drops the catch, and `handleVaultV1` rejects instead of answering; the case reads the request as `.then(answer, () => 'rejected')`, so that is an assertion failure, not an error.
  - **A 410's code** (Opus m2 and RP3, Sonnet M-E): "a 410 that is not RESYNC_REQUIRED (a create of a purged id) sends no resync_required". The record's head is written as purged the way the heads' triggers allow (it enters active at the current revision, then moves forward), so a create of that id answers 410 `ENTITY_PURGED` and sends nothing; then a stale cursor's 410 on the same front door sends one `resync_required`. Mutant F3 drops the code check.
  - **The off header on what a reply says** (Sonnet M-A; plan Review Focus 2): "the off header also stops what a reply says: a stale cursor and a failing sync read send nothing under the person". With the person's yes and the request marked off, a stale cursor's 410 and a failing `sync.changes` (500) send only the anonymous count; the same stale read, not marked off, sends `resync_required`. Mutant F4 applies the header to the vault's events only.
  - **A failed consent read fails closed** (Sonnet M-B): "a failed consent read fails closed: the failed create is counted, and nothing is sent under the person". With the consents table gone, the create's own policy check fails (500), and so does the consent read after it; only the anonymous count is sent, with one `vault_analytics_failed` line. Mutant F5 makes the failed read answer yes, and a `sync_failed` goes out.
- **P19. P8 pinned (R121.4):** "a call with nothing to send builds no client (P8)". The test counts the `analytics` dep's calls: 0 after the setup, a wallet list and an analytics answer; 1 after a create by a person who said yes. Mutant F6 (the first review's M4) builds the client for every call.
- **P20. RED needs no stub.** The new cases use nothing `6390b20a`'s code does not export. RED is the round's four test files over `6390b20a`'s `handler.ts`: `typecheck:edge` exits 0, and of the five focused files' 159 cases, 1 fails, on an `AssertionError` (P17's case). The six pins of P18 and P19 pass at RED, and so do the three doubles' files: their fix is in the test files.
- **P21. 51 mutants, all killed by assertions.** The first round's 41 (`scratch/1d-t11-planner/mutants.py`), with H2 re-pointed at the new `analyticsOff`; F1 to F6 (P18, P19); F7 to F10 (P17). `killcheck.sh` checks every failing case of every kill is an `AssertionError`, with no other error and nothing unhandled. The run takes about 3.5 minutes.
- **P22. The gate (R100 and R121).** `typecheck:edge`; the five focused workers files under the lock (`server-events`, `live`, `ai`, `attachments`, `download-aborts`); `test:edge`; `build:edge`, with PostHog's EU host in the bundle; `git diff --check`. CI runs the rest, and this time must show the whole `test:edge:workers`, `build:edge` and `test:edge:db`, which it did not finish on `6390b20a`.
- **P23. The receipts.** The planner wrote both, with the numbers this brief expects; you copy them in Step 6 and check them by `cmp`. `1D-T11.md` gains one line after Status (as `1D-T7.md` did), pointing to `1D-T11-fix.md`. Every number in `1D-T11-fix.md` is an Expected line below: if one of your runs differs, you stop BLOCKED before the commit, so the receipt you commit is true.
- **P24. Commit.** One commit on `6390b20a`, with the message in Step 8 and the trailer `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

---

## Step 1: Check the base

1. `/usr/bin/git -C WT status --short`. Expected: no output.
2. `/usr/bin/git -C WT rev-parse --short HEAD`. Expected: `6390b20a`. Then `/usr/bin/git -C WT branch --show-current`. Expected: `p1/1d-t11-server-events`.
3. `mkdir -p S`
4. The kit:
   ```bash
   cd PL && shasum -a 256 -c SHA256SUMS > S/kit-sums.log 2>&1; rc=$?; echo "rc=$rc"; grep -c ': OK$' S/kit-sums.log
   ```
   Expected: `rc=0` and `35`.
5. The base files:
   ```bash
   cd WT && shasum -a 256 -c PL/base-check.sha256
   ```
   Expected: six `OK` lines, exit 0. Then:
   ```bash
   cd WT && for f in $(cat PL/base-absent.txt); do test -e "$f" && echo "EXISTS $f"; done; echo checked
   ```
   Expected: only `checked`.
6. The install is there:
   ```bash
   ls WT/node_modules/.package-lock.json WT/apps/edge/node_modules/posthog-node/package.json
   ```
   Expected: both paths are printed. If either is missing: `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?` and `cd WT && npm run install:edge > S/install-edge.log 2>&1; echo $?`. Expected: 0 each.
7. Base typecheck:
   ```bash
   cd WT && npm run typecheck:edge > S/base-typecheck-edge.log 2>&1; echo "rc=$?"
   ```
   Expected: `rc=0`.

## Step 2: Before: CI's failure, reproduced

```bash
PL/locked.sh S/base-widened.log WT/apps/edge npx vitest run --config vitest.workers.config.ts --reporter=verbose test/workers/ai.test.ts test/workers/attachments.test.ts test/workers/download-aborts.test.ts; rc=$?; echo "rc=$rc"
grep -E "Tests  |Errors  " S/base-widened.log; grep -c 'does not implement the method "bind"' S/base-widened.log
```
Expected: `locked`, `exit 1; unlocked`, `rc=1`, `Tests  3 failed | 108 passed (111)`, `Errors  3 errors` and `3`. The failing cases (`grep -E "^ +× " S/base-widened.log`) are `ai.test.ts`'s "a signed-out session with a malformed body gets 422, …" and "a signed-in person without consent who sends a malformed body gets 422, …", and `attachments.test.ts`'s "a second request for an image whose copy is held only waits, until the first attaches the receipt both then hold". This is not RED: it is the failure this round removes (P16).

## Step 3: RED (the round's four test files over `6390b20a`'s code)

1. Place them:
   ```bash
   PL/place.sh red WT
   ```
   Expected: 5 lines: `red: real/apps/edge/test/workers/server-events.test.ts`, `red: real/apps/edge/test/workers/ai.test.ts`, `red: real/apps/edge/test/workers/attachments.test.ts`, `red: real/apps/edge/test/workers/download-aborts.test.ts`, then `red: 4 files placed` (compare with `PL/proof/red-place.out`). `handler.ts` and the receipts are not touched.
2. The RED typecheck:
   ```bash
   cd WT && npm run typecheck:edge > S/red-typecheck-edge.log 2>&1; echo "rc=$?"
   ```
   Expected: `rc=0`.
3. The five focused files (LOCKED):
   ```bash
   PL/locked.sh S/red-workers.log WT/apps/edge npx vitest run --config vitest.workers.config.ts --reporter=verbose test/workers/server-events.test.ts test/workers/live.test.ts test/workers/ai.test.ts test/workers/attachments.test.ts test/workers/download-aborts.test.ts; rc=$?; echo "rc=$rc"
   grep -E "Tests  " S/red-workers.log; grep -c "^AssertionError" S/red-workers.log; grep -cE "^(TypeError|ReferenceError|SyntaxError|RangeError|Error):" S/red-workers.log
   ```
   Expected: `locked`, `exit 1; unlocked`, `rc=1`, `Tests  1 failed | 158 passed (159)`, `1` and `0`. The one failing case (`grep -E "^ +× " S/red-workers.log`) is `server-events.test.ts`'s "an off header sent twice, or as a list, still says off: any value, trimmed and in any case (R121.3)", with `AssertionError: expected [ { …(3) }, { …(3) } ] to deeply equal []`. The three doubles' files pass (P20).

## Step 4: GREEN

1. Place the code:
   ```bash
   PL/place.sh green WT
   ```
   Expected: 6 lines: `green: real/apps/edge/src/v1/handler.ts`, the four test files as in Step 3.1 but with `green:`, then `green: 5 files placed` (compare with `PL/proof/green-place.out`).
2. The GREEN typecheck:
   ```bash
   cd WT && npm run typecheck:edge > S/green-typecheck-edge.log 2>&1; echo "rc=$?"
   ```
   Expected: `rc=0`.
3. The five focused files (LOCKED):
   ```bash
   PL/locked.sh S/green-workers.log WT/apps/edge npx vitest run --config vitest.workers.config.ts --reporter=verbose test/workers/server-events.test.ts test/workers/live.test.ts test/workers/ai.test.ts test/workers/attachments.test.ts test/workers/download-aborts.test.ts; rc=$?; echo "rc=$rc"
   grep -E "Test Files  |Tests  " S/green-workers.log
   for f in server-events live ai attachments download-aborts; do echo "$f: $(grep -cE "^ +✓ test/workers/$f.test.ts" S/green-workers.log)"; done
   ```
   Expected: `exit 0; unlocked`, `rc=0`, `Test Files  5 passed (5)`, `Tests  159 passed (159)`, then `server-events: 26`, `live: 22`, `ai: 43`, `attachments: 61`, `download-aborts: 7`.

## Step 5: Mutation check

```bash
cd PL && python3 -I mutants.py --tree WT --out S/mutants > S/mutants.out 2>&1; echo "rc=$?"; tail -1 S/mutants.out; grep -c "killed (assertion)" S/mutants.out
PL/killcheck.sh S/mutants
```
Expected: `rc=0`, last line `51 of 51 killed; survivors []; not restored []`, `51`, then `killcheck: ok (51 logs)`. It runs 49 workers mutants, each under the lock (48 against `server-events.test.ts`, 1 against `live.test.ts`), and 2 Node mutants against `route-coverage.test.ts`; the planner's run took 194 seconds without waits. Compare `S/mutants.out` with `PL/proof/mutants.out`: the same 52 lines, in this order:
```
A1 killed (assertion): a person never asked reads as no [events]
A2 killed (assertion): a no reads as yes [events]
A3 killed (assertion): the weeks round to the nearest week [events]
A4 killed (assertion): no bound of 1040 weeks [events]
A5 killed (assertion): a sign-up time in the future gives negative weeks [events]
A6 killed (assertion): an unreadable sign-up time is not 0 weeks [events]
A7 killed (assertion): every route counts its records, not only transactions.create (Q16) [events]
A8 killed (assertion): every version of a record counts, not only its first [events]
A9 killed (assertion): a change in any state counts, not only an active one [events]
A10 killed (assertion): a change of any entity counts, not only a transaction [events]
A11 killed (assertion): the range includes its start (the revision before the call) [events]
A12 killed (assertion): the range has no end [events]
A13 killed (assertion): a transfer sends a category [events]
A14 killed (assertion): the category's built-in key is never read [events]
A15 killed (assertion): another account's consent is read [events]
A16 killed (assertion): a failed analytics read fails the call [events]
A17 killed (assertion): the events are read up to the revision before the call [events]
A18 killed (assertion): edits count as record_saved (the plan's mutant) [events]
U1 killed (assertion): a deliberate refusal carries a failure name [events]
U2 killed (assertion): the error's message is the failure (the plan's mutant) [events]
U3 killed (assertion): nothing is read after the block [events]
H1 killed (assertion): the off header is ignored (the plan's mutant) [events]
H2 killed (assertion): only a lower-case off counts [events]
H3 killed (assertion): events are sent for anyone who did not say no [events]
H4 killed (assertion): without the key the analytics answer is 503 (the plan's mutant) [events]
H5 killed (assertion): a stale cursor sends nothing [events]
H6 killed (assertion): a failure on the outbox routes sends no sync_failed [events]
H7 killed (assertion): a failure on any route sends sync_failed [events]
H8 killed (assertion): sync.changes is not an outbox route [events]
H9 killed (assertion): every 5xx reply is counted as a failure (the plan's mutant, the reply) [events]
H10 killed (assertion): a failure is counted only for a person who said yes [events]
H11 killed (assertion): a vault failure is never counted [events]
H12 killed (assertion): every 5xx in the Worker is counted (the plan's mutant, the Worker) [events]
H13 killed (assertion): every error that is not a ProblemException is counted [events]
H14 killed (assertion): an unexpected Worker exception is never counted [events]
H15 killed (assertion): the vault's analytics reach the phone's reply [events]
H16 killed (assertion): the analytics answer is the vault's alone, with no analytics id [events]
H17 killed (assertion): the vault's record_saved events are dropped [events]
R1 killed (assertion): the analytics route is not an added route [node]
R2 killed (assertion): the analytics route is public [node]
L1 killed (assertion): the work after a call can throw (the 1D-T10 review's G1) [live]
F1 killed (assertion): sendServerEvents can throw (the reviews' M1 and M-C) [events]
F2 killed (assertion): countWorkerFailure can throw (the reviews' M2 and M-D) [events]
F3 killed (assertion): any 410 is a resync_required, not only RESYNC_REQUIRED (the reviews' M3 and M-E) [events]
F4 killed (assertion): the off header stops only the vault's events, not what a reply says (the second review's M-A) [events]
F5 killed (assertion): a failed consent read answers yes (the second review's M-B) [events]
F6 killed (assertion): the client is built for every call, with nothing to send (P8; the first review's M4) [events]
F7 killed (assertion): the off header is read as one value [events]
F8 killed (assertion): only the off header's first value counts [events]
F9 killed (assertion): the off header's values are not trimmed [events]
F10 killed (assertion): a value that only contains off counts as off [events]
51 of 51 killed; survivors []; not restored []
```
Then:
```bash
/usr/bin/git -C WT status --short
```
Expected: exactly five lines, each ` M`: `apps/edge/src/v1/handler.ts`, `apps/edge/test/workers/ai.test.ts`, `apps/edge/test/workers/attachments.test.ts`, `apps/edge/test/workers/download-aborts.test.ts`, `apps/edge/test/workers/server-events.test.ts`.

## Step 6: The receipts

```bash
PL/place.sh receipts WT
```
Expected: `receipts: real/docs/implementation/receipts/1D-T11.md`, `receipts: real/docs/implementation/receipts/1D-T11-fix.md` and `receipts: 2 files placed`. Do not edit them; your logs in S back their counts. Then check all seven files against the kit:
```bash
cd PL && for f in $(grep -v '^#' files.txt | awk '{print $3}'); do cmp -s "real/$f" "WT/$f" || echo "DIFFERS $f"; done; echo compared
```
Expected: only `compared`.

## Step 7: The fast local gate (R100)

1. `cd WT && npm run typecheck:edge > S/gate-typecheck-edge.log 2>&1; echo "rc=$?"`. Expected: `rc=0`.
2. `cd WT && npm run test:edge > S/gate-test-edge.log 2>&1; echo "test:edge rc=$?"`. Expected: `test:edge rc=0`. Write no totals into the receipt (R100).
3. The build, and PostHog in the Worker bundle:
   ```bash
   cd WT && npm run build:edge > S/gate-build-edge.log 2>&1; echo "build:edge rc=$?"
   grep -q "eu.i.posthog.com" WT/apps/edge/dist/server/index.js && echo bundled
   ```
   Expected: `build:edge rc=0`, then `bundled`. (`dist/` is git-ignored.)
4. `/usr/bin/git -C WT diff --check`. Expected: no output, exit 0.
5. The five focused files ran in Steps 3 and 4 on these files. CI runs the rest (P22).

## Step 8: Commit

1. Stage the seven files:
   ```bash
   /usr/bin/git -C WT add apps/edge/src/v1/handler.ts apps/edge/test/workers/server-events.test.ts apps/edge/test/workers/ai.test.ts apps/edge/test/workers/attachments.test.ts apps/edge/test/workers/download-aborts.test.ts docs/implementation/receipts/1D-T11.md docs/implementation/receipts/1D-T11-fix.md
   ```
2. `/usr/bin/git -C WT diff --cached --name-only`. Expected: exactly these 7 lines, in this order:
   ```
   apps/edge/src/v1/handler.ts
   apps/edge/test/workers/ai.test.ts
   apps/edge/test/workers/attachments.test.ts
   apps/edge/test/workers/download-aborts.test.ts
   apps/edge/test/workers/server-events.test.ts
   docs/implementation/receipts/1D-T11-fix.md
   docs/implementation/receipts/1D-T11.md
   ```
   Then `/usr/bin/git -C WT diff --cached --check`. Expected: no output, exit 0.
3. Commit with three `-m` flags (git puts a blank line between them):
   ```bash
   /usr/bin/git -C WT commit -m "Forward callWithAnalytics in the vault test doubles, read the off header as a list, and pin the privacy guards" -m "Three Workers test doubles over the vault binding intercepted only call and bound every other member, and on an RPC stub bind is itself a remote call, so the vault routes the Worker now sends through callWithAnalytics failed there. They forward it now, as R121 asks; no production code changes for that. A request is off when any value of its off header, trimmed and in any case, is off. Pin the guards the reviews found unpinned: the Worker's two never-throws catches, the 410's code, the off header on what a reply says, a failed consent read failing closed, and a client built only when there is something to send." -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
   ```
4. `/usr/bin/git -C WT log --oneline -2` (your commit on `6390b20a`) and `/usr/bin/git -C WT show --stat HEAD` (7 files). Then `/usr/bin/git -C WT status --short`. Expected: no output.
5. `/usr/bin/git -C WT diff --check 6390b20a HEAD`. Expected: no output, exit 0.

## Your final message

The orchestrator reads only this:
- First line: `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker and its output).
- The commit SHA and branch: `p1/1d-t11-server-events`, one commit on `6390b20a`.
- Files: 7 (`handler.ts`, `server-events.test.ts`, the three widened test files, `1D-T11.md` with one line, `1D-T11-fix.md` new); all seven equal `real/`.
- Before: 3 failed of 111, 3 `bind` errors. RED: `typecheck:edge` 0; 1 of 159 failed, on an `AssertionError`. GREEN: 159 of 159.
- Mutants: 51 killed, 0 survived; `killcheck: ok (51 logs)`.
- The gate: each command and its result (`bundled` included), with no whole-suite count (R100).
- CI: the whole `test:edge:workers`, `build:edge` and `test:edge:db` must show on the PR (P22).
- Deviations: none from the brief's rulings (or each, with why).
- For the reviewer, first: the three doubles (P16), the off header as a list (P17), and how the never-throws cases turn a rejection into an assertion (P18).

---

## Appendix: the diffs

Each is the `PL/diffs/` file (the receipts' new file is in `PL/real/`).

`apps/edge/src/v1/handler.ts`:
```diff
--- a/apps/edge/src/v1/handler.ts
+++ b/apps/edge/src/v1/handler.ts
@@ -203,9 +203,14 @@
   return []
 }

-/** `X-GoGoSpend-Analytics: off`, which the phone sends unless its answer is yes (L4), stops server events for this request. */
+/**
+ * `X-GoGoSpend-Analytics: off`, which the phone sends unless its answer is yes (L4), stops server events for this
+ * request. It fails closed: any comma-separated value, trimmed and in any case, that is `off` counts, since a
+ * header sent twice reaches the Worker as one list (`off, off`).
+ */
 function analyticsOff(request: Request): boolean {
-  return request.headers.get('x-gogospend-analytics')?.toLowerCase() === 'off'
+  const header = request.headers.get('x-gogospend-analytics')
+  return header !== null && header.split(',').some((value) => value.trim().toLowerCase() === 'off')
 }

 /**
```

`apps/edge/test/workers/ai.test.ts`:
```diff
--- a/apps/edge/test/workers/ai.test.ts
+++ b/apps/edge/test/workers/ai.test.ts
@@ -912,6 +912,15 @@
                   return reply
                 }
               }
+              // A vault route's call (1D-T11): recorded and forwarded as `call` is. Never `.bind`: on an RPC stub that is a remote call.
+              if (p === 'callWithAnalytics') {
+                return async (call: VaultCall) => {
+                  log.push(structuredClone(call))
+                  const answered = await s.callWithAnalytics(call)
+                  if (after) await after(call)
+                  return answered
+                }
+              }
               const value = Reflect.get(s, p)
               return typeof value === 'function' ? value.bind(s) : value
             },
```

`apps/edge/test/workers/attachments.test.ts`:
```diff
--- a/apps/edge/test/workers/attachments.test.ts
+++ b/apps/edge/test/workers/attachments.test.ts
@@ -1691,6 +1691,8 @@
                   return reply
                 }
               }
+              // A vault route's call (1D-T11), forwarded unbound: on an RPC stub `.bind` is itself a remote call.
+              if (p === 'callWithAnalytics') return (call: VaultCall) => s.callWithAnalytics(call)
               const value = Reflect.get(s, p)
               return typeof value === 'function' ? value.bind(s) : value
             },
```

`apps/edge/test/workers/download-aborts.test.ts`:
```diff
--- a/apps/edge/test/workers/download-aborts.test.ts
+++ b/apps/edge/test/workers/download-aborts.test.ts
@@ -259,6 +259,8 @@
                   return reply
                 }
               }
+              // A vault route's call (1D-T11), forwarded unbound: on an RPC stub `.bind` is itself a remote call.
+              if (p === 'callWithAnalytics') return (call: VaultCall) => s.callWithAnalytics(call)
               const value = Reflect.get(s, p)
               return typeof value === 'function' ? value.bind(s) : value
             },
```

`apps/edge/test/workers/server-events.test.ts`:
```diff
--- a/apps/edge/test/workers/server-events.test.ts
+++ b/apps/edge/test/workers/server-events.test.ts
@@ -10,6 +10,11 @@
 // would send, and no analytics secret is set in vitest.workers.config.ts.
 // Every case that checks nothing is sent also checks that something is sent
 // once the condition is lifted, so no case passes before the code exists.
+// The fix round (R121) adds the reviews' pins: the off header as a list and on
+// what a reply says, a 410 that is not RESYNC_REQUIRED, the Worker's two
+// never-throws guards, a client built only when there is something to send
+// (P8), and a failed consent read failing closed. They pin code that was
+// already right, but for the off header's list.
 import { randomUUID } from 'node:crypto'
 import { describe, expect, it, vi } from 'vitest'

@@ -272,6 +277,54 @@
     await saved(client, user, wallet)
     await r.settled()
     expect(r.sent.map((message) => message.event)).toEqual(['record_saved'])
+  })
+
+  it('an off header sent twice, or as a list, still says off: any value, trimmed and in any case (R121.3)', async () => {
+    const r = recording()
+    const client = await frontDoor(r)
+    const { user, wallet } = await ledger(client)
+    await answer(client, user, true)
+    // Two header lines reach the Worker as one list.
+    const twice = new Headers({ ...(await signedHeaders(user)), 'idempotency-key': randomUUID(), 'x-gogospend-command-schema': '1', 'content-type': 'application/json' })
+    twice.append('x-gogospend-analytics', 'off')
+    twice.append('x-gogospend-analytics', 'off')
+    expect(twice.get('x-gogospend-analytics')).toBe('off, off')
+    expect((await client.raw(new Request(`${BASE}/v1/transactions`, { method: 'POST', headers: twice, body: JSON.stringify(lunch(user, wallet)) }))).status).toBe(201)
+    await saved(client, user, wallet, { 'x-gogospend-analytics': 'on, Off' })
+    await r.settled()
+    expect(r.sent).toEqual([])
+    // A list with no value that is off is not off.
+    await saved(client, user, wallet, { 'x-gogospend-analytics': 'on, offline' })
+    await r.settled()
+    expect(r.sent.map((message) => message.event)).toEqual(['record_saved'])
+  })
+
+  it('the off header also stops what a reply says: a stale cursor and a failing sync read send nothing under the person', async () => {
+    const r = recording()
+    const client = await frontDoor(r)
+    const { user } = await ledger(client)
+    await answer(client, user, true)
+    await sqlExec(user, 'UPDATE sync_state SET pruned_through = revision WHERE id = 1')
+    const stale = `${BASE}/v1/sync/changes?cursor=${encodeURIComponent(encodeSyncCursor(user.sub, '0'))}`
+    const read = async (extra: Record<string, string>): Promise<Response> => client.raw(new Request(stale, { headers: { ...(await signedHeaders(user)), ...extra } }))
+    expect((await read({ 'x-gogospend-analytics': 'off' })).status).toBe(410)
+    const changes = vi.spyOn(VAULT_HANDLERS, 'sync.changes').mockImplementation(() => {
+      throw new SyntaxError('the read failed')
+    })
+    try {
+      await quietly(async () => {
+        expect((await read({ 'x-gogospend-analytics': 'off' })).status).toBe(500)
+      })
+    } finally {
+      changes.mockRestore()
+    }
+    await r.settled()
+    // The failure is counted, anonymously; nothing goes under the person.
+    expect(r.sent.map((message) => message.event)).toEqual(['$exception'])
+    // The same stale read, not marked off: resync_required.
+    expect((await read({})).status).toBe(410)
+    await r.settled()
+    expect(r.sent.map((message) => message.event)).toEqual(['$exception', 'resync_required'])
   })

   it('an edit, a delete or an import is not a record_saved', async () => {
@@ -306,6 +359,25 @@
     expect(r.sent).toEqual([{ distinctId: await hmacOf(user.sub), event: 'resync_required', properties: { reason_code: 'RESYNC_REQUIRED', origin: 'server' } }])
   })

+  it('a 410 that is not RESYNC_REQUIRED (a create of a purged id) sends no resync_required', async () => {
+    const r = recording()
+    const client = await frontDoor(r)
+    const { user, wallet } = await ledger(client)
+    await answer(client, user, true)
+    // A record whose head is purged: the head enters active, then moves forward to purged (the heads' triggers).
+    const purged = randomUUID()
+    await sqlExec(user, "INSERT INTO entity_heads (entity, entity_id, version, state, revision) VALUES ('transaction', ?, 1, 'active', (SELECT revision FROM sync_state WHERE id = 1))", purged)
+    await sqlExec(user, "UPDATE entity_heads SET version = 2, state = 'purged', revision = (SELECT revision FROM sync_state WHERE id = 1) WHERE entity = 'transaction' AND entity_id = ?", purged)
+    expect(await json(await record(client, user, lunch(user, wallet, { id: purged })))).toMatchObject({ status: 410, body: { code: 'ENTITY_PURGED' } })
+    await r.settled()
+    expect(r.sent).toEqual([])
+    // A stale cursor's 410 on the same front door is a resync_required.
+    await sqlExec(user, 'UPDATE sync_state SET pruned_through = revision WHERE id = 1')
+    expect((await client.as(user).get(`/v1/sync/changes?cursor=${encodeURIComponent(encodeSyncCursor(user.sub, '0'))}`)).status).toBe(410)
+    await r.settled()
+    expect(r.sent.map((message) => message.event)).toEqual(['resync_required'])
+  })
+
   it("a vault failure on the outbox's routes sends sync_failed, beside its anonymous count", async () => {
     const r = recording()
     const client = await frontDoor(r)
@@ -470,7 +542,76 @@
       }
     }
     expect(Object.keys(analytics.body)).toEqual(['analytics_id', 'weeks_since_signup', 'consent'])
+  })
+})
+
+describe('the Worker half: what analytics may never change, and when it costs anything', () => {
+  it('a port that throws while sending never changes a committed create, and is logged by its class name only', async () => {
+    const throwing: NonNullable<V1Deps['analytics']> = (env) =>
+      createServerAnalytics(env, () => undefined, () => ({
+        captureImmediate: () => {
+          throw new TypeError('ร้านป้าแดง ฿1,234')
+        },
+      }))
+    const client = await startV1(CONFIG, { env: ON, analytics: throwing })
+    const { user, wallet } = await ledger(client)
+    await answer(client, user, true)
+    let status = 0
+    const lines = await quietly(async () => {
+      status = (await record(client, user, lunch(user, wallet))).status
+    })
+    expect(status).toBe(201)
+    expect(lines.filter((line) => line.includes('"event":"server_events_failed"'))).toEqual(['{"level":"error","event":"server_events_failed","failure":"TypeError"}'])
+    expect(lines.join('\n')).not.toContain('ร้านป้าแดง')
+    expect(lines.join('\n')).not.toContain('1,234')
   })
+
+  it("an analytics client that cannot be built never changes the Worker's own 500 problem", async () => {
+    const broken: NonNullable<V1Deps['analytics']> = () => {
+      throw new RangeError('ร้านป้าแดง ฿1,234')
+    }
+    const client = await startV1(CONFIG, { env: ON, analytics: broken })
+    const catalogue = vi.spyOn(WORKER_HANDLERS, 'bridge.catalogue').mockImplementation(async () => {
+      throw new TypeError('the catalogue failed')
+    })
+    let outcome: { status: number | 'rejected'; code?: unknown } = { status: 'rejected' }
+    let lines: string[] = []
+    try {
+      lines = await quietly(async () => {
+        // A request that rejects instead of answering is an assertion failure here, not an error.
+        outcome = await client.raw(new Request(`${BASE}/v1/bridge/gogocash/catalogue`)).then(
+          async (res) => ({ status: res.status, code: (await json(res)).body.code }),
+          () => ({ status: 'rejected' as const }),
+        )
+      })
+    } finally {
+      catalogue.mockRestore()
+    }
+    expect(outcome).toEqual({ status: 500, code: 'INTERNAL_ERROR' })
+    expect(lines.filter((line) => line.includes('"event":"server_events_failed"'))).toEqual(['{"level":"error","event":"server_events_failed","failure":"RangeError"}'])
+    expect(lines.join('\n')).not.toContain('ร้านป้าแดง')
+  })
+
+  it('a call with nothing to send builds no client (P8)', async () => {
+    const r = recording()
+    let built = 0
+    const client = await startV1(CONFIG, {
+      env: ON,
+      analytics: (env) => {
+        built += 1
+        return r.analytics(env)
+      },
+    })
+    const { user, wallet } = await ledger(client)
+    await answer(client, user, true)
+    expect((await client.as(user).get('/v1/wallets')).status).toBe(200)
+    expect((await client.as(user).get('/v1/me/analytics')).status).toBe(200)
+    expect(built).toBe(0)
+    await saved(client, user, wallet)
+    expect(built).toBe(1)
+    await r.settled()
+    expect(r.sent.map((message) => message.event)).toEqual(['record_saved'])
+  })
 })

 describe('the vault half', () => {
@@ -485,6 +626,21 @@
     expect(lines.join('\n')).not.toContain('consents')
   })

+  it('a failed consent read fails closed: the failed create is counted, and nothing is sent under the person', async () => {
+    const r = recording()
+    const client = await frontDoor(r)
+    const { user, wallet } = await ledger(client)
+    await answer(client, user, true)
+    // Without the consents table the create's own policy check fails (500), and so does the read after it.
+    await sqlExec(user, 'DROP TABLE consents')
+    const lines = await quietly(async () => {
+      expect((await record(client, user, lunch(user, wallet))).status).toBe(500)
+    })
+    await r.settled()
+    expect(r.sent.map((message) => message.event)).toEqual(['$exception'])
+    expect(lines.filter((line) => line.includes('"event":"vault_analytics_failed"'))).toHaveLength(1)
+  })
+
   it("callWithAnalytics answers call()'s reply, with the consent read after the block and no failure for a refusal", async () => {
     const client = await frontDoor(recording())
     const user = newUser()
```

`docs/implementation/receipts/1D-T11.md`:
```diff
--- a/docs/implementation/receipts/1D-T11.md
+++ b/docs/implementation/receipts/1D-T11.md
@@ -1,6 +1,7 @@
 # 1D-T11: Server events and the analytics id

 - **Status:** built and verified locally on `p1/1d-t11-server-events`, from `origin/claude/p1a-vault-core` with P3-T7 merged (#435). Not pushed. Under R87 this receipt is its own file; `premium-progress.md` is not edited. Under R100 whole suites are CI's (the full workers suite, the full render suite and its sections, the exports and the database suites). No Expo route, app entry, config or app file changed, so `typecheck:routes`, `export:web` and the app's suites are not in the local gate. Privacy path (PostHog EU, consent): the controller's Opus review and a Sonnet second review follow this receipt.
+- **Fix round (R121):** CI's workers suite failed 3 cases on this commit (`6390b20a`): three test doubles over `env.VAULT` could not forward `callWithAnalytics`. The fix round forwards it in them, reads the off header as a list, and pins the privacy path's guards the reviews found unpinned: `receipts/1D-T11-fix.md`.
 - **Delivers:** plan 1D's L5 and L6 (spec §7; decided Q5, Q13, Q16).
   - `GET /v1/me/analytics` answers exactly `{ analytics_id, weeks_since_signup, consent }`: the lowercase hex HMAC-SHA256 of the account id under `ANALYTICS_ID_KEY` (null while the key is unset), the whole weeks since sign-up on the vault's clock (an integer from 0 to 1040), and `yes`, `no` or `unasked` from the vault's `('analytics', 0)` consents row. It never answers 404 but for a missing route (followups, 1D-T11's line). `/v1/me` keeps its v1 shape (C2).
   - After a vault call the Worker sends PostHog a `record_saved` (`kind`, and `category_key` as a built-in key or `custom`; a transfer sends its kind only) for each record a `transactions.create` committed, read from the change log by a revision range; `resync_required` for a 410 `RESYNC_REQUIRED`; and `sync_failed` for a 500 `INTERNAL_ERROR` on `transactions.create` or `sync.changes`. These go under the analytics id, with `origin: 'server'`, only when the person said yes, the request does not carry `X-GoGoSpend-Analytics: off` and `ANALYTICS_ID_KEY` is set. Imports, edits, deletes and resent commands never count.
```

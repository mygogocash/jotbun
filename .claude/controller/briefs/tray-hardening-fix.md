# Brief tray-hardening fix round: read the render's `shown` in iOS's late dismissal, and pin three more rules (review m-1, m-2, n-1, n-2)

You are the fixer for the tray-hardening fix round. PR #392 (branch `fix/tray-hardening`, head `784667b`) hardens the Bun Wallet's tray. The Sonnet review approved it (`reviews/tray-hardening.md`: no blocker or major, two minors and three nits), and the controller folds four of its findings into the same PR before it merges (CI cannot run yet: GitHub Actions is paused for billing):

- **m-1 (code):** iOS's late `onDismiss` guard read a ref of `shown` that a passive effect refreshes. `Modal.js` calls `onDismiss` in the layout phase of the commit that renders UIKit's end, before that commit's effects, so a reopen batched into that commit still said the tray closed. The guard now reads this render's `shown`, and the `showing` ref goes.
- **m-2, n-1, n-2 (cases):** nothing moves while the card leaves (mutant X1 survived); the tick effect's `hidden` dependency (D2 survived); an iOS tray with no `onClosed` (X4 survived).
- **n-3 stays a note** for P2-T16; nothing is built for it here.

You merge today's base, copy two files from the planner's kit, prove them (RED, GREEN, 40 mutants, R100's fast gate), add a fix-round section to the receipt and commit. The planner proved every step on `784667b` merged with today's `origin/claude/p1a-vault-core` (`d1111f8`, which holds #391), and a rehearsal ran this brief's Steps 1.3 to 7 on a git copy of that merge. Do exactly what this brief says.

Read first:
1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100: run only the fast local gate (Step 5), never the full render suite or the iOS export, and write no whole-suite total. R87: your receipt is `docs/implementation/receipts/tray-hardening.md`, which exists; you add to it, and you do not edit `premium-progress.md`.
2. The review: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/tray-hardening.md`: m-1 (lines 36 to 45), m-2 (47 to 51), n-1 (55 to 57), n-2 (59 to 61), n-3 (63 to 67) and "Notes for later tasks" (105 to 116).
3. The first round's brief, whose rules stay in force except where this brief's rulings say otherwise: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/tray-hardening.md` (P3 and P4 on m2, P5 on the drag reset, P6 on the tick, P10 on the test seams).

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/tray-hardening` (branch `fix/tray-hardening`, head `784667b`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/tray-hardening-fix`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/tray-hardening-fix-planner`, the planner's kit. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the final `apps/app/src/wallet/tray/Tray.tsx` and `Tray.render.test.tsx`;
  - `orig/`: the three tray files as `784667b` has them (`Tray.tsx`, `Tray.render.test.tsx`, `trayGesture.test.ts`). `orig/`'s `Tray.tsx` is the RED form: the fix adds no export, so `784667b`'s file is already the compile-safe seam the new case fails against;
  - `diffs/`: `apps_app_src_wallet_tray_Tray.tsx.diff` and `apps_app_src_wallet_tray_Tray.render.test.tsx.diff`, each turning `orig/` into `real/` byte for byte, for reading only (the appendix holds the same bytes);
  - `probes/`: the review's `reviewProbe.render.test.tsx` (19 cases) and the first round's two probe files, for the reviewer. Never copy them into WT;
  - `tools/`: `mutants.py` (the mutant runner), `prove.sh` and `run-all.sh` (the planner's stages), `killers.py` (every case each mutant fails), `rehearse.sh` (this brief's steps, rehearsed), `sums.sh`, and `brief.template.md` with `fill_brief.py`, which fills in `mutant-table.md`, `receipt-section.md` and `commit-message.txt`;
  - `logs/`: see "For the controller";
  - checksums with paths relative to WT, for `shasum -a 256 -c` run from WT, three tray files each: `SHA256SUMS.base` (as `784667b` has them), `SHA256SUMS.red` (the final test file, `784667b`'s `Tray.tsx` and Node test) and `SHA256SUMS.real` (the final state); and `SHA256SUMS`, the kit's own (paths under PL; the `*.log` files are in `SHA256SUMS.logs`, not in it);
  - `work/`: the planner's proof tree, outside the sums.
- Every shell call starts in a fresh directory, so type full paths.
  - Git: `/usr/bin/git -C WT <command>`, one git command per call.
  - npm: `cd WT && npm run <script>`.
  - The Node file: `cd WT/apps/app && npm run test:unit -- src/wallet/tray/trayGesture.test.ts`.
  - Render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose <files>`.

  Below, WT, S and PL stand for those full paths: type the full path.
- No database or workers suite runs, so there is no lock to take. Docker stays stopped.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass.
  - The one exception is a case that times out under load in a file this task does not touch (a known flake, protocol). Rerun that file alone once; if it passes alone, record both runs and go on.

## Planner rulings for this round (F1 to F10)

- **F1. m-1's fix is the review's line: `if (!shown) closed.current?.()`. The `showing` ref and its refresh go.**
  - `Modal.js` (lines 315 to 323) calls `this.props.onDismiss` from a `setState` callback, in the layout phase of the commit that renders UIKit's end, before that commit's passive effects. A reopen batched with the end (the review's R-d, R-d2, R-d3, R-d5 and R-d5b) is in that same commit. `784667b`'s ref was still the hide's (`false`), while the render's `shown` is the reopen's (`true`). `this.props.onDismiss` is read when the callback runs, so the closure that runs is the one of that commit.
  - The first round's H3 reasoning holds with it. A late end of an earlier hide that comes while the card leaves again finds `shown` true (the Modal stays shown for the exit) and says nothing; that hide's own end then says the tray closed, once. The first round's late case still pins this (H3 is killed).
  - Nothing else read `showing`, so it goes rather than stay as dead code. `closed` stays: the hide's timer fires after the effects and needs the latest `onClosed`.
  - The first brief's P3 sentence "React runs a commit's pending effects before it starts the next update" holds for sequential commits only; F1 replaces it. P4's third reason (a held `shown` would mount the card twice) is withdrawn, as the review showed; P4 stands on its first two.
  - `dismissed` still calls `closed.current`: the `onClosed` that the commit before the end's left. It differs from the render's `onClosed` only when a host passes a new one in the very commit that carries the end. Note for P2-T16: keep `whenClosed`'s queue in a ref, not in state a closure holds.
- **F2. The test file's Modal seam now ends a held dismissal as `Modal.js` does.**
  - `IosModal` is a class with `Modal.js`'s own `isRendered` state, set true when `visible` turns true, as `Modal.js`'s `componentDidUpdate` does. `dismissals.end` calls `setState({ isRendered: false }, callback)`, and the callback calls the latest `this.props.onDismiss`.
  - A `forwardRef` wrapper passes the tray's `ref` to react-native-web's Modal, so the web's focus case still focuses the Modal's own layer.
  - With `late` false nothing changes for the other cases: react-native-web's own `onDismiss` calls straight through. `endDismissal()` ends a held dismissal inside its own `act`, alone in its commit, as the first round's late case expects.
- **F3. m-1's case keeps R-d5b's order, with both updates pending before React renders, inside one `act`.**
  - UIKit's end, then a tap on the host's add button, queued inside one `act`, so React renders them in one commit: the commit the review's R-d5b reaches. `Modal.js`'s callback then runs in that commit's layout phase, before its effects. The add button is a DOM `button`: its click is a discrete React event, as a tap is.
  - The review's R-d5b queues the two as `setTimeout` tasks on React's own scheduler. Written that way, the case depends on React not rendering the end between the two tasks. In the planner's first full run it did so once: mutant H3 failed the case in one of its two runs (`PL/logs/superseded/run-1-two-tasks/`). When it does, the end comes before the reopen, the tray has rightly closed, and the case would fail on correct code too. In one `act` nothing runs between the two: on `784667b`'s code the case failed in 8 of 8 runs and on the fix it passed in 15 of 15 (`PL/logs/superseded/flake-one-act/`), and the full run's two mutant runs print the same lines. The review's own R-d5b, on two tasks, passes on the fix (`PL/logs/green-probes.log`).
- **F4. m-2's case:** a swipe past the line, the host closes the tray, and the frame stays where the finger let go as the card leaves, 100 ms on, and when the cover comes and goes during the exit (the review's D-a and D-b in one case). The card is gone during the exit, so `leavingFrame()` finds the frame beside the backdrop. It kills X1.
- **F5. n-1's case:** open, cover, a step change under the cover, the cover lifts on that same step (no tick), then a step change ticks once (the review's T-b). It kills D2. The full-motion case already kills D1.
- **F6. n-2's case:** iOS, no `onClosed`: close, hide, end the dismissal (`expect(() => endDismissal()).not.toThrow()`), and the tray opens again. It kills X4 on its assertion: the `TypeError` comes back through `act`.
- **F7. RED.** m-1's case fails on `784667b`'s `Tray.tsx`. The three other new cases pin code that is already right, so they pass there by design (as the first round's n3, m5 and m6 pins did), and fail instead on their mutants X1, D2 and X4, each on an assertion (Step 4).
- **F8. The mutants: 40.** The first round's 34, with H2, H3 and H4 written again for the new guard: H4 was "the ref is never refreshed", and no ref is left, so H4 is now "the guard keeps the first render's `shown`" (a callback never renewed). H12 is `784667b`'s ref, for m-1. X1, D2 and X4 are the review's survivors. D1 and X2 are the two effects' other dependencies (the review's, killed already). Each runs against both of the tray's test files; a second run printed the same 41 lines byte for byte.
- **F9. The base.** `784667b` sits on `ecc00b7`. Today's base, `d1111f8`, adds #391 (`apps/app/src/wallet/looks/WalletLooksProvider.tsx`, its test and its receipt) and controller state, and shares no file with this branch. Every `mountWallet` mount reads #391's provider, so the planner proved on `784667b` merged with `d1111f8`: there, `784667b`'s own files pass 22 of 22 and 4 of 4, and the review's probe file fails R-d, R-d2, R-d3, R-d5 and R-d5b exactly as the review recorded.
- **F10. Not in this round:** n-3 (a note for P2-T16: an `onClosed` twice for two hides, and none for a Modal that never presented); `trayGesture.test.ts`, `trayGesture.ts` and every other file. For CI: render +0 files and +4 cases (`Tray.render.test.tsx`, 22 to 26); `test:unit`, `test:app`, web and iOS +0.

---

## Step 1: Sync, install and check the base

1. `/usr/bin/git -C WT status --short` prints nothing, and `/usr/bin/git -C WT rev-parse --short HEAD` prints `784667b`.
2. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: a clean merge, with no conflict. Then:
   - `/usr/bin/git -C WT rev-parse --short HEAD`, and record it (the merge commit);
   - `/usr/bin/git -C WT diff --stat 784667b HEAD -- apps packages package.json package-lock.json`. Expected: exactly `apps/app/src/wallet/looks/WalletLooks.render.test.tsx` and `apps/app/src/wallet/looks/WalletLooksProvider.tsx` (#391). If it lists more, another task has merged since `d1111f8`: list them in the receipt, and go on only if none is under `apps/app/src/wallet/tray/`, `apps/app/src/wallet/testing/` or `apps/app/src/ui/`; otherwise stop: BLOCKED, with the list.
3. `mkdir -p S`, then `cd WT && shasum -a 256 -c PL/SHA256SUMS.base > S/base-check.txt 2>&1; echo exit=$?`. Expected: `exit=0` and three `OK` lines.
4. `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo exit=$?`. Expected: `exit=0`. The worktree may come installed; running it again is safe.
5. The base:
   - `cd WT/apps/app && npm run test:unit -- src/wallet/tray/trayGesture.test.ts > S/base-unit.log 2>&1; echo exit=$?`. Expected: `exit=0`, `ℹ tests 4`, `ℹ pass 4`, `ℹ fail 0`.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/tray/Tray.render.test.tsx > S/base-render.log 2>&1; echo exit=$?`. Expected: `exit=0`, and `grep -E "^ +Tests " S/base-render.log` prints `      Tests  22 passed (22)`.

## Step 2: The test file and RED

1. `cp PL/real/apps/app/src/wallet/tray/Tray.render.test.tsx WT/apps/app/src/wallet/tray/Tray.render.test.tsx` (type the full paths). `Tray.tsx` stays as `784667b` has it: that is its RED form.
2. `/usr/bin/git -C WT status --short --untracked-files=all`. Expected: exactly ` M apps/app/src/wallet/tray/Tray.render.test.tsx`, and nothing else.
3. `cd WT && shasum -a 256 -c PL/SHA256SUMS.red`. Expected: 3 `OK` lines, exit 0.
4. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo exit=$?`. Expected: `exit=0`.
5. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/tray/Tray.render.test.tsx > S/red-render.log 2>&1; echo exit=$?`. Expected: `exit=1`, and:
   - `grep -E "^ +Tests " S/red-render.log` prints `      Tests  1 failed | 25 passed (26)`;
   - `grep "×" S/red-render.log` prints exactly one line: ` × src/wallet/tray/Tray.render.test.tsx > on iOS a dismissal that ends in the commit that opens the tray again says nothing`, then its time;
   - `grep '^AssertionError' S/red-render.log` prints exactly `AssertionError: onClosed while the tray is open: expected "vi.fn()" to not be called at all, but actually been called 1 times`;
   - `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|TypeError|ReferenceError' S/red-render.log` prints `0`.

   The three other new cases pass here by design (F7).

## Step 3: The fix and GREEN

1. `cp PL/real/apps/app/src/wallet/tray/Tray.tsx WT/apps/app/src/wallet/tray/Tray.tsx`. Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.real`. Expected: 3 `OK` lines, exit 0.
2. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo exit=$?`. Expected: `exit=0`.
3. The Node file, as in Step 1.5, into `S/green-unit.log`. Expected: `exit=0`, `ℹ tests 4`, `ℹ pass 4`, `ℹ fail 0`.
4. The render file, as in Step 2.5, into `S/green-render.log`. Expected: `exit=0`, `      Tests  26 passed (26)`, and `grep -c '^stderr |' S/green-render.log` prints `0`.
5. The catalogue's wallet sections, the tray's only host:
   ```
   cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-" > S/green-catalogue.log 2>&1; echo exit=$?
   ```
   Expected: `exit=0`, `Test Files  2 passed (2)`, and a `Tests` line that starts `Tests  18 passed`. Ignore the `skipped` count: it moves with the head.

## Step 4: Mutation check

Run the planner's runner once. It applies each mutant alone to its file in WT (`Tray.tsx`, or `dev/catalogue/wallet/index.ts` for K1 and K2), runs both of the tray's test files, restores the file and checks its SHA-256:

```
MUTANT_LOGS=S/mutant-logs python3 -I PL/tools/mutants.py WT > S/mutants.out 2> S/mutants.err; echo exit=$?
```

Type the full paths. To check first that every pattern matches once, run `python3 -I PL/tools/mutants.py WT --check` (40 `APPLIES` lines, exit 0).

Expected: `exit=0`, and:
- `grep -c " KILLED: " S/mutants.out` prints `40`, and `grep -c "restored=True" S/mutants.out` prints `40`;
- `diff S/mutants.out PL/logs/mutants.out` prints nothing: each mutant fails the same cases as in the planner's run.

It takes two minutes or more, by the machine's load. Then `/usr/bin/git -C WT status --short --untracked-files=all` shows exactly ` M` for `Tray.tsx` and `Tray.render.test.tsx`, and `cd WT && shasum -a 256 -c PL/SHA256SUMS.real` still prints 3 `OK` lines.

In the table, "the late case" is `on iOS a dismissal that ends after the tray is shown again says nothing; the next one says it closed` (the first round's), "m-1's case" is `on iOS a dismissal that ends in the commit that opens the tray again says nothing`, "the exit case" is `a card that leaves stays where the finger let it go, even when the lock cover comes and goes`, "the lift case" is `once the lock cover lifts a step change ticks, even when it lifted on the step it had under the cover`, and "the no-onClosed case" is `on iOS a tray with no onClosed closes, its dismissal ends, and it opens again`.

| Mutant | Change | Killed by |
| --- | --- | --- |
| H12 | the late `onDismiss`'s guard reads a ref of `shown` that an effect refreshes, as `784667b` did (m-1) | m-1's case, and only it |
| X1 | the drag is reset during the exit too, with no `if (visible)` (m-2) | the exit case, and only it |
| D2 | the tick effect without `hidden` in its dependencies (n-1) | the lift case, and only it |
| X4 | iOS's `onDismiss` calls `onClosed` with no optional chaining, so a host with none throws (n-2) | the no-onClosed case, and only it |
| D1, X2 | the tick effect without `visible`; the drag reset without `visible` | the full-motion case (D1); the swipe case `the swipe follows the finger down, ...` (X2) |
| H2, H4 | the late `onDismiss` always says the tray closed; its guard keeps the first render's `shown` (a callback never renewed) | the late case and m-1's case |
| H3 | the late `onDismiss`'s guard reads `visible`, not `shown` | the late case (`while the card leaves`) |
| H1 | under the cover the system back still asks to close (m1) | `under the lock cover nothing asks to close the tray` |
| H5 | the cover coming or going leaves a drag where it was (m3) | `a drag the lock cover cuts off is gone when the cover lifts` |
| H6, H8 | opening at another step in one render ticks; the cover lifting on another step ticks (m4) | `opening at another step in one render, or a step change under the lock cover, ticks nothing` |
| H7 | a step change under the cover ticks (m4) | that case, and the lift case |
| H9 | a step change never ticks once the tray is open (m4) | the reduced-motion and full-motion cases, that case and the lift case |
| H10, H11 | a cancelled swipe past the line closes; a cancelled swipe stays pulled down (n1) | `a swipe the system cancels springs back, even past the line` |
| B1, B4 | the `onClosed` ref is never refreshed; the hide calls the `onClosed` its effect captured (n3) | `an onClosed given while the card leaves is the one called` |
| B2 | the Modal is given `onDismiss` on every platform | `the card leaves before the Modal hides, then onClosed fires once`, and n3's case |
| O1, O2, O5, O6 | a phone's card is no dialog; its dialog has no name; with a header, a phone's focus goes nowhere, or to the header (m5) | the phone case, `on a phone the card is the named dialog and the title takes focus, with or without a header; ...` |
| O7, O11 | the backdrop without `focusable={false}`; the title without `accessible: true` (m6) | the Node case `what the web drops is wired for a phone: ...` |
| R1 to R3 | the plan's three: the backdrop closes a locked tray; the Modal hides at once on close; the cover is ignored | `while locked nothing closes it, ...` and `the card leaves before the Modal hides, ...` (R1); that case, the exit case and the phone case (R2); `a hidden lock cover replaces the tray's content` and the four cover cases (R3) |
| R4, R5, R7 | a locked tray still closes; a leaving tray asks to close again; a locked swipe stays pulled down | `while locked nothing closes it, ...` (R4, R7); `the card leaves before the Modal hides, ...` (R5) |
| R13 | a reopened tray keeps the last pull | the cover's drag case and the swipe case |
| R14 to R16 | no tick on a step change; opening ticks too; a closed tray ticks | the reduced-motion and full-motion cases and the two tick cases (R14, R15); the full-motion case and the first tick case (R16) |
| R25, R26 | on iOS `onClosed` fires before the Modal has gone; on iOS it never fires | the phone case, the late case and m-1's case (R26 also the no-onClosed case) |
| K1, K2 | the tray's sections missing from the wallet list; the tray's before the kit's | `the catalogue's tray sections come after the kit's, and each tray opens at once` |

`PL/logs/killers.txt` lists every case each mutant fails.

## Step 5: The fast local gate (R100)

Run from WT, in order, and record each result. Whole-suite totals are not compared (R100): record the counts you see.

1. `cd WT && npm run typecheck:app`. Expected: exit 0.
2. The focused files: Steps 3.3, 3.4 and 3.5 again, into `S/gate-unit.log`, `S/gate-render.log` and `S/gate-catalogue.log`. Expected: as there (4 of 4; 26 of 26; 18 passed).
3. `cd WT && npm run test:app > S/test-app.log 2>&1; echo exit=$?`. Expected: `exit=0` and `ℹ fail 0`.
4. `cd WT && npm run test:unit > S/test-unit.log 2>&1; echo exit=$?`. Expected: `exit=0` and `ℹ fail 0`.
5. `/usr/bin/git -C WT diff --check; echo exit=$?`. Expected: no output and `exit=0`.

Not run here, recorded as "CI" (R100): the full `test:render` suite and the iOS export. Not run at all: `typecheck:routes` and `export:web` (no route, app config or app entry changes), the edge, API and database suites (nothing outside `apps/app` changes), and `test:ops` (no package or lockfile change).

## Step 6: Receipt

Edit `WT/docs/implementation/receipts/tray-hardening.md` with the Edit tool. Keep its style, and change nothing else in it.

1. In "What changed", replace exactly this line:
   ```
       - On iOS, `onClosed` comes from the Modal's `onDismiss` only while the Modal is hidden (`showing`, refreshed with `closed`), so a dismissal that ends after the tray was shown again says nothing, even during a second exit (m2). `shown` is not held until `onDismiss` (planner ruling P4).
   ```
   with:
   ```
       - On iOS, `onClosed` comes from the Modal's `onDismiss` only while the Modal is hidden (the render's `shown`, since the fix round below), so a dismissal that ends after the tray was shown again says nothing, even during a second exit or in the very commit that reopens it (m2). `shown` is not held until `onDismiss` (planner ruling P4).
   ```
2. Add this section at the end of the file, after one blank line. Replace every `<...>` with what you saw; if a number differs from the planner's, write yours and say why under its Deviations line.

```markdown
## Fix round: the review's m-1, m-2, n-1 and n-2

- **The review:** `.claude/controller/reviews/tray-hardening.md` (Sonnet; Approved, no blocker or major). The controller folded m-1, m-2, n-1 and n-2 into PR #392 before it merges; n-3 stays a note for P2-T16. Brief: `.claude/controller/briefs/tray-hardening-fix.md` (rulings F1 to F10).
- **Base:** `784667b` merged with `origin/claude/p1a-vault-core` at `<base>` as `<merge commit>`. It brings #391 (`apps/app/src/wallet/looks/WalletLooksProvider.tsx` and its test) <and anything else it lists>; nothing under `apps/app/src/wallet/tray/`. `shasum -a 256 -c` against the planner's `SHA256SUMS.base` printed 3 `OK` lines after the merge.
- **m-1 (code):** the late iOS dismissal's guard read a ref of `shown` that a passive effect refreshed. `Modal.js` calls `onDismiss` from a `setState` callback in the layout phase of the commit that renders UIKit's end, before that commit's effects run, so when a reopen was batched into that commit the ref still read the hide, and `onClosed` fired with the tray open (the review's R-d, R-d2, R-d3, R-d5 and R-d5b). `dismissed` now reads this render's `shown` (`if (!shown) closed.current?.()`), and the `showing` ref is gone. A new case runs the review's R-d5b order: UIKit's end, then a tap on add, both pending before React renders, so one commit holds both (queued inside one `act`, the brief's F3).
- **m-2, n-1 and n-2 (cases):** a card that leaves stays where the finger let it go, also when the lock's cover comes and goes during the exit (mutant X1); once the cover lifts on the step it had under the cover, a step change ticks (D2); on iOS a tray with no `onClosed` closes, its dismissal ends without throwing, and it opens again (X4). The test file's Modal seam now ends a held dismissal as `Modal.js` does: a `setState` callback, in the layout phase of the commit that renders it.
- **Files:** modified `apps/app/src/wallet/tray/Tray.tsx` (316 lines before, 317 after), `apps/app/src/wallet/tray/Tray.render.test.tsx` (713 before, 817 after; 22 cases before, 26 after) and this receipt. `trayGesture.test.ts` is unchanged.
- **RED to GREEN:**
  - RED (the final test file over `784667b`'s `Tray.tsx`): `typecheck:app` `<result>`; `Tray.render.test.tsx` `<counts>`; m-1's case fails on its assertion (`<n>` `AssertionError`, no module or type error). The three other new cases pass: they pin code that is right, and fail on their mutants X1, D2 and X4 instead.
  - GREEN: `typecheck:app` `<result>`; `trayGesture.test.ts` `<counts>`; `Tray.render.test.tsx` `<counts>`, no stderr; the catalogue's wallet sections `<counts>`.
- **Mutation check:** the planner's runner (`.claude/controller/scratch/tray-hardening-fix-planner/tools/mutants.py`), 40 mutants, each applied alone, run against both of the tray's test files and restored (SHA-256 checked): `<killed> killed, <survived> survived`. `S/mutants.out` `<is identical to / differs from>` the planner's `logs/mutants.out`.
  - Round one's 34, with H2, H3 and H4 written again for the new guard.
  - H12 (the guard reads a ref an effect refreshes, as `784667b` did): killed by m-1's case.
  - X1 (m-2), D2 (n-1) and X4 (n-2), the review's survivors, and D1 and X2 (the two effects' other dependencies).
- **Gate** (worktree root; R100's fast local gate; logs in `.claude/controller/scratch/tray-hardening-fix/`):
  - `typecheck:app`: `<result>`.
  - Focused: `trayGesture.test.ts` `<counts>`; `Tray.render.test.tsx` `<counts>`; the catalogue's wallet sections `<counts>`.
  - `test:app`: `<counts>`. `test:unit`: `<counts>`.
  - `git diff --check`: `<result>`. The check against `origin/claude/p1a-vault-core...HEAD` is in the final message.
  - CI (R100): the full `test:render` suite (with `Tray.render.test.tsx` at 26 cases) and the iOS export, once GitHub Actions runs again.
- **SKIPPED:** as in the first round. The device check for a quick reopen on iOS should also ask whether React Native 0.88 on Fabric gives a press a discrete lane (how likely m-1's window was).
- **Deviations:** <none, or your own>.
- **Notes for later tasks:**
  - P2-T16 (the review's n-3): on iOS `onClosed` can come twice for two hides, and not at all for a Modal that never presented. `whenClosed` treats a second call as nothing and must not wait on one call per hide; its device check should ask whether UIKit sends a dismissal for a present it refused during a dismissal under way. Keep `whenClosed`'s queue in a ref: iOS's `onClosed` is the one the commit before the end's left.
  - P2-T16: the exit position is now pinned here; its case for a swipe during a save can drive `dragThrough()`.
  - Any later change to the iOS path of `Tray.tsx`: m-1's case queues UIKit's end and the tap inside one `act`, so one commit holds both (the brief's F3). Keep it so: on two separate tasks it passes or fails by the scheduler's timing.
```

## Step 7: Commit

1. `/usr/bin/git -C WT add apps/app/src/wallet/tray/Tray.tsx apps/app/src/wallet/tray/Tray.render.test.tsx docs/implementation/receipts/tray-hardening.md`
2. `/usr/bin/git -C WT status --short`. Expected: exactly these three lines, and nothing else:
   ```
   M  apps/app/src/wallet/tray/Tray.render.test.tsx
   M  apps/app/src/wallet/tray/Tray.tsx
   M  docs/implementation/receipts/tray-hardening.md
   ```
   If anything else shows, stop and report.
3. `/usr/bin/git -C WT diff --cached --check; echo exit=$?`. Expected: no output and `exit=0`.
4. Write the message to `S/commit-message.txt` with the Write tool, then `/usr/bin/git -C WT commit -F S/commit-message.txt`:

```
Read the render's shown in the tray's late iOS dismissal; pin three more rules

The guard on iOS's late onDismiss read a ref an effect refreshes, but
Modal.js calls onDismiss in the layout phase of the commit that renders
UIKit's end, so a reopen batched into that commit still said the tray
closed. It now reads the render's shown. Pin that a leaving card keeps
its place, that a step change ticks once the cover lifts on the same
step, and that a tray with no onClosed closes on iOS. The review's m-1,
m-2, n-1 and n-2.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
```

5. `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD; echo exit=$?`. Expected: no output and `exit=0`. Then `/usr/bin/git -C WT log --oneline -3`, and record the fix commit's SHA. Do not push.

## Your final message

As the protocol says:
- `STATUS: DONE` or `STATUS: BLOCKED` first;
- the merge commit and the fix commit (SHAs) and the branch; the files;
- RED (1 failed, 25 passed) and GREEN (26 and 4) counts, and the mutants (40 killed, and whether `S/mutants.out` equals the planner's);
- each gate command with its counts;
- SKIPPED: the phone checks, `typecheck:routes`, `export:web`, the edge, API and database suites and `test:ops`; CI: the full render suite and the iOS export;
- deviations, if any.

---

## For the controller (not the fixer's)

- **Readiness.** READY. No package, lockfile, Cloudflare resource, account setting or owner answer is needed. The fixer works on top of `784667b` in the same worktree and PR (#392). The merge brings #391 only, which shares no file with the PR.
- **Size:** S. One line of code (and the `showing` ref removed), four new cases, and the Modal seam rewritten as `Modal.js` behaves.
- **Kit checks.**
  - The kit's own sums: `shasum -a 256 -c SHA256SUMS` from PL. The `*.log` files are in `SHA256SUMS.logs`, not in it.
  - `SHA256SUMS.base`, `.red` and `.real` (paths relative to WT): `784667b`'s three tray files, the RED state and the final state.
  - `PL/work/` is the planner's proof tree: `git archive d1111f8` with `784667b`'s four files laid over it (the two sides of the merge share no file since `ecc00b7`, so this is the merge's tree), plus `node_modules`. It is outside the sums.
- **The planner's logs** (in `PL/logs/`):
  - `summary.txt`: every stage of `tools/run-all.sh`, timed, with the load average.
    - The base (`784667b`'s files on the merged tree): the Node file 4 of 4, the render file 22 of 22, the catalogue's wallet sections 18, and the probes (the review's 19, the first round's 15) with R-d, R-d2, R-d3, R-d5, R-d5b and P-J failing.
    - RED: 1 failed and 25 passed of 26, one assertion, no load error.
    - GREEN: 4 of 4, 26 of 26 with no stderr, 18; on the fix the probes fail only P-J (by design, the first round's P5).
    - The mutants, twice, and the gate.
  - `base-*`, `red-*`, `green-*` and `gate-*`: each stage's own logs; `base-probes.log` and `green-probes.log`: the three probe files at the base and on the fix.
  - `mutants.out` and `mutant-logs/`: the run; `repeat/`: a second run, whose `mutants.out` is byte for byte the first's (`repeat/diff.txt` is empty); `mutants-check.out`: 40 `APPLIES`; `killers.txt`: every case each mutant fails.
  - `rehearsal.txt`: this brief's Steps 1.3 to 7, typed as written (`tools/rehearse.sh`) in a throwaway git copy of the merge's tree, deleted afterwards. Steps 1.1 and 1.2 need the real branch and remote; the receipt was a copy of `784667b`'s with Step 6's edits made by a script.
  - `superseded/run-1-two-tasks/`: the first full run, with m-1's case on two tasks and React's own scheduler. Everything held but one line: its two mutant runs differ at H3, which failed m-1's case in one of them (F3).
  - `superseded/flake-two-tasks/` and `superseded/flake-one-act/`: the runs that compared the two forms of m-1's case (F3); `superseded/tries/`: the planner's first tries.
- **The CI deltas:** render +0 files and +4 cases (`Tray.render.test.tsx` 22 to 26; 16 to 26 across both rounds); `test:unit`, `test:app`, web and iOS +0. The run that gates the merge should be a true merge with the current base, as the review asks.
- **For the reviewer of this round:** F1's guard (and that `showing` is gone); F2's Modal seam, now `Modal.js`'s own behaviour; F3's case, R-d5b's order inside one `act` rather than two tasks, and why. `PL/probes/reviewProbe.render.test.tsx` runs against the commit: on the fix all 19 pass.
- **Followups to record:**
  - P2-T16: n-3 (a second `onClosed` is nothing to `whenClosed`, and a hide may give none); keep `whenClosed`'s queue in a ref (F1). Its swipe-during-a-save case can drive `dragThrough()`; the exit position is pinned here now.
  - E2-A's device check for a quick reopen on iOS: also whether React Native 0.88 on Fabric gives a press a discrete lane.
  - The first brief's P3 sentence on effects and P4's third reason are superseded by F1 (P3) and withdrawn (P4's third).

## Appendix: the code

Every block below is the kit's diff, byte for byte (`tools/fill_brief.py` checks it). The full files are in `PL/real/`. Copy from PL with `cp`; never retype.

### `Tray.tsx` (`PL/diffs/apps_app_src_wallet_tray_Tray.tsx.diff`)

```diff
diff --git a/apps/app/src/wallet/tray/Tray.tsx b/apps/app/src/wallet/tray/Tray.tsx
index 147cfe6..663a610 100644
--- a/apps/app/src/wallet/tray/Tray.tsx
+++ b/apps/app/src/wallet/tray/Tray.tsx
@@ -146,12 +146,10 @@ export function Tray({ visible, onClose, onClosed, title, header, onBack, step,
   const [shown, setShown] = useState(visible);
   if (visible && !shown) setShown(true);
 
-  // The latest onClosed, and whether the Modal is shown, as the last commit left them.
+  // The latest onClosed, as the last commit left it, for the hide's timer and iOS's onDismiss.
   const closed = useRef(onClosed);
-  const showing = useRef(shown);
   useEffect(() => {
     closed.current = onClosed;
-    showing.current = shown;
   });
   const exitMs = trayExiting(reduced).getDuration();
   useEffect(() => {
@@ -165,9 +163,12 @@ export function Tray({ visible, onClose, onClosed, title, header, onBack, step,
   }, [visible, shown, exitMs]);
   // iOS's onDismiss comes when UIKit's dismissal ends, after the hide. A tray
   // shown again by then (a quick reopen) has not closed, so that late one says
-  // nothing (P10d); the hide that follows has its own onDismiss.
+  // nothing (P10d); the hide that follows has its own onDismiss. The guard reads
+  // this render's `shown`, not a ref an effect refreshes: Modal.js calls the
+  // latest onDismiss in the layout phase of the commit that renders the end, and
+  // a reopen batched with the end is in that same commit, before its effects run.
   const dismissed = () => {
-    if (!showing.current) closed.current?.();
+    if (!shown) closed.current?.();
   };
 
   /** A close may be asked for: never while locked (a save in flight), once the tray is leaving, or under the lock's cover. */
```

### `Tray.render.test.tsx` (`PL/diffs/apps_app_src_wallet_tray_Tray.render.test.tsx.diff`)

```diff
diff --git a/apps/app/src/wallet/tray/Tray.render.test.tsx b/apps/app/src/wallet/tray/Tray.render.test.tsx
index 8343da8..29c98aa 100644
--- a/apps/app/src/wallet/tray/Tray.render.test.tsx
+++ b/apps/app/src/wallet/tray/Tray.render.test.tsx
@@ -15,9 +15,9 @@
 // through Gesture Handler's own event handler, as the native side does.
 // iOS's Modal says it has gone (onDismiss) when UIKit's dismissal ends, a
 // frame or more after the hide; react-native-web says it at once. The late
-// dismissal's case holds it back and ends it itself.
+// dismissal's cases hold it back and end it as React Native's Modal.js does.
 import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
-import { useEffect } from 'react';
+import { useEffect, useState } from 'react';
 import { AccessibilityInfo, Platform, View } from 'react-native';
 import type { ModalProps } from 'react-native';
 import { State } from 'react-native-gesture-handler';
@@ -27,20 +27,31 @@ import { afterEach, expect, test, vi } from 'vitest';
 // The real safe-area package loads React Native itself, which vitest cannot run.
 vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
 
-// The Modal, which says it has gone at once unless a case holds its dismissals back (`late`): each one then waits
-// for endDismissal(), which calls the Modal's latest onDismiss, as React Native's Modal does on iOS.
-const dismissals = vi.hoisted(() => ({ late: false, held: 0, latest: null as (() => void) | null }));
+// The Modal, which says it has gone at once unless a case holds its dismissals back (`late`). A held one waits for
+// `dismissals.end`, which does what React Native's Modal.js does on iOS when UIKit's dismissal ends: it sets its
+// own state, and that setState's callback calls the latest onDismiss, in the layout phase of the commit that
+// renders it (Modal.js lines 315 to 323), with whatever else React batched into that commit.
+const dismissals = vi.hoisted(() => ({ late: false, held: 0, end: null as (() => void) | null }));
 vi.mock('react-native', async (importOriginal) => {
   const actual = await importOriginal<typeof import('react-native')>();
-  const { createElement, forwardRef } = await import('react');
-  const Modal = forwardRef<unknown, ModalProps>((props, ref) => {
-    dismissals.latest = props.onDismiss ?? null;
-    const onDismiss = props.onDismiss && (() => {
-      if (dismissals.late) dismissals.held += 1;
-      else props.onDismiss?.();
-    });
-    return createElement(actual.Modal as never, { ...props, ref, onDismiss });
-  });
+  const { Component, createElement, forwardRef } = await import('react');
+  class IosModal extends Component<ModalProps & { forwarded: unknown }, { isRendered: boolean }> {
+    state = { isRendered: this.props.visible === true };
+    componentDidUpdate(previous: ModalProps) {
+      if (previous.visible === false && this.props.visible === true) this.setState({ isRendered: true });
+    }
+    end = () => this.setState({ isRendered: false }, () => this.props.onDismiss?.());
+    render() {
+      const { forwarded, onDismiss, ...props } = this.props;
+      dismissals.end = this.end;
+      const held = onDismiss && (() => {
+        if (dismissals.late) dismissals.held += 1;
+        else onDismiss();
+      });
+      return createElement(actual.Modal as never, { ...props, ref: forwarded, onDismiss: held });
+    }
+  }
+  const Modal = forwardRef<unknown, ModalProps>((props, ref) => createElement(IosModal, { ...props, forwarded: ref }));
   return { ...actual, Modal };
 });
 
@@ -96,7 +107,7 @@ afterEach(() => {
   vi.clearAllMocks();
   swipe.config = null;
   swipe.gesture = null;
-  Object.assign(dismissals, { late: false, held: 0, latest: null });
+  Object.assign(dismissals, { late: false, held: 0, end: null });
   delete (AccessibilityInfo as unknown as Record<string, unknown>).sendAccessibilityEvent;
 });
 
@@ -162,13 +173,16 @@ function dragThrough(translationY: number, end: typeof State.END | typeof State.
   send({ state: end, oldState: State.ACTIVE, ...at(translationY) });
 }
 
-/** Ends the dismissal held back longest: React Native's Modal then calls its latest onDismiss, as on iOS. */
+/** Ends the dismissal held back longest, as UIKit's end reaches Modal.js on iOS: alone, in its own commit. */
 function endDismissal() {
   expect(dismissals.held, 'a dismissal under way').toBeGreaterThan(0);
   dismissals.held -= 1;
-  act(() => { dismissals.latest?.(); });
+  act(() => { dismissals.end?.(); });
 }
 
+/** The card's frame while the card leaves: the card is gone, so it is found beside the backdrop. */
+const leavingFrame = () => found('tray-backdrop').nextElementSibling as HTMLElement;
+
 /** A phone: React Native's platform, and the screen reader's focus moves, which react-native-web lacks (each one recorded). */
 const platform = (value: string) => Object.defineProperty(Platform, 'OS', { value, configurable: true, writable: true });
 function phoneFocus(): [HTMLElement | null, string][] {
@@ -414,6 +428,28 @@ test('a drag the lock cover cuts off is gone when the cover lifts', async () =>
   expect(frame().style.transform, 'the card once the cover lifts').toBe('translateY(0px)');
 });
 
+test('a card that leaves stays where the finger let it go, even when the lock cover comes and goes', async () => {
+  const onClose = vi.fn();
+  const covered = (hidden: boolean, visible = true) => (
+    <LockCoverContext.Provider value={{ hidden }}>{tray({ visible, onClose })}</LockCoverContext.Provider>
+  );
+  const view = mountWallet(covered(false));
+  await settle();
+  // A swipe past the line asks to close; the host closes the tray, and the card's exit starts from there.
+  pull(121);
+  release(121);
+  expect(onClose).toHaveBeenCalledTimes(1);
+  vi.useFakeTimers();
+  view.rerender(covered(false, false));
+  expect(leavingFrame().style.transform, 'as it leaves').toBe('translateY(121px)');
+  act(() => { vi.advanceTimersByTime(100); });
+  expect(leavingFrame().style.transform, '100 ms on').toBe('translateY(121px)');
+  // The cover comes and goes while it leaves: nothing moves either.
+  view.rerender(covered(true, false));
+  view.rerender(covered(false, false));
+  expect(leavingFrame().style.transform, 'once the cover lifts').toBe('translateY(121px)');
+});
+
 test('the main button is 54 pt tall, radius 16, ink with white text in light and light with ink text in dark; busy says its busy label', async () => {
   for (const [mode, colors] of MODES) {
     const onPress = vi.fn();
@@ -588,6 +624,20 @@ test('opening at another step in one render, or a step change under the lock cov
   expect(tick).toHaveBeenCalledTimes(1);
 });
 
+test('once the lock cover lifts a step change ticks, even when it lifted on the step it had under the cover', async () => {
+  const tick = vi.spyOn(haptics, 'selection').mockResolvedValue(undefined);
+  const at = (step: string, hidden = false) => <LockCoverContext.Provider value={{ hidden }}>{tray({ step })}</LockCoverContext.Provider>;
+  const view = mountWallet(at('amount'));
+  await settle();
+  view.rerender(at('amount', true));
+  view.rerender(at('confirm', true));
+  // Lifted on the same step: no tick, and the tray is open and uncovered again.
+  view.rerender(at('confirm'));
+  expect(tick, 'the cover lifting').not.toHaveBeenCalled();
+  view.rerender(at('amount'));
+  expect(tick).toHaveBeenCalledTimes(1);
+});
+
 test("on a phone the card is the named dialog and the title takes focus, with or without a header; on iOS onClosed waits for the Modal's own dismissal", async () => {
   const focused = phoneFocus();
   const errors = vi.spyOn(console, 'error');
@@ -657,6 +707,60 @@ test('on iOS a dismissal that ends after the tray is shown again says nothing; t
   expect(onClosed).toHaveBeenCalledTimes(1);
 });
 
+test('on iOS a dismissal that ends in the commit that opens the tray again says nothing', async () => {
+  phoneFocus();
+  dismissals.late = true;
+  const onClosed = vi.fn();
+  const host = { setVisible: (_: boolean) => undefined as void };
+  function Host() {
+    const [visible, setVisible] = useState(false);
+    host.setVisible = setVisible;
+    return (
+      <>
+        <button type="button" data-testid="add" onClick={() => setVisible(true)}>add</button>
+        {tray({ visible, onClosed })}
+      </>
+    );
+  }
+  const view = mountWallet(<Host />);
+  await settle();
+  platform('ios');
+  view.rerender(<Host />);
+  act(() => { host.setVisible(true); });
+  await settle();
+  vi.useFakeTimers();
+  act(() => { host.setVisible(false); });
+  act(() => { vi.advanceTimersByTime(220); });
+  // The Modal has hidden, and UIKit's dismissal is under way.
+  expect([screen.queryByTestId('tray'), dismissals.held]).toEqual([null, 1]);
+  // UIKit's end, then a tap on add (a DOM button's click is a discrete React event, as a tap is), both before React
+  // renders the end: one commit holds the end and the reopen (the review's R-d5b order). Modal.js calls onDismiss in
+  // that commit's layout phase, before any of its effects run.
+  act(() => {
+    dismissals.end?.();
+    fireEvent.click(screen.getByTestId('add'));
+  });
+  expect(screen.queryByTestId('tray'), 'open again').not.toBeNull();
+  expect(onClosed, 'onClosed while the tray is open').not.toHaveBeenCalled();
+});
+
+test('on iOS a tray with no onClosed closes, its dismissal ends, and it opens again', async () => {
+  phoneFocus();
+  dismissals.late = true;
+  const view = mountWallet(tray({ visible: false }));
+  await settle();
+  platform('ios');
+  view.rerender(tray());
+  await settle();
+  vi.useFakeTimers();
+  view.rerender(tray({ visible: false }));
+  act(() => { vi.advanceTimersByTime(220); });
+  // A host that does not listen: the end says nothing, and throws nothing.
+  expect(() => endDismissal()).not.toThrow();
+  view.rerender(tray());
+  expect(screen.queryByTestId('tray'), 'open again').not.toBeNull();
+});
+
 test('a text link is at least 44 pt, violet by default or ink, and says its words', async () => {
   for (const [mode, colors] of MODES) {
     const onPress = vi.fn();
```

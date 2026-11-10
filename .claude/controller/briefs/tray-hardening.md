# Brief tray-hardening: Harden the Bun Wallet tray before its first hosts: the lock cover, a late dismissal, the drag reset and one tick

You are the implementer for the follow-up task tray-hardening: the fixes and pins that P2-T13's review asked for in the Bun Wallet's tray, before its first host tray (P2-T16, held until this lands). You change three existing files:

- `apps/app/src/wallet/tray/Tray.tsx`: under the lock's cover nothing asks to close the tray (m1); on iOS, a dismissal that ends after the tray was shown again says nothing (m2); a drag the cover cuts off is gone when the cover lifts (m3's reset); a step change ticks only when the tray was open and uncovered before it (m4); a swipe the system cancels springs back (n1). No exported name, type or prop changes.
- `apps/app/src/wallet/tray/Tray.render.test.tsx`: six new cases (the review's ready probes P-E, P-D, P-I, P-A with P-K, and P-M2, and n3's new `onClosed`), the phone case extended with a header (m5), the catalogue case reading the tray's sections where they sit, and the header's note on Gesture Handler corrected (n4).
- `apps/app/src/wallet/tray/trayGesture.test.ts`: two `assert.match` lines in the source case, and its title (m6).

The planner wrote all three and proved them in a scratch copy of the integration head `6db889a`: RED (the head's own `Tray.tsx` against the new tests: 5 of 22 render cases fail, each on an assertion; the Node file's 4 pass, by design), GREEN (22 of 22, and 4 of 4), 34 mutants killed (none survive; a second run printed the same lines) and R100's fast local gate. A rehearsal ran this brief's steps on a git copy of today's head, `b5aa2a7`. Do exactly what this brief says.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. Two notes at its top apply:
   - **R100:** CI is the gate for whole suites. Run only the fast local gate (Step 5). Never run the full render suite or the iOS export, and never compare whole-suite totals.
   - **R87:** your receipt is its own file, `docs/implementation/receipts/tray-hardening.md`; do not edit `premium-progress.md`.
2. The review that asks for this task: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T13.md`: m1 (lines 102 to 127), m2 (129 to 148), m3 (150 to 167), m4 (169 to 187), m5 (189 to 212), m6 (214 to 226), n1 (230 to 244), n3 (258 to 268), n4 (270 to 285), and "Notes for later tasks" (436 to 462).
3. P2-T13's brief, the rules this task keeps or extends: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/P2-T13.md`, P8 to P13 (lines 75 to 94) and the test traps P15(c) (lines 102 to 109).
4. The plan: `docs/superpowers/plans/2026-10-25-jotbun-p2-bun-wallet-core.md`:
   - `### Task P2-T13` (lines 840 to 897), especially "How the device cases are handled (R69)" (lines 869 to 874) and "The lock (R63)" (line 875);
   - W6 (line 43) and the Global Constraints (lines 82 to 108), especially the R72 test traps (lines 94 to 99);
   - for context only: P2-T16's `whenClosed` (line 990) and P2-T33's `LockGate` (line 1586).
5. `/Users/kunanonjarat/Developer/jotbun/.claude/controller/followups.md`, the P2-T13 entry (lines 306 to 331), and in it the tray-hardening item (lines 307 to 319).

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/tray-hardening` (branch `fix/tray-hardening`, made by the orchestrator from `origin/claude/p1a-vault-core`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/tray-hardening`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/tray-hardening-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the final version of the three files, at their repo paths (the receipt is yours);
  - `stubs/`: the RED form of `Tray.tsx`. It is the head's own `Tray.tsx`, byte for byte `orig/`'s: the fix adds no export, so the head's file is already the compile-safe seam the new tests fail against;
  - `orig/`: the three files as they are at the head;
  - `diffs/`: one diff per changed file (`apps_app_src_wallet_tray_Tray.tsx.diff`, `apps_app_src_wallet_tray_Tray.render.test.tsx.diff`, `apps_app_src_wallet_tray_trayGesture.test.ts.diff`), for reading only. Each turns `orig/` into `real/` byte for byte; the appendix holds the same bytes;
  - `probes/`: the review's two probe files (`behaviourProbe.render.test.tsx`, `iosDismissProbe.render.test.tsx`), as the review left them, for the reviewer. They are not part of this task: never copy them into WT;
  - `tools/`: `mutants.py` (the mutant runner), `prove.sh` and `run-all.sh` (the planner's stages), `killers.py` (every case each mutant fails), `rehearse.sh` (this brief's steps, rehearsed), `sums.sh`, and `brief.template.md` with `fill_brief.py`, which fills in `mutant-table.md` and `commit-message.txt` (how this brief was built: the appendix is the kit's diffs, byte for byte);
  - `logs/`: see "For the controller";
  - checksums with paths relative to WT, for `shasum -a 256 -c` run from WT: `SHA256SUMS.base` (the three files at the head), `SHA256SUMS.red` (the RED state: the two final test files and the head's `Tray.tsx`) and `SHA256SUMS.real` (the three final files); and `SHA256SUMS`, the folder's own (paths under PL; the planner's `*.log` files are listed in `SHA256SUMS.logs`, not in it);
  - `work/`: the planner's proof tree, outside the sums.
- Every shell call starts in a fresh directory, so type full paths.
  - Git: `/usr/bin/git -C WT <command>`, one git command per call.
  - npm: `cd WT && npm run <script>`.
  - The Node file: `cd WT/apps/app && npm run test:unit -- src/wallet/tray/trayGesture.test.ts`.
  - Render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose <files>`.

  Below, WT, S and PL stand for those full paths: type the full path.
- No database or workers suite runs in this task, so there is no lock to take. Docker stays stopped.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass.
  - The one exception is a case that times out under load in a file this task does not touch (a known flake, protocol). Rerun that file alone once; if it passes alone, record both runs and go on.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/wallet/tray/Tray.tsx` | P2-T13's; P2-T14 to P2-T16 and every later tray host build on it. The header's closing, motion, exit, swipe and lock paragraphs; `showing` and `dismissed`, which iOS's `onDismiss` now takes (m2, P3); `closable` gains `!hidden` (m1, P2); the step tick's `wasOpen` (m4, P6); `hidden` in the drag reset's dependencies (m3, P5); `!event.canceled` in the swipe's end (n1, P7). 292 lines before, 316 after. |
| `apps/app/src/wallet/tray/Tray.render.test.tsx` | P2-T13's. The header's note (n4, P10); a `react-native` mock whose Modal can hold its dismissals back, and the gesture kept from `usePanGesture` (P10); `afterEach` resets both and the phone's focus; four helpers (`dragThrough`, `endDismissal`, `platform`, `phoneFocus`); six new cases (P12); the phone case extended with a header (m5, P9); the catalogue case (P11). 522 lines before, 713 after; 16 cases before, 22 after. |
| `apps/app/src/wallet/tray/trayGesture.test.ts` | P2-T13's. The source case's title, and two `assert.match` lines (m6, P9). 42 lines before, 46 after; 4 cases before and after. |
| `docs/implementation/receipts/tray-hardening.md` (repo root) | **new.** Your receipt (R87). |

Not in this task:
- `trayGesture.ts`: the cancel is read in `Tray.tsx`, and the swipe's line, its flick-up rule included, is the plan's own (P7).
- What the review and `followups.md` give to P2-T33: how the lock screen reaches a person whose tray is open (the rest of m1); whether the card plays its entering again when the cover lifts (the review's probe P-J), where VoiceOver lands then, and the scroll position (the rest of m3, P5).
- n2 and n5 (E2-A), and n4's case for a swipe during a save (P2-T16).
- `lockCover.tsx`, `PrimaryButton.tsx`, `TextLink.tsx`, `src/ui/Sheet.tsx` (P2-T33 makes it read the cover), `dev/catalogue/wallet/traySections.tsx` and `dev/catalogue/wallet/index.ts`.
- In flight elsewhere, none under `src/wallet/tray/`: the P2-T14 planner (`src/wallet/add/`), the P2-T12 planner (`src/wallet/card/`), wallet-looks-unstored (PR #391, `src/wallet/looks/`), and the fix-download-aborts and 1B-T12 planners (`apps/edge`).
- `en.json` and `th.json` (no copy changes), any package or lockfile, any route or the app entry, and `premium-progress.md`.

## Interfaces (as `PL/real` has them)

No exported name, type, prop or signature changes: `Tray`, `TrayProps`, `PrimaryButton`, `TextLink`, `TRAY_INSET`, `TRAY_RADIUS`, `shouldDismiss`, `LockCover`, `LockCoverContext`, `useLockCover` and `LockCoverArt` stay as P2-T13 made them. Inside `Tray`:

```ts
// Refreshed after each commit, in the effect that refreshes `closed` (the latest onClosed).
const showing = useRef(shown);
// iOS's onDismiss (P3): only a dismissal that ends while the Modal is hidden says the tray closed.
const dismissed = () => {
  if (!showing.current) closed.current?.();
};
// m1 (P2): never while locked, once the tray is leaving, or under the lock's cover.
const closable = visible && !locked && !hidden;
// m4 (P6): open and uncovered in the commit before; the tick's effect now depends on [step, visible, hidden, reduced].
const wasOpen = useRef(false);
// m3 (P5): the drag reset's effect depends on [visible, hidden, drag]; its body is unchanged.
// n1 (P7): the swipe's end asks to close only when `closable && !event.canceled && shouldDismiss(...)`.
```

The test file adds, for its own cases (P10):

```ts
const dismissals = vi.hoisted(() => ({ late: false, held: 0, latest: null as (() => void) | null }));   // the Modal mock's state
function dragThrough(translationY: number, end: typeof State.END | typeof State.CANCELLED): void;   // one drag through Gesture Handler's own handler
function endDismissal(): void;   // ends the dismissal held back longest: the Modal's latest onDismiss runs
const platform = (value: string) => Object.defineProperty(Platform, 'OS', { value, configurable: true, writable: true });
function phoneFocus(): [HTMLElement | null, string][];   // defines sendAccessibilityEvent, and records each call
```

## The integration head

- The planner's proof base is `6db889a`. Its proof tree is a `git archive` of `6db889a` with `npm ci` (1416 packages).
- The head is now `b5aa2a7`. Since `6db889a` it adds 1B-T11 (#387, `apps/edge` only) and controller state: `git diff --stat 6db889a b5aa2a7 -- apps/app packages package.json package-lock.json scripts .github` prints nothing. The rehearsal (`PL/logs/rehearsal.txt`) ran this brief's Steps 0.2 to 7 on a git copy of `b5aa2a7`.
- P2-T13 (#383) merged as `08e0566`, an ancestor of both. No commit since touches `apps/app/src/wallet/tray/`. `PL/orig/` equals the head's blobs (`e67a65c` for `Tray.tsx`, `78378ea` for `Tray.render.test.tsx`, `33ec4a0` for `trayGesture.test.ts`), and `PL/SHA256SUMS.base` checks them in Step 0.
- R100: no whole-suite totals are expected here. For the controller's CI check, this task's deltas are: render +0 files and +6 cases (`Tray.render.test.tsx`, 16 to 22); `test:unit` +0 (`trayGesture.test.ts` keeps 4); `test:app` +0; web and iOS +0 modules (only the development catalogue imports the tray, under `__DEV__`).

## Planner rulings (the calls this brief makes, with the reason for each)

- **P1. Ready.**
  - "Starts after": P2-T13 only, merged (#383, `08e0566`, 10 November). The follow-up was recorded with it (`followups.md`, the P2-T13 entry) and holds P2-T16 in `held.txt`.
  - No package, lockfile, Cloudflare resource, account setting or owner decision: each fix keeps a rule P2-T13's brief already set (P9 to P13) or that its review asked for.
  - At the head, the tray's files pass 16 of 16 and 4 of 4, and the review's probe files fail P-A, P-D, P-E, P-I, P-J, P-K and P-M2 exactly as the review recorded, while the other eight pass (`PL/logs/superseded/run-1/base-probes.log`).
- **P2. m1's guard: `closable = visible && !locked && !hidden`.** Under the cover the card, the backdrop, close, the swipe's detector and `onAccessibilityEscape` all unmount, so the one way left to ask is the Modal's `onRequestClose` (Android's back; Escape on the web). It now asks nothing, so a host whose close drops its draft loses nothing while the app is locked (R63, plan line 875). Uncovered, it asks again. The new case is the review's P-E, with the uncovered half added. How LockedScreen reaches a person whose tray is open stays P2-T33's.
- **P3. m2's guard holds whether the Modal is shown (`shown`), not `visible`.**
  - React Native 0.88's iOS Modal always sends `onDismiss` from the dismissal's completion (`RCTModalHostViewComponentView.mm`, `ensurePresentedOnlyIfNeeded`, lines 183 to 202), and `Modal.js` calls `props.onDismiss` in a `setState` callback (lines 315 to 323): both after the tray's hide. So a tray shown again in between heard a late `onDismiss` and said it closed while it was open (the review's P-M2), which breaks P2-T13's P10(d) and R69: P2-T16's `whenClosed` could open a second tray over this one.
  - `dismissed` says the tray closed only while the Modal is hidden (`showing.current` false), which is exactly "this dismissal belongs to the last hide". A ref of `visible`, as the review suggested, also fixes P-M2, but a tray reopened and closed again before the late end would then hear it during its second exit, while the Modal is still shown, and again at its own end: two `onClosed`, the first one early (mutant H3).
  - The ref is refreshed in the effect that already refreshes `closed`. React runs a commit's pending effects before it starts the next update, so `Modal.js`'s callback sees it.
- **P4. `shown` is not held until `onDismiss` (the review's "consider").**
  - `animationType="none"` makes React Native 0.88 dismiss without animation (`animationConfiguration`, lines 60 to 64), and a reopen from JS reaches native only in a later commit. The window the review found is the JS side's (the event, then `Modal.js`'s `setState`), and P3 closes it. Whether UIKit can still be dismissing when that later commit lands is a device question, recorded below.
  - Holding `shown` would make every reopen on iOS wait for an `onDismiss` that React Native sends only after a dismissal it started. A Modal that never presented (it presents only once it has a window, line 166) starts no dismissal, so the tray could never open again.
  - On iOS, `Modal.js` keeps its children rendered until `onDismiss` (`isRendered`, lines 254 to 278), so a held `shown` would mount the card twice.
  - A quick reopen on a phone is recorded SKIPPED (a device check for P2-T16 or E2-A).
- **P5. m3's reset: `hidden` joins the drag reset's dependencies; its body stays `if (visible) drag.value = 0`.**
  - The card is back in its place when the tray opens (as before), and when the cover comes or goes while it is open: the cover unmounts the header's detector, so a drag it cuts off may never end in JS (the review's P-D). During an exit nothing moves, so the card still leaves from where the finger let go (P2-T13's P12). The comment says `hidden` is a dependency on purpose.
  - Not here: the card playing its entering again when the cover lifts (the review's P-J), where VoiceOver lands then, and the lost scroll position. The dispatch scopes this task to m3's reset, and the review and `followups.md` give the rest of m3 to P2-T33's device check, beside how the lock screen reaches a person whose tray is open. P-J still fails on the final code, by design (`PL/logs/green-probes.log`).
- **P6. m4's tick: one effect over `step`, `visible`, `hidden` and `reduced`.**
  - It ticks only when the step changed, the tray is open and uncovered now (`open = visible && !hidden`), and it was so in the commit before (`wasOpen`). `visible` and `hidden` are dependencies, so `wasOpen` always holds the commit before's answer.
  - So opening at another step in one render (the review's P-A: a host that starts a new entry as it opens), a step change under the cover (P-K), the cover lifting on another step, and a step change in the render that closes the tray play none. P2-T13's P11(b) holds as written, now in one render too.
  - The new case is P-A and P-K together, with the cover lifting and one tick after it.
- **P7. n1's cancel: `!event.canceled` in the swipe's end.** A swipe the system cancels (a call, a system gesture) springs back as one short of the line does, or jumps back under Reduce Motion: the finger never let go.
  - Gesture Handler 3.3.0 sets `canceled` when a gesture moves from ACTIVE to CANCELLED or FAILED (`src/v3/hooks/callbacks/eventHandler.ts`, lines 47 to 64), and types it (`GestureEndEvent`, `src/v3/types/EventTypes.ts`, lines 82 to 84).
  - The flick-up rule (a 130 pt pull released with an upward flick closes) is the plan's own `shouldDismiss`, and stays (the review: E2-A or the owner). `trayGesture.ts` does not change.
- **P8. n3: a case that passes a new `onClosed` while the card leaves, and expects only the new one called.** It kills the review's B1 (the ref never refreshed) and B4 (the timer calls the `onClosed` its effect captured). It passes at RED, by design: the code is right.
- **P9. m5 and m6, pins of code that is right.**
  - m5: the phone case now runs without and with a header. Each time the card is the dialog (`role` `dialog`, `aria-modal` true, `aria-label` the title), and the node sent to `sendAccessibilityEvent` is the row's first element: the title's heading, or the 1 by 1 pt heading in its place. It kills O1, O2, O5 and O6. The title names both (P2-T13's P8(a) and P8(c)).
  - m6: the Node source case reads `accessible: true` in `titleHeader` and `focusable={false}` on the backdrop, which react-native-web drops (R72). It kills O7 and O11. Its title now names the title and the backdrop.
  - Both pass at RED, by design.
- **P10. The test seams, each explained where it is.**
  - (a) A late iOS dismissal: `vi.mock('react-native', ...)` wraps the Modal. With `dismissals.late` false (every case but one), it calls the Modal's `onDismiss` at once, as react-native-web does, so the other cases see the same Modal as before. With it true, each dismissal waits for `endDismissal()`, which calls the Modal's latest `onDismiss`, as React Native's `Modal.js` does on iOS. The review's P-M2 wrapped the Modal the same way.
  - (b) Gesture Handler's own handler: the wrapper of `usePanGesture` keeps the gesture it returns, and `dragThrough()` sends begin, activate, a move and an end or a cancel through its `detectorCallbacks.jsEventHandler`, as the review's P-H and P-I did. So the cancel case shows that Gesture Handler itself marks the cancel. The other swipe cases keep calling the config's callbacks.
  - (c) `platform()` and `phoneFocus()` are the phone case's own setup, shared now; `afterEach` deletes `sendAccessibilityEvent` and resets the seams.
  - (d) n4: the header's note on Gesture Handler said it "reads no pointer" here. It now says why the cases call the config's callbacks (its web build reads a pointer only against a laid-out view, and happy-dom lays nothing out), that this is its own path (it takes the latest callbacks on every render), and that the cancel's case goes through its own handler. This task rewrites that paragraph for the cancel's case anyway, so P2-T16 need not edit a file under `src/wallet/tray/` for it.
- **P11. The catalogue case reads the tray's four sections where they sit, after the kit's, not last.**
  - `dev/catalogue/wallet/index.ts` says each wallet task adds its own list in plan order, so P2-T14 (planned now, after P2-T13 in the plan) will spread its sections after the tray's. The head's `ids.slice(-4)` would then fail in P2-T14's pull request, in a file its planner was told to keep clear of.
  - The case now checks the kit's sections first, then the tray's four together at or after the kit's end. It still kills K1 (the tray's sections missing) and K2 (the tray's before the kit's).
  - `PL/logs/compat-*.log`: with a later list spread after the tray's, the head's case fails and this one passes.
- **P12. The cases.** Render: six new (`an onClosed given while the card leaves is the one called`, `under the lock cover nothing asks to close the tray`, `a drag the lock cover cuts off is gone when the cover lifts`, `a swipe the system cancels springs back, even past the line`, `opening at another step in one render, or a step change under the lock cover, ticks nothing`, `on iOS a dismissal that ends after the tray is shown again says nothing; the next one says it closed`), and two changed (the phone case, the catalogue case). Node: one changed (the source case). RED: 5 of 22 render cases fail, each on an assertion; the Node file passes, by design. GREEN: 22 of 22 and 4 of 4.
- **P13. The mutants: 34, all killed.** H1 to H11 cover every new guard. B1, B2 and B4 are the behaviour lens's (B1 and B4 survived P2-T13's cases), and O1, O2, O5, O6, O7 and O11 the surface lens's (all six survived). R1 to R5, R7, R13 to R16, R25 and R26 are P2-T13's: the plan's three (R1 to R3), and those whose lines this task changed, written again on the new lines with the same intent. K1 and K2 are P2-T13's catalogue mutants, for the changed catalogue case. Each runs against both of the tray's test files. A second run printed the same 35 lines byte for byte.
- **P14. The gate (R100).**
  - Run: `typecheck:app`; the two files RED to GREEN; the catalogue's wallet sections in the every-section and screen-reader suites (`-t "bw-"`), since the catalogue is the tray's only host; `test:app`; `test:unit`; `git diff --check`.
  - Not run: `typecheck:routes` and `export:web` (no route, app config or app entry changes); the edge, API and database suites (nothing outside `apps/app` changes; Docker is stopped); `test:ops` (no package or lockfile change).
  - Left to CI: the full render suite and the iOS export.
- **P15. Clear of the work in flight.** P2-T14 (`src/wallet/add/`), P2-T12 (`src/wallet/card/`), wallet-looks-unstored (#391, `src/wallet/looks/`), fix-download-aborts and 1B-T12 (`apps/edge`) touch nothing under `src/wallet/tray/`. P11 lets P2-T14's and P2-T12's catalogue spreads land after the tray's in either merge order.
- **P16. Notes for later tasks** (the receipt carries them):
  - **P2-T16:** on iOS `onClosed` fires once per hide, when that hide's dismissal ends; a tray shown again before the end says nothing, and a `whenClosed` run then waits for the next close. Under the cover nothing asks to close, so the host's close never runs while the app is locked. The header's note now says the swipe's real path agrees with the config's callbacks (n4), and `dragThrough()` shows how to drive Gesture Handler's own handler.
  - **P2-T33:** how LockedScreen reaches a person whose tray is open (m1); the card's entering when the cover lifts (P-J), where VoiceOver lands, and the scroll position (m3). The tray asks nothing while covered; the Sheet should too.
  - **P2-T14, P2-T12 and every later wallet task with sections:** the tray's catalogue case no longer needs the tray's sections last.
  - **E2-A:** n1's flick-up rule, if the owner wants a flick back up to keep the tray open; and a quick reopen on iOS on a device (P4).

---

## Step 0: Sync, install and check the base

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date." or a clean merge. Then `/usr/bin/git -C WT rev-parse --short HEAD`, and record it.
2. `mkdir -p S`, then `cd WT && shasum -a 256 -c PL/SHA256SUMS.base > S/base-check.txt 2>&1; echo exit=$?`. Expected: `exit=0` and three `OK` lines.
   - If a line says `FAILED`, another task changed that file since `b5aa2a7`, and the kit's files would undo its change. Stop: BLOCKED, with `/usr/bin/git -C WT log --oneline -3 -- <that file>`.
3. `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo exit=$?`. Expected: `exit=0`. The worktree may come installed; running it again is safe. There is no edge install: this task is app-only.
4. The base:
   - `cd WT/apps/app && npm run test:unit -- src/wallet/tray/trayGesture.test.ts > S/base-unit.log 2>&1; echo exit=$?`. Expected: `exit=0`, and `grep -E "^ℹ (tests|pass|fail) " S/base-unit.log` prints `ℹ tests 4`, `ℹ pass 4` and `ℹ fail 0`.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/tray/Tray.render.test.tsx > S/base-render.log 2>&1; echo exit=$?`. Expected: `exit=0`, and `grep -E "^ +Tests " S/base-render.log` prints `      Tests  16 passed (16)`.

## Step 1: The tests (plan Step 1)

1. Copy the two final test files. `Tray.tsx` stays as the head has it: that is its RED form (`PL/stubs/` holds the same bytes).
   ```
   cp PL/real/apps/app/src/wallet/tray/Tray.render.test.tsx WT/apps/app/src/wallet/tray/Tray.render.test.tsx
   cp PL/real/apps/app/src/wallet/tray/trayGesture.test.ts WT/apps/app/src/wallet/tray/trayGesture.test.ts
   ```
2. `/usr/bin/git -C WT status --short --untracked-files=all`. Expected: exactly these two lines, and nothing else:
   ```
    M apps/app/src/wallet/tray/Tray.render.test.tsx
    M apps/app/src/wallet/tray/trayGesture.test.ts
   ```
3. `cd WT && shasum -a 256 -c PL/SHA256SUMS.red`. Expected: 3 `OK` lines, exit 0.
4. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo exit=$?`. Expected: `exit=0`.

## Step 2: RED (plan Step 2)

1. The Node file: `cd WT/apps/app && npm run test:unit -- src/wallet/tray/trayGesture.test.ts > S/red-unit.log 2>&1; echo exit=$?`. Expected: `exit=0`, and `ℹ tests 4`, `ℹ pass 4`, `ℹ fail 0`. Its two new lines read what the head's `Tray.tsx` already has: they pin it (P9).
2. The render file:
   ```
   cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/tray/Tray.render.test.tsx > S/red-render.log 2>&1; echo exit=$?
   ```
   Expected: `exit=1`, and `grep -E "^ +Tests " S/red-render.log` prints `      Tests  5 failed | 17 passed (22)`.
3. `grep "×" S/red-render.log` prints exactly these five cases (each line ends with its time):
   ```
    × src/wallet/tray/Tray.render.test.tsx > under the lock cover nothing asks to close the tray
    × src/wallet/tray/Tray.render.test.tsx > a drag the lock cover cuts off is gone when the cover lifts
    × src/wallet/tray/Tray.render.test.tsx > a swipe the system cancels springs back, even past the line
    × src/wallet/tray/Tray.render.test.tsx > opening at another step in one render, or a step change under the lock cover, ticks nothing
    × src/wallet/tray/Tray.render.test.tsx > on iOS a dismissal that ends after the tray is shown again says nothing; the next one says it closed
   ```
4. Every failure is an assertion:
   - `grep '^AssertionError' S/red-render.log` prints exactly these five lines:
     ```
     AssertionError: asked under the cover: expected "vi.fn()" to not be called at all, but actually been called 1 times
     AssertionError: the card once the cover lifts: expected 'translateY(80px)' to be 'translateY(0px)' // Object.is equality
     AssertionError: a cancelled swipe: expected "vi.fn()" to not be called at all, but actually been called 1 times
     AssertionError: opening at another step: expected "selection" to not be called at all, but actually been called 1 times
     AssertionError: while the tray is open: expected "vi.fn()" to not be called at all, but actually been called 1 times
     ```
   - `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|TypeError|ReferenceError' S/red-render.log` prints `0`.

   The 17 that pass include n3's case, the phone case with a header and the catalogue case: they pin code that is right (P8, P9, P11).

## Step 3: GREEN (plan Steps 3 and 4)

1. Copy the final `Tray.tsx`: `cp PL/real/apps/app/src/wallet/tray/Tray.tsx WT/apps/app/src/wallet/tray/Tray.tsx` (type the full paths). Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.real`. Expected: 3 `OK` lines, exit 0.
2. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo exit=$?`. Expected: `exit=0`.
3. The Node file, as in Step 2.1, into `S/green-unit.log`. Expected: `exit=0`, `ℹ tests 4`, `ℹ pass 4`, `ℹ fail 0`.
4. The render file, as in Step 2.2, into `S/green-render.log`. Expected: `exit=0`, `      Tests  22 passed (22)`, and `grep -c '^stderr |' S/green-render.log` prints `0`.
5. The catalogue's wallet sections, the tray's only host:
   ```
   cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-" > S/green-catalogue.log 2>&1; echo exit=$?
   ```
   Expected: `exit=0`, `Test Files  2 passed (2)`, and its `Tests` line starts `Tests  18 passed` (nine wallet sections in two suites). Ignore the `skipped` count: it moves with the head.

What the code does: read it in `PL/real` (the appendix holds the kit's diffs), and do not retype it. It follows rulings P2 to P7.

## Step 4: Mutation check (plan Step 5)

Run the planner's runner once. It applies each mutant alone to its file in WT (`Tray.tsx`, or `dev/catalogue/wallet/index.ts` for K1 and K2), runs both of the tray's test files, restores the file and checks its SHA-256:

```
MUTANT_LOGS=S/mutant-logs python3 -I PL/tools/mutants.py WT > S/mutants.out 2> S/mutants.err; echo exit=$?
```

Type the full paths. To check first that every pattern matches once, run `python3 -I PL/tools/mutants.py WT --check` (34 `APPLIES` lines, exit 0).

Expected: `exit=0`, and:
- `grep -c " KILLED: " S/mutants.out` prints `34`, and `grep -c "restored=True" S/mutants.out` prints `34`;
- `diff S/mutants.out PL/logs/mutants.out` prints nothing: each mutant fails the same cases as in the planner's run.

It takes two minutes or more, by the machine's load. Then `/usr/bin/git -C WT status --short --untracked-files=all` shows exactly ` M` for the three files, and `cd WT && shasum -a 256 -c PL/SHA256SUMS.real` still prints 3 `OK` lines.

| Mutant | Change | Killed by |
| --- | --- | --- |
| H1 | under the cover the system back still asks to close (m1) | `under the lock cover nothing asks to close the tray` |
| H2 to H4 | iOS's late `onDismiss` always says the tray closed; its guard reads `visible`, not whether the Modal is shown; its guard is never refreshed (m2) | `on iOS a dismissal that ends after the tray is shown again says nothing; the next one says it closed` |
| H5 | the cover coming or going leaves a drag where it was (m3) | `a drag the lock cover cuts off is gone when the cover lifts` |
| H6 to H8 | opening at another step in one render ticks; a step change under the cover ticks; the cover lifting on another step ticks (m4) | `opening at another step in one render, or a step change under the lock cover, ticks nothing` |
| H9 | a step change never ticks once the tray is open (m4) | that case, and the reduced-motion and full-motion cases |
| H10, H11 | a cancelled swipe past the line closes; a cancelled swipe stays pulled down (n1) | `a swipe the system cancels springs back, even past the line` |
| B1, B4 | the `onClosed` ref is never refreshed; the hide calls the `onClosed` its effect captured (n3) | `an onClosed given while the card leaves is the one called` |
| B2 | the Modal is given `onDismiss` on every platform | `the card leaves before the Modal hides, then onClosed fires once`, and n3's case |
| O1, O2, O5, O6 | a phone's card is no dialog; its dialog has no name; with a header, a phone's focus goes nowhere, or to the header (m5) | the phone case, `on a phone the card is the named dialog and the title takes focus, with or without a header; ...` |
| O7, O11 | the backdrop without `focusable={false}`; the title without `accessible: true` (m6) | the Node case `what the web drops is wired for a phone: ...` |
| R1 to R3 | the plan's three: the backdrop closes a locked tray; the Modal hides at once on close; the cover is ignored | `while locked nothing closes it, ...` (R1); `the card leaves before the Modal hides, ...` (R2); `a hidden lock cover replaces the tray's content` and the three new cover cases (R3) |
| R4, R5, R7 | a locked tray still closes; a leaving tray asks to close again; a locked swipe stays pulled down | `while locked nothing closes it, ...` (R4, R7); `the card leaves before the Modal hides, ...` (R5) |
| R13 | a reopened tray keeps the last pull | the swipe case `the swipe follows the finger down, ...`, and the cover's drag case |
| R14 to R16 | no tick on a step change; opening ticks too; a closed tray ticks | the reduced-motion and full-motion cases, and the new tick case |
| R25, R26 | on iOS `onClosed` fires before the Modal has gone; on iOS it never fires | the phone case and the late-dismissal case |
| K1, K2 | the tray's sections missing from the wallet list; the tray's before the kit's | `the catalogue's tray sections come after the kit's, and each tray opens at once` |

`PL/logs/killers.txt` lists every case each mutant fails.

## Step 5: The fast local gate (R100)

Run from WT, in order, and record each result. Whole-suite totals are not compared (R100): record the counts you see.

1. `cd WT && npm run typecheck:app`. Expected: exit 0 (Step 3.2).
2. The focused files: Steps 3.3, 3.4 and 3.5 again, into `S/gate-unit.log`, `S/gate-render.log` and `S/gate-catalogue.log`. Expected: as there (4 of 4; 22 of 22; 18 passed).
3. `cd WT && npm run test:app > S/test-app.log 2>&1; echo exit=$?`. Expected: `exit=0` and `ℹ fail 0`. This task changes no `test:app` file.
4. `cd WT && npm run test:unit > S/test-unit.log 2>&1; echo exit=$?`. Expected: `exit=0` and `ℹ fail 0`. This task changes one Node file and keeps its 4 cases.
5. `/usr/bin/git -C WT diff --check; echo exit=$?`. Expected: no output and `exit=0` (the three files are tracked, so `git diff` sees them before staging).

Not run here, recorded as "CI" (R100): the full `test:render` suite and the iOS export. Not run at all: `typecheck:routes` and `export:web` (no route, app config or app entry changes), the edge, API and database suites (nothing outside `apps/app` changes), and `test:ops` (no package or lockfile change).

## Step 6: Receipt

Create `WT/docs/implementation/receipts/tray-hardening.md` with the Write tool, in the house style of `docs/implementation/receipts/P2-T13.md`. Replace every `<...>` with what you saw; if a number differs from the planner's, write yours and say why under Deviations.

```markdown
# tray-hardening: Harden the Bun Wallet tray before its first hosts: the lock cover, a late dismissal, the drag reset and one tick

- **Status:** built and verified locally on `fix/tray-hardening` (`.claude/worktrees/tray-hardening`), from `<head>`. Not pushed. The independent review is the controller's, after this receipt. Under R87 this receipt is its own file; `premium-progress.md` is not edited.
- **What it fixes:** P2-T13's review (`.claude/controller/reviews/P2-T13.md`): m1's guard, m2, m3's reset, m4, m5, m6, n1 and n3, and n4's comment. P2-T16, the first host tray, was held until this lands.
- **What changed:**
  - `Tray.tsx`:
    - Under the lock's cover nothing asks to close the tray: `closable` is `visible && !locked && !hidden`, so Android's back cannot close a covered tray and lose a draft (m1).
    - On iOS, `onClosed` comes from the Modal's `onDismiss` only while the Modal is hidden (`showing`, refreshed with `closed`), so a dismissal that ends after the tray was shown again says nothing, even during a second exit (m2). `shown` is not held until `onDismiss` (planner ruling P4).
    - The drag is back in its place when the lock's cover comes or goes while the tray is open, so a drag the cover cuts off cannot leave the card pulled down (m3's reset).
    - A step change ticks only when the tray was open and uncovered in the commit before and still is: opening at another step in one render, a step change under the cover, and the cover lifting on another step play none (m4).
    - A swipe the system cancels springs back, even past the line (n1).
    - The header says each of these.
  - `Tray.render.test.tsx`: six new cases (the review's P-E, P-D, P-I, P-A with P-K and P-M2, and n3's new `onClosed`); the phone case runs without and with a header, and checks the card's dialog and the node VoiceOver is sent to (m5); the catalogue case finds the tray's sections where they sit; the header's note on Gesture Handler is corrected (n4). Two seams: a Modal that can hold its dismissals back, and Gesture Handler's own event handler. 16 cases before, 22 after.
  - `trayGesture.test.ts`: the source case reads `accessible: true` on the title and `focusable={false}` on the backdrop (m6). 4 cases before and after.
- **Files:** modified `apps/app/src/wallet/tray/Tray.tsx` (292 lines before, 316 after), `apps/app/src/wallet/tray/Tray.render.test.tsx` (522 before, 713 after) and `apps/app/src/wallet/tray/trayGesture.test.ts` (42 before, 46 after); created this receipt.
- **RED to GREEN** (the head's `Tray.tsx` is the RED form: the fix adds no export):
  - RED: `typecheck:app` `<result>`; `trayGesture.test.ts` `<counts>` (its two new lines pin the head's code); `Tray.render.test.tsx` `<counts>`; the five failing cases (m1, m3, n1, m4, m2), `<n>` `AssertionError`s, no module or type error.
  - GREEN: `typecheck:app` `<result>`; `trayGesture.test.ts` `<counts>`; `Tray.render.test.tsx` `<counts>`, no stderr; the catalogue's wallet sections `<counts>`.
- **Mutation check:** the planner's runner (`.claude/controller/scratch/tray-hardening-planner/tools/mutants.py`), 34 mutants, each applied alone, run against both of the tray's test files and restored (SHA-256 checked): `<killed> killed, <survived> survived`. `S/mutants.out` `<is identical to / differs from>` the planner's `logs/mutants.out`.
  - H1 to H11: the new guards (the cover's `closable`, the late dismissal's guard, the drag reset, the tick's `wasOpen` and `open`, the cancel).
  - B1, B2, B4, O1, O2, O5, O6, O7 and O11: the review's mutants; B1, B4 and the six O mutants survived P2-T13's cases.
  - R1 to R5, R7, R13 to R16, R25, R26, K1 and K2: P2-T13's mutants on the lines this task moved, with the plan's three.
- **Gate** (worktree root; R100's fast local gate):
  - `typecheck:app`: `<result>`.
  - Focused: `trayGesture.test.ts` `<counts>`; `Tray.render.test.tsx` `<counts>`; the catalogue's wallet sections `<counts>`.
  - `test:app`: `<counts>`. `test:unit`: `<counts>`.
  - `git diff --check`: `<result>`. The check after the commit is in the final message.
  - CI (R100, not run locally): the full `test:render` suite and the iOS export. This task adds 6 render cases and no file, and no bundled module.
- **SKIPPED:**
  - On a phone: a quick reopen on iOS while UIKit's dismissal ends; Android's back under the cover; a drag the cover cuts off; a swipe the system cancels (a call). No device or simulator here; the cases drive React Native's Modal and Gesture Handler's own handler.
  - `typecheck:routes` and `export:web` (no route, app config or app entry changes). The edge, API and database suites (nothing outside `apps/app` changed; Docker is stopped). `test:ops` (no package or lockfile change).
- **Not applicable:** no package, lockfile, route, `en.json` or `th.json` change; no analytics event; no log line.
- **Deviations** (the planner's rulings P1 to P16 in `.claude/controller/briefs/tray-hardening.md`):
  1. m2's guard holds whether the Modal is shown, not `visible`, and `shown` is not held until `onDismiss` (P3, P4).
  2. The rest of m3 (the entering when the cover lifts, the review's P-J; VoiceOver; the scroll position) stays with P2-T33 (P5).
  3. The catalogue case reads the tray's sections where they sit, not last, so later tasks' lists can follow them (P11).
  4. n4's comment is corrected here, since this task rewrites that paragraph (P10).
  <your own, if any>
- **Risks and notes for later tasks:**
  - P2-T16: on iOS `onClosed` fires once per hide, when that hide's dismissal ends; a tray shown again before the end says nothing, and a `whenClosed` run then waits for the next close. Under the cover nothing asks to close, so the host's close never runs while the app is locked. `dragThrough()` in `Tray.render.test.tsx` shows how to drive Gesture Handler's own handler.
  - P2-T33: how LockedScreen reaches a person whose tray is open (m1); the card's entering when the cover lifts (P-J), where VoiceOver lands, and the scroll position (m3). The tray asks nothing while covered; the Sheet should too.
  - P2-T14, P2-T12 and later wallet tasks with sections: the tray's catalogue case no longer needs the tray's sections last.
  - E2-A: n1's flick-up rule, if the owner wants it; a quick reopen on iOS on a device.
```

## Step 7: Commit

1. `/usr/bin/git -C WT add apps/app/src/wallet/tray/Tray.tsx apps/app/src/wallet/tray/Tray.render.test.tsx apps/app/src/wallet/tray/trayGesture.test.ts docs/implementation/receipts/tray-hardening.md`
2. `/usr/bin/git -C WT status --short`. Expected: exactly these four lines, and nothing else:
   ```
   M  apps/app/src/wallet/tray/Tray.render.test.tsx
   M  apps/app/src/wallet/tray/Tray.tsx
   M  apps/app/src/wallet/tray/trayGesture.test.ts
   A  docs/implementation/receipts/tray-hardening.md
   ```
   If anything else shows, stop and report.
3. `/usr/bin/git -C WT diff --cached --check; echo exit=$?`. Expected: no output and `exit=0`.
4. Write the message to `S/commit-message.txt` with the Write tool, then `/usr/bin/git -C WT commit -F S/commit-message.txt`:

```
Harden the Bun Wallet tray: the lock cover, a late dismissal, the drag reset and one tick

Under the lock's cover nothing asks to close the tray, so Android's back
cannot close it behind the cover. On iOS, a dismissal that ends after
the tray was shown again no longer says it closed. A drag the cover cuts
off is gone when the cover lifts, a swipe the system cancels springs
back, and a step change ticks only when the tray was open and uncovered
before it. Pin the phone's dialog and focus with a header, the two props
the web drops, and an onClosed given while the card leaves. P2-T13's
review: m1's guard, m2, m3's reset, m4, m5, m6, n1 and n3.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
```

5. `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD; echo exit=$?`. Expected: no output and `exit=0`. Then `/usr/bin/git -C WT log --oneline -1`, and record the SHA.

## Your final message

As the protocol says:
- `STATUS: DONE` or `STATUS: BLOCKED` first;
- the commit SHA and branch, and the files;
- the RED and GREEN counts, and the mutants (34 killed, and whether `S/mutants.out` equals the planner's);
- each gate command with its counts;
- SKIPPED: the phone checks, `typecheck:routes`, `export:web`, the edge, API and database suites and `test:ops`; CI: the full render suite and the iOS export;
- deviations: the four above, and any of your own.

---

## For the controller (not the implementer's)

- **Readiness.** READY. P2-T13 is merged; no package, lockfile, Cloudflare resource, account setting or owner answer is needed. No in-flight task shares a file (P15). Once this merges, the `held.txt` line for P2-T16 can go.
- **Size:** S. One code file (+24 lines, five guards), its render test (+191 lines, six new cases and two changed) and its Node test (+4 lines).
- **Kit checks.**
  - The folder's own sums: `shasum -a 256 -c SHA256SUMS` from PL. The `*.log` files are in `SHA256SUMS.logs`, not in it.
  - `SHA256SUMS.base`, `.red` and `.real` (paths relative to WT): the head's three files, the RED state and the final state.
  - `PL/work/` is the planner's proof tree (`6db889a`'s code plus `node_modules` and the final files), outside the sums.
- **The planner's logs** (in `PL/logs/`):
  - `summary.txt`: every stage of `tools/run-all.sh`, timed, with the load average: the base (the Node file 4 of 4, the render file 16 of 16, the catalogue's wallet sections 18); RED (the Node file 4 of 4 by design; the render file 5 failed and 17 passed of 22, five assertions, no load error); GREEN (4 of 4, 22 of 22 with no stderr, 18); the probes; compat; the mutants twice; and the gate.
  - `base-*`, `red-*`, `green-*` and `gate-*`: each stage's own logs.
  - `green-probes.log`: the review's two probe files on the final code. 14 of 15 pass; P-J fails, by design (P5). `superseded/run-1/base-probes.log`: the same files at the head, where P-A, P-D, P-E, P-I, P-J, P-K and P-M2 fail, as the review recorded.
  - `compat-head-case.log` and `compat-final-case.log`: the catalogue case with a later task's list spread after the tray's, first as the head has it (fails), then as this task has it (passes) (P11). `index.ts` was put back and checked against the head.
  - `mutants.out` and `mutant-logs/`: the run; `repeat/`: a second run, whose `mutants.out` is byte for byte the first's (`repeat/diff.txt` is empty); `mutants-check.out`: 34 `APPLIES`; `killers.txt`: every case each mutant fails.
  - `rehearsal.txt`: this brief's Steps 0.2 to 7, typed as written (`tools/rehearse.sh`) in a throwaway git copy of `b5aa2a7`, deleted afterwards; the receipt was a stand-in and the commit message came from this brief. Step 0.1 needs the real remote.
  - `superseded/run-1/`: the first full run, before the cancel case gained its check that the card springs back from where the drag was cut off, and before one comment in the late-dismissal case. The same RED, GREEN, probe and compat results, and the same 34 kills.
- **The CI deltas:** render +0 files and +6 cases (`Tray.render.test.tsx` 16 to 22); `test:unit`, `test:app`, web and iOS +0.
- **For the reviewer:** m2's guard on `shown`, not `visible`, and `shown` not held (P3, P4); P-J left to P2-T33 (P5); the catalogue case (P11); the two test seams (P10). `PL/probes/` holds the review's probe files, to run against the commit.
- **A note for planners:** `git apply` run from a folder under `.claude/controller/scratch/` (inside the main checkout's working tree) treats the patch's paths as the main checkout's, skips them as outside the current folder, and exits 0 having changed nothing. The planner checked this kit's diffs with `GIT_CEILING_DIRECTORIES` set to the kit's folder.
- **Followups to record:**
  - P2-T16's line in `followups.md`: n4's comment is corrected here; P2-T16 keeps only its case for a swipe during a save, which can use `dragThrough()`'s way.
  - P2-T33: m1's plan gap and the rest of m3 (P-J, VoiceOver, the scroll position), unchanged.
  - P2-T14 and P2-T12: the tray's catalogue case no longer needs the tray's sections last (P11).
  - E2-A: n1's flick-up rule; a quick reopen on iOS on a device.

## Appendix: the code

Every block below is the kit's diff, byte for byte (`tools/fill_brief.py` checks it). The full files are in `PL/real/`. Copy from PL with `cp`; never retype.

### `Tray.tsx` (`PL/diffs/apps_app_src_wallet_tray_Tray.tsx.diff`)

```diff
diff --git a/apps/app/src/wallet/tray/Tray.tsx b/apps/app/src/wallet/tray/Tray.tsx
index e67a65c..147cfe6 100644
--- a/apps/app/src/wallet/tray/Tray.tsx
+++ b/apps/app/src/wallet/tray/Tray.tsx
@@ -16,16 +16,18 @@
 //   screen readers, unseen.
 // - Closing. Close, the backdrop, the screen reader's escape, the system back
 //   (Escape on the web) and the swipe all ask one requestClose, which does
-//   nothing while `locked` (a save in flight, Review Focus 1) or once the tray
-//   is leaving. Close then says it is unavailable.
+//   nothing while `locked` (a save in flight, Review Focus 1), once the tray
+//   is leaving, or under the lock's cover. Locked, close says it is unavailable.
 // - Motion: P2-T9's builders, with the wallet's one answer (W6). The card
-//   springs up from below, or fades in. A step change ticks once (trayStep),
-//   fades its new content in and morphs the card's height; under Reduce Motion
-//   the height jumps.
+//   springs up from below, or fades in. A step change ticks once (trayStep)
+//   when the tray was open and uncovered before it and still is, fades its new
+//   content in and morphs the card's height; under Reduce Motion the height
+//   jumps.
 // - The exit (R69). When `visible` turns false the card leaves while the Modal
 //   stays; the Modal hides when the card's exit ends (220 ms, or the 150 ms
 //   fade), then onClosed fires once. iOS presents no Modal while another is
-//   still leaving, so there onClosed waits for the Modal's own onDismiss. A host
+//   still leaving, so there onClosed waits for the Modal's own onDismiss, and
+//   an onDismiss that ends after the tray was shown again says nothing. A host
 //   that opens a second tray as one closes opens it from onClosed, never in the
 //   same render, and keeps this tray mounted until then.
 // - A Sheet opened from a tray (Tell Bun's, P2-T16) renders inside the tray's
@@ -36,11 +38,14 @@
 // - The swipe (Gesture Handler 3), on the header row, runs on the JS runtime:
 //   its end asks the host to close, which sets React state. The card follows
 //   the finger down only, closes past shouldDismiss's line, and otherwise
-//   springs back (jumps back under Reduce Motion).
+//   springs back (jumps back under Reduce Motion), as does a swipe the system
+//   cancels.
 // - The lock (R63). While useLockCover() says hidden, LockCoverArt takes the
 //   place of the backdrop and the card at once (the card's exit is skipped, so
 //   it never shows over the cover), and the content unmounts; every step is
-//   its host's, so nothing typed is lost. Nothing of the tray is announced.
+//   its host's, so nothing typed is lost. Nothing of the tray is announced,
+//   nothing asks to close it, and the card is back in its place when the
+//   cover lifts.
 import { useEffect, useRef, useState } from 'react';
 import type { ReactNode } from 'react';
 import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
@@ -141,9 +146,12 @@ export function Tray({ visible, onClose, onClosed, title, header, onBack, step,
   const [shown, setShown] = useState(visible);
   if (visible && !shown) setShown(true);
 
+  // The latest onClosed, and whether the Modal is shown, as the last commit left them.
   const closed = useRef(onClosed);
+  const showing = useRef(shown);
   useEffect(() => {
     closed.current = onClosed;
+    showing.current = shown;
   });
   const exitMs = trayExiting(reduced).getDuration();
   useEffect(() => {
@@ -155,29 +163,44 @@ export function Tray({ visible, onClose, onClosed, title, header, onBack, step,
     }, exitMs);
     return () => clearTimeout(timer);
   }, [visible, shown, exitMs]);
+  // iOS's onDismiss comes when UIKit's dismissal ends, after the hide. A tray
+  // shown again by then (a quick reopen) has not closed, so that late one says
+  // nothing (P10d); the hide that follows has its own onDismiss.
+  const dismissed = () => {
+    if (!showing.current) closed.current?.();
+  };
 
-  /** A close may be asked for: never while locked (a save in flight), nor once the tray is leaving. */
-  const closable = visible && !locked;
+  /** A close may be asked for: never while locked (a save in flight), once the tray is leaving, or under the lock's cover. */
+  const closable = visible && !locked && !hidden;
   /** One rule for close, the backdrop, the screen reader's escape, the system back and the swipe. */
   const requestClose = () => {
     if (closable) onClose();
   };
 
-  // A step change ticks once while the tray is open; opening it does not.
+  // A step change ticks once while the tray is open and uncovered, and only if
+  // it was so in the commit before: opening it at another step in one render,
+  // a step changed under the cover, or the cover lifting plays none.
   const shownStep = useRef(step);
+  const wasOpen = useRef(false);
   useEffect(() => {
-    if (shownStep.current === step) return;
+    const open = visible && !hidden;
+    const changed = shownStep.current !== step;
     shownStep.current = step;
-    if (!visible) return;
+    const tick = changed && open && wasOpen.current;
+    wasOpen.current = open;
+    if (!tick) return;
     const { haptic } = motionFor('trayStep', reduced);
     if (haptic) playHaptic(haptic);
-  }, [step, visible, reduced]);
+  }, [step, visible, hidden, reduced]);
 
-  // The swipe: the card follows the finger down only.
+  // The swipe: the card follows the finger down only. It is back in its place
+  // when the tray opens, and when the lock's cover comes or goes (`hidden` is a
+  // dependency for that): the cover unmounts the header's detector, so a drag
+  // it cuts off may never end in JS.
   const drag = useSharedValue(0);
   useEffect(() => {
     if (visible) drag.value = 0;
-  }, [visible, drag]);
+  }, [visible, hidden, drag]);
   const follow = useAnimatedStyle(() => ({ transform: [{ translateY: drag.value }] }), [drag]);
   const pan = usePanGesture({
     activeOffsetY: 10,
@@ -187,11 +210,12 @@ export function Tray({ visible, onClose, onClosed, title, header, onBack, step,
       drag.value = Math.max(0, event.translationY);
     },
     onDeactivate: (event) => {
-      if (closable && shouldDismiss(event.translationY, event.velocityY)) {
+      // A swipe the system cancels (a call, a system gesture) never closes: the finger did not let go.
+      if (closable && !event.canceled && shouldDismiss(event.translationY, event.velocityY)) {
         requestClose();
         return;
       }
-      // Short of the line, or locked: back to its place.
+      // Short of the line, cancelled, or locked: back to its place.
       drag.value = reduced ? 0 : withSpring(0, { ...motion.spring.gentle, reduceMotion: ReduceMotion.Never });
     },
   });
@@ -215,7 +239,7 @@ export function Tray({ visible, onClose, onClosed, title, header, onBack, step,
       statusBarTranslucent
       onRequestClose={requestClose}
       onShow={focusTitle}
-      onDismiss={Platform.OS === 'ios' ? () => closed.current?.() : undefined}
+      onDismiss={Platform.OS === 'ios' ? dismissed : undefined}
       {...layerProps}
     >
       <GestureHandlerRootView style={{ flex: 1 }}>
```

### `Tray.render.test.tsx` (`PL/diffs/apps_app_src_wallet_tray_Tray.render.test.tsx.diff`)

```diff
diff --git a/apps/app/src/wallet/tray/Tray.render.test.tsx b/apps/app/src/wallet/tray/Tray.render.test.tsx
index 78378ea..8343da8 100644
--- a/apps/app/src/wallet/tray/Tray.render.test.tsx
+++ b/apps/app/src/wallet/tray/Tray.render.test.tsx
@@ -8,28 +8,56 @@
 // entering animation unseen (visibility: hidden) until its animationstart,
 // which a browser fires a frame later and happy-dom never does, and queries by
 // role skip what is unseen: startAnimations() fires it, as a browser would.
-// Gesture Handler reads no pointer here either, so the swipe's cases call the
-// callbacks the tray hands to usePanGesture.
+// Gesture Handler's web build reads a pointer only against a laid-out view,
+// and happy-dom lays nothing out, so most swipe cases call the callbacks the
+// tray hands to usePanGesture. Gesture Handler takes the latest callbacks on
+// every render, so this is its own path; the cancel's case sends its states
+// through Gesture Handler's own event handler, as the native side does.
+// iOS's Modal says it has gone (onDismiss) when UIKit's dismissal ends, a
+// frame or more after the hide; react-native-web says it at once. The late
+// dismissal's case holds it back and ends it itself.
 import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
 import { useEffect } from 'react';
 import { AccessibilityInfo, Platform, View } from 'react-native';
+import type { ModalProps } from 'react-native';
+import { State } from 'react-native-gesture-handler';
 import { ReduceMotion, ReducedMotionConfig } from 'react-native-reanimated';
 import { afterEach, expect, test, vi } from 'vitest';
 
 // The real safe-area package loads React Native itself, which vitest cannot run.
 vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
 
-// The swipe's callbacks, as the tray hands them to Gesture Handler.
+// The Modal, which says it has gone at once unless a case holds its dismissals back (`late`): each one then waits
+// for endDismissal(), which calls the Modal's latest onDismiss, as React Native's Modal does on iOS.
+const dismissals = vi.hoisted(() => ({ late: false, held: 0, latest: null as (() => void) | null }));
+vi.mock('react-native', async (importOriginal) => {
+  const actual = await importOriginal<typeof import('react-native')>();
+  const { createElement, forwardRef } = await import('react');
+  const Modal = forwardRef<unknown, ModalProps>((props, ref) => {
+    dismissals.latest = props.onDismiss ?? null;
+    const onDismiss = props.onDismiss && (() => {
+      if (dismissals.late) dismissals.held += 1;
+      else props.onDismiss?.();
+    });
+    return createElement(actual.Modal as never, { ...props, ref, onDismiss });
+  });
+  return { ...actual, Modal };
+});
+
+// The swipe's callbacks, as the tray hands them to Gesture Handler, and the gesture it makes of them.
 type PanEvent = { translationY: number; velocityY: number };
 type PanConfig = { onUpdate?: (event: PanEvent) => void; onDeactivate?: (event: PanEvent) => void } & Record<string, unknown>;
-const swipe = vi.hoisted(() => ({ config: null as PanConfig | null }));
+type Pan = { handlerTag: number; detectorCallbacks: { jsEventHandler: (event: unknown) => void } };
+const swipe = vi.hoisted(() => ({ config: null as PanConfig | null, gesture: null as Pan | null }));
 vi.mock('react-native-gesture-handler', async (importOriginal) => {
   const actual = await importOriginal<typeof import('react-native-gesture-handler')>();
   return {
     ...actual,
     usePanGesture: (config: Parameters<typeof actual.usePanGesture>[0]) => {
       swipe.config = config as unknown as PanConfig;
-      return actual.usePanGesture(config);
+      const gesture = actual.usePanGesture(config);
+      swipe.gesture = gesture as unknown as Pan;
+      return gesture;
     },
   };
 });
@@ -47,6 +75,7 @@ vi.mock('../motion/useWalletMotion', async (importOriginal) => {
 
 import { rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
 import { WALLET_SECTIONS } from '@mobile/dev/catalogue/wallet';
+import { WALLET_KIT_SECTIONS } from '@mobile/dev/catalogue/wallet/kitSections';
 import { haptics } from '@mobile/lib/haptics';
 import { walletDark, walletLight } from '@mobile/theme/walletPalette';
 import { LockCoverContext } from '@mobile/ui/lockCover';
@@ -66,6 +95,9 @@ afterEach(() => {
   vi.restoreAllMocks();
   vi.clearAllMocks();
   swipe.config = null;
+  swipe.gesture = null;
+  Object.assign(dismissals, { late: false, held: 0, latest: null });
+  delete (AccessibilityInfo as unknown as Record<string, unknown>).sendAccessibilityEvent;
 });
 
 /** Lets the phone's answer, the stores and Bun's AI preferences arrive. */
@@ -117,6 +149,38 @@ function pan(): PanConfig {
 const pull = (translationY: number) => act(() => { pan().onUpdate?.({ translationY, velocityY: 0 }); });
 const release = (translationY: number, velocityY = 0) => act(() => { pan().onDeactivate?.({ translationY, velocityY }); });
 
+/** One drag through Gesture Handler's own event handler, as the native side sends it: it begins, activates and moves
+ * to translationY, then ends (let go) or is cancelled (the system took the touch, as for a call). */
+function dragThrough(translationY: number, end: typeof State.END | typeof State.CANCELLED) {
+  expect(swipe.gesture, 'the swipe').not.toBeNull();
+  const gesture = swipe.gesture as Pan;
+  const at = (y: number) => ({ handlerData: { x: 0, y: 0, absoluteX: 0, absoluteY: 0, translationX: 0, translationY: y, velocityX: 0, velocityY: 0, numberOfPointers: 1, pointerType: 0 } });
+  const send = (event: Record<string, unknown>) => act(() => { gesture.detectorCallbacks.jsEventHandler({ handlerTag: gesture.handlerTag, ...event }); });
+  send({ state: State.BEGAN, oldState: State.UNDETERMINED, ...at(0) });
+  send({ state: State.ACTIVE, oldState: State.BEGAN, ...at(12) });
+  send(at(translationY));
+  send({ state: end, oldState: State.ACTIVE, ...at(translationY) });
+}
+
+/** Ends the dismissal held back longest: React Native's Modal then calls its latest onDismiss, as on iOS. */
+function endDismissal() {
+  expect(dismissals.held, 'a dismissal under way').toBeGreaterThan(0);
+  dismissals.held -= 1;
+  act(() => { dismissals.latest?.(); });
+}
+
+/** A phone: React Native's platform, and the screen reader's focus moves, which react-native-web lacks (each one recorded). */
+const platform = (value: string) => Object.defineProperty(Platform, 'OS', { value, configurable: true, writable: true });
+function phoneFocus(): [HTMLElement | null, string][] {
+  const focused: [HTMLElement | null, string][] = [];
+  Object.defineProperty(AccessibilityInfo, 'sendAccessibilityEvent', {
+    value: (node: HTMLElement | null, kind: string) => { focused.push([node, kind]); },
+    configurable: true,
+    writable: true,
+  });
+  return focused;
+}
+
 /** The view that holds a step's words: what fades in when the step changes. */
 const stepOf = (words: string) => screen.queryByText(words)?.parentElement ?? null;
 
@@ -272,6 +336,20 @@ test('the card leaves before the Modal hides, then onClosed fires once', async (
   expect([dialog() !== null, screen.queryByTestId('tray') !== null, onClosed.mock.calls.length]).toEqual([true, true, 0]);
 });
 
+test('an onClosed given while the card leaves is the one called', async () => {
+  const first = vi.fn();
+  const latest = vi.fn();
+  const view = mountWallet(tray({ onClosed: first }));
+  await settle();
+  vi.useFakeTimers();
+  view.rerender(tray({ visible: false, onClosed: first }));
+  act(() => { vi.advanceTimersByTime(100); });
+  // A host that passes a new function on every render (P2-T16's whenClosed queue).
+  view.rerender(tray({ visible: false, onClosed: latest }));
+  act(() => { vi.advanceTimersByTime(120); });
+  expect([first.mock.calls.length, latest.mock.calls.length]).toEqual([0, 1]);
+});
+
 test("a hidden lock cover replaces the tray's content", async () => {
   const unmounted = vi.fn();
   function Typed() {
@@ -308,6 +386,34 @@ test("a hidden lock cover replaces the tray's content", async () => {
   expect(found('lock-cover').style.backgroundColor).toBe(rgba(walletDark.ground));
 });
 
+test('under the lock cover nothing asks to close the tray', async () => {
+  const onClose = vi.fn();
+  const covered = (hidden: boolean) => <LockCoverContext.Provider value={{ hidden }}>{tray({ onClose })}</LockCoverContext.Provider>;
+  const view = mountWallet(covered(true));
+  await settle();
+  found('lock-cover');
+  // The system back reaches the Modal under the cover (Android's back; Escape on the web): it asks nothing, so a
+  // host that drops its draft on close loses nothing while the app is locked.
+  escape();
+  expect(onClose, 'asked under the cover').not.toHaveBeenCalled();
+  // Uncovered, it asks again.
+  view.rerender(covered(false));
+  escape();
+  expect(onClose).toHaveBeenCalledTimes(1);
+});
+
+test('a drag the lock cover cuts off is gone when the cover lifts', async () => {
+  const covered = (hidden: boolean) => <LockCoverContext.Provider value={{ hidden }}>{tray()}</LockCoverContext.Provider>;
+  const view = mountWallet(covered(false));
+  await settle();
+  pull(80);
+  expect(frame().style.transform).toBe('translateY(80px)');
+  // The cover takes the header, and the drag's end with it.
+  view.rerender(covered(true));
+  view.rerender(covered(false));
+  expect(frame().style.transform, 'the card once the cover lifts').toBe('translateY(0px)');
+});
+
 test('the main button is 54 pt tall, radius 16, ink with white text in light and light with ink text in dark; busy says its busy label', async () => {
   for (const [mode, colors] of MODES) {
     const onPress = vi.fn();
@@ -418,6 +524,27 @@ test("the wallet's answer decides the swipe's spring back, not Reanimated's own
   expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
 });
 
+test('a swipe the system cancels springs back, even past the line', async () => {
+  const onClose = vi.fn();
+  const view = mountWallet(tray({ visible: false, onClose }));
+  await settle();
+  view.rerender(tray({ onClose }));
+  await settle();
+  vi.useFakeTimers();
+  // Gesture Handler cancels a drag when the system takes the touch (a call, a system gesture): the finger never let go.
+  dragThrough(150, State.CANCELLED);
+  expect(onClose, 'a cancelled swipe').not.toHaveBeenCalled();
+  // It springs back from where the drag was cut off.
+  act(() => { vi.advanceTimersByTime(100); });
+  const partway = Number.parseFloat(frame().style.transform.replace('translateY(', ''));
+  expect(partway > 0 && partway < 150, `${partway} pt, 100 ms after the cancel`).toBe(true);
+  act(() => { vi.advanceTimersByTime(2000); });
+  expect(frame().style.transform).toBe('translateY(0px)');
+  // The same drag, let go, closes it.
+  dragThrough(150, State.END);
+  expect(onClose).toHaveBeenCalledTimes(1);
+});
+
 test('at full motion the card springs up, and a step change morphs its height and ticks once; opening ticks nothing', async () => {
   const tick = vi.spyOn(haptics, 'selection').mockResolvedValue(undefined);
   const view = mountWallet(tray({ visible: false, step: 'amount' }));
@@ -439,35 +566,95 @@ test('at full motion the card springs up, and a step change morphs its height an
   expect(tick).toHaveBeenCalledTimes(2);
 });
 
-test("on a phone the title takes focus, and on iOS onClosed waits for the Modal's own dismissal", async () => {
-  const focused: [unknown, string][] = [];
-  // react-native-web has no sendAccessibilityEvent; a phone's screen reader moves focus with it.
-  Object.defineProperty(AccessibilityInfo, 'sendAccessibilityEvent', {
-    value: (node: unknown, kind: string) => { focused.push([node, kind]); },
-    configurable: true,
-    writable: true,
-  });
+test('opening at another step in one render, or a step change under the lock cover, ticks nothing', async () => {
+  const tick = vi.spyOn(haptics, 'selection').mockResolvedValue(undefined);
+  const at = (step: string, { visible = true, hidden = false } = {}) => (
+    <LockCoverContext.Provider value={{ hidden }}>{tray({ visible, step })}</LockCoverContext.Provider>
+  );
+  const view = mountWallet(at('confirm', { visible: false }));
+  await settle();
+  // A host that starts a new entry as it opens the tray: the step and visible change in one render.
+  view.rerender(at('amount'));
+  await settle();
+  expect(tick, 'opening at another step').not.toHaveBeenCalled();
+  // Covered, a step change plays nothing, and neither does the cover lifting on another step.
+  view.rerender(at('amount', { hidden: true }));
+  view.rerender(at('confirm', { hidden: true }));
+  expect(tick, 'a step change under the cover').not.toHaveBeenCalled();
+  view.rerender(at('amount'));
+  expect(tick, 'the cover lifting on another step').not.toHaveBeenCalled();
+  // Open and uncovered, a step change ticks once.
+  view.rerender(at('confirm'));
+  expect(tick).toHaveBeenCalledTimes(1);
+});
+
+test("on a phone the card is the named dialog and the title takes focus, with or without a header; on iOS onClosed waits for the Modal's own dismissal", async () => {
+  const focused = phoneFocus();
   const errors = vi.spyOn(console, 'error');
-  try {
+  for (const header of [undefined, <WalletText>รายจ่าย</WalletText>]) {
+    const at = header ? 'with a header' : 'with the title';
+    focused.length = 0;
     const present: boolean[] = [];
     const onClosed = vi.fn(() => { present.push(screen.queryByRole('dialog') !== null); });
-    const view = mountWallet(tray({ visible: false, onClosed }));
+    // The platform turns to iOS once the tray has mounted closed: at the mount it would trip the theme store's read.
+    platform(os);
+    const view = mountWallet(tray({ visible: false, onClosed, header }));
     await settle();
-    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
-    view.rerender(tray({ onClosed }));
+    platform('ios');
+    view.rerender(tray({ onClosed, header }));
     await settle();
-    // VoiceOver lands on the title: one accessible header that says it.
-    expect(focused.map(([node, kind]) => [kind, (node as HTMLElement | null)?.getAttribute('aria-label'), (node as HTMLElement | null)?.getAttribute('role')])).toEqual([['focus', TITLE.th, 'heading']]);
+    // The card is the dialog, named by the title (on the web the Modal's own layer is).
+    const card = found('tray');
+    expect([card.getAttribute('role'), card.getAttribute('aria-modal'), card.getAttribute('aria-label')], at).toEqual(['dialog', 'true', TITLE.th]);
+    // VoiceOver lands on the title: one accessible header that says it, first in the row (1 by 1 pt with a header).
+    expect(focused.map(([node, kind]) => [kind, node?.getAttribute('aria-label'), node?.getAttribute('role')]), at).toEqual([['focus', TITLE.th, 'heading']]);
+    expect(focused[0]?.[0], at).toBe(found('tray-header').firstElementChild);
     vi.useFakeTimers();
-    view.rerender(tray({ visible: false, onClosed }));
+    view.rerender(tray({ visible: false, onClosed, header }));
     act(() => { vi.advanceTimersByTime(220); });
     // iOS presents no Modal while another is leaving, so the host hears of it once the Modal has gone.
-    expect(onClosed).toHaveBeenCalledTimes(1);
-    expect(present).toEqual([false]);
-    expect(errors).not.toHaveBeenCalled();
-  } finally {
-    delete (AccessibilityInfo as unknown as Record<string, unknown>).sendAccessibilityEvent;
+    expect(onClosed, at).toHaveBeenCalledTimes(1);
+    expect(present, at).toEqual([false]);
+    vi.useRealTimers();
+    cleanup();
   }
+  expect(errors).not.toHaveBeenCalled();
+});
+
+test('on iOS a dismissal that ends after the tray is shown again says nothing; the next one says it closed', async () => {
+  // On iOS the tray moves the screen reader to its title each time it shows.
+  phoneFocus();
+  dismissals.late = true;
+  const onClosed = vi.fn();
+  const view = mountWallet(tray({ visible: false, onClosed }));
+  await settle();
+  platform('ios');
+  view.rerender(tray({ onClosed }));
+  await settle();
+  vi.useFakeTimers();
+  const close = () => view.rerender(tray({ visible: false, onClosed }));
+  const open = () => view.rerender(tray({ onClosed }));
+  // Closed: the Modal hides at 220 ms, and UIKit's dismissal ends a frame or more later.
+  close();
+  act(() => { vi.advanceTimersByTime(220); });
+  expect([screen.queryByTestId('tray'), dismissals.held, onClosed.mock.calls.length]).toEqual([null, 1, 0]);
+  // Opened again before it ends (a quick second tap on add): that end says nothing, since the tray never closed.
+  open();
+  endDismissal();
+  expect(onClosed, 'while the tray is open').not.toHaveBeenCalled();
+  expect(screen.queryByTestId('tray')).not.toBeNull();
+  // Closed, opened and closed again: an end that comes while the card leaves says nothing either.
+  close();
+  act(() => { vi.advanceTimersByTime(220); });
+  open();
+  close();
+  endDismissal();
+  expect(onClosed, 'while the card leaves').not.toHaveBeenCalled();
+  act(() => { vi.advanceTimersByTime(220); });
+  expect([dismissals.held, onClosed.mock.calls.length], 'hidden, its dismissal under way').toEqual([1, 0]);
+  // Its own dismissal ends: closed, once.
+  endDismissal();
+  expect(onClosed).toHaveBeenCalledTimes(1);
 });
 
 test('a text link is at least 44 pt, violet by default or ink, and says its words', async () => {
@@ -510,8 +697,12 @@ test("a header takes the title's place, and screen readers meet the title first"
 
 test("the catalogue's tray sections come after the kit's, and each tray opens at once", async () => {
   const ids = WALLET_SECTIONS.map((section) => section.id);
-  expect(ids.slice(0, 2)).toEqual(['bw-amounts', 'bw-private']);
-  expect(ids.slice(-4)).toEqual(['bw-tray-short', 'bw-tray-tall', 'bw-tray-large', 'bw-buttons']);
+  const kit = WALLET_KIT_SECTIONS.map((section) => section.id);
+  expect(ids.slice(0, kit.length)).toEqual(kit);
+  // The tray's four together, after the kit's: later tasks' lists may follow them (index.ts adds each in plan order).
+  const first = ids.indexOf('bw-tray-short');
+  expect(first).toBeGreaterThanOrEqual(kit.length);
+  expect(ids.slice(first, first + 4)).toEqual(['bw-tray-short', 'bw-tray-tall', 'bw-tray-large', 'bw-buttons']);
   for (const id of ['bw-tray-short', 'bw-tray-tall', 'bw-tray-large']) {
     const section = WALLET_SECTIONS.find((each) => each.id === id);
     mountWallet(<>{section?.render()}</>);
```

### `trayGesture.test.ts` (`PL/diffs/apps_app_src_wallet_tray_trayGesture.test.ts.diff`)

```diff
diff --git a/apps/app/src/wallet/tray/trayGesture.test.ts b/apps/app/src/wallet/tray/trayGesture.test.ts
index 33ec4a0..ef08afb 100644
--- a/apps/app/src/wallet/tray/trayGesture.test.ts
+++ b/apps/app/src/wallet/tray/trayGesture.test.ts
@@ -31,9 +31,13 @@ test('the swipe runs on the JS runtime', () => {
   assert.match(source, /runOnJS: true/);
 });
 
-test("what the web drops is wired for a phone: the screen reader's escape, the modal card, the Modal, the keyboard and the cover", () => {
+test("what the web drops is wired for a phone: the screen reader's escape, the modal card, the title, the backdrop, the Modal, the keyboard and the cover", () => {
   assert.match(source, /^\s+onAccessibilityEscape=\{requestClose\}$/m);
   assert.match(source, /^\s+accessibilityViewIsModal$/m);
+  // The title is one accessibility element, so VoiceOver can land on it, even 1 by 1 pt beside a header.
+  assert.match(source, /titleHeader = \{ accessible: true, accessibilityRole: 'header' as const/);
+  // The decorative backdrop is never a keyboard stop on Android (React Native's Pressable is focusable unless told).
+  assert.match(source, /^\s+focusable=\{false\}$/m);
   assert.match(source, /^\s+transparent$/m);
   assert.match(source, /^\s+statusBarTranslucent$/m);
   assert.match(source, /behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/);
```

# Review of tray-hardening: Harden the Bun Wallet tray before its first hosts

- **Reviewed:** commit `784667b` on `fix/tray-hardening` (parent `ecc00b7`), PR #392 (base `claude/p1a-vault-core`), range `origin/claude/p1a-vault-core...784667b`. Four files: `Tray.tsx` (292 to 316 lines), `Tray.render.test.tsx` (522 to 713; 16 to 22 cases), `trayGesture.test.ts` (42 to 46) and the receipt `docs/implementation/receipts/tray-hardening.md`. No export, prop or type change; no `premium-progress.md`, `en.json`, `th.json`, package or lockfile change. `git diff --check` on the range: clean. The task worktree is at `784667b` with an empty `git status`.
- **Reviewer:** a size-S workflow (Sonnet): one reviewer for the whole task, a skeptic for any blocker or major, and this synthesis. No blocker or major was reported, so no skeptic ran and nothing below is marked unverified. The reviewer probed in a `git archive` copy of `784667b` (`.claude/controller/scratch/tray-hardening-review/tree`, `node_modules` symlinked) and edited nothing in the repo. I read CI myself and re-checked the evidence repeated here against the commit, `Modal.js`, Gesture Handler 3.3.0 and the scratch logs.
- **Result:** no blocker, no major. Two minors (a residual race in m2's guard, and a missing exit-position case) and three nits (two test gaps, and a note for P2-T16). The code of m1, m3, m4, n1 and n3 is right by every probe. m2 holds in every sequential interleaving and fails in one batched one (m-1). The m5 and m6 pins and the six new cases assert what their titles say. **VERDICT: Approved**, with one condition: CI has no result for this head (next section), so the merge waits for it.
- **Ids:** this review's findings are hyphenated (m-1, n-1) so they are not confused with P2-T13's m1 to m6, n1 and n3, the items this task fixes.

## CI (R100: read, not re-run)

Run 42738781210, `pull_request`, head `784667b84be217f94a556da182ab951ef33253f0`, 01:52 UTC on 10 November (08:52 local, as `handover.md` records it), conclusion failure. It is the only run on the branch, and it was unchanged when the reviewer read it at 02:16 UTC and when I did.

- All nine jobs failed after 2 to 3 seconds with zero steps: Typecheck, unit, API, build; Exports (web and iOS bundles); Render (every file but the per-section suites); Render, per-section suites (three jobs); Edge Worker; SQL integration and ops; Release image and smoke.
- The annotation on each (read from job 129574425226) is: "The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings". `handover.md` ("Owner decisions waiting") records it as an open owner decision.
- So this is no verdict, and not a code failure: nothing ran. The whole-suite gate has no result for this head: the full render suite with the six new cases (`Tray.render.test.tsx` 16 to 22), the web and iOS exports, and the database, edge and ops jobs. The PR's own "CI on this pull request is green" box is unchecked.
- **Merge condition:** once billing is fixed, the nine jobs must pass (the handover's plan is `gh run rerun 42738781210 --repo mygogocash/jotbun`). One caution: the base has moved since the reviewed head's parent. PR #391 merged as `76b329c` and changed `src/wallet/looks/WalletLooksProvider.tsx` and its test. The tray's test harness wraps every case in that provider (`src/wallet/testing/walletHarness.tsx:47` and `:136`), and the reviewer's focused runs were on the commit's own tree, which predates #391. No file of this PR overlaps, nothing in #391's diff touches what the provider renders, and GitHub reports the PR MERGEABLE, so the risk is small, but the tray's cases have not run with the new provider. The run that gates the merge should be on a true merge with the current base.
- What stood in for CI (the reviewer's focused runs in the scratch copy):
  - `Tray.render.test.tsx` 22 of 22, four times (2 to 3 s each), no stderr line;
  - `trayGesture.test.ts` 4 of 4;
  - the catalogue's wallet sections (`-t bw-`) 18 passed | 572 skipped;
  - `tsc --noEmit` in `apps/app` exit 0;
  - 11 of the planner's 34 mutants, all killed.
- The implementer's logs and receipt agree with these: RED 5 failed | 17 passed, GREEN 22 and 4, `mutants.out` identical to the planner's, `test:app` 34, `test:unit` 970 (not rerun here, R100).

## Findings

### Blockers

None.

### Major

None.

### Minor

**m-1. m2's guard reads a ref refreshed in a passive effect, so a late iOS end that is batched with a reopen still says the tray closed while it is open.**
- Where: `Tray.tsx:150` to `:155` (the ref's refresh), `:169` to `:171` (`dismissed`), `:146` to `:147` (the reopen); `node_modules/react-native/Libraries/Modal/Modal.js:315` to `:323`.
- Evidence: `Modal.js` calls `this.props.onDismiss` from a `setState` callback, which runs in the layout phase of the commit that carries whatever else was batched with it, before that commit's passive effects. When that commit is the reopen (the render-phase `setShown(true)`), `showing.current` is still false and `onClosed` fires with the tray open. That is the harm P-M2 named: P2-T16's `whenClosed` could open a second tray over this one (R69).
  - The brief's P3 claim ("React runs a commit's pending effects before it starts the next update") holds for sequential commits only. R-e and R-e2 deliver the native end by a microtask inside the hide's own commit (real scheduler, no `act`), and `onClosed` fires once.
  - It fails when the reopen and the end are both pending before React renders: R-d (one `act`), R-d2 (a timer reopens in the task that delivers the end), R-d3 (a click and the end in one `act`), and R-d5 and R-d5b (the end first, then a tap, as two tasks queued before React renders the end's update). Each calls `onClosed` once with the tray open. R-d4 (tap, then the end in a later task) and R-d6 (end rendered, then tap) are safe. 5 of 19 probes fail on `784667b` (`probe-14-final-on-commit.log`).
  - The shipped late-dismissal case cannot see it: its Modal mock calls the latest `onDismiss` between commits (`Tray.render.test.tsx:165` to `:170`, `endDismissal`), not in a commit's layout phase.
- Likelihood is low. The tap or timer must be handled between the native end's dispatch and React's render of it (milliseconds on a free JS thread), inside the window m2 itself targets. Whether RN 0.88 on Fabric gives a press a discrete lane is device-side and unverified here. Before this task, a reopen anywhere between the hide and the native end failed (P-M2); now only this interleaving does.
- Fix, one line: read the render's `shown` instead of the ref, `if (!shown) closed.current?.();`. `Modal.js` reads `this.props.onDismiss` when its callback runs, so the closure is the one of the commit the callback runs in. With it, the shipped Node file passes 4 of 4, the shipped render file 22 of 22 and all 19 probes (`my-mutants-fix1b.out`). The planner's H4 mutant (the ref never refreshed) would no longer exist and would need rewriting; add R-d5b's order as a case.
- Where it goes: a follow-up that lands before P2-T16 builds on the tray (the first host exposed to it). The fix is one line plus one case and could ride in this PR; that changes the reviewed head, so the new commit would need its own check and a fresh CI run. The controller's call.
- Rerun: `cd /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/tray-hardening-review/tree/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/tray/reviewProbe.render.test.tsx` (R-d, R-d2, R-d3, R-d5 and R-d5b fail; 14 pass).

**m-2. Nothing moves during an exit (P5; P2-T13's P12) has no case: the drag reset's `if (visible)` guard is unpinned (mutant X1 survives).**
- Where: `Tray.tsx:202`. The swipe case asserts the position only after the tray reopens (`Tray.render.test.tsx:494` to `:498`), and the cancel case only the way back.
- Evidence: X1 changes `if (visible) drag.value = 0;` to `drag.value = 0;`, so the card is also reset when the tray starts leaving and when the cover comes or goes during an exit. It survives all 22 render cases and the Node file (`my-mutants.out`: `[shipped] 22 passed`). Probe D-a (a swipe past the line, then the exit: the frame stays `translateY(121px)`, also 100 ms on) and probe D-b (the cover arriving and lifting during the exit leaves `translateY(90px)`) pass on `784667b` and fail under X1. Visible effect if it regressed: the card jumps back and then plays its exit from there, instead of leaving from where the finger let go.
- The code is right: P5's ruling, its comment (`Tray.tsx:196` to `:199`) and P2-T13's P12 state the rule. The case is missing.
- Where it goes: P2-T16 (its case for a swipe during a save already drives `dragThrough()`; add the exit position there).

### Nits

**n-1. The tick effect's `hidden` dependency has no case (mutant D2 survives).**
- `Tray.tsx:194`. Removing `hidden` from the dependency list survives all 22 cases and the Node file (`my-mutants.out`, D2). Probe T-b (open, cover, a step change under the cover, lift on the same step, then a step change ticks once) passes on `784667b` and fails under D2: `wasOpen` stays false after the cycle, so the next step change plays no tick. P6 says `visible` and `hidden` are dependencies so that `wasOpen` always holds the commit before's answer. `visible` is pinned (D1 is killed by the full-motion case; probe T-a passes). Effect of a regression: a lost haptic tick after a lock cycle.
- Where it goes: P2-T33 (the real source of `hidden`; its cover cases are where this first changes in a run).

**n-2. iOS's `closed.current?.()` has no case without an `onClosed` (mutant X4 survives).**
- `Tray.tsx:170`. X4 (`closed.current!()`) survives all 22 cases and the Node file (`my-mutants-x4.out`). Every iOS case passes an `onClosed`; the web timer's `?.` is pinned (the swipe case advances the timer with no `onClosed`, `Tray.render.test.tsx:495` to `:497`). A host without `onClosed` on iOS would throw at the dismissal. The line existed at the head (`() => closed.current?.()`); this task only wrapped it in the new guard.
- Where it goes: a follow-up (one case: iOS, no `onClosed`, hide, end the dismissal).

**n-3. A note for P2-T16's `whenClosed`: on iOS `onClosed` can come twice for two hides, and not at all for a Modal that never presented.** Behaviour, not a defect.
- Probe R-c: two reopen-and-close rounds, with both late ends arriving after the second hide, give `onClosed` 1 after the first end and 2 after the second. That is once per hide, as the receipt says, and the first end can arrive while a second dismissal is still under way.
- Probe R-f: a Modal that never presented gets no dismissal, so no `onDismiss` and no `onClosed` for that hide. The head did the same, and P4's reason 2 explains it: `RCTModalHostViewComponentView.mm:166` needs a window, and `:183` to `:203` emit `onDismiss` only from a dismissal's completion. The tray still reopens, and the next real end says closed once. Both probes pass; they document behaviour.
- So `whenClosed` must treat a second call as a no-op and must not assume every hide yields one call. The receipt's SKIPPED device check (a quick reopen on iOS) should also ask whether UIKit sends a dismissal when a present was refused during an in-flight dismissal: a late end that the guard drops then leaves that hide without any `onClosed`.
- Where it goes: P2-T16.

## What was checked, and found right

- **Integrity.**
  - `784667b` on `fix/tray-hardening`, parent `ecc00b7`. The three code files match the planner's `SHA256SUMS.real` (3 OK). The diff is the four files above. The commit message and its Co-Authored-By line follow the protocol.
  - When the reviewer looked, `origin/claude/p1a-vault-core` was `e536a2e`, one controller-state commit after `ecc00b7`, with nothing under `apps/`, `packages/` or the package files. PR #392 is MERGEABLE (I re-read it). The CI section says what has landed on the base since.
- **The planner's two probe files on the commit:** 14 of 15 pass. P-J fails, as the brief says (left to P2-T33 by P5). P-A, P-D, P-E, P-I, P-K and P-M2 now pass.
- **m2 (P3, P4).** The reviewer's probe file uses a Modal that works as `Modal.js` does (a class whose native end calls `setState({isRendered: false}, cb)`, and `cb` calls the latest `props.onDismiss`).
  - Hide then end (R-a): once. Hide, reopen, end (R-b): says nothing, then the next hide and end say it once. Two rounds with both ends late (R-c): 1, then 2. A Modal that never presented (R-f): silent, and the tray reopens.
  - Timing claim: the ref is refreshed in a passive `useEffect` with no dependencies (`Tray.tsx:152` to `:155`), not a layout effect. With the end delivered by a microtask inside the hide's own commit (R-e, R-e2), `onClosed` fires once, because the `setState` the end makes starts a render that first flushes pending passive effects. The exception is a reopen batched with the end (m-1).
  - Web path: the tray passes `onDismiss` only on iOS. With `Platform` set to iOS on react-native-web (the shipped phone cases), the Modal calls `onDismiss` from an effect after its own state update, in a later commit than the one that refreshed the ref, so those cases are sound.
  - P4's reasons: (1) `animationType` none gives animated NO (`RCTModalHostViewComponentView.mm:60` to `:64`), and a JS reopen reaches native in a later commit: verified; the window is the JS side's. (2) A Modal that never presented starts no dismissal, so holding `shown` until `onDismiss` would block reopening: verified (R-f). (3) "A held `shown` would mount the card twice" is not borne out: `Modal.js:253` to `:281` only keeps the same children rendered through `isRendered`, and the card mounts from `visible` (`Tray.tsx:263`). That wording is in the brief only; the code and the receipt do not repeat it. Reasons 1 and 2 stand.
- **m1 (P2).** `closable = visible && !locked && !hidden` (`Tray.tsx:174`).
  - The card, the backdrop, close, the swipe's detector and `onAccessibilityEscape` all sit in the uncovered branch (`Tray.tsx:246` to `:312`) and unmount under the cover; `LockCoverArt` is a decorative View with no pressable.
  - The Modal's `onRequestClose` (`:240`, `requestClose`) was the one route left, and it now asks nothing (the shipped case "under the lock cover nothing asks to close the tray"; H1 rerun, killed on the assertion). Asking resumes uncovered (the same case, second half).
  - Probe C-a: a swipe whose end reaches JS after the cover came closes nothing, and the card is at `translateY(0px)` when the cover lifts.
- **m3 (P5).** The reset effect's dependencies are `[visible, hidden, drag]` (`Tray.tsx:201` to `:203`), body unchanged. H5 rerun, killed; X2 (`visible` dropped from those dependencies) is killed by the swipe case. D-a and D-b show nothing moves during an exit, including a cover arriving or lifting in it; no shipped case pins that (m-2). P-J is left to P2-T33, as P5 says.
- **m4 (P6).** All five scenarios hold.
  - Opening at another step in one render, a step change under the cover, and the cover lifting on another step: the new case (H8 and H9 rerun, killed).
  - A step change in the render that closes: the full-motion case (R16). Reduce Motion: the reduced-motion case ticks once.
  - P2-T13's P11(b) holds, now in one render too. Probes T-a and T-b pass. D1 is killed; D2 survives (n-1).
- **n1 (P7).** In Gesture Handler 3.3.0, `src/v3/hooks/callbacks/eventHandler.ts` sets `canceled` when the state is FAILED or CANCELLED (line 51) and runs the END callback (`onDeactivate`) only when `oldState` is ACTIVE (line 57); I read both. The shipped case: a CANCELLED end at 150 pt springs back from where the drag was cut off (partway between 0 and 150 at 100 ms, then 0), and then the same drag let go closes (H10 rerun, killed). Probe N-a: under Reduce Motion a cancel jumps to `translateY(0px)`, and an ACTIVE to FAILED end never closes.
- **The seams (P10).**
  - With `dismissals.late` false, the Modal mock forwards every prop and the ref, and passes `onDismiss` only when the tray gave one (web: undefined, as before; iOS: an arrow that calls it at once, as the head's own arrow did). The 21 other cases pass with the wrapper deleted (a copy without the mock and with the late case skipped: 21 passed | 1 skipped) and with it (22 of 22).
  - `afterEach` resets the swipe and dismissals seams and deletes `sendAccessibilityEvent` (`Tray.render.test.tsx:91` to `:101`).
  - `dragThrough` uses `SingleGesture.detectorCallbacks.jsEventHandler` and `handlerTag`, a typed member (`v3/types/GestureTypes.ts:46`) that Gesture Handler's own `fireGestureHandler` uses for hook gestures (`jestUtils.ts:437` to `:445`). `package.json` pins `~3.3.0` (patch updates only). The test casts the gesture through `unknown`, so a rename would not fail typecheck, but `dragThrough` would throw a TypeError, and silently dropped events would fail the partway and `onClose` assertions: loud either way.
- **P11, the catalogue case.** It passes with an extra list spread after the tray's in a scratch `index.ts` (restored, hash equal), and K1 and K2 were rerun and killed. The only importer of `Tray` outside its test is `dev/catalogue/wallet/traySections.tsx` (the other hit for `wallet/tray` in the app source is a comment in `theme/motion.ts:134`).
- **The six new cases, the phone case with a header (m5) and the Node lines (m6).** The reviewer read each in full: each asserts what its title says. The lines removed in the diff are only the header note, the old swipe seam, the old phone case and the catalogue case's two lines, so no assertion was dropped.
- **Whole suites** were not run (R100). Bounded risk: only the dev catalogue imports `Tray`, under `__DEV__` (its wallet sections ran: 18 passed). There is no route, app entry, package or lockfile change, so `export:web` is not needed; the iOS export is CI's.
- **Nothing was edited** in the task worktree, the planner's kit, the main checkout or the integration worktree. All probes, the mutant runner and the logs are in `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/tray-hardening-review/` (`probe-*.log`, `my-mutants*.out`, `mutants-sample.out`, `mymutants.py`, `tree/`).

## Mutants

- **Planner's list, a sample of 11 of 34** (H1, H3, H4, H5, H8, H9, H10, B4, O6, K1, K2), run by the reviewer's runner in the scratch copy. All KILLED on an assertion (`AssertionError` x1 each, x3 for H9) and all `restored=True`. I compared the 11 lines with the planner's `logs/mutants.out` (which holds 34 KILLED lines): all 11 are identical. The Node case alone kills O7 (`focusable` dropped) and O11 (`accessible` dropped).
- **The reviewer's own:** D1 (tick effect without `visible`) killed by the full-motion case; X2 (`visible` dropped from the drag reset's dependencies) killed by the swipe case; D2, X1 and X4 survive the shipped suite (n-1, m-2, n-2). FIX1, the proposed one-line fix for m-1, is not a mutant: it passes Node 4, render 22 and all 19 probes.
- **Probes:** `reviewProbe.render.test.tsx` (19 cases) under `tree/apps/app/src/wallet/tray/` in the scratch folder, with the runner `mymutants.py`.

## Notes for later tasks

- **Before P2-T16 builds on the tray:** m-1. Land the one-line fix with R-d5b's order as a case, in this PR or ahead of P2-T16.
- **P2-T16:**
  - n-3: `whenClosed` is a no-op on a second call and must not assume one call per hide. Ask its device check whether UIKit sends a dismissal for a present refused during an in-flight dismissal.
  - m-2: add the exit position beside its swipe-during-a-save case. `dragThrough()` in `Tray.render.test.tsx` shows how to drive Gesture Handler's own handler; it relies on `detectorCallbacks.jsEventHandler` and `handlerTag`, which a patch update of `~3.3.0` keeps and a later minor could rename (it would fail loudly).
- **P2-T33:** n-1 (the `hidden` dependency's case belongs with the cover cases). The rest of m1 and m3 stay with it, as P5 ruled: how LockedScreen reaches a person whose tray is open; whether the card plays its entering when the cover lifts (P-J, which still fails on purpose); where VoiceOver lands; the scroll position. The Sheet should ask nothing while covered.
- **A follow-up on any later PR that touches `Tray.tsx`:** n-2 (one case: iOS, no `onClosed`).
- **E2-A:**
  - The receipt's device checks, all SKIPPED here (no device or simulator): a quick reopen on iOS while UIKit's dismissal ends, Android's back under the cover, a drag the cover cuts off, and a swipe the system cancels. Add to the first: whether RN 0.88 on Fabric gives a press a discrete lane (the likelihood in m-1).
  - n1's flick-up rule stays with E2-A, as the receipt says.
- **If m-1's fix lands:** the planner's H4 mutant (the ref never refreshed) needs rewriting, and the brief's P3 sentence about effects flushing before the next update should say it holds for sequential commits only.

VERDICT: Approved

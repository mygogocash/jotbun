# Confirming review of tray-hardening: the fix round (PR #392, fc78376)

- **Reviewed:** `fc78376` on `fix/tray-hardening` (parent `33edab1`, a merge of the approved `784667b` with `origin/claude/p1a-vault-core` at `6a727dc`). PR #392 (base `claude/p1a-vault-core`) is three commits (`784667b`, `33edab1`, `fc78376`) and four files, +447 -48. The fix commit alone is three files, +155 -23: `Tray.tsx` (316 to 317 lines), `Tray.render.test.tsx` (713 to 817 lines; 22 to 26 cases) and the receipt. `trayGesture.test.ts` is unchanged this round. `git diff --check origin/claude/p1a-vault-core...fc78376`: exit 0. The task worktree's `git status` is empty. The commit message and its Co-Authored-By line follow the protocol.
- **Reviewer:** a size-S workflow (Sonnet): one reviewer for the whole round, a skeptic for any blocker or major, and this synthesis. The reviewer reported no blocker or major, so no skeptic ran and nothing below is marked unverified. It probed in a `git archive` copy of `fc78376` (`.claude/controller/scratch/tray-hardening-confirm/tree`, `node_modules` symlinked) and kept the repo as it was (process notes at the end). I read CI myself and re-checked the evidence repeated here against the commit, `Modal.js`, the test file's seam and the scratch logs; I did not rerun probes.
- **What the round set out to fix:** the first review's (`reviews/tray-hardening.md`, Approved on `784667b`) m-1 (a late iOS dismissal batched with a reopen said the tray closed while it was open), m-2 (nothing moves during an exit: mutant X1), n-1 (the tick effect's `hidden` dependency: D2) and n-2 (iOS with no `onClosed`: X4). n-3 stays a note for P2-T16.
- **Result:** no blocker, no major. m-1 is fixed: the code is the review's one line, all 19 of the first review's probes pass on `fc78376` (the five that failed on `784667b` now pass), and the new case fails on `784667b` and passes on `fc78376`. m-2, n-1 and n-2 are pinned by cases that kill X1, D2 and X4 on assertions. One minor remains, and it is the fix's own: F1 trades m-1's window for a narrower, mirrored one (c-m1). Two nits (c-n1, a test gap; c-n2, stale receipt lines). **VERDICT: Approved**, with one condition: CI never started for this head (next section), so the merge waits for the nine jobs.
- **Ids:** this review's findings are prefixed `c-` (c-m1, c-n1, c-n2) so they are not confused with the first review's m-1, m-2, n-1, n-2 and n-3, the items this round fixes.

## CI (R100: read, not re-run)

Run 42747590350 (`pull_request`, head `fc78376c1bd89a99d2f072c2c7837ea91067dbe3`, created 03:09 UTC on 10 November), conclusion failure. The only other run on the branch is 42738781210 on `784667b` (01:52 UTC), which failed the same way. I read both with `gh pr checks 392 --repo mygogocash/jotbun`, `gh run view`, `gh run list` and the job annotation.

- All nine jobs failed after 2 to 3 seconds with zero steps: Typecheck, unit, API, build; Exports (web and iOS bundles); Render (every file but the per-section suites); Render, per-section suites (three jobs); Edge Worker; SQL integration and ops; Release image and smoke.
- The annotation (read from job 129603299372): "The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings".
- So CI did not run for `fc78376`: no verdict, and not a code failure, because nothing ran. The PR is OPEN, MERGEABLE, mergeStateStatus UNSTABLE, and its head was still `fc78376` when I read it. I did not wait.
- **Merge condition:** the nine jobs must pass once billing is fixed (the handover's `gh run rerun` plan gives it for this head: `gh run rerun 42747590350 --repo mygogocash/jotbun`, if the head does not move). Expected delta: render +10 cases (`Tray.render.test.tsx` 16 at the base, 22 at `784667b`, 26 at `fc78376`, counted with `^test(`; four of the ten are this round's); `trayGesture.test.ts` stays at 4; no file added; no route, app entry, package or lockfile change, so `export:web` is not needed and the iOS export is CI's.
- The base has moved since the merge only by controller-state commits: a diff of `6a727dc` against the local `origin/claude/p1a-vault-core` (`b4ee3e7`) outside `.claude/` is empty. So `fc78376` is still a true merge for code.
- What stood in for CI (the reviewer's focused runs in the scratch copy, no whole suites): `tsc --noEmit` in `apps/app` exit 0; `trayGesture.test.ts` 4 of 4; `Tray.render.test.tsx` 26 of 26 with no stderr line, and 26 of 26 again under five shuffled seeds; the catalogue's wallet sections (`-t bw-`) 18 passed | 572 skipped. Database suites: SKIPPED (Docker stopped; CI runs them).

## Findings

### Blockers

None.

### Major

None.

### Minor

**c-m1. F1 trades m-1's window for a mirrored one: an earlier dismissal's end that is rendered in the same commit as the hide timer's `setShown(false)` still says closed, and the second hide's own end says it again. H3's "exactly one `onClosed`" holds only when the end renders on its own.**
- Where: `Tray.tsx:170` to `:172` (`if (!shown) closed.current?.()`) and its comment at `:164` to `:169`; the receipt's line 9 ("even during a second exit or in the very commit that reopens it"; line 54 describes the same guard); the fix brief's F1 (`briefs/tray-hardening-fix.md:44`: "a late end of an earlier hide that comes while the card leaves again finds `shown` true ... and says nothing; that hide's own end then says the tray closed, once").
- Mechanism: `dismissed` reads the `shown` of the commit that `Modal.js`'s `setState` callback runs in (`Modal.js:315` to `:323`). When that commit also carries the hide timer's `setShown(false)`, `shown` is false there. So an end that arrived while the card was still leaving (the Modal still shown) says closed, and the second hide's own end says closed again: two calls for two hides, the first at the commit that starts dismissal 2. That is the early call H3 was ruled out for. `784667b`'s ref held the previous commit's value (true), so it stayed silent in this interleaving; it was wrong only for the reopen batch (m-1). Each single-source guard gets one batching class right.
- Sequence: close; hide (the Modal hides, dismissal 1 under way); open; close (the card leaves again, the Modal still shown); then, in one act, UIKit's end of dismissal 1 and the last millisecond of the 220 ms timer; then dismissal 2's end.
- Evidence (the reviewer's probes; I re-read the logs, all under `.claude/controller/scratch/tray-hardening-confirm/`):
  - `confirmProbe.render.test.tsx` H3d (a `Modal.js`-like class): `fc78376` gives `onClosed` 1 after the batch and 2 after end 2; `784667b` gives 0 and 1 (`probe-3-confirm-probes-head.log`, `probe-4-confirm-probes-base.log`).
  - The same sequence on the shipped test file's own seam (`seamProbe.render.test.tsx`, case HIDE-END) fails on `fc78376` with `AssertionError: the earlier end, in the commit that hides the Modal again: expected "vi.fn()" to not be called at all, but actually been called 1 times`. It passes on `784667b`, where m-1's case fails instead (`probe-8-hide-end-seam-fc78376.log`, `probe-8-hide-end-seam-784667b.log`).
  - Model run (`modelProbe.render.test.tsx`: every valid sequence of 8 steps over close, open, hide, end, end+open, end+close and end+hide; the reference says an end closes only if the Modal is hidden when it arrives and the tray is still closed after its batch): 141 sequences of length 8. `784667b` deviates in 44, all first at end+open (m-1); `fc78376` in 22, all first at end+hide (`probe-7-model8-*.log`). At length 7: 19 against 7. An earlier attempt's log in the same folder (`probe-3-confirm-len6-fc78376.log`) shows the same sequences ('close > hide > open > close > hideEnd').
- Why minor, not major:
  - (a) The end must be rendered in the commit of the second hide, so UIKit's end must be held up for a full exit (220 ms, 150 ms under Reduce Motion) after two more taps: a narrower window than m-1's, which the first review ranked minor.
  - (b) The outcome is n-3's early and second call, which R-c already gives on both heads when the ends come after the second hide (`[1, 2]`), and which P2-T16's `whenClosed` must tolerate anyway.
  - (c) F1 removes the worse class (a call while the tray is open, P-M2's harm): 44 deviating sequences become 22 of the milder kind. Device behaviour is unverified (E2-A).
- Fix, validated in the scratch copy (candidate COMBO, `confirm_mutants.py`, `own-mutants-6.out`): say closed only if the Modal was hidden in the commit before and is hidden in this one. Restore `showing` (refreshed with `closed`, as `784667b` had it) and write `if (!shown && !showing.current) closed.current?.();`. At callback time the ref still holds the previous commit's value (its passive effects flush before the next render starts) and `shown` is this commit's. With it the shipped 26 and the Node file's 4 pass, and so do the first review's 19 probes, the reviewer's 8, HIDE-END and m-1's case; the planner's 15 pass except P-J (by design); and the model has 0 of 141 deviations. Add HIDE-END as a case (the current guard dies on it; H12 stays killed by m-1's case).
- Where it goes: the controller's call, as m-1 was.
  - Fold the one-line guard and the case into #392, or land it before P2-T16 builds `whenClosed`. Folding changes the reviewed head (a new commit needs its own check, and the CI run that gates the merge is then on it; none has run for `fc78376` either way). It also puts a ref an effect refreshes back beside the render's `shown`, which the comment would have to explain.
  - Or carry it, and qualify with "except when the end is rendered in the commit that hides the Modal again": the receipt's line 9 (and line 54's description of the guard), `Tray.tsx`'s comment at `:164` to `:169`, and F1's sentence in the brief. That costs nothing in code and leaves P2-T16 a first `onClosed` that can come early in one narrow interleaving.
  - The verdict does not depend on the choice.

### Nits

**c-n1. Which `onClosed` iOS's end calls is unpinned: a stale-callback regression of `dismissed` survives every case (the reviewer's mutant M3).**
- Where: `Tray.tsx:170` to `:172` (`dismissed`) and `:149` to `:153` (the `closed` ref).
- Evidence: M3 (`dismissed` memoised on `[shown]`, calling the `onClosed` captured then) passes all 26 render cases, the Node file, the first review's 19 probes and the reviewer's 8. Only an added probe, N1, kills it: iOS, late; hide, pass a new `onClosed` while the dismissal is under way, end; expect the new one called once and the old not (`own-mutants-3.out`). M1 (the render's `onClosed` instead of the ref) survives too, and is equivalent except in the commit that carries the end, where F1 keeps the previous commit's `onClosed` on purpose.
- The only freshness case ("an onClosed given while the card leaves is the one called", `Tray.render.test.tsx:353` to `:365`) runs on the web path, through the hide timer, so it never reaches `dismissed`. F1 made `dismissed` close over a render value, so memoising it is now a plausible refactor; H4 kills that for `shown`, and nothing kills it for `onClosed`. The code is right; the case is missing.
- Where it goes: P2-T16, the first host to pass a new `onClosed` on every render (its `whenClosed` queue).

**c-n2. Receipt: the Status and Base header lines are still round one's, and two more lines read as the PR's totals or omit a file** (`docs/implementation/receipts/tray-hardening.md`; the controller fixes receipt lines itself).
- Line 3, Status: "built and verified locally ... from `ecc00b7`. Not pushed. The independent review is the controller's, after this receipt." Stale: the branch is pushed (PR #392 is open), the Sonnet review approved `784667b`, and the head is `fc78376` on the merge `33edab1`.
- Line 4, Base: "`ecc00b7`. The dispatch named `58be2e2` ... At the base: ... 16 of 16." Round one's base only. The fix section's line 53 gives `784667b` merged with `origin/claude/p1a-vault-core` at `6a727dc` as `33edab1`, so the header and the fix section disagree.
- Line 29 (round one's Gate, CI): "This task adds 6 render cases". The PR adds 10 (16 at the base, 26 at the head, counted with `^test(`); line 69 has the 26.
- Line 53 (the fix section's Base) lists #391's two looks files and "controller state under `.claude/`", but the merge also brought `docs/implementation/receipts/wallet-looks-unstored.md` (`git diff --name-only 784667b 33edab1 -- . ':!.claude'` prints three files).
- Everything else I checked in the receipt agrees with the commit and the fixer's logs: 316 to 317 and 713 to 817 lines, 22 to 26 cases, RED `1 failed | 25 passed`, GREEN 26 and 4, 18 for the catalogue's wallet sections, 40 mutants identical to the planner's, `test:app` 34 and `test:unit` 970 (the last two as the fixer's logs report them; not rerun, R100).

## What was checked, and found right

### 1. m-1 (F1)

- **Integrity.** `Tray.tsx`'s diff against `784667b` is exactly the brief's three hunks: the `showing` ref and its refresh removed, the guard reads `shown`, the comments updated. No other `showing` remains in the tray's folder (only receipt prose). The three tray files match the planner's `SHA256SUMS.real` (3 OK), in the reviewer's archive and in the task worktree (I re-ran `shasum -a 256 -c` there).
- **The first review's 19 probes** (`reviewProbe.render.test.tsx`, the same file as the kit's copy by checksum) pass 19 of 19 on `fc78376`, in four runs (`probe-1-*.log`). On `784667b`'s tray files laid over the same merged tree they give `5 failed | 14 passed` (`probe-2-base-review-probes.log`): R-d, R-d2, R-d3, R-d5 and R-d5b, exactly the five the first review named. The 14 others pass on both. The planner's two first-round probe files on `fc78376`: 14 of 15, and only P-J fails (by design, left to P2-T33 by P5). R-c gives `[1, 2]` on both heads (n-3); R-e, R-e2 and R-f pass.
- **H3's reasoning** holds when the late end renders on its own or with a reopen or a close.
  - The shipped late case (`Tray.render.test.tsx:674` to `:708`: three hides, three ends, exactly one `onClosed`), the reviewer's H3a (an end while the card leaves says nothing, and that hide's own end says it once) and H3b (two reopen-and-close rounds before the Modal hides once give one dismissal and exactly one `onClosed`) pass.
  - Mutant H3 (guard on `visible`) is killed by the shipped late case ("while the card leaves ... called 1 times") and by H3a and H3c.
  - It does not hold when the end renders in the same commit as the second hide (c-m1). With two real dismissals and both ends after the second hide, `onClosed` is once per end (R-c, n-3, unchanged).
- **The render's `shown` is the committed value when `Modal.js`'s callback runs.** `Modal.js:315` to `:323` calls `this.props.onDismiss` from a `setState` callback, so the closure is the latest committed render's. The reviewer's instrumented copy shows it for the shipped one-act case on `fc78376`: "native end handled (setState queued); commit 8: Modal visible false->true, card in DOM true; end callback in commit 8: Modal visible true, card in DOM true" (`probe-3-confirm-probes-head.log`). The same structure on `784667b` ends with `onClosed` called once with the tray open (m-1's failure), so only the guard's data source differs. For the late case's three ends the instrumented seam prints: tray open (Modal visible), card leaving (visible, card absent), hidden (visible false, which says closed).

### 2. The Modal seam (F2) and the one-`act` case (F3)

- **The seam ends a held dismissal as `Modal.js` does** (`Tray.render.test.tsx:30` to `:56`, against `node_modules/react-native/Libraries/Modal/Modal.js:237` to `:324`). `IosModal` has the constructor's `isRendered` state, the `componentDidUpdate` that sets it on false to true, and `end = () => this.setState({ isRendered: false }, () => this.props.onDismiss?.())`. Called alone it commits alone (`endDismissal`, `:176` to `:181`); batched in an `act` with a reopen it runs in the reopen's commit. The ref is forwarded (the focus case passes). With `late` false the other cases behave as before, and the diff removed no assertion (only seam lines and header comments).
  - Caveat only: the seam's `isRendered` is write-only, so children are not kept mounted until the end as `Modal.js`'s `_shouldShowModal` does (`:275` to `:281`). No case asserts on it, and the header comment does not claim it.
- **First-round cases under the new seam.** Comparing round one's 34 mutant lines with this round's, the 31 unchanged mutants have the same first failing case and the same or higher failing counts, the increases being exactly the new cases' killers (H7, H9, R3, R14 and R15 gain one from the lift case; R2 one from the exit case; R25 one and R26 two from m-1's case and the no-`onClosed` case). H2, H3 and H4, rewritten for the new guard, are killed by the late case. The five-seed shuffled-order run of `Tray.render.test.tsx` gives 26 of 26 each time, so the seam leaks no state across cases.
- **F3's one-`act` form reproduces the batched order and fails on `784667b`.**
  - RED reproduced on the reviewer's copy (`fc78376`'s test file over `784667b`'s `Tray.tsx`, `red-render.log`): `1 failed | 25 passed (26)`, only m-1's case, `AssertionError: onClosed while the tray is open: expected "vi.fn()" to not be called at all, but actually been called 1 times`, no module or type error. Run alone, m-1's case fails 6 of 6 on `784667b`'s tray and passes 6 of 6 on `fc78376` (`repeat-red.log*`, `repeat-green.log*`).
  - Controls: splitting the one `act` in two (SB) fails on the fixed tray, because the end then commits alone; reverting the seam to the old between-commits form (SA) also fails on the fixed tray. So the one-`act` form is what batches the two updates, and a future change to either fails loudly rather than silently dropping coverage.

### 3. m-2, n-1 and n-2

X1, D2 and X4 are each killed on an assertion, and the three cases pass on `fc78376` (mutant logs under `mutant-logs/`):
- X1 (m-2, the exit position): `AssertionError: as it leaves: expected 'translateY(0px)' to be 'translateY(121px)'`.
- D2 (n-1, the tick after a lock cycle): `AssertionError: expected "selection" to be called 1 times, but got 0 times`.
- X4 (n-2, iOS with no `onClosed`): `AssertionError: expected [Function] to not throw an error but 'TypeError: closed.current is not a fu...' was thrown`.
- The reviewer's M5 (the drag also resets when the cover comes or goes during the exit) is killed by the exit case's last assertion ("once the cover lifts: expected translateY(0px) to be translateY(121px)").

### 4. Mutants

- **The planner's list, a sample of 10 of 40** (H12, X1, D2, X4, H2, H3, H4, R26, R2, B2), run with the planner's runner in the scratch copy (`mutants-sample.out`). All KILLED, all `restored=True` (SHA-256 checked). Each line is byte-identical to the fixer's `mutants.out` and the planner's `logs/mutants.out`; I re-checked that, and that those two files are identical to each other (40 killed, 0 survived, 40 restored).
- **The reviewer's own** (`confirm_mutants.py`, `own-mutants*.out`):
  - M1 survives (equivalent by F1's design); M3 survives the shipped suite (c-n1).
  - M5 is killed; SA, SA+H12 and SB (controls for the seam and the one-`act` form) are killed.
  - H3p and H12p (H3 and H12 against the extra probes) are killed. H12 is also killed by C1, R-d, R-d2, R-d3, R-d5 and R-d5b.
  - COMBO (the c-m1 candidate) passes everything but the by-design P-J.

### 5. Gate and scope

- Focused gate on `fc78376` in the scratch copy (R100, no whole suites): the numbers are in the CI section. The fixer's logs agree with the receipt (RED `1 failed | 25 passed`, GREEN 26 and 4, `test:app` 34, `test:unit` 970; the last two not rerun here).
- Scope: no export, prop or type change; no `premium-progress.md`, `en.json`, `th.json`, package, lockfile, route or app-entry change.

### Process notes

- The scratch folder already held artifacts of an earlier attempt of this review (10:13 to 10:19 local), including a full `git archive` in `tree/` with `node_modules` symlinks. The reviewer extracted its archive over it (every tracked file overwritten; the only files in `apps/` and `packages/` that are not in `fc78376` are its five probe files) and overwrote its `confirmProbe.render.test.tsx`. That attempt's logs agree with the reviewer's, and its model probe found the c-m1 sequences.
- The reviewer's own `ln -s` created two stray self-referencing symlinks inside the task worktree's ignored `node_modules` (`node_modules/node_modules` and `apps/app/node_modules/@better-auth/@better-auth`), because that older tree already held links. It removed exactly those two with `unlink`. I checked that both are gone and that the worktree's `git status` is empty. The reviewer reports nothing else in the worktree or the main checkout was touched, and nothing of its own kept under `/private/tmp`.

## Notes for later tasks

- **Before the merge (controller):**
  - Rule on c-m1: fold the combined guard and the HIDE-END case into #392, or carry it with the qualified texts (see the finding).
  - Fix the receipt's stale lines (c-n2).
  - CI: the nine jobs must pass once billing is fixed.
- **P2-T16:**
  - c-n1: add the iOS freshness case (hide, pass a new `onClosed` while the dismissal is under way, end; the new one is called once and the old not), since it is the first host to pass a new `onClosed` on every render.
  - n-3 still stands: `whenClosed` treats a second call as nothing and must not wait on one call per hide. If c-m1 is carried, its first call can also come early, at the commit that starts the second dismissal. Keep `whenClosed`'s queue in a ref (F1: iOS's `onClosed` is the one the commit before the end's left).
  - Its swipe-during-a-save case can drive `dragThrough()`; the exit position is pinned here now (m-2).
- **P2-T33:** n-1 is pinned (the `hidden` dependency), and P-J still fails on purpose; the rest of the first review's m1 and m3 notes stand as written there.
- **E2-A** (all SKIPPED here, no device or simulator): a quick reopen on iOS while UIKit's dismissal ends; whether RN 0.88 on Fabric gives a press a discrete lane; how long UIKit's end can lag (c-m1 needs it to outlast a full exit after two more taps); Android's back under the cover; a drag the cover cuts off; a swipe the system cancels; n1's flick-up rule.
- **Any later change to the iOS path of `Tray.tsx` or to the test's Modal seam:** m-1's case (and HIDE-END, if added) queue UIKit's end and the tap inside one `act`, so one commit holds both. Keep it so: on two separate acts the end commits alone and the case fails on the fixed tray (control SB). The seam's `isRendered` is write-only (see item 2); a later case that asserts on the card during a held dismissal would need it read.
- **If c-m1's fix lands:** the planner's H12 stays killed by m-1's case, the current guard dies on HIDE-END, and F1's sentence about a second hide becomes true as written; `Tray.tsx`'s comment at `:164` to `:169` would then name two sources for one rule.

## Scratch evidence

All paths are under `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/tray-hardening-confirm/`.

- **Probes** (in `tree/apps/app/src/wallet/tray/`): `confirmProbe.render.test.tsx` (H3a to H3d, C1, N1, S1, S2), `seamProbe.render.test.tsx` (HIDE-END), `modelProbe.render.test.tsx` (the model), and the first review's `reviewProbe.render.test.tsx` (19). Logs: `probe-1-*` (the 19 on `fc78376`), `probe-2-base-review-probes.log` (on `784667b`), `probe-3-*` and `probe-4-*` (the confirming probes on both heads), `probe-5-seam-log.log`, `probe-6-planner-probes-head.log`, `probe-7-model*-*.log`, `probe-8-hide-end-seam-*.log`.
- **Mutants:** `mutants-sample.out` (the planner's runner, 10 of 40), `confirm_mutants.py` with `own-mutants*.out`, `mutant-logs/` and `own-mutant-logs/`, `compare_rounds.py` with `round1-mutant-heads.txt` and `round2-mutant-heads.txt`.
- **Gate and RED:** `focused-1-render-fc78376.log`, `focused-2-unit-fc78376.log`, `focused-3-catalogue-bw-fc78376.log`, `typecheck-head.log`, `shuffle-seed1.log` to `shuffle-seed5.log`, `red-render.log`, `repeat-red.log*`, `repeat-green.log*`.

VERDICT: Approved

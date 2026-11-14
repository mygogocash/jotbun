# P2-T18a second review (money, wallet and privacy): Shell guards before the wallet shell: today's total, PV1 and the new-wallet flow

- **Reviewer:** Claude Sonnet 5.5, the independent second reviewer, read-only. Nothing was edited, committed or pushed in any worktree or in the main checkout. `git status --short` in the task worktree prints nothing after my runs, and its HEAD is still `fc58825a`. Every probe and mutant ran in a scratch copy under `.claude/controller/scratch/p2-t18a-second/`.
- **Independence:** I read no other review of this task. No `reviews/P2-T18a*` file existed when I listed the folder, and I wrote this before looking for one.
- **Subject:** PR #464 (`mygogocash/jotbun`, base `claude/p1a-vault-core`), commit `fc58825a` on `p2/t18a-shell-guards`, range `origin/claude/p1a-vault-core...fc58825a` after `git fetch` (merge base `6961bba1`). The PR head on GitHub is `fc58825a178d`, the same commit. One commit, 11 files, `git diff --check` over the range prints nothing.
- **Read:**
  - the protocol (R87, R100, "Reviewers"); the brief `briefs/P2-T18a.md` (P1 to P16) and the planner's kit (`stage.py`, `mutants.py`, `files.txt`, `real/`);
  - the plan's Global Constraints (lines 82 to 108) and `### Task P2-T18` (lines 1053 to 1091); followups lines 695 to 718 and 830 to 860;
  - the reviews the task carries: `P2-T17.md` (m1, m2), `P2-T17-second.md` (m1, m2b, with the prototype `m1-prototype-fix.diff`) and `P2-T21-confirm.md` (m1, m2, m3, n1, n2);
  - the receipt `receipts/P2-T18a.md`, the two corrected receipts, the implementer's logs in `scratch/p2-t18a/`;
  - the code the guards depend on: `spendDiary.ts` (phases, `refresh`, the `ready` emit), `SpendDiaryContext.tsx`, `diaryRepository.ts` (`applyChangeGroups`, `resolveCommands`, `setCommandState`), `serialDatabase.ts`, `reconcile.ts` (`resolve`), `syncEngine.ts` (where `ackedRevision` is set), `executor.ts`, `history.ts` and `retention.ts` on the edge, `a11y.ts` (`useAnnouncement`), `DeviceDiaryProvider.tsx`, `savedScreens.tsx`, and in `node_modules` React Native 0.88's `ViewShadowNode.cpp` and `sliceChildShadowNodeViewPairs.cpp`, Reanimated 4.7.1's `LayoutAnimationsProxyCommon.cpp` and expo-router 58's `StackRouter.js`.
- **Code identity:** the 10 files of the commit are byte-identical to the planner's `real/` (`cmp`, 10 of 10 against `tools/files.txt`). So this review judges the planner's design as shipped. The commit's message is worded to the code (the implementer corrected the brief's draft, receipt "Deviations").

## Result in one paragraph

The money path holds and I could not break it. Today's total is shown only when the read and the diary are one moment, and I could not build a timing that shows a wrong figure: a command can leave the outbox only after the diary has applied its revision (`applyChangeGroups` sets `applied_revision`, then `resolve` deletes the command, on one FIFO connection), so `applied > as_of_revision` is a sound detector for race A, and `ackedRevision` and `as_of_revision` are the same counter (`retention.ts:125-126`, `executor.ts:76-81`, `history.ts:88-91`). The strict `>` is not cosmetic: for an online save with a live diary the diary applies exactly the save's own revision while the read is served at that revision, so `applied === R` is the common case, and the twin case pins it. Private mode holds on iOS (PV1), the new-wallet flow and the editor leave once, the `nativeID` does what the receipts now say (I re-read React Native's source for it), and the two corrected receipts are accurate. There is no blocker and no major. The findings are test gaps: four guards the task itself adds have no committed case (my mutants O6, O1, O2 and O9 survive all 20 committed cases of the file and are killed by one case of mine each), and the code is right in each. Three nits and the notes follow.

## CI (R100)

`gh pr checks 464 --repo mygogocash/jotbun`, read three times (the last just before I wrote this): all nine jobs are **pending** (run 43483047135, head `fc58825a178d`), queued org-wide. No job log exists to read, so there are no CI counts to quote. I reviewed on local evidence.

What CI must still show at `fc58825a`:
- **Typecheck, unit, API, build:** `typecheck:app` (I ran it in the scratch copy: exit 0 in 5 s, and `--listFilesOnly` shows the four changed files and tests are in it), `typecheck:routes`, `test:app` (the implementer's log: 37 of 37), `test:unit` (1110 of 1110 in the implementer's log, the Hermes guard included; the one I found, `src/testing/hermesGlobals.test.ts`, only forbids Web Crypto globals, which no changed source uses).
- **Render (every file but the per-section suites):** the three focused files (54 of 54 at my run), the four routes tests (17 of 17 at my run) and the eight kit files (142 of 142 in the implementer's log).
- **Render, per-section suites (three shards):** the catalogue's every-section and screen-reader suites over `bw-saved-*` and `bw-wallet-*` (the implementer's log: 24 passed). The saved sections mount the host on `diary: null` or an offline diary (`savedScreens.tsx:62-73`), so `bw-saved-toast` still reads ฿182.
- **Exports (web and iOS):** no route, config or entry change, and no new import in any changed source.
- **Edge, SQL integration and ops, release image:** nothing outside `apps/app` and two receipts changed.

## What I checked, against the controller's focus

**P3, today's total: race A and the closed diary. Holds.**
- **`moved`** (`SavedToastHost.tsx:147`) is `now.phase === 'ready' ? BigInt(now.appliedRevision) > BigInt(page.as_of_revision) : openAtStart.current`, read from `latest.current` in the tick the answer lands. The view's `outbox` and `appliedRevision` are one snapshot: `refresh` (`spendDiary.ts:154-161`) queues its three reads in one synchronous tick on a single FIFO connection (`serialDatabase.ts:13-24`), so no write falls between them. A view that lags the store by a sync run is stale but consistent, and still gives the right figure (the old view still holds the draft the read does not list).
- **Every "not one moment" case says unknown.**
  - The diary applied a revision past the read's (race A): `applied > R`. A command committed after the read can only have left the outbox once the diary applied that revision (`applyChangeGroups`, then `resolve`, `reconcile.ts:62-76`; `replaceConfirmed` sets the high-water mark too), so no command can be missing from the outbox with `applied <= R`.
  - The diary was open at the start and is not `ready` now (`unavailable`, `opening`, `locked`): `openAtStart`.
  - A page with more behind it, or a failed read: unchanged.
- **No exact moment is made unknown for nothing.**
  - `applied === R` shows a figure (the twin case, H2 kills `>=`). `applied < R` shows a figure.
  - No diary at all (the web, the catalogue's `diary: null`) shows the read alone, and a diary `locked` from the start does too: a P2-T17 case already pins it (`SavedMoment.render.test.tsx:441-445`, which H5 kills).
  - The cost of the rule is a plain toast when another device's change is applied while the read is out. Rare and safe, as the P2-T17 review said.
- **P2-T17's own probes pass on the shipped code** (`run-p17-probes.log`, 16 of 16): the first review's R1 to R6, PV1, U1 and F1, and the second review's seven. One of the second review's probes, "undercount", still prints ฿82 where 132 is true. That is not a defect: it drops the draft from the outbox with `appliedRevision` left at 0, a state no diary can reach (a command leaves only after its revision is applied). The shipped race A case advances it to 11 and gets `บันทึกแล้ว`.

**P4, race B. Holds.**
- `todayOutMinor` leaves out an `acknowledged` command whose `ackedRevision` is at or before `readRevision` (`savedMoment.ts:79`). It is the same counter on both sides. `ackedRevision` is the `committed_revision` of the command's acknowledgement (`syncEngine.ts:147`, `:203`), which is `appendChanges`' `UPDATE sync_state SET revision = revision + 1` (`retention.ts:125-126`; `executor.ts:76-81`); `as_of_revision` is `SELECT revision FROM sync_state` read in the same transaction as the page's rows and totals (`history.ts:88-91`, `:118-126`).
- Comparisons are BigInt on both sides (M3 and H3 kill text compare: "9" sorts after "10"). `ackedRevision` and `readRevision` are validated as revisions before they get here (`diaryRepository.ts:448`, `resources.ts:170`), so `BigInt` cannot throw on them.
- The guard reaches only `acknowledged`: an `uncertain` command has its `acked_revision` set to NULL when it moves there (`diaryRepository.ts:456`), so no other state could carry a revision.

**P5. Holds.** Every sum is BigInt and nothing is added. A scan of the four changed sources for `Number(`, `parseInt`, `parseFloat`, `toFixed`, `Math.` and `console.` finds nothing; added lines hold no em dash or emoji.

**P6, PV1. Holds, and the case is strong.**
- Private mode on, iOS set after the mount (`Object.defineProperty(Platform, 'OS', ...)` after `mount`, restored in `afterEach`), a spy on `announceForAccessibility`, an online save, then Undo: the announcements are exactly `['บันทึกแล้ว · วันนี้ ซ่อนยอดเงินอยู่', UNDONE_DELETED]`, none has a digit or the typed name, and nor does the toast's text or any `aria-label` (`SavedMoment.render.test.tsx:683-698`). `useAnnouncement` reads `Platform.OS` at call time (`a11y.ts:46-47`), which is why setting iOS after the mount works.
- H7 (the announcement built from the unmasked words) is killed on my rerun. I did not find another way to a digit: the plain and offline words hold none, the chip draws no title, and until the setting is read `hidden` is true.

**P7 to P10, the flow and the editor. Hold.**
- **`leave()` once** (`NewWalletFlow.tsx:130-136`): the ref is checked and set before both branches. The case presses step 1's back twice, then step 2's back twice with a lost create answer, in one `act` each. The setup case's second press is now a mount of its own (`NewWallet.render.test.tsx:307-332`). My PF1 (the flow under `StrictMode`, two presses: one `router.back`) and PF2 (`canGoBack` false, two presses on step 1 and on step 2: one `router.replace`) pass on the commit. The ceremony's เสร็จ is not behind `leave()`; two quick presses call `router.dismissTo` twice (my PF3 shows 2), which is harmless: expo-router's `POP_TO` finds the destination already current and re-reconciles to the same state, and a destination not in the stack is replaced in, not pushed (`StackRouter.js:382-436`).
- **The card's `nativeID`** (`NewWalletFlow.tsx:391`): I re-read React Native 0.88. `ViewShadowNode.cpp:47` puts `nativeId` in `formsStackingContext`, while `testId` is only in `formsView` (`:66`); `sliceChildShadowNodeViewPairs.cpp:119` hoists the children of a view that forms no stacking context into its ancestor. So a `testID` alone leaves the card in the scroll content (the earlier fall of about `insets.top + 268` pt), and the `nativeID` keeps it in the place. Reanimated ignores a `nativeID` that is not 1 to 9 digits (`LayoutAnimationsProxyCommon.cpp:105-118`), so the string is inert there. The web case reads the element's `id` (W3 killed on my rerun). The 200 pt on a phone is source-verified only; the device check stays SKIPPED.
- **Step 2's back after a refusal** (`NewWalletFlow.tsx:220-222`): `unconfirmed === null ? () => setStep(1) : leave`, held only while `saving`. The case runs `signed_out` and `upgrade_required`: back enabled, goes to the kinds, no router call; เพิ่มกระเป๋า held only for the update (W4 and W5 killed by the planner; the case passes at RED by design).
- **The editor's ref under StrictMode** (`WalletEditScreen.tsx:150-158`): the effect sets `left.current = false` in its body and `true` in its cleanup. Under the double run the sequence is mount, cleanup, mount, ending `false`; in production it is `false` until the real unmount. A new `key` starts a fresh ref. E1 killed on my rerun, and my OE1 (the cleanup sets `false`) is killed by the committed suite.

**P11, the receipts. Accurate.**
- `P2-T21-fix.md` lines 34 and 35 now say the 200 pt fall holds on the web, and on a phone since P2-T18a, and that a `testID` makes a view but not a stacking context while Fabric hoists its children (this is what the source says). The m3 risk (leaving with an unknown answer loses the chosen look and its `wallet_added`) is among the Risks and names the owner's E2-B choice, as followups line 716 asks.
- `P2-T21.md` lines 67 and 80 say "since P2-T18a's `nativeID`", with the old figure for a phone. Nothing else in the receipts or the docs still says a `testID` keeps the place (`grep` over `docs`, `apps` and `packages`); `P2-T21.md:20` is history ("the fix round gives it its own place").
- `P2-T18a.md`: the counts agree with the implementer's logs (base 7 and 47, RED 1 of 8 and 6 of 54, GREEN 8 and 54, gate 37, 1110, 17, 142, 24 passed and 658 skipped), and the diff stat checks (253 insertions less the receipt's 48 is 205).

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. Four guards of the task's own new code are held by no committed case. The code is right in each; my mutants survive.**

I ran each against the committed suite for its guard (`own_mutants.py`, `own-mutants.out`). Each survives all 20 cases of `SavedMoment.render.test.tsx`, and one case of mine kills it (`probes/SecondSaved.append.tsx`, all six pass on the commit). The brief's step 5 says to add a test for every survivor; the planner's 20 mutants did not include these.

- **m1a. Which revision reaches `todayOutMinor` (O6).** O6 passes `readRevision: now.appliedRevision` instead of `page.as_of_revision` (`SavedToastHost.tsx:155`), the slip the controller's "same counter" question is about. H6 only drops the argument. Race B's render case has the diary at 9 and the command at 9, so both values give the same answer. Probe PS3 (the command acknowledged at 10, the read at 10, the diary behind at 9; the read must not count it) kills O6.
- **m1b. Race A with a diary that was not open as the toast began (O1).** O1 is `openAtStart.current && BigInt(...) > BigInt(...)` in the ready branch. Race A's case starts ready, so a diary that opens during the read (`opening`, then `ready` with applied 11) is never tried. The code says unknown, rightly: a diary opening mid-read can run its first sync and reconcile before the answer lands. Probe PS1 kills O1.
- **m1c. The closed diary is pinned for one phase (O2).** The closed diary's case sets `unavailable` (`SavedMoment.render.test.tsx:678-681`). O2 reads `locked` and `opening` as open (`now.phase !== 'unavailable'`), which would count no draft for a diary that closed mid-read. Probe PS2 (`locked`, then `opening`) kills it. `locked` is a real way to get there: a remote sign-in refusal sets it (`spendDiary.ts:173-176`, `onOutcome`).
- **m1d. The online variant (O9).** P3 extends the guard to online saves on purpose ("an online save made with the diary open counts the outbox's other drafts too"), yet `raced` hard-codes `via: 'device'`. O9 guards a device save only and survives. Probe PS6 (an online save, the diary's other draft committed after the read and applied; then the diary locks) kills it.
- **Fix:** four cases in `SavedMoment.render.test.tsx`, about 40 lines, built on the existing `raced` (give it a `via` argument). PS1, PS2, PS3 and PS6 are ready to copy. **When:** this task's fix round, or the next task that edits `SavedToastHost.tsx` (it is P2-T18's neighbour). Not a merge blocker: the figure is informational and short-lived, and the code holds today.

### Nit

**n1. The flow's once-only guard is pinned for `router.back` only (OF1).** OF1 moves the guard inside the `canGoBack()` branch, so `router.replace(destination)` runs on every press. It survives the 18 committed cases. Probe PF2 (two quick presses with nothing to go back to, on step 1 and on step 2 with the answer unknown) kills it. Harmless today (a second `replace` to the same destination changes nothing visible), but the deep-link and web-reload entry is exactly where `canGoBack()` is false. One case, in the same `act` shape as the committed one.

**n2. The new comment's "flattened away" is imprecise** (`NewWalletFlow.tsx:388-390`). It says a test id alone "is flattened away on Fabric". The place is not flattened: a `testID` makes it a real host view (`FormsView`), and what Fabric hoists is its children, so the card's mounted parent becomes the scroll content. The receipts say it exactly ("a `testID` makes a view but not a stacking context, and Fabric hoists such a view's children"). The old comment was wrong for the same conflation, so this one is worth saying right: "a test id alone makes a view that Fabric still hoists the card out of; a `nativeID` makes it a stacking context".

**n3. The editor's header back is not once-guarded before the form exists (outside this task).** `WalletEditScreen`'s own `goBack` (`WalletEditScreen.tsx:88-91`) drives the header in the loading, error and gone states (`:111`); only `EditForm` wraps it in `leave()`. Probe PE1 (the wallets read held, `กลับ` pressed twice in one `act`): `expected [ 2, [] ] to deeply equal [ 1, [] ]`. It is P2-T21-era code, P10 is about the ref only, and the loading window is short, so I rank it a nit; but it is the same class as the flow's m2, and the confirming review's "the editor navigates once" does not cover it. For P2-T22, which edits this screen.

## Mutants

**The planner's, a sample of 10 of 20, rerun with its own `mutants.py` on my tree** (`planner-sample.out`): M2, M3, M6, H2, H3, H4, H5, H7, W3 and E1 are all **killed**, each failing case an `AssertionError`, each file restored with an equal sha256. After every run the four source files and the four test files equal the commit's blobs (`cmp` against the worktree).

**Mine** (`own_mutants.py`; each against the committed suite first, then my probe copy if it survived; `own-mutants.out`):

| Id | Mutant | Committed suite | My probe |
| --- | --- | --- | --- |
| O1 | race A ignored for a diary not open at the start | **survived** (20 passed) | killed by PS1 |
| O2 | `locked` and `opening` read as open (`!== 'unavailable'`) | **survived** | killed by PS2 |
| O6 | the diary's applied revision handed to `todayOutMinor` | **survived** | killed by PS3 |
| O9 | race A and the closed diary guard a device save only | **survived** | killed by PS6 |
| OF1 | the flow's once-only guard covers `back` only | **survived** (18 passed) | killed by PF2 |
| O7 | `opening` or `locked` at the start counts as open | killed (1 failed) | |
| O8 | `\|\|` for `&&` in the total's guard | killed (3 failed) | |
| OF2 | the `nativeID` on the card, not its place | killed | |
| OE1 | the editor's cleanup sets `false` | killed | |

## Runs (mine)

- **Focused, on the unmodified commit** (the machine's load average was about 6, no case timed out, so there is no flake to record):
  - `savedMoment.test.ts`: 8 of 8 (`run-unit-base.log`).
  - `SavedMoment`, `NewWallet` and `WalletEdit` render files: `Test Files 3 passed (3)`, `Tests 54 passed (54)`, no `stderr |`, `Unhandled` or `not wrapped in act` (`run-render-base.log`). The one `ESM syntax in a file loaded as CommonJS` line is the vitest config's, present in the base run too.
  - The four routes tests: `Test Files 4 passed (4)`, `Tests 17 passed (17)` (`run-routes.log`).
  - `typecheck:app`: exit 0 (`run-typecheck.log`).
  - `git diff --check origin/claude/p1a-vault-core...fc58825a`: no output.
- **My probes on the commit:** PS1 to PS6 pass (the code is right), PF1 and PF2 pass, PF3 documents two `dismissTo` calls (harmless), PE1 fails on the editor's loading-state back (n3). The 20 committed cases and my 6 pass together (26 of 26, `run-probe-saved-all.log`).
- **Not run, as R100 says:** the whole render suite, `test:unit`, `test:app`, the eight kit files, the catalogue suites, `export:web`, the iOS export, the database and edge suites, `test:ops` (CI's, above). `typecheck:routes` and `export:web` need no run: no route changed and no import was added.
- **SKIPPED, device:** the drop on a phone with the `nativeID`, VoiceOver hearing the masked toast in private mode, and two quick presses on back on a phone.

## Notes for later tasks

- **Test pins to add (m1, n1):** PS1, PS2, PS3, PS6 and PF2 are ready in `scratch/p2-t18a-second/probes/`. A fix round for this task, or the first step of the next task that edits `SavedToastHost.tsx` or `NewWalletFlow.tsx`. The test-only pins from followups lines 850 onwards (the 00:30 Bangkok day, the toast's box and touches, where the chip starts) are still open.
- **P2-T18 (the shell):** the plan's layout order puts `SavedToastHost` under `DeviceDiaryProvider` (`spendLayoutOrder.test.ts`), and these guards rely on it: outside a diary provider the view reads `unavailable` from the start, so neither guard could fire. Keep that order test.
- **P2-T22:** n3, the editor's header back in its loading, error and gone states (PE1). It is also the screen that gains a kind (P2-T21's m3).
- **Residuals the guard does not claim, for a future pass over `spendDiary.ts`:**
  - `switchTo` emits `phase: 'ready'` with the placeholder `outbox: []` and `appliedRevision: '0'` until `refresh` finishes (`spendDiary.ts:214-215`). A read landing in that millisecond window after a reopen mid-toast would show a figure without the outbox. Emitting `opening` until the first refresh would close it. Not worth a fix alone.
  - A diary `locked` or `opening` for the whole toast reads like no diary, so the figure is the read alone and omits that diary's drafts. P2-T17 pinned it deliberately (`SavedMoment.render.test.tsx:441-445`); say so to the owner if "unknown" is ever wanted there.
  - A command in `sending` or `uncertain` that the read does not list and that was deleted elsewhere still counts: it has no revision, so nothing can say.
- **Probes in the scratch folders:** `scratch/p2-t17-second/probes/Probe.render.test.tsx` "PROBE undercount" builds a state no diary reaches (the outbox empties with `appliedRevision` unchanged) and still prints ฿82 on the shipped code. Use race A's case or the first review's R1, which advance the applied revision.
- **E2-B and device checks:** the 200 pt drop on a phone is source-verified only; the simulator check is the proof. The ceremony's two exits are idempotent (`POP_TO`), so "two quick presses on เสร็จ" needs no guard, only a glance on a phone.

## Evidence index (all under `.claude/controller/scratch/p2-t18a-second/`)

- `tree/`: `git archive fc58825a`, `.claude/` removed, `node_modules` and `apps/app/node_modules` linked from the worktree. The four source files equal the commit after every run. My added files there: `apps/app/src/wallet/saved/SecondSaved.render.test.tsx`, `OpusP17.render.test.tsx`, `SonnetP17.render.test.tsx`, and `apps/app/src/wallet/wallets/SecondFlow.render.test.tsx` and `SecondEdit.render.test.tsx` (each a copy of a committed suite with my cases appended).
- `probes/SecondSaved.append.tsx`, `SecondFlow.append.tsx`, `SecondEdit.append.tsx`: only my appended cases (PS1 to PS6, PF1 to PF3, PE1).
- `own_mutants.py`, `own-mutants.out`, `own-mutant-logs/`: my nine mutants. `planner-sample.out`, `planner-sample-logs/`: the sample of ten.
- `run-unit-base.log`, `run-render-base.log`, `run-routes.log`, `run-typecheck.log`: the runs on the unmodified commit. `run-probe-saved.log`, `run-probe-saved-online.log`, `run-probe-saved-all.log`, `run-probe-flow.log`, `run-probe-edit.log`, `run-p17-probes.log`: the probes.

VERDICT: Approved

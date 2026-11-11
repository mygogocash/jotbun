# Brief P2-T33 fix round: the receipt photo under the lock, and both reviews' minors and pins (R107)

You are the fixer for the P2-T33 fix round. PR #406 (branch `p2/t33-face-id-lock`, commit `5844e4c1`) adds the Face ID lock. Its first review (`reviews/P2-T33.md`) approves it with four minors and six nits. Its second review, the privacy one (`reviews/P2-T33-second.md`), says **Needs fixes** for one major:

- **M1.** The record's receipt photo shows over the locked app. `ReceiptViewer` (`apps/app/src/screens/redesign/import/ReceiptParts.tsx`) is a full-screen `Modal` of its own and never reads `useLockCover()`. A Modal draws above the app's root, so the gate's cover lies under it: with the lock on, the photo stays drawn, named and pressable over the lock screen.
- **The controller's ruling R107** (11 Nov, `handover.md` under "#406 (P2-T33)"):
  - the viewer draws the cover as `Sheet` does, and every `Modal` in `apps/app/src` is swept;
  - the first review's m2, m3, m4 and n4, and the second's m2 to m5 and n1, are fixed;
  - the first review's n1, n2, n3 and n5 are pinned, and its n6 is fixed if cheap;
  - the first review's m1 and the second's m1 and m6 are carried, not fixed;
  - every new guard gets a mutant, and every RED fails on an assertion.
- **The controller's leave:** you may edit `ReceiptParts.tsx` and the other Modal files (this round needs none of the others), and `ui/a11y.ts`.

The planner wrote every file below and proved it in scratch copies of `5844e4c1`:
- RED: the round's tests on `5844e4c1`'s code, with one typed stub (`lockModel.ts` gets its two new exports as pass-throughs). Every new case that guards a fix fails on an assertion;
- the pins whose code is already right: nine review survivors, each killed by its new pin on `5844e4c1`'s code;
- GREEN;
- 166 mutants, all killed: the first round's 121, re-aimed where this round moved their text, and 45 new;
- R100's fast local gate.

You copy the planner's files, check them by checksum, prove RED, the pins, GREEN and the mutants in your own worktree, run the gate, write the receipt and commit. Do exactly what this brief says.

Read first:
1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only, and no whole-suite total anywhere. R87 applies: your receipt is its own new file, `docs/implementation/receipts/P2-T33-fix.md`. Do not edit `premium-progress.md` or `receipts/P2-T33.md`.
2. The two reviews: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T33.md` (m1 to m4, n1 to n6) and `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T33-second.md` (M1, m1 to m6, n1).

## Paths and rules

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t33` (branch `p2/t33-face-id-lock`, head `5844e4c1`, `node_modules` installed). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t33-fix`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t33-fix-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the round's eleven files at their repo paths, nine changed and two new (`files.txt` lists them);
  - `orig/`: `5844e4c1`'s nine (each checked against `git show 5844e4c1:<path>`);
  - `stubs/`: the RED form of `lockModel.ts`;
  - `diffs/`: one diff per file, `<path with / as _>.diff`, with the paths `a/<repo path>` and `b/<repo path>`. They are for reading: the planner checked that each turns `orig/` into `real/` byte for byte (`git apply --whitespace=error-all`). The code diffs are also in the appendix;
  - `tools/`: `mutants.py` (the runner), `stage.py` (the planner's stages: `orig`, `red`, `green`) and `sums.py` (writes the kit's checksums);
  - `files.txt` (the eleven) and `shared.txt` (the four that are not P2-T33's own files: `ReceiptParts.tsx`, `sync/announce.ts`, `ui/Sheet.tsx` and `ui/a11y.ts`);
  - `SHA256SUMS` (the kit) and `SHA256SUMS.logs` (the planner's `logs/`);
  - four lists to check WT with `shasum -a 256 -c`, paths relative to WT:
    - `SHA256SUMS.orig-in-wt`: `5844e4c1`'s nine files;
    - `SHA256SUMS.red-in-wt`: the RED stage's eleven (the four tests and `copy.ts` from `real/`, `lockModel.ts` from `stubs/`, the five other code files from `orig/`);
    - `SHA256SUMS.real-in-wt`: the eleven `real/` files;
    - `SHA256SUMS.datechip-in-wt`: `5844e4c1`'s `apps/app/src/ui/DateChip.tsx`, which mutants MS1 and MS2 edit and the runner restores.
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above. Git: `/usr/bin/git -C WT <command>`, one git command per call. Focused Node files: `cd WT/apps/app && npm run test:unit -- <files>`. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`.
- No heavy lock is needed: no database suite and no workers pool. Docker is stopped and stays stopped.
- **Do not merge the integration branch into this branch.** The fix commit goes straight on top of `5844e4c1` (ruling P1).
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. One exception: a load flake, a case that times out under load in a file this round does not touch. Rerun that file alone once, and record both runs.
- Every log is your own run. Never copy the planner's logs in place of one.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/screens/redesign/import/ReceiptParts.tsx` | **shared** (R7's; R107's leave). `ReceiptViewer` reads `useLockCover()`: while hidden it draws `<LockCoverArt />` in place of the photo, Android's back asks nothing, the web layer is unnamed (P2). |
| `apps/app/src/ui/a11y.ts` | **shared** (the kit's; R107's leave). A quiet flag the gate sets while its cover is up: `setQuietUnderLockCover(quiet)`. `announcePolitely` says nothing while it is set, and `announceOverLockCover` is the lock's own way past it (P10). |
| `apps/app/src/sync/announce.ts` | **shared**, one line. `announceStatus` goes through `announcePolitely`, so it is quiet under the cover too (P10). |
| `apps/app/src/ui/Sheet.tsx` | **shared** (P2-T33 changed it). A comment only: under the cover a sheet's children unmount, so a child's own state starts again (P14). |
| `apps/app/src/ui/lockCover.test.ts` | **new**, Node, 2 cases. The Modal sweep, read from the sources (P3). |
| `apps/app/src/wallet/lock/LockGate.tsx` | The first ask waits for the phone; an opening counts as asked once its prompt starts; `finally` resets; the port's types; turning on stored fail-closed; quiet below the cover; the keyboard; an unreadable setting turns off silently (P4 to P12). |
| `apps/app/src/wallet/lock/lockModel.ts` | `authResultOf` and `availabilityOf`; `afterRecheck` turns off only on `canLock === false` (P8). |
| `apps/app/src/wallet/lock/copy.ts` | One line: `lock.notStored` (P9, P20). |
| `apps/app/src/wallet/lock/lockModel.test.ts` | One case added, and the Thai-lines case counts four extra lines (11 cases before, 12 after). |
| `apps/app/src/wallet/lock/Lock.render.test.tsx` | 14 cases added (24 before, 38 after); `Below` draws its amount as a heading, and the first case's vacuous line is made real (P13). |
| `apps/app/src/wallet/lock/LockRoute.render.test.tsx` | **new**, render, 2 cases. The route's `Redirect` and `?setup=1` (P13). |
| `docs/implementation/receipts/P2-T33-fix.md` | **new**. Your receipt (R87). |

Not in this round: `index.ts` and `draftText.test.ts` (P2-T14's merge is the controller's, ruling P17); `CustomerSpendScreen.tsx`, `SpendDatePicker.tsx`, `SpendNewCategorySheet.tsx` and `SpendMediaPermissionPrimer.tsx` (left, P3); `Tray.tsx`, `lockCover.tsx`, `LockedScreen.tsx`, `LockSetupView.tsx`, `LockSetupScreen.tsx`, `LockSettingsRow.tsx`, `lockSections.tsx`, the route `app/settings/lock.tsx` (read and tested, never changed); `en.json` and `th.json`; any package or lockfile; `premium-progress.md`.

## Planner rulings (the calls this brief makes, with the reason for each)

- **P1. Ready, on `5844e4c1`, with no merge.**
  - This is a fix round on #406, not a new task. Its base `96a52c2a` holds every task P2-T33 starts after (P2-T2, P2-T10, P2-T11, P2-T13 and tray-hardening).
  - The integration head (`3dc81b4d` when this was planned) differs from `96a52c2a` outside `.claude/` only in 1B-T13's edge and docs files (#405): `git diff --stat 96a52c2a origin/claude/p1a-vault-core -- apps/app packages package.json package-lock.json` prints nothing.
  - No package, lockfile, Cloudflare resource, account setting or owner decision is needed. R107 rules every finding. Owner Q1 (the JavaScript cover) and Q3 (drafts as written) keep their defaults.
  - The fix commit goes straight on top of `5844e4c1`, as the controller's notes say. The controller merges #406 after P2-T14's #407, with the first round's `scratch/p2-t33-planner/merge/` files. This round touches neither `index.ts` nor `draftText.test.ts`, so those proofs still hold.
- **P2. M1: the receipt photo draws the cover (R107.1).**
  - `ReceiptViewer` reads `useLockCover()`. While `hidden` it draws `<LockCoverArt />` in place of its `Animated.View`, so while the app is locked the lock screen shows inside the viewer's own Modal (P2-T33's ruling P2: the topmost cover is the one a person sees and presses).
  - As in `Sheet`, `onRequestClose` asks nothing while hidden (Android's back; Escape on the web), and the web layer's `aria-label` is dropped. The photo, its title and its Close are unmounted, so nothing of them is drawn, named or pressable.
  - When the cover lifts the photo is back as it was. The fade's `Animated.Value` holds 1, so it does not fade in again, and `onShow` does not fire again (so focus is not moved, as for a tray, P2-T33's P3).
  - The case is the second review's probe 1, as R107 asks: lock on, the photo open, `background` then `active`. Expected: a cover outside the app's root, holding the lock screen and the try-again note, and nothing of the photo. It adds the guarded back and the unnamed layer, and that unlocking from inside the viewer brings the photo back, after which back closes it.
- **P3. The Modal sweep (R107.1).**
  - Seven source files draw a `<Modal`. Three draw the cover: `Sheet.tsx`, `Tray.tsx` and now `ReceiptParts.tsx`.
  - Four are left: `CustomerSpendScreen.tsx` and the three parts only it imports (`SpendDatePicker.tsx`, `SpendNewCategorySheet.tsx`, `SpendMediaPermissionPrimer.tsx`). Why they cannot be open while the lock is on:
    - only `app/spend/index.tsx` draws `CustomerSpendScreen`, and only behind `isLegacySpendEnabled()`;
    - that is `process.env.EXPO_PUBLIC_LEGACY_SPEND === '1'`, "Development only ... never a runtime fallback" (`featureFlags.ts:5-11`; `README.md:421`), and the plan's store profiles (P6C) set it to `0`. No build a person gets draws them, whatever areas are on.
  - `DateChip.tsx` names `SpendDatePicker` only in a comment; it draws a `Sheet`. No route is presented natively (the second review checked), and the app has no other overlay package.
  - New `src/ui/lockCover.test.ts` (Node) keeps the sweep. It reads every source file under `src/` and `app/` (tests left out) and asserts three things:
    - exactly these seven draw a `<Modal`;
    - each covered one reads `useLockCover()` and draws `LockCoverArt` under `hidden`;
    - each legacy part is imported only by `CustomerSpendScreen.tsx`, which is imported only by `app/spend/index.tsx`, behind the switch.
  - So a new Modal fails until it draws the cover or is ruled out here (mutants MS1 and MS2).
  - The native sheets the app presents (the export's share sheet, the pickers) are the second review's m6, owner Q1's class. They are noted only (R107.5).
- **P4. The first review's m2: the first ask waits for the phone.**
  - The gate keeps `settled`, true once the phone's first reading has answered or failed. The automatic ask waits for it, so the first prompt uses the phone's words (`lock.lineFace` on a Face ID phone). A reading that fails still settles, so the gate still asks, in the passcode's words (`lock.linePasscode`), as R107 says.
  - Only the automatic ask waits. The locked screen still draws at once, naming the passcode until the phone answers; a press in those milliseconds asks in the passcode's words. A reading that never answers leaves the ask to the button rather than showing nothing (P2-T34's adapter must answer).
  - The case is the first review's probe C, for a Face ID phone and for a phone that cannot be read (mutants FP1 and FP2).
- **P5. The first review's m3: an opening counts as asked only once its prompt starts.**
  - `unlock` marks the opening as asked (`asked.current = at`) right after its in-flight check passes, that is, when a prompt actually starts. The effect no longer marks it.
  - `busy` is in the effect's dependencies, so when a prompt answers the effect looks again. An opening that came while that prompt was up then asks by itself. This is the first review's probe A, and probe F for the switch's prompt.
  - `busy` is not in the effect's condition. `unlock` already asks nothing while a prompt is up, and leaves the opening unasked, so a `busy` test there could never change the outcome: its mutant would be equivalent. The comment above the effect says so.
  - A scan from before a trip away still opens nothing: the switch's `change` never unlocks, and `unlock` drops an answer to an earlier opening.
  - The mutants: AO1 (`busy` out of the dependencies) and AO2 (the opening marked in the effect again).
- **P6. The first review's n4: `unlock` resets `asking` in a `finally`, and `change` does too.**
  - The `try` covers the whole answer, including the early return that drops an answer to an earlier opening. So the `finally` is what lets the next opening ask after a dropped answer, and its mutant FIN1 (the reset at the end of the `try`) is killed by the first round's "each opening asks once by itself" case.
  - `change` needs the same, now that it awaits the store (P9): FIN2 is killed by a cancelled scan's early return.
- **P7. The first review's m4: the turned-off notice has no timeout.**
  - The case holds the prompt (`heldPhone`-style), takes over the clock with `vi.useFakeTimers()` before the answer that turns the lock off, flushes the answer with microtask-only `act` calls (`ready()` needs real timers), and advances 60 s. The notice is still there; it goes only when closed.
  - The first review's mutant M1 (a 3 s `setTimeout` in `turnOff`) is TM1, killed on GREEN and, on `5844e4c1`'s code, by the pin.
- **P8. The second review's n1: the port's types.**
  - `lockModel.ts` gains `authResultOf(answer: unknown): AuthResult` (anything but the five answers is `'failed'`) and `availabilityOf(reading: unknown): LockAvailability | null` (`null`, as for a read that failed, unless `canLock` is a boolean and `method` is `null` or one of the three methods). It checks the method against a list, not with `in`, which would let `'toString'` through (mutant AV3).
  - The gate's `prompt` and `readPhone` use them. So an answer outside the types counts as a failed scan (try again; the button asks again), and a reading outside them counts as a phone that could not be read: still able to lock, never able to turn the lock on, and named by the passcode.
  - `afterRecheck` also turns the lock off only on `canLock === false` (mutant RC1), a second guard in the pure rule.
  - The render cases are the reviews' probes 3 and 7 (and the first review's H); the Node case pins both functions.
- **P9. The second review's m3: turning the lock on is stored fail-closed.**
  - After a passing scan, `change(true)` awaits `store.set(LOCK_NAME, '1')`. Only if the write succeeds does the lock go on (the switch, `lock-answered`).
  - If the write fails, the switch stays off, nothing is kept, and the gate shows a notice, `lock.notStored` ("The lock couldn't be turned on. Try again."). It uses the same notice as `lock.turnedOff`: at the top, on the toast colours, polite, a 44 pt close, no timeout, and said once on iOS. Its test id is `lock-not-stored`.
  - A new turn clears the notice (mutant WS5), and `asking` stays set until the write settles, so a second press cannot start a second prompt.
  - Turning the lock off stays fire-and-forget: a setting that cannot be removed locks again at the next launch, which fails closed. The comment says so.
  - The case is the second review's probe 8: a store that cannot write, then one that can.
- **P10. The second review's m4: while the cover is up the app below says nothing on iOS. R107 lets this round edit `ui/a11y.ts` or the announcement hook: this round edits `ui/a11y.ts`.**
  - **Why `a11y.ts`, not the hook:** `announcePolitely` is called directly as well as through `useAnnouncement` and `useSettledAnnouncement` (Home, private mode, the conflict panel and others). A module flag in `a11y.ts` quiets every one of them; a context in the hook would quiet only the hook's callers.
  - **The helpers:**
    - `setQuietUnderLockCover(quiet)` sets the flag;
    - `announcePolitely` says nothing while it is set;
    - `announceOverLockCover(text)` is what `announcePolitely` was, the lock's own way past the flag.
  - **The gate:**
    - it calls `setQuietUnderLockCover(hidden)` in a `useLayoutEffect`, and resets the flag when it goes;
    - its three notes (`then.note`, `lock.turnedOff`, `lock.notStored`) use `announceOverLockCover`.
  - **Why a layout effect:** React runs every layout effect of a commit before any passive one, and passive effects child-first. So the flag is set before any part below runs its own `useAnnouncement` in the commit that raises the cover. The case's `AwayStatus` changes its line in that same commit; mutant QT6 (a plain `useEffect`) lets it be heard.
  - **`sync/announce.ts`, a file R107 did not name, changes by one line:** `announceStatus` now calls `announcePolitely`. It is the app's other announcement helper (v1's `SyncStatus`, drawn on `/spend` when the `core` area is off), and it made the same `AccessibilityInfo` call itself, so without this one line it would still speak under the cover. Behaviour outside a gate is unchanged, and `SyncStatus.render.test.tsx` mocks `./announce` (11 of 11 pass). If the controller would rather leave the file alone, the kit needs a revision, not a skipped step: the m4 case calls `announceStatus` under the cover (mutant QT5).
  - On Android and the web, the app below's live regions sit under `no-hide-descendants` and `aria-hidden`, which should already keep them quiet. That stays a device check (the second review's note, P19).
  - The case is the second review's probe 2, plus a line that changes as the cover goes up, `announceStatus`, the app speaking again once unlocked, and a gate that goes while its cover is up (mutants QT1 to QT6).
- **P11. The second review's m5: becoming hidden dismisses the keyboard.**
  - An effect calls `Keyboard.dismiss()` whenever `hidden` becomes true: `background`, and `inactive` too (with the lock on, `inactive` covers the app, and a sheet's input unmounts anyway).
  - On the web, react-native-web's `dismiss` blurs the focused input, so the case asserts both the call and the blur, for `inactive` and for `background` (mutants KB1, and KB2: only when locked).
  - The keyboard on a phone stays a device check (P19).
- **P12. The first review's n6: fixed, since it is cheap.**
  - The gate keeps `assumed`: true when the setting could not be read and so counts as on. `turnOff` then still turns the lock off and unlocks, but shows and says no notice: the person never turned that lock on.
  - Any change the person makes (`change` passing) clears it, so a lock they turn on later is theirs, and is said when it turns itself off.
  - The case covers both: a blocked store with `noLocalAuth`, and a blocked store, a Face ID phone, a turn off and on, and the passcode then removed (mutants N6A to N6C).
- **P13. The pins (R107.4), each RED through its review survivor on `5844e4c1`'s code (Step 2.5):**
  - the first review's n1, "an app launched behind waits": `AppState.currentState` is spied to `background` before the mount (LB1, the review's M4);
  - n2, the route: new `LockRoute.render.test.tsx`, with its own `expo-router` stand-in (a `Redirect` drawn as words, `useLocalSearchParams` from the case) and a stand-in `LockSetupScreen` that says which form it was given (RT1 and RT2, the review's M6 and M7; RT3, any `setup` value). The catalogue's router stub is left alone;
  - n3, `change()`'s same-state guard (SG1, the review's M2);
  - n5, the vacuous assertion made real: `Below` draws its amount as a heading, and the first case checks it is drawn (`hidden: true`) but not reachable. Its line comes before `unseen(below)`, so on `5844e4c1`'s code G21 now fails there first;
  - the second review's m2: its two ready cases, as it wrote them (SW1 and SW2, its A2 and A3).
- **P14. The second review's m1 is carried (R107.5), but `Sheet.tsx`'s comment is corrected.** It said "its content is its host's, so nothing is lost", which the review showed is not true of every sheet. It now says that the children unmount, so a child's own state starts again, and names the review. This is a comment only: no test and no mutant.
- **P15. RED (R107.6).**
  - Node: the model's new case fails on the stub's pass-through (`AssertionError ... not_interactive`), and the sweep's first case fails on `ReceiptParts.tsx`. The other 16 pass, the copy pin among them, since the copy goes in with the tests as data, as in the first round.
  - Render: nine cases fail, each on an assertion. The other seven new cases (five in `Lock.render.test.tsx`, and `LockRoute.render.test.tsx`'s two) pin code that is already right, and so does the first case's real n5 line; Step 2.5 gives their RED.
  - One "Unhandled Rejection" is expected at RED: `TypeError: Cannot read properties of undefined (reading 'step')`, which vitest attributes to the case "an answer outside the port's types ...". That is the first review's n4 itself: `afterAnswer` returns nothing for an odd answer, and the throw leaves `asking` set. The case still fails on an assertion. At GREEN there is none.
- **P16. 166 mutants, all killed (Step 4), and the 9 pins (Step 2.5).**
  - The first round's 121 are re-aimed where this round moved their text: F20, F21, G3 to G6, G9, G11, G12, G14 to G18, G28, G31, G32, G36 and G40. G31 now replaces the awaited write with `const stored = true;`.
  - 45 are new: RV1 to RV3, MS1, MS2, QT1 to QT6, KB1, KB2, FP1, FP2, AO1, AO2, FIN1, FIN2, N1A, N1B, AR1, AR2, AV1 to AV3, RC1, WS1 to WS6, T5, N6A to N6C, and eight of the nine review survivors again, on the final code (TM1, SG1, LB1, RT1 to RT3, SW1, SW2; the ninth, G21, is the first round's).
  - MS1 and MS2 edit `DateChip.tsx`, a file outside the round, and the runner restores it by SHA-256 like every other file.
  - Every kill fails an assertion (each mutant's log holds an `AssertionError`). N1A also leaves an `Unhandled Rejection` in its log: the odd answer reaches `afterAnswer`, whose `undefined` throws inside the `try`, and the `finally` still resets `asking`.
- **P17. Clear of the work in flight.**
  - P2-T14's fix round (`scratch/p2-t14-fix-planner/`) changes `src/wallet/add/` and `addSections.tsx`. P2-T23 changes `HomeScreen.tsx`, `homeData.*` and `src/wallet/home/`. P2-T25 changes `app/spend/deleted.tsx`, `index.ts`, `recordSections.tsx` and its own files. P3-T4 changes `apps/edge`.
  - None of them touches this round's eleven files. The planner read each kit's `real/`; P2-T32's had no files yet.
  - P2-T23's `HomeScreen.tsx` keeps calling `useAnnouncement`, which is now quiet under the cover: nothing to merge.
- **P18. The gate (R100).**
  - No route, config or app entry changes. The route test imports `app/settings/lock.tsx`, but the route is unchanged. So no `typecheck:routes` and no `export:web`, and no API, edge or database suite.
  - Run: `typecheck:app`, the focused files RED to GREEN, the round's other focused render files and the twelve neighbours, and the catalogue's wallet and receipt sections (`-t "bw-|receipt-"`, since `receipt-full-screen` draws the viewer). Then `test:app`, `test:unit` and `git diff --check`.
  - CI runs the full render suite, both exports and the rest.
- **P19. Carried (R107.5), and the device checks, SKIPPED with their risk.**
  - Carried:
    - the first review's m1 (Android's activity-based credential screen sends `background`, so the gate drops the passing answer and asks again) goes to P2-T34's phone check;
    - the second review's m1 (a Sheet's children lose their own state under the cover; the email code step) stays with R63's unmount, for later sheet hosts (1C-T9, P6B-T8) and P2-T34;
    - the second review's m6 (native sheets above the cover) is owner Q1's class, noted only.
  - Device checks, added to P2-T33's P19:
    - the keyboard on a phone when the lock engages (m5);
    - VoiceOver over the receipt photo's cover, and that unlocking there brings the photo back;
    - that nothing below speaks under the cover on an iPhone;
    - TalkBack's live regions under the cover (the second review's note on m4).
- **P20. For E2-D: one new draft line**, `lock.notStored`: th `เปิดการล็อกไม่สำเร็จ ลองอีกครั้ง`, en `The lock couldn't be turned on. Try again.` No board shows it. The Node case pins its Thai and counts four lines beyond the plan's.

---

## Step 1: Check the base

1. `/usr/bin/git -C WT status --short` prints nothing, and `/usr/bin/git -C WT rev-parse --short HEAD` prints `5844e4c1`. Otherwise report BLOCKED.
2. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT diff --stat 96a52c2a origin/claude/p1a-vault-core -- apps/app packages package.json package-lock.json`.
   - Expected: no output; or only P2-T14's files (`apps/app/src/wallet/add/`, `apps/app/src/dev/catalogue/wallet/addSections.tsx`, `index.ts`, `apps/app/src/wallet/copy/draftText.test.ts`), or another lane's files that are not in `PL/files.txt`. Go on, and name them in the receipt: the controller merges later (ruling P1). Do not merge.
   - If it lists one of `PL/files.txt`'s eleven, report BLOCKED with the output.
3. `cd WT && shasum -a 256 -c PL/SHA256SUMS.orig-in-wt` (type the full paths). Expected: nine `OK` lines, exit 0. Then `ls WT/apps/app/src/ui/lockCover.test.ts WT/apps/app/src/wallet/lock/LockRoute.render.test.tsx`: "No such file or directory" twice.
4. The base. Compare each with `PL/logs/base-*.log`:
   - Only if `WT/node_modules` is missing: `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?`. Expected: 0.
   - `cd WT && npm run typecheck:app > S/base-typecheck.log 2>&1; echo $?`. Expected: 0.
   - `cd WT/apps/app && npm run test:unit -- src/wallet/lock/lockModel.test.ts src/wallet/copy/draftText.test.ts > S/base-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 15`, `ℹ pass 15`.
   - The round's render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/lock/Lock.render.test.tsx src/ui/Sheet.render.test.tsx src/screens/redesign/import/RecordReceipt.render.test.tsx src/sync/SyncStatus.render.test.tsx src/ui/a11y.render.test.tsx src/ui/StagedProgress.render.test.tsx src/ui/SyncBanner.render.test.tsx > S/base-focused.log 2>&1; echo $?`. Expected: 0, `Test Files  7 passed (7)`, `Tests  112 passed (112)` (24, 15, 48, 11, 1, 5 and 8).
   - The neighbours (the first round's twelve): `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/ui/Sheet.keyboard.render.test.tsx src/wallet/WalletRoot.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/screens/redesign/account/SettingsScreen.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/card/WalletCard.render.test.tsx src/wallet/motion/GrowBar.render.test.tsx src/wallet/money/WalletAmount.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/RootLayout.render.test.tsx > S/base-neighbours.log 2>&1; echo $?`. Expected: 0, `Test Files  12 passed (12)`, `Tests  174 passed (174)`. Call this count N.
   - The catalogue's wallet and receipt sections: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-|receipt-" > S/base-catalogue.log 2>&1; echo $?`. Expected: 0, `Tests  62 passed` (sixteen wallet and fifteen receipt sections, in two suites). Ignore the `skipped` count. Call this count C.

## Step 2: The tests first, and RED on `5844e4c1`'s code

1. Copy the four tests, the copy and the stub:
   ```bash
   cp PL/real/apps/app/src/wallet/lock/Lock.render.test.tsx WT/apps/app/src/wallet/lock/Lock.render.test.tsx
   cp PL/real/apps/app/src/wallet/lock/LockRoute.render.test.tsx WT/apps/app/src/wallet/lock/LockRoute.render.test.tsx
   cp PL/real/apps/app/src/wallet/lock/lockModel.test.ts WT/apps/app/src/wallet/lock/lockModel.test.ts
   cp PL/real/apps/app/src/ui/lockCover.test.ts WT/apps/app/src/ui/lockCover.test.ts
   cp PL/real/apps/app/src/wallet/lock/copy.ts WT/apps/app/src/wallet/lock/copy.ts
   cp PL/stubs/apps/app/src/wallet/lock/lockModel.ts WT/apps/app/src/wallet/lock/lockModel.ts
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.red-in-wt`. Expected: eleven `OK` lines, exit 0.
2. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: 0.
3. `cd WT/apps/app && npm run test:unit -- src/wallet/lock/lockModel.test.ts src/ui/lockCover.test.ts src/wallet/copy/draftText.test.ts > S/red-unit.log 2>&1; echo $?`. Expected:
   - exit 1, `ℹ tests 18`, `ℹ pass 16`, `ℹ fail 2`;
   - the two failures, each on `AssertionError [ERR_ASSERTION]`:
     - `every Modal a person can open with the lock on draws the lock's cover; the legacy screen's four are the only others`: `AssertionError [ERR_ASSERTION]: src/screens/redesign/import/ReceiptParts.tsx`;
     - `an answer or a reading outside the port's types counts as a failed scan, or as a phone that could not be read`: `AssertionError [ERR_ASSERTION]: not_interactive`.
   - The 16 that pass include `the lock's Thai lines are the plan's, and only four more` (the copy went in with the tests, P15).
4. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/lock/Lock.render.test.tsx src/wallet/lock/LockRoute.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected:
   - exit 1, `Test Files  1 failed | 1 passed (2)`, `Tests  9 failed | 31 passed (40)`;
   - `grep -c '^AssertionError' S/red-render.log` gives 9;
   - `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function|TestingLibraryElementError' S/red-render.log` gives 0;
   - one `Unhandled Rejection` section, `TypeError: Cannot read properties of undefined (reading 'step')`, which vitest attributes to "an answer outside the port's types ...". That is the first review's n4 itself (P15). Nothing else unhandled.

   The nine, each failing first on:
   - `with the receipt photo open, a return from the background shows the lock screen inside its own cover, and nothing of the photo`: `AssertionError: expected <div tabindex="-1" …(3)>…(2)</div> to be null`
   - `the first prompt waits until the phone has said how it locks, so it asks in its words; a phone that cannot be read is asked in the passcode's`: `AssertionError: face: expected "vi.fn()" to not be called at all, but actually been called 1 times`
   - `back in front while an earlier prompt is up, the new opening asks by itself once that prompt answers`: `AssertionError: expected 1 to be 2 // Object.is equality`
   - `an answer outside the port's types counts as a failed scan: the note says try again, and the button asks again`: `AssertionError: ลองอีกครั้ง หรือใช้รหัสผ่าน: expected null not to be null`
   - `a reading outside the port's types counts as a phone that could not be read: the lock stays on, and the screen names the passcode`: `AssertionError: a heading named Jotbun ล็อกอยู่: expected null not to be null`
   - `turning the lock on holds only once it is stored: a store that cannot keep it leaves the switch off and says so`: `AssertionError: expected 'true' to be 'false' // Object.is equality`
   - `while the cover is up the app below says nothing on iOS; the lock's own notes are said, and the app speaks again once unlocked`: `AssertionError: expected [ …(4) ] to deeply equal [ [ 'ลองอีกครั้ง หรือใช้รหัสผ่าน' ] ]`
   - `becoming hidden puts the keyboard away, so no typing reaches the screen under the cover`: `AssertionError: inactive: expected "dismiss" to be called 1 times, but got 0 times`
   - `a setting that cannot be read, on a phone that cannot lock, opens the app with no notice; a lock turned on since is said`: `AssertionError: expected <div aria-live="polite" …(4)>…(2)</div> to be null`

   The other new cases pass at RED: their code is already right, and Step 2.5 gives their RED. Compare with `PL/logs/red-unit.log` and `PL/logs/red-render.log`.
5. The pins whose code is already right (P13): the review survivors, each now killed by its own pin on `5844e4c1`'s code. The nine cases of Step 2.4 are left out by name (`RENDER_T`, a test-name pattern `mutants.py` passes to vitest as `-t`). Type it on one line:
   ```bash
   RENDER_T='^(?!.*(?:receipt photo open|first prompt waits|earlier prompt is up|answer outside the port|reading outside the port|holds only once it is stored|says nothing on iOS|puts the keyboard away|cannot be read, on a phone that cannot lock)).*$' python3 -I PL/tools/mutants.py WT S/red-pins-logs --pins > S/red-pins.out 2>&1; echo $?
   ```
   Expected: exit 0, and these 10 lines. Each mutant fails one case, its pin, on one assertion; G21 fails four, and its first failure is n5's new line (`no screen reader reaches the amount below`). Compare with `PL/logs/red-pins.out`.
   ```
   TM1 KILLED: the turned-off notice goes after three seconds (the first review's M1, m4) [LockGate.tsx] -> Tests 1 failed | 28 passed | 9 skipped (38); first failing: "the turned-off notice stays until it is closed, however long it is up"; AssertionError x1; restored sha256 equal
   SG1 KILLED: the switch asks while the lock is already as asked (the first review's M2, n3) [LockGate.tsx] -> Tests 1 failed | 28 passed | 9 skipped (38); first failing: "asking to turn the lock on while it is on, or off while it is off, asks nothing"; AssertionError x1; restored sha256 equal
   LB1 KILLED: an app launched behind counts as in front (the first review's M4, n1) [LockGate.tsx] -> Tests 1 failed | 28 passed | 9 skipped (38); first failing: "an app launched behind asks only once it is in front"; AssertionError x1; restored sha256 equal
   RT1 KILLED: the route shows the setup screen without the wallet area (the first review's M6, n2) [lock.tsx] -> Tests 1 failed | 1 passed (2); first failing: "without the wallet area the route goes to Settings, whatever it is asked"; AssertionError x1; restored sha256 equal
   RT2 KILLED: the route ignores ?setup=1 (the first review's M7, n2) [lock.tsx] -> Tests 1 failed | 1 passed (2); first failing: "under the wallet area it is the setup screen, as the setup step only with ?setup=1"; AssertionError x1; restored sha256 equal
   RT3 KILLED: any ?setup value is the setup step [lock.tsx] -> Tests 1 failed | 1 passed (2); first failing: "under the wallet area it is the setup screen, as the setup step only with ?setup=1"; AssertionError x1; restored sha256 equal
   SW1 KILLED: a failed scan or a lockout changes the lock (the second review's A2, m2) [LockGate.tsx] -> Tests 1 failed | 28 passed | 9 skipped (38); first failing: "the switch leaves the lock as it was after a scan that fails or locks out, turning it on or off"; AssertionError x1; restored sha256 equal
   SW2 KILLED: turning the lock off, unavailable ignores the phone's reading (the second review's A3, m2) [LockGate.tsx] -> Tests 1 failed | 28 passed | 9 skipped (38); first failing: "turning the lock off, an unavailable answer on a phone that can still lock keeps the lock on and says nothing"; AssertionError x1; restored sha256 equal
   G21 KILLED: the app below stays readable under the cover (n5: the real assertion fails first) [LockGate.tsx] -> Tests 4 failed | 25 passed | 9 skipped (38); first failing: "with the lock on, the app opens locked and the app below is hidden from screen readers"; AssertionError x4; restored sha256 equal
   9 killed, 0 survived, 0 not as expected
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.red-in-wt` again: eleven `OK` lines. The runner puts each file back.

## Step 3: GREEN

1. Copy the code:
   ```bash
   cp PL/real/apps/app/src/wallet/lock/lockModel.ts WT/apps/app/src/wallet/lock/lockModel.ts
   cp PL/real/apps/app/src/wallet/lock/LockGate.tsx WT/apps/app/src/wallet/lock/LockGate.tsx
   cp PL/real/apps/app/src/screens/redesign/import/ReceiptParts.tsx WT/apps/app/src/screens/redesign/import/ReceiptParts.tsx
   cp PL/real/apps/app/src/ui/a11y.ts WT/apps/app/src/ui/a11y.ts
   cp PL/real/apps/app/src/sync/announce.ts WT/apps/app/src/sync/announce.ts
   cp PL/real/apps/app/src/ui/Sheet.tsx WT/apps/app/src/ui/Sheet.tsx
   ```
2. `cd WT && shasum -a 256 -c PL/SHA256SUMS.real-in-wt`. Expected: eleven `OK` lines. Then `/usr/bin/git -C WT status --short`, which shows exactly these eleven lines:
   ```
    M apps/app/src/screens/redesign/import/ReceiptParts.tsx
    M apps/app/src/sync/announce.ts
    M apps/app/src/ui/Sheet.tsx
    M apps/app/src/ui/a11y.ts
    M apps/app/src/wallet/lock/Lock.render.test.tsx
    M apps/app/src/wallet/lock/LockGate.tsx
    M apps/app/src/wallet/lock/copy.ts
    M apps/app/src/wallet/lock/lockModel.test.ts
    M apps/app/src/wallet/lock/lockModel.ts
   ?? apps/app/src/ui/lockCover.test.ts
   ?? apps/app/src/wallet/lock/LockRoute.render.test.tsx
   ```
3. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: 0.
4. The command of Step 2.3, into `S/green-unit.log`. Expected: 0, `ℹ tests 18`, `ℹ pass 18`, `ℹ fail 0`.
5. The command of Step 2.4, into `S/green-render.log`. Expected:
   - exit 0, `Test Files  2 passed (2)`, `Tests  40 passed (40)` (Lock 38, LockRoute 2), each case marked `✓`;
   - `grep -c '^stderr |' S/green-render.log` gives 0, and the log has no `act(...)` warning, no `console.error` and no "Unhandled" section. Its other output is only the base's notices: Vite's config-loader notice, two `expo-status-bar` sourcemap notices and Node's `localStorage` warning.
6. The round's other render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/ui/Sheet.render.test.tsx src/screens/redesign/import/RecordReceipt.render.test.tsx src/sync/SyncStatus.render.test.tsx src/ui/a11y.render.test.tsx src/ui/StagedProgress.render.test.tsx src/ui/SyncBanner.render.test.tsx > S/green-focused.log 2>&1; echo $?`. Expected: 0, `Test Files  6 passed (6)`, `Tests  88 passed (88)` (15, 48, 11, 1, 5 and 8), as at the base.
7. The neighbours: Step 1.4's command, into `S/green-neighbours.log`. Expected: 0, `Tests  N passed (N)` (174).
8. The catalogue's sections: Step 1.4's command, into `S/green-catalogue.log`. Expected: 0, `Tests  C passed` (62), as at the base. The round changes no section; `receipt-full-screen` draws the viewer outside a gate, so nothing is hidden there.

## Step 4: Mutation check

1. `python3 -I PL/tools/mutants.py WT S/mutant-logs > S/mutants.out 2>&1; echo $?` (full paths).
   - It checks every mutant's text first: a text that does not match once stops it with exit 2, before anything changes. Then it applies each mutant alone, runs its tests (the three Node files; `Lock.render.test.tsx`; `LockRoute.render.test.tsx` for the route; the sheet's and the lock's render files for H), and restores the file with its SHA-256 checked. MS1 and MS2 edit `apps/app/src/ui/DateChip.tsx` and are restored the same way.
   - It took the planner ten to eleven minutes in each of two runs, at load averages between 13 and 58. Allow longer on a busier machine.
   - Expected: exit 0, and these 167 lines: one per mutant, each ending "restored sha256 equal", then the tally. Compare with `PL/logs/mutants.out`.
   ```
   F1 KILLED: background gets a grace time: it covers but does not lock (the plan's mutant) [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "with the lock on, every app open locks: a cold start and every return from the background"; AssertionError x1; restored sha256 equal
   F2 KILLED: a cold start does not lock [lockModel.ts] -> Tests 2 failed | 16 passed (18); first failing: "with the lock on, every app open locks: a cold start and every return from the background"; AssertionError x2; restored sha256 equal
   F3 KILLED: a cold start drops a cover the app has [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "unlocked unlocks and keeps a cover until the app is in front; disabled clears both, with the lock on or off"; AssertionError x1; restored sha256 equal
   F4 KILLED: inactive locks too (the prompt would loop) [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "inactive only covers, so the Face ID prompt cannot lock again"; AssertionError x1; restored sha256 equal
   F5 KILLED: inactive does not cover [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "inactive only covers, so the Face ID prompt cannot lock again"; AssertionError x1; restored sha256 equal
   F6 KILLED: active unlocks [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "with the lock on, every app open locks: a cold start and every return from the background"; AssertionError x1; restored sha256 equal
   F7 KILLED: active keeps the cover [lockModel.ts] -> Tests 3 failed | 15 passed (18); first failing: "with the lock on, every app open locks: a cold start and every return from the background"; AssertionError x3; restored sha256 equal
   F8 KILLED: unlocked drops the cover while the app is away [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "unlocked unlocks and keeps a cover until the app is in front; disabled clears both, with the lock on or off"; AssertionError x1; restored sha256 equal
   F9 KILLED: unlocked does not unlock [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "unlocked unlocks and keeps a cover until the app is in front; disabled clears both, with the lock on or off"; AssertionError x1; restored sha256 equal
   F10 KILLED: disabled keeps the lock [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "unlocked unlocks and keeps a cover until the app is in front; disabled clears both, with the lock on or off"; AssertionError x1; restored sha256 equal
   F11 KILLED: with the lock off a cold start locks [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "with the lock off nothing locks or covers"; AssertionError x1; restored sha256 equal
   F12 KILLED: with the lock off the background covers and locks [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "with the lock off nothing locks or covers"; AssertionError x1; restored sha256 equal
   F13 KILLED: with the lock off inactive covers [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "with the lock off nothing locks or covers"; AssertionError x1; restored sha256 equal
   F14 KILLED: AppState's unknown counts as in front [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "AppState's active, inactive and background are lock events; anything else says nothing"; AssertionError x1; restored sha256 equal
   F15 KILLED: AppState's inactive says nothing [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "AppState's active, inactive and background are lock events; anything else says nothing"; AssertionError x1; restored sha256 equal
   F16 KILLED: a cancel unlocks [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "an answer that does not unlock says why; unavailable reads the phone first, and only a phone that says it cannot lock turns the lock off"; AssertionError x1; restored sha256 equal
   F17 KILLED: a failure says lockout [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "an answer that does not unlock says why; unavailable reads the phone first, and only a phone that says it cannot lock turns the lock off"; AssertionError x1; restored sha256 equal
   F18 KILLED: a lockout says try again [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "an answer that does not unlock says why; unavailable reads the phone first, and only a phone that says it cannot lock turns the lock off"; AssertionError x1; restored sha256 equal
   F19 KILLED: unavailable stays without reading the phone again [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "an answer that does not unlock says why; unavailable reads the phone first, and only a phone that says it cannot lock turns the lock off"; AssertionError x1; restored sha256 equal
   F20 KILLED: a phone that could not be read turns the lock off [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "an answer that does not unlock says why; unavailable reads the phone first, and only a phone that says it cannot lock turns the lock off"; AssertionError x1; restored sha256 equal
   F21 KILLED: a phone that cannot lock stays locked [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "an answer that does not unlock says why; unavailable reads the phone first, and only a phone that says it cannot lock turns the lock off"; AssertionError x1; restored sha256 equal
   F22 KILLED: a phone that has not said is named by Face ID [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "a screen names the phone's method, or the passcode while the phone has not said, and each method has its name, line and body"; AssertionError x1; restored sha256 equal
   F23 KILLED: a fingerprint phone's body says to scan a face [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "a screen names the phone's method, or the passcode while the phone has not said, and each method has its name, line and body"; AssertionError x1; restored sha256 equal
   F24 KILLED: the switch does not wait for the phone [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "the setup switch waits for the phone, stays off on a phone that cannot lock and says why, and can always turn a lock off"; AssertionError x1; restored sha256 equal
   F25 KILLED: a lock that is on cannot be turned off on a phone that cannot lock [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "the setup switch waits for the phone, stays off on a phone that cannot lock and says why, and can always turn a lock off"; AssertionError x1; restored sha256 equal
   F26 KILLED: the passcode line shows while the lock is on [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "the setup switch waits for the phone, stays off on a phone that cannot lock and says why, and can always turn a lock off"; AssertionError x1; restored sha256 equal
   R1 KILLED: the lock inside private mode (the plan's mutant) [WalletRoot.tsx] -> Tests 2 failed | 16 passed (18); first failing: "the lock wraps private mode, so nothing that shows an amount renders above it"; AssertionError x2; restored sha256 equal
   R2 KILLED: the motion answer outside the gesture root (P2-T10's R9) [WalletRoot.tsx] -> Tests 1 failed | 17 passed (18); first failing: "the wallet root's order: the gesture root, the motion answer, the lock with the app's own port while the wallet area is on, then private mode; with the area off, private mode inside the motion answer"; AssertionError x1; restored sha256 equal
   R3 KILLED: the lock in every build, behind an approved area [WalletRoot.tsx] -> Tests 1 failed | 17 passed (18); first failing: "the wallet root's order: the gesture root, the motion answer, the lock with the app's own port while the wallet area is on, then private mode; with the area off, private mode inside the motion answer"; AssertionError x1; restored sha256 equal
   G1 KILLED: the first unavailable turns the lock off, with no second read (the plan's mutant) [LockGate.tsx] -> Tests 3 failed | 35 passed (38); first failing: "an unavailable answer re-reads the phone and stays locked while it can still lock"; AssertionError x3; restored sha256 equal
   G2 KILLED: the app shows before the setting is read [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "until the setting is read the app is covered and nothing asks; a setting that cannot be read counts as on"; AssertionError x1; restored sha256 equal
   G3 KILLED: a setting that cannot be read counts as off [LockGate.tsx] -> Tests 2 failed | 36 passed (38); first failing: "until the setting is read the app is covered and nothing asks; a setting that cannot be read counts as on"; AssertionError x2; restored sha256 equal
   G4 KILLED: becoming locked asks nothing by itself [LockGate.tsx] -> Tests 31 failed | 7 passed (38); first failing: "with the lock on, the app opens locked and the app below is hidden from screen readers"; AssertionError x31; restored sha256 equal
   G5 KILLED: the gate asks while the app is not in front [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "an app launched behind asks only once it is in front"; AssertionError x1; restored sha256 equal
   G6 KILLED: the gate asks again each time the app is back in front (the prompt loops) [LockGate.tsx] -> Tests 38 failed (38); first failing: "with the lock on, the app opens locked and the app below is hidden from screen readers"; AssertionError x37; restored sha256 equal
   G7 KILLED: the prompt's own inactive starts a new opening [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "each opening asks once by itself: the prompt's own inactive asks nothing, a press while a prompt is up asks nothing, every return from the background asks again, and an answer to an earlier opening is dropped"; AssertionError x1; restored sha256 equal
   G8 KILLED: a return from the background is not a new opening [LockGate.tsx] -> Tests 9 failed | 29 passed (38); first failing: "under the lock Android's back does nothing, so no screen, and no draft on it, leaves under the lock"; AssertionError x9; restored sha256 equal
   G9 KILLED: an answer to an earlier opening applies [LockGate.tsx] -> Tests 2 failed | 36 passed (38); first failing: "each opening asks once by itself: the prompt's own inactive asks nothing, a press while a prompt is up asks nothing, every return from the background asks again, and an answer to an earlier opening is dropped"; AssertionError x2; restored sha256 equal
   G10 KILLED: a new opening keeps the last note [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "each opening asks once by itself: the prompt's own inactive asks nothing, a press while a prompt is up asks nothing, every return from the background asks again, and an answer to an earlier opening is dropped"; AssertionError x1; restored sha256 equal
   G11 KILLED: a cancel says nothing [LockGate.tsx] -> Tests 9 failed | 29 passed (38); first failing: "a successful scan unlocks; a cancel stays locked and says try again"; AssertionError x9; restored sha256 equal
   G12 KILLED: iOS hears no note [LockGate.tsx] -> Tests 2 failed | 36 passed (38); first failing: "a successful scan unlocks; a cancel stays locked and says try again"; AssertionError x2; restored sha256 equal
   G13 KILLED: the lock turned off keeps its setting [LockGate.tsx] -> Tests 3 failed | 35 passed (38); first failing: "when the phone can no longer lock, the lock turns off once and says why"; AssertionError x3; restored sha256 equal
   G14 KILLED: the lock turned off says nothing [LockGate.tsx] -> Tests 6 failed | 32 passed (38); first failing: "when the phone can no longer lock, the lock turns off once and says why"; AssertionError x6; restored sha256 equal
   G15 KILLED: the lock turned off does not unlock [LockGate.tsx] -> Tests 4 failed | 34 passed (38); first failing: "when the phone can no longer lock, the lock turns off once and says why"; AssertionError x4; restored sha256 equal
   G16 KILLED: iOS does not hear that the lock turned off [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "when the phone can no longer lock, the lock turns off once and says why"; AssertionError x1; restored sha256 equal
   G17 KILLED: the notice cannot be closed [LockGate.tsx] -> Tests 2 failed | 36 passed (38); first failing: "when the phone can no longer lock, the lock turns off once and says why"; AssertionError x2; restored sha256 equal
   G18 KILLED: the notice is not a polite status [LockGate.tsx] -> Tests 2 failed | 36 passed (38); first failing: "when the phone can no longer lock, the lock turns off once and says why"; AssertionError x2; restored sha256 equal
   G19 KILLED: a prompt that throws unlocks [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "a prompt that throws, or a phone that cannot be read after an unavailable answer, never opens the app"; AssertionError x1; restored sha256 equal
   G20 KILLED: a phone that cannot be read counts as one that cannot lock [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "a prompt that throws, or a phone that cannot be read after an unavailable answer, never opens the app"; AssertionError x1; restored sha256 equal
   G21 KILLED: the app below stays readable under the cover [LockGate.tsx] -> Tests 6 failed | 32 passed (38); first failing: "with the lock on, the app opens locked and the app below is hidden from screen readers"; AssertionError x6; restored sha256 equal
   G22 KILLED: only a locked app is covered at the root [LockGate.tsx] -> Tests 2 failed | 36 passed (38); first failing: "the cover shows no amount and no text"; AssertionError x2; restored sha256 equal
   G23 KILLED: the cover carries no lock screen [LockGate.tsx] -> Tests 18 failed | 20 passed (38); first failing: "with the lock on, the app opens locked and the app below is hidden from screen readers"; AssertionError x18; restored sha256 equal
   G24 KILLED: the lock screen shows while the app is only covered [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "until the setting is read the app is covered and nothing asks; a setting that cannot be read counts as on"; AssertionError x1; restored sha256 equal
   G25 KILLED: Android's back reaches the app under the lock [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "under the lock Android's back does nothing, so no screen, and no draft on it, leaves under the lock"; AssertionError x1; restored sha256 equal
   G26 KILLED: Android's back is held after the lock lifts [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "under the lock Android's back does nothing, so no screen, and no draft on it, leaves under the lock"; AssertionError x1; restored sha256 equal
   G27 KILLED: back in front, the phone is not read again [LockGate.tsx] -> Tests 2 failed | 36 passed (38); first failing: "the setup screen reads the phone again when it opens, and again each time the app is back in front"; AssertionError x2; restored sha256 equal
   G28 KILLED: the phone is not read when the gate opens [LockGate.tsx] -> Tests 13 failed | 25 passed (38); first failing: "with the lock on, the app opens locked and the app below is hidden from screen readers"; AssertionError x13; restored sha256 equal
   G29 KILLED: the gate turns the lock on for a phone that has not said it can lock [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "a phone without a passcode cannot turn the lock on, and says why"; AssertionError x1; restored sha256 equal
   G30 KILLED: the switch turns the lock on with no prompt [LockGate.tsx] -> Tests 9 failed | 29 passed (38); first failing: "turning the lock on asks to authenticate first and stays off when that fails"; AssertionError x9; restored sha256 equal
   G31 KILLED: the switch keeps no setting [LockGate.tsx] -> Tests 3 failed | 35 passed (38); first failing: "turning the lock on asks to authenticate first and stays off when that fails"; AssertionError x3; restored sha256 equal
   G32 KILLED: the switch keeps no answer [LockGate.tsx] -> Tests 3 failed | 35 passed (38); first failing: "turning the lock on asks to authenticate first and stays off when that fails"; AssertionError x3; restored sha256 equal
   G33 KILLED: the switch asks again while its prompt is up [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "the switch asks one prompt at a time, from the gate itself"; AssertionError x1; restored sha256 equal
   G34 KILLED: the locked screen asks again while a prompt is up [LockGate.tsx] -> Tests 2 failed | 36 passed (38); first failing: "each opening asks once by itself: the prompt's own inactive asks nothing, a press while a prompt is up asks nothing, every return from the background asks again, and an answer to an earlier opening is dropped"; AssertionError x2; restored sha256 equal
   G35 KILLED: turning the lock on, a phone that can no longer lock says the lock turned off [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "a prompt that finds the phone can no longer lock: turning the lock on leaves it off and says why; turning it off turns it off and says so"; AssertionError x1; restored sha256 equal
   G36 KILLED: turning the lock off, a phone that can no longer lock leaves it on [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "a prompt that finds the phone can no longer lock: turning the lock on leaves it off and says why; turning it off turns it off and says so"; AssertionError x1; restored sha256 equal
   G37 KILLED: the prompt's fallback is not the passcode [LockGate.tsx] -> Tests 2 failed | 36 passed (38); first failing: "a successful scan unlocks; a cancel stays locked and says try again"; AssertionError x2; restored sha256 equal
   G38 KILLED: the unlock prompt does not say the method's line [LockGate.tsx] -> Tests 2 failed | 36 passed (38); first failing: "a successful scan unlocks; a cancel stays locked and says try again"; AssertionError x2; restored sha256 equal
   G39 KILLED: the prompt's cancel is not today's Cancel [LockGate.tsx] -> Tests 2 failed | 36 passed (38); first failing: "a successful scan unlocks; a cancel stays locked and says try again"; AssertionError x2; restored sha256 equal
   G40 KILLED: the switch never says it is busy [LockGate.tsx] -> Tests 2 failed | 36 passed (38); first failing: "the switch asks one prompt at a time, from the gate itself"; AssertionError x2; restored sha256 equal
   L1 KILLED: a fingerprint phone has no passcode link [LockedScreen.tsx] -> Tests 1 failed | 37 passed (38); first failing: "the locked screen names the method: Face ID with its passcode link, a fingerprint, or the passcode alone"; AssertionError x1; restored sha256 equal
   L2 KILLED: a passcode phone has a passcode link too [LockedScreen.tsx] -> Tests 1 failed | 37 passed (38); first failing: "the locked screen names the method: Face ID with its passcode link, a fingerprint, or the passcode alone"; AssertionError x1; restored sha256 equal
   L3 KILLED: the note is not a polite status [LockedScreen.tsx] -> Tests 2 failed | 36 passed (38); first failing: "a successful scan unlocks; a cancel stays locked and says try again"; AssertionError x2; restored sha256 equal
   L4 KILLED: the title is not a heading [LockedScreen.tsx] -> Tests 16 failed | 22 passed (38); first failing: "with the lock on, the app opens locked and the app below is hidden from screen readers"; AssertionError x16; restored sha256 equal
   L5 KILLED: the line is Face ID's for every method [LockedScreen.tsx] -> Tests 1 failed | 37 passed (38); first failing: "the locked screen names the method: Face ID with its passcode link, a fingerprint, or the passcode alone"; AssertionError x1; restored sha256 equal
   L6 KILLED: the main button names Face ID for every method [LockedScreen.tsx] -> Tests 3 failed | 35 passed (38); first failing: "the locked screen names the method: Face ID with its passcode link, a fingerprint, or the passcode alone"; AssertionError x3; restored sha256 equal
   L7 KILLED: the passcode link opens nothing [LockedScreen.tsx] -> Tests 2 failed | 36 passed (38); first failing: "a successful scan unlocks; a cancel stays locked and says try again"; AssertionError x2; restored sha256 equal
   L8 KILLED: the locked screen on the card colour [LockedScreen.tsx] -> Tests 1 failed | 37 passed (38); first failing: "with the lock on, the app opens locked and the app below is hidden from screen readers"; AssertionError x1; restored sha256 equal
   L9 KILLED: the passcode link in violet [LockedScreen.tsx] -> Tests 1 failed | 37 passed (38); first failing: "with the lock on, the app opens locked and the app below is hidden from screen readers"; AssertionError x1; restored sha256 equal
   S1 KILLED: the switch asks nothing [LockSetupView.tsx] -> Tests 8 failed | 30 passed (38); first failing: "turning the lock on asks to authenticate first and stays off when that fails"; AssertionError x8; restored sha256 equal
   S2 KILLED: the switch only ever turns the lock on [LockSetupView.tsx] -> Tests 4 failed | 34 passed (38); first failing: "turning it off asks too"; AssertionError x4; restored sha256 equal
   S3 KILLED: the switch is never disabled [LockSetupView.tsx] -> Tests 2 failed | 36 passed (38); first failing: "a phone without a passcode cannot turn the lock on, and says why"; AssertionError x2; restored sha256 equal
   S4 KILLED: nothing says why the lock cannot go on [LockSetupView.tsx] -> Tests 4 failed | 34 passed (38); first failing: "a phone without a passcode cannot turn the lock on, and says why"; AssertionError x4; restored sha256 equal
   S5 KILLED: a passcode phone gets the fallback line [LockSetupView.tsx] -> Tests 1 failed | 37 passed (38); first failing: "a phone without a passcode cannot turn the lock on, and says why"; AssertionError x1; restored sha256 equal
   S6 KILLED: the body is Face ID's for every method [LockSetupView.tsx] -> Tests 2 failed | 36 passed (38); first failing: "a phone without a passcode cannot turn the lock on, and says why"; AssertionError x2; restored sha256 equal
   S7 KILLED: the step line shows from Settings too [LockSetupView.tsx] -> Tests 2 failed | 36 passed (38); first failing: "the setup step: the step line, the question and body by method, a masked card, and Next, which keeps the answer and goes back; from Settings, no step and no Next"; AssertionError x2; restored sha256 equal
   S8 KILLED: Next shows from Settings too [LockSetupView.tsx] -> Tests 1 failed | 37 passed (38); first failing: "the setup step: the step line, the question and body by method, a masked card, and Next, which keeps the answer and goes back; from Settings, no step and no Next"; AssertionError x1; restored sha256 equal
   S9 KILLED: Next keeps no answer [LockSetupView.tsx] -> Tests 1 failed | 37 passed (38); first failing: "the setup step: the step line, the question and body by method, a masked card, and Next, which keeps the answer and goes back; from Settings, no step and no Next"; AssertionError x1; restored sha256 equal
   S10 KILLED: Next goes nowhere [LockSetupView.tsx] -> Tests 1 failed | 37 passed (38); first failing: "the setup step: the step line, the question and body by method, a masked card, and Next, which keeps the answer and goes back; from Settings, no step and no Next"; AssertionError x1; restored sha256 equal
   S11 KILLED: the preview card shows its amount [LockSetupView.tsx] -> Tests 1 failed | 37 passed (38); first failing: "the setup step: the step line, the question and body by method, a masked card, and Next, which keeps the answer and goes back; from Settings, no step and no Next"; AssertionError x1; restored sha256 equal
   S12 KILLED: screen readers stop on the preview [LockSetupView.tsx] -> Tests 1 failed | 37 passed (38); first failing: "the setup step: the step line, the question and body by method, a masked card, and Next, which keeps the answer and goes back; from Settings, no step and no Next"; AssertionError x1; restored sha256 equal
   S13 KILLED: the switch track is ink when off [LockSetupView.tsx] -> Tests 1 failed | 37 passed (38); first failing: "the setup step: the step line, the question and body by method, a masked card, and Next, which keeps the answer and goes back; from Settings, no step and no Next"; AssertionError x1; restored sha256 equal
   S14 KILLED: back goes nowhere [LockSetupView.tsx] -> Tests 1 failed | 37 passed (38); first failing: "the setup step: the step line, the question and body by method, a masked card, and Next, which keeps the answer and goes back; from Settings, no step and no Next"; AssertionError x1; restored sha256 equal
   S15 KILLED: the question names Face ID for every method [LockSetupView.tsx] -> Tests 2 failed | 36 passed (38); first failing: "a phone without a passcode cannot turn the lock on, and says why"; AssertionError x2; restored sha256 equal
   S16 KILLED: the switch names Face ID for every method [LockSetupView.tsx] -> Tests 4 failed | 34 passed (38); first failing: "a phone without a passcode cannot turn the lock on, and says why"; AssertionError x4; restored sha256 equal
   S17 KILLED: the screen does not read the phone when it opens [LockSetupView.tsx] -> Tests 2 failed | 36 passed (38); first failing: "the setup screen reads the phone again when it opens, and again each time the app is back in front"; AssertionError x2; restored sha256 equal
   S18 KILLED: the step line in ink [LockSetupView.tsx] -> Tests 1 failed | 37 passed (38); first failing: "the setup step: the step line, the question and body by method, a masked card, and Next, which keeps the answer and goes back; from Settings, no step and no Next"; AssertionError x1; restored sha256 equal
   S19 KILLED: the switch row on the ground colour [LockSetupView.tsx] -> Tests 1 failed | 37 passed (38); first failing: "the setup step: the step line, the question and body by method, a masked card, and Next, which keeps the answer and goes back; from Settings, no step and no Next"; AssertionError x1; restored sha256 equal
   N1 KILLED: the setup step opened on its own goes back to Settings [LockSetupScreen.tsx] -> Tests 1 failed | 37 passed (38); first failing: "the setup step: the step line, the question and body by method, a masked card, and Next, which keeps the answer and goes back; from Settings, no step and no Next"; AssertionError x1; restored sha256 equal
   N2 KILLED: back always replaces the screen [LockSetupScreen.tsx] -> Tests 1 failed | 37 passed (38); first failing: "the setup step: the step line, the question and body by method, a masked card, and Next, which keeps the answer and goes back; from Settings, no step and no Next"; AssertionError x1; restored sha256 equal
   W1 KILLED: the row shows without the wallet area [LockSettingsRow.tsx] -> Tests 1 failed | 37 passed (38); first failing: "Settings shows the lock row only in the wallet area"; AssertionError x1; restored sha256 equal
   W2 KILLED: the row always says off [LockSettingsRow.tsx] -> Tests 1 failed | 37 passed (38); first failing: "Settings shows the lock row only in the wallet area"; AssertionError x1; restored sha256 equal
   W3 KILLED: the row opens Settings [LockSettingsRow.tsx] -> Tests 1 failed | 37 passed (38); first failing: "Settings shows the lock row only in the wallet area"; AssertionError x1; restored sha256 equal
   W4 KILLED: the row's heading names Face ID whatever the phone [LockSettingsRow.tsx] -> Tests 1 failed | 37 passed (38); first failing: "Settings shows the lock row only in the wallet area"; AssertionError x1; restored sha256 equal
   E1 KILLED: the lock row before Haptics [SettingsScreen.tsx] -> Tests 1 failed | 37 passed (38); first failing: "Settings shows the lock row only in the wallet area"; AssertionError x1; restored sha256 equal
   E2 KILLED: Settings draws no lock row [SettingsScreen.tsx] -> Tests 1 failed | 37 passed (38); first failing: "Settings shows the lock row only in the wallet area"; AssertionError x1; restored sha256 equal
   H1 KILLED: the sheet ignores the cover (the plan's mutant) [Sheet.tsx] -> Tests 2 failed | 51 passed (53); first failing: "a hidden lock cover replaces the sheet's content"; AssertionError x2; restored sha256 equal
   H2 KILLED: Android's back closes a covered sheet [Sheet.tsx] -> Tests 1 failed | 52 passed (53); first failing: "a hidden lock cover replaces the sheet's content"; AssertionError x1; restored sha256 equal
   H3 KILLED: a covered sheet is still named [Sheet.tsx] -> Tests 1 failed | 52 passed (53); first failing: "a hidden lock cover replaces the sheet's content"; AssertionError x1; restored sha256 equal
   H4 KILLED: the sheet's backdrop is a tab stop [Sheet.tsx] -> Tests 1 failed | 52 passed (53); first failing: "the backdrop is never a tab stop"; AssertionError x1; restored sha256 equal
   C1 KILLED: the cover draws no lock screen [lockCover.tsx] -> Tests 18 failed | 20 passed (38); first failing: "with the lock on, the app opens locked and the app below is hidden from screen readers"; AssertionError x18; restored sha256 equal
   C2 KILLED: the lock screen inside the cover's art, out of screen readers' reach [lockCover.tsx] -> Tests 17 failed | 21 passed (38); first failing: "with the lock on, the app opens locked and the app below is hidden from screen readers"; AssertionError x17; restored sha256 equal
   K1 KILLED: the lock's sections not in the wallet list [index.ts] -> Tests 1 failed | 37 passed (38); first failing: "the lock's sections come after the tray's, together, and each draws its screen on a setting it holds"; AssertionError x1; restored sha256 equal
   K2 KILLED: the lock's sections before the tray's [index.ts] -> Tests 1 failed | 37 passed (38); first failing: "the lock's sections come after the tray's, together, and each draws its screen on a setting it holds"; AssertionError x1; restored sha256 equal
   K3 KILLED: the no-passcode section on a phone that can lock [lockSections.tsx] -> Tests 1 failed | 37 passed (38); first failing: "the lock's sections come after the tray's, together, and each draws its screen on a setting it holds"; AssertionError x1; restored sha256 equal
   K4 KILLED: the fingerprint section without its note [lockSections.tsx] -> Tests 1 failed | 37 passed (38); first failing: "the lock's sections come after the tray's, together, and each draws its screen on a setting it holds"; AssertionError x1; restored sha256 equal
   K5 KILLED: the setup section is not the setup step [lockSections.tsx] -> Tests 1 failed | 37 passed (38); first failing: "the lock's sections come after the tray's, together, and each draws its screen on a setting it holds"; AssertionError x1; restored sha256 equal
   P1 KILLED: the app's port can lock before P2-T34 [localAuthPort.ts] -> Tests 3 failed | 35 passed (38); first failing: "Settings shows the lock row only in the wallet area"; AssertionError x3; restored sha256 equal
   T1 KILLED: Face ID spelled in Thai letters [copy.ts] -> Tests 19 failed | 19 passed (38); first failing: "with the lock on, the app opens locked and the app below is hidden from screen readers"; AssertionError x19; restored sha256 equal
   T2 KILLED: the locked screen's title not the board's [copy.ts] -> Tests 1 failed | 17 passed (18); first failing: "the lock's Thai lines are the plan's, and only four more"; AssertionError x1; restored sha256 equal
   T3 KILLED: the try-again note not the plan's [copy.ts] -> Tests 1 failed | 17 passed (18); first failing: "the lock's Thai lines are the plan's, and only four more"; AssertionError x1; restored sha256 equal
   T4 KILLED: Face ID loses its exemption from the draft check [draftText.test.ts] -> Tests 1 failed | 17 passed (18); first failing: "every draft line has Thai and English, with the same placeholders"; AssertionError x1; restored sha256 equal
   RV1 KILLED: the receipt photo ignores the cover (the second review's M1) [ReceiptParts.tsx] -> Tests 1 failed | 37 passed (38); first failing: "with the receipt photo open, a return from the background shows the lock screen inside its own cover, and nothing of the photo"; AssertionError x1; restored sha256 equal
   RV2 KILLED: Android's back closes the covered photo [ReceiptParts.tsx] -> Tests 1 failed | 37 passed (38); first failing: "with the receipt photo open, a return from the background shows the lock screen inside its own cover, and nothing of the photo"; AssertionError x1; restored sha256 equal
   RV3 KILLED: the covered photo's layer is still named [ReceiptParts.tsx] -> Tests 1 failed | 37 passed (38); first failing: "with the receipt photo open, a return from the background shows the lock screen inside its own cover, and nothing of the photo"; AssertionError x1; restored sha256 equal
   MS1 KILLED: a new Modal that draws no cover [DateChip.tsx] -> Tests 1 failed | 17 passed (18); first failing: "every Modal a person can open with the lock on draws the lock's cover; the legacy screen's four are the only others"; AssertionError x1; restored sha256 equal
   MS2 KILLED: a legacy Modal reached from today's screens [DateChip.tsx] -> Tests 1 failed | 17 passed (18); first failing: "the legacy Modals are drawn only by the legacy /spend screen, which only the development switch shows"; AssertionError x1; restored sha256 equal
   QT1 KILLED: the app below speaks under the cover [a11y.ts] -> Tests 1 failed | 37 passed (38); first failing: "while the cover is up the app below says nothing on iOS; the lock's own notes are said, and the app speaks again once unlocked"; AssertionError x1; restored sha256 equal
   QT2 KILLED: the gate never quiets the app below [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "while the cover is up the app below says nothing on iOS; the lock's own notes are said, and the app speaks again once unlocked"; AssertionError x1; restored sha256 equal
   QT3 KILLED: the lock's own notes are quiet under its cover [LockGate.tsx] -> Tests 2 failed | 36 passed (38); first failing: "a successful scan unlocks; a cancel stays locked and says try again"; AssertionError x2; restored sha256 equal
   QT4 KILLED: a gate that goes while its cover is up leaves the app quiet [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "while the cover is up the app below says nothing on iOS; the lock's own notes are said, and the app speaks again once unlocked"; AssertionError x1; restored sha256 equal
   QT5 KILLED: the sync status speaks past the cover [announce.ts] -> Tests 1 failed | 37 passed (38); first failing: "while the cover is up the app below says nothing on iOS; the lock's own notes are said, and the app speaks again once unlocked"; AssertionError x1; restored sha256 equal
   QT6 KILLED: the app below is quieted only after its own effects ran [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "while the cover is up the app below says nothing on iOS; the lock's own notes are said, and the app speaks again once unlocked"; AssertionError x1; restored sha256 equal
   KB1 KILLED: becoming hidden leaves the keyboard up [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "becoming hidden puts the keyboard away, so no typing reaches the screen under the cover"; AssertionError x1; restored sha256 equal
   KB2 KILLED: the keyboard goes only when the app locks, not when it is only covered [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "becoming hidden puts the keyboard away, so no typing reaches the screen under the cover"; AssertionError x1; restored sha256 equal
   FP1 KILLED: the first ask does not wait for the phone (the first review's m2) [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "the first prompt waits until the phone has said how it locks, so it asks in its words; a phone that cannot be read is asked in the passcode's"; AssertionError x1; restored sha256 equal
   FP2 KILLED: a phone that cannot be read holds the first ask for good [LockGate.tsx] -> Tests 2 failed | 36 passed (38); first failing: "the first prompt waits until the phone has said how it locks, so it asks in its words; a phone that cannot be read is asked in the passcode's"; AssertionError x2; restored sha256 equal
   AO1 KILLED: the ask does not look again once a prompt answers (the first review's m3) [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "back in front while an earlier prompt is up, the new opening asks by itself once that prompt answers"; AssertionError x1; restored sha256 equal
   AO2 KILLED: an opening counts as asked before its prompt starts [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "back in front while an earlier prompt is up, the new opening asks by itself once that prompt answers"; AssertionError x1; restored sha256 equal
   FIN1 KILLED: unlock lets the next ask go only on a normal end (the first review's n4) [LockGate.tsx] -> Tests 2 failed | 36 passed (38); first failing: "each opening asks once by itself: the prompt's own inactive asks nothing, a press while a prompt is up asks nothing, every return from the background asks again, and an answer to an earlier opening is dropped"; AssertionError x2; restored sha256 equal
   FIN2 KILLED: the switch lets the next ask go only on a normal end [LockGate.tsx] -> Tests 4 failed | 34 passed (38); first failing: "turning the lock on asks to authenticate first and stays off when that fails"; AssertionError x4; restored sha256 equal
   N1A KILLED: the gate takes the port's answer as it is (the second review's n1) [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "an answer outside the port's types counts as a failed scan: the note says try again, and the button asks again"; AssertionError x1; restored sha256 equal
   N1B KILLED: the gate takes the port's reading as it is [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "a reading outside the port's types counts as a phone that could not be read: the lock stays on, and the screen names the passcode"; AssertionError x1; restored sha256 equal
   AR1 KILLED: an answer outside the types passes as it is [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "an answer or a reading outside the port's types counts as a failed scan, or as a phone that could not be read"; AssertionError x1; restored sha256 equal
   AR2 KILLED: an answer outside the types counts as a success [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "an answer or a reading outside the port's types counts as a failed scan, or as a phone that could not be read"; AssertionError x1; restored sha256 equal
   AV1 KILLED: a reading with no boolean canLock passes [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "an answer or a reading outside the port's types counts as a failed scan, or as a phone that could not be read"; AssertionError x1; restored sha256 equal
   AV2 KILLED: a reading with a method outside the types passes [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "an answer or a reading outside the port's types counts as a failed scan, or as a phone that could not be read"; AssertionError x1; restored sha256 equal
   AV3 KILLED: a method is looked up through the prototype chain ('toString' passes) [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "an answer or a reading outside the port's types counts as a failed scan, or as a phone that could not be read"; AssertionError x1; restored sha256 equal
   RC1 KILLED: any falsy canLock counts as a phone that cannot lock [lockModel.ts] -> Tests 1 failed | 17 passed (18); first failing: "an answer or a reading outside the port's types counts as a failed scan, or as a phone that could not be read"; AssertionError x1; restored sha256 equal
   WS1 KILLED: turning the lock on does not wait for the store (the second review's m3) [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "turning the lock on holds only once it is stored: a store that cannot keep it leaves the switch off and says so"; AssertionError x1; restored sha256 equal
   WS2 KILLED: a lock the store could not keep turns on anyway [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "turning the lock on holds only once it is stored: a store that cannot keep it leaves the switch off and says so"; AssertionError x1; restored sha256 equal
   WS3 KILLED: a lock the store could not keep says nothing [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "turning the lock on holds only once it is stored: a store that cannot keep it leaves the switch off and says so"; AssertionError x1; restored sha256 equal
   WS4 KILLED: iOS does not hear that the lock could not be kept on [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "turning the lock on holds only once it is stored: a store that cannot keep it leaves the switch off and says so"; AssertionError x1; restored sha256 equal
   WS5 KILLED: a new turn keeps the last notice [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "turning the lock on holds only once it is stored: a store that cannot keep it leaves the switch off and says so"; AssertionError x1; restored sha256 equal
   WS6 KILLED: turning the lock off keeps the setting [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "turning it off asks too"; AssertionError x1; restored sha256 equal
   T5 KILLED: the not-kept line not the brief's [copy.ts] -> Tests 1 failed | 17 passed (18); first failing: "the lock's Thai lines are the plan's, and only four more"; AssertionError x1; restored sha256 equal
   N6A KILLED: a lock that was on only because its setting could not be read says it turned off (the first review's n6) [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "a setting that cannot be read, on a phone that cannot lock, opens the app with no notice; a lock turned on since is said"; AssertionError x1; restored sha256 equal
   N6B KILLED: a setting that could not be read is taken as the person's [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "a setting that cannot be read, on a phone that cannot lock, opens the app with no notice; a lock turned on since is said"; AssertionError x1; restored sha256 equal
   N6C KILLED: a lock the person turns on after an unreadable setting turns off without a word [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "a setting that cannot be read, on a phone that cannot lock, opens the app with no notice; a lock turned on since is said"; AssertionError x1; restored sha256 equal
   TM1 KILLED: the turned-off notice goes after three seconds (the first review's M1, m4) [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "the turned-off notice stays until it is closed, however long it is up"; AssertionError x1; restored sha256 equal
   SG1 KILLED: the switch asks while the lock is already as asked (the first review's M2, n3) [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "asking to turn the lock on while it is on, or off while it is off, asks nothing"; AssertionError x1; restored sha256 equal
   LB1 KILLED: an app launched behind counts as in front (the first review's M4, n1) [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "an app launched behind asks only once it is in front"; AssertionError x1; restored sha256 equal
   RT1 KILLED: the route shows the setup screen without the wallet area (the first review's M6, n2) [lock.tsx] -> Tests 1 failed | 1 passed (2); first failing: "without the wallet area the route goes to Settings, whatever it is asked"; AssertionError x1; restored sha256 equal
   RT2 KILLED: the route ignores ?setup=1 (the first review's M7, n2) [lock.tsx] -> Tests 1 failed | 1 passed (2); first failing: "under the wallet area it is the setup screen, as the setup step only with ?setup=1"; AssertionError x1; restored sha256 equal
   RT3 KILLED: any ?setup value is the setup step [lock.tsx] -> Tests 1 failed | 1 passed (2); first failing: "under the wallet area it is the setup screen, as the setup step only with ?setup=1"; AssertionError x1; restored sha256 equal
   SW1 KILLED: a failed scan or a lockout changes the lock (the second review's A2, m2) [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "the switch leaves the lock as it was after a scan that fails or locks out, turning it on or off"; AssertionError x1; restored sha256 equal
   SW2 KILLED: turning the lock off, unavailable ignores the phone's reading (the second review's A3, m2) [LockGate.tsx] -> Tests 1 failed | 37 passed (38); first failing: "turning the lock off, an unavailable answer on a phone that can still lock keeps the lock on and says nothing"; AssertionError x1; restored sha256 equal
   166 killed, 0 survived, 0 not as expected
   ```
   The first 121 are the first round's (P16 names the re-aimed ones); the last 45 are this round's. Every kill fails an assertion. N1A also leaves an `Unhandled Rejection` in its log: the odd answer reaches `afterAnswer`, whose `undefined` throws inside the `try`, and the `finally` still resets `asking`.
2. `cd WT && shasum -a 256 -c PL/SHA256SUMS.real-in-wt`, `cd WT && shasum -a 256 -c PL/SHA256SUMS.datechip-in-wt` (one `OK` line: the runner put `DateChip.tsx` back), and `/usr/bin/git -C WT status --short`. Expected: unchanged from Step 3.2.

## Step 5: The fast local gate (R100)

From WT, in this order, each with its log in S:

1. `npm run typecheck:app`: exit 0.
2. `npm run test:unit`: exit 0 and `ℹ fail 0`. (R100: no total is checked; record what it prints.)
3. `npm run test:app`: exit 0 and `ℹ fail 0`.
4. The focused files once more:
   - `cd WT/apps/app && npm run test:unit -- src/wallet/lock/lockModel.test.ts src/ui/lockCover.test.ts src/wallet/copy/draftText.test.ts`: `ℹ pass 18`, `ℹ fail 0`;
   - the render files of Steps 3.5 to 3.7 in one run: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/lock/Lock.render.test.tsx src/wallet/lock/LockRoute.render.test.tsx src/ui/Sheet.render.test.tsx src/screens/redesign/import/RecordReceipt.render.test.tsx src/sync/SyncStatus.render.test.tsx src/ui/a11y.render.test.tsx src/ui/StagedProgress.render.test.tsx src/ui/SyncBanner.render.test.tsx src/ui/Sheet.keyboard.render.test.tsx src/wallet/WalletRoot.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/screens/redesign/account/SettingsScreen.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/card/WalletCard.render.test.tsx src/wallet/motion/GrowBar.render.test.tsx src/wallet/money/WalletAmount.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/RootLayout.render.test.tsx`: exit 0, `Test Files  20 passed (20)`, `Tests  302 passed (302)` (40 + 88 + N).
5. The catalogue's sections: Step 1.4's command: exit 0, `Tests  C passed`.
6. `/usr/bin/git -C WT diff --check` before the commit, and `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD` after it: no output. (The second command spans the first round's commit too, which was clean.)

Not run here, and why (put this in the receipt):
- In CI on the PR (R100): the full render suite, `export:web`, the iOS export, `test:ops` and the database suites.
- Not needed: `typecheck:routes` and `export:web` locally (no route, config or app entry changes), and the API and edge suites (nothing outside `apps/app` changes).
- SKIPPED: the device checks of P19, and the first round's.

## Step 6: Receipt

Write `WT/docs/implementation/receipts/P2-T33-fix.md` in the house style of `receipts/P2-T33.md`, with your own numbers where they differ from these. Start from:

```markdown
# P2-T33-fix: The P2-T33 fix round (PR #406; ruling R107)

- **Status:** built and verified locally on `p2/t33-face-id-lock` (`.claude/worktrees/p2-t33`), on top of the reviewed head `5844e4c1`, with no merge (the controller merges after #407). Not pushed. The second review said Needs fixes (M1, major); the first approved with minors. Ruling R107 rules every finding; the controller gave leave to edit `ReceiptParts.tsx`, the other Modal files and `ui/a11y.ts`. Under R87 this receipt is its own file.
- **Base:** `5844e4c1`. Step 1.2 listed: (what it printed, or "nothing").
- **Files:** modified `apps/app/src/screens/redesign/import/ReceiptParts.tsx` (the receipt photo draws the cover), `apps/app/src/ui/a11y.ts` (the quiet flag), `apps/app/src/sync/announce.ts` (through `announcePolitely`), `apps/app/src/ui/Sheet.tsx` (a comment), `apps/app/src/wallet/lock/LockGate.tsx`, `lockModel.ts`, `copy.ts` (`lock.notStored`), `lockModel.test.ts` (11 cases before, 12 after) and `Lock.render.test.tsx` (24 before, 38 after); created `apps/app/src/ui/lockCover.test.ts` (2 cases), `apps/app/src/wallet/lock/LockRoute.render.test.tsx` (2 cases) and this receipt.
- **What changed, by finding:**
  - The second review's M1 (P2, P3): ...
  - The first review's m2, m3, m4 and n4 (P4 to P7): ...
  - The second review's m2 to m5 and n1 (P8 to P11, P13): ...
  - The pins (P13): the first review's n1, n2, n3 and n5.
  - The first review's n6 (P12): ...
- **RED to GREEN:**
  - RED (Step 2): Node 2 of 18 failing, render 9 of 40, each on an assertion, with the messages; the one expected unhandled `TypeError` (n4, P15); the nine pins killing their survivors on `5844e4c1`'s code (Step 2.5).
  - GREEN (Step 3): Node 18 of 18; Lock 38 and LockRoute 2; the round's other render files 88; the neighbours N; the catalogue C.
- **Mutation check:** 166, all killed: the first round's 121 (re-aimed, P16) and this round's 45. Every kill fails an assertion; N1A also leaves an unhandled `TypeError`.
- **Gate:** every command of Step 5 with its result, and no whole-suite totals.
- **Carried (R107.5):** the first review's m1 to P2-T34's phone check; the second review's m1 to later sheet hosts (1C-T9, P6B-T8) and P2-T34, with `Sheet.tsx`'s comment now saying so; the second review's m6 to owner Q1.
- **SKIPPED and CI:** as Step 5 says, and P19's device checks: the keyboard on a phone when the lock engages, VoiceOver over the receipt photo's cover, nothing below speaking on an iPhone, and TalkBack's live regions under the cover.
- **Notes for later tasks:**
  - P2-T34: map every answer to an `AuthResult` and keep `canLock` a boolean. The gate now treats anything else as a failed scan or an unreadable phone (`authResultOf`, `availabilityOf`), but the adapter is still the place to get it right. `availability()` must answer, since the first automatic ask waits for it. Keep `getAppLocalAuth()` one stable object (the first review's note). Check Android's activity-based credential screen (the first review's m1).
  - Every later Modal: draw `LockCoverArt` under `useLockCover().hidden`, as `Sheet`, `Tray` and the receipt photo do, or `src/ui/lockCover.test.ts` fails. P3's `WalletReceiptViewer` is one.
  - Every later announcement: go through `announcePolitely` (or `useAnnouncement`), never `AccessibilityInfo.announceForAccessibility` itself, so it stays quiet under the lock's cover. Only the gate uses `announceOverLockCover`.
  - 1C-T9 and P6B-T8: under the cover a Sheet's or a tray's children unmount, so the email code step starts again (the second review's m1).
  - E2-D: `lock.notStored` is a new draft line (P20).
```

## Step 7: Commit

1. `/usr/bin/git -C WT add apps/app/src/screens/redesign/import/ReceiptParts.tsx apps/app/src/sync/announce.ts apps/app/src/ui/Sheet.tsx apps/app/src/ui/a11y.ts apps/app/src/ui/lockCover.test.ts apps/app/src/wallet/lock/Lock.render.test.tsx apps/app/src/wallet/lock/LockGate.tsx apps/app/src/wallet/lock/LockRoute.render.test.tsx apps/app/src/wallet/lock/copy.ts apps/app/src/wallet/lock/lockModel.test.ts apps/app/src/wallet/lock/lockModel.ts docs/implementation/receipts/P2-T33-fix.md`
2. `/usr/bin/git -C WT status --short`: those twelve files staged (`A` for the two new tests and the receipt, `M` for the nine others), nothing else (no log).
3. Write the message to `S/commit-message.txt`. The trailer names the model you run as (for Claude Haiku 5.5, the line below):
   ```
   Cover the receipt photo under the Face ID lock, and tighten the gate as both reviews ask

   The record's receipt photo is a Modal of its own, so it stayed drawn
   over the locked app. It now draws the lock's cover in its place, as a
   sheet does, and a source check holds every Modal to that rule.

   The first automatic ask waits for the phone's words; an opening that
   comes while a prompt is up asks once that prompt answers; an answer or
   a reading outside the port's types counts as a failed scan or a phone
   still able to lock; turning the lock on holds only once it is stored.
   While the cover is up, the app below says nothing on iOS and the
   keyboard goes. A lock that was on only because its setting could not
   be read turns off without a word. Pin what the reviews found loose.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-message.txt`, then `/usr/bin/git -C WT log --oneline -2` and `/usr/bin/git -C WT show --stat HEAD`: 12 files. `/usr/bin/git -C WT status --short` prints nothing. Do not push.

## Your final message

As the protocol says:
- `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker) on the first line;
- the fix commit's SHA and branch, and the files changed;
- RED: Node 2 of 18 and render 9 of 40 failing on assertions, the one expected unhandled `TypeError`, and the nine pins;
- GREEN: the counts;
- mutants: 166, all killed;
- each gate command with its result, and no whole-suite totals;
- SKIPPED and CI items.

Name what the reviewer should look at first:
- the receipt photo under the cover, and the Modal sweep's source check (P2, P3);
- the gate's openings: `settled`, the mark in `unlock`, `busy` as a dependency (P4, P5);
- the quiet flag in `a11y.ts`, its layout effect, and the one line in `sync/announce.ts` that R107 did not name (P10);
- the fail-closed write and its notice (P9).

---

## Appendix: the code diffs

Each block is the kit's diff, byte for byte. Copy from `PL/real/`, not from here. The four test files' diffs are in `PL/diffs/` (`Lock.render.test.tsx` adds 14 cases, so its diff is long).

`apps/app/src/screens/redesign/import/ReceiptParts.tsx`:

```diff
diff --git a/apps/app/src/screens/redesign/import/ReceiptParts.tsx b/apps/app/src/screens/redesign/import/ReceiptParts.tsx
index afa6df61d5b394abff8d84d39bee17f43b38f626..a54f8b0ad6f5ac128a16c01f391c3cc2d4c9127a 100644
--- a/apps/app/src/screens/redesign/import/ReceiptParts.tsx
+++ b/apps/app/src/screens/redesign/import/ReceiptParts.tsx
@@ -33,6 +33,7 @@ import { useBunColors } from '@mobile/theme/ThemeProvider';
 import { DECORATIVE, POLITE_LIVE_REGION, moveAccessibilityFocus, useAnnouncement } from '@mobile/ui/a11y';
 import { BunText } from '@mobile/ui/BunText';
 import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';
+import { LockCoverArt, useLockCover } from '@mobile/ui/lockCover';
 import { PillButton } from '@mobile/ui/PillButton';
 import { PromiseList } from '@mobile/ui/PromiseList';
 import { Sheet } from '@mobile/ui/Sheet';
@@ -203,12 +204,20 @@ export type ViewerState = { state: 'loading' } | { state: 'ready'; uri: string }
  * its title when it opens. It fades in; under reduced motion it simply
  * appears. The fade is the kit's own opacity timing, like the Sheet's spring,
  * so the modal itself never animates and is active (a dialog) at once.
+ *
+ * Under the Face ID lock's cover (R63, P2-T33) it draws LockCoverArt in place
+ * of the photo, as the Sheet does: a Modal draws above the app, so the lock's
+ * own cover lies under it, and while the app is locked this cover carries the
+ * lock screen. Nothing of the photo is drawn or named, and Android's back
+ * (Escape on the web) asks nothing. When the cover lifts the photo is back as
+ * it was, without fading in again.
  */
 export function ReceiptViewer({ visible, view, onClose, onRetry }: { visible: boolean; view: ViewerState; onClose: () => void; onRetry: () => void }) {
   const tc = useCopy();
   const colors = useBunColors();
   const insets = useSafeAreaInsets();
   const reducedMotion = useReducedMotion();
+  const { hidden } = useLockCover();
   const viewerRef = useRef<HostInstance>(null);
   const titleRef = useRef<HostInstance>(null);
   const opacity = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
@@ -223,57 +232,64 @@ export function ReceiptViewer({ visible, view, onClose, onRetry }: { visible: bo
   }, [opacity, reducedMotion, visible]);
   const title = tc('Receipt photo');
   const web = Platform.OS === 'web';
-  const webDialog = web ? { 'aria-label': title } : null;
+  // Under the lock nothing is named.
+  const webDialog = web ? { 'aria-label': hidden ? undefined : title } : null;
   const panelDialog = web ? null : { role: 'dialog' as const, 'aria-modal': true, 'aria-label': title };
   const nativeTitle = web ? null : { accessible: true, accessibilityRole: 'header' as const, accessibilityLabel: title };
+  // Android's back (Escape on the web) asks nothing under the lock's cover.
+  const requestClose = () => {
+    if (!hidden) onClose();
+  };
   return (
     <Modal
       visible={visible}
       animationType="none"
-      onRequestClose={onClose}
+      onRequestClose={requestClose}
       onShow={() => moveAccessibilityFocus(web ? viewerRef.current : titleRef.current)}
       statusBarTranslucent
       {...webDialog}
     >
-      <Animated.View
-        ref={viewerRef}
-        testID="receipt-viewer"
-        {...panelDialog}
-        accessibilityViewIsModal
-        onAccessibilityEscape={onClose}
-        tabIndex={-1}
-        style={{ flex: 1, opacity, backgroundColor: colors.background, paddingTop: insets.top + BUN_SPACE.sm, paddingBottom: insets.bottom + BUN_SPACE.md, paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.md }}
-      >
-        <View style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.sm }}>
-          <View ref={titleRef} {...nativeTitle} style={{ flex: 1 }}>
-            <BunText variant="heading" role="heading" accessibilityRole="header">{title}</BunText>
-          </View>
-          <Pressable
-            accessibilityRole="button"
-            accessibilityLabel={tc('Close')}
-            onPress={onClose}
-            style={{ minHeight: BUN_TOUCH, minWidth: BUN_TOUCH, borderRadius: BUN_RADIUS.pill, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}
-          >
-            <View {...DECORATIVE}>
-              <BunText variant="heading">×</BunText>
-            </View>
-          </Pressable>
-        </View>
-        <View style={{ flex: 1, justifyContent: 'center', borderRadius: BUN_RADIUS.card, borderWidth: BUN_OUTLINE.card, borderColor: colors.ink, backgroundColor: colors.paper, overflow: 'hidden' }}>
-          {view.state === 'ready' ? (
-            <Image testID="receipt-full-image" accessible accessibilityRole="image" accessibilityLabel={title} source={{ uri: view.uri }} resizeMode="contain" style={{ flex: 1 }} />
-          ) : view.state === 'loading' ? (
-            <View style={{ padding: BUN_SPACE.md }}>
-              <ReceiptWorking label={tc('Loading the receipt photo…')} />
+      {hidden ? <LockCoverArt /> : (
+        <Animated.View
+          ref={viewerRef}
+          testID="receipt-viewer"
+          {...panelDialog}
+          accessibilityViewIsModal
+          onAccessibilityEscape={onClose}
+          tabIndex={-1}
+          style={{ flex: 1, opacity, backgroundColor: colors.background, paddingTop: insets.top + BUN_SPACE.sm, paddingBottom: insets.bottom + BUN_SPACE.md, paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.md }}
+        >
+          <View style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.sm }}>
+            <View ref={titleRef} {...nativeTitle} style={{ flex: 1 }}>
+              <BunText variant="heading" role="heading" accessibilityRole="header">{title}</BunText>
             </View>
-          ) : (
-            <View accessibilityRole="alert" style={{ padding: BUN_SPACE.md, gap: BUN_SPACE.sm }}>
-              <BunText style={{ fontWeight: '700' }}>{view.message}</BunText>
-              <PillButton kind="secondary" label={tc('Try again')} onPress={onRetry} />
-            </View>
-          )}
-        </View>
-      </Animated.View>
+            <Pressable
+              accessibilityRole="button"
+              accessibilityLabel={tc('Close')}
+              onPress={onClose}
+              style={{ minHeight: BUN_TOUCH, minWidth: BUN_TOUCH, borderRadius: BUN_RADIUS.pill, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}
+            >
+              <View {...DECORATIVE}>
+                <BunText variant="heading">×</BunText>
+              </View>
+            </Pressable>
+          </View>
+          <View style={{ flex: 1, justifyContent: 'center', borderRadius: BUN_RADIUS.card, borderWidth: BUN_OUTLINE.card, borderColor: colors.ink, backgroundColor: colors.paper, overflow: 'hidden' }}>
+            {view.state === 'ready' ? (
+              <Image testID="receipt-full-image" accessible accessibilityRole="image" accessibilityLabel={title} source={{ uri: view.uri }} resizeMode="contain" style={{ flex: 1 }} />
+            ) : view.state === 'loading' ? (
+              <View style={{ padding: BUN_SPACE.md }}>
+                <ReceiptWorking label={tc('Loading the receipt photo…')} />
+              </View>
+            ) : (
+              <View accessibilityRole="alert" style={{ padding: BUN_SPACE.md, gap: BUN_SPACE.sm }}>
+                <BunText style={{ fontWeight: '700' }}>{view.message}</BunText>
+                <PillButton kind="secondary" label={tc('Try again')} onPress={onRetry} />
+              </View>
+            )}
+          </View>
+        </Animated.View>
+      )}
     </Modal>
   );
 }
```

`apps/app/src/ui/a11y.ts`:

```diff
diff --git a/apps/app/src/ui/a11y.ts b/apps/app/src/ui/a11y.ts
index a962795a21b0ebc9df29618ad3ee539660457836..d2f95d5a22bba59f90fa5a42f969e26125ea8bb0 100644
--- a/apps/app/src/ui/a11y.ts
+++ b/apps/app/src/ui/a11y.ts
@@ -24,8 +24,26 @@ export const POLITE_LIVE_REGION = {
   'aria-live': 'polite',
 } as const;

-/** Speaks `text` on iOS, where live regions are not read. Never moves focus. */
+/**
+ * While the Face ID lock's cover is up (P2-T33), the app below it says nothing:
+ * iOS speaks an announcement whatever is drawn over the part that made it, so
+ * the hidden app's status lines would still be heard over the lock screen.
+ * LockGate sets it from its `hidden`; outside a gate it stays false.
+ */
+let quietUnderLockCover = false;
+
+/** LockGate's: true while its cover is up, false once the app below is in view again. */
+export function setQuietUnderLockCover(quiet: boolean): void {
+  quietUnderLockCover = quiet;
+}
+
+/** Speaks `text` on iOS, where live regions are not read. Never moves focus. Says nothing while the lock's cover is up. */
 export function announcePolitely(text: string): void {
+  if (!quietUnderLockCover) announceOverLockCover(text);
+}
+
+/** Speaks `text` on iOS even while the lock's cover is up: only for the lock's own notes (LockGate). Never moves focus. */
+export function announceOverLockCover(text: string): void {
   if (Platform.OS === 'ios' && text) AccessibilityInfo.announceForAccessibility(text);
 }

```

`apps/app/src/sync/announce.ts`:

```diff
diff --git a/apps/app/src/sync/announce.ts b/apps/app/src/sync/announce.ts
index ef1935263d3816f3e9ce8d51c31c00ee4fef178f..532c46638a7fddf5219e0e98b0391a6ffdcd35f8 100644
--- a/apps/app/src/sync/announce.ts
+++ b/apps/app/src/sync/announce.ts
@@ -1,8 +1,9 @@
 // Spoken status updates. iOS VoiceOver ignores live regions, so a changed
 // sync status is announced explicitly there; Android and the web use the
-// banner's polite live region.
-import { AccessibilityInfo, Platform } from 'react-native';
+// banner's polite live region. It is said through announcePolitely, so
+// nothing is said while the Face ID lock's cover is up (P2-T33).
+import { announcePolitely } from '@mobile/ui/a11y';

 export function announceStatus(text: string): void {
-  if (Platform.OS === 'ios' && text) AccessibilityInfo.announceForAccessibility(text);
+  announcePolitely(text);
 }
```

`apps/app/src/ui/Sheet.tsx`:

```diff
diff --git a/apps/app/src/ui/Sheet.tsx b/apps/app/src/ui/Sheet.tsx
index 05aad7128cd042523bdbc61eeafc45c9056b97d4..e6bd05a59e5341a5b172e162518ea8bcb46a9645 100644
--- a/apps/app/src/ui/Sheet.tsx
+++ b/apps/app/src/ui/Sheet.tsx
@@ -13,7 +13,9 @@
 // place of its backdrop and panel, and while the app is locked the cover
 // carries the lock screen: a Modal draws above the app, so this is where a
 // person whose sheet is open meets it. Nothing of the sheet is named, and
-// nothing asks to close it; its content is its host's, so nothing is lost.
+// nothing asks to close it. Its children unmount meanwhile: what the host
+// holds is kept, but a child that keeps its own state (a form's step, a typed
+// code) starts again when the cover lifts (P2-T33's second review, m1).
 //
 // ConfirmSheet states the consequence of an action before it happens. When the
 // action is destructive, the safe choice (cancel) keeps the ink fill and the
```

`apps/app/src/wallet/lock/LockGate.tsx`:

```diff
diff --git a/apps/app/src/wallet/lock/LockGate.tsx b/apps/app/src/wallet/lock/LockGate.tsx
index 3c28ddc58320d3caa32eab00b083b8b4ad57b9e2..fe974523ac2b53f215ef9f00b8c65d94a05f5233 100644
--- a/apps/app/src/wallet/lock/LockGate.tsx
+++ b/apps/app/src/wallet/lock/LockGate.tsx
@@ -8,39 +8,50 @@
 //   lock on never sees a frame of it at launch. A setting that cannot be read
 //   counts as on: a broken store never opens the app.
 // - Covered or locked, the app stays mounted (drafts and sync carry on) but no
-//   screen reader reaches it, and LockCoverContext says hidden, so every Tray
-//   and Sheet draws LockCoverArt in place of its content (R63).
+//   screen reader reaches it, and LockCoverContext says hidden, so every Tray,
+//   Sheet and receipt photo draws LockCoverArt in place of its content (R63;
+//   lockCover.test.ts keeps the list of Modals).
 // - Locked, the cover also carries LockedScreen. A Modal draws above the app's
 //   root and iOS presents no Modal over one that is up, so the lock screen is
 //   in every cover: the gate's own, over the app, and an open tray's or
 //   sheet's, inside its Modal. The topmost one is the one a person sees and
 //   presses (P2-T13's review, m1).
 // - Each opening of the app with the lock on (a cold start, every return from
-//   the background) asks the phone once by itself, when the app is in front.
-//   `inactive` (the prompt itself) asks nothing, so the scan cannot loop, and
-//   an answer to an earlier opening is dropped.
+//   the background) asks the phone once by itself, when the app is in front
+//   and the phone has said how it locks (a phone that cannot be read is asked
+//   in the passcode's words). `inactive` (the prompt itself) asks nothing, so
+//   the scan cannot loop, and an answer to an earlier opening is dropped. An
+//   opening counts as asked only once its prompt starts, so one that comes
+//   while an earlier prompt is up asks once that prompt has answered.
 // - The answers (R67): success unlocks; cancelled and failed stay locked and
 //   say lock.tryAgain; lockout says lock.lockout; unavailable reads the phone
 //   again first: still able to lock, it stays locked with lock.tryAgain; no
 //   longer able, the lock turns itself off, unlocks and says lock.turnedOff
-//   once. A prompt that throws counts as failed and a phone that cannot be
-//   read as still able, so a broken port never opens the app. iOS hears each
-//   note once from here, since every cover draws the locked screen.
+//   once. A prompt that throws, or answers outside the port's types, counts
+//   as failed, and a phone that cannot be read, or reads outside them, as
+//   still able, so a broken port never opens the app. A lock that was on only
+//   because its setting could not be read turns off without a word. iOS hears
+//   each note once from here, since every cover draws the locked screen.
+// - While the cover is up the app below says nothing on iOS (its announcements
+//   are quiet; the gate's own notes are said over the cover), and the keyboard
+//   goes, so no typing reaches the screen under it.
 // - Under the cover Android's back does nothing: it would pop a screen, and
 //   the draft on it, under the lock (a tray and a sheet already ignore it).
 // - LockSettingContext serves the setup screen and the Settings row: the lock
 //   goes on only on a phone that can lock, turning it on and off each asks the
-//   phone first, and either keeps lock-answered.
-import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
+//   phone first, and either keeps lock-answered. Turning it on holds only once
+//   it is stored, so the next launch locks too; a store that cannot keep it
+//   leaves the lock off and says so.
+import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
 import type { ReactNode } from 'react';
-import { AppState, BackHandler, Platform, Pressable, View } from 'react-native';
+import { AppState, BackHandler, Keyboard, Platform, Pressable, View } from 'react-native';
 import { IntlContext } from 'react-intl';
 import { useSafeAreaInsets } from 'react-native-safe-area-context';

 import { isSupportedLocale } from '@mobile/i18n/locales';
 import { translateCopy } from '@mobile/i18n/messages';
 import { useWalletColors } from '@mobile/theme/ThemeProvider';
-import { announcePolitely, POLITE_LIVE_REGION } from '@mobile/ui/a11y';
+import { announceOverLockCover, POLITE_LIVE_REGION, setQuietUnderLockCover } from '@mobile/ui/a11y';
 import { LockCoverArt, LockCoverContext } from '@mobile/ui/lockCover';
 import type { LockCover } from '@mobile/ui/lockCover';
 import { COMMON_COPY } from '../common/copy';
@@ -51,7 +62,7 @@ import { COPY } from './copy';
 import type { LocalAuthPort } from './localAuthPort';
 import { LockedScreen } from './LockedScreen';
 import type { AuthResult, LockAvailability, LockEvent, LockNote, LockView } from './lockModel';
-import { afterAnswer, afterRecheck, appStateEvent, LOCK_ANSWERED_NAME, LOCK_NAME, lockReducer, METHOD_KEYS, namedMethod, UNLOCKED } from './lockModel';
+import { afterAnswer, afterRecheck, appStateEvent, authResultOf, availabilityOf, LOCK_ANSWERED_NAME, LOCK_NAME, lockReducer, METHOD_KEYS, namedMethod, UNLOCKED } from './lockModel';

 /** What the setup screen and the Settings row read, and ask. */
 export type LockSetting = {
@@ -63,7 +74,7 @@ export type LockSetting = {
   readonly availability: LockAvailability | null;
   /** A prompt is up: nothing else asks until it answers. */
   readonly busy: boolean;
-  /** Asks the phone first; on success turns the lock on or off and keeps lock-answered. */
+  /** Asks the phone first; on success turns the lock on (once it is stored) or off, and keeps lock-answered. */
   readonly change: (on: boolean) => Promise<void>;
   /** Keeps lock-answered, the lock left as it is (the setup step's next). */
   readonly answer: () => void;
@@ -98,13 +109,17 @@ const UNREAD: Setting = { ready: false, enabled: false };

 const LOCK_COPY = { ...COMMON_COPY, ...COPY };

-/** Says once, over the app, that the lock turned itself off (R67), until the person closes it. */
-function TurnedOffNotice({ text, close, onClose }: { text: string; close: string; onClose: () => void }) {
+/** The gate's notices: the lock turned itself off (R67), or could not be kept on. */
+type LockNotice = 'lock.turnedOff' | 'lock.notStored';
+const NOTICE_IDS: Readonly<Record<LockNotice, string>> = { 'lock.turnedOff': 'lock-turned-off', 'lock.notStored': 'lock-not-stored' };
+
+/** Says a notice once, over the app, until the person closes it. */
+function Notice({ testID, text, close, onClose }: { testID: string; text: string; close: string; onClose: () => void }) {
   const colors = useWalletColors();
   const insets = useSafeAreaInsets();
   return (
     <View
-      testID="lock-turned-off"
+      testID={testID}
       {...POLITE_LIVE_REGION}
       style={{
         position: 'absolute',
@@ -145,12 +160,16 @@ export function LockGate({ port, children }: { port: LocalAuthPort; children: Re
   const [view, setView] = useState<LockView>(UNLOCKED);
   const [phone, setPhone] = useState<LockAvailability | null>(null);
   const [note, setNote] = useState<LockNote | null>(null);
-  const [turnedOff, setTurnedOff] = useState(false);
+  const [notice, setNotice] = useState<LockNotice | null>(null);
   const [busy, setBusy] = useState(false);
   const [front, setFront] = useState(() => AppState.currentState === 'active');
+  // The phone's first reading has answered, or failed: the first ask waits for it, so it asks in the phone's words.
+  const [settled, setSettled] = useState(false);

   // What the rules read between renders.
   const enabled = useRef(false);
+  // On only because the setting could not be read: the person never turned it on.
+  const assumed = useRef(false);
   const known = useRef<LockAvailability | null>(null);
   const asking = useRef(false);
   // Each opening with the lock on is asked once, by itself; an answer to an earlier opening is dropped.
@@ -171,10 +190,11 @@ export function LockGate({ port, children }: { port: LocalAuthPort; children: Re
     let live = true;
     void walletDeviceStore()
       .get(LOCK_NAME)
-      .then((value) => value === '1', () => true)
-      .then((on) => {
+      .then((value) => ({ on: value === '1', read: true }), () => ({ on: true, read: false }))
+      .then(({ on, read }) => {
         if (!live) return;
         enabled.current = on;
+        assumed.current = !read;
         setSetting({ ready: true, enabled: on });
         dispatch({ type: 'start' });
       });
@@ -186,8 +206,9 @@ export function LockGate({ port, children }: { port: LocalAuthPort; children: Re
   /** What the phone can do, read again each time; null when it cannot be read. */
   const readPhone = useCallback(async (): Promise<LockAvailability | null> => {
     try {
-      const { canLock, method } = await port.availability();
-      const answer = { canLock, method };
+      // A reading outside the port's types counts as one that could not be read.
+      const answer = availabilityOf(await port.availability());
+      if (answer === null) return null;
       known.current = answer;
       setPhone(answer);
       return answer;
@@ -197,7 +218,13 @@ export function LockGate({ port, children }: { port: LocalAuthPort; children: Re
   }, [port]);

   useEffect(() => {
-    void readPhone();
+    let live = true;
+    void readPhone().then(() => {
+      if (live) setSettled(true);
+    });
+    return () => {
+      live = false;
+    };
   }, [readPhone]);

   useEffect(() => {
@@ -214,7 +241,8 @@ export function LockGate({ port, children }: { port: LocalAuthPort; children: Re

   const prompt = useCallback(async (words: string): Promise<AuthResult> => {
     try {
-      return await port.authenticate({ prompt: words, cancel, fallback: t('lock.usePasscode') });
+      // An answer outside the port's types counts as failed.
+      return authResultOf(await port.authenticate({ prompt: words, cancel, fallback: t('lock.usePasscode') }));
     } catch {
       return 'failed';
     }
@@ -226,36 +254,45 @@ export function LockGate({ port, children }: { port: LocalAuthPort; children: Re
     setSetting({ ready: true, enabled: false });
     void walletDeviceStore().remove(LOCK_NAME).catch(() => undefined);
     dispatch({ type: 'disabled' });
-    setTurnedOff(true);
-    announcePolitely(t('lock.turnedOff'));
+    // A lock that was on only because its setting could not be read was never the person's: nothing to say.
+    if (assumed.current) return;
+    setNotice('lock.turnedOff');
+    announceOverLockCover(t('lock.turnedOff'));
   }, [dispatch, t]);

   /** Asks the phone to unlock: once by itself for each opening, and again from the locked screen. */
   const unlock = useCallback(async () => {
     if (asking.current) return;
     asking.current = true;
-    setBusy(true);
+    // This opening has its prompt now.
     const at = opening.current;
-    const answer = afterAnswer(await prompt(t(METHOD_KEYS[namedMethod(known.current)].line)));
-    const then = answer.step === 'recheck' ? afterRecheck(await readPhone()) : answer;
-    asking.current = false;
-    setBusy(false);
-    if (at !== opening.current) return;
-    if (then.step === 'turnOff') {
-      turnOff();
-    } else if (then.step === 'unlock') {
-      dispatch({ type: 'unlocked' });
-    } else {
-      setNote(then.note);
-      announcePolitely(t(then.note));
+    asked.current = at;
+    setBusy(true);
+    try {
+      const answer = afterAnswer(await prompt(t(METHOD_KEYS[namedMethod(known.current)].line)));
+      const then = answer.step === 'recheck' ? afterRecheck(await readPhone()) : answer;
+      if (at !== opening.current) return;
+      if (then.step === 'turnOff') {
+        turnOff();
+      } else if (then.step === 'unlock') {
+        dispatch({ type: 'unlocked' });
+      } else {
+        setNote(then.note);
+        announceOverLockCover(t(then.note));
+      }
+    } finally {
+      // However the answer went, the next press, or the next opening, can ask.
+      asking.current = false;
+      setBusy(false);
     }
   }, [prompt, readPhone, turnOff, dispatch, t]);

+  // Each opening asks once by itself: in front, and once the phone has said how it locks. While a prompt is up unlock
+  // asks nothing and leaves the opening unasked, so `busy` is a dependency: the opening asks once that prompt answers.
   useEffect(() => {
-    if (!view.locked || !front || asked.current === opening.current) return;
-    asked.current = opening.current;
+    if (!view.locked || !front || !settled || asked.current === opening.current) return;
     void unlock();
-  }, [view.locked, front, unlock]);
+  }, [view.locked, front, settled, busy, unlock]);

   const change = useCallback(async (on: boolean) => {
     if (asking.current || on === enabled.current) return;
@@ -263,22 +300,38 @@ export function LockGate({ port, children }: { port: LocalAuthPort; children: Re
     if (on && known.current?.canLock !== true) return;
     asking.current = true;
     setBusy(true);
-    const result = await prompt(t('lock.switch', { method: t(METHOD_KEYS[namedMethod(known.current)].name) }));
-    // An unavailable answer reads the phone again; a lock that is on, on a phone that can no longer lock, turns itself off.
-    const gone = result === 'unavailable' && afterRecheck(await readPhone()).step === 'turnOff' && enabled.current;
-    asking.current = false;
-    setBusy(false);
-    if (gone) {
-      turnOff();
-      return;
+    setNotice(null);
+    try {
+      const result = await prompt(t('lock.switch', { method: t(METHOD_KEYS[namedMethod(known.current)].name) }));
+      // An unavailable answer reads the phone again; a lock that is on, on a phone that can no longer lock, turns itself off.
+      const gone = result === 'unavailable' && afterRecheck(await readPhone()).step === 'turnOff' && enabled.current;
+      if (gone) {
+        turnOff();
+        return;
+      }
+      if (result !== 'success') return;
+      const store = walletDeviceStore();
+      if (on) {
+        // Fail closed: the lock is on only once it is stored, so the next launch locks too.
+        const stored = await store.set(LOCK_NAME, '1').then(() => true, () => false);
+        if (!stored) {
+          setNotice('lock.notStored');
+          announceOverLockCover(t('lock.notStored'));
+          return;
+        }
+      } else {
+        // A lock that cannot be removed locks again at the next launch, which fails closed.
+        void store.remove(LOCK_NAME).catch(() => undefined);
+      }
+      // The person's own choice from here on.
+      assumed.current = false;
+      enabled.current = on;
+      setSetting({ ready: true, enabled: on });
+      void store.set(LOCK_ANSWERED_NAME, '1').catch(() => undefined);
+    } finally {
+      asking.current = false;
+      setBusy(false);
     }
-    if (result !== 'success') return;
-    enabled.current = on;
-    setSetting({ ready: true, enabled: on });
-    const store = walletDeviceStore();
-    // A choice that cannot be stored still holds until the app closes.
-    void (on ? store.set(LOCK_NAME, '1') : store.remove(LOCK_NAME)).catch(() => undefined);
-    void store.set(LOCK_ANSWERED_NAME, '1').catch(() => undefined);
   }, [prompt, readPhone, turnOff, t]);

   const answer = useCallback(() => {
@@ -295,6 +348,16 @@ export function LockGate({ port, children }: { port: LocalAuthPort; children: Re
   );

   const hidden = !setting.ready || view.locked || view.covered;
+  // While the cover is up the app below says nothing on iOS. A layout effect, so it is quiet before any part below
+  // runs its own effects: a line that changes as the cover goes up is not said either.
+  useLayoutEffect(() => {
+    setQuietUnderLockCover(hidden);
+    return () => setQuietUnderLockCover(false);
+  }, [hidden]);
+  // Becoming hidden puts the keyboard away, so no typing reaches the screen under the cover.
+  useEffect(() => {
+    if (hidden) Keyboard.dismiss();
+  }, [hidden]);
   // Android only: the web has no back button, and react-native-web's BackHandler says so as an error.
   useEffect(() => {
     if (!hidden || Platform.OS !== 'android') return undefined;
@@ -314,7 +377,7 @@ export function LockGate({ port, children }: { port: LocalAuthPort; children: Re
       <LockSettingContext.Provider value={lock}>
         <View style={{ flex: 1 }} {...(hidden ? UNSEEN : SEEN)}>{children}</View>
         {hidden ? <LockCoverArt /> : null}
-        {turnedOff ? <TurnedOffNotice text={t('lock.turnedOff')} close={t('common.close')} onClose={() => setTurnedOff(false)} /> : null}
+        {notice === null ? null : <Notice testID={NOTICE_IDS[notice]} text={t(notice)} close={t('common.close')} onClose={() => setNotice(null)} />}
       </LockSettingContext.Provider>
     </LockCoverContext.Provider>
   );
```

`apps/app/src/wallet/lock/lockModel.ts`:

```diff
diff --git a/apps/app/src/wallet/lock/lockModel.ts b/apps/app/src/wallet/lock/lockModel.ts
index 32cb08e8b3603c943aac01a145fa20a516da1ad2..dda9b6d51a5527fb3e453d30288d38c2d8b67a58 100644
--- a/apps/app/src/wallet/lock/lockModel.ts
+++ b/apps/app/src/wallet/lock/lockModel.ts
@@ -1,8 +1,10 @@
 // The Face ID lock's rules (P2-T33, W18, R67): how the phone proves its owner,
 // what its system prompt answered, the lock's view as the app comes and goes,
-// and what the locked app does with each answer. LockGate runs them; the setup
-// screen and the Settings row read them. Pure: a Node test reads it, so it
-// imports nothing.
+// and what the locked app does with each answer. An answer or a reading
+// outside the port's types counts as a failed scan or a phone that could not
+// be read, so a slip in the port never opens the app. LockGate runs them; the
+// setup screen and the Settings row read them. Pure: a Node test reads it, so
+// it imports nothing.

 /** How the phone proves its owner. P2-T34 reads it from the phone's enrolment. */
 export type LockMethod = 'face' | 'fingerprint' | 'passcode';
@@ -13,6 +15,27 @@ export type AuthResult = 'success' | 'cancelled' | 'failed' | 'lockout' | 'unava
 /** What the phone can do: whether it can lock at all (a passcode or biometrics), and how. */
 export type LockAvailability = { canLock: boolean; method: LockMethod | null };

+const AUTH_RESULTS: readonly AuthResult[] = ['success', 'cancelled', 'failed', 'lockout', 'unavailable'];
+const LOCK_METHODS: readonly LockMethod[] = ['face', 'fingerprint', 'passcode'];
+
+/** The port's answer as one the gate knows: anything else (an adapter's slip) counts as failed, so it never unlocks. */
+export function authResultOf(answer: unknown): AuthResult {
+  return AUTH_RESULTS.find((result) => result === answer) ?? 'failed';
+}
+
+/**
+ * The port's reading as one the gate knows, or null, as for a read that
+ * failed, when it is outside the port's types: a phone that could not be read
+ * counts as still able to lock, and as not yet able to turn the lock on.
+ */
+export function availabilityOf(reading: unknown): LockAvailability | null {
+  if (typeof reading !== 'object' || reading === null) return null;
+  const { canLock, method } = reading as { canLock?: unknown; method?: unknown };
+  if (typeof canLock !== 'boolean') return null;
+  if (method !== null && !LOCK_METHODS.some((known) => known === method)) return null;
+  return { canLock, method: method as LockMethod | null };
+}
+
 /**
  * `locked`: the locked screen is up until the phone recognises its owner.
  * `covered`: the app is not in front, so nothing of it shows (W18).
@@ -88,10 +111,11 @@ export function afterAnswer(result: AuthResult): AfterAnswer {
  * After an unavailable answer, the phone read again (R67): still able to lock,
  * the app stays locked and says to try again; no longer able, the lock turns
  * itself off. A phone that could not be read counts as still able, so a read
- * that fails never opens the app.
+ * that fails never opens the app, and so does a reading that does not say
+ * `canLock: false` in so many words.
  */
 export function afterRecheck(phone: LockAvailability | null): { readonly step: 'stay'; readonly note: 'lock.tryAgain' } | { readonly step: 'turnOff' } {
-  return phone !== null && !phone.canLock ? { step: 'turnOff' } : { step: 'stay', note: 'lock.tryAgain' };
+  return phone !== null && phone.canLock === false ? { step: 'turnOff' } : { step: 'stay', note: 'lock.tryAgain' };
 }

 /** The method a screen names: the phone's, or the passcode while the phone has not said (every phone that can lock has one). */
```

`apps/app/src/wallet/lock/copy.ts`:

```diff
diff --git a/apps/app/src/wallet/lock/copy.ts b/apps/app/src/wallet/lock/copy.ts
index 077cbd8389ac1477176acca3e0025fa5d0ffcc43..7d40069fcb2f5eaafb49f119c11e22d3f4fed7c6 100644
--- a/apps/app/src/wallet/lock/copy.ts
+++ b/apps/app/src/wallet/lock/copy.ts
@@ -4,11 +4,11 @@ import type { DraftTable } from '../copy/draftText.ts';
  * The Face ID lock's lines: sa-lock-setup's and sa-locked's words, the
  * method's names, the Settings row, and the lines no board shows (the
  * fingerprint and passcode forms, what the locked screen says after a scan
- * that did not pass, the lock turning itself off, a phone with no passcode,
- * and the preview card's name). `{method}` takes a method's name. Data only:
- * read through `useDraftCopy` with COMMON_COPY. Default pending owner Q3:
- * built as written; the English lines, and every Thai line no board shows,
- * are drafts for E2-D.
+ * that did not pass, the lock turning itself off, a lock that could not be
+ * kept on, a phone with no passcode, and the preview card's name). `{method}`
+ * takes a method's name. Data only: read through `useDraftCopy` with
+ * COMMON_COPY. Default pending owner Q3: built as written; the English lines,
+ * and every Thai line no board shows, are drafts for E2-D.
  */
 export const COPY = {
   'lock.step': { th: 'ตั้งค่า · ขั้นที่ 5 จาก 5', en: 'Setup · Step 5 of 5' },
@@ -40,6 +40,7 @@ export const COPY = {
   'lock.tryAgain': { th: 'ลองอีกครั้ง หรือใช้รหัสผ่าน', en: 'Try again, or use your passcode.' },
   'lock.lockout': { th: 'สแกนไม่ผ่านหลายครั้ง ใช้รหัสผ่านของเครื่องแทน', en: "Too many scans didn't pass. Use your phone's passcode instead." },
   'lock.turnedOff': { th: 'ปิดการล็อกแล้ว เพราะเครื่องนี้ไม่มีรหัสผ่านหรือ Face ID แล้ว', en: 'The lock is off, because this phone no longer has a passcode or Face ID.' },
+  'lock.notStored': { th: 'เปิดการล็อกไม่สำเร็จ ลองอีกครั้ง', en: "The lock couldn't be turned on. Try again." },
   'lock.needsPasscode': { th: 'ตั้งรหัสผ่านหรือ Face ID ในการตั้งค่าเครื่องก่อน จึงจะล็อก Jotbun ได้', en: "Set a passcode or Face ID in your phone's settings first, then you can lock Jotbun." },
   'lock.row': { th: 'ล็อกด้วย {method}', en: 'Lock with {method}' },
   'lock.on': { th: 'เปิด', en: 'On' },
```

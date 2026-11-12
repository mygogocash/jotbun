# Brief P2-T21 fix round: step 2's back once a create's answer is unknown, leaving the edit screen once, the card's own place, the refused archive's ฿0, and the reviews' pins

You are the fixer for the P2-T21 fix round. PR #429 (branch `p2/t21-wallet-edit`, head `2411001e`) adds the new-wallet flow, wallet editing and the correction tray. CI is green 9 of 9, and:
- the second review (`reviews/P2-T21-second.md`, Sonnet, money, the wallet and privacy) approved;
- the first review (`reviews/P2-T21.md`, Opus) says **Needs fixes**: one major (M1), three minors (m1 to m3) and two nits (n1, n2).

The controller ruled **R115** (quoted in P22 below). The planner wrote every file below and proved it in a scratch copy of `2411001e` (`git archive 2411001e`, its own `npm ci`):
- RED: the round's two render suites over `2411001e`'s code, with no stub. `typecheck:app` exits 0, and 5 of 31 cases fail, each on an `AssertionError`;
- GREEN;
- 134 mutants, all killed;
- R100's fast local gate, with the eight kit render files, `test:unit` and the four routes tests, each file named.

You copy the planner's files, check them by checksum, prove RED, GREEN and the mutants in the worktree, run the gate, check the two receipts and commit. The planner wrote both receipts; you copy them and do not edit them. Do exactly what this brief says.

Read first:
1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only, and no whole-suite total as an expected value anywhere. R87 applies: the round's receipt is its own new file, `docs/implementation/receipts/P2-T21-fix.md`, and `P2-T21.md` takes the planner's correction; do not edit `premium-progress.md`.
2. The reviews: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T21.md` and `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T21-second.md`.
3. The first round's brief, `/Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/P2-T21.md`. Its rulings P1 to P21 stand, except where this brief's P22 to P35 change them.

## Paths and rules

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21` (branch `p2/t21-wallet-edit`, head `2411001e`, installed). Work only here. Do not merge the integration branch into it: the controller merges up (P23).
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix`, your scratch folder. Create it with `mkdir -p /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix`. Your logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the round's six files at their repo paths: the two code files, the two render suites, `P2-T21.md` corrected and `P2-T21-fix.md` (new);
  - `orig/`: the five of them that `2411001e` has, as it has them;
  - `diffs/`: one diff per file (`orig/` to `real/`, or nothing to `real/` for the new receipt), with repo paths `a/<path>` and `b/<path>` and full blob ids, and `p2-t21-fix.patch`, the whole round. `PL/logs/applycheck.log` proves the patch turns `orig/` into `real/` byte for byte. The Appendix prints them;
  - `tools/`: `files.sh` and `focused.sh` (the file lists), `stage.sh` (the planner's stages: base, RED, GREEN), `run.sh` (the planner's runs), `mutants.py` (the runner), `diffs.sh`, `diffcheck.sh`, `sums.sh`, `fill_brief.py` and `brief.template.md` (how this brief was built: every diff below is the `diffs/` file, and the mutant lines are `logs/mutants.out`, byte for byte);
  - `SHA256SUMS` (the kit; check it from PL) and `SHA256SUMS.logs` (the planner's `logs/`);
  - three lists to check WT with `shasum -a 256 -c`, paths relative to WT:
    - `SHA256SUMS.orig-in-wt`: the five files as `2411001e` has them;
    - `SHA256SUMS.red-in-wt`: the four files as RED leaves them (the two suites from `real/`, the two code files as `2411001e` has them);
    - `SHA256SUMS.real-in-wt`: the round's six files in their final form.
  - There is no `stubs/`: RED needs no stub (P31). `work/` is the planner's proof tree; it is not in `SHA256SUMS`, and you never use it.
- Every shell call starts in a fresh directory, so every command below is written with full paths. Type each exactly. Git: `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 <command>`, one git command per call.
- Run one step at a time. Never run a test while the mutant runner (Step 4) is running: it changes the code files while it runs.
- No heavy lock is needed: no database suite and no workers pool. Docker is stopped and stays stopped.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests, code or receipts to make them pass. One exception, a load flake: a case that times out near 5 s under load in a file this round does not touch. Rerun that file alone once, and record both runs.
- Every count you report comes from your own log in S. Never copy the planner's logs in place of one.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/wallet/wallets/NewWalletFlow.tsx` | Step 2's back is held only while a create is out; with its answer unknown, a blocked resend's too, back calls `leave()` (P24). The ceremony's card enters inside a view of its own, `new-wallet-card-place` (P28). 406 lines before, 419 after. |
| `apps/app/src/wallet/wallets/WalletEditScreen.tsx` | The form leaves once, through `leave()` and a ref set by leaving or by unmounting (P25). The refused archive's line is `ArchiveRefused`: its ฿0 masked in private mode, and said in words (P29). 394 before, 421 after. |
| `apps/app/src/wallet/wallets/NewWallet.render.test.tsx` | 16 cases (12 before): four new (P24, P26, P28); the twelve unchanged. 538 before, 646 after. |
| `apps/app/src/wallet/wallets/WalletEdit.render.test.tsx` | 15 cases (9 before): six new and one changed (P25, P26, P29). 486 before, 650 after. |
| `docs/implementation/receipts/P2-T21.md` | The planner's correction: a line pointing to the fix round, the drop's and the overshoot's notes, the tracking start's E2-B note and Risks, and the P2-T37 note (P27, P28, P30). 78 before, 80 after. |
| `docs/implementation/receipts/P2-T21-fix.md` | **New**: the round's receipt (R87), written by the planner with the proven numbers (P30). 84 lines. |

Not in this round: `WalletFields.tsx` (Y2 and Y3 are pins of code that is already right); `CorrectionTray.tsx`, `copy.ts` (no copy line is added: the refused line is today's catalog line, and the words are `common.amountHidden` and `spokenMoney`); `useWalletMotion.ts` and its test (the builder is right; the card's parent was the problem, P28); the routes, `walletCommands.ts`, `WalletsListScreen.tsx`, `walletListSections.tsx` and their tests; `en.json`, `th.json`; any package or lockfile; `premium-progress.md`.

## Planner rulings (what this round decides, with the reason for each)

- **P22. R115, the controller's ruling of 12 November, quoted:**
  1. **M1:** step 2's back is held only while `saving`. While `unconfirmed`, and after a blocked resend, back leaves the flow (`leave()`, as step 1's back does) and keeps no look. The list reads again on return and shows the wallet if the create committed. Add the case for an unconfirmed create and for a blocked resend (the review's PR2), and kill Y1.
  2. **m1:** no second navigation after the person has left. Hold the edit header's back while `saving`, as the flow does, or skip `onBack()` and `onArchived()` once the screen has unmounted. Pin it with PR1.
  3. **m2:** add PR4 (money: a cleared keypad sends `opening_minor: '0'`, kills Y7), PR7 (Try again held by the ref, kills Y4) and PR8 (faces and materials held while locked, kills Y2 and Y3). Add one case each for Y6, Y8 and Y9. One mutant per new guard.
  4. **m3 (an owner call at E2-B):** keep เริ่มจด as text in this round, and state the consequence in the receipt's Risks: a wallet made here starts today, so earlier dates cannot be logged to it. Correct the E2-B note, which wrongly says today's screen keeps the chip; that screen is unreachable in the wallet area. The controller records it for the owner.
  5. **n1:** wrap the card's `Animated.View` in its own `View`, so it drops about one card's height. Fix the receipt's overshoot note to match.
  6. **n2:** mask the refused-archive line's ฿0 in private mode, as the line below it does.
- **P23. The base is `2411001e`, with no merge.** The fix commit goes on top of PR #429's reviewed head, and the controller merges the integration branch up afterwards. The planner proved every stage in `PL/work`, a `git archive 2411001e` with `.claude/` removed and its own `npm ci --ignore-scripts` (1416 packages, the lockfile equal to the worktree's). The kit holds no git repository: `find PL -name .git` prints nothing, and the apply check ran with `GIT_CEILING_DIRECTORIES` in a folder that was then removed.
- **P24. M1: step 2's back (R115.1).**
  - `disabled: sending.phase === 'saving'`, not `locked`: back is held only while a create is out, so pressing it cannot change the look under a command in flight (the first round's P8, kept for `saving`).
  - `const back = unconfirmed === null ? () => setStep(1) : leave;`. With the answer unknown (Try again offered, or a resend blocked by `session_changed` or `upgrade_required`), back leaves the flow exactly as step 1's back does: `router.back()`, or `router.replace(destination)` with nothing to go back to. It never goes to the kinds then, since a new kind would reset the look that a later Try again would keep (`setLook` after `done` reads the flow's look).
  - Nothing is kept: a look is kept only after `done`, so leaving keeps none. The list is read again on return because it mounts again (the first round's P4a), so it shows the wallet if the create committed.
  - A refusal (`problem`), blocked or not, keeps the first round's back to the kinds: its outcome is known, so nothing is pending.
  - The case (`NewWallet`, new): held while out (a press changes nothing, then the create lands and the ceremony shows); a lost answer (back is enabled, leaves once, no look kept); the review's PR2 (a blocked resend: no Try again, เพิ่มกระเป๋า held, back leaves to `/spend/wallets` with nothing to go back to). Mutants Y1 (never held), N33 (held while unknown, the reviewed rule), N34 (back to the kinds while unknown) and N35 (back to the kinds once blocked); N21 is re-pointed (back always leaves).
- **P25. m1: the edit screen leaves once (R115.2).**
  - R115 allows either way; this round takes the second, as one rule: `EditForm` has a ref `left` and `leave(go)`, which runs a navigation only while `left` is false, and sets it. The header's back (`() => leave(onBack)`), a save that lands (`leave(onBack)`), an archive that lands (`leave(onArchived)`) and an unchanged บันทึก (`leave(onBack)`) all go through it, and `useEffect(() => () => { left.current = true; }, [])` sets it when the screen unmounts, as `SessionEndedScreen` and `DevicesScreen` keep their own `mounted` refs.
  - Why not hold the header's back while saving: the system back (Android) or the layout's redirect can still take the screen away while a save is out, and its landing would then navigate again. Leaving once covers every way out, and keeps back enabled in every phase, as today's form does (`WalletsScreen.tsx:515`).
  - It also settles the second review's W4: two presses on an unchanged บันทึก before React draws again went back twice; now once.
  - A save that lands after the person left is not shown to them (the receipt's Risks).
  - The case (`WalletEdit`, new), four parts: back while a save is out goes back once and the save that lands goes nowhere; the review's PR1 exactly (back, then the `Slot`'s unmount, then the save lands: back once in all); the screen unmounted while its save was out (no navigation at all); an archive that lands after back (no `dismissTo`). The nothing-changed case now presses บันทึก twice in one `act` and expects one back, then checks the list fallback on a fresh mount. Mutants E32 to E38; E10, E11 and E12 are re-pointed.
- **P26. m2: the reviews' survivors pinned (R115.3).** Each is a case of its own, on the test files' own helpers and fixtures (the reviewer's probe, adapted where it says so):
  - PR4 (`WalletEdit`, the money path; Y7): delete on the stored ฿30,000 shows ฿0, says ยอดเริ่มต้น 0 บาท, the card ติดลบ 5,140 บาท, and the update is `{ opening_minor: '0', correction_reason: 'entry_error' }`.
  - PR7 (`WalletEdit`; Y4): two presses on Try again in one `act` resend once, and the save that lands goes back once.
  - PR8 (`NewWallet`; Y2 and Y3): with a create's answer unknown, all ten radios are `aria-disabled`, a press on a face and on a material changes nothing, and after Try again the kept look and `wallet_added` both say bank, silk, smile.
  - Y6 (`WalletEdit`): with an update's answer unknown, archive is `aria-disabled`, a press sends no archive, and Try again stays.
  - Y8 (`NewWallet`): with no account open, `crypto.randomUUID` is not asked again while keys are pressed and the name typed, the card's gradient stays the same, and the created wallet's derived look is the one the card drew. Counting the calls kills Y8 every run; a look alone would miss it when two random ids share a material.
  - Y9 (`WalletEdit`): after the conflict notice, the next save (its answer lost) clears it, and that save's own words show.
  - The code these pin is already right; at RED they pass. Y1 to Y9 are all in the runner, re-pointed where the code moved (Y1).
- **P27. m3: the tracking start (R115.4).** No code changes: เริ่มจด stays text. The consequence goes in both receipts' Risks (a wallet made here starts today, so earlier dates cannot be logged to it; the server refuses them with `DATE_BEFORE_TRACKING_START`). `P2-T21.md`'s E2-B note is corrected: the first round's brief (P9, P20) said today's Wallets screen keeps its date chip, but that screen cannot be reached while the `wallet` area is on. `followups.md` already carries it for the owner (the controller's line of 12 November).
- **P28. n1: the card's own place (R115.5).**
  - `<View testID="new-wallet-card-place">` wraps the card's `Animated.View`. Reanimated 4.7.1's `SlideInUp` animates `originY` to `values.targetOriginY` (`src/layoutReanimation/defaultAnimations/Slide.ts`), which is in the parent's coordinates, so `originY: -200` is 200 pt above the card's place only when the parent starts where the card does.
  - Before, the card sat below the close button in the scroll content and fell about `insets.top + 268` pt (about 327 pt with a 59 pt inset). Now it falls 200 pt. The bouncy spring (damping 14, stiffness 260, mass 1: a damping ratio of 14 / (2 × √260) ≈ 0.434) overshoots by e^(−πζ/√(1−ζ²)) ≈ 22% of the distance: about 44 pt, as the first receipt said, rather than the review's about 70.
  - The test id is not only for the test: on Fabric a plain layout-only `View` is flattened away, and its child is then mounted in the grandparent, at the grandparent's coordinates. In React Native 0.88's `ViewShadowNode.cpp` a view with a `testID` forms a view, so the place stays the card's parent on a phone. A `collapsable={false}` would do the same, but react-native-web drops it, so no case could hold it; the test id is held by the case.
  - `useWalletMotion.ts` does not change: the builder's `-200` was right, its caller's place was not.
  - The receipt's overshoot notes now name the place (`P2-T21.md`'s drop, SKIPPED and E2-B lines).
  - The case (`NewWallet`, new): the card's parent is `new-wallet-card-place`, which holds only the card. Mutants N36 (no place) and N37 (the place without its test id).
- **P29. n2: the refused archive's ฿0 (R115.6).** `ArchiveRefused` draws today's catalog line with `{zero}` as `HIDDEN_AMOUNT` (฿••••) in private mode, else `walletMoneyText('0')`, and gives the line its own words (`accessibilityLabel`): `common.amountHidden` in private mode, else `spokenMoney('0', t)`, as `ArchiveLater` speaks its amounts. Out of private mode the line still shows ฿0, and its words now say 0 บาท. The `tc(...)` literal stays inline in both calls, so a scan of `tc` literals finds it. The case (`WalletEdit`, new): Thai and English, private mode off and on, the line's text and words, and no digit on the archive's two lines in private mode (the review's PR5). Mutants E39 to E42.
- **P30. The receipts.** The planner wrote both, with the numbers this brief expects; you copy them in Step 3 and check them by checksum. `P2-T21.md` gains the fix round's line after Status, and the lines R115 makes untrue are corrected: the drop (P4e: the place, and the `insets.top + 268` pt it fell), the SKIPPED and E2-B overshoot notes (200 pt from its own place, about 44 pt), the E2-B tracking start note and a Risk (P27), and the P2-T37 note (the refused line masked). `P2-T21-fix.md` is the round's receipt in the house style (see `P2-T25-fix.md`). Every number in it is an Expected line below: if one of your runs differs, you stop BLOCKED before the commit, so the receipt you commit is true.
- **P31. RED needs no stub.** The new cases use nothing `2411001e`'s code does not export: the new test id and the new behaviour are runtime, not types. So RED is the round's two suites over `2411001e`'s code: `typecheck:app` exits 0 (proven, `PL/logs/red-typecheck.log`), and 5 of 31 cases fail, each on an `AssertionError` (Step 2). The 26 that pass are the first round's 20 unchanged cases and the six pins of P26.
- **P32. 134 mutants, all killed.** The first round's 109 (`tools/mutants.py` of `scratch/p2-t21-planner`), four re-pointed at the lines this round changes (N21, E10, E11, E12); the review's Y1 to Y9; and one mutant for each new guard: N33 to N37 (P24, P28) and E32 to E42 (P25, P29). Every kill is on an assertion except the first round's R5 and R9, as before (the screen's own `useSpendV1 needs a SpendV1Provider.`). None survives and none is marked equivalent. The run takes about 15 minutes.
- **P33. The gate (R100, and R115's "as before, plus").** As the first round's (`typecheck:app`, `typecheck:routes`, `test:app`, `test:unit`, the draft check, the focused render files, `export:web`, `git diff --check`), with each render file named, in four runs: the round's two suites; the eight kit render files that import the wallet catalogue index (CardStack, WalletLooks, PrivateMode, walletHarness, Tray, Lock, AmountStep, WalletsList); the four routes tests (SpendRoutes, AccountRoutes, InsightsRoutes, PlanningRoutes); and the first round's other render files and neighbours (walletCommands, useWalletMotion, WalletsScreen, WalletCard). GREEN (Step 3) also runs the catalogue's wallet sections and the registry rule. No route changes, so `typecheck:routes` and `export:web` are run because the first round's gate ran them, and they are quick. CI runs the full render suite, the iOS export, the database, edge and image jobs and `test:ops`.
- **P34. Not carried, and why.** R115 rules on the first review's items only. The second review's n1 (a reason chosen once is reused after a refusal), n2 (a tracking start after the phone's date blocks every save) and n4 (choosing a kind again resets the look) stay as it recorded them; the receipt names them. The E2-B items (the tracking start, a credit card's opening balance, "Match my real balance", archiving with no confirmation, the drop on a simulator) are the owner's and the controller's.
- **P35. Commit.** One commit on `2411001e`: `Hold step 2's back only while saving, and leave the wallet editor once`, with the body in Step 7 and the trailer `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

---

## Step 1: Check the base

1. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 status --short`. Expected: no output.
2. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 rev-parse --short HEAD`. Expected: `2411001e`. Then `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 branch --show-current`. Expected: `p2/t21-wallet-edit`.
3. `mkdir -p /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix`
4. The kit, checked from PL: `cd /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix-planner && shasum -a 256 -c SHA256SUMS | grep -vc ': OK$'`. Expected: `0`. Then `cd /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix-planner && shasum -a 256 -c SHA256SUMS | grep -c ': OK$'`. Expected: `28`.
5. The base files: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix-planner/SHA256SUMS.orig-in-wt`. Expected: five `OK` lines, exit 0. Then `ls /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/docs/implementation/receipts/P2-T21-fix.md`. Expected: "No such file or directory".
6. `ls /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/node_modules/.package-lock.json`. Expected: the path is printed. Only if it is missing: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 && npm ci --ignore-scripts --no-audit --no-fund > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/npm-ci.log 2>&1; echo $?`. Expected: 0.
7. The focused base:
   - `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 && npm run typecheck:app > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/base-typecheck.log 2>&1; echo $?`. Expected: 0.
   - `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/apps/app && npm run test:unit -- src/wallet/copy/draftText.test.ts > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/base-draft.log 2>&1; echo $?`. Expected: 0, `ℹ tests 4`, `ℹ pass 4`.
   - `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/wallets/NewWallet.render.test.tsx src/wallet/wallets/WalletEdit.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/base-round.log 2>&1; echo $?`. Expected: 0, `Test Files  2 passed (2)`, `Tests  21 passed (21)`.

   Compare with `PL/logs/base-typecheck.log`, `base-draft.log` and `base-round.log`.

## Step 2: RED (the round's two suites over `2411001e`'s code)

1. Copy the two suites:
   ```bash
   cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix-planner/real/apps/app/src/wallet/wallets/NewWallet.render.test.tsx /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/apps/app/src/wallet/wallets/NewWallet.render.test.tsx
   cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix-planner/real/apps/app/src/wallet/wallets/WalletEdit.render.test.tsx /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/apps/app/src/wallet/wallets/WalletEdit.render.test.tsx
   ```
   Then `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix-planner/SHA256SUMS.red-in-wt`. Expected: four `OK` lines, exit 0.
2. The RED typecheck: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 && npm run typecheck:app > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/red-typecheck.log 2>&1; echo $?`. Expected: 0.
3. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/wallets/NewWallet.render.test.tsx src/wallet/wallets/WalletEdit.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/red-render.log 2>&1; echo $?`. Expected:
   - exit 1, `Test Files  2 failed (2)`, `Tests  5 failed | 26 passed (31)`;
   - `grep -c '^AssertionError' /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/red-render.log` gives 5;
   - `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function|TestingLibraryElementError|TypeError|ReferenceError' /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/red-render.log` gives 0.

   The 5 failing cases, each on an `AssertionError`:
   - `NewWallet.render.test.tsx`, `step 2's back is held only while the create is out; once its answer is unknown, or its resend is blocked, back leaves the flow and keeps no look`: `expected 'true' to be null`
   - `NewWallet.render.test.tsx`, `the new card drops in a place of its own, so it falls about one card's height to where it rests`: `new-wallet-card-place: expected null not to be null`
   - `WalletEdit.render.test.tsx`, `nothing changed goes back once with nothing sent, and two presses on บันทึก send one update`: `expected [ [], 2 ] to deeply equal [ [], 1 ]`
   - `WalletEdit.render.test.tsx`, `once the person has left, a save or an archive that lands takes them nowhere more`: `expected [ [ [ …(3) ] ], 2 ] to deeply equal [ [ [ …(3) ] ], 1 ]`
   - `WalletEdit.render.test.tsx`, `an archive refused because the balance moved says its ฿0 in words, and in private mode masks it as the line below does`: `th: expected [ …(2) ] to deeply equal [ …(2) ]`

   Compare with `PL/logs/red-typecheck.log`, `PL/logs/red-render.log` and `PL/logs/red-render.list`.

## Step 3: GREEN

1. Copy the code and the receipts:
   ```bash
   cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix-planner/real/apps/app/src/wallet/wallets/NewWalletFlow.tsx /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/apps/app/src/wallet/wallets/NewWalletFlow.tsx
   cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix-planner/real/apps/app/src/wallet/wallets/WalletEditScreen.tsx /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/apps/app/src/wallet/wallets/WalletEditScreen.tsx
   cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix-planner/real/docs/implementation/receipts/P2-T21.md /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/docs/implementation/receipts/P2-T21.md
   cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix-planner/real/docs/implementation/receipts/P2-T21-fix.md /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/docs/implementation/receipts/P2-T21-fix.md
   ```
   Then `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix-planner/SHA256SUMS.real-in-wt`. Expected: six `OK` lines, exit 0.
2. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 status --short`. Expected: these six lines, in any order, and nothing else:
   ```
    M apps/app/src/wallet/wallets/NewWallet.render.test.tsx
    M apps/app/src/wallet/wallets/NewWalletFlow.tsx
    M apps/app/src/wallet/wallets/WalletEdit.render.test.tsx
    M apps/app/src/wallet/wallets/WalletEditScreen.tsx
    M docs/implementation/receipts/P2-T21.md
   ?? docs/implementation/receipts/P2-T21-fix.md
   ```
3. The code, for reference: the Appendix prints every diff. Read them before Step 7.
4. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 && npm run typecheck:app > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/green-typecheck.log 2>&1; echo $?`. Expected: 0. Then `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 && npm run typecheck:routes -w gogospend-app > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/green-typecheck-routes.log 2>&1; echo $?`. Expected: 0.
5. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/apps/app && npm run test:unit -- src/wallet/copy/draftText.test.ts > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/green-draft.log 2>&1; echo $?`. Expected: 0, `ℹ tests 4`, `ℹ pass 4`, `ℹ fail 0`.
6. The round's two suites: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/wallets/NewWallet.render.test.tsx src/wallet/wallets/WalletEdit.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/green-render.log 2>&1; echo $?`. Expected: 0, `Test Files  2 passed (2)`, `Tests  31 passed (31)` (16 + 15), and `grep -c '^stderr |' /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/green-render.log` gives 0.
7. The eight kit render files, each named: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/card/CardStack.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/green-kit8.log 2>&1; echo $?`. Expected: 0, `Test Files  8 passed (8)`, `Tests  141 passed (141)`.
8. The four routes tests, each named: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/green-routes4.log 2>&1; echo $?`. Expected: 0, `Test Files  4 passed (4)`, `Tests  13 passed (13)`.
9. The first round's other render files and neighbours, each named: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/planning/walletCommands.render.test.tsx src/wallet/motion/useWalletMotion.render.test.tsx src/screens/redesign/planning/WalletsScreen.render.test.tsx src/wallet/card/WalletCard.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/green-rest.log 2>&1; echo $?`. Expected: 0, `Test Files  4 passed (4)`, `Tests  112 passed (112)`.
10. The catalogue's wallet sections, in both suites: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-" > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/green-catalogue.log 2>&1; echo $?`. Expected: 0, `Test Files  2 passed (2)`, `Tests  62 passed | 572 skipped (634)`. Then the registry rule: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx -t "registry has a section" > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/green-registry.log 2>&1; echo $?`. Expected: 0, `Tests  1 passed | 326 skipped (327)`.

   Compare with `PL/logs/green-*.log`.

## Step 4: Mutation check

Run the 134 mutants (nothing else may run meanwhile):
```bash
python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/mutant-logs > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/mutants.out 2>&1; echo $?
```
Expected: 0, after about 15 minutes. `tail -1 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/mutants.out` prints:
```
134 killed, 0 survived, 0 not as expected
```
Every line ends with `restored sha256 equal`. The planner's lines follow (from `PL/logs/mutants.out`, shortened to the mutant and the first case it fails), for comparison:
```
N1 KILLED: the look kept before the acknowledgement (the plan's mutant) -> a look is not kept when the create is refused
N2 KILLED: the look never kept -> a new wallet: kind, name, face, material and opening balance, then the ceremony
N3 KILLED: two presses send two creates -> two presses on เพิ่มกระเป๋า send one create and one wallet_added; a lost answer offers Try again under the same key
N4 KILLED: presses held by React state, not a ref -> two presses on เพิ่มกระเป๋า send one create and one wallet_added; a lost answer offers Try again under the same key
N5 KILLED: a press held for good once answered -> two presses on เพิ่มกระเป๋า send one create and one wallet_added; a lost answer offers Try again under the same key
N6 KILLED: Try again sends another command -> two presses on เพิ่มกระเป๋า send one create and one wallet_added; a lost answer offers Try again under the same key
N7 KILLED: Try again offered while blocked -> two presses on เพิ่มกระเป๋า send one create and one wallet_added; a lost answer offers Try again under the same key
N8 KILLED: an unconfirmed create not held -> two presses on เพิ่มกระเป๋า send one create and one wallet_added; a lost answer offers Try again under the same key
N9 KILLED: a create waiting on an update not held -> a look is not kept when the create is refused
N10 KILLED: a refusal's fields not on its fields -> a look is not kept when the create is refused
N11 KILLED: a refusal naming fields worded as the hook words it -> a look is not kept when the create is refused
N12 KILLED: a kind does not start on its tile's material -> the flow offers four kinds, never e-wallet
N13 KILLED: a kind does not start with Bun smiling -> a new wallet: kind, name, face, material and opening balance, then the ceremony
N14 KILLED: the kinds out of the board's order -> the flow offers four kinds, never e-wallet
N15 KILLED: the travel card without BTS / MRT -> the flow offers four kinds, never e-wallet
N16 KILLED: with no account open, the chosen look shown though it cannot be kept -> one wallet id per flow, however often the flow draws: the card it shows is the wallet it creates
N17 KILLED: wallet_added without the kind -> a new wallet: kind, name, face, material and opening balance, then the ceremony
N18 KILLED: the ceremony always goes home -> opened with ?setup=1 the ceremony returns to /spend/setup
N19 KILLED: the ceremony pushes its destination over the flow -> a new wallet: kind, name, face, material and opening balance, then the ceremony
N20 KILLED: back on the kinds always replaces -> opened with ?setup=1 the ceremony returns to /spend/setup
N21 KILLED: back on the fields leaves the flow -> the flow offers four kinds, never e-wallet
N22 KILLED: walletAdded not played -> a new wallet: kind, name, face, material and opening balance, then the ceremony
N23 KILLED: the card does not drop in -> a new wallet: kind, name, face, material and opening balance, then the ceremony
N24 KILLED: the drop ignores Reduce Motion -> under Reduce Motion the card fades in, and walletAdded still plays once
N25 KILLED: the ceremony is not announced -> a new wallet: kind, name, face, material and opening balance, then the ceremony
N26 KILLED: the new card says only its name -> a new wallet: kind, name, face, material and opening balance, then the ceremony
N27 KILLED: the new card says its amount in private mode -> private mode hides the preview card's amount and the ceremony's, while what the person types shows
N28 KILLED: the typed opening balance not sent -> a new wallet: kind, name, face, material and opening balance, then the ceremony
N29 KILLED: tracking not from today -> a new wallet: kind, name, face, material and opening balance, then the ceremony
N30 KILLED: typing the name keeps its problem -> a look is not kept when the create is refused
N31 KILLED: a key keeps the opening balance's problem -> a look is not kept when the create is refused
N32 KILLED: every step says step 1 -> a new wallet: kind, name, face, material and opening balance, then the ceremony
F1 KILLED: the look offered with no account open -> with no account open the look is not offered, and the wallet shows the look it will have
F2 KILLED: a face press changes nothing -> a new wallet: kind, name, face, material and opening balance, then the ceremony
F3 KILLED: a material press changes nothing -> a new wallet: kind, name, face, material and opening balance, then the ceremony
F4 KILLED: the chosen face not the one checked -> a new wallet: kind, name, face, material and opening balance, then the ceremony
F5 KILLED: the chosen material not the one checked -> a new wallet: kind, name, face, material and opening balance, then the ceremony
F6 KILLED: the chosen material not ringed -> a new wallet: kind, name, face, material and opening balance, then the ceremony
F7 KILLED: every face ringed -> a new wallet: kind, name, face, material and opening balance, then the ceremony
F8 KILLED: faces at 44 pt, not 48 -> every face, material and key is at least 44 pt, and each is named
F9 KILLED: materials at 44 × 44, not 56 × 44 -> every face, material and key is at least 44 pt, and each is named
F10 KILLED: the name editable while held -> two presses on เพิ่มกระเป๋า send one create and one wallet_added; a lost answer offers Try again under the same key
F11 KILLED: the keys pressable while held -> a save whose answer is lost offers Try again under the same key; a wallet changed on another device says so and starts over; an archive refused because the balance moved says so
F12 KILLED: the preview says its amount in private mode -> private mode hides the preview card's amount and the ceremony's, while what the person types shows
F13 KILLED: the preview not one image -> a new wallet: kind, name, face, material and opening balance, then the ceremony
F14 KILLED: what the person types masked in private mode -> private mode hides the preview card's amount and the ceremony's, while what the person types shows
F15 KILLED: the stored opening balance shown in private mode -> private mode hides every amount on the edit screen, and the opening balance until a key is pressed
F16 KILLED: the keypad's refusal not said -> a name or an opening balance the create cannot take says so on its field, and sends nothing
F17 KILLED: the masked opening balance says its amount -> private mode hides every amount on the edit screen, and the opening balance until a key is pressed
F18 KILLED: tracking always says today -> editing shows the wallet's card, its fields, its look and why archive waits, in both modes and languages
F19 KILLED: the name's problem not shown -> a look is not kept when the create is refused
F20 KILLED: a missing name's gap kept in the preview's words -> a new wallet: kind, name, face, material and opening balance, then the ceremony
E1 KILLED: archive offered at a non-zero balance (the plan's mutant) -> editing shows the wallet's card, its fields, its look and why archive waits, in both modes and languages
E2 KILLED: a correction sent without asking why -> editing a wallet with records asks why before a correction is sent
E3 KILLED: a rename asks why too -> editing a wallet with records asks why before a correction is sent
E4 KILLED: entries not yet known counted as none -> editing a wallet with records asks why before a correction is sent
E5 KILLED: the reason chosen not sent with the correction -> editing a wallet with records asks why before a correction is sent
E6 KILLED: closing the tray sends the correction -> editing a wallet with records asks why before a correction is sent
E7 KILLED: Jotbun's own question for the reason ignored -> editing a wallet with records asks why before a correction is sent
E8 KILLED: two presses on บันทึก send two updates -> nothing changed goes back once with nothing sent, and two presses on บันทึก send one update
E9 KILLED: บันทึก held by React state, not a ref -> nothing changed goes back once with nothing sent, and two presses on บันทึก send one update
E10 KILLED: nothing changed is still sent -> nothing changed goes back once with nothing sent, and two presses on บันทึก send one update
E11 KILLED: a saved edit stays -> editing a wallet with records asks why before a correction is sent
E12 KILLED: an archived wallet goes back, not to the list -> archive is offered only at ฿0; otherwise the screen says why
E13 KILLED: a conflict not read again -> a save whose answer is lost offers Try again under the same key; a wallet changed on another device says so and starts over; an archive refused because the balance moved says so
E14 KILLED: a conflict not said -> a save whose answer is lost offers Try again under the same key; a wallet changed on another device says so and starts over; an archive refused because the balance moved says so
E15 KILLED: the form keeps what was typed over a newer version -> a save whose answer is lost offers Try again under the same key; a wallet changed on another device says so and starts over; an archive refused because the balance moved says so
E16 KILLED: a refused archive not read again -> a save whose answer is lost offers Try again under the same key; a wallet changed on another device says so and starts over; an archive refused because the balance moved says so
E17 KILLED: a refused archive not said -> a save whose answer is lost offers Try again under the same key; a wallet changed on another device says so and starts over; an archive refused because the balance moved says so
E18 KILLED: an unconfirmed save not held -> a save whose answer is lost offers Try again under the same key; a wallet changed on another device says so and starts over; an archive refused because the balance moved says so
E19 KILLED: Try again sends another command -> a save whose answer is lost offers Try again under the same key; a wallet changed on another device says so and starts over; an archive refused because the balance moved says so
E20 KILLED: Try again offered while blocked -> a save whose answer is lost offers Try again under the same key; a wallet changed on another device says so and starts over; an archive refused because the balance moved says so
E21 KILLED: a refusal naming a field worded as the hook words it -> a save whose answer is lost offers Try again under the same key; a wallet changed on another device says so and starts over; an archive refused because the balance moved says so
E22 KILLED: a save waiting on an update not held -> a save whose answer is lost offers Try again under the same key; a wallet changed on another device says so and starts over; an archive refused because the balance moved says so
E23 KILLED: the entries note shown with none -> editing a wallet with records asks why before a correction is sent
E24 KILLED: below zero said as money held -> archive is offered only at ฿0; otherwise the screen says why
E25 KILLED: below zero said with its minus -> archive is offered only at ฿0; otherwise the screen says why
E26 KILLED: the archive line says its amount in private mode -> private mode hides every amount on the edit screen, and the opening balance until a key is pressed
E27 KILLED: an archived wallet edited -> an archived or unknown wallet says it is gone; a load problem says so, and Try again reads again
E28 KILLED: a load problem's Try again reads nothing -> an archived or unknown wallet says it is gone; a load problem says so, and Try again reads again
E29 KILLED: a look change needs a command -> look changes are kept at once and need no command
E30 KILLED: the preview ignores what the wallet has spent -> editing shows the wallet's card, its fields, its look and why archive waits, in both modes and languages
E31 KILLED: the opening balance starts empty -> editing shows the wallet's card, its fields, its look and why archive waits, in both modes and languages
T1 KILLED: the reasons out of today's order -> editing a wallet with records asks why before a correction is sent
T2 KILLED: a reason sends another -> editing a wallet with records asks why before a correction is sent
T3 KILLED: the tray not named by its question -> editing a wallet with records asks why before a correction is sent
T4 KILLED: reasons under 44 pt -> every control on the edit screen is at least 44 pt, and the tray's reasons are named
K1 KILLED: the archive line's ฿0 written as text -> editing shows the wallet's card, its fields, its look and why archive waits, in both modes and languages
K2 KILLED: ready spaced in Thai -> a new wallet: kind, name, face, material and opening balance, then the ceremony
C1 KILLED: the new-wallet sections not listed -> the new wallet's and editing's sections come right after the wallets list's, and each opens in its state on the catalogue's own account
C2 KILLED: the added section stops before the create -> the new wallet's and editing's sections come right after the wallets list's, and each opens in its state on the catalogue's own account
C3 KILLED: the correction section opens no tray -> the new wallet's and editing's sections come right after the wallets list's, and each opens in its state on the catalogue's own account
C4 KILLED: the sections drawn without the kept looks -> the new wallet's and editing's sections come right after the wallets list's, and each opens in its state on the catalogue's own account
R1 KILLED: the new-wallet route with the wallet area off -> in the wallet area the new-wallet and edit routes show the Bun Wallet screens with the shared resources, ?setup=1 and the list return there, and otherwise they go to the wallets list
R2 KILLED: the new-wallet route in the legacy build -> in the wallet area the new-wallet and edit routes show the Bun Wallet screens with the shared resources, ?setup=1 and the list return there, and otherwise they go to the wallets list
R3 KILLED: ?setup=1 not passed on -> in the wallet area the new-wallet and edit routes show the Bun Wallet screens with the shared resources, ?setup=1 and the list return there, and otherwise they go to the wallets list
R4 KILLED: any returnTo passed on -> in the wallet area the new-wallet and edit routes show the Bun Wallet screens with the shared resources, ?setup=1 and the list return there, and otherwise they go to the wallets list
R5 KILLED: the flow without the shared resources -> in the wallet area the new-wallet and edit routes show the Bun Wallet screens with the shared resources, ?setup=1 and the list return there, and otherwise they go to the wallets list
R6 KILLED: the edit route with the wallet area off -> in the wallet area the new-wallet and edit routes show the Bun Wallet screens with the shared resources, ?setup=1 and the list return there, and otherwise they go to the wallets list
R7 KILLED: the edit route in the legacy build -> in the wallet area the new-wallet and edit routes show the Bun Wallet screens with the shared resources, ?setup=1 and the list return there, and otherwise they go to the wallets list
R8 KILLED: the edit route ignores its id -> in the wallet area the new-wallet and edit routes show the Bun Wallet screens with the shared resources, ?setup=1 and the list return there, and otherwise they go to the wallets list
R9 KILLED: the edit screen without the shared resources -> in the wallet area the new-wallet and edit routes show the Bun Wallet screens with the shared resources, ?setup=1 and the list return there, and otherwise they go to the wallets list
L1 KILLED: the add tile opens a flow that goes home -> a row opens its wallet, the add tile a new wallet that comes back here, and back goes back or home
H1 KILLED: wallet_added back inside the save -> an emitter that throws never turns a saved wallet into a refusal, and the send still answers
H2 KILLED: an emitter's throw let out of the send -> an emitter that throws never turns a saved wallet into a refusal, and the send still answers
H3 KILLED: wallet_added for any done command -> sending is true while a command is out; only a create sends wallet_added
H4 KILLED: wallet_added for a refused create -> a refused create sends nothing
M1 KILLED: the drop from the window's height -> a new wallet's card drops from about one card's height above, not a whole screen, or fades in where it rests
M2 KILLED: the fade starts above its place -> a new wallet's card drops from about one card's height above, not a whole screen, or fades in where it rests
Y1 KILLED: step 2's back never held, even while a create is out -> step 2's back is held only while the create is out; once its answer is unknown, or its resend is blocked, back leaves the flow and keeps no look
Y2 KILLED: the faces pressable while locked -> while a create's answer is unknown the faces and the materials are held, so the look kept is the one wallet_added reported
Y3 KILLED: the materials pressable while locked -> while a create's answer is unknown the faces and the materials are held, so the look kept is the one wallet_added reported
Y4 KILLED: the edit's Try again not held by the ref -> two presses on Try again resend once, and the save that lands goes back once
Y5 KILLED: the new wallet's Try again not held by the ref -> two presses on เพิ่มกระเป๋า send one create and one wallet_added; a lost answer offers Try again under the same key
Y6 KILLED: archive pressable while an update is unconfirmed -> while a save's answer is unknown archive is held, and a press on it sends nothing
Y7 KILLED: a cleared keypad on edit keeps the stored opening (the money path) -> delete on the stored opening balance clears it to ฿0, and ฿0 is what is sent, with its reason
Y8 KILLED: a new wallet id on every render, not one per flow -> one wallet id per flow, however often the flow draws: the card it shows is the wallet it creates
Y9 KILLED: the conflict notice not cleared when the next save starts -> the next save clears the notice that the wallet changed on another device, so it never sits beside that save's answer
N33 KILLED: step 2's back held while a create's answer is unknown (the reviewed rule) -> step 2's back is held only while the create is out; once its answer is unknown, or its resend is blocked, back leaves the flow and keeps no look
N34 KILLED: back with a create's answer unknown goes to the kinds, not out of the flow -> step 2's back is held only while the create is out; once its answer is unknown, or its resend is blocked, back leaves the flow and keeps no look
N35 KILLED: back leaves the flow only while a resend can be tried, not once it is blocked -> step 2's back is held only while the create is out; once its answer is unknown, or its resend is blocked, back leaves the flow and keeps no look
N36 KILLED: the card drops in the scroll view, not a place of its own -> the new card drops in a place of its own, so it falls about one card's height to where it rests
N37 KILLED: the place has no test id, so Fabric may flatten it away -> the new card drops in a place of its own, so it falls about one card's height to where it rests
E32 KILLED: a save that lands after the person left goes back again -> nothing changed goes back once with nothing sent, and two presses on บันทึก send one update
E33 KILLED: leaving does not mark the person gone -> nothing changed goes back once with nothing sent, and two presses on บันทึก send one update
E34 KILLED: a screen gone away still goes back when its save lands -> once the person has left, a save or an archive that lands takes them nowhere more
E35 KILLED: the header's back leaves without marking it -> once the person has left, a save or an archive that lands takes them nowhere more
E36 KILLED: an archive that lands after back still goes to the list -> once the person has left, a save or an archive that lands takes them nowhere more
E37 KILLED: a save that lands after back goes back again -> once the person has left, a save or an archive that lands takes them nowhere more
E38 KILLED: nothing changed goes back on every press -> nothing changed goes back once with nothing sent, and two presses on บันทึก send one update
E39 KILLED: the refused archive's ฿0 shown in private mode -> an archive refused because the balance moved says its ฿0 in words, and in private mode masks it as the line below does
E40 KILLED: the refused archive says its ฿0 in private mode -> an archive refused because the balance moved says its ฿0 in words, and in private mode masks it as the line below does
E41 KILLED: the refused archive's line has no words of its own -> an archive refused because the balance moved says its ฿0 in words, and in private mode masks it as the line below does
E42 KILLED: the refused archive says its ฿0 as a sign and a digit, not in words -> an archive refused because the balance moved says its ฿0 in words, and in private mode masks it as the line below does
```
Then `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix-planner/SHA256SUMS.real-in-wt` again: six `OK` lines. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 status --short`: unchanged from Step 3.2.

## Step 5: The fast local gate (R100, with R115's files)

In this order, each with its log in S:

1. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 && npm run typecheck:app > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/gate-1-typecheck.log 2>&1; echo $?`. Expected: 0.
2. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 && npm run typecheck:routes -w gogospend-app > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/gate-2-typecheck-routes.log 2>&1; echo $?`. Expected: 0.
3. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 && npm run test:app > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/gate-3-test-app.log 2>&1; echo $?`. Expected: 0, `ℹ fail 0`. (No count is expected: CI holds the whole suites, R100.)
4. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 && npm run test:unit > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/gate-4-test-unit.log 2>&1; echo $?`. Expected: 0, `ℹ fail 0`.
5. The draft check: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/apps/app && npm run test:unit -- src/wallet/copy/draftText.test.ts > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/gate-5-draft.log 2>&1; echo $?`. Expected: 0, `ℹ pass 4`, `ℹ fail 0`.
6. The round's two suites: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/wallets/NewWallet.render.test.tsx src/wallet/wallets/WalletEdit.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/gate-6-round.log 2>&1; echo $?`. Expected: 0, `Tests  31 passed (31)`.
7. The eight kit render files, each named: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/card/CardStack.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/gate-7-kit8.log 2>&1; echo $?`. Expected: 0, `Tests  141 passed (141)`.
8. The four routes tests, each named: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/gate-8-routes4.log 2>&1; echo $?`. Expected: 0, `Tests  13 passed (13)`.
9. The first round's other render files and neighbours, each named: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/planning/walletCommands.render.test.tsx src/wallet/motion/useWalletMotion.render.test.tsx src/screens/redesign/planning/WalletsScreen.render.test.tsx src/wallet/card/WalletCard.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/gate-9-rest.log 2>&1; echo $?`. Expected: 0, `Tests  112 passed (112)`.
10. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 && npm run export:web -w gogospend-app -- --max-workers 2 > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/gate-10-export-web.log 2>&1; echo $?`. Expected: 0, and `grep -c 'Web Bundled' /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/gate-10-export-web.log` gives 1 or more. (The module count moves with the head, so none is expected. `dist/` is git-ignored.)
11. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 diff --check`. Expected: no output, exit 0. (After the commit, Step 7.5 checks the range.)

A case that times out near 5 s in a file this round does not touch is a load flake: rerun that file alone once, record both runs, and do not change it.

Not run, and why (the receipt says so): the full render suite (CI, R100; its per-section jobs run the five `bw-wallet-*` sections); the iOS export (CI); `test:ops` (no package or lockfile change); the API, edge and database suites (nothing outside `apps/app` and the receipts changes; Docker is stopped); and the device checks, SKIPPED: the drop on a simulator (200 pt, about 44 pt of overshoot) and under Reduce Motion; step 2's back with a lost answer on a development build; the system back during an edit's save; VoiceOver on the refused archive's line in private mode.

## Step 6: The receipts

The planner wrote both, and you copied them in Step 3.1 (P30). Check that they are unchanged:
`cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 && shasum -a 256 docs/implementation/receipts/P2-T21.md docs/implementation/receipts/P2-T21-fix.md`. Expected: the same two sums as their lines in `PL/SHA256SUMS.real-in-wt`. Every number in `P2-T21-fix.md` is one of this brief's Expected lines, which your runs matched. Do not edit either file.

## Step 7: Commit

1. Stage the six files:
   `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 add apps/app/src/wallet/wallets/NewWalletFlow.tsx apps/app/src/wallet/wallets/WalletEditScreen.tsx apps/app/src/wallet/wallets/NewWallet.render.test.tsx apps/app/src/wallet/wallets/WalletEdit.render.test.tsx docs/implementation/receipts/P2-T21.md docs/implementation/receipts/P2-T21-fix.md`
2. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 status --short`. Expected: five `M ` lines and one `A ` line (the six files), and nothing else: no log, no `dist/`.
3. Write the message to `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/commit-message.txt`, exactly:
   ```
   Hold step 2's back only while saving, and leave the wallet editor once

   In the new-wallet flow, step 2's back is held only while a create is
   out. Once its answer is unknown, or a resend is blocked, back leaves
   the flow as step 1's does and keeps no look; the list reads again on
   return. The wallet editor navigates once: a save or an archive that
   lands after the person left, or after the screen went away, takes no
   one further, and two quick presses on an unchanged save go back once.
   The new card drops from a place of its own, one card's height, and the
   refused archive's zero is masked in private mode. Pin the reviews'
   probes and survivors, and correct P2-T21's receipt.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 commit -F /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/commit-message.txt`, then `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 log --oneline -2` (your commit on `2411001e`) and `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 show --stat HEAD` (6 files).
5. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 diff --check origin/claude/p1a-vault-core...HEAD`. Expected: no output, exit 0.

## Your final message

The orchestrator reads only this:
- First line: `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker and its output).
- The commit SHA and branch: `p2/t21-wallet-edit`, one commit on `2411001e`.
- Files: 6 (four code and test files, `P2-T21.md` corrected, `P2-T21-fix.md` new); checksums: all six equal `real/`.
- RED: `typecheck:app` 0; 5 of 31 failed, each on an `AssertionError`.
- GREEN: 31 of 31, draft 4 of 4, the eight kit files 141 of 141, the four routes tests 13 of 13, the rest 112 of 112, the catalogue 62, the registry rule 1.
- Mutants: 134 killed, 0 survived.
- The gate: each command and its result, with no whole-suite count (R100).
- SKIPPED: Step 5's list.
- Deviations: none from the brief's rulings (or each, with why).
- For the reviewer, first: step 2's back (P24), leaving once (P25: the ref, the unmount, why back stays enabled), the card's place and its test id on Fabric (P28), and the refused line's words (P29).

---

## Appendix: the diffs

Each block is the file in `PL/diffs/`, byte for byte. Copy the `real/` files as Steps 2 and 3 say; do not apply these.

`apps/app/src/wallet/wallets/NewWalletFlow.tsx`:
```diff
diff --git a/apps/app/src/wallet/wallets/NewWalletFlow.tsx b/apps/app/src/wallet/wallets/NewWalletFlow.tsx
index d54acfea6de4fdf58a87f8a3fffe9b3333a9c1f3..651127e32a67c4948ac17c087d05387592b4a145 100644
--- a/apps/app/src/wallet/wallets/NewWalletFlow.tsx
+++ b/apps/app/src/wallet/wallets/NewWalletFlow.tsx
@@ -18,6 +18,10 @@
 // - An unconfirmed create offers Try again, which sends the same command; a
 //   refusal says why, on its field when it names one; one that waits on an
 //   update holds เพิ่มกระเป๋า.
+// - Step 2's back is held only while a create is out. Once its answer is
+//   unknown, a blocked resend's too, back leaves the flow, as step 1's does,
+//   and keeps no look (R115): the list reads again on return, so it shows the
+//   wallet if the create committed.
 // - With no account open no look could be kept (W7): the face and material
 //   are not offered, and the preview and the ceremony draw the look the
 //   wallet will have, the one derived from its id.
@@ -206,8 +210,11 @@ export function NewWalletFlow({ returnTo, now }: { returnTo?: NewWalletReturn; n
       <PrimaryButton testID="new-wallet-add" label={t('wallets.add')} busy={sending.phase === 'saving'} busyLabel={tc('Saving…')} disabled={locked || stuck} onPress={add} />
     </View>
   );
+  // Back is held only while the create is out. With its answer unknown (Try again, or a blocked resend) it leaves the
+  // flow, as step 1's does: back on the kinds could change the look under the pending command (R115, M1).
+  const back = unconfirmed === null ? () => setStep(1) : leave;
   return (
-    <FlowPage back={{ label: t('common.back'), onPress: () => setStep(1), disabled: locked }} step={2} footer={footer}>
+    <FlowPage back={{ label: t('common.back'), onPress: back, disabled: sending.phase === 'saving' }} step={2} footer={footer}>
       <WalletText role="h1" accessibilityRole="header">{look.kind === null ? '' : t(KIND_WORDS[look.kind].name)}</WalletText>
       <WalletFields
         form={current}
@@ -371,11 +378,17 @@ function Added({ input, look, onDone }: { input: CreateWalletRequest; look: Wall
         <IconButton label={t('common.close')} onPress={onDone}>
           <Glyph name="close" size={16} color={colors.ink} />
         </IconButton>
-        <Animated.View testID="new-wallet-card" entering={entering}>
-          <View accessible accessibilityRole="image" accessibilityLabel={walletCardWords(card, look, hidden, t).spoken}>
-            <WalletCard wallet={card} look={look} variant="full" />
-          </View>
-        </Animated.View>
+        {/* The drop's originY is in its parent's coordinates (Reanimated animates it to targetOriginY), so the card
+            enters at the origin of a place of its own: it falls 200 pt, about one card's height, and the bouncy spring
+            overshoots by about 44 pt (R115, n1). A view with a test id is never flattened away on Fabric
+            (ViewShadowNode), so on a phone too the place stays the card's parent. */}
+        <View testID="new-wallet-card-place">
+          <Animated.View testID="new-wallet-card" entering={entering}>
+            <View accessible accessibilityRole="image" accessibilityLabel={walletCardWords(card, look, hidden, t).spoken}>
+              <WalletCard wallet={card} look={look} variant="full" />
+            </View>
+          </Animated.View>
+        </View>
         <View testID="new-wallet-added" {...POLITE_LIVE_REGION} style={{ gap: 2 }}>
           <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
             <WalletText role="h1" accessibilityRole="header">{t('wallets.added')}</WalletText>
```

`apps/app/src/wallet/wallets/WalletEditScreen.tsx`:
```diff
diff --git a/apps/app/src/wallet/wallets/WalletEditScreen.tsx b/apps/app/src/wallet/wallets/WalletEditScreen.tsx
index 0f803e9ba02d52c98d9430788bf35bafaaf82786..cc68f35d14d0f314722faa69039b0f812d7a648c 100644
--- a/apps/app/src/wallet/wallets/WalletEditScreen.tsx
+++ b/apps/app/src/wallet/wallets/WalletEditScreen.tsx
@@ -19,10 +19,13 @@
 //   person did not change is sent back. An archive refused because the
 //   balance moved says so, and the wallet is read again.
 // - An archived or unknown wallet says it is gone (wallet.gone).
+// - Once the person has left (back, a save or an archive that landed, or the
+//   screen gone, as the system back takes it), nothing navigates again, so a
+//   save that lands after that takes no one further (R115).
 import { TRACKING_START_MIN } from '@gogospend/contracts';
 import type { WalletCorrectionReason, WalletDto } from '@gogospend/contracts';
 import { useRouter } from 'expo-router';
-import { useRef, useState } from 'react';
+import { useEffect, useRef, useState } from 'react';
 import type { ReactNode } from 'react';
 import { Pressable, ScrollView, View } from 'react-native';
 import { useSafeAreaInsets } from 'react-native-safe-area-context';
@@ -48,7 +51,7 @@ import { useDraftCopy } from '../copy/useDraftCopy';
 import { IconButton } from '../controls/IconButton';
 import { useWalletLooks } from '../looks/WalletLooksProvider';
 import { WalletAmount } from '../money/WalletAmount';
-import { spokenMoney, walletMoneyText } from '../money/walletMoney';
+import { HIDDEN_AMOUNT, spokenMoney, walletMoneyText } from '../money/walletMoney';
 import { usePrivateMode } from '../privacy/PrivateModeProvider';
 import { TextLink } from '../tray/TextLink';
 import { WalletText } from '../WalletText';
@@ -144,6 +147,15 @@ function EditForm({ wallet, hasRecords, today, notice, onNotice, onBack, onArchi
   const [archiveRefused, setArchiveRefused] = useState(false);
   // One command at a time, held by a ref: two presses before React draws again send one.
   const held = useRef(false);
+  // The person leaves once: back, a save or an archive that lands, or this screen gone. A save that lands after that,
+  // or a second press before React draws again, navigates nothing more (R115, m1).
+  const left = useRef(false);
+  useEffect(() => () => { left.current = true; }, []);
+  const leave = (go: () => void) => {
+    if (left.current) return;
+    left.current = true;
+    go();
+  };

   const typed = evaluateKeypad(keypad, { allowZero: true });
   const current: WalletForm = { ...form, openingMinor: typed.ok ? typed.minor : '' };
@@ -167,8 +179,8 @@ function EditForm({ wallet, hasRecords, today, notice, onNotice, onBack, onArchi
       const outcome = await commands.send(command);
       if (outcome.kind === 'done') {
         setSending({ phase: 'idle' });
-        if (command.kind === 'archive') onArchived();
-        else onBack();
+        if (command.kind === 'archive') leave(onArchived);
+        else leave(onBack);
       } else if (outcome.kind === 'unconfirmed') {
         setSending({ phase: 'unconfirmed', command, message: outcome.message, blocked: outcome.blocked });
       } else if (outcome.kind === 'conflict') {
@@ -209,7 +221,7 @@ function EditForm({ wallet, hasRecords, today, notice, onNotice, onBack, onArchi
       return;
     }
     if (built.unchanged) {
-      onBack();
+      leave(onBack);
       return;
     }
     setErrors({});
@@ -240,7 +252,7 @@ function EditForm({ wallet, hasRecords, today, notice, onNotice, onBack, onArchi
       >
         <EditHeader
           title={t('wallets.editTitle')}
-          onBack={onBack}
+          onBack={() => leave(onBack)}
           action={<SaveButton label={t('common.save')} busy={sending.phase === 'saving'} busyLabel={tc('Saving…')} disabled={locked || stuck} onPress={() => save()} />}
         />
         {notice === null ? null : <WalletText testID="wallet-edit-notice" role="label" accessibilityRole="alert">{notice}</WalletText>}
@@ -323,16 +335,11 @@ function SaveButton({ label, busy, busyLabel, disabled, onPress }: { label: stri
 /** Archive at exactly ฿0 (the server's rule); otherwise why not, with both amounts. */
 function Archiving({ wallet, refused, disabled, onArchive }: { wallet: WalletDto; refused: boolean; disabled: boolean; onArchive(): void }) {
   const colors = useWalletColors();
-  const tc = useCopy();
   const t = useDraftCopy(LINES);
   const advice = archiveAdvice(wallet);
   return (
     <View style={{ gap: 4, paddingTop: 4 }}>
-      {refused ? (
-        <WalletText testID="wallet-archive-refused" role="label" accessibilityRole="alert">
-          {tc("{name} wasn't archived: its balance is no longer {zero}.", { name: wallet.name, zero: walletMoneyText('0') })}
-        </WalletText>
-      ) : null}
+      {refused ? <ArchiveRefused name={wallet.name} /> : null}
       {advice.kind === 'can_archive' ? (
         <Pressable
           testID="wallet-archive"
@@ -359,6 +366,26 @@ function Archiving({ wallet, refused, disabled, onArchive }: { wallet: WalletDto
   );
 }

+/**
+ * An archive refused because the balance moved, in today's words. Its ฿0 is masked in private mode and said in words,
+ * as ArchiveLater's amounts are (R115, n2).
+ */
+function ArchiveRefused({ name }: { name: string }) {
+  const tc = useCopy();
+  const t = useDraftCopy(LINES);
+  const { hidden } = usePrivateMode();
+  return (
+    <WalletText
+      testID="wallet-archive-refused"
+      role="label"
+      accessibilityRole="alert"
+      accessibilityLabel={tc("{name} wasn't archived: its balance is no longer {zero}.", { name, zero: hidden ? t('common.amountHidden') : spokenMoney('0', t) })}
+    >
+      {tc("{name} wasn't archived: its balance is no longer {zero}.", { name, zero: hidden ? HIDDEN_AMOUNT : walletMoneyText('0') })}
+    </WalletText>
+  );
+}
+
 /** เก็บได้เมื่อยอดเหลือ ฿0 ตอนนี้มี ฿24,860 ...: the sentence, with both amounts drawn as amounts, and its own spoken words. */
 function ArchiveLater({ balanceMinor, below }: { balanceMinor: string; below: boolean }) {
   const colors = useWalletColors();
```

`apps/app/src/wallet/wallets/NewWallet.render.test.tsx`:
```diff
diff --git a/apps/app/src/wallet/wallets/NewWallet.render.test.tsx b/apps/app/src/wallet/wallets/NewWallet.render.test.tsx
index 303923f77f9b0dc8b6d088c3545bcff21d4e47e2..aeda1a035b71b6cb6e792f15da1d5fb151dbcab5 100644
--- a/apps/app/src/wallet/wallets/NewWallet.render.test.tsx
+++ b/apps/app/src/wallet/wallets/NewWallet.render.test.tsx
@@ -10,6 +10,11 @@
 // props that reach the app's Text are recorded, as WalletCard.render.test.tsx
 // does. expo-router is the catalogue's recorded router, and the route's shared
 // resources are the case's own fake.
+//
+// The fix round (R115) adds the cases for #429's review: step 2's back once a
+// create's answer is unknown (M1, the probe PR2, the survivor Y1), the look
+// held while it is (PR8, Y2 and Y3), one wallet id per flow (Y8) and the
+// card's own place to drop in (n1).
 import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
 import { afterEach, expect, test, vi } from 'vitest';

@@ -419,6 +424,97 @@ test('two presses on เพิ่มกระเป๋า send one create and on
   }
 });

+test("step 2's back is held only while the create is out; once its answer is unknown, or its resend is blocked, back leaves the flow and keeps no look", async () => {
+  // While the create is out, back is held, and a press changes nothing.
+  const out = createFakeResources();
+  const release = out.hold('createWallet');
+  mountWallet(<NewWalletFlow now={NOW} />, { resources: out.resources });
+  await settle();
+  fillBank();
+  fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
+  await settle();
+  expect(named('button', 'กลับ').getAttribute('aria-disabled')).toBe('true');
+  fireEvent.click(named('button', 'กลับ'));
+  expect([found('new-wallet-step').textContent, router.back.mock.calls.length, router.replace.mock.calls]).toEqual([WORDS.th.step(2), 0, []]);
+  await act(async () => { release(); });
+  await settle();
+  expect(screen.queryByTestId('new-wallet-added')).not.toBeNull();
+  cleanup();
+
+  // The answer is lost: back leaves the flow, as step 1's back does, and no look is kept (the list reads again on return).
+  const lost = createFakeResources();
+  lost.loseResponse('createWallet');
+  const view = mountWallet(<NewWalletFlow now={NOW} />, { resources: lost.resources });
+  await settle();
+  fillBank();
+  fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
+  await settle();
+  expect(named('button', 'กลับ').getAttribute('aria-disabled')).toBeNull();
+  fireEvent.click(named('button', 'กลับ'));
+  expect([router.back.mock.calls.length, router.replace.mock.calls, keptLooks(view.stored)]).toEqual([1, [], {}]);
+  cleanup();
+  router.back.mockReset();
+
+  // The review's PR2: a resend blocked because the session changed holds every other control, and back still leaves,
+  // here with nothing to go back to, so to the list the flow was opened from.
+  const blocked = createFakeResources();
+  blocked.loseResponse('createWallet');
+  const again = mountWallet(<NewWalletFlow returnTo="/spend/wallets" now={NOW} />, { resources: blocked.resources });
+  await settle();
+  fillBank();
+  fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
+  await settle();
+  blocked.fail('createWallet', 'session_changed');
+  fireEvent.click(named('button', 'ลองอีกครั้ง'));
+  await settle();
+  expect([screen.queryByRole('button', { name: 'ลองอีกครั้ง' }), named('button', 'เพิ่มกระเป๋า').getAttribute('aria-disabled')]).toEqual([null, 'true']);
+  router.canGoBack.mockReturnValue(false);
+  fireEvent.click(named('button', 'กลับ'));
+  expect([router.back.mock.calls.length, router.replace.mock.calls, keptLooks(again.stored)]).toEqual([0, [['/spend/wallets']], {}]);
+});
+
+test("while a create's answer is unknown the faces and the materials are held, so the look kept is the one wallet_added reported", async () => {
+  const { sent, restore } = await recordAnalytics();
+  try {
+    const lost = createFakeResources();
+    lost.loseResponse('createWallet');
+    const view = mountWallet(<NewWalletFlow now={NOW} />, { resources: lost.resources });
+    await settle();
+    fillBank();
+    fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
+    await settle();
+    // The review's PR8, for the faces and the materials: all ten are held, and a press on one changes nothing.
+    expect(screen.queryAllByRole('radio').map((radio) => radio.getAttribute('aria-disabled'))).toEqual(Array<string>(10).fill('true'));
+    fireEvent.click(found('look-face-wink'));
+    fireEvent.click(found('look-material-sky'));
+    expect([checked('look-face-smile'), checked('look-face-wink'), checked('look-material-silk'), checked('look-material-sky')]).toEqual(['true', 'false', 'true', 'false']);
+    fireEvent.click(named('button', 'ลองอีกครั้ง'));
+    await settle();
+    const walletId = (lost.callsOf('createWallet')[0].args[0] as { id: string }).id;
+    expect([keptLooks(view.stored)[walletId], added(sent)]).toEqual([{ kind: 'bank', material: 'silk', face: 'smile' }, [{ wallet_type: 'bank', material: 'silk', bun_face: 'smile' }]]);
+  } finally {
+    restore();
+  }
+});
+
+test('one wallet id per flow, however often the flow draws: the card it shows is the wallet it creates', async () => {
+  // With no account open the card shows the look derived from the wallet's id, so a new id would change it as keys are pressed.
+  const ids = vi.spyOn(globalThis.crypto, 'randomUUID');
+  const fake = createFakeResources();
+  mountWallet(<NewWalletFlow now={NOW} />, { resources: fake.resources, diary: null });
+  await settle();
+  fillBank();
+  const gradient = () => found('wallet-preview').querySelector('linearGradient')?.getAttribute('id');
+  const [asked, drawn] = [ids.mock.calls.length, gradient()];
+  press('ลบตัวเลข', 'ลบตัวเลข', '1', '5');
+  typeName('ชื่อกระเป๋า', 'บัญชีเงินเดือน');
+  expect([ids.mock.calls.length, gradient(), found('wallet-opening').textContent]).toEqual([asked, drawn, '฿24,815']);
+  fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
+  await settle();
+  const walletId = (fake.callsOf('createWallet')[0].args[0] as { id: string }).id;
+  expect(`wallet-material-${derivedLook(walletId).material}-light`).toBe(drawn);
+});
+
 test('a name or an opening balance the create cannot take says so on its field, and sends nothing', async () => {
   const fake = createFakeResources();
   mountWallet(<NewWalletFlow now={NOW} />, { resources: fake.resources });
@@ -495,6 +591,18 @@ test('under Reduce Motion the card fades in, and walletAdded still plays once',
   expect([drops.asked, haptics.played.filter((moment) => moment === 'walletAdded')]).toEqual([[true], ['walletAdded']]);
 });

+test("the new card drops in a place of its own, so it falls about one card's height to where it rests", async () => {
+  mountWallet(<NewWalletFlow now={NOW} />);
+  await settle();
+  fillBank();
+  fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
+  await settle();
+  // Reanimated's originY is in the parent's coordinates: the card's parent holds only the card, so -200 is one card's
+  // height above where it rests, not above the scroll view's top (the review's n1).
+  const place = found('new-wallet-card-place');
+  expect([found('new-wallet-card').parentElement === place, place.children.length, drops.asked]).toEqual([true, 1, [false]]);
+});
+
 test('at AX5 nothing is clamped to a line, and the kinds and the looks wrap', async () => {
   const LONG_NAME = 'บัญชีออมทรัพย์สำหรับค่าเทอมลูกและค่าใช้จ่ายในบ้านของครอบครัวใหญ่ทุกเดือนตลอดปีนะ';
   mountWallet(<NewWalletFlow now={NOW} />, { fontScale: AX5 });
```

`apps/app/src/wallet/wallets/WalletEdit.render.test.tsx`:
```diff
diff --git a/apps/app/src/wallet/wallets/WalletEdit.render.test.tsx b/apps/app/src/wallet/wallets/WalletEdit.render.test.tsx
index ed745a26ab9a053051728f0defc3fd56c9695d72..f6523e20c98454f92b2ac65d54ad92f6d042f64a 100644
--- a/apps/app/src/wallet/wallets/WalletEdit.render.test.tsx
+++ b/apps/app/src/wallet/wallets/WalletEdit.render.test.tsx
@@ -9,6 +9,12 @@
 // as Tray.render.test.tsx does. expo-router is the catalogue's recorded
 // router. The wallets' and the entries' reads, and the commands, are the
 // case's own fake.
+//
+// The fix round (R115) adds the cases for #429's review: no navigation once
+// the person has left (m1, the probe PR1), a cleared opening balance sent as
+// ฿0 (PR4, the survivor Y7), Try again held by the ref (PR7, Y4), archive held
+// while a save's answer is unknown (Y6), the notice cleared by the next save
+// (Y9), and the refused archive's ฿0 in private mode (n2, PR5).
 import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
 import { afterEach, expect, test, vi } from 'vitest';

@@ -275,16 +281,29 @@ test('archive is offered only at ฿0; otherwise the screen says why', async ()
   }
 });

-test('nothing changed goes back with nothing sent, and two presses on บันทึก send one update', async () => {
+test('nothing changed goes back once with nothing sent, and two presses on บันทึก send one update', async () => {
   const fake = board();
   mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: fake.resources, account: KEPT });
   await settle();
-  fireEvent.click(named('button', 'บันทึก'));
+  // Two presses before React draws again leave once (R115, m1).
+  const unchanged = named('button', 'บันทึก');
+  act(() => {
+    fireEvent.click(unchanged);
+    fireEvent.click(unchanged);
+  });
   expect([updates(fake), router.back.mock.calls.length]).toEqual([[], 1]);
+  cleanup();
+  // With nothing to go back to, it goes to the list.
   router.canGoBack.mockReturnValue(false);
+  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: fake.resources, account: KEPT });
+  await settle();
   fireEvent.click(named('button', 'บันทึก'));
   expect(router.replace.mock.calls).toEqual([['/spend/wallets']]);
+  cleanup();
   router.canGoBack.mockReturnValue(true);
+  router.back.mockReset();
+  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: fake.resources, account: KEPT });
+  await settle();
   fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัญชีเงินเดือน' } });
   const save = named('button', 'บันทึก');
   act(() => {
@@ -292,7 +311,7 @@ test('nothing changed goes back with nothing sent, and two presses on บัน
     fireEvent.click(save);
   });
   await settle();
-  expect(updates(fake)).toEqual([[W.main, 1, { name: 'บัญชีเงินเดือน' }]]);
+  expect([updates(fake), router.back.mock.calls.length]).toEqual([[[W.main, 1, { name: 'บัญชีเงินเดือน' }]], 1]);
   // A name it cannot save says so on its field, and sends nothing.
   cleanup();
   const blank = board();
@@ -402,6 +421,151 @@ test('a save whose answer is lost offers Try again under the same key; a wallet
   expect(router.dismissTo.mock.calls).toEqual([]);
 });

+test('once the person has left, a save or an archive that lands takes them nowhere more', async () => {
+  // Back while a save is out goes back once; the save that lands after it goes nowhere.
+  const out = board();
+  const release = out.hold('updateWallet');
+  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: out.resources, account: KEPT });
+  await settle();
+  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัญชีเงินเดือน' } });
+  fireEvent.click(named('button', 'บันทึก'));
+  await settle();
+  fireEvent.click(named('button', 'กลับ'));
+  await act(async () => { release(); });
+  await settle();
+  expect([updates(out), router.back.mock.calls.length]).toEqual([[[W.main, 1, { name: 'บัญชีเงินเดือน' }]], 1]);
+  cleanup();
+  router.back.mockReset();
+
+  // The review's PR1: the spend layout's Slot unmounts the screen on back, then the save lands. Back once in all.
+  const slot = board();
+  const later = slot.hold('updateWallet');
+  const view = mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: slot.resources, account: KEPT });
+  await settle();
+  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัญชีเงินเดือน' } });
+  fireEvent.click(named('button', 'บันทึก'));
+  await settle();
+  fireEvent.click(named('button', 'กลับ'));
+  view.unmount();
+  await act(async () => { later(); });
+  await settle();
+  expect(router.back.mock.calls.length).toBe(1);
+  router.back.mockReset();
+
+  // The screen went away another way (the system back) while its save was out: the save lands and takes no one anywhere.
+  const gone = board();
+  const landing = gone.hold('updateWallet');
+  const away = mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: gone.resources, account: KEPT });
+  await settle();
+  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัญชีเงินเดือน' } });
+  fireEvent.click(named('button', 'บันทึก'));
+  await settle();
+  away.unmount();
+  await act(async () => { landing(); });
+  await settle();
+  expect([updates(gone).length, router.back.mock.calls.length, router.replace.mock.calls]).toEqual([1, 0, []]);
+
+  // An archive that lands after back goes nowhere either.
+  const archiving = board();
+  const archived = archiving.hold('archiveWallet');
+  mountWallet(<WalletEditScreen walletId={W.zero} now={NOW} />, { resources: archiving.resources, account: KEPT });
+  await settle();
+  fireEvent.click(named('button', 'เก็บกระเป๋านี้ถาวร'));
+  await settle();
+  fireEvent.click(named('button', 'กลับ'));
+  await act(async () => { archived(); });
+  await settle();
+  expect([archiving.callsOf('archiveWallet').length, router.back.mock.calls.length, router.dismissTo.mock.calls]).toEqual([1, 1, []]);
+});
+
+test('delete on the stored opening balance clears it to ฿0, and ฿0 is what is sent, with its reason', async () => {
+  const fake = board();
+  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: fake.resources, account: KEPT });
+  await settle();
+  press('ลบตัวเลข');
+  // The review's PR4: the screen says ฿0, and the card what ฿0 less the ฿5,140 spent leaves.
+  expect([found('wallet-opening').textContent, found('wallet-opening').getAttribute('aria-label'), found('wallet-preview').getAttribute('aria-label')]).toEqual(['฿0', 'ยอดเริ่มต้น 0 บาท', 'ตัวอย่างการ์ด บัญชีหลัก ยอด ติดลบ 5,140 บาท']);
+  fireEvent.click(named('button', 'บันทึก'));
+  await settle();
+  startAnimations();
+  fireEvent.click(named('button', REASONS[0]));
+  await settle();
+  expect(updates(fake)).toEqual([[W.main, 1, { opening_minor: '0', correction_reason: 'entry_error' }]]);
+});
+
+test('two presses on Try again resend once, and the save that lands goes back once', async () => {
+  // The review's PR7.
+  const lost = board();
+  lost.loseResponse('updateWallet');
+  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: lost.resources, account: KEPT });
+  await settle();
+  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัญชีเงินเดือน' } });
+  fireEvent.click(named('button', 'บันทึก'));
+  await settle();
+  const tryAgain = named('button', 'ลองอีกครั้ง');
+  act(() => {
+    fireEvent.click(tryAgain);
+    fireEvent.click(tryAgain);
+  });
+  await settle();
+  expect([lost.callsOf('updateWallet').length, router.back.mock.calls.length]).toEqual([2, 1]);
+});
+
+test("while a save's answer is unknown archive is held, and a press on it sends nothing", async () => {
+  const lost = board();
+  lost.loseResponse('updateWallet');
+  mountWallet(<WalletEditScreen walletId={W.zero} now={NOW} />, { resources: lost.resources, account: KEPT });
+  await settle();
+  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัตรใหม่' } });
+  fireEvent.click(named('button', 'บันทึก'));
+  await settle();
+  const archive = named('button', 'เก็บกระเป๋านี้ถาวร');
+  expect(archive.getAttribute('aria-disabled')).toBe('true');
+  fireEvent.click(archive);
+  await settle();
+  // Nothing was archived, and the update whose answer is unknown keeps its Try again.
+  expect([lost.callsOf('archiveWallet'), screen.queryByRole('button', { name: 'ลองอีกครั้ง' }) !== null]).toEqual([[], true]);
+});
+
+test("the next save clears the notice that the wallet changed on another device, so it never sits beside that save's answer", async () => {
+  const moved = board();
+  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: moved.resources, account: KEPT });
+  await settle();
+  const main = moved.wallets.get(W.main) as WalletSnapshot;
+  moved.wallets.set(W.main, { ...main, opening_minor: '3500000', version: 2 });
+  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัญชีเงินเดือน' } });
+  fireEvent.click(named('button', 'บันทึก'));
+  await settle();
+  expect(found('wallet-edit-notice').textContent).toBe(translateCopy('This wallet changed on another device.', 'th'));
+  // Saved again on the newer version, and its answer lost: the notice is gone, and that save's own words show.
+  moved.loseResponse('updateWallet');
+  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัญชีเงินเดือน' } });
+  fireEvent.click(named('button', 'บันทึก'));
+  await settle();
+  expect([screen.queryByTestId('wallet-edit-notice'), within(found('wallet-edit-problem')).getByRole('alert').textContent]).toEqual([null, translateCopy('Not confirmed yet. Your entry is kept; try again.', 'th')]);
+});
+
+test('an archive refused because the balance moved says its ฿0 in words, and in private mode masks it as the line below does', async () => {
+  for (const locale of LOCALES) {
+    for (const hidden of [false, true]) {
+      const at = `${locale}${hidden ? ' private' : ''}`;
+      const fake = board();
+      mountWallet(<WalletEditScreen walletId={W.zero} now={NOW} />, { resources: fake.resources, account: KEPT, locale, device: hidden ? { [PRIVATE_MODE_NAME]: '1' } : {} });
+      await settle();
+      fake.records.set('0000000b-0000-4000-8000-000000000003', { ...spent('0000000b-0000-4000-8000-000000000003', W.zero, '2000'), type: 'income' } as TransactionDto);
+      fireEvent.click(named('button', WORDS[locale].archive));
+      await settle();
+      const line = (zero: string) => translateCopy("{name} wasn't archived: its balance is no longer {zero}.", locale, { name: 'บัตรเก่า', zero });
+      const said = hidden ? (locale === 'th' ? 'ซ่อนยอดเงินอยู่' : 'Amount hidden') : (locale === 'th' ? '0 บาท' : '0 baht');
+      const refused = found('wallet-archive-refused');
+      expect([refused.textContent, refused.getAttribute('aria-label')], at).toEqual([line(hidden ? '฿••••' : '฿0'), line(said)]);
+      // In private mode no digit of an amount is left on the archive's lines (the review's PR5).
+      expect(/[0-9]/.test(`${refused.textContent} ${found('wallet-archive-later').textContent}`), at).toBe(!hidden);
+      cleanup();
+    }
+  }
+});
+
 test('private mode hides every amount on the edit screen, and the opening balance until a key is pressed', async () => {
   for (const locale of LOCALES) {
     const hidden = locale === 'th' ? 'ซ่อนยอดเงินอยู่' : 'Amount hidden';
```

`docs/implementation/receipts/P2-T21.md`:
```diff
diff --git a/docs/implementation/receipts/P2-T21.md b/docs/implementation/receipts/P2-T21.md
index d331e381f59570f0ddafc37419dd173299e89e8d..ee87470741951db95eb74d0f0e3e188e30ebb86e 100644
--- a/docs/implementation/receipts/P2-T21.md
+++ b/docs/implementation/receipts/P2-T21.md
@@ -1,6 +1,7 @@
 # P2-T21: A new wallet, editing a wallet and the correction tray

 - **Status:** built and verified locally on `p2/t21-wallet-edit` (`.claude/worktrees/p2-t21`), from `150cfb82`. Not pushed. The independent review is the controller's, after this receipt. Under ruling R87 this receipt is its own file; `premium-progress.md` is not edited.
+- **Fix round:** PR #429's first review said Needs fixes (M1, m1 to m3, n1, n2), and the second approved. The controller ruled R115, and `receipts/P2-T21-fix.md` records the round: step 2's back leaves the flow once a create's answer is unknown; the edit screen leaves once, so a save that lands after back takes no one further; the new card drops from a place of its own; the refused archive's ฿0 is masked in private mode; and the reviews' survivors are pinned. The lines below that R115 makes untrue are corrected.
 - **Base:** `150cfb82` (the brief was proven at `964f6c0e`). `git log --oneline 964f6c0e..HEAD` lists the merge of #420 (P3-T2, `25ce2661`: the transaction and AI contracts in `packages/contracts`, the P18 set), the merge of #412 (P2-T25, `82b96699`: Recently deleted and its `bw-deleted` section), the branch commits they merged, and the controller's state syncs `9a7b767e` and `150cfb82`. None of the ten shared files changed since `964f6c0e`: each equals its `orig/` checksum, so no shared file was applied with `--3way`. Also named, as Step 0.3 asks: `apps/app/src/analytics/events.ts` (in the brief's "calls into" list, changed by the merged work, `2 +-`) and `apps/app/src/dev/catalogue/wallet/index.ts` (+2 from #412's spread, which this task does not touch). The focused counts: N is 179, as the brief has it; C is 52, not 50, because #412 adds the `bw-deleted` section (two suites), which the brief allows.
 - **Files:** created `apps/app/src/wallet/wallets/NewWalletFlow.tsx` (406 lines), `WalletFields.tsx` (233), `WalletEditScreen.tsx` (394), `CorrectionTray.tsx` (46), `NewWallet.render.test.tsx` (538 lines, 12 cases), `WalletEdit.render.test.tsx` (486 lines, 9 cases), `apps/app/app/spend/wallet/new.tsx` (26), `apps/app/app/spend/wallet/[id]/edit.tsx` (18) and this receipt. Modified `apps/app/src/wallet/wallets/copy.ts` (33 lines before, 74 after), `apps/app/src/dev/catalogue/wallet/walletListSections.tsx` (168, five sections), `apps/app/src/wallet/wallets/WalletsListScreen.tsx` (453), `WalletsList.render.test.tsx` (562, 15 cases), `apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx` (148, 5 cases), `apps/app/src/dev/catalogue/routerTestStub.tsx` (25), `apps/app/src/screens/redesign/planning/walletCommands.ts` (118), `walletCommands.render.test.tsx` (466, 22 cases), `apps/app/src/wallet/motion/useWalletMotion.ts` (80) and `useWalletMotion.render.test.tsx` (115, 7 cases). The commit holds these nineteen files.
 - **What changed:**
@@ -16,7 +17,7 @@
   - The sections (P14): `bw-wallet-new-type`, `bw-wallet-new-form`, `bw-wallet-added`, `bw-wallet-edit` and `bw-wallet-correction` follow `bw-wallets-reorder`. Each is the real screen on fakes, loaded when its section opens.
   - The list's add tile (P4a): `NEW_WALLET_HREF` is `{ pathname: '/spend/wallet/new', params: { returnTo: '/spend/wallets' } }` (`WalletsListScreen.tsx:70`), and its cast is gone. `walletHref` keeps its cast until P2-T22. The list is read again on return because it mounts again: the spend layout's `Slot` draws only the route in front (`node_modules/expo-router/build/views/Navigator.js:164-170`), so leaving the flow remounts the list, whose `useLoad` reads at mount. No focus listener is added.
   - The hook (P4c): `walletCommands.ts` `send` calls `trackWalletAdded` once, after `attempt` returns `done` for a create (`:53-63`), inside its own `try` and `catch`, outside the save's `try` (`:68`). An emitter that throws never turns a saved wallet into a refusal, and the send still answers.
-  - The drop (P4e): `walletAddedEntering` starts the card at `originY: -WALLET_DROP_PT` (`useWalletMotion.ts:79`), with `WALLET_DROP_PT = 200` (`:73`), about one card's height above its place rather than a window's height.
+  - The drop (P4e): `walletAddedEntering` starts the card at `originY: -WALLET_DROP_PT` (`useWalletMotion.ts:79`), with `WALLET_DROP_PT = 200` (`:73`), rather than a window's height. Reanimated measures `originY` in the card's parent, so that is one card's height above its place only from a place of its own. As this round drew it, the card was a child of the ceremony's scroll content and fell about `insets.top + 268` pt; the fix round gives it its own place (`new-wallet-card-place`, R115).
 - **RED to GREEN:**
   - RED (Step 3, the typed stubs with the tests in place): `npm run typecheck:app` exits 0. The six render files exit 1: `Test Files 6 failed (6)`, `Tests 25 failed | 45 passed (70)`, 25 `AssertionError`s, and no module-load error (no `Cannot find module`, `Failed to resolve`, `SyntaxError`, `is not a function`, `TestingLibraryElementError`, `TypeError` or `ReferenceError`). The 45 that pass are the shared files' old cases (4 + 11 + 21 + 6) and PA, PB and PF. The 25 failures are the brief's, each on its assertion, in the brief's order: the motion drop (`expected undefined to deeply equal { originY: -200 }`), the twelve NewWallet cases (`new-wallet-step`, `wallet-kind-bank`, `th: expected [] …`, `wallet-kind-cash`, `wallet-kind-transit`, `expected [] to deeply equal [ 'bw-wallets-reorder', …(5) ]`), the nine WalletEdit cases (`th light`, `a radio named ขยิบตา`, `a button named 5`, `a button named เก็บกระเป๋านี้ถาวร`, `a button named บันทึก`, `a textbox named ชื่อกระเป๋า`, `wallet-preview`, `wallet-edit-gone`, `a button named กลับ`), the list's navigation case, the routes case and the hook's emitter case.
   - GREEN (Step 4): `npm run typecheck:app` and `npm run typecheck:routes -w gogospend-app` each exit 0. `draftText.test.ts`: `ℹ tests 4`, `ℹ pass 4`, `ℹ fail 0`. The six render files: exit 0, `Test Files 6 passed (6)`, `Tests 70 passed (70)` (12 + 9 + 5 + 15 + 22 + 7), each case marked, and no `stderr |` block.
@@ -63,16 +64,17 @@
   - The full render suite (CI, R100; the catalogue's every-section and screen-reader suites pick up the five sections there), and the iOS export (CI).
   - `test:ops`: no package or lockfile change.
   - The API, edge and database suites: nothing outside `apps/app` changes, and Docker is stopped.
-  - Device and simulator checks: VoiceOver on the kinds, the preview's image, the faces' and materials' radios and the ceremony's announcement; a quick double tap on เพิ่มกระเป๋า, บันทึก, a reason and เก็บกระเป๋านี้ถาวร on a phone; the drop on the simulator (about 44 pt of overshoot) and under Reduce Motion; the keyboard over the name field and the pinned footer; `dismissTo` back to the list, the checklist and Home on a development build with the wallet area on; the system back during the flow; AX5 on a phone; and E2-B's screenshots (the controller's, after P2-T28).
+  - Device and simulator checks: VoiceOver on the kinds, the preview's image, the faces' and materials' radios and the ceremony's announcement; a quick double tap on เพิ่มกระเป๋า, บันทึก, a reason and เก็บกระเป๋านี้ถาวร on a phone; the drop on the simulator (200 pt from its own place since the fix round, so about 44 pt of overshoot) and under Reduce Motion; the keyboard over the name field and the pinned footer; `dismissTo` back to the list, the checklist and Home on a development build with the wallet area on; the system back during the flow; AX5 on a phone; and E2-B's screenshots (the controller's, after P2-T28).
 - **Risks:**
   - With no account open, a new wallet keeps no look and shows the look derived from its id (P9).
   - `/spend/setup` does not exist until P2-T35, so `?setup=1` would end on expo-router's unmatched route, although nothing opens it before P2-T35 (P8).
   - The system back on the fields leaves the flow, not the step: there is no back handler, and its device check is SKIPPED.
+  - In the wallet area a wallet's tracking start (เริ่มจด) cannot be changed anywhere. A wallet made here starts today, so earlier dates cannot be logged to it: the server refuses them with `DATE_BEFORE_TRACKING_START`. Today's Wallets screen and its date chip cannot be reached while the `wallet` area is on. R115 keeps เริ่มจด as text for this round; the owner decides at E2-B.
 - **Notes for later tasks:**
   - **P2-T22:** `wallet.gone` is already in `wallets/copy.ts`. The edit route is `/spend/wallet/<id>/edit`, so the detail's แก้ไข and its more tray push it. Once `/spend/wallet/[id]` exists, drop `walletHref`'s cast in `WalletsListScreen.tsx`. An edit that saves goes back (to the detail), and one that archives goes to the list.
   - **P2-T24:** a new wallet opened from Home is `/spend/wallet/new` with no `returnTo`, so its ceremony goes back to Home.
   - **P2-T35:** the checklist opens `/spend/wallet/new?setup=1`. Once `/spend/setup` exists, drop the `as Href` on `destination` in `NewWalletFlow.tsx`.
-  - **P2-T37:** every stored amount here is a `WalletAmount` or masked by `isFilled`. The sweep's exemptions must know the keypad's keys and the cap's words (P2-T14's note) on both screens, and the archive line's ฿0, which `WalletAmount` masks too.
+  - **P2-T37:** every stored amount here is a `WalletAmount` or masked by `isFilled`. The sweep's exemptions must know the keypad's keys and the cap's words (P2-T14's note) on both screens, and the archive line's ฿0, which `WalletAmount` masks too. Since the fix round the refused archive's line masks its ฿0 as well.
   - **A hook test task:** P2-T19's review's m3 and m4 (P4c).
   - **P2-T24 or P2-T30:** P2-T9's m-1 (GrowBar) is still open.
-  - **E2-B:** P20's differences. Capture `bw-wallet-added` and check the drop on the simulator (about 44 pt of overshoot), and capture `bw-wallet-correction` from a fresh launch. The differences from the boards: wc-wallet-type drops the e-wallet row, uses the wallet's round 44 pt back button and draws the travel card's BTS / MRT in the line's type; the fields' preview is the kit's full card, the fields are white cards, the tracking start reads as a date chip does, and the entries note sits under the keypad; bw-adding follows the mode and plays success for every new wallet; wc-wallet-edit's archive has no confirmation and its amounts are 13 pt `WalletAmount`s; with no account open no faces or materials are offered; every English line is a draft.
+  - **E2-B:** P20's differences. Capture `bw-wallet-added` and check the drop on the simulator (200 pt from its own place since the fix round, so about 44 pt of overshoot), and capture `bw-wallet-correction` from a fresh launch. The differences from the boards: wc-wallet-type drops the e-wallet row, uses the wallet's round 44 pt back button and draws the travel card's BTS / MRT in the line's type; the fields' preview is the kit's full card, the fields are white cards, and the entries note sits under the keypad; the tracking start reads as a date chip does but is text, not the board's link, and nothing in the wallet area changes it (the brief's P9 and P20 said today's Wallets screen keeps its date chip, but that screen cannot be reached while the `wallet` area is on; the owner decides, R115); bw-adding follows the mode and plays success for every new wallet; wc-wallet-edit's archive has no confirmation and its amounts are 13 pt `WalletAmount`s; with no account open no faces or materials are offered; every English line is a draft.
```

`docs/implementation/receipts/P2-T21-fix.md` (new):
```diff
diff --git a/docs/implementation/receipts/P2-T21-fix.md b/docs/implementation/receipts/P2-T21-fix.md
new file mode 100644
index 0000000000000000000000000000000000000000..a124ab56f96cdeffa6e70fdf06a5c2b748a35f36
--- /dev/null
+++ b/docs/implementation/receipts/P2-T21-fix.md
@@ -0,0 +1,84 @@
+# P2-T21-fix: step 2's back once a create's answer is unknown, leaving the edit screen once, the card's own place, the refused archive's ฿0, and the reviews' pins
+
+- **Status:** built and verified locally on `p2/t21-wallet-edit` (`.claude/worktrees/p2-t21`), one commit on PR #429's reviewed head `2411001e`. Not pushed. This is the fix round on PR #429 after two reviews:
+  - the first (`.claude/controller/reviews/P2-T21.md`) said Needs fixes: one major (M1), three minors (m1 to m3) and two nits (n1, n2);
+  - the second (`P2-T21-second.md`, money, the wallet and privacy) approved. Its m1 is the first's m1, and its probe W4 (two presses on an unchanged บันทึก) is held here too. Its m2 is the first's m2, and its n3 is the first's n1.
+
+  The controller ruled R115, and the planner's brief is `.claude/controller/briefs/P2-T21-fix.md`. Under R87 this receipt is its own file; `P2-T21.md` is corrected and points here.
+- **Base:** `2411001e`, with no merge: the controller merges the integration branch up.
+- **Files:** modified `apps/app/src/wallet/wallets/NewWalletFlow.tsx` (406 lines before, 419 after), `WalletEditScreen.tsx` (394, 421), `NewWallet.render.test.tsx` (538, 646; 12 cases before, 16 after), `WalletEdit.render.test.tsx` (486, 650; 9 cases before, 15 after) and `docs/implementation/receipts/P2-T21.md` (a line pointing here, and the lines R115 makes untrue); created this receipt. No shared file, route, copy line, package or lockfile changes.
+- **M1, step 2's back (R115.1):**
+  - Step 2's back is held only while a create is out (`sending.phase === 'saving'`).
+  - Once the create's answer is unknown, and after a blocked resend (`session_changed` or `upgrade_required`), back calls `leave()`, as step 1's back does: back to where the flow came from, or `replace` with its destination when there is nothing to go back to. It never goes to the kinds then, since a new kind would change the look under the pending command.
+  - Nothing is kept: a look is kept only after `done`. The list reads again on return, because it mounts again, so it shows the wallet if the create committed.
+  - The case: while the create is out, back is held and a press changes nothing, then the create lands; with the answer lost, back leaves once and no look is kept; and the review's PR2, a blocked resend with every other control held, where back leaves to `/spend/wallets`.
+- **m1, leaving the edit screen once (R115.2):**
+  - The edit form leaves through one `leave()`: it navigates only while a ref says the person is still here, and sets the ref. The header's back, a save or an archive that lands (`done`), and an unchanged บันทึก all go through it. The ref is also set when the screen unmounts, by the system back or by the `Slot` on back.
+  - So a save that lands after back, or after the screen went away, takes no one further, and two presses on an unchanged บันทึก before React draws again go back once.
+  - The header's back stays enabled while a save is out, as today's form's does. R115 allowed holding it instead; leaving once also covers the system back, which a held button cannot.
+  - The case has four parts: back while a save is out goes back once, and the save that lands goes nowhere; the review's PR1 (the `Slot` unmounts the screen, then the save lands: back once in all); a screen gone away while its save was out (no navigation); and an archive that lands after back (no `dismissTo`). The nothing-changed case now presses บันทึก twice before React draws again, and goes back once.
+- **m2, the reviews' survivors (R115.3).** The code these pin was already right, so no code changed for m2:
+  - PR4, the money path (Y7): delete on the stored ฿30,000 opening balance shows ฿0 and says ยอดเริ่มต้น 0 บาท, the card reads ติดลบ 5,140 บาท, and the update sent is `{ opening_minor: '0', correction_reason: 'entry_error' }`.
+  - PR7 (Y4): two presses on the edit's Try again resend once, and the save that lands goes back once.
+  - PR8 (Y2, Y3): while a create's answer is unknown, all ten faces and materials are held and a press changes nothing. The look kept after Try again is the one `wallet_added` reported: bank, silk, smile.
+  - Y6: while a save's answer is unknown, archive is held. A press sends no archive, and the update keeps its Try again.
+  - Y8: one wallet id per flow. With no account open, no new id is asked for while keys are pressed and the name typed, and the card keeps its look. The wallet created is the one whose derived look the card drew.
+  - Y9: the next save clears "This wallet changed on another device.", so the notice never sits beside that save's own words (here, a lost answer).
+- **m3, the tracking start (R115.4):**
+  - เริ่มจด stays text. A wallet made in the flow starts today, so earlier dates cannot be logged to it: the server refuses them with `DATE_BEFORE_TRACKING_START`.
+  - Nothing in the wallet area can move the date, because today's Wallets screen and its date chip cannot be reached while the `wallet` area is on. `P2-T21.md`'s E2-B note said today's screen keeps the chip; it is corrected.
+  - The owner decides at E2-B: a date tray under today's `validateTrackingStart` rules, or text with this consequence. The controller records it.
+- **n1, the card's own place (R115.5):**
+  - The ceremony's card enters inside a view of its own (`new-wallet-card-place`). Reanimated animates an entering view's `originY` to its `targetOriginY`, which is in the parent's coordinates. So `walletAddedEntering`'s `originY: -200` is 200 pt above the card's place only when the card's parent starts where the card does.
+  - Before, the card was a child of the scroll content and fell about `insets.top + 268` pt (about 327 pt with a 59 pt inset), with about 70 pt of overshoot.
+  - It now falls 200 pt. The bouncy spring (damping 14, stiffness 260, mass 1, a damping ratio of about 0.43) overshoots by about 22% of that, about 44 pt, as `P2-T21.md`'s note said.
+  - The place has a test id, which also keeps Fabric from flattening it away: in React Native 0.88's `ViewShadowNode`, a view with a `testID` forms a view. So on a phone too, the place stays the card's parent.
+  - The case: the card's parent is the place, and the place holds only the card.
+- **n2, the refused archive's ฿0 (R115.6):**
+  - The refused archive's line (`ArchiveRefused`) masks its ฿0 in private mode as the line below does: ฿•••• on screen, and ซ่อนยอดเงินอยู่ in its spoken words. Out of private mode it says the amount in words (0 บาท), as `ArchiveLater` does.
+  - The case runs in Thai and English, with private mode off and on (the review's PR5). It checks the line's text and its words, and that in private mode no digit is left on the archive's two lines.
+- **RED to GREEN:**
+  - RED is `2411001e`'s code with the round's two suites. No stub is needed: the new cases use nothing the code does not already export.
+    - `npm run typecheck:app`: exit 0.
+    - The two suites: `Tests 5 failed | 26 passed (31)`. Each failure is an `AssertionError`, with no load or lookup error.
+    - NewWallet fails two cases: step 2's back (`expected 'true' to be null`) and the card's place (`new-wallet-card-place: expected null not to be null`).
+    - WalletEdit fails three: nothing changed (`expected [ [], 2 ] to deeply equal [ [], 1 ]`), leaving once (`expected [ [ [ …(3) ] ], 2 ] to deeply equal [ [ [ …(3) ] ], 1 ]`) and the refused archive (`th: expected [ …(2) ] to deeply equal [ …(2) ]`).
+    - The 26 that pass are the first round's 20 unchanged cases and the six new pins of what was already right (PR8, Y8, PR4, PR7, Y6, Y9).
+  - GREEN:
+    - `typecheck:app` and `typecheck:routes`: exit 0.
+    - The two suites: `Tests 31 passed (31)` (16 + 15), with no `stderr |` block.
+    - `draftText.test.ts`: 4 of 4.
+    - The eight kit render files: 141 of 141. The four routes tests: 13 of 13. The first round's other render files and neighbours: 112 of 112. Each is the same as at `2411001e`.
+    - The catalogue's wallet sections (`-t "bw-"`, both suites): 62 passed. The registry rule: 1 passed.
+- **Mutation check:** 134 mutants: 134 killed, 0 survived. Each file was restored, with its SHA-256 checked.
+  - The first round's 109. N21, E10, E11 and E12 are re-pointed at the lines this round changes.
+  - The first review's Y1 to Y9 (Y1 re-pointed at step 2's new back).
+  - This round's N33 to N37 (step 2's back, the card's place) and E32 to E42 (leaving once, the refused archive's ฿0).
+  - Every kill is on an assertion except the first round's R5 and R9, which fail on the screen's own `useSpendV1 needs a SpendV1Provider.`, as before.
+- **Gate (R100, with R115's files, each named):**
+  - `npm run typecheck:app`: exit 0.
+  - `npm run typecheck:routes -w gogospend-app`: exit 0.
+  - `npm run test:app`: exit 0, `ℹ fail 0`.
+  - `npm run test:unit`: exit 0, `ℹ fail 0`.
+  - `draftText.test.ts`: 4 of 4.
+  - The round's two suites: 31 of 31.
+  - The eight kit render files that import the wallet catalogue index (CardStack, WalletLooks, PrivateMode, walletHarness, Tray, Lock, AmountStep, WalletsList): 141 of 141.
+  - The four routes tests (SpendRoutes, AccountRoutes, InsightsRoutes, PlanningRoutes): 13 of 13.
+  - The first round's other render files and neighbours (walletCommands, useWalletMotion, WalletsScreen, WalletCard): 112 of 112.
+  - `npm run export:web -w gogospend-app -- --max-workers 2`: exit 0, with a `Web Bundled` line (the first round's gate; no route changes here). `dist/` is git-ignored.
+  - `git diff --check`: clean before the commit, and against `origin/claude/p1a-vault-core...HEAD` after it.
+- **Deviations:** none from the brief's rulings.
+- **SKIPPED and CI:**
+  - In CI on the PR (R100): the full render suite, whose per-section jobs run the five `bw-wallet-*` sections; the iOS export; the database, edge and image jobs; and `test:ops`.
+  - Not needed: the API and edge suites, since nothing outside `apps/app` and the receipts changes.
+  - SKIPPED until a device: the drop on the simulator (200 pt, about 44 pt of overshoot) and under Reduce Motion; back on step 2 with a lost answer on a development build, which leaves to the list, where the wallet shows if it committed; the system back during an edit's save; and VoiceOver on the refused archive's line in private mode.
+- **Risks:**
+  - The tracking start (m3): a wallet made here starts today, so earlier dates cannot be logged to it, and nothing in the wallet area can change that until the owner decides.
+  - A save that lands after the person left is not shown to them. A refusal or an unknown answer then goes unseen, and the screen they return to shows what Jotbun holds.
+  - With a create's answer unknown, back leaves the flow, and whether the wallet was made shows only in the list on return. A person who starts a new wallet instead makes a second one, with a new id.
+- **Notes for later tasks:**
+  - **P2-T18:** once `walletTab` hides the bar on `/spend/wallet/*`, step 2's back is the flow's way out while a create's answer is unknown. Keep it there.
+  - **P2-T22:** the edit screen leaves once (`leave()`), so a detail that pushes the edit route gets one pop per back or save. Where an archive lands is still P2-T22's to decide (the first review's note).
+  - **P2-T37:** the refused archive's ฿0 is masked now (`wallet-archive-refused`).
+  - **E2-B (the owner):** the tracking start (m3); a credit card's opening balance (both reviews); "Match my real balance" asks for an opening balance, not the balance; archiving with no confirmation; and the drop on the simulator.
+  - **Not in R115,** left as the second review recorded them: its n1 (a reason chosen once is reused after a refusal), n2 (a tracking start after the phone's date blocks every save) and n4 (choosing a kind again resets the face and the material).
```

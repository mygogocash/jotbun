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
| `apps/app/src/wallet/wallets/NewWalletFlow.tsx` | Step 2's back is held only while a create is out; with its answer unknown, a blocked resend's too, back calls `leave()` (P24). The ceremony's card enters inside a view of its own, `new-wallet-card-place` (P28). {{LINES:orig:apps/app/src/wallet/wallets/NewWalletFlow.tsx}} lines before, {{LINES:apps/app/src/wallet/wallets/NewWalletFlow.tsx}} after. |
| `apps/app/src/wallet/wallets/WalletEditScreen.tsx` | The form leaves once, through `leave()` and a ref set by leaving or by unmounting (P25). The refused archive's line is `ArchiveRefused`: its ฿0 masked in private mode, and said in words (P29). {{LINES:orig:apps/app/src/wallet/wallets/WalletEditScreen.tsx}} before, {{LINES:apps/app/src/wallet/wallets/WalletEditScreen.tsx}} after. |
| `apps/app/src/wallet/wallets/NewWallet.render.test.tsx` | 16 cases (12 before): four new (P24, P26, P28); the twelve unchanged. {{LINES:orig:apps/app/src/wallet/wallets/NewWallet.render.test.tsx}} before, {{LINES:apps/app/src/wallet/wallets/NewWallet.render.test.tsx}} after. |
| `apps/app/src/wallet/wallets/WalletEdit.render.test.tsx` | 15 cases (9 before): six new and one changed (P25, P26, P29). {{LINES:orig:apps/app/src/wallet/wallets/WalletEdit.render.test.tsx}} before, {{LINES:apps/app/src/wallet/wallets/WalletEdit.render.test.tsx}} after. |
| `docs/implementation/receipts/P2-T21.md` | The planner's correction: a line pointing to the fix round, the drop's and the overshoot's notes, the tracking start's E2-B note and Risks, and the P2-T37 note (P27, P28, P30). {{LINES:orig:docs/implementation/receipts/P2-T21.md}} before, {{LINES:docs/implementation/receipts/P2-T21.md}} after. |
| `docs/implementation/receipts/P2-T21-fix.md` | **New**: the round's receipt (R87), written by the planner with the proven numbers (P30). {{LINES:docs/implementation/receipts/P2-T21-fix.md}} lines. |

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
- **P32. 134 mutants, all killed.** The first round's 109 (`tools/mutants.py` of `scratch/p2-t21-planner`), four re-pointed at the lines this round changes (N21, E10, E11, E12); the review's Y1 to Y9; and one mutant for each new guard: N33 to N37 (P24, P28) and E32 to E42 (P25, P29). Every kill is on an assertion except the first round's R5 and R9, as before (the screen's own `useSpendV1 needs a SpendV1Provider.`). None survives and none is marked equivalent. The run takes about {{MUTANT_MINUTES}} minutes.
- **P33. The gate (R100, and R115's "as before, plus").** As the first round's (`typecheck:app`, `typecheck:routes`, `test:app`, `test:unit`, the draft check, the focused render files, `export:web`, `git diff --check`), with each render file named, in four runs: the round's two suites; the eight kit render files that import the wallet catalogue index (CardStack, WalletLooks, PrivateMode, walletHarness, Tray, Lock, AmountStep, WalletsList); the four routes tests (SpendRoutes, AccountRoutes, InsightsRoutes, PlanningRoutes); and the first round's other render files and neighbours (walletCommands, useWalletMotion, WalletsScreen, WalletCard). GREEN (Step 3) also runs the catalogue's wallet sections and the registry rule. No route changes, so `typecheck:routes` and `export:web` are run because the first round's gate ran them, and they are quick. CI runs the full render suite, the iOS export, the database, edge and image jobs and `test:ops`.
- **P34. Not carried, and why.** R115 rules on the first review's items only. The second review's n1 (a reason chosen once is reused after a refusal), n2 (a tracking start after the phone's date blocks every save) and n4 (choosing a kind again resets the look) stay as it recorded them; the receipt names them. The E2-B items (the tracking start, a credit card's opening balance, "Match my real balance", archiving with no confirmation, the drop on a simulator) are the owner's and the controller's.
- **P35. Commit.** One commit on `2411001e`: `Hold step 2's back only while saving, and leave the wallet editor once`, with the body in Step 7 and the trailer `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

---

## Step 1: Check the base

1. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 status --short`. Expected: no output.
2. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 rev-parse --short HEAD`. Expected: `2411001e`. Then `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21 branch --show-current`. Expected: `p2/t21-wallet-edit`.
3. `mkdir -p /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix`
4. The kit, checked from PL: `cd /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix-planner && shasum -a 256 -c SHA256SUMS | grep -vc ': OK$'`. Expected: `0`. Then `cd /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix-planner && shasum -a 256 -c SHA256SUMS | grep -c ': OK$'`. Expected: `{{KIT_FILES}}`.
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
{{RED_RENDER}}

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
Expected: 0, after about {{MUTANT_MINUTES}} minutes. `tail -1 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-fix/mutants.out` prints:
```
{{MUTANT_TOTAL}}
```
Every line ends with `restored sha256 equal`. The planner's lines follow (from `PL/logs/mutants.out`, shortened to the mutant and the first case it fails), for comparison:
```
{{MUTANTS}}
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
{{DIFF:apps_app_src_wallet_wallets_NewWalletFlow.tsx.diff}}

`apps/app/src/wallet/wallets/WalletEditScreen.tsx`:
{{DIFF:apps_app_src_wallet_wallets_WalletEditScreen.tsx.diff}}

`apps/app/src/wallet/wallets/NewWallet.render.test.tsx`:
{{DIFF:apps_app_src_wallet_wallets_NewWallet.render.test.tsx.diff}}

`apps/app/src/wallet/wallets/WalletEdit.render.test.tsx`:
{{DIFF:apps_app_src_wallet_wallets_WalletEdit.render.test.tsx.diff}}

`docs/implementation/receipts/P2-T21.md`:
{{DIFF:docs_implementation_receipts_P2-T21.md.diff}}

`docs/implementation/receipts/P2-T21-fix.md` (new):
{{DIFF:docs_implementation_receipts_P2-T21-fix.md.diff}}

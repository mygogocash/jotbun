# Brief P2-T12 fix round: VoiceOver opens each card of the stack, and the review's pins

You are the fixer for the P2-T12 fix round. PR #395 (branch `p2/t12-card-stack`, commit `90b5079`) adds the wallet card stack. Its Opus review says **Needs fixes** for one major:

- **M1.** Under VoiceOver on iOS, a double tap on a card behind the front one opens the card in front of it.
- **Why.** Each card is `WalletCard`'s plain `Pressable`, 200 pt tall, with only its top 54 pt showing. React Native 0.88's iOS view answers NO to `accessibilityActivate` unless `onAccessibilityTap` is set (`RCTViewComponentView.mm:1673-1680`). So VoiceOver taps the middle of the card's box, and that point lies under the next card.
- **The controller's leave.** You may edit `WalletCard.tsx`, P2-T11's file, for this fix. No task in flight edits it.

The round also takes the review's cheap pins in this task's own files (m3, m4, n2, n3 and n4), since CI cannot run before billing is fixed and one round now saves a CI run later.

The planner wrote every file below and proved it in a scratch copy of `90b5079`:
- RED on `90b5079`'s code, each new pin on an assertion;
- GREEN;
- 73 mutants, all killed;
- a run over tray-hardening's current files;
- R100's fast local gate.

You copy the planner's files, check them by checksum, prove RED, GREEN and the mutants in your own worktree, run the gate, add the receipt's fix-round section and commit. Do exactly what this brief says.

Read first:
1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only, and no whole-suite total anywhere. R87 applies: your receipt is the existing `docs/implementation/receipts/P2-T12.md`; do not edit `premium-progress.md`.
2. The review: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T12.md`, M1, m3, m4 and n2 to n4.

## Paths and rules

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t12` (branch `p2/t12-card-stack`, head `90b5079`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t12-fix`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t12-fix-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the round's five files at their repo paths: four changed and `cardNativeProps.test.ts`, which is new;
  - `orig/`: `90b5079`'s seven files (the receipt included) and `WalletCard.tsx`, as the commit and the integration head both have them;
  - `ready/`: P2-T11's review's ready case `cardNativeProps.test.ts`, as the review wrote it. It is not on the head; `real/` holds it with M1's case added;
  - `diffs/`: one diff per file, with the paths `a/<repo path>` and `b/<repo path>`. `p2-t12-fix.patch` is the whole round, for reading; the planner checked that it turns `orig/` into `real/` byte for byte;
  - `tools/`: `mutants.py` (the runner), `prove.sh` (the planner's stages), `sums.sh`, `brief.py` and `brief.template.md` (every diff and mutant line below is the kit's own);
  - `SHA256SUMS` (the kit) and `SHA256SUMS.logs` (the planner's `logs/` and `probes/`);
  - three lists to check WT with `shasum -a 256 -c`, paths relative to WT:
    - `SHA256SUMS.orig-in-wt`: `90b5079`'s eight files;
    - `SHA256SUMS.red-in-wt`: the three tests from `real/` and the two code files from `orig/`;
    - `SHA256SUMS.real-in-wt`: the five `real/` files.
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above. Git: `/usr/bin/git -C WT <command>`, one git command per call. Focused Node files: `cd WT/apps/app && npm run test:unit -- <files>`. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`.
- No heavy lock is needed: no database suite and no workers pool. Docker is stopped and stays stopped.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. Two exceptions:
  - the counts N and C (Step 1.5), only as Step 1.3 says;
  - a load flake: a case that times out under load in a file this round does not touch. Rerun that file alone once, and record both runs.
- Every log is your own run. Never copy the planner's logs in place of one.

## What this round decides (the planner's calls, with the reason for each)

- **F1. M1's fix is one prop:** `onAccessibilityTap={onPress}` on `WalletCard`'s `Pressable`, with two header sentences saying why. The planner read React Native 0.88's sources in `node_modules`:
  - **iOS:** `accessibilityActivate` then dispatches `onAccessibilityTap` and answers YES (`React/Fabric/Mounting/ComponentViews/View/RCTViewComponentView.mm:1673-1680`). So UIKit synthesizes no tap, and VoiceOver's double tap runs the card's own press once.
  - **Android:** nothing under `ReactAndroid` mentions the prop: 0 of its files, including the 746 Kotlin and Java files under `src/main`, with `ReactAccessibilityDelegate.kt` among them. So TalkBack's double tap stays the node's one click, and no second press is added.
  - **`Pressable`** keeps the prop in its rest props and hands it to its `View` (`Libraries/Components/Pressable/Pressable.js:238`, `:274`, `:360`). `ViewPropTypes.js:51` declares it.
  - **react-native-web 0.21.4** drops it, so the web is unchanged and logs nothing. P2-T11's `WalletCard.render.test.tsx` (9 of 9) and the catalogue's wallet sections (22) pass.
- **F2. M1's pins.**
  - **The Node pin:** in `cardNativeProps.test.ts`, P2-T11's review's ready case taken as the review wrote it (the `accessible` pin, n3 there), plus M1's case reading the `Pressable`'s props from the source (R72's trap). followups.md gave the ready case to P2-T21 and P2-T22; the pin is now in place, and the card's web role stays their decision.
  - **A render case** calls what iOS calls. The test file records each `Pressable`'s props (`vi.mock('react-native')`, wrapping `Pressable` only and passing every other export through). The case checks that a VoiceOver double tap on a card behind the front one runs the same press as a touch (P6: the tick, the lift on the gentle spring, and that card's own `onOpen` at once), once, and nothing more when the lift settles.
- **F3. n2's fix needs two lines, not one.** `frames.delete(view)` in `forget()` alone, as the review proposed, still answers the review's FP4 sequence with (2, 2). An answer that lands while the view is away is stored again after the delete. So `forget()` deletes the view's frame, and `measureView` drops an answer whose view is no longer the one registered under its wallet id.
  - Then a view that comes back (React shows a hidden subtree again with the same views) answers only what is measured after it is back.
  - N2a (no delete) and N2b (no drop) each fail the new case.
  - On a phone `measureInWindow` answers at once, so nothing lands late there; this is the web's case.
- **F4. Where the pins sit.** Each is an assertion in the case its rule belongs to, plus three new cases at the end of `CardStack.render.test.tsx` (12 cases before, 15 after):
  - m3: a lone card shows today's line (S1, L10), and a card behind the front one says and draws its pending total (S7, L1);
  - m4: one open per press after the lift settles (S4, MF7);
  - n4:
    - a second layout measures again (S10, MF9);
    - a render that changes nothing measures nothing again, counted per card view (S10, MF4);
    - `frameOf` is read as is in S10 and S11, so an `undefined` is no null (MF6);
  - n3:
    - the new case "a new order keeps each card its own frame, in the stack and in the list" (L3, and the stack's L2);
    - L4's pin in `cardStackNative.test.ts`, the Node check that reads `CardStack.tsx`. M1's pin sits with `WalletCard.tsx`'s;
  - n2 and MF6: the new registry case, which drives a card's ref by hand with views whose measurements land when it says (the review's FP4, as an assertion).
- **F5. RED for every new pin, on an assertion.**
  - M1's two pins and n2's case are RED on `90b5079`'s code itself.
  - The other pins guard code that is already right. Their RED is the review's eight survivors (L1, L10, MF7, L3, L4, MF9, MF6, MF4):
    - on `90b5079` with its own tests, all eight survive (`PL/logs/before-pins.out`);
    - on `90b5079`'s code with this round's tests, each fails its own pin on one assertion (Step 2.5). The two cases that are RED there anyway are left out by name, so no kill comes from them.
- **F6. The mutants: 73, all killed.**
  - The first round's 59, with CF1, CF6 and CF7 re-aimed where `cardFrames.tsx`'s lines moved.
  - Plus 14 new: M1 (the render case), M1n (the Node pin), M1b (a double tap that presses twice), RM4 (P2-T11's review's mutant on the card's `accessible`), L1, L10, MF7, L3, L4, MF9, MF6, MF4, N2a and N2b.
  - The only kills that are not assertions are the first round's two: CS20b (Reanimated's web build throws for a missing dependency array, R72) and CF8 (outside a provider the stack destructures from null).
- **F7. Carried elsewhere; the controller records them:** m1 (a card behind the front one that grows past it) to P2-T24 with E2-A's peek decision; m2 (stale frames after a reorder of the same count) to P2-T17; n1 (two quick presses) to P2-T24. The receipt's P2-T17 note now says to call `measure()` before every flight (Step 6).
- **F8. Clear of the work in flight.** tray-hardening (PR #392, now `99ce506`) shares no file with this round. `prove.sh compat-tray` laid its three files from the PR's branch over the GREEN copy:
  - typecheck exit 0;
  - Node 8 of 8;
  - render 42 of 42: this file's 15 and its `Tray.render.test.tsx`'s 27.
- **F9. A device check stays SKIPPED** until someone runs it: with VoiceOver on an iPhone, a double tap on each card behind the front one opens its own wallet. The Simulator has no VoiceOver.

## Step 1: Sync and check the base

1. `/usr/bin/git -C WT status --short` prints nothing, and `/usr/bin/git -C WT rev-parse --short HEAD` prints `90b5079`. Otherwise report BLOCKED.
2. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: a clean merge of controller files, or "Already up to date." (since `dbfde7d`, `90b5079`'s base, the head has changed only files under `.claude/`). Any conflict: BLOCKED. Then `/usr/bin/git -C WT rev-parse --short HEAD`, and record it.
3. `/usr/bin/git -C WT diff --stat 90b5079 HEAD -- apps packages package.json package-lock.json`. Expected: no output.
   - If it lists only tray-hardening's three files (`apps/app/src/wallet/tray/Tray.tsx`, `Tray.render.test.tsx`, `trayGesture.test.ts`; PR #392 merged meanwhile), go on. N is then what you measure in Step 1.5 (49 if its test has 27 cases), and the receipt names the merge.
   - Anything else: BLOCKED with the output.
4. `cd WT && shasum -a 256 -c PL/SHA256SUMS.orig-in-wt` (type the full paths). Expected: eight `OK` lines, exit 0. And `ls WT/apps/app/src/wallet/card/cardNativeProps.test.ts` says "No such file or directory".
5. The base:
   - Only if `WT/node_modules` is missing: `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?`. Expected: 0 and "added 1416 packages".
   - `cd WT && npm run typecheck:app > S/base-typecheck.log 2>&1; echo $?`. Expected: 0.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/card/CardStack.render.test.tsx src/wallet/card/WalletCard.render.test.tsx > S/base-focused.log 2>&1; echo $?`. Expected: 0, `Tests  21 passed (21)` (12 and 9).
   - The neighbours: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx > S/base-neighbours.log 2>&1; echo $?`. Expected: 0, `Tests  38 passed (38)` (9, 16 and 13). Call this count N.
   - The catalogue's wallet sections: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-" > S/base-catalogue.log 2>&1; echo $?`. Expected: 0, `Tests  22 passed` (11 wallet sections in two suites). Call this count C, and ignore the `skipped` count.

   Compare with `PL/logs/base-*.log`.

## Step 2: The tests first, and RED on `90b5079`'s code

1. Copy the three test files:
   ```bash
   cp PL/real/apps/app/src/wallet/card/CardStack.render.test.tsx WT/apps/app/src/wallet/card/CardStack.render.test.tsx
   cp PL/real/apps/app/src/wallet/card/cardStackNative.test.ts WT/apps/app/src/wallet/card/cardStackNative.test.ts
   cp PL/real/apps/app/src/wallet/card/cardNativeProps.test.ts WT/apps/app/src/wallet/card/cardNativeProps.test.ts
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.red-in-wt`. Expected: five `OK` lines.
2. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: 0.
3. `cd WT/apps/app && npm run test:unit -- src/wallet/card/cardNativeProps.test.ts src/wallet/card/cardStackNative.test.ts > S/red-unit.log 2>&1; echo $?`. Expected:
   - exit 1, `ℹ tests 4`, `ℹ pass 3`, `ℹ fail 1`;
   - the one failure is `VoiceOver's double tap runs the card's own press, never a tap at the card's middle`, on `AssertionError [ERR_ASSERTION]: The input did not match the regular expression /<Pressable accessibilityRole="button" ...`.
4. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/card/CardStack.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected:
   - exit 1, `Tests  2 failed | 13 passed (15)`;
   - `grep -c '^AssertionError' S/red-render.log` gives 2;
   - `grep -cE 'Cannot find module|Failed to resolve|TestingLibraryElementError' S/red-render.log` gives 0.

   The two, each failing first on:
   - `a VoiceOver double tap on a card behind the front one runs that card's own press, once (M1)`: `expected [ 'undefined', 'undefined', …(2) ] to deeply equal [ 'function', 'function', …(2) ]`
   - `a view that comes back answers only what is measured after it is back, and frameOf is exactly null until then`: `expected [ 3, { x: 2, y: 2, width: 100, …(1) } ] to deeply equal [ 3, null ]` (the stale answer of the review's FP4)

   The other 13 pass: the review found their code right (F5).
5. The pins that guard code which is already right: the review's eight survivors, each now killed by its own pin on `90b5079`'s code. The two cases of Step 2.4 are left out by name (`RENDER_T`, a test-name pattern that `mutants.py` passes to vitest as `-t`). Type it on one line:
   ```bash
   RENDER_T='^(?!.*(?:VoiceOver double tap|a view that comes back)).*$' python3 -I PL/tools/mutants.py WT S/red-pins-logs L1 L10 MF7 L3 L4 MF9 MF6 MF4 > S/red-pins.out 2>&1; echo $?
   ```
   Expected: exit 0, and these 9 lines. Each mutant fails one case, its pin, on one assertion; L4 fails the Node check. Compare with `PL/logs/red-pins.out`. The same eight survive on `90b5079` with its own tests (`PL/logs/before-pins.out`).
   ```
{{lines:red-pins.out}}
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.red-in-wt` again: five `OK` lines. The runner puts each file back.

## Step 3: GREEN

1. Copy the code:
   ```bash
   cp PL/real/apps/app/src/wallet/card/WalletCard.tsx WT/apps/app/src/wallet/card/WalletCard.tsx
   cp PL/real/apps/app/src/wallet/card/cardFrames.tsx WT/apps/app/src/wallet/card/cardFrames.tsx
   ```
2. `cd WT && shasum -a 256 -c PL/SHA256SUMS.real-in-wt`. Expected: five `OK` lines. Then `/usr/bin/git -C WT status --short`, which shows exactly these five lines:
   ```
    M apps/app/src/wallet/card/CardStack.render.test.tsx
    M apps/app/src/wallet/card/WalletCard.tsx
    M apps/app/src/wallet/card/cardFrames.tsx
    M apps/app/src/wallet/card/cardStackNative.test.ts
   ?? apps/app/src/wallet/card/cardNativeProps.test.ts
   ```
   The diffs are in the appendix.
3. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: 0.
4. `cd WT/apps/app && npm run test:unit -- src/wallet/card/cardNativeProps.test.ts src/wallet/card/cardStackNative.test.ts > S/green-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 4`, `ℹ pass 4`, `ℹ fail 0`.
5. The command of Step 1.5's focused line, into `S/green-focused.log`, with `--reporter=verbose`. Expected:
   - exit 0, `Tests  24 passed (24)` (CardStack 15, WalletCard 9), each case marked `✓`;
   - the stderr holds only the base's notices: Vite's config-loader notice, two `expo-status-bar` sourcemap notices and Node's `localStorage` warning. No `act(...)` warning and no `console.error`.
6. The neighbours, Step 1.5's command, into `S/green-neighbours.log`: exit 0, `Tests  N passed (N)`.
7. The catalogue, Step 1.5's command, into `S/green-catalogue.log`: exit 0, `Tests  C passed`, unchanged. The wallet sections draw `WalletCard`, and the new prop changes nothing on the web.

## Step 4: Mutation check

1. `python3 -I PL/tools/mutants.py WT S/mutant-logs > S/mutants.out 2>&1; echo $?` (full paths).
   - It applies each mutant alone and runs its test file: `CardStack.render.test.tsx`, or one of the two Node checks.
   - It restores each file with its SHA-256 checked.
   - It takes about two and a half minutes for the planner, at a load average near 8.
   - Expected: exit 0, and these 74 lines: one per mutant, each ending "restored sha256 equal", then the tally. Compare with `PL/logs/mutants.out`.
   ```
{{lines:mutants.out}}
   ```
   The first 59 are the first round's (CS, CF, SC and RM5); the last 14 are this round's. Every kill is an assertion in the case named, except CS20b (every case fails on Reanimated's own error for a missing dependency array, R72) and CF8 (a `TypeError`: outside a provider the stack destructures `measure` from null), as in the first round.
2. `cd WT && shasum -a 256 -c PL/SHA256SUMS.real-in-wt`, and `/usr/bin/git -C WT status --short`. Expected: unchanged from Step 3.2.

## Step 5: The fast local gate (R100)

From WT, in this order, each with its log in S:

1. `npm run typecheck:app`: exit 0.
2. `npm run test:unit`: exit 0 and `ℹ fail 0`. (R100: no total is checked; record what it prints.)
3. `npm run test:app`: exit 0 and `ℹ fail 0`.
4. The focused files once more:
   - `cd WT/apps/app && npm run test:unit -- src/wallet/card/cardNativeProps.test.ts src/wallet/card/cardStackNative.test.ts`: 4 of 4;
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/card/CardStack.render.test.tsx src/wallet/card/WalletCard.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx`: `Test Files  5 passed (5)`, `Tests  N+24 passed (N+24)` (62 at the planner's base).
5. The catalogue's wallet sections: Step 1.5's command: exit 0, `Tests  C passed`.
6. `/usr/bin/git -C WT diff --check` before the commit, and `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD` after it: no output.

Not run here, and why (put this in the receipt):
- In CI on the PR once billing is fixed (R100): the full render suite, `export:web`, the iOS export, `test:ops` and the database suites. No route, config, app entry, package or lockfile changes.
- Not needed: the API and edge suites, since nothing outside `apps/app` changes.
- SKIPPED: the device check of F9, and the first round's device checks.

## Step 6: Receipt

Edit `WT/docs/implementation/receipts/P2-T12.md` in its own style. Change only the two places below.

1. In "Notes for later tasks", the P2-T17 line: replace exactly `Call \`measure()\` before a flight: a frame does not follow Home's scroll.` with:
   ```
   Call `measure()` before every flight: a frame does not follow a reorder of the same number of wallets, a swapped wallet, an ancestor that moves, or Home's scroll (review m2). On a phone `frameOf` is fresh right after the call; on the web, after a `setTimeout` of 0.
   ```
2. At the end of the file, add a section `## Fix round (review M1, m3, m4, n2, n3 and n4)`, with your own numbers where they differ from these. Use these bold-labelled bullets:
   - **Status:** the review's verdict (Needs fixes, M1 major), the commit it reviewed (`90b5079`), this round's merge commit from Step 1.2 and the head you built on. The controller's leave to edit `WalletCard.tsx`. Not pushed.
   - **Files:**
     - modified `apps/app/src/wallet/card/WalletCard.tsx` (one prop and the header's two sentences), `cardFrames.tsx` (n2), `CardStack.render.test.tsx` (12 cases before, 15 after) and `cardStackNative.test.ts` (1 case before, 2 after);
     - created `cardNativeProps.test.ts` (2 cases: P2-T11's review's ready case and M1's pin);
     - this receipt.
   - **M1:** what VoiceOver did (the review's M1) and the fix (F1: iOS answers YES and synthesizes no tap; Android never reads the prop; the web drops it). Its two pins (F2).
   - **The pins:** m3, m4, n3 and n4, each with where it sits and the mutant it kills (F4); n2's two-line fix and why one line was not enough (F3).
   - **RED to GREEN:**
     - RED (Step 2): Node 1 of 4 failing and render 2 of 15, each on an assertion, with the messages; the eight survivors killed by their pins (Step 2.5).
     - GREEN (Step 3): Node 4 of 4; CardStack 15 and WalletCard 9; the neighbours N; the catalogue C.
   - **Mutation check:** 73, all killed, with the line counts by group (the first round's 59 and this round's 14). The two kills that are not assertions (CS20b, CF8).
   - **Gate:** every command of Step 5 with its result, and no whole-suite totals.
   - **Carried elsewhere:** m1 to P2-T24 with E2-A's peek decision; m2 to P2-T17 (the note above); n1 to P2-T24 (F7).
   - **SKIPPED and CI:** as Step 5 says, and F9's device check.
   - **Notes for later tasks:**
     - P2-T21 and P2-T22: `cardNativeProps.test.ts` now pins `accessible` on a card with no `onPress` (P2-T11's review's n3); the card's web role is still theirs to decide.
     - P2-T24: Home's web tests cannot see M1; rely on `cardNativeProps.test.ts` and the device check.

## Step 7: Commit

1. `/usr/bin/git -C WT add apps/app/src/wallet/card/WalletCard.tsx apps/app/src/wallet/card/cardFrames.tsx apps/app/src/wallet/card/CardStack.render.test.tsx apps/app/src/wallet/card/cardStackNative.test.ts apps/app/src/wallet/card/cardNativeProps.test.ts docs/implementation/receipts/P2-T12.md`
2. `/usr/bin/git -C WT status --short`: those six files staged (`A` for `cardNativeProps.test.ts`, `M` for the other five), nothing else.
3. Write the message to `S/commit-message.txt`:
   ```
   Let VoiceOver open each card of the stack, and pin what the review found loose

   A VoiceOver double tap on a card behind the front one tapped the middle
   of its box, which lies under the next card, so the wrong wallet opened.
   The card's button now runs its own press for VoiceOver
   (onAccessibilityTap), pinned from the source since react-native-web
   drops it. A card view that comes back to the frames answers only what
   is measured after it is back. Pin the review's other gaps: pending
   totals behind the front card, a lone card's today line, one open per
   press, the list's keys, the stack out of the accessibility tree, frames
   measured after each layout but not on a re-render, and frameOf's exact
   null.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-message.txt`, then `/usr/bin/git -C WT log --oneline -2` and `/usr/bin/git -C WT show --stat HEAD`: 6 files. `/usr/bin/git -C WT status --short` prints nothing. Do not push.

## Your final message

As the protocol says:
- `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker) on the first line;
- the merge and fix commit SHAs, and the files changed;
- RED: Node 1 of 4 and render 2 of 15 failing on assertions, and the eight survivors killed by their pins;
- GREEN: the counts;
- mutants: 73, all killed;
- each gate command with its result, and no whole-suite totals;
- SKIPPED and CI items.

Name what the reviewer should look at first:
- `WalletCard.tsx`'s one prop and its pins (F1, F2);
- `cardFrames.tsx`'s two-line n2 fix (F3);
- the `react-native` mock in `CardStack.render.test.tsx`, which wraps `Pressable` only.

---

## Appendix: the diffs

Each block is the kit's diff, byte for byte. Copy from `PL/real/`, not from here.

`apps/app/src/wallet/card/WalletCard.tsx`:

{{diff:apps_app_src_wallet_card_WalletCard.tsx.diff}}

`apps/app/src/wallet/card/cardFrames.tsx`:

{{diff:apps_app_src_wallet_card_cardFrames.tsx.diff}}

`apps/app/src/wallet/card/cardNativeProps.test.ts` (new):

{{diff:apps_app_src_wallet_card_cardNativeProps.test.ts.diff}}

The same file against P2-T11's review's ready case (`PL/ready/`):

{{diff:cardNativeProps.test.ts.from-ready-case.diff}}

`apps/app/src/wallet/card/cardStackNative.test.ts`:

{{diff:apps_app_src_wallet_card_cardStackNative.test.ts.diff}}

`apps/app/src/wallet/card/CardStack.render.test.tsx`:

{{diff:apps_app_src_wallet_card_CardStack.render.test.tsx.diff}}

# Brief P2-T15 fix round: none of Bun's sentence in private mode, Next by the cards' rule, the reviews' pins, and lazy step sections

You are the fixer for the P2-T15 fix round. PR #427 (branch `p2/t15-transfer-confirm-pick`, head `fd41909c`) adds the add tray's transfer, confirm and pick steps. CI is green, but both reviews say **Needs fixes**:
- `reviews/P2-T15.md` (Opus): one major (M1), three minors (m1 to m3) and four nits (n1 to n4);
- `reviews/P2-T15-second.md` (Sonnet, money and privacy): one major (M1, the same as the first's), two minors (m1, the same as the first's; m2, five mutation survivors) and two nits (n1, n2).

The controller ruled **R114** on both (quoted in the rulings below). The planner wrote every file below and proved it in a scratch copy of `fd41909c`:
- RED on the round's tests with one typed stub: 4 of 17 render cases fail and 1 of 15 Node cases, each on an assertion;
- GREEN;
- 120 mutants, all killed;
- R100's fast local gate, with the eight kit render files, `test:unit` and the four routes tests.

You copy the planner's files, check them by checksum, prove RED, GREEN and the mutants in the worktree, run the gate, write the round's receipt and commit. Do exactly what this brief says.

Read first:
1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only, and no whole-suite total as an expected value anywhere. R87 applies: the round's receipt is its own new file, `docs/implementation/receipts/P2-T15-fix.md`; `P2-T15.md` takes the planner's correction (Step 3); do not edit `premium-progress.md`.
2. The reviews: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T15.md` and `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T15-second.md`.
3. The first round's brief, `/Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/P2-T15.md`. Its rulings P1 to P19 stand, except where this brief's P20 to P33 change them.

## Paths and rules

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t15` (branch `p2/t15-transfer-confirm-pick`, head `fd41909c`). Work only here. Do not merge the integration branch into it: the controller merges up (P20).
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t15-fix`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t15-fix-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the round's nine files at their repo paths: seven changed and two new (your receipt, `P2-T15-fix.md`, is yours to write);
  - `stubs/`: the RED form of `apps/app/src/wallet/add/TransferStep.tsx` (`fd41909c`'s, with `TransferFooter` taking the round's `wallets` prop, optional and unread, P27);
  - `orig/`: `fd41909c`'s seven files that the round changes;
  - `diffs/`: one diff per changed file, `orig/` to `real/`, with paths `a/<repo path>` and `b/<repo path>` and full blob ids (the Appendix prints them);
  - `tools/`: `stage.sh` (the planner's stages: base, RED, GREEN), `focused.sh` (the focused set), `gate.sh` (the planner's GREEN runs and gate in one), `mutants.py` (the runner), `name_diffs.py`, `sums.sh`, `fill_brief.py` and `brief.template.md` (how this brief was built: every code block below is the `real/` or `stubs/` file or a `diffs/` file, byte for byte, and the mutant lines are `logs/mutants.out`);
  - `SHA256SUMS` (the kit; check from PL) and `SHA256SUMS.logs` (the planner's `logs/`: `base-*`, `red-*`, `green-*`, `gate-*`, `mutants.out`, `mutant-logs/`, `applycheck.log`, `dev-*`);
  - three lists to check WT with `shasum -a 256 -c`, paths relative to WT:
    - `SHA256SUMS.orig-in-wt`: the seven files as `fd41909c` has them;
    - `SHA256SUMS.red-in-wt`: the four files RED writes (the two tests and the copy from `real/`, the stub);
    - `SHA256SUMS.real-in-wt`: the round's nine files in their final form.
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above. Git: `/usr/bin/git -C WT <command>`, one git command per call. Focused Node files: `cd WT/apps/app && npm run test:unit -- <files>`. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`.
- No heavy lock is needed: no database suite and no workers pool. Docker is stopped and stays stopped.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. One exception, a load flake: a case that times out under load in a file this round does not touch. Rerun that file alone once, and record both runs.
- Every log is your own run. Never copy the planner's logs in place of one.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/wallet/add/ConfirmStep.tsx` | In private mode the Bun line quotes nothing: `add.bunReadHidden` in place of the sentence; the mask (`NUMBER`) is removed (P21). 187 lines before, 188 after. |
| `apps/app/src/wallet/add/TransferStep.tsx` | One rule, `inUse`, for the cards and Next; `TransferFooter` takes `wallets` (P22, P23). 261 before, 276 after. |
| `apps/app/src/wallet/add/PickSteps.tsx` | `DatePick` opens a draft dated after today on today; the radio's dot gets the test id `pick-wallet-dot` (P25). 288 before, 289 after. |
| `apps/app/src/wallet/add/copy.ts` | One draft line, `add.bunReadHidden` (P21). 48 before, 50 after. |
| `apps/app/src/wallet/add/AddSteps.render.test.tsx` | 17 cases (14 before): three new, eight changed (P26). 662 before, 759 after. |
| `apps/app/src/wallet/add/addStepsNative.test.ts` | **New**, Node (35 lines). 3 source pins: the problem's announcement, the seam's `zIndex`, the lazy sections (P24, P25). |
| `apps/app/src/dev/catalogue/wallet/addSections.tsx` | The four step sections load `addStepsSection.tsx` lazily, with the catalogue's running mark; P2-T14's two are unchanged (P25). 351 before, 208 after. |
| `apps/app/src/dev/catalogue/wallet/addStepsSection.tsx` | **New**, development only (176 lines): the step sections' host (`StepsTray`, default export) and its samples, moved from `addSections.tsx`; `TransferFooter` gets the wallets (P25). |
| `docs/implementation/receipts/P2-T15.md` | The planner's correction: a pointer to the fix round, and the three lines R114 makes untrue (P29). 45 lines before, 46 after. |
| `docs/implementation/receipts/P2-T15-fix.md` | **New**: your receipt (Step 6). |

Not in this round: `addFlow.ts`, `AmountStep.tsx` and the rest of P2-T14's files (read only; the test's probe draws `AmountStep`); `WalletsList.render.test.tsx` (its sections case still reads `bw-tray-pick-category` right before `bw-wallets`); `src/dev/catalogue/wallet/index.ts` and `registry.tsx`; `draftText.test.ts` (the new line holds Thai letters); `en.json`, `th.json`; any route, the app entry, native code, package or lockfile; `premium-progress.md`.

## Planner rulings (what this round decides, with the reason for each)

**R114, the controller's ruling of 12 November**, quoted:
1. M1, both reviews: in private mode, do not draw Bun's sentence at all. Keep the violet line with words that do not quote it (one draft copy line, Thai first). Masking can never keep up with every number form the parser reads: Thai number words, scale words like พัน and k, and whatever it learns later. Add the reviews' number-word rows to the private-mode case, as proof the sentence is gone, not masked. Note for P2-T37 in the receipt: a "no digit" sweep cannot catch number words.
2. m1, both reviews: Next waits while either side's wallet is archived or unknown, exactly as the cards ask. Give `TransferFooter` the wallets, or the `listed` result. Assert Next in the archived case.
3. Pin every survivor and named gap: Opus m2 (`isPickStep`, and the way back from the amount chip's wallet pick); Opus m3 (the three accessibility behaviours); Sonnet m2 (negative balances and after lines keep their minus, M6 and M7; `WalletPick` offline with `balances === null`, M8; the problem's `useAnnouncement`, M14; the confirm wallet row's material, M18). One mutant per new guard.
4. Nits: fix Opus n1 (the trims), n2 (a source pin for the seam's `zIndex`) and n3 (the radio dot); n4: load the steps lazily from the sections (today's rule; `recordSections.tsx` shows how); Sonnet n1 (`DatePick` clamps a draft after today); Sonnet n2: say in a ruling whether `TransferFooter` should look at the amount, and why.

- **P20. The base is `fd41909c`, with no merge.** The dispatch puts the fix commit on top of `fd41909c`. Since this PR's base (`9a7b767e`) the integration branch has merged #420 (P3-T2: contracts, the vault, `diaryRepository.ts`, `resources.ts`, `events.ts`, `app.json`) and controller state, none of it this round's files, and no open branch touches them (the planner read `origin/p2/t21-wallet-edit`, `origin/p2/t29-categories`, `origin/p2/t31-insights` and `origin/p3/t6-haiku-first`). So the commit stays mergeable, and the controller merges up.
- **P21. Private mode draws none of Bun's sentence (R114.1; M1 of both reviews).**
  - `ConfirmStep`: with private mode on, the violet line (`confirm-bun`) reads `add.bunReadHidden`: บันอ่านจากที่คุณบอก, "Bun read this from what you told it" (Thai first; a draft for E2-B, owner Q3's default). Off, it quotes the sentence as before (`add.bunReadFrom`). The first round's mask (`NUMBER`, P8c) is removed with its five mutants (C7 to C11).
  - Why no mask: Tell Bun reads amounts from digits, Thai digits, Thai number words with no spaces (ห้าสิบ, สองพันห้าร้อย), scale words (2 พัน, 1.5k), and the server's model reads more ("Thai number words such as ห้าสิบ mean 50", `apps/edge/src/server/ai/prompts.ts:14`; `quickText.ts` `THAI_UNITS`, `THAI_MULTIPLIERS`). No list keeps up.
  - The proof (the private-mode case): the reviews' thirteen sentences (digits; ฿, 1,250.50 and ๒๐; ห้าสิบ with and without spaces; ร้อยห้าสิบ; สองพันห้าร้อยบาท; สามหมื่น; หนึ่งแสนสองหมื่นบาท; 2 พัน; 1.5k; 50.-; full-width ５０; Arabic-Indic ٥٠), each with the amount masked as a fill: the line is exactly the hidden words, and no word of the sentence is anywhere in the tray (gone, not masked). Then the English sentence "chicken rice fifty baht", in violet, and the catalogue's `bw-tray-confirm-bun` in private mode (the first review's note), with no digit in the tray.
  - The note for P2-T37 (the receipts carry it): a sweep for digits cannot catch an amount written in words; check that Bun's sentence is absent in private mode, not that it has no digit. The first review's other P2-T37 note stands: the title (Bun's merchant) and the note row are the model's text.
- **P22. Next by the cards' rule (R114.2; m1 of both reviews).**
  - One module function in `TransferStep.tsx`, `inUse(wallets, id)`: the side's wallet while it is in use; null for none, an archived wallet or one not listed. The cards read it (as before, through what was `listed`), and so does `TransferFooter`, which now takes `wallets: readonly WalletSnapshot[]` (required): the same wallets as `TransferStep`.
  - Next is enabled only with two different wallets in use. A side whose wallet is archived or unknown keeps Next waiting and says nothing, since its card already asks (เลือกกระเป๋า), as for a side with none. One wallet in use on both sides still says today's words above Next.
  - The case asserts Next for an archived from side (and that a press does nothing) and for an unknown to side; mutant X22 (Next reads the draft's ids, as before the fix) is killed by it.
- **P23. `TransferFooter` does not look at the amount (Sonnet n2).** The amount is the amount step's: its Next waits for `evaluateKeypad(keypad).ok`, and the transfer step has no keys. A Next that also waited for the amount here would leave a person stuck on a step with no way to type one and no word why. Every way in comes after the amount step's Next (P2-T16 enters the transfer step from it, or from a type change made after it), and move all only fills a positive amount within the cap. The save still refuses a zero amount with today's words (`amountProblemOf`). A comment in `TransferFooter` says so, and P2-T16's note says never to enter this step without an amount the keypad can save.
- **P24. The pins (R114.3), each with its case and its mutant:**
  - `isPickStep`: a table (the six picks true; amount, transfer and confirm false), with the first review's three survivors as P36 (no `wallet`), P37 (no `to`) and P38 (`confirm` and `transfer` counted).
  - The amount chip's way back: the probe now draws P2-T14's real `AmountStep` at the amount step (as the first review's PROBE-5 did). Its wallet chip opens the wallet pick, a choice comes back to the amount step (the chip reads จากเงินสด), and so does the tray's back. P36 is killed here too.
  - The accessibility behaviours (the first review's m3): the transfer amount's polite live region (X26) and the day's (P42), read from the DOM; the one-wallet problem's `useAnnouncement`, read from the source (`addStepsNative.test.ts`, as `amountStepNative.test.ts` pins `AmountStep`'s; F8, also the second review's M14).
  - Minus signs (M6, M7): ฿500 from ฿300 leaves −฿200, and a card owing ฿1,240 owes ฿740 after ฿500 comes in, on screen and in words (ติดลบ); X24 and X25.
  - Offline wallet pick (M8): with no balances the pick names each wallet with no amount; P41 (the guard removed) is killed by the crash it causes, offline.
  - The confirm wallet row's material (M18): a spending draft whose wallet differs from the move's from wallet draws its own; C31.
- **P25. The nits (R114.4).**
  - n1, the trims: a merchant of spaces gives way to the note, and a note of spaces to the category (C32, C33).
  - n2, the seam's `zIndex`: a source pin (`addStepsNative.test.ts`), since happy-dom paints nothing (X23).
  - n3, the radio dot: the chosen wallet's dot carries the test id `pick-wallet-dot`; the pick case asserts it is on the chosen radio only (P40).
  - Sonnet n1: `DatePick` opens a draft dated after today on today (it already held a draft before `earliest` at the start); P39. No add path makes such a draft, so this is symmetry.
  - n4, lazy sections: `addSections.tsx` keeps P2-T14's two sections as they are and lists the four step sections, each rendering `<Suspense fallback={<View testID="catalogue-screen-running" ... />}>` around a `lazy(() => import('./addStepsSection'))` component, as `recordSections.tsx` loads its screen. `addStepsSection.tsx` holds what was `StepsTray` and its samples, moved unchanged but for its own sample lines (`sample.open`, `sample.wallet`), its own `WALLET_ID`, the `StepStart` type (exported, imported by `addSections.tsx` as a type only), the default export, and `TransferFooter`'s `wallets`. The catalogue's every-section, screen-reader and large-text suites wait while `catalogue-screen-running` shows, so the four sections still pass in both suites (60 at the base and after). A source pin holds that the list loads the steps lazily, never imports them, and shows the running mark (S8, S9).
- **P26. The test file, 17 cases.** New: the minus signs (P24); `isPickStep` and the amount chip's way back (P24); the two live regions (P24). Changed: confirm (the entry's own wallet's material, M18); the transfer (the offline wallet pick, M8); a pick returns (the radio dot, n3); the date (a draft after today); one wallet on both sides (Next for an archived and an unknown side, P22); private mode (P21); confirm for a move and income (the trims, n1); the sections (each opened with `openSection`, which waits for the lazy load). The probe passes `wallets` to `TransferFooter` and draws `AmountStep` at the amount step.
- **P27. RED.** One typed stub: `fd41909c`'s `TransferStep.tsx` with `TransferFooter` taking `wallets` as an optional, unread prop, so the test and `fd41909c`'s `addSections.tsx` both typecheck. Every other file is `fd41909c`'s, but the two tests and the copy (data). So RED is the reviewed code under the round's tests: the four cases whose behaviour this round changes fail, each on an assertion (the radio dot, a draft after today, Next for an archived side, the sentence in private mode), and so does the source pin for the lazy sections. The other thirteen render cases pass at RED, among them the new pins: they hold behaviour that is right today, and their mutants prove them (Step 4).
- **P28. 120 mutants, all killed.** The first round's 104, less C7 to C11 (retired with the mask), are rerun on the new code, and 21 new ones cover each new guard and pin: X22 to X26, F8, C29 to C33, P36 to P42, K7, S8 and S9. Four run against the Node pins (X23, F8, S8 and S9); the rest against the render file. Every kill but one is an `AssertionError`: P41 (the offline guard removed) dies of the crash it causes, `TypeError: Cannot read properties of null (reading 'get')` in the offline wallet pick, which is the failure the second review's M8 named. None survives, and none is marked equivalent.
- **P29. The receipts (R87).** `P2-T15.md` gains one line pointing to this round, and three of its lines that R114 makes untrue are corrected (the private-mode bullet, the deviation P8c and the P2-T37 note); the planner wrote that file (`real/`), and you copy it in Step 3. Your receipt, `P2-T15-fix.md`, is new (Step 6).
- **P30. The gate (R100).** `typecheck:app`; RED to GREEN on the two test files; P2-T3's draft check and P2-T14's Node files; the eight kit render files that list the wallet's sections (each named); the catalogue's wallet sections in the every-section and screen-reader suites (`-t "bw-"`) and the registry rule; the four routes tests and the catalogue's route test (each named); `test:app`; `test:unit`; `git diff --check`. No route, config, app entry or package changes, so no `typecheck:routes`, `export:web`, iOS export or `test:ops` locally; CI runs the full render suite and the exports.
- **P31. For E2-B,** add to the first round's P17: in private mode the confirm step's violet line says บันอ่านจากที่คุณบอก (a Thai draft; the English is a draft too).
- **P32. Notes for later tasks** (your receipt carries them):
  - **P2-T16 (the host):** pass `wallets` to `TransferFooter`, the same as `TransferStep`'s; never enter the transfer step without an amount the keypad can save (P23); `bunSentence` is the text the person told Bun (null for a slip), and in private mode the step draws none of it, so the host needs no masking; Tell Bun's own sheet draws the typed sentence and its draft's amount with no private-mode masking (the second review's note), so decide whether the sheet masks too; the merchant typed for income stays in the draft across a type change (the first review's note).
  - **P2-T37 (the sweep):** P21's note: absence, not digits, for Bun's sentence; the title and the note row are the model's text.
  - **P2-T27 (the edit tray):** a record keeps an archived wallet it already references (the vault's `newlyReferenced`), but the cards and Next treat it as none (P22); decide what the edit tray does.
  - **Device check (SKIPPED):** with the swap on the seam, the button's whole 44 pt takes the tap, including the 11 pt over each card (the first review's note).
- **P33. Commit summary:** `Hide Bun's sentence in private mode and gate Next by the cards` (a plain imperative line).

## Step 1: Check the start, and the base

1. `/usr/bin/git -C WT status --short` prints nothing, and `/usr/bin/git -C WT rev-parse --short HEAD` prints `fd41909c`. Otherwise report BLOCKED.
2. `cd WT && shasum -a 256 -c PL/SHA256SUMS.orig-in-wt` (type full paths). Expected: 7 `OK` lines, exit 0. And `ls WT/apps/app/src/wallet/add/addStepsNative.test.ts WT/apps/app/src/dev/catalogue/wallet/addStepsSection.tsx WT/docs/implementation/receipts/P2-T15-fix.md` says "No such file or directory" three times.
3. Only if `WT/node_modules` is missing: `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?`. Expected: 0, "added 1416 packages".
4. `cd WT && npm run typecheck:app > S/base-typecheck.log 2>&1; echo $?`. Expected: 0.
5. `sh PL/tools/focused.sh WT S/base > S/base-focused.out 2>&1; cat S/base-focused.out`. Expected: `unit exit 0`, `neighbours exit 0`, `catalogue exit 0`, `registry exit 0`, `routes exit 0`, and:
   - `S/base-unit.log`: `ℹ tests 12`, `ℹ pass 12` (`addFlow.test.ts` 7, `amountStepNative.test.ts` 1, `draftText.test.ts` 4; `addStepsNative.test.ts` is not there yet);
   - `S/base-neighbours.log`: `Test Files  8 passed (8)`, `Tests  138 passed (138)` (`AmountStep` 15, `WalletsList` 12, `Tray` 27, `CardStack` 15, `Lock` 38, `WalletLooks` 13, `PrivateMode` 9, `walletHarness` 9);
   - `S/base-catalogue.log`: `Tests  60 passed` (thirty wallet sections, two suites; ignore the skipped count);
   - `S/base-registry.log`: `Tests  1 passed`;
   - `S/base-routes.log`: `Test Files  5 passed (5)`, `Tests  15 passed (15)` (`SpendRoutes` 3, `AccountRoutes` 2, `InsightsRoutes` 3, `PlanningRoutes` 4, `catalogueRoute` 3).

   Compare with `PL/logs/base-*.log`.

## Step 2: The tests first, and RED on the typed stub

1. Copy the two tests, the copy and the stub:
   ```bash
   cp PL/real/apps/app/src/wallet/add/AddSteps.render.test.tsx WT/apps/app/src/wallet/add/AddSteps.render.test.tsx
   cp PL/real/apps/app/src/wallet/add/addStepsNative.test.ts WT/apps/app/src/wallet/add/addStepsNative.test.ts
   cp PL/real/apps/app/src/wallet/add/copy.ts WT/apps/app/src/wallet/add/copy.ts
   cp PL/stubs/apps/app/src/wallet/add/TransferStep.tsx WT/apps/app/src/wallet/add/TransferStep.tsx
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.red-in-wt`. Expected: four `OK` lines, exit 0.
2. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: 0.
3. `cd WT/apps/app && npm run test:unit -- src/wallet/add/addFlow.test.ts src/wallet/add/amountStepNative.test.ts src/wallet/add/addStepsNative.test.ts src/wallet/copy/draftText.test.ts > S/red-unit.log 2>&1; echo $?`. Expected:
   - exit 1, `ℹ tests 15`, `ℹ pass 14`, `ℹ fail 1`;
   - the failing test, on an `AssertionError [ERR_ASSERTION]`: `the wallet's section list loads the steps lazily, never imports them, and reads the catalogue's running mark while they load`.
4. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/add/AddSteps.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected:
   - exit 1, `Test Files  1 failed (1)`, `Tests  4 failed | 13 passed (17)`;
   - `grep -c '^AssertionError' S/red-render.log` gives 4;
   - `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function|TestingLibraryElementError|TypeError|ReferenceError' S/red-render.log` gives 0, and no "Unhandled" section.

   The four failing cases, each on an assertion:
   - `a pick returns to confirm with the choice`: `expected [ false, false, false ] to deeply equal [ true, false, false ]`
   - `the date cannot pass today or go before the wallet's start`: `expected [ 'ศุกร์ 30 ต.ค.', 'true' ] to deeply equal [ 'วันนี้', 'true' ]`
   - `the same wallet on both sides says so and Next waits; with two wallets Next goes to confirm`: `th: expected [ Array(4) ] to deeply equal [ Array(4) ]`
   - `private mode hides every balance, after line and move all and a fill on the amount line, and draws none of what the person told Bun; a typed amount shows`: `ข้าวมันไก่ 50: expected [ '฿••••', 'ซ่อนยอดเงินอยู่', …(1) ] to deeply equal [ '฿••••', 'ซ่อนยอดเงินอยู่', …(1) ]`

   Compare with `PL/logs/red-unit.log` and `PL/logs/red-render.log`.

## Step 3: GREEN

1. Copy the code, the new section host and the corrected first receipt:
   ```bash
   cp PL/real/apps/app/src/wallet/add/ConfirmStep.tsx WT/apps/app/src/wallet/add/ConfirmStep.tsx
   cp PL/real/apps/app/src/wallet/add/TransferStep.tsx WT/apps/app/src/wallet/add/TransferStep.tsx
   cp PL/real/apps/app/src/wallet/add/PickSteps.tsx WT/apps/app/src/wallet/add/PickSteps.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/addSections.tsx WT/apps/app/src/dev/catalogue/wallet/addSections.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/addStepsSection.tsx WT/apps/app/src/dev/catalogue/wallet/addStepsSection.tsx
   cp PL/real/docs/implementation/receipts/P2-T15.md WT/docs/implementation/receipts/P2-T15.md
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.real-in-wt`. Expected: nine `OK` lines, exit 0.
   Then `/usr/bin/git -C WT status --short`. Expected, exactly: ` M apps/app/src/dev/catalogue/wallet/addSections.tsx`, ` M apps/app/src/wallet/add/AddSteps.render.test.tsx`, ` M apps/app/src/wallet/add/ConfirmStep.tsx`, ` M apps/app/src/wallet/add/PickSteps.tsx`, ` M apps/app/src/wallet/add/TransferStep.tsx`, ` M apps/app/src/wallet/add/copy.ts`, ` M docs/implementation/receipts/P2-T15.md`, `?? apps/app/src/dev/catalogue/wallet/addStepsSection.tsx` and `?? apps/app/src/wallet/add/addStepsNative.test.ts`.
2. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: 0.
3. `cd WT/apps/app && npm run test:unit -- src/wallet/add/addFlow.test.ts src/wallet/add/amountStepNative.test.ts src/wallet/add/addStepsNative.test.ts src/wallet/copy/draftText.test.ts > S/green-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 15`, `ℹ pass 15`, `ℹ fail 0`.
4. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/add/AddSteps.render.test.tsx > S/green-render.log 2>&1; echo $?`. Expected: 0, `Test Files  1 passed (1)`, `Tests  17 passed (17)`, each case marked `✓`, and `grep -c '^stderr |' S/green-render.log` gives 0.
5. `sh PL/tools/focused.sh WT S/green > S/green-focused.out 2>&1; cat S/green-focused.out`. Expected: five exits 0, and:
   - `S/green-unit.log`: `ℹ tests 15`, `ℹ pass 15`;
   - `S/green-neighbours.log`: `Tests  138 passed (138)`, unchanged;
   - `S/green-catalogue.log`: `Tests  60 passed`, unchanged, with each of `bw-tray-transfer`, `bw-tray-confirm`, `bw-tray-confirm-bun` and `bw-tray-pick-category` marked `✓` in both suites (`grep -cE "✓.*bw-tray-(transfer|confirm|pick)" S/green-catalogue.log` gives 8);
   - `S/green-registry.log`: `Tests  1 passed`;
   - `S/green-routes.log`: `Tests  15 passed (15)`, unchanged.

   Compare with `PL/logs/green-*.log`.

## Step 4: Mutation check

1. `python3 -I PL/tools/mutants.py WT S/mutant-logs > S/mutants.out 2>&1; echo $?`. It applies each mutant alone, runs its suite (the render file, or the Node pins for X23, F8, S8 and S9), and restores the file with its SHA-256 checked. It takes twenty to forty minutes, by the machine's load. Expected: exit 0, and these 121 lines (each line in your file also gives the file and suite, the suite's counts, the AssertionError count and "restored sha256 equal"; compare with `PL/logs/mutants.out`):
   ```
X1 KILLED: the balances stay where they were when the step opened, so a swap moves only the names (the plan's mutant) -> a transfer shows each wallet's balance after the move, swaps, and fills move all; offline there is no move all
X2 KILLED: swap does nothing -> a transfer shows each wallet's balance after the move, swaps, and fills move all; offline there is no move all
X3 KILLED: move all offered above the amount cap -> a transfer shows each wallet's balance after the move, swaps, and fills move all; offline there is no move all
X4 KILLED: move all offered at zero or below -> move all is offered only for a known balance above zero and within the amount cap
X5 KILLED: move all fills the amount as if typed -> private mode hides every balance, after line and move all and a fill on the amount line, and draws none of what the person told Bun; a typed amount shows
X6 KILLED: the amount line masks what was typed -> private mode hides every balance, after line and move all and a fill on the amount line, and draws none of what the person told Bun; a typed amount shows
X7 KILLED: the amount line never masks a fill -> private mode hides every balance, after line and move all and a fill on the amount line, and draws none of what the person told Bun; a typed amount shows
X8 KILLED: the after line is the balance before the move -> a transfer shows each wallet's balance after the move, swaps, and fills move all; offline there is no move all
X9 KILLED: the cards drawn without their materials -> a transfer shows each wallet's balance after the move, swaps, and fills move all; offline there is no move all
X10 KILLED: an archived wallet counts as in use, on a card and for Next -> the same wallet on both sides says so and Next waits; with two wallets Next goes to confirm
X11 KILLED: a card's label leaves out the after line -> a transfer shows each wallet's balance after the move, swaps, and fills move all; offline there is no move all
X12 KILLED: a card says its balance in private mode -> private mode hides every balance, after line and move all and a fill on the amount line, and draws none of what the person told Bun; a typed amount shows
X13 KILLED: move all says its amount in private mode -> private mode hides every balance, after line and move all and a fill on the amount line, and draws none of what the person told Bun; a typed amount shows
X14 KILLED: the from card opens the to step -> a transfer shows each wallet's balance after the move, swaps, and fills move all; offline there is no move all
X15 KILLED: at AX5 a card does not stack -> at AX5 the cards, the summary and the rows stack, and the longest name and ฿999,999,999.99 never truncate
X16 KILLED: at AX5 the swap stays on the seam -> at AX5 the cards, the summary and the rows stack, and the longest name and ฿999,999,999.99 never truncate
X17 KILLED: a card under 84 pt -> every row, card, radio, arrow and button is at least 44 pt
X18 KILLED: move all under 44 pt -> every row, card, radio, arrow and button is at least 44 pt
X19 KILLED: the amount at the amount step's 58, not the board's 52 -> private mode hides every balance, after line and move all and a fill on the amount line, and draws none of what the person told Bun; a typed amount shows
X20 KILLED: the after line's words not drawn -> a transfer shows each wallet's balance after the move, swaps, and fills move all; offline there is no move all
X21 KILLED: the swap on rh-transfer's 8 pt seam, over the cards' words -> at AX5 the cards, the summary and the rows stack, and the longest name and ฿999,999,999.99 never truncate
X22 KILLED: Next reads the draft's ids, so an archived or unknown side goes on (the reviews' m1) -> the same wallet on both sides says so and Next waits; with two wallets Next goes to confirm
X23 KILLED: the seam's zIndex dropped: the to card draws over the swap button (the first review's n2) -> the swap button draws over the to card on the seam, so the card never takes the button's taps
X24 KILLED: an after line below zero loses its minus (the second review's M6) -> a balance below zero, and a move larger than the balance, keep their minus on the card and in its words
X25 KILLED: a balance below zero loses its minus (the second review's M7) -> a balance below zero, and a move larger than the balance, keep their minus on the card and in its words
X26 KILLED: the amount being moved is not a live region (the first review's R7) -> the amount being moved and the day being picked are polite live regions
F1 KILLED: Next takes one wallet on both sides -> the same wallet on both sides says so and Next waits; with two wallets Next goes to confirm
F2 KILLED: Next takes a side with no wallet -> the same wallet on both sides says so and Next waits; with two wallets Next goes to confirm
F3 KILLED: one wallet on both sides is never said -> the same wallet on both sides says so and Next waits; with two wallets Next goes to confirm
F4 KILLED: two empty sides said to be the same wallet -> the same wallet on both sides says so and Next waits; with two wallets Next goes to confirm
F5 KILLED: Next goes back to the amount -> a transfer shows each wallet's balance after the move, swaps, and fills move all; offline there is no move all
F6 KILLED: the problem is not an alert -> the same wallet on both sides says so and Next waits; with two wallets Next goes to confirm
F7 KILLED: no note that a move is not spending -> the same wallet on both sides says so and Next waits; with two wallets Next goes to confirm
F8 KILLED: the one-wallet problem is never said on iOS (the reviews' m3 and M14) -> iOS says the one-wallet problem once, since it reads no live region
C1 KILLED: the title ignores the merchant -> a guessed row says บันเดา
C2 KILLED: the title ignores the note -> a pick returns to confirm with the choice
C3 KILLED: the title ignores the category's name -> confirm shows ฿50, the category, the wallet and วันนี้, each row 44 pt
C4 KILLED: no title falls back to the tray's -> confirm for a move shows its two wallets and the move's mark, and income its amount in violet with a plus
C5 KILLED: the amount masks what was typed -> private mode hides every balance, after line and move all and a fill on the amount line, and draws none of what the person told Bun; a typed amount shows
C6 KILLED: the amount never masks a fill -> private mode hides every balance, after line and move all and a fill on the amount line, and draws none of what the person told Bun; a typed amount shows
C12 KILLED: Bun's line drawn with no sentence -> confirm shows ฿50, the category, the wallet and วันนี้, each row 44 pt
C13 KILLED: income's amount in ink -> confirm for a move shows its two wallets and the move's mark, and income its amount in violet with a plus
C14 KILLED: income's amount without its plus -> confirm for a move shows its two wallets and the move's mark, and income its amount in violet with a plus
C15 KILLED: the tile ignores the category's own -> confirm shows ฿50, the category, the wallet and วันนี้, each row 44 pt
C16 KILLED: a move's tile without its mark -> confirm for a move shows its two wallets and the move's mark, and income its amount in violet with a plus
C17 KILLED: every row opens the category pick -> confirm shows ฿50, the category, the wallet and วันนี้, each row 44 pt
C18 KILLED: Bun's mark on every row -> a guessed row says บันเดา
C19 KILLED: a guessed row's label leaves out Bun's mark -> a guessed row says บันเดา
C20 KILLED: an empty note asks for a wallet -> confirm shows ฿50, the category, the wallet and วันนี้, each row 44 pt
C21 KILLED: an empty category asks for a note -> confirm for a move shows its two wallets and the move's mark, and income its amount in violet with a plus
C22 KILLED: what to add drawn in ink -> confirm shows ฿50, the category, the wallet and วันนี้, each row 44 pt
C23 KILLED: a wallet row without the wallet's material -> confirm shows ฿50, the category, the wallet and วันนี้, each row 44 pt
C24 KILLED: rows under 44 pt -> confirm shows ฿50, the category, the wallet and วันนี้, each row 44 pt
C25 KILLED: at AX5 a row does not stack -> at AX5 the cards, the summary and the rows stack, and the longest name and ฿999,999,999.99 never truncate
C26 KILLED: at AX5 the summary does not stack -> at AX5 the cards, the summary and the rows stack, and the longest name and ฿999,999,999.99 never truncate
C27 KILLED: the amount at the board's 32, not the plan's 44 -> confirm shows ฿50, the category, the wallet and วันนี้, each row 44 pt
C28 KILLED: the to row draws the from wallet's material -> confirm for a move shows its two wallets and the move's mark, and income its amount in violet with a plus
C29 KILLED: in private mode Bun's sentence is quoted (the reviews' M1, R114) -> private mode hides every balance, after line and move all and a fill on the amount line, and draws none of what the person told Bun; a typed amount shows
C30 KILLED: outside private mode Bun's sentence is not quoted -> a guessed row says บันเดา
C31 KILLED: the wallet row draws the from wallet's material (the second review's M18) -> confirm shows ฿50, the category, the wallet and วันนี้, each row 44 pt
C32 KILLED: a merchant of spaces is the title (the first review's n1) -> confirm for a move shows its two wallets and the move's mark, and income its amount in violet with a plus
C33 KILLED: a note of spaces is the title -> confirm for a move shows its two wallets and the move's mark, and income its amount in violet with a plus
P1 KILLED: no step is a pick, so the host never learns where a pick goes back to -> isPickStep names the six picks; the amount chip's wallet pick goes back to the amount step, by a choice and by the tray's back
P2 KILLED: the wallet pick always goes back to confirm -> isPickStep names the six picks; the amount chip's wallet pick goes back to the amount step, by a choice and by the tray's back
P3 KILLED: the category pick ignores the ranking -> the category pick offers the type's categories in use in ranked order, the ranking's missing ones last, and says which is chosen
P4 KILLED: archived categories offered -> at AX5 the cards, the summary and the rows stack, and the longest name and ฿999,999,999.99 never truncate
P5 KILLED: categories the ranking does not hold left out -> at AX5 the cards, the summary and the rows stack, and the longest name and ฿999,999,999.99 never truncate
P6 KILLED: another type's categories offered -> at AX5 the cards, the summary and the rows stack, and the longest name and ฿999,999,999.99 never truncate
P7 KILLED: the chosen category not checked -> the category pick offers the type's categories in use in ranked order, the ranking's missing ones last, and says which is chosen
P8 KILLED: a pick sets spending's category whatever the type -> the category pick offers the type's categories in use in ranked order, the ranking's missing ones last, and says which is chosen
P9 KILLED: a category pick does not tick -> a pick returns to confirm with the choice
P10 KILLED: the category pick does not go back -> a guessed row says บันเดา
P11 KILLED: the chosen tile not ringed -> the category pick offers the type's categories in use in ranked order, the ranking's missing ones last, and says which is chosen
P12 KILLED: the chosen category's name not bold -> the category pick offers the type's categories in use in ranked order, the ranking's missing ones last, and says which is chosen
P13 KILLED: at AX5 the grid stays four across -> at AX5 the cards, the summary and the rows stack, and the longest name and ฿999,999,999.99 never truncate
P14 KILLED: archived wallets offered -> a transfer shows each wallet's balance after the move, swaps, and fills move all; offline there is no move all
P15 KILLED: picking the to wallet as from does not swap -> from the transfer step a card opens its wallet pick, which comes back to it; picking the other side's wallet swaps the two
P16 KILLED: picking the from wallet as to does not swap -> from the transfer step a card opens its wallet pick, which comes back to it; picking the other side's wallet swaps the two
P17 KILLED: the from and to picks check each other's wallet -> from the transfer step a card opens its wallet pick, which comes back to it; picking the other side's wallet swaps the two
P18 KILLED: the wallet pick says balances in private mode -> private mode hides every balance, after line and move all and a fill on the amount line, and draws none of what the person told Bun; a typed amount shows
P19 KILLED: every wallet pick named กระเป๋า -> a transfer shows each wallet's balance after the move, swaps, and fills move all; offline there is no move all
P20 KILLED: at AX5 a wallet row does not stack -> at AX5 the cards, the summary and the rows stack, and the longest name and ฿999,999,999.99 never truncate
P21 KILLED: wallet rows under 44 pt -> every row, card, radio, arrow and button is at least 44 pt
P22 KILLED: the date passes today (the plan's mutant) -> the date cannot pass today or go before the wallet's start
P23 KILLED: the date goes before the wallet's start -> the date cannot pass today or go before the wallet's start
P24 KILLED: a draft dated before the start opens before it -> the date cannot pass today or go before the wallet's start
P25 KILLED: a day change does not tick -> the date cannot pass today or go before the wallet's start
P26 KILLED: วันนี้ offered on today -> the date cannot pass today or go before the wallet's start
P27 KILLED: วันนี้ does nothing -> the date cannot pass today or go before the wallet's start
P28 KILLED: Done does not keep the day -> a pick returns to confirm with the choice
P29 KILLED: a day change written at once, so back keeps it -> a pick returns to confirm with the choice
P30 KILLED: the note written at once, so back keeps it -> a pick returns to confirm with the choice
P31 KILLED: Done does not keep the note -> a pick returns to confirm with the choice
P32 KILLED: notes past 500 characters -> a pick returns to confirm with the choice
P33 KILLED: day arrows under 44 pt -> every row, card, radio, arrow and button is at least 44 pt
P34 KILLED: the date pick's Done does not go back -> a pick returns to confirm with the choice
P35 KILLED: the note pick's Done does not go back -> a pick returns to confirm with the choice
P36 KILLED: isPickStep leaves out the wallet pick, so the amount chip's pick goes back to a stale step (the first review's R1) -> isPickStep names the six picks; the amount chip's wallet pick goes back to the amount step, by a choice and by the tray's back
P37 KILLED: isPickStep leaves out the to pick (the first review's R2) -> isPickStep names the six picks; the amount chip's wallet pick goes back to the amount step, by a choice and by the tray's back
P38 KILLED: isPickStep counts confirm and the transfer step as picks (the first review's R3) -> isPickStep names the six picks; the amount chip's wallet pick goes back to the amount step, by a choice and by the tray's back
P39 KILLED: a draft dated after today opens after it (the second review's n1) -> the date cannot pass today or go before the wallet's start
P40 KILLED: the chosen wallet's radio without its dot (the first review's n3) -> a pick returns to confirm with the choice
P41 KILLED: the wallet pick reads balances with none known, offline (the second review's M8) -> a transfer shows each wallet's balance after the move, swaps, and fills move all; offline there is no move all
P42 KILLED: the day being picked is not a live region (the first review's R8) -> the amount being moved and the day being picked are polite live regions
K1 KILLED: the after line reads หลัง -> a transfer shows each wallet's balance after the move, swaps, and fills move all; offline there is no move all
K2 KILLED: Bun's mark reads เดา -> a guessed row says บันเดา
K3 KILLED: the empty note reads โน้ต -> confirm shows ฿50, the category, the wallet and วันนี้, each row 44 pt
K4 KILLED: swap reads สลับ -> a transfer shows each wallet's balance after the move, swaps, and fills move all; offline there is no move all
K5 KILLED: the to side reads the board's ไปยัง, not the plan's ไป -> a transfer shows each wallet's balance after the move, swaps, and fills move all; offline there is no move all
K6 KILLED: the transfer note loses its second half -> the same wallet on both sides says so and Next waits; with two wallets Next goes to confirm
K7 KILLED: the private line says only บันอ่านจาก, as if a quote followed -> private mode hides every balance, after line and move all and a fill on the amount line, and draws none of what the person told Bun; a typed amount shows
S1 KILLED: the transfer section under another id -> the steps' sections come right after the amount step's, and each opens at its step on its board's words
S2 KILLED: the transfer section with no balances -> the steps' sections come right after the amount step's, and each opens at its step on its board's words
S3 KILLED: the Bun section without what Bun read -> private mode hides every balance, after line and move all and a fill on the amount line, and draws none of what the person told Bun; a typed amount shows
S4 KILLED: the confirm section draws no Save -> the steps' sections come right after the amount step's, and each opens at its step on its board's words
S5 KILLED: the section keeps Bun's guess after a change -> the steps' sections come right after the amount step's, and each opens at its step on its board's words
S6 KILLED: cash on another material than rh-transfer's cream paper -> the steps' sections come right after the amount step's, and each opens at its step on its board's words
S7 KILLED: the section forgets which step opened a pick -> the steps' sections come right after the amount step's, and each opens at its step on its board's words
S8 KILLED: the steps loaded eagerly into the wallet's section list (the first review's n4) -> the wallet's section list loads the steps lazily, never imports them, and reads the catalogue's running mark while they load
S9 KILLED: the lazy section reads no running mark, so the catalogue's suites would not wait -> the wallet's section list loads the steps lazily, never imports them, and reads the catalogue's running mark while they load
120 killed, 0 survived, 0 not as expected
   ```
   X1 and P22 are the plan's two mutants. C7 to C11 are retired (P21).
2. `cd WT && shasum -a 256 -c PL/SHA256SUMS.real-in-wt` again: nine `OK` lines. `/usr/bin/git -C WT status --short`: unchanged from Step 3.1.

## Step 5: The fast local gate (R100)

From WT, in this order, each with its log in S:

1. `cd WT && npm run typecheck:app > S/gate-1-typecheck.log 2>&1; echo $?`. Expected: 0.
2. `cd WT && npm run test:app > S/gate-2-test-app.log 2>&1; echo $?`. Expected: 0, `ℹ fail 0`. (No count is expected: CI holds the whole suites, R100.)
3. `cd WT && npm run test:unit > S/gate-3-test-unit.log 2>&1; echo $?`. Expected: 0, `ℹ fail 0`.
4. The round's render file and the eight kit render files, each named: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/add/AddSteps.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/card/CardStack.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx > S/gate-4-focused.log 2>&1; echo $?`. Expected: 0, `Test Files  9 passed (9)`, `Tests  155 passed (155)`. A case that times out near 5 s in a file this round does not touch is a load flake: rerun that file alone once, record both runs, and do not change it.
5. The four routes tests and the catalogue's route test, each named: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx src/dev/catalogue/catalogueRoute.render.test.tsx > S/gate-5-routes.log 2>&1; echo $?`. Expected: 0, `Test Files  5 passed (5)`, `Tests  15 passed (15)`.
6. `/usr/bin/git -C WT diff --check` (before the commit) and, after it, `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD`: no output.

Not run, and why (put this in the receipt): `typecheck:routes`, `export:web` and the iOS export (no route, config or app entry change; CI runs the exports); the full render suite (CI, R100; the every-section and screen-reader suites run the four sections there, now loaded lazily); `test:ops` (no package or lockfile change); the API, edge and database suites (nothing outside `apps/app` and the receipts changes; Docker is stopped); and the device checks, SKIPPED: the first round's, and P32's swap tap.

## Step 6: The round's receipt

Write `docs/implementation/receipts/P2-T15-fix.md` in the house style (see `docs/implementation/receipts/P2-T25-fix.md`), with your own numbers where they differ. Start from:

```markdown
# P2-T15-fix: none of Bun's sentence in private mode, Next by the cards' rule, the reviews' pins, and lazy step sections

- **Status:** built and verified locally on `p2/t15-transfer-confirm-pick` (`.claude/worktrees/p2-t15`), one commit on PR #427's reviewed head `fd41909c`. Not pushed. This is the fix round on PR #427 after two reviews: the first (`.claude/controller/reviews/P2-T15.md`) said Needs fixes (M1, m1 to m3, n1 to n4); the second (`P2-T15-second.md`, money and privacy) said Needs fixes (M1, m1, m2, n1, n2). The controller ruled R114, and the planner's brief is `.claude/controller/briefs/P2-T15-fix.md`. Under R87 this receipt is its own file; `P2-T15.md` is corrected and points here.
- **Base:** `fd41909c`, with no merge (the brief's P20).
- **Files:** (the nine of the brief's Scope, and this receipt.)
- **What changed:** (P21 to P26: the hidden line; Next by `inUse`; the pins; the nits; the lazy sections; the test file.)
- **RED to GREEN:** (Steps 2 and 3, your counts and messages.)
- **Mutation check:** 120 mutants, all killed ... (by group; C7 to C11 retired.)
- **Gate:** (Step 5, each command and its result; no whole-suite count, R100.)
- **Deviations:** none from the brief's rulings. (Or name each.)
- **SKIPPED:** (Step 5's list.)
- **Notes for later tasks:** (P32, each; and, for P2-T37: a sweep for digits cannot catch an amount written in words, so check that Bun's sentence is absent in private mode.)
```

## Step 7: Commit

1. `/usr/bin/git -C WT add apps/app/src/wallet/add/ConfirmStep.tsx apps/app/src/wallet/add/TransferStep.tsx apps/app/src/wallet/add/PickSteps.tsx apps/app/src/wallet/add/copy.ts apps/app/src/wallet/add/AddSteps.render.test.tsx apps/app/src/wallet/add/addStepsNative.test.ts apps/app/src/dev/catalogue/wallet/addSections.tsx apps/app/src/dev/catalogue/wallet/addStepsSection.tsx docs/implementation/receipts/P2-T15.md docs/implementation/receipts/P2-T15-fix.md`
2. `/usr/bin/git -C WT status --short`: those ten staged, nothing else (no log, no `dist/`).
3. Write the message to `S/commit-message.txt`, ending with the `Co-Authored-By:` trailer naming the model you run as (for a Claude Haiku 5.5 fixer, `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`):
   ```
   Hide Bun's sentence in private mode and gate Next by the cards

   In private mode the confirm step draws none of what the person told Bun:
   its violet line says only that Bun read it from what they said, since no
   mask keeps up with every way an amount is written. The transfer step's
   Next now waits, as its cards ask, while a side's wallet is archived or
   not listed. Pin what the reviews found unheld: isPickStep and the amount
   chip's way back, the live regions and the problem's announcement, minus
   signs, the offline wallet pick, the entry wallet's material, the title's
   trims, the radio dot and a draft dated after today. The step sections
   now load lazily.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-message.txt`, then `/usr/bin/git -C WT log --oneline -1` and `/usr/bin/git -C WT show --stat HEAD`: 10 files.

## Your final message

As the protocol says: `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker) on the first line; the commit SHA and branch (`p2/t15-transfer-confirm-pick`, on `fd41909c`); files changed (10); RED (Node 1 of 15, render 4 of 17, each on an assertion) and GREEN (Node 15, render 17); mutants (120 killed); each gate command with its result (no whole-suite count); SKIPPED items; deviations; and what the reviewer should look at first: the hidden line and its proof (P21), Next by `inUse` (P22), the ruling on the amount (P23), and the lazy sections (P25).

---

## Appendix: the code

The new files and the stub in full, and each changed file as its diff from `fd41909c`. Every block is the file in `PL/real/`, `PL/stubs/` or `PL/diffs/`, byte for byte.

`apps/app/src/dev/catalogue/wallet/addStepsSection.tsx` (new):
```tsx
// The add tray's transfer, confirm and pick steps in the catalogue (P2-T15,
// development only): the host of the four sections that addSections.tsx lists
// and loads lazily, so the wallet's section list never loads the steps (the
// controller's rule for sections, as recordSections.tsx loads its screen).
// Each section puts its step in a Tray that opens at once: the transfer step
// (rh-transfer's numbers), the confirm step (bw-tray-confirm) typed and as Tell
// Bun filled it, and the category pick. The steps move as a host moves them:
// Next goes from the transfer step to confirm, a row opens its pick, a card
// opens its wallet pick, and a pick goes back to the step that opened it, with
// the choice, or with nothing changed by the tray's back. A change undoes
// Bun's guess on that row (stillGuessed). Save goes nowhere here, and there is
// no back to the amount: saving and the amount step's place in the flow are
// the host's (P2-T16). The sample words are catalogue samples, not app copy. A
// section never imports the wallet test harness, which loads vitest.
import { BUILTIN_CATEGORIES } from '@gogospend/contracts';
import type { CategoryDto, Minor, WalletSnapshot } from '@gogospend/contracts';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import type { QuickAddDraft } from '@mobile/spend/v1/redesign/quickAddModel';
import { rankRecentCategories } from '@mobile/spend/v1/redesign/recentCategories';
import type { Lookups } from '@mobile/spend/v1/redesign/shared';
import { keypadFromMinor } from '@mobile/ui/keypadExpression';
import type { KeypadState } from '@mobile/ui/keypadExpression';
import { BUN_SPACE } from '@mobile/ui/layout';
import { confirmRows, filledKeypad, stillGuessed, trayTitleKey } from '@mobile/wallet/add/addFlow';
import type { AddStep, AddType, StepProps } from '@mobile/wallet/add/addFlow';
import { ConfirmStep, confirmTitle } from '@mobile/wallet/add/ConfirmStep';
import { COPY } from '@mobile/wallet/add/copy';
import { CategoryPick, DatePick, isPickStep, NotePick, WalletPick } from '@mobile/wallet/add/PickSteps';
import { TransferFooter, TransferStep } from '@mobile/wallet/add/TransferStep';
import { COMMON_COPY } from '@mobile/wallet/common/copy';
import type { DraftTable } from '@mobile/wallet/copy/draftText';
import { useDraftCopy } from '@mobile/wallet/copy/useDraftCopy';
import { PrimaryButton } from '@mobile/wallet/tray/PrimaryButton';
import { TextLink } from '@mobile/wallet/tray/TextLink';
import { Tray } from '@mobile/wallet/tray/Tray';
import { SpecimenLabel } from '../parts';

const STEP_SAMPLES = {
  ...COMMON_COPY,
  ...COPY,
  'sample.open': { th: 'เปิดถาด', en: 'Open the tray' },
  'sample.wallet': { th: 'บัญชีหลัก', en: 'Main account' },
  'sample.cash': { th: 'เงินสด', en: 'Cash' },
  'sample.savings': { th: 'บัญชีออม', en: 'Savings' },
  'sample.chickenRice': { th: 'ข้าวมันไก่', en: 'Chicken rice' },
  'sample.bunSaid': { th: 'ข้าวมันไก่ 50', en: 'chicken rice 50' },
} as const satisfies DraftTable;

/** The boards' day, so every capture reads the same. */
const SAMPLE_TODAY = '2026-10-24';
/** The sample wallets: the main account (lavender silk, P2-T14's sample), cash (cream paper, rh-transfer's) and savings (peach). */
const WALLET_ID = 'bw-add-main-account';
const CASH_ID = 'bw-add-cash-wallet';
const SAVINGS_ID = 'bw-add-savings-wallet';
/** rh-transfer's balances: ฿24,860 and ฿1,240; savings ฿120,000. */
const SAMPLE_BALANCES: ReadonlyMap<string, Minor> = new Map([[WALLET_ID, '2486000'], [CASH_ID, '124000'], [SAVINGS_ID, '12000000']]);

/** The built-in categories, as a new account has them. */
const SAMPLE_CATEGORIES: readonly CategoryDto[] = BUILTIN_CATEGORIES.map((category) => ({
  id: `bw-add-category-${category.key}`, type: category.type, builtin_key: category.key, label: null, color: category.color, archived: false, version: 1,
}));

/** No records yet, so each type's ranking is the built-in order (P2-T5's rank, without the module that loads expo-crypto). */
const SAMPLE_RANKING = {
  expense: rankRecentCategories({ type: 'expense', categories: SAMPLE_CATEGORIES, records: [], today: SAMPLE_TODAY }),
  income: rankRecentCategories({ type: 'income', categories: SAMPLE_CATEGORIES, records: [], today: SAMPLE_TODAY }),
};

export type StepStart = {
  step: 'transfer' | 'confirm' | 'category';
  type: AddType;
  amountMinor: string;
  /** Bun filled the amount: a fill, which private mode masks. */
  filled: boolean;
  merchant: string;
  /** Tell Bun filled the entry from this sample line. */
  bunSaid: boolean;
  guessed: readonly string[];
};

function stepDraft(start: StepStart, merchant: string): QuickAddDraft {
  return {
    mode: 'create', recordId: 'bw-add-record', commandId: 'bw-add-command', type: start.type, amountMinor: '', occurredOn: SAMPLE_TODAY,
    walletId: WALLET_ID, categoryByType: { expense: 'bw-add-category-food', income: 'bw-add-category-salary' },
    fromWalletId: WALLET_ID, toWalletId: CASH_ID, note: '', merchant,
  };
}

/** The later tracking start of the entry's wallets: no earlier day can be saved (as entryHelpers' earliestFor). */
function earliestOf(draft: QuickAddDraft, wallets: readonly WalletSnapshot[]): string | undefined {
  const ids = draft.type === 'transfer' ? [draft.fromWalletId, draft.toWalletId] : [draft.walletId];
  const starts = wallets.filter((wallet) => ids.includes(wallet.id)).map((wallet) => wallet.tracking_start).sort();
  return starts.at(-1);
}

/** The transfer, confirm and pick steps in a tray that opens at once at its step, moving as a host moves them; closed and opened again, it starts over. */
export default function StepsTray({ label, start }: { label: string; start: StepStart }) {
  const t = useDraftCopy(STEP_SAMPLES);
  const tc = useCopy();
  const locale = useActiveLocale();
  const wallets = useMemo(() => [
    [WALLET_ID, t('sample.wallet')],
    [CASH_ID, t('sample.cash')],
    [SAVINGS_ID, t('sample.savings')],
  ].map(([id, name]): WalletSnapshot => ({ id, name, currency: 'THB', opening_minor: '0', tracking_start: '2026-10-01', archived: false, version: 1 })), [t]);
  const lookups: Lookups = {
    wallets: new Map(wallets.map((wallet) => [wallet.id, { id: wallet.id, name: wallet.name }])),
    categories: new Map(SAMPLE_CATEGORIES.map((category) => [category.id, category])),
  };
  const keypadOf = () => (start.filled ? filledKeypad(start.amountMinor) : keypadFromMinor(start.amountMinor));
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState(() => stepDraft(start, start.merchant === '' ? '' : t(start.merchant)));
  const [keypad, setKeypad] = useState<KeypadState>(keypadOf);
  const [step, setStep] = useState<AddStep>(start.step);
  const [back, setBack] = useState<AddStep>('confirm');
  const [guessed, setGuessed] = useState<ReadonlySet<string>>(() => new Set(start.guessed));
  const reset = () => {
    setDraft(stepDraft(start, start.merchant === '' ? '' : t(start.merchant)));
    setKeypad(keypadOf());
    setStep(start.step);
    setBack('confirm');
    setGuessed(new Set(start.guessed));
  };
  const props: StepProps = {
    draft,
    keypad,
    onDraft: (next) => {
      setGuessed((now) => stillGuessed(now, draft, next));
      setDraft(next);
    },
    onKeypad: setKeypad,
    onStep: (next) => {
      if (isPickStep(next)) setBack(step);
      setStep(next);
    },
  };
  const rows = confirmRows(draft, { lookups, today: SAMPLE_TODAY, dateLocale: locale, guessed, tc });
  let middle: ReactNode = null;
  let footer: ReactNode;
  if (step === 'transfer') {
    middle = <TransferStep {...props} wallets={wallets} balances={SAMPLE_BALANCES} />;
    footer = <TransferFooter {...props} wallets={wallets} />;
  } else if (step === 'confirm') {
    middle = <ConfirmStep {...props} rows={rows} title={confirmTitle(draft, rows, t)} bunSentence={start.bunSaid ? t('sample.bunSaid') : null} type={draft.type} lookups={lookups} />;
    footer = <PrimaryButton label={t('common.save')} onPress={() => undefined} />;
  } else if (step === 'category') {
    middle = <CategoryPick {...props} categories={SAMPLE_CATEGORIES} ranking={SAMPLE_RANKING} />;
  } else if (step === 'wallet' || step === 'from' || step === 'to') {
    middle = <WalletPick {...props} wallets={wallets} balances={SAMPLE_BALANCES} role={step} back={back} />;
  } else if (step === 'date') {
    middle = <DatePick {...props} today={SAMPLE_TODAY} earliest={earliestOf(draft, wallets)} />;
  } else if (step === 'note') {
    middle = <NotePick {...props} />;
  }
  return (
    <View style={{ gap: BUN_SPACE.xs, alignItems: 'flex-start' }}>
      <SpecimenLabel>{label}</SpecimenLabel>
      <TextLink label={t('sample.open')} onPress={() => setOpen(true)} />
      <Tray
        visible={open}
        onClose={() => setOpen(false)}
        onClosed={reset}
        title={t(trayTitleKey(draft.type))}
        step={step}
        onBack={isPickStep(step) ? () => setStep(back) : undefined}
        footer={footer}
      >
        {middle}
      </Tray>
    </View>
  );
}
```

`apps/app/src/wallet/add/addStepsNative.test.ts` (new):
```ts
// What react-native-web and happy-dom cannot show of the transfer step and its
// catalogue sections, read from the source (R72's trap, as
// amountStepNative.test.ts does; P2-T15's fix round, R114):
// - iOS reads no live region, so the one-wallet problem is also said once
//   (useAnnouncement: the first review's m3, the second review's M14);
// - happy-dom paints nothing, so the swap button's place over the to card on
//   the seam is read here (the first review's n2);
// - the wallet's section list loads the steps lazily and never imports them
//   (the controller's rule for sections; the first review's n4), and while
//   they load the section reads the catalogue's running mark, so the
//   catalogue's suites wait for it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const transfer = readFileSync(join(here, 'TransferStep.tsx'), 'utf8');
const sections = readFileSync(join(here, '..', '..', 'dev', 'catalogue', 'wallet', 'addSections.tsx'), 'utf8');

test('iOS says the one-wallet problem once, since it reads no live region', () => {
  assert.match(transfer, /\n {2}useAnnouncement\(problem\);\n/);
});

test("the swap button draws over the to card on the seam, so the card never takes the button's taps", () => {
  assert.match(transfer, /\{ height: SEAM, alignItems: 'center', justifyContent: 'center', zIndex: 1 \}/);
});

test("the wallet's section list loads the steps lazily, never imports them, and reads the catalogue's running mark while they load", () => {
  assert.match(sections, /\nconst StepsTray = lazy\(\(\) => import\('\.\/addStepsSection'\)\);\n/);
  assert.match(sections, /<Suspense fallback=\{<View testID="catalogue-screen-running" style=\{\{ flex: 1 \}\} \/>\}>\n {6}<StepsTray label=\{label\} start=\{start\} \/>/);
  assert.doesNotMatch(sections, /from '@mobile\/wallet\/add\/(TransferStep|ConfirmStep|PickSteps)'/);
  assert.doesNotMatch(sections, /^import (?!type )[^\n]*'\.\/addStepsSection';$/m);
});
```

`apps/app/src/wallet/add/TransferStep.tsx` (the RED stub):
```tsx
// The add tray's transfer step (P2-T15; W14; rh-transfer): money moved between
// the person's own wallets. A transfer goes amount, transfer, confirm (P2-T14's
// stepAfterAmount). TransferStep is the step's middle: the from and to cards,
// each 84 pt on its wallet's material with the wallet's available balance and
// what it holds after the move (balancesAfter, exact in BigInt), the swap
// button between them, the amount being moved, and move all. TransferFooter is
// its footer, which the host passes to the tray's pinned `footer`: the note
// that a move is not spending, and Next, which waits for two different
// wallets. Both are controlled (StepProps), as every step is.
//
// - A card opens its wallet step (`from` or `to`), which comes back here
//   (WalletPick's `back`). Swap exchanges the two wallets in the draft, so
//   each card's name, balance and after line follow its own wallet.
// - Balances are the server's (the host's `balances`, less waiting drafts).
//   Offline there are none: the cards show names only, with no after line and
//   no move all, since a guessed balance would be a wrong number on screen
//   (today's WalletPicker). Archived wallets are never shown, as today.
// - Move all fills the amount with the from wallet's whole balance, as a fill
//   (filledKeypad). It is offered only when that balance is known, above zero
//   (moveAllMinor) and within the amount cap: keypadFromMinor refuses more,
//   and a record cannot hold it. So a balance above ฿999,999,999.99 offers no
//   move all, and nothing ever says that a hidden balance is above the cap
//   (the P2-T14 review's note).
// - Private mode (W10): the balances, the after lines and move all's amount
//   are stored amounts, so WalletAmount masks them and each card says only
//   that its amount is hidden. The amount line follows the amount step's rule
//   (R106): what the person typed shows, and a fill (move all, Bun's reading)
//   is masked.
// - The swap sits on the seam between the cards, as rh-transfer draws it: the
//   cards are 22 pt apart, so the 44 pt button overlaps only their 11 pt
//   padding and never their words, however long a name runs. At the largest
//   text sizes it takes its own row; each card stacks its amounts under its
//   name, and nothing is clamped (Review Focus 3).
import { MINOR_AMOUNT_MAX } from '@gogospend/contracts';
import type { Minor, WalletSnapshot } from '@gogospend/contracts';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useCopy } from '@mobile/i18n/useCopy';
import { Text } from '@mobile/theme/AppText';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { LATIN_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { materialPaint } from '@mobile/theme/walletPalette';
import { amountMaxScale, walletLineHeight } from '@mobile/theme/walletType';
import { DECORATIVE, POLITE_LIVE_REGION, useAnnouncement } from '@mobile/ui/a11y';
import { Glyph } from '@mobile/ui/Glyph';
import { evaluateKeypad, keypadDisplay } from '@mobile/ui/keypadExpression';
import { useLargeText } from '@mobile/ui/largeText';
import { COMMON_COPY } from '../common/copy';
import { IconButton } from '../controls/IconButton';
import { useDraftCopy } from '../copy/useDraftCopy';
import { MaterialFill } from '../looks/MaterialFill';
import { useWalletLooks } from '../looks/WalletLooksProvider';
import { WalletAmount } from '../money/WalletAmount';
import { HIDDEN_AMOUNT, spokenMoney } from '../money/walletMoney';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { PrimaryButton } from '../tray/PrimaryButton';
import { WalletText } from '../WalletText';
import { balancesAfter, filledKeypad, isFilled, moveAllMinor } from './addFlow';
import type { StepProps } from './addFlow';
import { COPY } from './copy';

const LINES = { ...COMMON_COPY, ...COPY } as const;

/** The amount being moved (rh-transfer); it grows to 64 pt and no more (W30). */
const AMOUNT = 52;
/** A card's height (rh-transfer); it grows with its words at the largest text sizes. */
const CARD = 84;
/** The cards' gap: the 44 pt swap overlaps each card by 11 pt, its padding (rh-transfer draws 8 and overlaps the words' edge). */
const SEAM = 22;

/** Move all: the from wallet's balance when it is known, above zero and within the amount cap; else null. */
function moveAllOffer(balances: ReadonlyMap<string, Minor> | null, fromId: string | null): Minor | null {
  const all = moveAllMinor(balances, fromId);
  return all !== null && BigInt(all) <= MINOR_AMOUNT_MAX ? all : null;
}

/** A line's words on either side of its `{amount}`, so each language keeps its own order. */
function around(template: string): [string, string] {
  const at = template.indexOf('{amount}');
  if (at < 0) return [template.trim(), ''];
  return [template.slice(0, at).trim(), template.slice(at + '{amount}'.length).trim()];
}

export function TransferStep({ draft, keypad, onDraft, onKeypad, onStep, wallets, balances }: StepProps & {
  wallets: readonly WalletSnapshot[];
  /** Each wallet's available balance from the server; null offline. */
  balances: ReadonlyMap<string, Minor> | null;
}) {
  const colors = useWalletColors();
  const t = useDraftCopy(LINES);
  const large = useLargeText();
  const { hidden } = usePrivateMode();
  const typed = evaluateKeypad(keypad, { allowZero: true });
  const after = balancesAfter(balances, draft.fromWalletId, draft.toWalletId, typed.ok ? typed.minor : '0');
  // Wallets in use only: a copied record's archived wallet asks for another, as today's picker does.
  const listed = (id: string | null) => (id === null ? null : wallets.find((wallet) => wallet.id === id && !wallet.archived) ?? null);
  const from = listed(draft.fromWalletId);
  const to = listed(draft.toWalletId);
  const balanceOf = (wallet: WalletSnapshot | null) => (wallet === null || balances === null ? null : balances.get(wallet.id) ?? null);
  const moveAll = moveAllOffer(balances, from?.id ?? null);
  // A fill is masked as a stored amount is; what the person typed shows (R106).
  const masked = hidden && isFilled(keypad);
  const [beforeAll, afterAll] = around(t('add.moveAll'));
  return (
    <View testID="transfer-step" style={{ gap: 12 }}>
      <View>
        <TransferCard testID="transfer-from" role={t('add.rowFrom')} wallet={from} balance={balanceOf(from)} after={from === null ? null : after.from} onPress={() => onStep('from')} />
        {/* On the seam, over the cards' padding only; at the largest text sizes its own row. */}
        <View style={large ? { alignItems: 'center', paddingVertical: 8 } : { height: SEAM, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
          <IconButton label={t('add.swap')} onPress={() => onDraft({ ...draft, fromWalletId: draft.toWalletId, toWalletId: draft.fromWalletId })}>
            <Glyph name="swap" size={22} color={colors.ink} />
          </IconButton>
        </View>
        <TransferCard testID="transfer-to" role={t('add.rowTo')} wallet={to} balance={balanceOf(to)} after={to === null ? null : after.to} onPress={() => onStep('to')} />
      </View>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <View {...POLITE_LIVE_REGION} style={{ alignSelf: 'stretch' }}>
          <Text
            testID="transfer-amount"
            accessibilityLabel={masked ? t('common.amountHidden') : spokenMoney(typed.ok ? typed.minor : '0', t)}
            maxFontSizeMultiplier={amountMaxScale(AMOUNT)}
            style={{
              fontFamily: LATIN_UI_FONT_FAMILY,
              fontWeight: '700',
              fontSize: AMOUNT,
              lineHeight: walletLineHeight(AMOUNT, 'latin'),
              letterSpacing: masked ? (AMOUNT * 12) / 100 : (AMOUNT * -2) / 100,
              color: colors.ink,
              textAlign: 'center',
            }}
          >
            {masked ? HIDDEN_AMOUNT : `฿${keypadDisplay(keypad)}`}
          </Text>
        </View>
        {moveAll === null ? null : (
          <Pressable
            testID="transfer-move-all"
            accessibilityRole="button"
            accessibilityLabel={t('add.moveAll', { amount: hidden ? t('common.amountHidden') : spokenMoney(moveAll, t) })}
            onPress={() => onKeypad(filledKeypad(moveAll))}
            style={({ pressed }) => ({
              minHeight: 44,
              maxWidth: '100%',
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              columnGap: 6,
              paddingHorizontal: 16,
              paddingVertical: 4,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: colors.hairline,
              backgroundColor: colors.card,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            {beforeAll === '' ? null : <WalletText role="label">{beforeAll}</WalletText>}
            <WalletAmount minor={moveAll} size={16} />
            {afterAll === '' ? null : <WalletText role="label">{afterAll}</WalletText>}
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** The step's footer, for the tray's pinned `footer`: the note that a move is not spending, and Next. */
// RED stub (P2-T15 fix round): fd41909c's footer, taking the round's `wallets` (optional here, unread).
export function TransferFooter({ draft, onStep }: StepProps & { wallets?: readonly WalletSnapshot[] }) {
  const colors = useWalletColors();
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const { fromWalletId: from, toWalletId: to } = draft;
  // One wallet on both sides cannot be a move: today's words say so (as WalletPicker does), and Next waits.
  const problem = from !== null && from === to ? tc('Choose two different wallets') : null;
  useAnnouncement(problem);
  return (
    <View style={{ gap: 8 }}>
      {problem === null ? null : (
        <WalletText testID="transfer-problem" role="label" accessibilityRole="alert" aria-live="polite" style={{ textAlign: 'center' }}>
          {problem}
        </WalletText>
      )}
      <View testID="transfer-note" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <View {...DECORATIVE}>
          <Svg width={14} height={14} viewBox="0 0 24 24">
            <Circle cx={12} cy={12} r={9} fill="none" stroke={colors.quiet} strokeWidth={1.9} />
            <Path d="M12 11v6" fill="none" stroke={colors.quiet} strokeWidth={2.2} strokeLinecap="round" />
            <Circle cx={12} cy={7.6} r={1.3} fill={colors.quiet} />
          </Svg>
        </View>
        <WalletText role="caption" tone="quiet" style={{ flexShrink: 1, textAlign: 'center' }}>{t('add.transferNote')}</WalletText>
      </View>
      <PrimaryButton testID="transfer-next" label={t('common.next')} disabled={from === null || to === null || from === to} onPress={() => onStep('confirm')} />
    </View>
  );
}

/** One side of the move: its wallet's material, the side's word, the name, and the balance with what it holds after. */
function TransferCard({ testID, role, wallet, balance, after, onPress }: {
  testID: string;
  role: string;
  wallet: WalletSnapshot | null;
  balance: Minor | null;
  after: Minor | null;
  onPress(): void;
}) {
  const colors = useWalletColors();
  const t = useDraftCopy(LINES);
  const large = useLargeText();
  const { hidden } = usePrivateMode();
  const { lookOf } = useWalletLooks();
  const material = wallet === null ? null : lookOf(wallet.id).material;
  const paint = material === null ? null : materialPaint(material, colors.isDark);
  const ink = paint === null ? colors.ink : paint.text;
  const quiet = paint === null ? colors.quiet : paint.quietText;
  const name = wallet === null ? t('add.chooseWallet') : wallet.name;
  const say = (minor: Minor) => (hidden ? t('common.amountHidden') : spokenMoney(minor, t));
  const label = [role, name, balance === null ? null : say(balance), after === null ? null : t('add.after', { amount: say(after) })]
    .filter((part): part is string => part !== null)
    .join(' ');
  const [beforeAfter, afterAfter] = around(t('add.after'));
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: CARD,
        flexDirection: large ? 'column' : 'row',
        justifyContent: 'space-between',
        gap: large ? 6 : 12,
        paddingVertical: 11,
        paddingHorizontal: 16,
        borderRadius: 18,
        backgroundColor: material === null ? colors.raised : undefined,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {material === null ? null : <MaterialFill material={material} radius={18} />}
      <View style={{ flexShrink: 1, justifyContent: 'space-between', gap: 4 }}>
        <WalletText role="caption" style={{ color: quiet }}>{role}</WalletText>
        <WalletText role="body" style={{ fontWeight: '700', color: ink }}>{name}</WalletText>
      </View>
      {balance === null ? null : (
        <View style={{ alignItems: large ? 'flex-start' : 'flex-end', justifyContent: 'space-between', gap: 4 }}>
          <WalletAmount testID={`${testID}-balance`} minor={balance} sign="balance" size={17} color={ink} />
          {after === null ? null : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 4 }}>
              {beforeAfter === '' ? null : <WalletText role="caption" style={{ color: quiet }}>{beforeAfter}</WalletText>}
              <WalletAmount testID={`${testID}-after`} minor={after} sign="balance" size={13} color={ink} />
              {afterAfter === '' ? null : <WalletText role="caption" style={{ color: quiet }}>{afterAfter}</WalletText>}
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}
```

`PL/diffs/apps_app_src_wallet_add_ConfirmStep.tsx.diff`:
```diff
diff --git a/apps/app/src/wallet/add/ConfirmStep.tsx b/apps/app/src/wallet/add/ConfirmStep.tsx
index 84e2953d77a0b3b1ac397094f75a6ba25495e746..6c4a89de8ebcb466f9ffc4e5d18014063e9c80fa 100644
--- a/apps/app/src/wallet/add/ConfirmStep.tsx
+++ b/apps/app/src/wallet/add/ConfirmStep.tsx
@@ -17,8 +17,11 @@
 // - Private mode (W10): the amount follows the amount step's rule (R106): what
 //   the person typed shows, and a fill (Bun's reading, a chip, move all) is
 //   ฿•••• and says only that it is hidden. Bun's sentence is the person's own
-//   words, but it holds the amount Bun read, so every number in it is masked
-//   too: “ข้าวมันไก่ 50” reads “ข้าวมันไก่ ฿••••” (Review Focus 2).
+//   words, but it holds the amount Bun read, in any form Bun reads: digits,
+//   Thai or English number words, scale words such as พัน or k. No mask keeps
+//   up with every form, so in private mode none of it is drawn: the violet line
+//   says only that Bun read it from what the person told it (R114; Review
+//   Focus 2).
 // - Income's amount is violet with a plus (§2); spending and a move are ink.
 // - At the largest text sizes the summary and each row stack, and nothing is
 //   clamped (Review Focus 3).
@@ -56,9 +59,6 @@ const AMOUNT = 44;
 /** The summary's tile (bw-tray-confirm). */
 const TILE = 52;

-/** Every number in Bun's sentence, with a ฿ before it: masked in private mode. */
-const NUMBER = /(?:฿\s?)?[0-9๐-๙]+(?:[.,][0-9๐-๙]+)*/g;
-
 /**
  * The confirm step's title (bw-tray-confirm): the merchant, else the note,
  * else the category's name (its row's value), else the tray's title. `t` reads
@@ -89,7 +89,6 @@ export function ConfirmStep({ draft, keypad, onStep, rows, title, bunSentence, t
   const categoryId = type === 'transfer' ? null : draft.categoryByType[type];
   const category = categoryId === null ? undefined : lookups.categories.get(categoryId);
   const categoryName = rows.find((row) => row.key === 'category')?.value ?? '';
-  const sentence = bunSentence === null ? null : hidden ? bunSentence.replace(NUMBER, HIDDEN_AMOUNT) : bunSentence;
   const walletOf = (key: ConfirmRow['key']) => (key === 'wallet' ? draft.walletId : key === 'from' ? draft.fromWalletId : key === 'to' ? draft.toWalletId : null);
   return (
     <View testID="confirm-step" style={{ gap: 14 }}>
@@ -104,8 +103,10 @@ export function ConfirmStep({ draft, keypad, onStep, rows, title, bunSentence, t
           )}
           <View style={{ flex: 1, gap: 2 }}>
             <WalletText testID="confirm-title" role="h2">{title}</WalletText>
-            {sentence === null ? null : (
-              <WalletText testID="confirm-bun" role="caption" tone="violet">{t('add.bunReadFrom', { sentence })}</WalletText>
+            {bunSentence === null ? null : (
+              <WalletText testID="confirm-bun" role="caption" tone="violet">
+                {hidden ? t('add.bunReadHidden') : t('add.bunReadFrom', { sentence: bunSentence })}
+              </WalletText>
             )}
           </View>
         </View>
```

`PL/diffs/apps_app_src_wallet_add_TransferStep.tsx.diff`:
```diff
diff --git a/apps/app/src/wallet/add/TransferStep.tsx b/apps/app/src/wallet/add/TransferStep.tsx
index 416a8673e62bd6f368b096299dd3c15d9d7eca27..07aecb15985418d879a3203b04bb3d8897ae66bb 100644
--- a/apps/app/src/wallet/add/TransferStep.tsx
+++ b/apps/app/src/wallet/add/TransferStep.tsx
@@ -6,7 +6,7 @@
 // button between them, the amount being moved, and move all. TransferFooter is
 // its footer, which the host passes to the tray's pinned `footer`: the note
 // that a move is not spending, and Next, which waits for two different
-// wallets. Both are controlled (StepProps), as every step is.
+// wallets in use. Both are controlled (StepProps), as every step is.
 //
 // - A card opens its wallet step (`from` or `to`), which comes back here
 //   (WalletPick's `back`). Swap exchanges the two wallets in the draft, so
@@ -14,7 +14,10 @@
 // - Balances are the server's (the host's `balances`, less waiting drafts).
 //   Offline there are none: the cards show names only, with no after line and
 //   no move all, since a guessed balance would be a wrong number on screen
-//   (today's WalletPicker). Archived wallets are never shown, as today.
+//   (today's WalletPicker). Archived wallets are never shown, as today: a
+//   side whose wallet is archived or not listed asks for one, and Next waits
+//   for it as for a side with none. The cards and Next read one rule
+//   (`inUse`), so they never disagree (R114; the reviews' m1).
 // - Move all fills the amount with the from wallet's whole balance, as a fill
 //   (filledKeypad). It is offered only when that balance is known, above zero
 //   (moveAllMinor) and within the amount cap: keypadFromMinor refuses more,
@@ -82,6 +85,11 @@ function around(template: string): [string, string] {
   return [template.slice(0, at).trim(), template.slice(at + '{amount}'.length).trim()];
 }

+/** A side's wallet while it is in use; null for none, an archived wallet or one not listed. The cards ask for a wallet, and Next waits, by this one rule. */
+function inUse(wallets: readonly WalletSnapshot[], id: string | null): WalletSnapshot | null {
+  return id === null ? null : wallets.find((wallet) => wallet.id === id && !wallet.archived) ?? null;
+}
+
 export function TransferStep({ draft, keypad, onDraft, onKeypad, onStep, wallets, balances }: StepProps & {
   wallets: readonly WalletSnapshot[];
   /** Each wallet's available balance from the server; null offline. */
@@ -93,10 +101,8 @@ export function TransferStep({ draft, keypad, onDraft, onKeypad, onStep, wallets
   const { hidden } = usePrivateMode();
   const typed = evaluateKeypad(keypad, { allowZero: true });
   const after = balancesAfter(balances, draft.fromWalletId, draft.toWalletId, typed.ok ? typed.minor : '0');
-  // Wallets in use only: a copied record's archived wallet asks for another, as today's picker does.
-  const listed = (id: string | null) => (id === null ? null : wallets.find((wallet) => wallet.id === id && !wallet.archived) ?? null);
-  const from = listed(draft.fromWalletId);
-  const to = listed(draft.toWalletId);
+  const from = inUse(wallets, draft.fromWalletId);
+  const to = inUse(wallets, draft.toWalletId);
   const balanceOf = (wallet: WalletSnapshot | null) => (wallet === null || balances === null ? null : balances.get(wallet.id) ?? null);
   const moveAll = moveAllOffer(balances, from?.id ?? null);
   // A fill is masked as a stored amount is; what the person typed shows (R106).
@@ -166,13 +172,22 @@ export function TransferStep({ draft, keypad, onDraft, onKeypad, onStep, wallets
   );
 }

-/** The step's footer, for the tray's pinned `footer`: the note that a move is not spending, and Next. */
-export function TransferFooter({ draft, onStep }: StepProps) {
+/**
+ * The step's footer, for the tray's pinned `footer`: the note that a move is
+ * not spending, and Next. Next reads the sides by the cards' rule (`inUse`).
+ * It does not read the amount: the amount is the amount step's, whose Next
+ * waits for one the keypad can save, and this step has no keys to change it
+ * (the second review's n2).
+ */
+export function TransferFooter({ draft, onStep, wallets }: StepProps & {
+  /** TransferStep's wallets: a side whose wallet is not in use keeps Next waiting, as its card asks for one. */
+  wallets: readonly WalletSnapshot[];
+}) {
   const colors = useWalletColors();
   const tc = useCopy();
   const t = useDraftCopy(LINES);
-  const { fromWalletId: from, toWalletId: to } = draft;
-  // One wallet on both sides cannot be a move: today's words say so (as WalletPicker does), and Next waits.
+  const [from, to] = [inUse(wallets, draft.fromWalletId), inUse(wallets, draft.toWalletId)];
+  // One wallet in use on both sides cannot be a move: today's words say so (as WalletPicker does), and Next waits.
   const problem = from !== null && from === to ? tc('Choose two different wallets') : null;
   useAnnouncement(problem);
   return (
```

`PL/diffs/apps_app_src_wallet_add_PickSteps.tsx.diff`:
```diff
diff --git a/apps/app/src/wallet/add/PickSteps.tsx b/apps/app/src/wallet/add/PickSteps.tsx
index 129a17e72ef06f1a9890a4e75c55722e23850106..a75433bf04d7eb9ac6ee19da30e91236fe077315 100644
--- a/apps/app/src/wallet/add/PickSteps.tsx
+++ b/apps/app/src/wallet/add/PickSteps.tsx
@@ -18,7 +18,8 @@
 //   a pick never puts one wallet on both sides.
 // - DatePick: one day back or forward (stepDay), never past today and never
 //   before `earliest` (the wallet's tracking start): an arrow that cannot step
-//   is disabled, and a draft dated before the start opens at the start. วันนี้
+//   is disabled; a draft dated before the start opens at the start, and one
+//   dated after today (no add path makes one) opens on today. วันนี้
 //   comes back to today, and เสร็จ keeps the day. Each day change ticks once
 //   (dateStep), as today's date chip does. No time (W12).
 // - NotePick: the note, at most 500 characters (NOTE_MAX_CHARS), and เสร็จ.
@@ -177,7 +178,7 @@ export function WalletPick({ draft, onDraft, onStep, wallets, balances, role, ba
             <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1, flexGrow: 1 }}>
               {/* A radio mark, so the choice never rests on the ring's colour alone. */}
               <View {...DECORATIVE} style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
-                {checked ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ink }} /> : null}
+                {checked ? <View testID="pick-wallet-dot" style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ink }} /> : null}
               </View>
               <View {...DECORATIVE} style={{ width: 34, height: 22 }}>
                 <MaterialFill material={lookOf(wallet.id).material} radius={5} />
@@ -201,8 +202,8 @@ export function DatePick({ draft, onDraft, onStep, today, earliest }: StepProps
   const tc = useCopy();
   const t = useDraftCopy(LINES);
   const locale = useActiveLocale();
-  // A draft dated before the wallet's start (a copy, a start moved later) opens at the start.
-  const [day, setDay] = useState(() => (earliest !== undefined && draft.occurredOn < earliest ? earliest : draft.occurredOn));
+  // A draft dated before the wallet's start (a copy, a start moved later) opens at the start; one dated after today opens on today.
+  const [day, setDay] = useState(() => (earliest !== undefined && draft.occurredOn < earliest ? earliest : draft.occurredOn > today ? today : draft.occurredOn));
   const change = (next: string | null) => {
     if (next === null || next === day) return;
     playHaptic('dateStep');
```

`PL/diffs/apps_app_src_wallet_add_copy.ts.diff`:
```diff
diff --git a/apps/app/src/wallet/add/copy.ts b/apps/app/src/wallet/add/copy.ts
index 8e265aeb8709de4645db1cce5124a7c686faa114..455e0ada5b70a06897276d16e2e58871dfb2bba7 100644
--- a/apps/app/src/wallet/add/copy.ts
+++ b/apps/app/src/wallet/add/copy.ts
@@ -35,6 +35,8 @@ export const COPY = {
   'add.moveAll': { th: 'ย้ายทั้งหมด {amount}', en: 'Move all {amount}' },
   'add.transferNote': { th: 'โอนระหว่างกระเป๋าของคุณเอง ไม่นับเป็นรายจ่าย', en: 'A move between your own wallets is not spending' },
   'add.bunReadFrom': { th: 'บันอ่านจาก “{sentence}”', en: 'Bun read this from “{sentence}”' },
+  // Draft (R114): in private mode the line quotes none of what the person told Bun, which can hold the amount in any form.
+  'add.bunReadHidden': { th: 'บันอ่านจากที่คุณบอก', en: 'Bun read this from what you told it' },
   'add.bunGuess': { th: 'บันเดา', en: "Bun's guess" },
   'add.rowCategory': { th: 'หมวด', en: 'Category' },
   'add.rowWallet': { th: 'กระเป๋า', en: 'Wallet' },
```

`PL/diffs/apps_app_src_dev_catalogue_wallet_addSections.tsx.diff`:
```diff
diff --git a/apps/app/src/dev/catalogue/wallet/addSections.tsx b/apps/app/src/dev/catalogue/wallet/addSections.tsx
index 35c69aac6a7aa0486d6a99a5eee2c51a22d493c3..07065110344b081997f01516457568e4a9dbcfe0 100644
--- a/apps/app/src/dev/catalogue/wallet/addSections.tsx
+++ b/apps/app/src/dev/catalogue/wallet/addSections.tsx
@@ -14,48 +14,40 @@
 // sheet are P2-T15's and P2-T16's.
 //
 // P2-T15's four: the transfer step (rh-transfer's numbers), the confirm step
-// (bw-tray-confirm) typed and as Tell Bun filled it, and the category pick,
-// each in a Tray that opens at once at its step. The steps move as a host
-// moves them: Next goes from the transfer step to confirm, a row opens its
-// pick, a card opens its wallet pick, and a pick goes back to the step that
-// opened it, with the choice, or with nothing changed by the tray's back. A
-// change undoes Bun's guess on that row (stillGuessed). Save goes nowhere
-// here, and there is no back to the amount: saving and the amount step's place
-// in the flow are the host's (P2-T16).
+// (bw-tray-confirm) typed and as Tell Bun filled it, and the category pick.
+// Their host, StepsTray, is addStepsSection.tsx, loaded lazily (the
+// controller's rule for sections, as recordSections.tsx loads its screen), so
+// this list never loads the steps. While it loads, the section reads
+// `catalogue-screen-running`, as a screen section's stage does while its
+// script runs, so the catalogue's suites wait for it.
 //
 // Their own list, spread after the tray's in ./index.ts. The sample words are
 // catalogue samples, not app copy. A section never imports the wallet test
 // harness, which loads vitest.
-import { BUILTIN_CATEGORIES } from '@gogospend/contracts';
-import type { CategoryDto, Minor, WalletSnapshot } from '@gogospend/contracts';
-import { useMemo, useState } from 'react';
-import type { ReactNode } from 'react';
+import { lazy, Suspense, useState } from 'react';
 import { View } from 'react-native';

-import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
+import { useCopy } from '@mobile/i18n/useCopy';
 import type { QuickAddDraft } from '@mobile/spend/v1/redesign/quickAddModel';
-import { rankRecentCategories } from '@mobile/spend/v1/redesign/recentCategories';
 import type { Lookups } from '@mobile/spend/v1/redesign/shared';
 import { keypadFromMinor } from '@mobile/ui/keypadExpression';
 import type { KeypadProblem, KeypadState } from '@mobile/ui/keypadExpression';
 import { BUN_SPACE } from '@mobile/ui/layout';
-import { amountProblem, confirmRows, filledKeypad, stillGuessed, trayTitleKey } from '@mobile/wallet/add/addFlow';
-import type { AddStep, AddType, StepProps } from '@mobile/wallet/add/addFlow';
+import { amountProblem, filledKeypad, trayTitleKey } from '@mobile/wallet/add/addFlow';
+import type { AddType } from '@mobile/wallet/add/addFlow';
 import { AmountFooter, AmountStep } from '@mobile/wallet/add/AmountStep';
-import { ConfirmStep, confirmTitle } from '@mobile/wallet/add/ConfirmStep';
 import { COPY } from '@mobile/wallet/add/copy';
-import { CategoryPick, DatePick, isPickStep, NotePick, WalletPick } from '@mobile/wallet/add/PickSteps';
 import type { QuickChip } from '@mobile/wallet/add/QuickChips';
-import { TransferFooter, TransferStep } from '@mobile/wallet/add/TransferStep';
 import { TypeSwitchHeader, useSwitchInHeader } from '@mobile/wallet/add/TypeSwitchHeader';
-import { COMMON_COPY } from '@mobile/wallet/common/copy';
 import type { DraftTable } from '@mobile/wallet/copy/draftText';
 import { useDraftCopy } from '@mobile/wallet/copy/useDraftCopy';
-import { PrimaryButton } from '@mobile/wallet/tray/PrimaryButton';
 import { TextLink } from '@mobile/wallet/tray/TextLink';
 import { Tray } from '@mobile/wallet/tray/Tray';
 import { SpecimenLabel } from '../parts';
 import type { CatalogueSection } from '../registry';
+import type { StepStart } from './addStepsSection';
+
+const StepsTray = lazy(() => import('./addStepsSection'));

 const SAMPLES = {
   ...COPY,
@@ -145,139 +137,12 @@ function AmountTray({ label, start }: { label: string; start: Start }) {
   );
 }

-// ---------------------------------------------------------------------------
-// P2-T15: the transfer, confirm and pick steps
-
-const STEP_SAMPLES = {
-  ...COMMON_COPY,
-  ...SAMPLES,
-  'sample.cash': { th: 'เงินสด', en: 'Cash' },
-  'sample.savings': { th: 'บัญชีออม', en: 'Savings' },
-  'sample.chickenRice': { th: 'ข้าวมันไก่', en: 'Chicken rice' },
-  'sample.bunSaid': { th: 'ข้าวมันไก่ 50', en: 'chicken rice 50' },
-} as const satisfies DraftTable;
-
-/** The boards' day, so every capture reads the same. */
-const SAMPLE_TODAY = '2026-10-24';
-/** The sample wallets: the main account (lavender silk), cash (cream paper, rh-transfer's) and savings (peach). */
-const CASH_ID = 'bw-add-cash-wallet';
-const SAVINGS_ID = 'bw-add-savings-wallet';
-/** rh-transfer's balances: ฿24,860 and ฿1,240; savings ฿120,000. */
-const SAMPLE_BALANCES: ReadonlyMap<string, Minor> = new Map([[WALLET_ID, '2486000'], [CASH_ID, '124000'], [SAVINGS_ID, '12000000']]);
-
-/** The built-in categories, as a new account has them. */
-const SAMPLE_CATEGORIES: readonly CategoryDto[] = BUILTIN_CATEGORIES.map((category) => ({
-  id: `bw-add-category-${category.key}`, type: category.type, builtin_key: category.key, label: null, color: category.color, archived: false, version: 1,
-}));
-
-/** No records yet, so each type's ranking is the built-in order (P2-T5's rank, without the module that loads expo-crypto). */
-const SAMPLE_RANKING = {
-  expense: rankRecentCategories({ type: 'expense', categories: SAMPLE_CATEGORIES, records: [], today: SAMPLE_TODAY }),
-  income: rankRecentCategories({ type: 'income', categories: SAMPLE_CATEGORIES, records: [], today: SAMPLE_TODAY }),
-};
-
-type StepStart = {
-  step: 'transfer' | 'confirm' | 'category';
-  type: AddType;
-  amountMinor: string;
-  /** Bun filled the amount: a fill, which private mode masks. */
-  filled: boolean;
-  merchant: string;
-  /** Tell Bun filled the entry from this sample line. */
-  bunSaid: boolean;
-  guessed: readonly string[];
-};
-
-function stepDraft(start: StepStart, merchant: string): QuickAddDraft {
-  return {
-    mode: 'create', recordId: 'bw-add-record', commandId: 'bw-add-command', type: start.type, amountMinor: '', occurredOn: SAMPLE_TODAY,
-    walletId: WALLET_ID, categoryByType: { expense: 'bw-add-category-food', income: 'bw-add-category-salary' },
-    fromWalletId: WALLET_ID, toWalletId: CASH_ID, note: '', merchant,
-  };
-}
-
-/** The later tracking start of the entry's wallets: no earlier day can be saved (as entryHelpers' earliestFor). */
-function earliestOf(draft: QuickAddDraft, wallets: readonly WalletSnapshot[]): string | undefined {
-  const ids = draft.type === 'transfer' ? [draft.fromWalletId, draft.toWalletId] : [draft.walletId];
-  const starts = wallets.filter((wallet) => ids.includes(wallet.id)).map((wallet) => wallet.tracking_start).sort();
-  return starts.at(-1);
-}
-
-/** The transfer, confirm and pick steps in a tray that opens at once at its step, moving as a host moves them; closed and opened again, it starts over. */
-function StepsTray({ label, start }: { label: string; start: StepStart }) {
-  const t = useDraftCopy(STEP_SAMPLES);
-  const tc = useCopy();
-  const locale = useActiveLocale();
-  const wallets = useMemo(() => [
-    [WALLET_ID, t('sample.wallet')],
-    [CASH_ID, t('sample.cash')],
-    [SAVINGS_ID, t('sample.savings')],
-  ].map(([id, name]): WalletSnapshot => ({ id, name, currency: 'THB', opening_minor: '0', tracking_start: '2026-10-01', archived: false, version: 1 })), [t]);
-  const lookups: Lookups = {
-    wallets: new Map(wallets.map((wallet) => [wallet.id, { id: wallet.id, name: wallet.name }])),
-    categories: new Map(SAMPLE_CATEGORIES.map((category) => [category.id, category])),
-  };
-  const keypadOf = () => (start.filled ? filledKeypad(start.amountMinor) : keypadFromMinor(start.amountMinor));
-  const [open, setOpen] = useState(true);
-  const [draft, setDraft] = useState(() => stepDraft(start, start.merchant === '' ? '' : t(start.merchant)));
-  const [keypad, setKeypad] = useState<KeypadState>(keypadOf);
-  const [step, setStep] = useState<AddStep>(start.step);
-  const [back, setBack] = useState<AddStep>('confirm');
-  const [guessed, setGuessed] = useState<ReadonlySet<string>>(() => new Set(start.guessed));
-  const reset = () => {
-    setDraft(stepDraft(start, start.merchant === '' ? '' : t(start.merchant)));
-    setKeypad(keypadOf());
-    setStep(start.step);
-    setBack('confirm');
-    setGuessed(new Set(start.guessed));
-  };
-  const props: StepProps = {
-    draft,
-    keypad,
-    onDraft: (next) => {
-      setGuessed((now) => stillGuessed(now, draft, next));
-      setDraft(next);
-    },
-    onKeypad: setKeypad,
-    onStep: (next) => {
-      if (isPickStep(next)) setBack(step);
-      setStep(next);
-    },
-  };
-  const rows = confirmRows(draft, { lookups, today: SAMPLE_TODAY, dateLocale: locale, guessed, tc });
-  let middle: ReactNode = null;
-  let footer: ReactNode;
-  if (step === 'transfer') {
-    middle = <TransferStep {...props} wallets={wallets} balances={SAMPLE_BALANCES} />;
-    footer = <TransferFooter {...props} />;
-  } else if (step === 'confirm') {
-    middle = <ConfirmStep {...props} rows={rows} title={confirmTitle(draft, rows, t)} bunSentence={start.bunSaid ? t('sample.bunSaid') : null} type={draft.type} lookups={lookups} />;
-    footer = <PrimaryButton label={t('common.save')} onPress={() => undefined} />;
-  } else if (step === 'category') {
-    middle = <CategoryPick {...props} categories={SAMPLE_CATEGORIES} ranking={SAMPLE_RANKING} />;
-  } else if (step === 'wallet' || step === 'from' || step === 'to') {
-    middle = <WalletPick {...props} wallets={wallets} balances={SAMPLE_BALANCES} role={step} back={back} />;
-  } else if (step === 'date') {
-    middle = <DatePick {...props} today={SAMPLE_TODAY} earliest={earliestOf(draft, wallets)} />;
-  } else if (step === 'note') {
-    middle = <NotePick {...props} />;
-  }
+/** One of P2-T15's sections: its steps load lazily, and until they do the section reads `catalogue-screen-running`. */
+function stepsSection(label: string, start: StepStart) {
   return (
-    <View style={{ gap: BUN_SPACE.xs, alignItems: 'flex-start' }}>
-      <SpecimenLabel>{label}</SpecimenLabel>
-      <TextLink label={t('sample.open')} onPress={() => setOpen(true)} />
-      <Tray
-        visible={open}
-        onClose={() => setOpen(false)}
-        onClosed={reset}
-        title={t(trayTitleKey(draft.type))}
-        step={step}
-        onBack={isPickStep(step) ? () => setStep(back) : undefined}
-        footer={footer}
-      >
-        {middle}
-      </Tray>
-    </View>
+    <Suspense fallback={<View testID="catalogue-screen-running" style={{ flex: 1 }} />}>
+      <StepsTray label={label} start={start} />
+    </Suspense>
   );
 }

@@ -308,44 +173,36 @@ export const WALLET_ADD_SECTIONS: readonly CatalogueSection[] = [
     id: 'bw-tray-transfer',
     title: 'Bun Wallet: add tray, transfer',
     group: 'Kit',
-    render: () => (
-      <StepsTray
-        label="Move: ฿500 from the main account to cash, each card's balance after the move, swap and move all, over the note and Next"
-        start={{ step: 'transfer', type: 'transfer', amountMinor: '50000', filled: false, merchant: '', bunSaid: false, guessed: [] }}
-      />
+    render: () => stepsSection(
+      "Move: ฿500 from the main account to cash, each card's balance after the move, swap and move all, over the note and Next",
+      { step: 'transfer', type: 'transfer', amountMinor: '50000', filled: false, merchant: '', bunSaid: false, guessed: [] },
     ),
   },
   {
     id: 'bw-tray-confirm',
     title: 'Bun Wallet: add tray, confirm',
     group: 'Kit',
-    render: () => (
-      <StepsTray
-        label="Confirm: ฿50 of food from the main account today, each row opening its pick (Save goes nowhere here)"
-        start={{ step: 'confirm', type: 'expense', amountMinor: '5000', filled: false, merchant: '', bunSaid: false, guessed: [] }}
-      />
+    render: () => stepsSection(
+      'Confirm: ฿50 of food from the main account today, each row opening its pick (Save goes nowhere here)',
+      { step: 'confirm', type: 'expense', amountMinor: '5000', filled: false, merchant: '', bunSaid: false, guessed: [] },
     ),
   },
   {
     id: 'bw-tray-confirm-bun',
     title: "Bun Wallet: add tray, confirm with Bun's reading",
     group: 'Kit',
-    render: () => (
-      <StepsTray
-        label="Confirm as Tell Bun filled it: what Bun read, ฿50 as Bun's fill, and the category marked as Bun's guess"
-        start={{ step: 'confirm', type: 'expense', amountMinor: '5000', filled: true, merchant: 'sample.chickenRice', bunSaid: true, guessed: ['category'] }}
-      />
+    render: () => stepsSection(
+      "Confirm as Tell Bun filled it: what Bun read, ฿50 as Bun's fill, and the category marked as Bun's guess",
+      { step: 'confirm', type: 'expense', amountMinor: '5000', filled: true, merchant: 'sample.chickenRice', bunSaid: true, guessed: ['category'] },
     ),
   },
   {
     id: 'bw-tray-pick-category',
     title: 'Bun Wallet: add tray, choose a category',
     group: 'Kit',
-    render: () => (
-      <StepsTray
-        label="The category pick: spending's categories in ranked order, food chosen; a tap goes back to confirm with the choice"
-        start={{ step: 'category', type: 'expense', amountMinor: '5000', filled: false, merchant: '', bunSaid: false, guessed: [] }}
-      />
+    render: () => stepsSection(
+      "The category pick: spending's categories in ranked order, food chosen; a tap goes back to confirm with the choice",
+      { step: 'category', type: 'expense', amountMinor: '5000', filled: false, merchant: '', bunSaid: false, guessed: [] },
     ),
   },
 ];
```

`PL/diffs/docs_implementation_receipts_P2-T15.md.diff`:
```diff
diff --git a/docs/implementation/receipts/P2-T15.md b/docs/implementation/receipts/P2-T15.md
index 3189e53cb4349451c5b2255ff83cff703c1cd7db..89ffbb7ca2c2d1616f194ff6a98cf1216e9c191f 100644
--- a/docs/implementation/receipts/P2-T15.md
+++ b/docs/implementation/receipts/P2-T15.md
@@ -1,13 +1,14 @@
 # P2-T15: The transfer, confirm and pick steps

 - **Status:** built and verified locally on `p2/t15-transfer-confirm-pick` (`.claude/worktrees/p2-t15`), from `9a7b767e`. Committed locally, not pushed. The independent review is the controller's, after this receipt. Under ruling R87 this receipt is its own file; `premium-progress.md` is not edited.
+- **Fix round:** PR #427's two reviews said Needs fixes. The controller ruled R114, and `receipts/P2-T15-fix.md` records the round: in private mode Bun's sentence is not drawn at all; Next waits for two different wallets in use; the reviews' survivors are pinned; the steps' sections load lazily.
 - **Base:** `9a7b767e`. The brief was proven at `88d82ce8` (app code `8434af6`). `git log --oneline 88d82ce8..HEAD` lists these merged pull requests: #411 (P2-T32, the month recap, merge `ab9f2c10`) and #412 (P2-T25, recently deleted, merge `82b96699`), with their merge-ups and controller sync commits. Step 0.3 found 26 changed files under `apps/app`, none of them this task's and none of the three shared files, so no `git apply --3way` was needed: the three matched their `orig/` checksums. Their catalogue sections and their routes-test stubs move two counts. The catalogue's wallet sections are C = 52 at this base, not 42, and the routes count R stays 15 (the stubs add no case). N = 138, as the brief has it.
 - **Files:** created `apps/app/src/wallet/add/TransferStep.tsx` (261 lines), `ConfirmStep.tsx` (187), `PickSteps.tsx` (288), `AddSteps.render.test.tsx` (662 lines, 14 cases) and this receipt. Modified `apps/app/src/wallet/add/copy.ts` (31 lines before, 48 after: the plan's thirteen keys and `add.addNote`), `apps/app/src/dev/catalogue/wallet/addSections.tsx` (149 before, 351 after: four sections and their host) and `apps/app/src/wallet/wallets/WalletsList.render.test.tsx` (500 before and after: one line, the sections case's first id, now `bw-tray-pick-category`).
 - **What changed:**
   - The transfer step and its footer (`TransferStep`, `TransferFooter`). The from and to cards are 84 pt each, on their wallets' own materials, with the side's word, the name, the balance and the after line (`balancesAfter`, exact in BigInt; the case pins 9007199254740993 satang, ฿90,071,992,547,409.93, one past 2^53, less ฿500). The swap button sits on the seam and exchanges the two wallets in the draft. The amount being moved is 52 pt, centred. Move all is offered only for a known balance above zero and within the amount cap, which this step checks (`moveAllMinor` is unchanged and returns any positive balance). Offline the cards show names only, with no after line and no move all. The footer says a move is not spending, and Next waits for two different wallets before it goes to confirm.
   - The confirm step (`ConfirmStep`, `confirmTitle`). The category's tile (for a move, the swap mark on a raised 52 pt tile), the title (the merchant, else the note, else the category's name, else the tray's title), what Bun read when the host passes it, the amount at 44 pt, and one row per `ConfirmRow`, each at least 52 pt, each opening its pick. A guessed row says บันเดา. A row with nothing chosen says what to add: เลือกหมวดหมู่, เลือกกระเป๋า or เพิ่มโน้ต. No time and no photo row (W12, W15).
   - The four picks (`CategoryPick`, `WalletPick` with `back`, `DatePick`, `NotePick`, and `isPickStep`). Each writes its choice through `onDraft` and goes back, and the tray's back leaves a pick unchanged. The category pick lists the type's categories in use in ranking order, then any the ranking does not hold, four across (two at the largest sizes). The wallet pick lists the wallets in use with their balances when known; for a move, picking the wallet already on the other side swaps the two. The day steps one day at a time, never before the wallet's start (`earliest`) or past today, with วันนี้ and เสร็จ. The note takes at most 500 characters.
-  - Private mode (W10). Every stored amount is a `WalletAmount`, masked as ฿••••: the balances, the after lines, move all and the wallet pick's balances. The amount line shows what was typed and masks a fill (move all, Bun's reading, a chip). Bun's sentence masks every number in it, Thai digits included.
+  - Private mode (W10). Every stored amount is a `WalletAmount`, masked as ฿••••: the balances, the after lines, move all and the wallet pick's balances. The amount line shows what was typed and masks a fill (move all, Bun's reading, a chip). Bun's sentence masked every number in it, Thai digits included; the fix round draws none of it in private mode instead (R114).
   - Sections. `bw-tray-transfer`, `bw-tray-confirm`, `bw-tray-confirm-bun` and `bw-tray-pick-category` follow `bw-tray-income`, each in a `Tray` opened at once, with a small host (`StepsTray`). The wallets list's sections case reads `bw-tray-pick-category` as the add tray's last section.
   - Copy. `add/copy.ts` takes the plan's thirteen keys and `add.addNote`. The four reused catalogue lines (เลือกหมวดหมู่, เลือกกระเป๋าเงินสองใบที่ต่างกัน, วันก่อนหน้า, วันถัดไป) are read through `tc`, unchanged.
 - **RED to GREEN:**
@@ -32,7 +33,7 @@
   - The controller accepted the planner's calls P1 to P19 as written: P1 (ready after P2-T14), P2 (the proof's base), P3 (names and files beyond the plan's list, below), P4 (the transfer step), P5 (move all and the cap), P6 (the transfer footer), P7 (the confirm step), P8 (private mode), P9 (the picks), P10 (the largest text sizes), P11 (the sections), P12 (the test seams), P13 (the cases beyond the plan's), P14 (104 mutants), P15 (clear of the work in flight), P16 (the gate), P17 (differences from the boards, for E2-B), P18 (notes for later tasks) and P19 (the followups).
   - P3, the names and files beyond the plan's list: `TransferFooter` (in `TransferStep.tsx`, for the tray's pinned footer); `confirmTitle` (in `ConfirmStep.tsx`, the title's rule, with the tray's title as its last fallback); `ConfirmStep` takes `lookups`, since the plan's props cannot reach a category's look or a wallet row's material; `WalletPick` takes `back`, and `isPickStep` tells the host which steps are picks; the sections join P2-T14's list in `addSections.tsx`, and one line of P2-T20's test follows them; `add.addNote` joins `copy.ts`.
   - Move all is never offered above ฿999,999,999.99 (P5). This supersedes the P2-T14-fix note, which said to apply `moveAllMinor` with `filledKeypad` in a try and set `too_large` when it throws. The cap is checked in `TransferStep` (`BigInt(all) <= MINOR_AMOUNT_MAX`), so no move all is offered above it and nothing in private mode says why. P5 settles the followup. It is the first thing the reviewer should check.
-  - Bun's sentence is masked in private mode, every number in it (P8c).
+  - Bun's sentence was masked in private mode, every number in it (P8c). The fix round replaced that: in private mode none of it is drawn (R114).
   - The catalogue's C is 52 at this base, from #411's and #412's sections. That is a measured base, not a change in this task's code.
   - The English lines are drafts for E2-B (P17), and so is every pick, which has no board.
 - **SKIPPED:** `typecheck:routes` and `export:web` (no route, config or app-entry change; CI runs `export:web`); the full render suite (CI, R100; the catalogue's every-section and screen-reader suites pick up the four sections there, and the large-text suite does not open them); the iOS export (CI); `test:ops` (no package or lockfile change); the API, edge and database suites (nothing outside `apps/app` changes, and Docker is stopped); device and simulator checks: VoiceOver on the cards, the rows, the picks' radio groups and the day's live region; the swap button on the seam on a phone; the note field with the Thai keyboard up on a 667 pt phone; Android's back on a pick; and E2-B's screenshots (the controller's, after P2-T28).
@@ -40,6 +41,6 @@
 - **Notes for later tasks** (ruling P18):
   - **P2-T16 (the host):** the steps are amount then confirm, or amount, transfer, confirm. A row opens its pick. Keep the step that opened a pick (`isPickStep`) and pass it as `WalletPick`'s `back` (the transfer step's cards, the amount step's wallet chip). The tray's back on a pick goes there with nothing changed, and on the transfer and confirm steps it goes to the amount. Footers: `AmountFooter` on the amount, `TransferFooter` on the transfer, Save on confirm, and none on a pick (its เสร็จ is in its middle). `ConfirmStep`: `rows` from `confirmRows(draft, { lookups, today, dateLocale, guessed, tc })`, `title={confirmTitle(draft, rows, t)}` with `t` reading `add/copy.ts`, `bunSentence` (what the person told Bun when Tell Bun filled the entry, else null), and `lookups`. `DatePick`: `earliest={earliestFor(draft, wallets) ?? undefined}`. Pass every `onDraft` through `stillGuessed`. Every amount the person did not type goes in through `filledKeypad` (R106, P2-T14-fix). A copied move with one wallet on both sides can reach confirm only if the host opens it there; `TransferFooter` keeps the transfer step from going on with one wallet or none. Still the host's, from P2-T14's reviews: where the type switch goes on the steps after the amount at AX5, and that a change to transfer always goes to the transfer step. These steps draw no switch, and the sections leave it out.
   - **P2-T27 (the edit tray):** reuses `ConfirmStep` and the picks; `WalletPick`'s `back` names the step that opened it.
-  - **P2-T37 (the sweep):** `transfer-amount` and `confirm-amount` show what the person typed, as `add-amount` does, never a fill. Bun's sentence has no digit in private mode. The day stepper's dates (พฤหัส 22 ต.ค.) and older date rows carry digits that are not amounts.
+  - **P2-T37 (the sweep):** `transfer-amount` and `confirm-amount` show what the person typed, as `add-amount` does, never a fill. In private mode Bun's sentence is not drawn at all (R114); a sweep for digits alone cannot catch an amount written in words. The day stepper's dates (พฤหัส 22 ต.ค.) and older date rows carry digits that are not amounts.
   - **E2-B:** capture `bw-tray-transfer`, `bw-tray-confirm`, `bw-tray-confirm-bun` and `bw-tray-pick-category` each from a fresh launch (P2-T13's n2), and at AX5 by hand, since the large-text suite does not open the tray sections. The differences from the boards are P17's.
   - **Followups:** the row labels `add.rowCategory` to `add.rowNote` are in `copy.ts` (P2-T14's planner, P3). The move-all cap followup is settled by P5. The type switch's place at AX5 and a change to transfer are P2-T16's (P18).
```

`PL/diffs/apps_app_src_wallet_add_AddSteps.render.test.tsx.diff`:
```diff
diff --git a/apps/app/src/wallet/add/AddSteps.render.test.tsx b/apps/app/src/wallet/add/AddSteps.render.test.tsx
index a771ac6fe579ba876fd1eaf57ddcfe39667a05f0..c7600a17cd0e8347c571ca8752902004a60ed655 100644
--- a/apps/app/src/wallet/add/AddSteps.render.test.tsx
+++ b/apps/app/src/wallet/add/AddSteps.render.test.tsx
@@ -3,10 +3,13 @@
 // cases mount the steps as P2-T16's host and the catalogue do: inside a Tray,
 // through a probe that holds the draft, the keypad, the step shown, where a
 // pick goes back to (isPickStep) and Bun's guesses (P2-T14's stillGuessed),
-// and switches steps as onStep asks. The tray's back leaves a pick for the
-// step that opened it; the back from the transfer and confirm steps to the
-// amount is the host's (P2-T16), so the probe draws none there. Each case
-// mounts through mountWallet, in Thai and by day unless it says otherwise.
+// and switches steps as onStep asks; at the amount step it draws P2-T14's real
+// AmountStep, whose wallet chip opens the wallet pick. The tray's back leaves
+// a pick for the step that opened it; the back from the transfer and confirm
+// steps to the amount is the host's (P2-T16), so the probe draws none there.
+// Each case mounts through mountWallet, in Thai and by day unless it says
+// otherwise. The steps' catalogue sections load lazily, so openSection waits
+// until a section stops reading `catalogue-screen-running`.
 //
 // The traps, as AmountStep.render.test.tsx meets them: Reanimated keeps the
 // tray's card, and each new step's content, unseen (visibility: hidden) until
@@ -17,7 +20,7 @@
 // that reach the app's Text are recorded, as WalletCard.render.test.tsx does.
 // Each haptic moment is recorded by name. react-native-web omits
 // aria-disabled when it is false, so an enabled button has none.
-import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
+import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
 import { useState } from 'react';
 import { afterEach, expect, test, vi } from 'vitest';

@@ -38,7 +41,6 @@ vi.mock('@mobile/theme/AppText', async (importOriginal) => {
 vi.mock('@mobile/lib/hapticMoment', () => ({ playHaptic: vi.fn() }));

 import type { CategoryDto, Minor, WalletSnapshot } from '@gogospend/contracts';
-import { Text } from 'react-native';

 import { rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
 import { WALLET_SECTIONS } from '@mobile/dev/catalogue/wallet';
@@ -59,6 +61,7 @@ import { AX5, mountWallet } from '../testing/walletHarness';
 import { Tray } from '../tray/Tray';
 import { confirmRows, filledKeypad, stillGuessed, trayTitleKey } from './addFlow';
 import type { AddStep, StepProps } from './addFlow';
+import { AmountStep } from './AmountStep';
 import { ConfirmStep, confirmTitle } from './ConfirmStep';
 import { COPY } from './copy';
 import { CategoryPick, DatePick, isPickStep, NotePick, WalletPick } from './PickSteps';
@@ -196,7 +199,7 @@ function Probe({ step: first = 'confirm', draft: change = {}, minor = '5000', fi
     : step === 'wallet' || step === 'from' || step === 'to' ? <WalletPick {...props} wallets={WALLETS} balances={balances} role={step} back={back} />
     : step === 'date' ? <DatePick {...props} today={TODAY} earliest={earliest} />
     : step === 'note' ? <NotePick {...props} />
-    : <Text testID="probe-amount">amount</Text>;
+    : <AmountStep {...props} type={draft.type} lookups={LOOKUPS} chips={[]} canTellBun={false} onTellBun={() => undefined} problem={null} typeSwitch={null} onNaming={() => undefined} />;
   return (
     <Tray
       visible
@@ -204,7 +207,7 @@ function Probe({ step: first = 'confirm', draft: change = {}, minor = '5000', fi
       title={t(trayTitleKey(draft.type))}
       step={step}
       onBack={isPickStep(step) ? () => setStep(back) : undefined}
-      footer={step === 'transfer' ? <TransferFooter {...props} /> : undefined}
+      footer={step === 'transfer' ? <TransferFooter {...props} wallets={WALLETS} /> : undefined}
     >
       {middle}
     </Tray>
@@ -218,6 +221,15 @@ async function mount(element: Parameters<typeof mountWallet>[0], options: Parame
   return view;
 }

+/** Mounts a catalogue section; the steps' sections load lazily, so this waits until the section stops reading `catalogue-screen-running`. */
+async function openSection(id: string, options: Parameters<typeof mountWallet>[1] = {}) {
+  const view = mountWallet(<>{WALLET_SECTIONS.find((each) => each.id === id)?.render()}</>, options);
+  await waitFor(() => expect(screen.queryByTestId('catalogue-screen-running')).toBeNull(), { timeout: 15_000 });
+  await settle();
+  startAnimations();
+  return view;
+}
+
 const WORDS = {
   th: {
     food: 'อาหาร', travel: 'การเดินทาง', category: 'หมวด', wallet: 'กระเป๋า', from: 'จาก', to: 'ไป', date: 'วันที่', note: 'โน้ต',
@@ -225,6 +237,7 @@ const WORDS = {
     baht: (amount: string) => `${amount} บาท`, after: (amount: string) => `หลังโอน ${amount}`, moveAll: (amount: string) => `ย้ายทั้งหมด ${amount}`,
     bunRead: (sentence: string) => `บันอ่านจาก “${sentence}”`, two: 'เลือกกระเป๋าเงินสองใบที่ต่างกัน', choose: 'เลือกกระเป๋า',
     transferNote: 'โอนระหว่างกระเป๋าของคุณเอง ไม่นับเป็นรายจ่าย', previous: 'วันก่อนหน้า', following: 'วันถัดไป', hidden: 'ซ่อนยอดเงินอยู่',
+    bunHidden: 'บันอ่านจากที่คุณบอก',
   },
   en: {
     food: 'Food', travel: 'Travel', category: 'Category', wallet: 'Wallet', from: 'From', to: 'To', date: 'Date', note: 'Note',
@@ -232,6 +245,7 @@ const WORDS = {
     baht: (amount: string) => `${amount} baht`, after: (amount: string) => `After ${amount}`, moveAll: (amount: string) => `Move all ${amount}`,
     bunRead: (sentence: string) => `Bun read this from “${sentence}”`, two: 'Choose two different wallets', choose: 'Choose a wallet',
     transferNote: 'A move between your own wallets is not spending', previous: 'Previous day', following: 'Next day', hidden: 'Amount hidden',
+    bunHidden: 'Bun read this from what you told it',
   },
 } as const;

@@ -263,6 +277,11 @@ test('confirm shows ฿50, the category, the wallet and วันนี้, each
       cleanup();
     }
   }
+  // The wallet row draws the entry's own wallet, never the move's from wallet, which a draft keeps beside it.
+  await mount(<Probe draft={{ walletId: 'w-cash' }} />);
+  expect([rowLabels()[1], found('confirm-row-wallet').querySelector('linearGradient')?.getAttribute('id')]).toEqual([
+    'กระเป๋า เงินสด', `wallet-material-${derivedLook('w-cash').material}-light`,
+  ]);
 });

 test('a guessed row says บันเดา', async () => {
@@ -321,6 +340,10 @@ test("a transfer shows each wallet's balance after the move, swaps, and fills mo
     await mount(<Probe step="transfer" draft={{ type: 'transfer' }} minor="50000" balances={null} />, { locale });
     expect([label('transfer-from'), label('transfer-to')], locale).toEqual([`${words.from} บัญชีหลัก`, `${words.to} เงินสด`]);
     expect(['transfer-from-balance', 'transfer-from-after', 'transfer-to-after', 'transfer-move-all'].map((id) => screen.queryByTestId(id)), locale).toEqual([null, null, null, null]);
+    // Offline the wallet pick names each wallet, with no balance.
+    tap(found('transfer-from'));
+    expect(radios(words.from).map((radio) => radio.getAttribute('aria-label')), locale).toEqual(['บัญชีหลัก', 'เงินสด', LONG_NAME]);
+    expect(within(found('pick-wallet')).queryAllByText(/฿/), locale).toEqual([]);
     cleanup();
   }
   // Exact past 2^53: ฿500 from ฿90,071,992,547,409.93, which is above the cap, so it offers no move all.
@@ -328,6 +351,40 @@ test("a transfer shows each wallet's balance after the move, swaps, and fills mo
   expect([text('transfer-from-balance'), text('transfer-from-after'), screen.queryByTestId('transfer-move-all')]).toEqual(['฿90,071,992,547,409.93', '฿90,071,992,546,909.93', null]);
 });

+test('a balance below zero, and a move larger than the balance, keep their minus on the card and in its words', async () => {
+  // ฿500 from ฿300 leaves −฿200; a card that owes ฿1,240 owes ฿740 once ฿500 comes in.
+  await mount(<Probe step="transfer" draft={{ type: 'transfer' }} minor="50000" balances={new Map([['w-main', '30000'], ['w-cash', '-124000']])} />);
+  expect([text('transfer-from-balance'), text('transfer-from-after'), text('transfer-to-balance'), text('transfer-to-after')]).toEqual(['฿300', '\u2212฿200', '\u2212฿1,240', '\u2212฿740']);
+  expect([label('transfer-from'), label('transfer-to')]).toEqual([
+    'จาก บัญชีหลัก 300 บาท หลังโอน ติดลบ 200 บาท', 'ไป เงินสด ติดลบ 1,240 บาท หลังโอน ติดลบ 740 บาท',
+  ]);
+});
+
+test("isPickStep names the six picks; the amount chip's wallet pick goes back to the amount step, by a choice and by the tray's back", async () => {
+  expect((['amount', 'transfer', 'confirm', 'category', 'wallet', 'from', 'to', 'date', 'note'] as const).map(isPickStep)).toEqual([
+    false, false, false, true, true, true, true, true, true,
+  ]);
+  await mount(<Probe step="amount" />);
+  tap(found('add-wallet'));
+  expect(radios('กระเป๋า').map((radio) => radio.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
+  tap(named('radio', 'เงินสด 1,240 บาท'));
+  expect([screen.queryByTestId('add-amount') !== null, found('add-wallet').getAttribute('aria-label')]).toEqual([true, 'จากเงินสด']);
+  // The tray's back leaves the pick for the amount step too, with nothing changed.
+  tap(found('add-wallet'));
+  tap(named('button', 'กลับ'));
+  expect([screen.queryByTestId('add-amount') !== null, found('add-wallet').getAttribute('aria-label')]).toEqual([true, 'จากเงินสด']);
+});
+
+test('the amount being moved and the day being picked are polite live regions', async () => {
+  await mount(<Probe step="transfer" draft={{ type: 'transfer' }} minor="50000" />);
+  const amount = found('transfer-amount').parentElement as HTMLElement;
+  expect([amount.getAttribute('role'), amount.getAttribute('aria-live')]).toEqual(['status', 'polite']);
+  cleanup();
+  await mount(<Probe step="date" />);
+  const day = found('pick-date-day').parentElement as HTMLElement;
+  expect([day.getAttribute('role'), day.getAttribute('aria-live')]).toEqual(['status', 'polite']);
+});
+
 test('a pick returns to confirm with the choice', async () => {
   await mount(<Probe earliest="2026-10-22" />);
   // The category: a tap ticks once and comes back with it (the tray ticks each step change itself).
@@ -339,6 +396,8 @@ test('a pick returns to confirm with the choice', async () => {
   expect(radios('กระเป๋า').map((radio) => [radio.getAttribute('aria-label'), radio.getAttribute('aria-checked')])).toEqual([
     ['บัญชีหลัก 24,860 บาท', 'true'], ['เงินสด 1,240 บาท', 'false'], [`${LONG_NAME} 999,999,999 บาท 99 สตางค์`, 'false'],
   ]);
+  // The chosen wallet's radio also holds its dot, so the choice never rests on the ring's colour alone.
+  expect(radios('กระเป๋า').map((radio) => within(radio).queryByTestId('pick-wallet-dot') !== null)).toEqual([true, false, false]);
   tap(named('radio', 'เงินสด 1,240 บาท'));
   expect(rowLabels()[1]).toBe('กระเป๋า เงินสด');
   // The day: one back, kept with เสร็จ.
@@ -388,6 +447,12 @@ test("the date cannot pass today or go before the wallet's start", async () => {
   tap(named('button', 'เสร็จ'));
   expect(rowLabels()[2]).toBe('วันที่ พฤหัส 22 ต.ค.');
   cleanup();
+  // A draft dated after today (no add path makes one) opens on today, and keeps it.
+  await mount(<Probe step="date" draft={{ occurredOn: '2026-10-30' }} />);
+  expect([day(), later().getAttribute('aria-disabled')]).toEqual(['วันนี้', 'true']);
+  tap(named('button', 'เสร็จ'));
+  expect(rowLabels()[2]).toBe('วันที่ วันนี้');
+  cleanup();
   // With no start, a day steps back freely, and forward to today only.
   await mount(<Probe step="date" draft={{ occurredOn: '2026-10-23' }} />);
   fireEvent.click(named('button', 'วันถัดไป'));
@@ -446,14 +511,22 @@ test('the same wallet on both sides says so and Next waits; with two wallets Nex
       `${words.from} ${words.choose}`, `${words.to} ${words.choose}`, null, 'true',
     ]);
     cleanup();
-    // An archived wallet is never shown: the side asks for another.
+    // An archived wallet is never shown: the side asks for another, says nothing, and Next waits, as for a side with none (R114).
     await mount(<Probe step="transfer" draft={{ type: 'transfer', fromWalletId: 'w-old' }} minor="50000" />, { locale });
-    expect([label('transfer-from'), screen.queryByTestId('transfer-move-all')], locale).toEqual([`${words.from} ${words.choose}`, null]);
+    expect([label('transfer-from'), screen.queryByTestId('transfer-move-all'), screen.queryByTestId('transfer-problem'), named('button', words.next).getAttribute('aria-disabled')], locale).toEqual([
+      `${words.from} ${words.choose}`, null, null, 'true',
+    ]);
+    fireEvent.click(named('button', words.next));
+    expect(screen.queryByTestId('transfer-step'), locale).not.toBeNull();
+    cleanup();
+    // So does a wallet no longer listed, on the to side.
+    await mount(<Probe step="transfer" draft={{ type: 'transfer', toWalletId: 'w-gone' }} minor="50000" />, { locale });
+    expect([label('transfer-to'), named('button', words.next).getAttribute('aria-disabled')], locale).toEqual([`${words.to} ${words.choose}`, 'true']);
     cleanup();
   }
 });

-test('private mode hides every balance, after line and move all, a fill on the amount line, and the numbers in what Bun read; a typed amount shows', async () => {
+test('private mode hides every balance, after line and move all and a fill on the amount line, and draws none of what the person told Bun; a typed amount shows', async () => {
   const device = { [PRIVATE_MODE_NAME]: '1' };
   /** Every word and name inside the tray but the amount line the person typed. */
   const said = (except: string | null) => [...found('tray').querySelectorAll<HTMLElement>('*')]
@@ -479,11 +552,29 @@ test('private mode hides every balance, after line and move all, a fill on the a
   expect(radios('จาก').map((radio) => radio.getAttribute('aria-label'))).toEqual(['บัญชีหลัก ซ่อนยอดเงินอยู่', 'เงินสด ซ่อนยอดเงินอยู่', `${LONG_NAME} ซ่อนยอดเงินอยู่`]);
   expect(said(null)).not.toMatch(/[0-9]/);
   cleanup();
-  // Confirm as Bun filled it: the amount is masked, and so is every number Bun read.
-  await mount(<Probe draft={{ merchant: 'ข้าวมันไก่' }} filled guessed={['category']} bunSentence="ข้าวมันไก่ ฿50 กับน้ำ 1,250.50 และ ๒๐" />, { device });
-  expect([text('confirm-amount'), label('confirm-amount')]).toEqual(['฿••••', 'ซ่อนยอดเงินอยู่']);
-  expect(text('confirm-bun')).toBe('บันอ่านจาก “ข้าวมันไก่ ฿•••• กับน้ำ ฿•••• และ ฿••••”');
-  expect(said(null)).not.toMatch(/[0-9๐-๙]/);
+  // Confirm as Bun filled it: the amount is masked, and none of what the person told Bun is drawn (R114), in any
+  // form Bun reads an amount from: digits, Thai digits, Thai number and scale words, k, full-width and Arabic-Indic digits.
+  const told = [
+    'ข้าวมันไก่ 50', 'ข้าวมันไก่ ฿50 กับน้ำ 1,250.50 และ ๒๐', 'ข้าวมันไก่ห้าสิบบาท', 'ข้าวมันไก่ ห้าสิบ', 'กาแฟ ร้อยห้าสิบ',
+    'ค่าเช่า สองพันห้าร้อยบาท', 'เงินเดือน สามหมื่น', 'โอนค่าเทอม หนึ่งแสนสองหมื่นบาท', 'ค่าเช่า 2 พัน', 'ค่าเช่า 1.5k',
+    'ข้าว 50.-', 'ข้าวมันไก่ ５０', 'ข้าว ٥٠',
+  ];
+  for (const sentence of told) {
+    await mount(<Probe draft={{ merchant: 'ร้านป้า' }} filled guessed={['category']} bunSentence={sentence} />, { device });
+    expect([text('confirm-amount'), label('confirm-amount'), text('confirm-bun')], sentence).toEqual(['฿••••', 'ซ่อนยอดเงินอยู่', WORDS.th.bunHidden]);
+    // Gone, not masked: no word of it is anywhere in the tray.
+    for (const word of sentence.split(' ')) expect(said(null), `${sentence}: ${word}`).not.toContain(word);
+    cleanup();
+  }
+  // In English too, and in the violet of what Bun read.
+  await mount(<Probe draft={{ merchant: 'Corner shop' }} filled bunSentence="chicken rice fifty baht" />, { device, locale: 'en' });
+  expect([text('confirm-bun'), found('confirm-bun').style.color]).toEqual([WORDS.en.bunHidden, rgba(walletLight.violet)]);
+  expect(said(null)).not.toMatch(/chicken|fifty/);
+  cleanup();
+  // The catalogue's section as Tell Bun filled it, in private mode.
+  await openSection('bw-tray-confirm-bun', { device });
+  expect([text('confirm-amount'), text('confirm-bun')]).toEqual(['฿••••', WORDS.th.bunHidden]);
+  expect(said(null)).not.toMatch(/[0-9]/);
   cleanup();
   // A typed amount shows on confirm too, as the person typed it.
   await mount(<Probe />, { device });
@@ -616,15 +707,21 @@ test("confirm for a move shows its two wallets and the move's mark, and income i
   // An expense with no category chosen: an empty tile, the tray's title, and the row asks for one.
   await mount(<Probe draft={{ categoryByType: { expense: null, income: null } }} />);
   expect([found('confirm-tile').querySelector('svg'), text('confirm-title'), rowLabels()[0]]).toEqual([null, 'จดรายจ่าย', 'หมวด เลือกหมวดหมู่']);
+  cleanup();
+  // A merchant or a note of spaces alone is no title: the next one in line is.
+  await mount(<Probe draft={{ merchant: '   ', note: 'ข้าวเที่ยง' }} />);
+  expect(text('confirm-title')).toBe('ข้าวเที่ยง');
+  cleanup();
+  await mount(<Probe draft={{ merchant: '   ', note: '   ' }} />);
+  expect(text('confirm-title')).toBe('อาหาร');
 });

 test("the steps' sections come right after the amount step's, and each opens at its step on its board's words", async () => {
   const ids = WALLET_SECTIONS.map((section) => section.id);
   const at = ids.indexOf('bw-tray-transfer');
   expect(ids.slice(at - 2, at + 4)).toEqual(['bw-tray-amount', 'bw-tray-income', 'bw-tray-transfer', 'bw-tray-confirm', 'bw-tray-confirm-bun', 'bw-tray-pick-category']);
-  const section = (id: string) => WALLET_SECTIONS.find((each) => each.id === id)?.render();
   // rh-transfer's move, and its Next goes on to confirm.
-  await mount(<>{section('bw-tray-transfer')}</>);
+  await openSection('bw-tray-transfer');
   expect(screen.queryAllByRole('dialog', { name: 'โอนเงิน' })).toHaveLength(1);
   expect([label('transfer-from'), label('transfer-to'), text('transfer-amount')]).toEqual([
     'จาก บัญชีหลัก 24,860 บาท หลังโอน 24,360 บาท', 'ไป เงินสด 1,240 บาท หลังโอน 1,740 บาท', '฿500',
@@ -639,7 +736,7 @@ test("the steps' sections come right after the amount step's, and each opens at
   expect(rowLabels().slice(0, 2)).toEqual(['จาก เงินสด', 'ไป บัญชีหลัก']);
   cleanup();
   // bw-tray-confirm typed: food from the main account today, and a row opens its pick and comes back.
-  await mount(<>{section('bw-tray-confirm')}</>);
+  await openSection('bw-tray-confirm');
   expect([text('confirm-title'), text('confirm-amount'), rowLabels()]).toEqual(['อาหาร', '฿50', ['หมวด อาหาร', 'กระเป๋า บัญชีหลัก', 'วันที่ วันนี้', 'โน้ต เพิ่มโน้ต']]);
   expect(named('button', 'บันทึก')).not.toBeNull();
   tap(found('confirm-row-date'));
@@ -648,14 +745,14 @@ test("the steps' sections come right after the amount step's, and each opens at
   expect(rowLabels()[2]).toBe('วันที่ เมื่อวาน');
   cleanup();
   // bw-tray-confirm as Tell Bun filled it.
-  await mount(<>{section('bw-tray-confirm-bun')}</>);
+  await openSection('bw-tray-confirm-bun');
   expect([text('confirm-title'), text('confirm-bun'), text('confirm-amount'), rowLabels()[0]]).toEqual(['ข้าวมันไก่', 'บันอ่านจาก “ข้าวมันไก่ 50”', '฿50', 'หมวด อาหาร บันเดา']);
   tap(found('confirm-row-category'));
   tap(named('radio', 'การเดินทาง'));
   expect([rowLabels()[0], screen.queryByTestId('confirm-guess-category')]).toEqual(['หมวด การเดินทาง', null]);
   cleanup();
   // The category pick: food chosen, and a tap goes back to confirm with the choice.
-  await mount(<>{section('bw-tray-pick-category')}</>);
+  await openSection('bw-tray-pick-category');
   expect(radios('หมวด').map((radio) => radio.getAttribute('aria-checked'))[0]).toBe('true');
   tap(named('radio', 'การเดินทาง'));
   expect(rowLabels()[0]).toBe('หมวด การเดินทาง');
```

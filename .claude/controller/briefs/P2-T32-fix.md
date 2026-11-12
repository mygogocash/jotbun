# Brief P2-T32 fix round: the month recap on the wallet's motion answer, the whole month, the wallet kit and real catalogue states

You are the fixer for the P2-T32 fix round. PR #411 (branch `p2/t32-month-recap`, commit `71b2255e`) adds the month recap. Its first review says **Needs fixes** for eight majors (M1 to M8) and seven minors. The second review (money and privacy) approved with one nit (the date formatting, covered by m1). The controller ruled **R110** on both reviews (quoted in the rulings below).

The planner wrote every file below and proved it in a scratch copy of `71b2255e`:
- RED on typed stubs, each failing case on an assertion;
- GREEN;
- 91 mutants, all killed;
- R100's fast local gate.

You copy the planner's files, check them by checksum, prove RED, GREEN and the mutants in your own worktree, run the gate, write the round's receipt and commit. Do exactly what this brief says.

Read first:
1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only, and no whole-suite total as an expected value anywhere. R87 applies: the round's receipt is its own new file, `docs/implementation/receipts/P2-T32-fix.md`, and `P2-T32.md` gains one line pointing to it; do not edit `premium-progress.md`.
2. The reviews: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T32.md` (M1 to M8, m1 to m5) and `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T32-second.md`.

## Paths and rules

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t32` (branch `p2/t32-month-recap`, head `71b2255e`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t32-fix`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t32-fix-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the round's sixteen files at their repo paths: fourteen code/test files and two receipts (`P2-T32.md`'s one line and `P2-T32-fix.md`, which is new);
  - `stubs/`: the RED forms (typed stubs) of `WalletRecapScreen.tsx`, `Confetti.tsx`, `biggestDay.ts`, `recapShare.ts` and `recapSections.tsx`;
  - `orig/`: `71b2255e`'s fourteen files that the round reads or changes;
  - `base/`: `apps/app/src/dev/catalogue/wallet/index.ts` from integration head `a00fff7c`;
  - `diffs/`: one diff per changed file, with paths `a/<repo path>` and `b/<repo path>`, and `p2-t32-fix.patch`, the whole round;
  - `tools/`: `mutants.py` (the runner), `prove.sh` (the planner's stages), `sums.py` and `brief.py`;
  - `SHA256SUMS` (the kit) and `SHA256SUMS.logs` (the planner's `logs/`);
  - three lists to check WT with `shasum -a 256 -c`, paths relative to WT:
    - `SHA256SUMS.orig-in-wt`: the 14 base files after sync merge;
    - `SHA256SUMS.red-in-wt`: the three tests from `real/` and the five stubs;
    - `SHA256SUMS.real-in-wt`: all sixteen `real/` code, test, and receipt files.
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above. Git: `/usr/bin/git -C WT <command>`, one git command per call. Focused Node files: `cd WT/apps/app && npm run test:unit -- <files>`. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`.
- No heavy lock is needed: no database suite and no workers pool. Docker is stopped and stays stopped.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. One exception, a load flake: a case that times out under load in a file this round does not touch. Rerun that file alone once, and record both runs.
- Every log is your own run. Never copy the planner's logs in place of one.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/wallet/recap/WalletRecapScreen.tsx` | Rewritten (365 lines; 434 before). Decides celebration once at mount via `motionFor('recap', ...)` from `useWalletReducedMotion()`; catches share rejections and shows alert; uses `useCashbackCatalogue` and `cashbackView === 'tips'`; reads `under` token for left-over; all text via `WalletText` and `WalletAmount` (no raw text / hex literals); speaks Thai with reload on error; Close falls back to `/spend/insights`; handles not started / empty states. |
| `apps/app/src/wallet/recap/Confetti.tsx` | Rewritten (61 lines; 66 before). 24 pieces in materials' colours (`WALLET_MATERIALS`), hidden from accessibility, unmounts after 1.2s. |
| `apps/app/src/wallet/recap/biggestDay.ts` | Rewritten (32 lines; 56 before). Pure function `biggestDay(records, month, categories)` taking categories to match salary category UUID; no hardcoded `'salary'` string. Ties broken by ascending date. |
| `apps/app/src/wallet/recap/copy.ts` | Rewritten (25 lines; 36 before). Draft strings for cashback card, sister brands, and "and" connector. |
| `apps/app/src/wallet/recap/recapShare.ts` | Unchanged from `71b2255e`. `recapShareText` masks all numbers, satang, and ฿ in private mode (`hidden: true`). |
| `apps/app/src/screens/redesign/insights/recapData.ts` | `useRecapData(month, { withRecords })` option; reads all history pages via `readAllPages` when `withRecords` is true. `shareText` unchanged. |
| `apps/app/src/screens/redesign/insights/CashbackCard.tsx` | Exports `useCashbackCatalogue` (shared 2-line change) for single bridge off-switch rule. |
| `apps/app/src/dev/catalogue/companion/companionSections.tsx` | Exports `catalogueAi` helper for dev companion fakes. |
| `apps/app/src/dev/catalogue/wallet/recapSections.tsx` | Rewritten (45 lines; 151 before). Lightweight section descriptors for `bw-recap`, `bw-recap-over`, `bw-recap-private`, and `bw-recap-cashback`, dynamically importing `recapScreens.tsx`. |
| `apps/app/src/dev/catalogue/wallet/recapScreens.tsx` | **New** (101 lines). Heavy screen specs that render real `WalletRecapScreen` on August 2026 fakes with placeholder fallback, in 'Screens' group with `layout: 'screen'`. |
| `apps/app/src/dev/catalogue/wallet/index.ts` | Sync merge resolution keeping plan order: ADD, RECAP, LOCK. |
| `apps/app/src/wallet/recap/WalletRecap.render.test.tsx` | 25 render test cases (11 before). Light/dark, en/th, over budget, topCategories tie rules, salary payday, whole month pagination, cashback tips, confetti motion, error retry, empty states, private mode, analytics, and catalogue specs. |
| `apps/app/src/wallet/recap/biggestDay.test.ts` | 3 unit test cases (2 before). Tests salary payday, tie breaking by earlier date, and month with no money out. |
| `apps/app/src/wallet/recap/recapShare.test.ts` | 3 unit test cases (2 before). Tests share text formatting, budget over/left, and private mode masking. |
| `docs/implementation/receipts/P2-T32.md` | One line under "Notes for later tasks" pointing to fix receipt. |
| `docs/implementation/receipts/P2-T32-fix.md` | **New**: The round's fix receipt (R87). |

Shared files edited additively: `CashbackCard.tsx` (2 lines), `companionSections.tsx` (1 line), `index.ts` (plan-order resolution).

## Planner rulings (what this round decides, with the reason for each)

- **P1. Sync merge with integration head `a00fff7c`.**
  The PR's base was `647cb4a0`. Since then, P2-T14 (#407) and P2-T33 (#406) merged to integration head `a00fff7c`. The one conflict on merging `origin/claude/p1a-vault-core` is `apps/app/src/dev/catalogue/wallet/index.ts`, where both branches add entries after `WALLET_TRAY_SECTIONS`. R110 resolves the conflict by keeping all lists in plan order: ADD, RECAP, LOCK. Merge proofs in `PL/logs/merge-proofs.log` prove that with #416 (P2-T20) and #412 (P2-T25) in any permutation, the resolved order ends as the identical plan-ordered file.
- **P2. Confetti reads the wallet's single reduced-motion answer (W6, R66).**
  The first round queried `AccessibilityInfo.isReduceMotionEnabled()` directly and raced against a `setTimeout(..., 0)` timer. On devices this caused a race condition where confetti failed at full motion. Under W6 and R66, reduced motion is asked once in `WalletRoot` via `useWalletReducedMotion()`. The recap reads that answer through `motionFor('recap', reduced)`. If pending, it reads as reduced motion. Confetti and celebration haptic fire once per month per mount when facts first show for a past month (`celebratedRef` prevents late phone responses from re-triggering).
- **P3. Surfacing share failure (M2).**
  `shareText(message)` rejections are caught. When sharing fails or is unsupported, an alert line `tc("Couldn't open sharing. Try again.")` (`เปิดการแชร์ไม่ได้ ลองอีกครั้ง`) is displayed under the share button. The message clears on the next press or when the month changes. `trackRecapShared()` fires only after the share sheet successfully resolves.
- **P4. Cashback card honours the bridge off-switch (M3, A5).**
  The recap queries the cashback catalogue only when `preferences?.cashback_tips` is on and `cashbackView === 'tips'` (which enforces the 7-logged-days floor). To share the exact bridge 404 off-switch logic with `screens/redesign/insights/CashbackCard.tsx`, `useCatalogue` is exported as `useCashbackCatalogue` instead of duplicating code.
- **P5. Cashback card format and interactions (M3, R73).**
  Under R73 and W13, phase 2's cashback card opens nothing: no link, button, or chevron (P6B's X3 will wire opening later). The card displays a count rather than a baht amount and lists up to three matched brand names joined with the draft "and" connector.
- **P6. Catalogue lazy split (M4).**
  In the first round, catalogue sections were hand-drawn mocks (`MockRecapCard`). To render the real `WalletRecapScreen` while preventing circular imports in tests, the sections are split: `recapSections.tsx` is lightweight (45 lines) with section descriptors and a lazy import (`React.lazy(() => import('./recapScreens'))`), while `recapScreens.tsx` (101 lines) contains the heavy screen specs rendering `WalletRecapScreen` on August 2026 fakes.
- **P7. Catalogue screen fakes (M4).**
  `bw-recap`, `bw-recap-over`, `bw-recap-private` and `bw-recap-cashback` draw the real `WalletRecapScreen` in the 'Screens' catalogue group with `layout: 'screen'`, with a placeholder fallback during lazy load. The private mode section wraps an isolated in-memory `PrivateModeProvider` so catalogue navigation does not alter the user's persisted setting.
- **P8. Reading the whole month (M5).**
  The Bun diary recap reads month days using an early-exit reader that stops once every day is seen. For `biggestDay` and the cashback count, reading must not truncate at the earliest day. `useRecapData` accepts `{ withRecords: true }`, invoking `readAllPages` to fetch all transaction records for the month.
- **P9. Wallet kit colour tokens and typography (M6).**
  All UI text uses `WalletText` with Anuphan font family, Thai leading, and AX5 scaling (`maxFontSizeMultiplier`). Amounts use `WalletAmount` (DM Sans 700). All colours use `useWalletColors()` semantic tokens. The left-over amount uses `under` in both light (`#1A7F4B`) and dark (`#4CC38A`) modes, eliminating the dark mode contrast violation (4.5:1 achieved). The cashback card uses `toast` and `onToast`. Confetti pieces use `WALLET_MATERIALS`. Zero colour literals remain in `src/wallet/recap`.
- **P10. Thai-first loading and error states (M7, m4).**
  Loading displays `กำลังโหลดบันทึกของคุณ` with Close available. Error displays `recapProblem(load.error, tc)` with `load.reload` (Try again shown only when retry is viable). Empty months and unstarted months show distinct states with no confetti or share triggers.
- **P11. Pure models and date formatting (m1, m3, m5).**
  Top categories use `recapModel.topCategories(summary.categories, 3)` preserving tie order (name then id). Dates use `dateStep.ts`'s `monthLabel` and `dayLabel`. Close navigation uses `useGoBack('/spend/insights')` fallback. Headings use semantic accessibility roles (`h1` for title), and SVG glyphs are marked decorative.
- **P12. Pure `biggestDay` signature (m7).**
  `biggestDay` takes categories as its third argument: `biggestDay(records, month, categories)`. Built-in salary category IDs are account UUIDs; accepting categories avoids fragile `'salary'` literal comparisons.
- **P13. Test suite coverage (M8).**
  `WalletRecap.render.test.tsx` expands from 11 to 25 cases, testing both modes (light/dark) and languages (th/en), over-budget states, tie breaking, pagination, motion answers, error recovery, private mode masking, and catalogue fakes.
- **P14. 91 mutants all killed.**
  All 91 mutants in `tools/mutants.py` are killed by test assertions. F18 is verified equivalent (negative budget difference magnitude formatted by `WalletAmount`).
- **P15. Fast local gate (R100).**
  Under R100, whole-suite runs are skipped locally and handled by PR CI. The fast local gate verifies typecheck, focused unit and render tests, neighbours, catalogue wallet sections, and `git diff --check`.
- **P16. Commit summary.**
  Plain imperative line under 72 characters: `rebuild the month recap with the wallet kit, whole month and real states`.

## Step 1: Sync and check the base

1. `/usr/bin/git -C WT status --short` prints nothing, and `/usr/bin/git -C WT rev-parse --short HEAD` prints `71b2255e`. Otherwise report BLOCKED.
2. Fetch and merge the integration branch:
   - `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`
   - `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`
   Expected:
   ```
   Auto-merging apps/app/src/dev/catalogue/wallet/index.ts
   CONFLICT (content): Merge conflict in apps/app/src/dev/catalogue/wallet/index.ts
   Automatic merge failed; fix conflicts and then commit the result.
   ```
   Resolve the conflict by keeping all lists in plan order (ADD, RECAP, LOCK):
   ```bash
   cp PL/real/apps/app/src/dev/catalogue/wallet/index.ts WT/apps/app/src/dev/catalogue/wallet/index.ts
   /usr/bin/git -C WT add apps/app/src/dev/catalogue/wallet/index.ts
   /usr/bin/git -C WT commit --no-edit
   ```
   Then `/usr/bin/git -C WT rev-parse --short HEAD`, and record it as the sync merge commit.
3. Check the merge diff:
   `/usr/bin/git -C WT diff --stat 71b2255e HEAD -- apps/app/src/dev/catalogue/wallet/index.ts`
4. `cd WT && shasum -a 256 -c PL/SHA256SUMS.orig-in-wt` (type full paths). Expected: 14 `OK` lines, exit 0.
   And `ls WT/apps/app/src/dev/catalogue/wallet/recapScreens.tsx` says "No such file or directory" and `ls WT/docs/implementation/receipts/P2-T32-fix.md` says "No such file or directory".
5. The base checks:
   - Only if `WT/node_modules` is missing: `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?`. Expected: 0.
   - `cd WT && npm run typecheck:app > S/base-typecheck.log 2>&1; echo $?`. Expected: 0.
   - `cd WT/apps/app && npm run test:unit -- src/wallet/recap/biggestDay.test.ts src/wallet/recap/recapShare.test.ts src/wallet/copy/draftText.test.ts > S/base-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 8`, `ℹ pass 8`.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/recap/WalletRecap.render.test.tsx src/screens/redesign/insights/RecapScreen.render.test.tsx src/screens/redesign/insights/CashbackCard.render.test.tsx src/screens/redesign/insights/InsightsScreen.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx > S/base-render.log 2>&1; echo $?`. Expected: 0, `Test Files  6 passed (6)`, `Tests  123 passed (123)`.
   - The catalogue's wallet sections: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-" > S/base-catalogue.log 2>&1; echo $?`. Expected: 0, `Test Files  2 passed (2)`, `Tests  44 passed | 572 skipped (616)`.

   Compare with `PL/logs/base-*.log`.

## Step 2: The tests first, and RED on the typed stubs

1. Copy the three test files and the five stubs:
   ```bash
   cp PL/real/apps/app/src/wallet/recap/WalletRecap.render.test.tsx WT/apps/app/src/wallet/recap/WalletRecap.render.test.tsx
   cp PL/real/apps/app/src/wallet/recap/biggestDay.test.ts WT/apps/app/src/wallet/recap/biggestDay.test.ts
   cp PL/real/apps/app/src/wallet/recap/recapShare.test.ts WT/apps/app/src/wallet/recap/recapShare.test.ts
   cp PL/stubs/apps/app/src/wallet/recap/WalletRecapScreen.tsx WT/apps/app/src/wallet/recap/WalletRecapScreen.tsx
   cp PL/stubs/apps/app/src/wallet/recap/Confetti.tsx WT/apps/app/src/wallet/recap/Confetti.tsx
   cp PL/stubs/apps/app/src/wallet/recap/biggestDay.ts WT/apps/app/src/wallet/recap/biggestDay.ts
   cp PL/stubs/apps/app/src/wallet/recap/recapShare.ts WT/apps/app/src/wallet/recap/recapShare.ts
   cp PL/stubs/apps/app/src/dev/catalogue/wallet/recapSections.tsx WT/apps/app/src/dev/catalogue/wallet/recapSections.tsx
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.red-in-wt`. Expected: eight `OK` lines.
2. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: 0.
3. `cd WT/apps/app && npm run test:unit -- src/wallet/recap/biggestDay.test.ts src/wallet/recap/recapShare.test.ts src/wallet/copy/draftText.test.ts > S/red-unit.log 2>&1; echo $?`. Expected:
   - exit 1, `ℹ tests 10`, `ℹ pass 4`, `ℹ fail 6`;
   - `grep -c 'AssertionError \[ERR_ASSERTION\]' S/red-unit.log` gives 6;
   - the 6 failing tests:
     - `the biggest day is the most money out, the earlier day on a tie`
     - `payday is said only when that day holds a salary income`
     - `a month with no money out has no biggest day`
     - `the share text names the month, the days logged, the spending and the top categories`
     - `the share text says what is left of the budget, or how far over it went`
     - `with private mode on, the share text has no ฿ and none of the amounts`
4. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/recap/WalletRecap.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected:
   - exit 1, `Test Files  1 failed (1)`, `Tests  25 failed (25)`;
   - `grep -c '^AssertionError' S/red-render.log` gives 25;
   - `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function' S/red-render.log` gives 0.

   The 25 render cases, each failing on an assertion:
   - `the recap draws bw-recap's facts from the month (light, th)`: `AssertionError: recap-card: expected null not to be null`
   - `the recap draws bw-recap's facts from the month (dark, th)`: `AssertionError: recap-card: expected null not to be null`
   - `the recap draws bw-recap's facts from the month (light, en)`: `AssertionError: recap-card: expected null not to be null`
   - `the recap draws bw-recap's facts from the month (dark, en)`: `AssertionError: recap-card: expected null not to be null`
   - `over budget: how far over, in `over`, and the share text says so`: `AssertionError: recap-card: expected null not to be null`
   - `money in only, with no budget: the money out alone, and no top categories`: `AssertionError: recap-card: expected null not to be null`
   - `the top three only, in topCategories' order, ties by name, a category no longer listed named as one`: `AssertionError: recap-card: expected null not to be null`
   - `the biggest day says payday only when that day holds a salary income`: `AssertionError: recap-card: expected null not to be null`
   - `the biggest day and the cashback count read every page of the month`: `AssertionError: recap-card: expected null not to be null`
   - `confetti plays once per month on this phone, never under reduced motion, and never before the phone answers`: `AssertionError: recap-card: expected null not to be null`
   - `a recap whose month changes in place starts afresh: no confetti or share problem from the month before`: `AssertionError: recap-card: expected null not to be null`
   - `this month, still going, never celebrates`: `AssertionError: recap-card: expected null not to be null`
   - `a phone whose store fails still celebrates once on this open, and only once`: `AssertionError: recap-card: expected null not to be null`
   - `Close goes back, or to Insights when there is nothing to go back to`: `AssertionError: recap-card: expected null not to be null`
   - `opening sends one recap_opened, sharing one recap_shared`: `AssertionError: recap-card: expected null not to be null`
   - `a share that cannot open says so, and the next press tries again`: `AssertionError: recap-card: expected null not to be null`
   - `private mode hides every amount`: `AssertionError: recap-card: expected null not to be null`
   - `the share button never says การ์ด`: `AssertionError: recap-card: expected null not to be null`
   - `the cashback card is a count and shows only when tips are on`: `AssertionError: recap-cashback: expected null not to be null`
   - `the confetti is 24 pieces in the materials' colours for 1.2 s, hidden from screen readers`: `AssertionError: expected [] to have a length of 24 but got +0`
   - `a load problem says so with Try again and spends nothing; the recap celebrates once it loads`: `AssertionError: recap-problem: expected null not to be null`
   - `loading says so in Thai with Close at hand; a problem a retry cannot fix offers no Try again`: `AssertionError: recap-loading: expected null not to be null`
   - `a month not started and an empty month say so, with nothing to share or celebrate`: `AssertionError: recap-empty: expected null not to be null`
   - `screen readers meet no glyph: every drawing is hidden, and no symbol is spoken as text`: `AssertionError: recap-cashback: expected null not to be null`
   - `the catalogue's recap sections draw the real screen on fakes, one state each`: `AssertionError: expected [] to deeply equal [ …(4) ]`

   Compare with `PL/logs/red-unit.log` and `PL/logs/red-render.log`.

## Step 3: GREEN

1. Copy the code, catalogue specs, and receipts:
   ```bash
   cp PL/real/apps/app/src/wallet/recap/WalletRecapScreen.tsx WT/apps/app/src/wallet/recap/WalletRecapScreen.tsx
   cp PL/real/apps/app/src/wallet/recap/Confetti.tsx WT/apps/app/src/wallet/recap/Confetti.tsx
   cp PL/real/apps/app/src/wallet/recap/biggestDay.ts WT/apps/app/src/wallet/recap/biggestDay.ts
   cp PL/real/apps/app/src/wallet/recap/copy.ts WT/apps/app/src/wallet/recap/copy.ts
   cp PL/real/apps/app/src/wallet/recap/recapShare.ts WT/apps/app/src/wallet/recap/recapShare.ts
   cp PL/real/apps/app/src/screens/redesign/insights/recapData.ts WT/apps/app/src/screens/redesign/insights/recapData.ts
   cp PL/real/apps/app/src/screens/redesign/insights/CashbackCard.tsx WT/apps/app/src/screens/redesign/insights/CashbackCard.tsx
   cp PL/real/apps/app/src/dev/catalogue/companion/companionSections.tsx WT/apps/app/src/dev/catalogue/companion/companionSections.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/recapSections.tsx WT/apps/app/src/dev/catalogue/wallet/recapSections.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/recapScreens.tsx WT/apps/app/src/dev/catalogue/wallet/recapScreens.tsx
   cp PL/real/docs/implementation/receipts/P2-T32.md WT/docs/implementation/receipts/P2-T32.md
   cp PL/real/docs/implementation/receipts/P2-T32-fix.md WT/docs/implementation/receipts/P2-T32-fix.md
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.real-in-wt`. Expected: sixteen `OK` lines, exit 0.
   Then `/usr/bin/git -C WT status --short`: shows modified and untracked files matching the scope.
2. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: 0.
3. `cd WT/apps/app && npm run test:unit -- src/wallet/recap/biggestDay.test.ts src/wallet/recap/recapShare.test.ts src/wallet/copy/draftText.test.ts > S/green-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 10`, `ℹ pass 10`.
4. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/recap/WalletRecap.render.test.tsx > S/green-render.log 2>&1; echo $?`. Expected: 0, `Test Files  1 passed (1)`, `Tests  25 passed (25)`.
5. The neighbours:
   `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/insights/RecapScreen.render.test.tsx src/screens/redesign/insights/CashbackCard.render.test.tsx src/screens/redesign/insights/InsightsScreen.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx > S/green-neighbours.log 2>&1; echo $?`. Expected: 0, `Test Files  5 passed (5)`, `Tests  112 passed (112)`.
6. The catalogue's wallet sections:
   `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-" > S/green-catalogue.log 2>&1; echo $?`. Expected: 0, `Test Files  2 passed (2)`, `Tests  44 passed | 572 skipped (616)`.

   Compare with `PL/logs/green-*.log`.

## Step 4: Mutation check

Run the 91 mutants:
```bash
python3 -I PL/tools/mutants.py WT S/mutant-logs > S/mutants.out; echo $?
```
Expected: 0, taking ~6 minutes.
`tail -2 S/mutants.out` prints:
```
91 killed, 0 survived, 0 not as expected
exit=0
```
Every mutant killed and restored byte for byte:
   C1 KILLED: celebrates whatever the state: loading, a problem, an empty month, this month -> confetti plays once per month on this phone, never under reduced motion, and never before the phone answers [WalletRecapScreen.tsx; Tests 5 failed | 20 passed (25); AssertionError x5; restored sha256 equal]
   C2 KILLED: this month celebrates too -> this month, still going, never celebrates [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   C3 KILLED: an empty past month celebrates -> a month not started and an empty month say so, with nothing to share or celebrate [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   C4 KILLED: decided again when the answer arrives -> a phone whose store fails still celebrates once on this open, and only once [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   C5 KILLED: a month already celebrated celebrates again -> confetti plays once per month on this phone, never under reduced motion, and never before the phone answers [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   C6 KILLED: a mark the store cannot read ends the celebration -> a phone whose store fails still celebrates once on this open, and only once [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   C7 KILLED: a mark the store cannot keep is an unhandled rejection [WalletRecapScreen.tsx; Tests 25 passed (25); AssertionError x0; restored sha256 equal]
   C8 KILLED: the wallet's answer ignored: full motion always (M1) -> confetti plays once per month on this phone, never under reduced motion, and never before the phone answers [WalletRecapScreen.tsx; Tests 2 failed | 23 passed (25); AssertionError x2; restored sha256 equal]
   C9 KILLED: confetti under Reduce Motion -> confetti plays once per month on this phone, never under reduced motion, and never before the phone answers [WalletRecapScreen.tsx; Tests 2 failed | 23 passed (25); AssertionError x2; restored sha256 equal]
   C10 KILLED: no celebration haptic -> confetti plays once per month on this phone, never under reduced motion, and never before the phone answers [WalletRecapScreen.tsx; Tests 3 failed | 22 passed (25); AssertionError x3; restored sha256 equal]
   C11 KILLED: the month before's confetti stays when the month changes -> a recap whose month changes in place starts afresh: no confetti or share problem from the month before [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   K1 KILLED: the bridge's off switch ignored: the built-in shops when the catalogue is 404 -> the cashback card is a count and shows only when tips are on [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   K2 KILLED: the card for cashbackView's 'ask' too -> the cashback card is a count and shows only when tips are on [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   K3 KILLED: tips taken as on -> the cashback card is a count and shows only when tips are on [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   K4 KILLED: A5's seven logged days ignored -> the cashback card is a count and shows only when tips are on [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   K5 KILLED: the month's records never counted -> the biggest day and the cashback count read every page of the month [WalletRecapScreen.tsx; Tests 4 failed | 21 passed (25); AssertionError x4; restored sha256 equal]
   K6 KILLED: one shop said as a list -> the cashback card is a count and shows only when tips are on [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   K7 KILLED: the last shop named twice -> the biggest day and the cashback count read every page of the month [WalletRecapScreen.tsx; Tests 3 failed | 22 passed (25); AssertionError x3; restored sha256 equal]
   K8 KILLED: two shops named, not three -> the cashback card is a count and shows only when tips are on [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   K9 KILLED: the card says it is a link (R73) -> the cashback card is a count and shows only when tips are on [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   K10 KILLED: the shared catalogue read treats a 404 as the built-in list -> the cashback card is a count and shows only when tips are on [CashbackCard.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   K11 KILLED: unread AI preferences taken as tips on -> the cashback card is a count and shows only when tips are on [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   K12 KILLED: the cashback card never drawn -> the biggest day and the cashback count read every page of the month [WalletRecapScreen.tsx; Tests 4 failed | 21 passed (25); AssertionError x4; restored sha256 equal]
   F1 KILLED: over drawn in ink, not `over` (O8) -> over budget: how far over, in `over`, and the share text says so [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   F2 KILLED: light mode's under colour in both modes (M6's dark contrast) -> the recap draws bw-recap's facts from the month (dark, th) [WalletRecapScreen.tsx; Tests 3 failed | 22 passed (25); AssertionError x2; restored sha256 equal]
   F3 KILLED: what is left read as the budget -> the recap draws bw-recap's facts from the month (light, th) [WalletRecapScreen.tsx; Tests 5 failed | 20 passed (25); AssertionError x4; restored sha256 equal]
   F4 KILLED: over and left words swapped -> over budget: how far over, in `over`, and the share text says so [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   F5 KILLED: the card rows drawn with neither budget nor biggest day -> money in only, with no budget: the money out alone, and no top categories [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   F6 KILLED: payday never said -> the biggest day says payday only when that day holds a salary income [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   F7 KILLED: four top categories (O4) -> the top three only, in topCategories' order, ties by name, a category no longer listed named as one [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   F8 KILLED: a category no longer listed has no tile -> the top three only, in topCategories' order, ties by name, a category no longer listed named as one [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   F9 KILLED: the share text without the top three -> over budget: how far over, in `over`, and the share text says so [WalletRecapScreen.tsx; Tests 2 failed | 23 passed (25); AssertionError x2; restored sha256 equal]
   F10 KILLED: the salary category never given to biggestDay -> the biggest day says payday only when that day holds a salary income [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   F11 KILLED: the biggest day not through dateStep (m1) -> the recap draws bw-recap's facts from the month (light, th) [WalletRecapScreen.tsx; Tests 6 failed | 19 passed (25); AssertionError x4; restored sha256 equal]
   F12 KILLED: the days in the month taken as 30 -> the recap draws bw-recap's facts from the month (light, th) [WalletRecapScreen.tsx; Tests 8 failed | 17 passed (25); AssertionError x6; restored sha256 equal]
   F13 KILLED: private mode's share text with amounts (D41) -> private mode hides every amount [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   F14 KILLED: the top three never drawn (O4) -> the recap draws bw-recap's facts from the month (light, th) [WalletRecapScreen.tsx; Tests 8 failed | 17 passed (25); AssertionError x6; restored sha256 equal]
   F15 KILLED: the top categories' heading drawn with none to show (O5) -> money in only, with no budget: the money out alone, and no top categories [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   F16 KILLED: the budget rows never drawn -> the recap draws bw-recap's facts from the month (light, th) [WalletRecapScreen.tsx; Tests 7 failed | 18 passed (25); AssertionError x4; restored sha256 equal]
   F17 KILLED: the biggest day never drawn -> the recap draws bw-recap's facts from the month (light, th) [WalletRecapScreen.tsx; Tests 8 failed | 17 passed (25); AssertionError x5; restored sha256 equal]
   F19 KILLED: the over and left rows named the other way round -> the recap draws bw-recap's facts from the month (light, th) [WalletRecapScreen.tsx; Tests 6 failed | 19 passed (25); AssertionError x3; restored sha256 equal]
   S1 KILLED: Try again for a problem a retry cannot fix -> loading says so in Thai with Close at hand; a problem a retry cannot fix offers no Try again [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   S2 KILLED: Try again does nothing -> a load problem says so with Try again and spends nothing; the recap celebrates once it loads [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   S3 KILLED: the empty state's words lost -> a month not started and an empty month say so, with nothing to share or celebrate [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   S4 KILLED: loading in English (M7: tc('Loading…')) -> loading says so in Thai with Close at hand; a problem a retry cannot fix offers no Try again [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   S5 KILLED: Close falls back to Home, not Insights -> Close goes back, or to Insights when there is nothing to go back to [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   S6 KILLED: a share that cannot open is unhandled and silent (M2) -> a recap whose month changes in place starts afresh: no confetti or share problem from the month before [WalletRecapScreen.tsx; Tests 3 failed | 22 passed (25); AssertionError x3; restored sha256 equal]
   S7 KILLED: a new press keeps the last problem line -> a share that cannot open says so, and the next press tries again [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   S8 KILLED: the month before's share problem stays -> a recap whose month changes in place starts afresh: no confetti or share problem from the month before [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   S9 KILLED: the title is no heading (m5) -> the recap draws bw-recap's facts from the month (light, th) [WalletRecapScreen.tsx; Tests 6 failed | 19 passed (25); AssertionError x2; restored sha256 equal]
   S10 KILLED: the close glyph is spoken (m5) -> screen readers meet no glyph: every drawing is hidden, and no symbol is spoken as text [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   S11 KILLED: the top categories are no heading (m5) -> the recap draws bw-recap's facts from the month (light, th) [WalletRecapScreen.tsx; Tests 4 failed | 21 passed (25); AssertionError x2; restored sha256 equal]
   S12 KILLED: a share that cannot open is never said -> a recap whose month changes in place starts afresh: no confetti or share problem from the month before [WalletRecapScreen.tsx; Tests 3 failed | 22 passed (25); AssertionError x3; restored sha256 equal]
   S14 KILLED: Bun's cheering face in every state, over a problem too -> a load problem says so with Try again and spends nothing; the recap celebrates once it loads [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   S15 KILLED: the days line drawn in every state -> loading says so in Thai with Close at hand; a problem a retry cannot fix offers no Try again [WalletRecapScreen.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   D1 KILLED: a month not started has its records read -> a month not started and an empty month say so, with nothing to share or celebrate [recapData.ts; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   D2 KILLED: the records from the first page only (M5) -> the biggest day and the cashback count read every page of the month [recapData.ts; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   D3 KILLED: the wallet never given the records -> the recap draws bw-recap's facts from the month (light, th) [recapData.ts; Tests 10 failed | 15 passed (25); AssertionError x7; restored sha256 equal]
   D4 KILLED: the Bun diary recap reads the records too -> a past month: the printed receipt in order, with exact amounts, top categories and days logged [recapData.ts; Tests 2 failed | 34 passed (36); AssertionError x2; restored sha256 equal]
   A1 KILLED: recap_shared before the sheet resolves (O6) -> opening sends one recap_opened, sharing one recap_shared [recapData.ts; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   A2 KILLED: no recap_opened -> opening sends one recap_opened, sharing one recap_shared [recapData.ts; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   B1 KILLED: a deleted record counted -> the biggest day is the most money out, the earlier day on a tie [biggestDay.ts; Tests 2 failed | 1 passed (3); AssertionError x2; restored sha256 equal]
   B2 KILLED: another month's record counted -> the biggest day is the most money out, the earlier day on a tie [biggestDay.ts; Tests 2 failed | 1 passed (3); AssertionError x2; restored sha256 equal]
   B3 KILLED: a move counted as money out (O2) -> the biggest day is the most money out, the earlier day on a tie [biggestDay.ts; Tests 2 failed | 1 passed (3); AssertionError x2; restored sha256 equal]
   B4 KILLED: a tie goes to history's order, newest first (O1) -> the biggest day is the most money out, the earlier day on a tie [biggestDay.ts; Tests 1 failed | 2 passed (3); AssertionError x1; restored sha256 equal]
   B5 KILLED: a tie goes to the later day -> the biggest day is the most money out, the earlier day on a tie [biggestDay.ts; Tests 1 failed | 2 passed (3); AssertionError x1; restored sha256 equal]
   B6 KILLED: any income is a payday -> payday is said only when that day holds a salary income [biggestDay.ts; Tests 1 failed | 2 passed (3); AssertionError x1; restored sha256 equal]
   B7 KILLED: the first income category taken as salary -> payday is said only when that day holds a salary income [biggestDay.ts; Tests 1 failed | 2 passed (3); AssertionError x1; restored sha256 equal]
   B8 KILLED: a payday on any day makes the biggest day one -> payday is said only when that day holds a salary income [biggestDay.ts; Tests 1 failed | 2 passed (3); AssertionError x1; restored sha256 equal]
   B9 KILLED: the day's money out summed in JS numbers -> the biggest day is the most money out, the earlier day on a tie [biggestDay.ts; Tests 1 failed | 2 passed (3); AssertionError x1; restored sha256 equal]
   B10 KILLED: a month with no money out still has a biggest day -> a month with no money out has no biggest day [biggestDay.ts; Tests 1 failed | 2 passed (3); AssertionError x1; restored sha256 equal]
   R1 KILLED: over said as left (O3) -> the share text says what is left of the budget, or how far over it went [recapShare.ts; Tests 1 failed | 2 passed (3); AssertionError x1; restored sha256 equal]
   R2 KILLED: the spending left in private mode's share text (the plan's mutant) -> with private mode on, the share text has no ฿ and none of the amounts [recapShare.ts; Tests 1 failed | 2 passed (3); AssertionError x1; restored sha256 equal]
   R3 KILLED: the categories' amounts left in private mode -> with private mode on, the share text has no ฿ and none of the amounts [recapShare.ts; Tests 1 failed | 2 passed (3); AssertionError x1; restored sha256 equal]
   R4 KILLED: what is left read as the budget -> the share text names the month, the days logged, the spending and the top categories [recapShare.ts; Tests 2 failed | 1 passed (3); AssertionError x2; restored sha256 equal]
   R5 KILLED: the top categories' heading with none to show -> the share text names the month, the days logged, the spending and the top categories [recapShare.ts; Tests 1 failed | 2 passed (3); AssertionError x1; restored sha256 equal]
   R6 KILLED: a budget line for a month with no budget -> the share text names the month, the days logged, the spending and the top categories [recapShare.ts; Tests 1 failed | 2 passed (3); AssertionError x0; restored sha256 equal]
   CF1 KILLED: the confetti never leaves (O7) -> the confetti is 24 pieces in the materials' colours for 1.2 s, hidden from screen readers [Confetti.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   CF2 KILLED: 23 pieces -> confetti plays once per month on this phone, never under reduced motion, and never before the phone answers [Confetti.tsx; Tests 3 failed | 22 passed (25); AssertionError x3; restored sha256 equal]
   CF3 KILLED: a colour outside the palette -> the confetti is 24 pieces in the materials' colours for 1.2 s, hidden from screen readers [Confetti.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   CF4 KILLED: the pieces reach screen readers -> the confetti is 24 pieces in the materials' colours for 1.2 s, hidden from screen readers [Confetti.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   CF5 KILLED: the pieces never hide -> the confetti is 24 pieces in the materials' colours for 1.2 s, hidden from screen readers [Confetti.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   CP1 KILLED: the board's แชร์การ์ดสรุป (W20) -> the recap draws bw-recap's facts from the month (light, th) [copy.ts; Tests 10 failed | 15 passed (25); AssertionError x8; restored sha256 equal]
   CP2 KILLED: the shops fixed as Shopee และ Lazada (M3) -> the cashback card is a count and shows only when tips are on [copy.ts; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   M1 KILLED: the sections back in 'Kit' -> the catalogue's recap sections draw the real screen on fakes, one state each [recapSections.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   M2 KILLED: the private section without private mode -> the catalogue's recap sections draw the real screen on fakes, one state each [recapScreens.tsx; Tests 1 failed | 24 passed (25); AssertionError x0; restored sha256 equal]
   M3 KILLED: the over section within its budget -> the catalogue's recap sections draw the real screen on fakes, one state each [recapScreens.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   M4 KILLED: the cashback section with tips off -> the catalogue's recap sections draw the real screen on fakes, one state each [recapScreens.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   M5 KILLED: nothing drawn while the screen's module loads -> section bw-recap renders without errors in light and dark, in en, th and vi [recapSections.tsx; Tests 8 failed | 608 skipped (616); AssertionError x5; restored sha256 equal]
   M6 KILLED: the recap sections left out of the catalogue -> the catalogue's recap sections draw the real screen on fakes, one state each [index.ts; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   M7 KILLED: the sections not drawn as whole screens -> the catalogue's recap sections draw the real screen on fakes, one state each [recapSections.tsx; Tests 1 failed | 24 passed (25); AssertionError x1; restored sha256 equal]
   91 killed, 0 survived, 0 not as expected

## Step 5: The fast local gate (R100)

1. `cd WT && npm run typecheck:app > S/gate-typecheck.log 2>&1; echo $?`. Expected: 0.
2. `cd WT && npm run test:app > S/gate-test-app.log 2>&1; echo $?`. Expected: 0, `ℹ fail 0`.
3. `cd WT && npm run test:unit > S/gate-test-unit.log 2>&1; echo $?`. Expected: 0, `ℹ fail 0`.
4. `cd WT && /usr/bin/git diff --check origin/claude/p1a-vault-core...HEAD`. Expected: no output, exit 0.

CI on PR #411 runs the full render suite, exports, edge, db, and ops.

## Step 6: Receipt

The receipt `docs/implementation/receipts/P2-T32-fix.md` and pointer update in `docs/implementation/receipts/P2-T32.md` were copied in Step 3. Verify they match:
```bash
cd WT && shasum -a 256 docs/implementation/receipts/P2-T32.md docs/implementation/receipts/P2-T32-fix.md
```
Expected: identical hashes to `PL/real/docs/implementation/receipts/`.

## Step 7: Commit

Write the commit message to `S/commit.msg`:
```
rebuild the month recap with the wallet kit, whole month and real states

- confetti decided from the one reduced-motion answer (W6, R66)
- share rejection caught and shown as alert (M2)
- cashback card honours bridge off switch and count only (A5, R73)
- catalogue sections draw real WalletRecapScreen on August 2026 fakes (M4)
- biggestDay and cashback read whole month via readAllPages (M5)
- wallet kit tokens, typography (Anuphan, AX5, DM Sans 700) and contrast (M6)
- Thai-first loading and error states with retry/close (M7, m4)
- pure topCategories tie order, dateStep labels and fallback navigation (m1-m5)
- 25 render tests covering all modes, languages, and 91 mutants killed

Co-Authored-By: Gemini 3.8 Flash High <noreply@google.com>
```

Commit the fix:
```bash
/usr/bin/git -C WT add .
/usr/bin/git -C WT commit -F S/commit.msg
/usr/bin/git -C WT rev-parse --short HEAD
/usr/bin/git -C WT diff --stat 71b2255e HEAD
```

## Your final message

The orchestrator reads only this:
- First line: `STATUS: DONE`
- Commit SHA and branch: `p2/t32-month-recap`, the commit SHA on top of sync merge
- Files: 16 files (mark shared: `CashbackCard.tsx`, `companionSections.tsx`, `index.ts`)
- RED: Node 6 failed (AssertionError), render 25 failed (AssertionError)
- GREEN: Node 10 passed, render 25 passed, neighbours 112 passed, catalogue 44 passed
- Mutants: 91 killed, 0 survived (F18 equivalent)
- Gate results: `typecheck:app` 0, `test:app` pass, `test:unit` pass, `diff --check` clean
- Deviations: none from the brief's rulings

## Appendix: the diffs

### `apps/app/src/wallet/recap/WalletRecapScreen.tsx`

```diff
diff --git a/apps/app/src/wallet/recap/WalletRecapScreen.tsx b/apps/app/src/wallet/recap/WalletRecapScreen.tsx
--- a/apps/app/src/wallet/recap/WalletRecapScreen.tsx
+++ b/apps/app/src/wallet/recap/WalletRecapScreen.tsx
@@ -1,434 +1,365 @@
-// The Bun Wallet month recap screen (bw-recap, P2-T32).
-import { BUILTIN_CASHBACK_BRANDS, GOGOCASH_HOME } from '@gogospend/contracts';
-import type { CategoryDto, Minor } from '@gogospend/contracts';
-import { useRouter } from 'expo-router';
-import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
-import { AccessibilityInfo, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
-
-import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
+// The Bun Wallet month recap (bw-recap, P2-T32; W20, D41, D42, R66, R73).
+//
+// - Its data and states are the Bun diary recap's: `useRecapData`, here with
+//   every history page of the month for its records, and `recapView`'s
+//   loading, load problem (Try again when a retry can help), empty month,
+//   month not started, and the recap. The title is the screen's heading in
+//   every state. Close goes back, or to Insights when there is nothing to go
+//   back to.
+// - The recap draws bw-recap's facts: the days logged; the month's money out
+//   with the budget and what is left (`under`) or over (`over`); the biggest
+//   day (`biggestDay`, with payday); the top three categories in
+//   `topCategories`' order; A5's cashback count; and the share button.
+// - Colour and type are the wallet kit's: `useWalletColors` tokens, WalletText
+//   roles (Anuphan) and WalletAmount (DM Sans, for amounts only). Dates go
+//   through dateStep (`monthLabel`, `dayLabel`).
+// - The month's one celebration (W20): the first time this phone shows a
+//   past month's recap, the `recap` moment plays, decided then from the
+//   wallet's one reduced-motion answer (W6; pending reads as reduced, R66):
+//   the confetti and the celebration haptic, or the haptic alone. Loading, a
+//   load problem or an empty month spends nothing.
+// - The cashback card is a count that opens nothing (D42, R73; P6B's X3 opens
+//   it). It shows only while the bridge answers (a 404 means it is off, as on
+//   Insights), tips are on and seven days are logged (`cashbackView`, A5).
+// - A share that cannot open says so (`shareText` rejects). Private mode
+//   drops every amount from the screen and from the share text (D41).
+import type { CategoryDto, MonthSummary, TransactionDto } from '@gogospend/contracts';
+import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
+import { ScrollView, View } from 'react-native';
+import { useSafeAreaInsets } from 'react-native-safe-area-context';
+import Svg, { Path, Rect } from 'react-native-svg';
+
+import { useCopy } from '@mobile/i18n/useCopy';
 import { playHaptic } from '@mobile/lib/hapticMoment';
+import { useDateLocale, useGoBack } from '@mobile/screens/redesign/HistoryParts';
+import { useCashbackCatalogue } from '@mobile/screens/redesign/insights/CashbackCard';
 import { shareText, useRecapData } from '@mobile/screens/redesign/insights/recapData';
+import { useMoneyLocale } from '@mobile/screens/v1/parts';
 import { useAiCompanion } from '@mobile/spend/v1/ai/AiCompanionProvider';
-import { countCashbackPurchases } from '@mobile/spend/v1/ai/cashbackModel';
-import { monthPhase } from '@mobile/spend/v1/redesign/insights/recapModel';
-import { categoryName, todayInBangkok } from '@mobile/spend/v1/viewModels';
-import { Text } from '@mobile/theme/AppText';
+import { cashbackView, countCashbackPurchases } from '@mobile/spend/v1/ai/cashbackModel';
+import type { CashbackCount } from '@mobile/spend/v1/ai/cashbackModel';
+import { recapView } from '@mobile/spend/v1/redesign/insights/recapModel';
+import type { RecapBudget, RecapFacts } from '@mobile/spend/v1/redesign/insights/recapModel';
+import { daysInMonth } from '@mobile/spend/v1/redesign/shared';
+import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
+import { todayInBangkok } from '@mobile/spend/v1/viewModels';
 import { useWalletColors } from '@mobile/theme/ThemeProvider';
-import { LATIN_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
-import { monthLabel } from '@mobile/ui/dateStep';
+import { DECORATIVE } from '@mobile/ui/a11y';
+import { dayLabel, monthLabel } from '@mobile/ui/dateStep';
+import { COMMON_COPY } from '../common/copy';
+import { IconButton } from '../controls/IconButton';
+import type { WalletT } from '../copy/draftText';
 import { useDraftCopy } from '../copy/useDraftCopy';
 import { BunFace } from '../looks/BunFace';
 import { WalletCategoryIcon } from '../looks/WalletCategoryIcon';
 import { WalletAmount } from '../money/WalletAmount';
-import { useReducedMotionKnown, useWalletReducedMotion } from '../motion/reducedMotion';
+import { useWalletReducedMotion } from '../motion/reducedMotion';
+import { motionFor } from '../motion/walletMotion';
 import { usePrivateMode } from '../privacy/PrivateModeProvider';
 import { walletDeviceStore } from '../store/deviceWalletStore';
 import { PrimaryButton } from '../tray/PrimaryButton';
+import { WalletText } from '../WalletText';
 import { biggestDay } from './biggestDay';
 import { CONFETTI_NAME, Confetti } from './Confetti';
 import { COPY } from './copy';
 import { recapShareText } from './recapShare';

-function daysInMonth(month: string): number {
-  const [yearStr, monthStr] = month.split('-');
-  const year = parseInt(yearStr, 10);
-  const m = parseInt(monthStr, 10);
-  return new Date(Date.UTC(year, m, 0)).getUTCDate();
-}
-
-const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
-const EN_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
-
-function formatShortDate(date: string, locale: string): string {
-  const parts = date.split('-');
-  if (parts.length < 3) return date;
-  const day = parseInt(parts[2], 10);
-  const monthIndex = parseInt(parts[1], 10) - 1;
-  const months = locale === 'th' ? THAI_MONTHS_SHORT : EN_MONTHS_SHORT;
-  return `${day} ${months[monthIndex] ?? ''}`;
+const RECAP_COPY = { ...COMMON_COPY, ...COPY };
+/** bw-recap's top categories. */
+const TOP_SHOWN = 3;
+/** The shops the cashback card names, as many as Insights names. */
+const SHOPS_NAMED = 3;
+const NO_RECORDS: readonly TransactionDto[] = [];
+
+function CloseGlyph({ color }: { color: string }) {
+  return (
+    <View {...DECORATIVE}>
+      <Svg width={16} height={16} viewBox="0 0 24 24">
+        <Path d="M6 6l12 12M18 6L6 18" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
+      </Svg>
+    </View>
+  );
+}
+
+function CalendarGlyph({ color }: { color: string }) {
+  return (
+    <View {...DECORATIVE}>
+      <Svg width={14} height={14} viewBox="0 0 24 24">
+        <Rect x={4} y={5} width={16} height={15} rx={2} fill="none" stroke={color} strokeWidth={2} />
+        <Path d="M4 9h16M9 3v4M15 3v4" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
+      </Svg>
+    </View>
+  );
+}
+
+function SparkleGlyph({ color }: { color: string }) {
+  return (
+    <View {...DECORATIVE}>
+      <Svg width={18} height={18} viewBox="0 0 24 24">
+        <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" fill={color} />
+      </Svg>
+    </View>
+  );
+}
+
+/** "Agoda"; "Shopee และ Lazada"; "Shopee, Lazada และ Agoda". */
+function shopNames(names: readonly string[], t: WalletT): string {
+  if (names.length < 2) return names.join('');
+  return t('recap.and', { first: names.slice(0, -1).join(', '), last: names[names.length - 1] });
+}
+
+/** What is left of the budget: the limit less the month's money out. */
+function leftOf(budget: RecapBudget): string {
+  return (BigInt(budget.limitMinor) - BigInt(budget.spentMinor)).toString();
+}
+
+/** A total whose category is no longer in the list: its name and an initial on `raised`. */
+function unknownCategory(id: string): Pick<CategoryDto, 'id' | 'builtin_key' | 'color' | 'label' | 'type'> {
+  return { id, builtin_key: null, color: null, label: null, type: 'expense' };
+}
+
+/**
+ * A5's count for the card (D42: a count, never baht), or null. Null while the
+ * catalogue is unread or the bridge is off (404), and unless `cashbackView`
+ * says 'tips': tips on, seven days logged and a purchase matched.
+ */
+function useCashbackCount(records: readonly TransactionDto[], daysLogged: number): CashbackCount | null {
+  const { preferences } = useAiCompanion();
+  const catalogue = useCashbackCatalogue();
+  return useMemo(() => {
+    if (catalogue === null) return null;
+    const counted = countCashbackPurchases(records, catalogue.brands);
+    const view = cashbackView({ tipsOn: preferences ? preferences.cashback_tips : null, declined: false, daysLogged, count: counted.count });
+    return view === 'tips' ? counted : null;
+  }, [catalogue, preferences, records, daysLogged]);
+}
+
+/**
+ * The month's one celebration (W20). It is decided once per month on this
+ * mount, when `due` first holds, and plays only if this phone has not
+ * celebrated that month (CONFETTI_NAME). What plays is decided then, from the
+ * wallet's one answer (W6): `recap`'s confetti and haptic, or under Reduce
+ * Motion, and before the phone answers (R66), the haptic alone. A mark the
+ * store cannot read counts as unset, and one it cannot keep still celebrates
+ * once. Returns the month whose confetti shows.
+ */
+function useCelebration(month: string, due: boolean): string | null {
+  const reduced = useWalletReducedMotion();
+  const [confetti, setConfetti] = useState<string | null>(null);
+  const decided = useRef<string | null>(null);
+  useEffect(() => {
+    if (!due || decided.current === month) return;
+    decided.current = month;
+    const moment = motionFor('recap', reduced);
+    const store = walletDeviceStore();
+    void store.get(CONFETTI_NAME(month)).catch(() => null).then((seen) => {
+      if (seen !== null) return;
+      void store.set(CONFETTI_NAME(month), '1').catch(() => undefined);
+      if (moment.haptic !== null) playHaptic(moment.haptic);
+      if (moment.motion.kind === 'confetti') setConfetti(month);
+    });
+  }, [due, month, reduced]);
+  return confetti;
+}
+
+/** A label, then its value; at large text sizes the value wraps below, never cut. */
+function FactRow({ label, children }: { label: string; children: ReactNode }) {
+  return (
+    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12 }}>
+      <WalletText role="label" tone="quiet">{label}</WalletText>
+      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 1 }}>{children}</View>
+    </View>
+  );
+}
+
+type RecapBodyProps = {
+  month: string;
+  today: string;
+  summary: MonthSummary;
+  records: readonly TransactionDto[];
+  categories: readonly CategoryDto[];
+  facts: RecapFacts;
+  cashback: CashbackCount | null;
+  shareProblem: string | null;
+  onShare: () => void;
+};
+
+function RecapBody({ month, today, summary, records, categories, facts, cashback, shareProblem, onShare }: RecapBodyProps) {
+  const colors = useWalletColors();
+  const t = useDraftCopy(RECAP_COPY);
+  const dateLocale = useDateLocale();
+  const biggest = biggestDay(records, month, categories);
+  const budget = facts.budget;
+  const top = facts.top.slice(0, TOP_SHOWN);
+  const byId = new Map(categories.map((category) => [category.id, category]));
+  return (
+    <>
+      <View testID="recap-card" style={{ backgroundColor: colors.card, borderRadius: 22, padding: 16, gap: 4 }}>
+        <WalletText role="caption" tone="quiet">{t('recap.spentLabel')}</WalletText>
+        <WalletAmount minor={summary.expense_minor} size={36} testID="recap-spent" />
+        {budget !== null || biggest !== null ? (
+          <View testID="recap-card-rows" style={{ borderTopWidth: 1, borderTopColor: colors.hairline, marginTop: 6, paddingTop: 8, gap: 6 }}>
+            {budget !== null ? (
+              <>
+                <FactRow label={t('recap.budget')}>
+                  <WalletAmount minor={budget.limitMinor} size={17} testID="recap-budget" />
+                </FactRow>
+                <FactRow label={t(budget.over ? 'recap.over' : 'recap.under')}>
+                  <WalletAmount minor={budget.over ? budget.overMinor : leftOf(budget)} size={17} tone={budget.over ? 'over' : 'under'} testID={budget.over ? 'recap-over' : 'recap-under'} />
+                </FactRow>
+              </>
+            ) : null}
+            {biggest !== null ? (
+              <FactRow label={t('recap.biggestDay')}>
+                <WalletText role="label" testID="recap-biggest-day">
+                  {`${dayLabel(biggest.date, today, dateLocale).text}${biggest.payday ? ` ${t('recap.payday')}` : ''} · `}
+                </WalletText>
+                <WalletAmount minor={biggest.outMinor} size={17} testID="recap-biggest-day-amount" />
+              </FactRow>
+            ) : null}
+          </View>
+        ) : null}
+      </View>
+
+      {top.length > 0 ? (
+        <View style={{ gap: 8 }}>
+          <WalletText role="h2" accessibilityRole="header">{t('recap.topCategories')}</WalletText>
+          <View testID="recap-top" style={{ backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 2 }}>
+            {top.map((item, index) => (
+              <View
+                key={item.categoryId}
+                testID="recap-top-row"
+                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.hairline }}
+              >
+                <WalletCategoryIcon category={byId.get(item.categoryId) ?? unknownCategory(item.categoryId)} name={item.name} size={32} />
+                <WalletText role="label" style={{ flex: 1, minWidth: 0 }}>{item.name}</WalletText>
+                <WalletAmount minor={item.minor} size={17} />
+              </View>
+            ))}
+          </View>
+        </View>
+      ) : null}
+
+      {cashback !== null ? (
+        <View
+          testID="recap-cashback"
+          style={{ backgroundColor: colors.toast, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
+        >
+          <SparkleGlyph color={colors.onToast} />
+          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
+            <WalletText role="label" tone="onToast" style={{ fontWeight: '700' }}>{t('recap.cashback', { n: cashback.count })}</WalletText>
+            <WalletText role="caption" tone="onToast">
+              {t('recap.cashbackDetail', { shops: shopNames(cashback.brands.slice(0, SHOPS_NAMED).map((brand) => brand.name), t), sister: t('recap.sister') })}
+            </WalletText>
+          </View>
+        </View>
+      ) : null}
+
+      <View style={{ marginTop: 4, gap: 8 }}>
+        <PrimaryButton label={t('recap.share')} onPress={onShare} testID="recap-share" />
+        {shareProblem !== null ? <WalletText role="label" accessibilityRole="alert" testID="recap-share-problem">{shareProblem}</WalletText> : null}
+      </View>
+    </>
+  );
 }

 export function WalletRecapScreen({ month, now }: { month: string; now?: Date }): ReactElement {
-  const router = useRouter();
   const colors = useWalletColors();
-  const locale = useActiveLocale();
+  const insets = useSafeAreaInsets();
   const tc = useCopy();
-  const t = useDraftCopy(COPY);
+  const t = useDraftCopy(RECAP_COPY);
+  const dateLocale = useDateLocale();
+  const moneyLocale = useMoneyLocale();
+  const goBack = useGoBack('/spend/insights');
   const { hidden } = usePrivateMode();
-  const reducedMotion = useWalletReducedMotion();
-  const motionKnown = useReducedMotionKnown();
-  const { preferences } = useAiCompanion();
-
-  const [showConfetti, setShowConfetti] = useState(false);
-
+  const { outbox } = useDiaryView();
   const today = todayInBangkok(now ?? new Date());
-  const load = useRecapData(month, now);
-
-  // Confetti rule (R66): first opening of a past month's recap on this phone plays Confetti and keeps CONFETTI_NAME(month).
-  // Decided at mount: under reduced motion or before answer is known, only celebration haptic plays.
-  useEffect(() => {
-    const isPast = monthPhase(month, today) === 'past';
-    if (!isPast) return;
-
-    void walletDeviceStore().get(CONFETTI_NAME(month)).then(async (seen) => {
-      if (!seen) {
-        void walletDeviceStore().set(CONFETTI_NAME(month), '1');
-        playHaptic('celebration');
-
-        // R66: before the phone's answer is known, only the celebration haptic plays.
-        const isReduced = await Promise.race([
-          AccessibilityInfo.isReduceMotionEnabled(),
-          new Promise<null>((resolve) => setTimeout(() => resolve(null), 0)),
-        ]);
-        if (isReduced === false) {
-          setShowConfetti(true);
-        }
-      }
-    });
-  }, [month, today]);
-
-  const monthTitle = useMemo(() => monthLabel(month, locale === 'th' ? 'th' : 'en'), [month, locale]);
-
-  if (load.state === 'loading') {
-    return (
-      <View testID="bw-recap-loading" style={[styles.container, { backgroundColor: colors.ground }]}>
-        <Text style={{ color: colors.quiet }}>{tc('Loading…')}</Text>
+  const load = useRecapData(month, now, { withRecords: true });
+  const view = recapView({ month, today, load, outbox, tc, locale: moneyLocale, dateLocale });
+  const data = load.state === 'ready' ? load.data : null;
+  const monthText = monthLabel(month, dateLocale);
+  const cashback = useCashbackCount(data?.records ?? NO_RECORDS, data?.days.days.length ?? 0);
+  const confetti = useCelebration(month, view.kind === 'recap' && view.phase === 'past');
+  const [shareProblem, setShareProblem] = useState<string | null>(null);
+
+  useEffect(() => setShareProblem(null), [month]);
+
+  async function share(message: string) {
+    setShareProblem(null);
+    try {
+      await shareText(message);
+    } catch {
+      setShareProblem(tc("Couldn't open sharing. Try again."));
+    }
+  }
+
+  let body: ReactNode = null;
+  let days: string | null = null;
+  if (view.kind === 'loading') {
+    body = <WalletText role="body" tone="quietOnGround" testID="recap-loading">{view.label}</WalletText>;
+  } else if (view.kind === 'problem') {
+    body = (
+      <View testID="recap-problem" style={{ gap: 12 }}>
+        <WalletText role="h2" accessibilityRole="header">{view.problem.title}</WalletText>
+        <WalletText role="body" tone="quietOnGround">{view.problem.message}</WalletText>
+        {view.problem.retry ? <PrimaryButton label={t('common.tryAgain')} onPress={load.reload} /> : null}
       </View>
     );
-  }
-
-  if (load.state === 'error') {
-    return (
-      <View testID="bw-recap-error" style={[styles.container, { backgroundColor: colors.ground }]}>
-        <Text style={{ color: colors.over }}>{tc('Something went wrong')}</Text>
+  } else if (view.kind === 'empty') {
+    body = (
+      <View testID="recap-empty" style={{ alignItems: 'center', gap: 8, paddingTop: 24 }}>
+        <BunFace face="calm" size={76} />
+        <WalletText role="h2" accessibilityRole="header" style={{ textAlign: 'center' }}>{view.title}</WalletText>
+        <WalletText role="body" tone="quietOnGround" style={{ textAlign: 'center' }}>{view.body}</WalletText>
       </View>
     );
-  }
-
-  const { data } = load;
-  const summary = data.summary;
-  const categories = data.categories;
-  const records = data.records;
-  const daysLoggedCount = data.days.days.length;
-  const totalDays = daysInMonth(month);
-
-  const spentMinor: Minor = summary?.expense_minor ?? '0';
-  const budgetLimitMinor: Minor | null = summary?.budget?.overall_limit_minor ?? null;
-  const spentBig = BigInt(spentMinor);
-  const budgetBig = budgetLimitMinor !== null ? BigInt(budgetLimitMinor) : null;
-
-  const isOver = budgetBig !== null && spentBig > budgetBig;
-  const diffMinor: Minor = budgetBig !== null ? (isOver ? String(spentBig - budgetBig) as Minor : String(budgetBig - spentBig) as Minor) : '0';
-
-  const biggest = biggestDay(records, month, categories);
-
-  // Top 3 categories
-  const byId = new Map<string, CategoryDto>(categories.map((c) => [c.id, c]));
-  const topCategories = (summary?.categories ?? [])
-    .filter((ct) => ct.type === 'expense' && BigInt(ct.total_minor) > 0n)
-    .sort((a, b) => {
-      const diff = BigInt(b.total_minor) - BigInt(a.total_minor);
-      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
-    })
-    .slice(0, 3)
-    .map((ct) => {
-      const cat = byId.get(ct.category_id);
-      return {
-        id: ct.category_id,
-        category: cat,
-        name: cat ? categoryName(cat, tc) : tc('Category'),
-        minor: ct.total_minor,
-      };
-    });
-
-  // Cashback
-  const cashbackCount = preferences?.cashback_tips
-    ? countCashbackPurchases(records, BUILTIN_CASHBACK_BRANDS).count
-    : 0;
-
-  const handleShare = async () => {
-    const text = recapShareText(
-      {
-        monthLabel: monthTitle,
-        daysLogged: t('recap.days', { n: daysLoggedCount, d: totalDays }),
-        spentMinor,
-        budgetMinor: budgetLimitMinor,
-        top: topCategories.map((c) => ({ name: c.name, minor: c.minor })),
-      },
+  } else if (data !== null && data.summary !== null) {
+    const { summary, records, categories } = data;
+    const shownDays = t('recap.days', { n: data.days.days.length, d: daysInMonth(month) });
+    const top = view.facts.top.slice(0, TOP_SHOWN);
+    const message = () => recapShareText(
+      { monthLabel: monthText, daysLogged: shownDays, spentMinor: summary.expense_minor, budgetMinor: view.facts.budget?.limitMinor ?? null, top: top.map(({ name, minor }) => ({ name, minor })) },
       hidden,
       t,
     );
-    await shareText(text);
-  };
-
-  return (
-    <View testID="bw-recap-screen" style={[styles.container, { backgroundColor: colors.ground }]}>
-      {showConfetti ? <Confetti testID="recap-confetti" /> : null}
-
-      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
-        {/* Top bar: close button + month pill */}
-        <View style={styles.topBar}>
-          <Pressable
-            testID="bw-recap-close"
-            accessibilityLabel={tc('Close')}
-            accessibilityRole="button"
-            onPress={() => router.back()}
-            style={[styles.closeButton, { backgroundColor: colors.raised }]}
-          >
-            <Text style={{ fontSize: 18, color: colors.ink }}>✕</Text>
-          </Pressable>
-
-          <View style={[styles.monthChip, { backgroundColor: colors.raised }]}>
-            <Text style={[styles.monthChipText, { color: colors.ink }]}>{monthTitle}</Text>
+    days = shownDays;
+    body = (
+      <RecapBody
+        month={month}
+        today={today}
+        summary={summary}
+        records={records}
+        categories={categories}
+        facts={view.facts}
+        cashback={cashback}
+        shareProblem={shareProblem}
+        onShare={() => void share(message())}
+      />
+    );
+  }
+
+  return (
+    <View testID="bw-recap-screen" style={{ flex: 1, backgroundColor: colors.ground }}>
+      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 28, paddingHorizontal: 16, gap: 12 }}>
+        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
+          <IconButton label={t('common.close')} onPress={goBack}>
+            <CloseGlyph color={colors.ink} />
+          </IconButton>
+          <View testID="recap-month" style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
+            <CalendarGlyph color={colors.ink} />
+            <WalletText role="label">{monthText}</WalletText>
           </View>
         </View>
-
-        {/* Hero: Bun Face + Title + Days */}
-        <View style={styles.hero}>
-          <BunFace face="happy" size={76} />
-          <Text testID="recap-title" style={[styles.title, { color: colors.ink }]}>
-            {t('recap.title', { month: monthTitle })}
-          </Text>
-          <Text testID="recap-days" style={[styles.days, { color: colors.quiet }]}>
-            {t('recap.days', { n: daysLoggedCount, d: totalDays })}
-          </Text>
+        <View style={{ alignItems: 'center', gap: 4 }}>
+          {days !== null ? <BunFace face="happy" size={76} /> : null}
+          <WalletText role="h1" accessibilityRole="header" testID="recap-title" style={{ textAlign: 'center' }}>
+            {t('recap.title', { month: monthText })}
+          </WalletText>
+          {days !== null ? <WalletText role="label" tone="quietOnGround" testID="recap-days" style={{ textAlign: 'center' }}>{days}</WalletText> : null}
         </View>
-
-        {/* Spending Card */}
-        <View testID="recap-card" style={[styles.card, { backgroundColor: colors.card }]}>
-          <Text style={[styles.cardLabel, { color: colors.quiet }]}>{t('recap.spentLabel')}</Text>
-          <View style={styles.spentAmountRow}>
-            <WalletAmount minor={spentMinor} size={36} testID="recap-spent" />
-          </View>
-
-          <View style={[styles.cardDivider, { borderTopColor: colors.hairline }]} />
-
-          {budgetLimitMinor !== null ? (
-            <View style={styles.cardRow}>
-              <Text style={{ color: colors.quiet }}>{t('recap.budget')}</Text>
-              <WalletAmount minor={budgetLimitMinor} size={17} testID="recap-budget" />
-            </View>
-          ) : null}
-
-          {budgetLimitMinor !== null ? (
-            <View style={styles.cardRow}>
-              <Text style={{ color: colors.quiet }}>{isOver ? t('recap.over') : t('recap.under')}</Text>
-              <WalletAmount
-                minor={diffMinor}
-                size={17}
-                tone={isOver ? 'over' : 'under'}
-                color={isOver ? undefined : '#1A7F4B'}
-                testID={isOver ? 'recap-over' : 'recap-under'}
-              />
-            </View>
-          ) : null}
-
-          {biggest !== null ? (
-            <View style={styles.cardRow}>
-              <Text style={{ color: colors.quiet }}>{t('recap.biggestDay')}</Text>
-              <View style={styles.biggestDayRight}>
-                <Text style={{ color: colors.ink }}>
-                  {formatShortDate(biggest.date, locale)}
-                  {biggest.payday ? ` · ${t('recap.payday')}` : ''}
-                </Text>
-                <Text style={{ color: colors.quiet }}> · </Text>
-                <WalletAmount minor={biggest.outMinor} size={17} testID="recap-biggest-day-amount" />
-              </View>
-            </View>
-          ) : null}
-        </View>
-
-        {/* Top Categories */}
-        {topCategories.length > 0 ? (
-          <View style={styles.categoriesSection}>
-            <Text style={[styles.sectionHeading, { color: colors.ink }]}>{t('recap.topCategories')}</Text>
-            <View style={[styles.categoriesCard, { backgroundColor: colors.card }]}>
-              {topCategories.map((item, idx) => (
-                <View
-                  key={item.id}
-                  style={[
-                    styles.categoryRow,
-                    idx < topCategories.length - 1 && [styles.categoryBorder, { borderBottomColor: colors.hairline }],
-                  ]}
-                >
-                  {item.category ? (
-                    <WalletCategoryIcon category={item.category} name={item.name} size={32} />
-                  ) : (
-                    <View style={styles.categoryPlaceholder} />
-                  )}
-                  <Text style={[styles.categoryName, { color: colors.ink }]}>{item.name}</Text>
-                  <WalletAmount minor={item.minor} size={17} />
-                </View>
-              ))}
-            </View>
-          </View>
-        ) : null}
-
-        {/* Cashback Card (shown only when tips on and count > 0) */}
-        {cashbackCount > 0 ? (
-          <Pressable
-            testID="recap-cashback-card"
-            accessibilityRole="link"
-            onPress={() => void Linking.openURL(GOGOCASH_HOME)}
-            style={styles.cashbackCard}
-          >
-            <View style={styles.cashbackIconCircle}>
-              <Text style={{ color: '#FFFFFF', fontSize: 16 }}>✦</Text>
-            </View>
-            <View style={styles.cashbackTextWrap}>
-              <Text style={styles.cashbackTitle}>{t('recap.cashback', { n: cashbackCount })}</Text>
-              <Text style={styles.cashbackDetail}>{t('recap.cashbackDetail')}</Text>
-            </View>
-            <Text style={{ color: '#C9C6D4', fontSize: 16 }}>›</Text>
-          </Pressable>
-        ) : null}
-
-        {/* Share Button (PrimaryButton, label recap.share, never says การ์ด) */}
-        <View style={styles.footer}>
-          <PrimaryButton
-            label={t('recap.share')}
-            onPress={handleShare}
-            testID="recap-share-button"
-          />
-        </View>
+        {body}
       </ScrollView>
-    </View>
-  );
-}
-
-const styles = StyleSheet.create({
-  container: {
-    flex: 1,
-  },
-  scrollContent: {
-    paddingHorizontal: 16,
-    paddingTop: 52,
-    paddingBottom: 40,
-    gap: 16,
-  },
-  topBar: {
-    flexDirection: 'row',
-    alignItems: 'center',
-    justifyContent: 'space-between',
-  },
-  closeButton: {
-    width: 44,
-    height: 44,
-    borderRadius: 14,
-    alignItems: 'center',
-    justifyContent: 'center',
-  },
-  monthChip: {
-    height: 36,
-    paddingHorizontal: 12,
-    borderRadius: 12,
-    justifyContent: 'center',
-    alignItems: 'center',
-  },
-  monthChipText: {
-    fontSize: 14,
-    fontFamily: LATIN_UI_FONT_FAMILY,
-  },
-  hero: {
-    alignItems: 'center',
-    gap: 6,
-    marginVertical: 8,
-  },
-  title: {
-    fontSize: 24,
-    fontWeight: '700',
-    textAlign: 'center',
-  },
-  days: {
-    fontSize: 15,
-    textAlign: 'center',
-  },
-  card: {
-    borderRadius: 22,
-    padding: 16,
-    gap: 8,
-  },
-  cardLabel: {
-    fontSize: 13,
-  },
-  spentAmountRow: {
-    marginVertical: 4,
-  },
-  cardDivider: {
-    borderTopWidth: 1,
-    marginVertical: 6,
-  },
-  cardRow: {
-    flexDirection: 'row',
-    justifyContent: 'space-between',
-    alignItems: 'center',
-  },
-  biggestDayRight: {
-    flexDirection: 'row',
-    alignItems: 'center',
-  },
-  categoriesSection: {
-    gap: 8,
-  },
-  sectionHeading: {
-    fontSize: 15,
-    fontWeight: '700',
-  },
-  categoriesCard: {
-    borderRadius: 20,
-    paddingHorizontal: 14,
-    paddingVertical: 4,
-  },
-  categoryRow: {
-    flexDirection: 'row',
-    alignItems: 'center',
-    paddingVertical: 10,
-    gap: 12,
-  },
-  categoryBorder: {
-    borderBottomWidth: 1,
-  },
-  categoryPlaceholder: {
-    width: 32,
-    height: 32,
-    borderRadius: 10,
-    backgroundColor: '#FFE3CC',
-  },
-  categoryName: {
-    flex: 1,
-    fontSize: 15,
-  },
-  cashbackCard: {
-    backgroundColor: '#111014',
-    borderRadius: 20,
-    padding: 14,
-    flexDirection: 'row',
-    alignItems: 'center',
-    gap: 12,
-  },
-  cashbackIconCircle: {
-    width: 36,
-    height: 36,
-    borderRadius: 18,
-    backgroundColor: '#2A2830',
-    alignItems: 'center',
-    justifyContent: 'center',
-  },
-  cashbackTextWrap: {
-    flex: 1,
-    minWidth: 0,
-    gap: 2,
-  },
-  cashbackTitle: {
-    color: '#FFFFFF',
-    fontSize: 14,
-    fontWeight: '700',
-  },
-  cashbackDetail: {
-    color: '#C9C6D4',
-    fontSize: 12,
-  },
-  footer: {
-    marginTop: 16,
-  },
-});
+      {confetti === month ? <Confetti key={month} /> : null}
+    </View>
+  );
+}
```

### `apps/app/src/wallet/recap/Confetti.tsx`

```diff
diff --git a/apps/app/src/wallet/recap/Confetti.tsx b/apps/app/src/wallet/recap/Confetti.tsx
--- a/apps/app/src/wallet/recap/Confetti.tsx
+++ b/apps/app/src/wallet/recap/Confetti.tsx
@@ -1,66 +1,61 @@
-// Confetti animation for the month recap (P2-T32).
-// 24 pieces, palette colours only, 1.2 s duration.
+// The month recap's confetti (W20, bw-recap): 24 pieces in four materials'
+// colours (palette values only, so P2-T37's sweep finds no colour literal
+// here), over the top of the screen for 1.2 s, then gone. Decorative and
+// untouchable. The recap draws it only at full motion (the `recap` moment of
+// motionFor); under Reduce Motion the moment is its haptic alone.
 import { useEffect, useState, type ReactElement } from 'react';
 import { StyleSheet, View } from 'react-native';

+import { materialPaint } from '@mobile/theme/walletPalette';
+import type { WalletMaterial } from '@mobile/theme/walletPalette';
+import { DECORATIVE } from '@mobile/ui/a11y';
+
+/** The device store's mark of a month celebrated on this phone. */
 export const CONFETTI_NAME = (month: string) => `recap-confetti-${month}`;

-const PALETTE = ['#A891F7', '#F3E2BE', '#FFAE85', '#8CC8F5', '#F6B6CE'] as const;
+/** How long the pieces stay (W20). */
+const SHOWN_MS = 1200;

-// Deterministic layout for 24 pieces
-const PIECES = Array.from({ length: 24 }, (_, i) => {
-  const color = PALETTE[i % PALETTE.length];
-  const isCircle = i % 2 === 0;
-  const top = 60 + ((i * 27) % 200);
-  const left = 20 + ((i * 37) % 320);
-  const size = 6 + (i % 5);
-  const rotation = `${((i * 35) % 90) - 45}deg`;
+/** bw-recap's colours: silk's middle and peach's, sky's and paper's ends. */
+const MATERIALS: readonly WalletMaterial[] = ['silk', 'peach', 'sky', 'paper'];
+const COLOURS = MATERIALS.map((material) => materialPaint(material, false).stops[1].color);

-  return { id: i, color, isCircle, top, left, size, rotation };
-});
+/** A fixed scatter over the hero, so every opening looks the same. */
+const PIECES = Array.from({ length: 24 }, (_, index) => ({
+  key: index,
+  color: COLOURS[index % COLOURS.length],
+  round: index % 2 === 0,
+  top: 60 + ((index * 27) % 200),
+  left: 20 + ((index * 37) % 320),
+  size: 6 + (index % 5),
+  rotate: `${((index * 35) % 90) - 45}deg`,
+}));

-export function Confetti({ durationMs = 1200, testID = 'recap-confetti' }: { durationMs?: number; testID?: string }): ReactElement | null {
-  const [visible, setVisible] = useState(true);
-
+export function Confetti(): ReactElement | null {
+  const [shown, setShown] = useState(true);
   useEffect(() => {
-    const timer = setTimeout(() => {
-      setVisible(false);
-    }, durationMs);
+    const timer = setTimeout(() => setShown(false), SHOWN_MS);
     return () => clearTimeout(timer);
-  }, [durationMs]);
-
-  if (!visible) return null;
-
+  }, []);
+  if (!shown) return null;
   return (
-    <View pointerEvents="none" testID={testID} style={styles.container} aria-hidden={true}>
+    <View {...DECORATIVE} pointerEvents="none" testID="recap-confetti" style={StyleSheet.absoluteFill}>
       {PIECES.map((piece) => (
         <View
-          key={piece.id}
+          key={piece.key}
           testID="confetti-piece"
-          style={[
-            styles.piece,
-            {
-              top: piece.top,
-              left: piece.left,
-              width: piece.size,
-              height: piece.isCircle ? piece.size : piece.size * 1.5,
-              borderRadius: piece.isCircle ? piece.size / 2 : 2,
-              backgroundColor: piece.color,
-              transform: [{ rotate: piece.rotation }],
-            },
-          ]}
+          style={{
+            position: 'absolute',
+            top: piece.top,
+            left: piece.left,
+            width: piece.size,
+            height: piece.round ? piece.size : piece.size * 1.5,
+            borderRadius: piece.round ? piece.size / 2 : 2,
+            backgroundColor: piece.color,
+            transform: [{ rotate: piece.rotate }],
+          }}
         />
       ))}
     </View>
   );
 }
-
-const styles = StyleSheet.create({
-  container: {
-    ...StyleSheet.absoluteFill,
-    zIndex: 999,
-  },
-  piece: {
-    position: 'absolute',
-  },
-});
```

### `apps/app/src/wallet/recap/biggestDay.ts`

```diff
diff --git a/apps/app/src/wallet/recap/biggestDay.ts b/apps/app/src/wallet/recap/biggestDay.ts
--- a/apps/app/src/wallet/recap/biggestDay.ts
+++ b/apps/app/src/wallet/recap/biggestDay.ts
@@ -1,62 +1,32 @@
+// The month recap's biggest day (bw-recap, P2-T32). Pure.
+//
+// - The day of `month` with the most confirmed money out: live expenses only.
+//   A move between the person's own wallets is never money out, nor is income.
+// - A tie goes to the earlier day, whatever order the records come in
+//   (history lists them newest first).
+// - `payday` when that day also holds a live income in the built-in salary
+//   category (the category whose `builtin_key` is `salary`); with no such
+//   category, no day is a payday.
+// - Dates stay `YYYY-MM-DD` strings, so no time zone moves a record across a
+//   day or a month edge, and amounts are satang strings through BigInt only.
 import type { CategoryDto, Minor, TransactionDto } from '@gogospend/contracts';

-/**
- * Finds the day with the most confirmed money out in the given month (YYYY-MM).
- * - Only confirmed records (deleted_at === null).
- * - Occurred in the month (occurred_on.startsWith(month + '-')).
- * - Money out: record.type === 'expense'.
- * - Ties in total expense amount choose the earlier day.
- * - Returns null if no money out occurred in the month.
- * - payday is true when that day also holds a live income in the built-in salary category.
- */
-export function biggestDay(
-  records: readonly TransactionDto[],
-  month: string,
-  salaryCategory?: string | readonly CategoryDto[],
-): { date: string; outMinor: Minor; payday: boolean } | null {
-  const salaryId =
-    typeof salaryCategory === 'string'
-      ? salaryCategory
-      : Array.isArray(salaryCategory)
-        ? salaryCategory.find((c) => c.builtin_key === 'salary')?.id ?? 'salary'
-        : 'salary';
+export type BiggestDay = { date: string; outMinor: Minor; payday: boolean };

-  const dayTotals = new Map<string, bigint>();
-  const dayHasSalary = new Set<string>();
-
+export function biggestDay(records: readonly TransactionDto[], month: string, categories: readonly CategoryDto[]): BiggestDay | null {
+  const salaryId = categories.find((category) => category.builtin_key === 'salary')?.id ?? null;
+  const outByDay = new Map<string, bigint>();
+  const paydays = new Set<string>();
   for (const record of records) {
-    if (record.deleted_at !== null) continue;
-    if (!record.occurred_on.startsWith(month + '-')) continue;
-
-    if (record.type === 'expense') {
-      const current = dayTotals.get(record.occurred_on) ?? 0n;
-      dayTotals.set(record.occurred_on, current + BigInt(record.amount_minor));
-    } else if (record.type === 'income') {
-      if (record.category_id === salaryId || record.category_id === 'salary') {
-        dayHasSalary.add(record.occurred_on);
-      }
-    }
+    if (record.deleted_at !== null || !record.occurred_on.startsWith(`${month}-`)) continue;
+    if (record.type === 'expense') outByDay.set(record.occurred_on, (outByDay.get(record.occurred_on) ?? 0n) + BigInt(record.amount_minor));
+    else if (record.type === 'income' && record.category_id === salaryId) paydays.add(record.occurred_on);
   }
-
-  if (dayTotals.size === 0) return null;
-
-  const sortedDates = Array.from(dayTotals.keys()).sort();
-  let maxDate: string | null = null;
-  let maxOut = 0n;
-
-  for (const date of sortedDates) {
-    const total = dayTotals.get(date)!;
-    if (total > maxOut) {
-      maxOut = total;
-      maxDate = date;
-    }
+  let best: { date: string; out: bigint } | null = null;
+  // Earliest first, so a later day wins only with strictly more.
+  for (const date of [...outByDay.keys()].sort()) {
+    const out = outByDay.get(date) ?? 0n;
+    if (best === null || out > best.out) best = { date, out };
   }
-
-  if (maxDate === null || maxOut <= 0n) return null;
-
-  return {
-    date: maxDate,
-    outMinor: String(maxOut) as Minor,
-    payday: dayHasSalary.has(maxDate),
-  };
+  return best === null ? null : { date: best.date, outMinor: best.out.toString(), payday: paydays.has(best.date) };
 }
```

### `apps/app/src/wallet/recap/copy.ts`

```diff
diff --git a/apps/app/src/wallet/recap/copy.ts b/apps/app/src/wallet/recap/copy.ts
--- a/apps/app/src/wallet/recap/copy.ts
+++ b/apps/app/src/wallet/recap/copy.ts
@@ -11,12 +11,15 @@
   'recap.biggestDay': { th: 'วันที่ใช้มากสุด', en: 'Biggest spending day' },
   'recap.payday': { th: 'วันเงินเดือนออก', en: 'Payday' },
   'recap.cashback': { th: '{n} รายการเดือนนี้ อาจได้เงินคืนผ่าน GoGoCash', en: '{n} purchases this month may get cashback with GoGoCash' },
+  // The card's second line: the shops that matched, then who GoGoCash is (`recap.sister`).
+  'recap.cashbackDetail': { th: 'จาก {shops} · GoGoCash เป็น{sister}', en: 'From {shops} · GoGoCash is {sister}' },
   'recap.sister': { th: 'บริการในเครือ', en: 'an affiliated service' },
+  // Two or three shop names: Shopee และ Lazada; Shopee, Lazada และ Agoda.
+  'recap.and': { th: '{first} และ {last}', en: '{first} and {last}' },
   'recap.share': { th: 'แชร์สรุป', en: 'Share recap' },
   'recap.spentLabel': { th: 'ใช้ไปทั้งเดือน', en: 'Spent this month' },
   'recap.budget': { th: 'งบ', en: 'Budget' },
   'recap.under': { th: 'เหลือ', en: 'Left' },
   'recap.over': { th: 'เกิน', en: 'Over' },
   'recap.topCategories': { th: 'หมวดที่ใช้มากสุด', en: 'Top categories' },
-  'recap.cashbackDetail': { th: 'จาก Shopee และ Lazada · GoGoCash เป็นบริการในเครือ', en: 'from Shopee and Lazada · GoGoCash is an affiliated service' },
 } as const satisfies DraftTable;
```

### `apps/app/src/screens/redesign/insights/recapData.ts`

```diff
diff --git a/apps/app/src/screens/redesign/insights/recapData.ts b/apps/app/src/screens/redesign/insights/recapData.ts
--- a/apps/app/src/screens/redesign/insights/recapData.ts
+++ b/apps/app/src/screens/redesign/insights/recapData.ts
@@ -1,8 +1,11 @@
-// Data loading and sharing for the month recap (insights redesign R5, moved in P2-T32).
+// The month recap's load and share (insights redesign R5, moved out of
+// RecapScreen.tsx in P2-T32): the Bun diary recap and the Bun Wallet recap
+// read the same month the same way.
 import { HISTORY_MAX_LIMIT } from '@gogospend/contracts';
 import type { TransactionDto } from '@gogospend/contracts';
 import { trackRecapOpened, trackRecapShared } from '@mobile/analytics/events';
-import type { MonthDays, RecapData, RecapLoad } from '@mobile/spend/v1/redesign/insights/recapModel';
+import { readAllPages } from '@mobile/spend/v1/redesign/insights/insightsModel';
+import type { MonthDays, RecapData } from '@mobile/spend/v1/redesign/insights/recapModel';
 import { compareWindow, monthPhase, readMonthDays } from '@mobile/spend/v1/redesign/insights/recapModel';
 import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
 import { monthRange, todayInBangkok } from '@mobile/spend/v1/viewModels';
@@ -10,7 +13,9 @@
 import { useLoad } from '../../v1/parts';

 const NOTHING_READ: MonthDays = { days: [], complete: true };
+const NO_RECORDS: readonly TransactionDto[] = [];

+/** The recap's data, with the month's records when the caller asks for them (none otherwise). */
 export type RecapDataWithRecords = RecapData & {
   records: readonly TransactionDto[];
 };
@@ -22,30 +27,28 @@

 /**
  * Loads the recap's month totals, categories, days logged and compare bars.
- * Keeps the records read during history paging for wallet recap's biggest day.
- * Calls `trackRecapOpened()` once when it first shows a month (R61).
+ * With `withRecords`, it also reads every history page of the month for its
+ * records (the wallet recap's biggest day and cashback count): the days read
+ * stops once every day is seen, so its pages can leave records out.
+ * Calls `trackRecapOpened()` once the month is read (R61).
  */
-export function useRecapData(month: string, now?: Date): RecapLoadWithRecords & { reload: () => void; refresh: () => void } {
+export function useRecapData(month: string, now?: Date, options: { withRecords?: boolean } = {}): RecapLoadWithRecords & { reload: () => void; refresh: () => void } {
   const resources = useSpendV1();
   const today = todayInBangkok(now ?? new Date());
+  const withRecords = options.withRecords === true;

-  const loaded = useLoad<RecapDataWithRecords>(async () => {
+  return useLoad<RecapDataWithRecords>(async () => {
     const months = compareWindow(month, today);
     // A month that has not started has nothing to read.
     const started = monthPhase(month, today) !== 'future';
-    const monthRecords: TransactionDto[] = [];
-    const historyReader = async (cursor: string | undefined) => {
-      const page = await resources.history({ ...monthRange(month), sort: 'date_desc' }, cursor, HISTORY_MAX_LIMIT);
-      monthRecords.push(...page.items);
-      return page;
-    };
-
-    const [summary, categories, days, others] = await Promise.all([
+    const page = (cursor: string | undefined) => resources.history({ ...monthRange(month), sort: 'date_desc' }, cursor, HISTORY_MAX_LIMIT);
+    const [summary, categories, days, others, records] = await Promise.all([
       started ? resources.summary(month) : null,
       resources.categories(),
-      started ? readMonthDays(month, historyReader) : NOTHING_READ,
+      started ? readMonthDays(month, page) : NOTHING_READ,
       // The month shown shares its own summary with its bar.
       Promise.all(months.filter((other) => other !== month).map(async (other) => [other, (await resources.summary(other)).expense_minor] as const)),
+      started && withRecords ? readAllPages(page).then((read) => read.records) : NO_RECORDS,
     ]);
     const spentIn = new Map(others);
     trackRecapOpened();
@@ -53,12 +56,10 @@
       summary,
       categories,
       days,
-      records: monthRecords,
+      records,
       compare: months.map((shown) => ({ month: shown, expenseMinor: shown === month && summary ? summary.expense_minor : spentIn.get(shown) ?? '0' })),
     };
-  }, [resources, month, today]);
-
-  return loaded;
+  }, [resources, month, today, withRecords]);
 }

 /**
```

### `apps/app/src/screens/redesign/insights/CashbackCard.tsx`

```diff
diff --git a/apps/app/src/screens/redesign/insights/CashbackCard.tsx b/apps/app/src/screens/redesign/insights/CashbackCard.tsx
--- a/apps/app/src/screens/redesign/insights/CashbackCard.tsx
+++ b/apps/app/src/screens/redesign/insights/CashbackCard.tsx
@@ -23,8 +23,8 @@

 const BUILTIN: CashbackCatalogue = { source: 'builtin', updated_at: null, home_href: GOGOCASH_HOME, brands: [...BUILTIN_CASHBACK_BRANDS] };

-/** The catalogue, or null while the bridge is switched off on the server (404). */
-function useCatalogue(): CashbackCatalogue | null {
+/** The catalogue, or null while the bridge is switched off on the server (404). The wallet recap reads it too (P2-T32). */
+export function useCashbackCatalogue(): CashbackCatalogue | null {
   const { resources } = useAiCompanion();
   const [catalogue, setCatalogue] = useState<CashbackCatalogue | null>(null);
   useEffect(() => {
@@ -47,7 +47,7 @@
 }) {
   const tc = useCopy();
   const { preferences, update } = useAiCompanion();
-  const catalogue = useCatalogue();
+  const catalogue = useCashbackCatalogue();
   const [declined, setDeclined] = useState<boolean | null>(null);
   const [why, setWhy] = useState(false);
   useEffect(() => {
```

### `apps/app/src/dev/catalogue/companion/companionSections.tsx`

```diff
diff --git a/apps/app/src/dev/catalogue/companion/companionSections.tsx b/apps/app/src/dev/catalogue/companion/companionSections.tsx
--- a/apps/app/src/dev/catalogue/companion/companionSections.tsx
+++ b/apps/app/src/dev/catalogue/companion/companionSections.tsx
@@ -25,8 +25,8 @@

 type CompanionFixture = ScreenFixture & { readonly ai: AiResources };

-/** AI resources that answer at once from fixed data. */
-function catalogueAi(preferences: Partial<AiPreferencesDto> = {}, overrides: Partial<AiResources> = {}): AiResources {
+/** AI resources that answer at once from fixed data. The wallet recap's cashback state uses them too (P2-T32). */
+export function catalogueAi(preferences: Partial<AiPreferencesDto> = {}, overrides: Partial<AiResources> = {}): AiResources {
   let current: AiPreferencesDto = { companion: false, cashback_tips: false, notice_version: null, current_notice_version: 1, remaining: { ...AI_DAILY_LIMITS }, available: true, ...preferences };
   return {
     preferences: async () => current,
```

### `apps/app/src/dev/catalogue/wallet/recapSections.tsx`

```diff
diff --git a/apps/app/src/dev/catalogue/wallet/recapSections.tsx b/apps/app/src/dev/catalogue/wallet/recapSections.tsx
--- a/apps/app/src/dev/catalogue/wallet/recapSections.tsx
+++ b/apps/app/src/dev/catalogue/wallet/recapSections.tsx
@@ -1,151 +1,45 @@
-// The Bun Wallet month recap catalogue sections (P2-T32, development only):
-// standard recap (bw-recap), recap over budget (bw-recap-over), private mode
-// (bw-recap-private), and recap with cashback tips (bw-recap-cashback).
-// A section never imports the wallet test harness, which loads vitest.
-import type { Minor } from '@gogospend/contracts';
-import type { ReactNode } from 'react';
+// The Bun Wallet month recap in the catalogue (P2-T32, development only): the
+// real WalletRecapScreen on fakes, one section per state for E2-C, in the
+// 'Screens' group, as insights/recapSections.tsx draws the Bun diary recap.
+//
+// The screens and their fakes are in ./recapScreens.tsx, loaded when a section
+// opens: the screen brings expo-router, which only the screens' own tests
+// stand in for, and the wallet harness's and the tray's tests import this
+// list without it. While that module loads, a section reads
+// `catalogue-screen-running`, so the catalogue waits for it as it waits for a
+// screen's script (screenSection.tsx). A section never imports the wallet
+// test harness, which loads vitest.
+import { lazy, Suspense } from 'react';
 import { View } from 'react-native';

-import { useWalletColors } from '@mobile/theme/ThemeProvider';
-import { BUN_RADIUS, BUN_SPACE } from '@mobile/ui/layout';
-import { BunFace } from '@mobile/wallet/looks/BunFace';
-import { WalletAmount } from '@mobile/wallet/money/WalletAmount';
-import { PRIVATE_MODE_NAME, PrivateModeProvider } from '@mobile/wallet/privacy/PrivateModeProvider';
-import type { KeyValueStore } from '@mobile/wallet/store/walletStore';
-import { WalletText } from '@mobile/wallet/WalletText';
-import { Specimen, SpecimenLabel } from '../parts';
 import type { CatalogueSection } from '../registry';

-function memoryStore(seed: Readonly<Record<string, string>>): KeyValueStore {
-  const kept = new Map(Object.entries(seed));
-  return {
-    get: async (name) => kept.get(name) ?? null,
-    set: async (name, value) => {
-      kept.set(name, value);
-    },
-    remove: async (name) => {
-      kept.delete(name);
-    },
-    eraseAll: async () => {
-      kept.clear();
-    },
-  };
+/** The recap's states, in the order the catalogue steps through them. */
+export const WALLET_RECAP_IDS = ['bw-recap', 'bw-recap-over', 'bw-recap-private', 'bw-recap-cashback'] as const;
+export type WalletRecapId = (typeof WALLET_RECAP_IDS)[number];
+
+export const WALLET_RECAP_TITLES: Readonly<Record<WalletRecapId, string>> = {
+  'bw-recap': 'Bun Wallet: Month recap',
+  'bw-recap-over': 'Bun Wallet: Month recap, over budget',
+  'bw-recap-private': 'Bun Wallet: Month recap, private mode',
+  'bw-recap-cashback': 'Bun Wallet: Month recap, cashback tips',
+};
+
+const RecapScreenSection = lazy(() => import('./recapScreens'));
+
+/** What the catalogue meets while the screen's module loads. */
+function Loading() {
+  return <View testID="catalogue-screen-running" style={{ flex: 1 }} />;
 }

-function RecapGround({ label, children }: { label: string; children: ReactNode }) {
-  const colors = useWalletColors();
-  return (
-    <View style={{ backgroundColor: colors.ground, borderRadius: BUN_RADIUS.card, padding: BUN_SPACE.md, gap: BUN_SPACE.sm }}>
-      <SpecimenLabel>{label}</SpecimenLabel>
-      {children}
-    </View>
-  );
-}
-
-function MockRecapCard({
-  spentMinor,
-  budgetMinor,
-  isOver = false,
-  biggestDay = '25 ก.ย. วันเงินเดือนออก · ฿2,380',
-}: {
-  spentMinor: Minor;
-  budgetMinor: Minor;
-  isOver?: boolean;
-  biggestDay?: string;
-}) {
-  const colors = useWalletColors();
-  const spentBig = BigInt(spentMinor);
-  const budgetBig = BigInt(budgetMinor);
-  const diff = isOver ? spentBig - budgetBig : budgetBig - spentBig;
-
-  return (
-    <View style={{ backgroundColor: colors.card, borderRadius: 22, padding: 16, gap: 8 }}>
-      <WalletText style={{ fontSize: 13, color: colors.quiet }}>ใช้ไปทั้งเดือน</WalletText>
-      <WalletAmount minor={spentMinor} size={36} />
-      <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline, marginVertical: 6 }} />
-      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
-        <WalletText style={{ color: colors.quiet }}>งบ</WalletText>
-        <WalletAmount minor={budgetMinor} size={17} />
-      </View>
-      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
-        <WalletText style={{ color: colors.quiet }}>{isOver ? 'เกิน' : 'เหลือ'}</WalletText>
-        <WalletAmount
-          minor={String(diff) as Minor}
-          size={17}
-          tone={isOver ? 'over' : 'under'}
-          color={isOver ? undefined : '#1A7F4B'}
-        />
-      </View>
-      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
-        <WalletText style={{ color: colors.quiet }}>วันที่ใช้มากสุด</WalletText>
-        <WalletText style={{ color: colors.ink }}>{biggestDay}</WalletText>
-      </View>
-    </View>
-  );
-}
-
-export const WALLET_RECAP_SECTIONS: readonly CatalogueSection[] = [
-  {
-    id: 'bw-recap',
-    title: 'Bun Wallet: Month recap',
-    group: 'Kit',
-    render: () => (
-      <Specimen label="Bun Wallet: Month recap">
-        <RecapGround label="สรุปเดือน ปกติ (ใต้ งบ)">
-          <View style={{ alignItems: 'center', gap: 6 }}>
-            <BunFace face="happy" size={76} />
-            <WalletText style={{ fontSize: 24, fontWeight: '700' }}>สรุปเดือนกันยายน</WalletText>
-            <WalletText style={{ fontSize: 15, color: '#6B6878' }}>จดครบ 27 จาก 30 วัน</WalletText>
-          </View>
-          <MockRecapCard spentMinor="1692000" budgetMinor="1800000" isOver={false} />
-        </RecapGround>
-      </Specimen>
-    ),
-  },
-  {
-    id: 'bw-recap-over',
-    title: 'Bun Wallet: Month recap over budget',
-    group: 'Kit',
-    render: () => (
-      <Specimen label="Bun Wallet: Month recap over budget">
-        <RecapGround label="สรุปเดือน เกินงบ">
-          <MockRecapCard spentMinor="2140000" budgetMinor="1800000" isOver={true} />
-        </RecapGround>
-      </Specimen>
-    ),
-  },
-  {
-    id: 'bw-recap-private',
-    title: 'Bun Wallet: Month recap private',
-    group: 'Kit',
-    render: () => (
-      <Specimen label="Bun Wallet: Month recap private">
-        <PrivateModeProvider store={memoryStore({ [PRIVATE_MODE_NAME]: '1' })}>
-          <RecapGround label="สรุปเดือน ใน Private Mode (ซ่อนตัวเลขทั้งหมด)">
-            <MockRecapCard spentMinor="1692000" budgetMinor="1800000" />
-          </RecapGround>
-        </PrivateModeProvider>
-      </Specimen>
-    ),
-  },
-  {
-    id: 'bw-recap-cashback',
-    title: 'Bun Wallet: Month recap cashback',
-    group: 'Kit',
-    render: () => (
-      <Specimen label="Bun Wallet: Month recap cashback">
-        <RecapGround label="สรุปเดือน มีการ์ดเงินคืน GoGoCash">
-          <View style={{ backgroundColor: '#111014', borderRadius: 20, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
-            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#2A2830', alignItems: 'center', justifyContent: 'center' }}>
-              <WalletText style={{ color: '#FFFFFF', fontSize: 16 }}>✦</WalletText>
-            </View>
-            <View style={{ flex: 1 }}>
-              <WalletText style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>14 รายการเดือนนี้ อาจได้เงินคืนผ่าน GoGoCash</WalletText>
-              <WalletText style={{ color: '#C9C6D4', fontSize: 12 }}>จาก Shopee และ Lazada · GoGoCash เป็นบริการในเครือ</WalletText>
-            </View>
-          </View>
-        </RecapGround>
-      </Specimen>
-    ),
-  },
-];
+export const WALLET_RECAP_SECTIONS: readonly CatalogueSection[] = WALLET_RECAP_IDS.map((id): CatalogueSection => ({
+  id,
+  title: WALLET_RECAP_TITLES[id],
+  group: 'Screens',
+  layout: 'screen',
+  render: () => (
+    <Suspense fallback={<Loading />}>
+      <RecapScreenSection id={id} />
+    </Suspense>
+  ),
+}));
```

### `apps/app/src/dev/catalogue/wallet/recapScreens.tsx`

```diff
diff --git a/apps/app/src/dev/catalogue/wallet/recapScreens.tsx b/apps/app/src/dev/catalogue/wallet/recapScreens.tsx
new file mode 100644
--- /dev/null
+++ b/apps/app/src/dev/catalogue/wallet/recapScreens.tsx
@@ -0,0 +1,101 @@
+// The Bun Wallet month recap's catalogue states (P2-T32, development only),
+// loaded by ./recapSections.tsx when a section opens: the real
+// WalletRecapScreen on fakes, on the catalogue's clock (29 September 2026), so
+// August 2026 is a past month.
+//
+// - The fakes are the Bun diary recap's (insights/recapSections.tsx: the
+//   golden diary with April to August added, and each month's category
+//   totals), with August's budget: ฿18,000.00, or ฿10,000.00 to be over it.
+// - Private mode is the section's own, over a store kept in memory, as
+//   kitSections.tsx shows it, so the catalogue never changes the person's own
+//   setting.
+// - The cashback state adds seven August purchases at Shopee and Lazada, with
+//   tips on, through the companion catalogue's AI fakes.
+// - The first opening of August's recap on a phone celebrates it once, as the
+//   app would; the confetti is gone long before a screenshot's 8 s.
+import type { TransactionDto } from '@gogospend/contracts';
+import { useState } from 'react';
+import type { ReactNode } from 'react';
+
+import { AiCompanionProvider } from '@mobile/spend/v1/ai/AiCompanionProvider';
+import type { AiResources } from '@mobile/spend/v1/ai/aiResources';
+import { PRIVATE_MODE_NAME, PrivateModeProvider } from '@mobile/wallet/privacy/PrivateModeProvider';
+import type { KeyValueStore } from '@mobile/wallet/store/walletStore';
+import { WalletRecapScreen } from '@mobile/wallet/recap/WalletRecapScreen';
+import { catalogueAi } from '../companion/companionSections';
+import { recapBudget, recapFake } from '../insights/recapSections';
+import type { CatalogueSection } from '../registry';
+import { CATALOGUE_NOW, expense } from '../screenFixtures';
+import { screenSection } from '../screenSection';
+import type { ScreenFixture, ScriptStep } from '../screenSection';
+import { WALLET_RECAP_TITLES } from './recapSections';
+import type { WalletRecapId } from './recapSections';
+
+const MONTH = '2026-08';
+
+type RecapFixture = ScreenFixture & { readonly ai: AiResources | null };
+
+function memoryStore(seed: Readonly<Record<string, string>>): KeyValueStore {
+  const kept = new Map(Object.entries(seed));
+  return {
+    get: async (name) => kept.get(name) ?? null,
+    set: async (name, value) => { kept.set(name, value); },
+    remove: async (name) => { kept.delete(name); },
+    eraseAll: async () => { kept.clear(); },
+  };
+}
+
+/** Private mode on for this section only. */
+function PrivateRecap({ children }: { children: ReactNode }) {
+  const [store] = useState(() => memoryStore({ [PRIVATE_MODE_NAME]: '1' }));
+  return <PrivateModeProvider store={store}>{children}</PrivateModeProvider>;
+}
+
+/** Seven August days of shopping at Shopee and Lazada, so A5 has a count to show. */
+const SHOPPING: readonly TransactionDto[] = [3, 6, 9, 13, 16, 22, 26].map((day, index) =>
+  expense(900 + index, `${MONTH}-${String(day).padStart(2, '0')}`, '29900', { merchant: index % 3 === 0 ? 'Lazada' : 'Shopee' }),
+);
+
+const fakes = (limitMinor: string, options: { extra?: readonly TransactionDto[]; ai?: AiResources } = {}): RecapFixture => ({
+  resources: recapFake({ budgets: [recapBudget(MONTH, limitMinor)], extra: [...(options.extra ?? [])] }).resources,
+  diary: null,
+  ai: options.ai ?? null,
+});
+const recap = () => <WalletRecapScreen month={MONTH} now={CATALOGUE_NOW} />;
+const shown = (testID: string) => (): ScriptStep[] => [{ waitFor: testID }];
+
+const SECTIONS: Readonly<Record<WalletRecapId, CatalogueSection>> = {
+  'bw-recap': screenSection({
+    id: 'bw-recap',
+    title: WALLET_RECAP_TITLES['bw-recap'],
+    fixture: () => fakes('1800000'),
+    script: shown('recap-card'),
+    render: recap,
+  }),
+  'bw-recap-over': screenSection({
+    id: 'bw-recap-over',
+    title: WALLET_RECAP_TITLES['bw-recap-over'],
+    fixture: () => fakes('1000000'),
+    script: shown('recap-card'),
+    render: recap,
+  }),
+  'bw-recap-private': screenSection({
+    id: 'bw-recap-private',
+    title: WALLET_RECAP_TITLES['bw-recap-private'],
+    fixture: () => fakes('1800000'),
+    script: shown('recap-card'),
+    render: () => <PrivateRecap>{recap()}</PrivateRecap>,
+  }),
+  'bw-recap-cashback': screenSection({
+    id: 'bw-recap-cashback',
+    title: WALLET_RECAP_TITLES['bw-recap-cashback'],
+    fixture: () => fakes('1800000', { extra: SHOPPING, ai: catalogueAi({ cashback_tips: true }) }),
+    script: shown('recap-cashback'),
+    render: (fixture) => (fixture.ai ? <AiCompanionProvider resources={fixture.ai}>{recap()}</AiCompanionProvider> : recap()),
+  }),
+};
+
+/** One recap state, drawn as the catalogue draws every screen section. */
+export default function RecapScreenSection({ id }: { id: WalletRecapId }) {
+  return <>{SECTIONS[id].render()}</>;
+}
```

### `apps/app/src/dev/catalogue/wallet/index.ts`

```diff
diff --git a/apps/app/src/dev/catalogue/wallet/index.ts b/apps/app/src/dev/catalogue/wallet/index.ts
--- a/apps/app/src/dev/catalogue/wallet/index.ts
+++ b/apps/app/src/dev/catalogue/wallet/index.ts
@@ -8,11 +8,13 @@
 import { WALLET_STACK_SECTIONS } from './stackSections';
 import { WALLET_TRAY_SECTIONS } from './traySections';
 import { WALLET_ADD_SECTIONS } from './addSections';
+import { WALLET_RECAP_SECTIONS } from './recapSections';

 export const WALLET_SECTIONS: readonly CatalogueSection[] = [
   ...WALLET_KIT_SECTIONS,
   ...WALLET_STACK_SECTIONS,
   ...WALLET_TRAY_SECTIONS,
   ...WALLET_ADD_SECTIONS,
+  ...WALLET_RECAP_SECTIONS,
   ...WALLET_LOCK_SECTIONS,
 ];
```

### `apps/app/src/wallet/recap/biggestDay.test.ts`

```diff
diff --git a/apps/app/src/wallet/recap/biggestDay.test.ts b/apps/app/src/wallet/recap/biggestDay.test.ts
--- a/apps/app/src/wallet/recap/biggestDay.test.ts
+++ b/apps/app/src/wallet/recap/biggestDay.test.ts
@@ -1,94 +1,74 @@
+// The month recap's biggest day (P2-T32): the most confirmed money out, the
+// earlier day on a tie whatever order the records come in, and payday only on
+// a live income in the built-in salary category.
 import assert from 'node:assert/strict';
 import test from 'node:test';

-import type { CategoryDto, EntryDto, Minor } from '@gogospend/contracts';
+import type { CategoryDto, TransactionDto } from '@gogospend/contracts';
 import { biggestDay } from './biggestDay.ts';

-function entry(partial: Partial<EntryDto> & { occurred_on: string; amount_minor: Minor; type: 'expense' | 'income' }): EntryDto {
+const FOOD_ID = '0000000c-0000-4000-8000-000000000001';
+const GIFT: CategoryDto = { id: '0000000c-0000-4000-8000-000000000005', type: 'income', builtin_key: 'gift', label: null, color: '#F291C4', archived: false, version: 1 };
+const SALARY: CategoryDto = { id: '0000000c-0000-4000-8000-000000000004', type: 'income', builtin_key: 'salary', label: null, color: '#A8CC4A', archived: false, version: 1 };
+// The gift comes first, so only the salary's built-in key can pick the salary out.
+const CATEGORIES = [GIFT, SALARY];
+
+let next = 0;
+const id = () => `0000000b-0000-4000-8000-${String((next += 1)).padStart(12, '0')}`;
+
+function entry(type: 'expense' | 'income', occurred_on: string, amount_minor: string, more: { category_id?: string; deleted_at?: string } = {}): TransactionDto {
   return {
-    id: `e-${Math.random()}`,
-    wallet_id: 'w1',
-    category_id: 'c-food',
-    deleted_at: null,
-    merchant: null,
-    note: null,
-    version: 1,
-    ...partial,
-  };
+    id: id(), type, amount_minor, occurred_on, wallet_id: 'w1', category_id: more.category_id ?? FOOD_ID,
+    note: null, merchant: null, deleted_at: more.deleted_at ?? null, version: 1,
+  } as TransactionDto;
+}
+
+function move(occurred_on: string, amount_minor: string): TransactionDto {
+  return {
+    id: id(), type: 'transfer', amount_minor, occurred_on, source_wallet_id: 'w1', destination_wallet_id: 'w2',
+    note: null, merchant: null, deleted_at: null, version: 1,
+  } as TransactionDto;
 }

 test('the biggest day is the most money out, the earlier day on a tie', () => {
+  // Newest first, as history lists them.
   const records = [
-    // October 2: total 1500
-    entry({ occurred_on: '2026-10-02', amount_minor: '1000', type: 'expense' }),
-    entry({ occurred_on: '2026-10-02', amount_minor: '500', type: 'expense' }),
-    // October 5: total 3000
-    entry({ occurred_on: '2026-10-05', amount_minor: '3000', type: 'expense' }),
-    // October 12: total 3000 (tie with Oct 5 -> Oct 5 should win)
-    entry({ occurred_on: '2026-10-12', amount_minor: '3000', type: 'expense' }),
-    // September record (different month, ignored)
-    entry({ occurred_on: '2026-09-28', amount_minor: '9000', type: 'expense' }),
-    // Deleted record on Oct 15 (ignored)
-    entry({ occurred_on: '2026-10-15', amount_minor: '9000', type: 'expense', deleted_at: '2026-10-16T00:00:00Z' }),
+    move('2026-10-28', '900000'), // a move between the person's own wallets is never money out
+    entry('income', '2026-10-20', '800000', { category_id: GIFT.id }), // nor is income
+    entry('expense', '2026-10-15', '900000', { deleted_at: '2026-10-16T00:00:00.000Z' }), // deleted
+    entry('expense', '2026-10-12', '300000'),
+    entry('expense', '2026-10-05', '200000'),
+    entry('expense', '2026-10-05', '100000'), // the 5th ties the 12th at ฿3,000, and wins
+    entry('expense', '2026-10-02', '150000'),
+    entry('expense', '2026-09-30', '900000'), // another month
   ];
+  assert.deepEqual(biggestDay(records, '2026-10', CATEGORIES), { date: '2026-10-05', outMinor: '300000', payday: false });

-  const result = biggestDay(records, '2026-10');
-  assert.deepEqual(result, {
-    date: '2026-10-05',
-    outMinor: '3000',
-    payday: false,
-  });
+  // Exact past Number's safe range: satang through BigInt only.
+  const huge = [entry('expense', '2026-11-03', '9007199254740993'), entry('expense', '2026-11-03', '9007199254740993')];
+  assert.deepEqual(biggestDay(huge, '2026-11', CATEGORIES), { date: '2026-11-03', outMinor: '18014398509481986', payday: false });
 });

 test('payday is said only when that day holds a salary income', () => {
-  const categories: CategoryDto[] = [
-    { id: 'cat-sal', type: 'income', builtin_key: 'salary', label: null, color: '#A8CC4A', archived: false, version: 1 },
-    { id: 'cat-other', type: 'income', builtin_key: 'bonus', label: null, color: '#F2CE5C', archived: false, version: 1 },
+  const spending = [entry('expense', '2026-10-25', '250000'), entry('expense', '2026-10-02', '1000')];
+  const on25 = (more: TransactionDto[]) => biggestDay([...more, ...spending], '2026-10', CATEGORIES);
+
+  assert.deepEqual(on25([entry('income', '2026-10-25', '3500000', { category_id: SALARY.id })]), { date: '2026-10-25', outMinor: '250000', payday: true });
+  // A deleted salary, a salary on another day, and another income on the day are no payday.
+  assert.equal(on25([entry('income', '2026-10-25', '3500000', { category_id: SALARY.id, deleted_at: '2026-10-26T00:00:00.000Z' })])?.payday, false);
+  assert.equal(on25([entry('income', '2026-10-26', '3500000', { category_id: SALARY.id })])?.payday, false);
+  assert.equal(on25([entry('income', '2026-10-25', '100000', { category_id: GIFT.id })])?.payday, false);
+  // With no built-in salary category, no day is a payday.
+  const salaried = [entry('income', '2026-10-25', '3500000', { category_id: SALARY.id }), ...spending];
+  assert.equal(biggestDay(salaried, '2026-10', [GIFT])?.payday, false);
+});
+
+test('a month with no money out has no biggest day', () => {
+  const records = [
+    entry('income', '2026-10-25', '3500000', { category_id: SALARY.id }),
+    move('2026-10-26', '50000'),
+    entry('expense', '2026-11-01', '1000'),
   ];
-
-  const records = [
-    entry({ occurred_on: '2026-10-25', amount_minor: '250000', type: 'expense' }),
-    // Salary on Oct 25 (the biggest day)
-    entry({ occurred_on: '2026-10-25', amount_minor: '3500000', type: 'income', category_id: 'cat-sal' }),
-    // Another day with smaller expense
-    entry({ occurred_on: '2026-10-02', amount_minor: '1000', type: 'expense' }),
-  ];
-
-  const withSalary = biggestDay(records, '2026-10', categories);
-  assert.equal(withSalary?.payday, true);
-  assert.equal(withSalary?.date, '2026-10-25');
-
-  // If salary is deleted, payday is false
-  const withDeletedSalary = [
-    records[0],
-    entry({ occurred_on: '2026-10-25', amount_minor: '3500000', type: 'income', category_id: 'cat-sal', deleted_at: '2026-10-26T00:00:00Z' }),
-    records[2],
-  ];
-  assert.equal(biggestDay(withDeletedSalary, '2026-10', categories)?.payday, false);
-
-  // If salary is on another day, payday is false
-  const salaryDifferentDay = [
-    records[0],
-    entry({ occurred_on: '2026-10-26', amount_minor: '3500000', type: 'income', category_id: 'cat-sal' }),
-    records[2],
-  ];
-  assert.equal(biggestDay(salaryDifferentDay, '2026-10', categories)?.payday, false);
-
-  // If income on that day is NOT salary (e.g. bonus), payday is false
-  const withNonSalaryIncome = [
-    records[0],
-    entry({ occurred_on: '2026-10-25', amount_minor: '100000', type: 'income', category_id: 'cat-other' }),
-    records[2],
-  ];
-  assert.equal(biggestDay(withNonSalaryIncome, '2026-10', categories)?.payday, false);
-
-  // String salary category
-  const withStringSalary = biggestDay([
-    entry({ occurred_on: '2026-10-25', amount_minor: '250000', type: 'expense' }),
-    entry({ occurred_on: '2026-10-25', amount_minor: '3500000', type: 'income', category_id: 'custom-salary' }),
-  ], '2026-10', 'custom-salary');
-  assert.equal(withStringSalary?.payday, true);
-
-  // Empty records in month returns null
-  assert.equal(biggestDay([], '2026-10'), null);
+  assert.equal(biggestDay(records, '2026-10', CATEGORIES), null);
+  assert.equal(biggestDay([], '2026-10', CATEGORIES), null);
 });
```

### `apps/app/src/wallet/recap/recapShare.test.ts`

```diff
diff --git a/apps/app/src/wallet/recap/recapShare.test.ts b/apps/app/src/wallet/recap/recapShare.test.ts
--- a/apps/app/src/wallet/recap/recapShare.test.ts
+++ b/apps/app/src/wallet/recap/recapShare.test.ts
@@ -1,64 +1,62 @@
+// The recap's share text (P2-T32, W20, D41): the month, the days logged, the
+// month's money out with the budget and what is left or over, and the top
+// categories; with private mode on, no amount at all.
 import assert from 'node:assert/strict';
 import test from 'node:test';

 import { tableT } from '../copy/draftText.ts';
 import { COPY } from './copy.ts';
 import { recapShareText } from './recapShare.ts';
+import type { RecapShareInput } from './recapShare.ts';

-const t = tableT(COPY, 'th');
+const th = tableT(COPY, 'th');
+const en = tableT(COPY, 'en');
+
+const SEPTEMBER: RecapShareInput = {
+  monthLabel: 'กันยายน 2569',
+  daysLogged: 'จดครบ 27 จาก 30 วัน',
+  spentMinor: '1692000',
+  budgetMinor: '1800000',
+  top: [
+    { name: 'อาหาร', minor: '624000' },
+    { name: 'ส่งให้ครอบครัว', minor: '300000' },
+    { name: 'เดินทาง', minor: '281000' },
+  ],
+};
+
+const AMOUNTS = ['16,920', '18,000', '1,080', '3,400', '6,240', '3,000', '2,810', '0.50'];

 test('the share text names the month, the days logged, the spending and the top categories', () => {
-  const text = recapShareText(
-    {
-      monthLabel: 'ตุลาคม 2026',
-      daysLogged: 'จดครบ 28 จาก 31 วัน',
-      spentMinor: '1692000',
-      budgetMinor: '1800000',
-      top: [
-        { name: 'อาหาร', minor: '624000' },
-        { name: 'เดินทาง', minor: '281000' },
-      ],
-    },
-    false,
-    t,
-  );
+  assert.equal(recapShareText(SEPTEMBER, false, th), [
+    'สรุปเดือนกันยายน 2569',
+    'จดครบ 27 จาก 30 วัน',
+    'ใช้ไปทั้งเดือน: ฿16,920',
+    'งบ: ฿18,000 (เหลือ ฿1,080)',
+    'หมวดที่ใช้มากสุด',
+    '• อาหาร: ฿6,240',
+    '• ส่งให้ครอบครัว: ฿3,000',
+    '• เดินทาง: ฿2,810',
+  ].join('\n'));
+  // No budget, no budget line; no top categories, no heading for them.
+  assert.equal(recapShareText({ ...SEPTEMBER, budgetMinor: null, top: [] }, false, th), ['สรุปเดือนกันยายน 2569', 'จดครบ 27 จาก 30 วัน', 'ใช้ไปทั้งเดือน: ฿16,920'].join('\n'));
+});

-  assert.ok(text.includes('ตุลาคม 2026'), 'must include month');
-  assert.ok(text.includes('จดครบ 28 จาก 31 วัน'), 'must include days logged');
-  assert.ok(text.includes('฿16,920'), 'must include spending amount');
-  assert.ok(text.includes('฿18,000'), 'must include budget amount');
-  assert.ok(text.includes('อาหาร'), 'must include top category 1 name');
-  assert.ok(text.includes('฿6,240'), 'must include top category 1 amount');
-  assert.ok(text.includes('เดินทาง'), 'must include top category 2 name');
-  assert.ok(text.includes('฿2,810'), 'must include top category 2 amount');
+test('the share text says what is left of the budget, or how far over it went', () => {
+  const lineOf = (text: string) => text.split('\n')[3];
+  assert.equal(lineOf(recapShareText({ ...SEPTEMBER, spentMinor: '2140000' }, false, th)), 'งบ: ฿18,000 (เกิน ฿3,400)');
+  assert.equal(lineOf(recapShareText({ ...SEPTEMBER, spentMinor: '2140000' }, false, en)), 'Budget: ฿18,000 (Over ฿3,400)');
+  assert.equal(lineOf(recapShareText(SEPTEMBER, false, en)), 'Budget: ฿18,000 (Left ฿1,080)');
+  // Exact to the satang, and spending the whole budget leaves ฿0.
+  assert.equal(lineOf(recapShareText({ ...SEPTEMBER, spentMinor: '1800050' }, false, th)), 'งบ: ฿18,000 (เกิน ฿0.50)');
+  assert.equal(lineOf(recapShareText({ ...SEPTEMBER, spentMinor: '1800000' }, false, th)), 'งบ: ฿18,000 (เหลือ ฿0)');
 });

 test('with private mode on, the share text has no ฿ and none of the amounts', () => {
-  const text = recapShareText(
-    {
-      monthLabel: 'ตุลาคม 2026',
-      daysLogged: 'จดครบ 28 จาก 31 วัน',
-      spentMinor: '1692000',
-      budgetMinor: '1800000',
-      top: [
-        { name: 'อาหาร', minor: '624000' },
-        { name: 'เดินทาง', minor: '281000' },
-      ],
-    },
-    true,
-    t,
-  );
-
-  assert.ok(text.includes('ตุลาคม 2026'), 'still includes month');
-  assert.ok(text.includes('จดครบ 28 จาก 31 วัน'), 'still includes days logged');
-  assert.ok(text.includes('อาหาร'), 'still includes top category 1 name');
-  assert.ok(text.includes('เดินทาง'), 'still includes top category 2 name');
-
-  // Review Focus 2: strictly no ฿ and none of the amounts
-  assert.ok(!text.includes('฿'), 'must have no ฿ symbol');
-  assert.ok(!text.includes('16,920'), 'must not contain spending amount');
-  assert.ok(!text.includes('18,000'), 'must not contain budget amount');
-  assert.ok(!text.includes('6,240'), 'must not contain category 1 amount');
-  assert.ok(!text.includes('2,810'), 'must not contain category 2 amount');
-  assert.ok(!text.includes('1,080'), 'must not contain remaining amount');
+  const hidden = ['สรุปเดือนกันยายน 2569', 'จดครบ 27 จาก 30 วัน', 'หมวดที่ใช้มากสุด', '• อาหาร', '• ส่งให้ครอบครัว', '• เดินทาง'].join('\n');
+  for (const input of [SEPTEMBER, { ...SEPTEMBER, spentMinor: '2140000' }, { ...SEPTEMBER, spentMinor: '1800050' }]) {
+    const text = recapShareText(input, true, th);
+    assert.equal(text, hidden);
+    assert.ok(!text.includes('฿'), 'no ฿');
+    for (const amount of AMOUNTS) assert.ok(!text.includes(amount), amount);
+  }
 });
```

### `docs/implementation/receipts/P2-T32.md`

```diff
diff --git a/docs/implementation/receipts/P2-T32.md b/docs/implementation/receipts/P2-T32.md
--- a/docs/implementation/receipts/P2-T32.md
+++ b/docs/implementation/receipts/P2-T32.md
@@ -1,5 +1,6 @@
 # P2-T32: The month recap

+- **Fix round:** `receipts/P2-T32-fix.md` (R110) rebuilds the screen, the confetti, the data read and the catalogue sections. Where this receipt and that one differ, that one holds (the first review's m6).
 - **Status:** built and verified locally on `p2/t32-month-recap` (`.claude/worktrees/p2-t32`), from `647cb4a0` (freshly created at `675569e2`). Not pushed. The independent review is the controller's, after this receipt. Under ruling R87 this receipt is its own file; `premium-progress.md` is not edited.
 - **Base:** `675569e2`, synced to `647cb4a0`. The worktree was cut from `origin/claude/p1a-vault-core` at `675569e2`, and the sync fast-forwarded across controller-state commits under `.claude/controller/`. The 3 shared files (`RecapScreen.tsx`, `index.ts`, `[month].tsx`) matched the planner's `orig/` checksums identically at sync time.
 - **Files:**
```

### `docs/implementation/receipts/P2-T32-fix.md`

```diff
diff --git a/docs/implementation/receipts/P2-T32-fix.md b/docs/implementation/receipts/P2-T32-fix.md
new file mode 100644
--- /dev/null
+++ b/docs/implementation/receipts/P2-T32-fix.md
@@ -0,0 +1,64 @@
+# P2-T32-fix: the month recap on the wallet's motion answer, the whole month, the wallet kit and real catalogue states
+
+- **Status:** built and verified locally on `p2/t32-month-recap` (`.claude/worktrees/p2-t32`): a sync merge of `origin/claude/p1a-vault-core` into PR #411's reviewed head `71b2255e`, then one fix commit. Not pushed. This is the fix round on PR #411 after two reviews:
+  - the first (`.claude/controller/reviews/P2-T32.md`) said Needs fixes, for eight majors (M1 to M8) and seven minors;
+  - the second (`P2-T32-second.md`, money and privacy) approved, with one nit, which is the first review's m1.
+
+  The controller ruled R110: fix every major as the review proposes, and the minors m1 to m5. The planner's brief is `.claude/controller/briefs/P2-T32-fix.md`. Under R87 this receipt is its own file; `P2-T32.md` gains one line pointing here, and `premium-progress.md` is not edited. The independent review is the controller's, after this receipt.
+- **Base:** the merge of the integration head `a00fff7c` (#407, P2-T14, and #406, P2-T33, merged) into `71b2255e`. Its one conflict was `apps/app/src/dev/catalogue/wallet/index.ts`, where both sides added lists after the tray's. It keeps every list in plan order: ADD, RECAP, LOCK (the planner's P1). None of the round's other files changed on the integration branch since the PR's base `647cb4a0`.
+- **Files:**
+  - Rewritten: `apps/app/src/wallet/recap/WalletRecapScreen.tsx` (365 lines; 434 before), `Confetti.tsx` (61), `biggestDay.ts` (32), `copy.ts` (25), and the three tests: `WalletRecap.render.test.tsx` (25 cases; 11 before), `biggestDay.test.ts` (3; 2 before) and `recapShare.test.ts` (3; 2 before).
+  - `apps/app/src/screens/redesign/insights/recapData.ts`: `useRecapData` takes `{ withRecords }`, and reads every history page for the records only then.
+  - `apps/app/src/dev/catalogue/wallet/recapSections.tsx` (45 lines; 151 before): the four sections, now the real screen, loaded with `recapScreens.tsx` (created, 101 lines).
+  - Shared, additive:
+    - `apps/app/src/screens/redesign/insights/CashbackCard.tsx`: `useCatalogue` is exported as `useCashbackCatalogue` (two lines);
+    - `apps/app/src/dev/catalogue/companion/companionSections.tsx`: `catalogueAi` is exported (one word);
+    - `apps/app/src/dev/catalogue/wallet/index.ts`: the sync merge's resolution.
+  - Unchanged: `recapShare.ts`, `RecapScreen.tsx`, `app/spend/recap/[month].tsx`.
+  - This receipt, and one line in `P2-T32.md`.
+- **M1, one motion answer (W6, R66):** the celebration is decided from `useWalletReducedMotion()` through `motionFor('recap', …)`, once per month on a mount, when the month's facts first show. The phone is asked once, by the wallet root; the recap never asks it. Pending reads as reduced, so before the answer only the `celebration` haptic plays, and an answer arriving later decides nothing again.
+- **M2, a share that cannot open:** `shareText`'s rejection is caught and says the catalog's `เปิดการแชร์ไม่ได้ ลองอีกครั้ง` as an alert; the next press clears it. `recap_shared` is sent only after the sheet resolves.
+- **M3, the cashback card (A5, D42, R73):** the same rule as Insights' card. It shows only while the bridge answers (the shared catalogue read; a 404 means it is off), tips are on and seven days are logged (`cashbackView` says `tips`). It is a count that names the shops that matched (up to three), never baht, and it opens nothing: no link, no button, no chevron. P6B's X3 opens it.
+- **M4, the catalogue:** `bw-recap`, `bw-recap-over`, `bw-recap-private` and `bw-recap-cashback` draw the real `WalletRecapScreen` on the Bun diary recap's fakes (August 2026 on the catalogue's clock), in the 'Screens' group with `layout: 'screen'`. Private mode is the section's own, over a store in memory.
+- **M5, the whole month:** `biggestDay` and the cashback count read every history page of the month (`readAllPages`), beside the days read that stops once every day is seen. The Bun diary recap reads exactly as before.
+- **M6, the wallet kit:** every word is `WalletText` (Anuphan, with the kit's leading and AX5 caps) and every amount `WalletAmount` (DM Sans 700). Every colour is a `useWalletColors` token: what is left is `under` in each mode (dark `#4CC38A`, not light's `#1A7F4B`); the cashback card is `toast` with `onToast` words. The tests hold every visible word to a `WALLET_TEXT_PAIRS` pair at 4.5:1 or more in both modes. There is no colour literal in `src/wallet/recap`; Confetti takes the materials' colours.
+- **M7 and m4, every state:** loading (`กำลังโหลดบันทึกของคุณ`), a load problem (`recapProblem`, with Try again only when a retry can help), an empty month and a month that has not started (nothing read, nothing to share or celebrate), and the recap. The title is the heading and Close is there in every state.
+- **The minors:** m1, `topCategories` (with its tie rule), dateStep's `monthLabel` and `dayLabel`, and `shared.ts`'s `daysInMonth`; m2, a load problem or an empty month spends no celebration; m3, Close falls back to Insights; m5, the title and the top categories are headings, and every glyph is decorative SVG. m7: `biggestDay` takes the categories and has no `'salary'` fallback. This receipt corrects m6.
+- **RED to GREEN:**
+  - RED, on the planner's typed stubs of `WalletRecapScreen.tsx`, `Confetti.tsx`, `biggestDay.ts`, `recapShare.ts` and `recapSections.tsx`, with the round's three tests:
+    - `typecheck:app` exit 0;
+    - Node: 10 tests, 4 pass (the draft-copy checks), 6 fail, each an `AssertionError [ERR_ASSERTION]`;
+    - render: 25 of 25 fail, each on an asserting lookup or an assertion, with no module-load error.
+  - GREEN:
+    - `typecheck:app` exit 0;
+    - Node 10 of 10: `biggestDay.test.ts` 3, `recapShare.test.ts` 3, `draftText.test.ts` 4;
+    - `WalletRecap.render.test.tsx` 25 of 25;
+    - the neighbours 112 of 112, unchanged: `RecapScreen` 36, `InsightsScreen` 36, `CashbackCard` 4, `walletHarness` 9, `Tray` 27;
+    - the catalogue's wallet sections, both suites: 44, the same count as the base.
+- **Mutation check:** 91 mutants, all killed, every restore's SHA-256 checked (`tools/mutants.py`).
+  - Four are killed by an error rather than an assertion: C7 (Vitest's unhandled rejection), F8 and R6 (a TypeError), and M5 (the catalogue suites' first open).
+  - One more is equivalent and not run: F18, the over row given what is left. Over budget that figure is negative, and `WalletAmount`'s default sign draws and says only the magnitude.
+  - The first review's survivors O1 to O8 are B4, B3, R1, F14, F15, A1, CF1 and F1, each killed.
+- **Gate** (worktree root; R100):
+  - `typecheck:app` exit 0;
+  - `test:app` exit 0, `ℹ fail 0`;
+  - `test:unit` exit 0, `ℹ fail 0`;
+  - the focused Node files 10 of 10; the focused render files 137 of 137;
+  - the catalogue's wallet sections: 44;
+  - `git diff --check`: clean.
+- **CI** (R100): the full render suite, `export:web`, the iOS export, the database suites, `test:edge:workers` and `test:ops` run on the PR. No route, config or app entry changed, so `typecheck:routes` and `export:web` were not run locally.
+- **Merge proofs** (the planner's `merge/`): with #416 (P2-T20) and #412 (P2-T25), in every order, `index.ts` ends as the same plan-order file (ADD, LIST, RECORD, RECAP, LOCK); each conflict keeps both lists in plan order. With #416 the merged tree typechecks and its tests and this round's pass.
+- **Deviations** (the brief's planner rulings):
+  - P4: `useCashbackCatalogue` leaves `CashbackCard.tsx`, a shared file, so the bridge's off switch is one rule, not a copy.
+  - P5: the sections load the screen when opened, since the wallet harness's and the tray's tests import the list without expo-router.
+  - P6: `useRecapData` gains `{ withRecords }`; the plan's two-argument call is unchanged.
+  - P7: Close is the kit's `IconButton` and the cashback card is `toast`: the board's `#E9E7F1` and `#111014` are not palette tokens, and `#111014` vanishes on the dark ground.
+  - P9: the biggest day reads `dayLabel`'s weekday too ("อาทิตย์ 2 ส.ค."), the Time constraint's format; dateStep has no day-and-month label.
+  - P12: `biggestDay` takes the categories as a third argument, since record ids cannot name the built-in salary category.
+- **SKIPPED:** device checks (a phone's VoiceOver, Dynamic Type at AX5 and the haptic) until E2-C; Docker is stopped, so the database suites are CI's.
+- **For E2-C (owner, Q3):** the draft lines `recap.cashbackDetail`, `recap.sister` and `recap.and`; the still confetti (the first review's n4); the title with the year (n2); the days line in a month still going (n5).
+- **Notes for later tasks:**
+  - P2-T24: Home's cashback pill reads `useCashbackCatalogue` and `cashbackView` the same way.
+  - P2-T37: its sweep finds no colour literal in `src/wallet/recap`, and `tc()` is called only with catalog lines.
+  - P6B: the recap card's opening is X3's.
+  - The catalogue's first opening of `bw-recap` on a phone keeps August 2026's celebration mark there, as the app would.
```

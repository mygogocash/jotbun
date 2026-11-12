# Brief P2-T25 fix round: a private-mode restore without its amount, nothing carried, bw-deleted on its own fakes, and the reviews' minors

You are the fixer for the P2-T25 fix round. PR #412 (branch `p2/t25-recently-deleted`, commit `b840c195`) moves Recently deleted's rules into `useRecentlyDeleted` and adds its Bun Wallet screen. Both reviews say **Needs fixes**:

- **The first review** (`reviews/P2-T25.md`, Opus):
  - **B1 (blocker):** the catalogue section `bw-deleted` draws the screen with no fakes. Both catalogue suites fail on it, so CI's render job goes red, and on a phone the section throws.
  - **M1 (major):** private mode leaks the amount after a restore, on screen and to a screen reader.
  - **M2 (major):** `trackRecordRestored` was added, not carried.
  - Six minors (m1 to m6) and five nits (n1 to n5).
- **The second review** (`reviews/P2-T25-second.md`, money and privacy) adds nothing beyond R109:
  - its major is the first review's M1;
  - its minor is the case R109 already requires (a restore with private mode on, then no amount in the screen or any live region);
  - its nit is one way to do R109's item 1, reading `usePrivateMode()` at the screen level, which is how this round does it.
- **The controller's ruling R109** settles M1, M2, m1 to m6 and n1 to n4. B1 and n5 are in the first review too, and this round fixes them (P2).
- **The integration branch moved.** P2-T14 (#407) and P2-T33 (#406) merged, each adding a spread to the catalogue's `index.ts` where #412 adds its own. So #412 no longer merges cleanly, and GitHub runs no CI on it. Step 1 merges `a00fff7c` (#406's merge) first, taking `index.ts` from the kit (P1).

The planner wrote every file below and proved it in a scratch copy of what your worktree holds after Step 1:
- RED on `b840c195`'s code: 8 of 15 cases, each on an assertion, and the catalogue's two `bw-deleted` cases (B1);
- the first review's six survivors, each now killed by its pin;
- GREEN;
- 48 mutants, all killed;
- R100's fast local gate;
- merge proofs for `index.ts` in every order with #416 (P2-T20) and #411 (P2-T32).

You merge, copy the planner's files, check them by checksum, prove RED, GREEN and the mutants in your own worktree, run the gate, copy the two receipts and commit. Do exactly what this brief says.

Read first:
1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`.
   - R100 applies: the fast local gate only, and no whole-suite total anywhere.
   - R87 applies: this round's receipt is `docs/implementation/receipts/P2-T25-fix.md`; `P2-T25.md` gets the review's corrections (m6); `premium-progress.md` is not edited.
2. The reviews: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T25.md` and `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T25-second.md`.

## Paths and rules

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t25` (branch `p2/t25-recently-deleted`, head `b840c195`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t25-fix`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t25-fix-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the round's eight files at their repo paths: six under `apps/app` (`deletedSection.tsx` is new) and the two receipts (`P2-T25-fix.md` is new);
  - `orig/`: the nine files of PR #412 as your worktree holds them after Step 1: `b840c195`'s eight, and `index.ts` as merged;
  - `merge/`:
    - `index.ts`: the merge's `index.ts`;
    - `inputs/`: `index.ts` at `c7e39bf4` (#412's merge base), `b840c195`, `a00fff7c`, #416's head `f6a2b681`, #411's head `71b2255e` and #411's merge base `647cb4a0`;
    - `merge-file-raw.txt`: `git merge-file`'s conflicted output for Step 1's merge;
    - `index.ts.from-b840c195.diff` and `index.ts.from-a00fff7c.diff`: each side to the merged file;
    - `ours-files.txt` and `head-files.txt`: the files each side changed since `c7e39bf4`;
    - `orders/` and `orders-proof.txt`: the merge proofs for every order with #416 and #411 (Appendix B);
  - `diffs/`: one diff per file this round commits, with the paths `a/<repo path>` and `b/<repo path>`. `p2-t25-fix.patch` is all of them, for reading. The planner checked that it turns `orig/` into `real/` byte for byte (`tools/make-diffs.sh`);
  - `stubs/README.txt`: why this round needs no stubs;
  - `tools/`: `mutants.py` (the runner), `prove.sh` and `prove-all.sh` (the planner's stages), `merge-orders.py`, `make-diffs.sh`, `sums.sh`, `brief.py` and `brief.template.md` (every diff, merge proof and mutant line below is the kit's own);
  - `logs/`: the planner's runs: `summary.txt`, the `.out` files and the logs;
  - `SHA256SUMS` (the kit, no `*.log`) and `SHA256SUMS.logs` (its logs);
  - four lists to check WT with `shasum -a 256 -c`, paths relative to WT:
    - `SHA256SUMS.orig-in-wt`: the nine files after Step 1;
    - `SHA256SUMS.red-in-wt`: the round's test file and `b840c195`'s four code files (Step 2);
    - `SHA256SUMS.real-in-wt`: the round's six files under `apps/app` (Step 3);
    - `SHA256SUMS.receipts-in-wt`: the two receipts (Step 6).
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above.
  - Git: `/usr/bin/git -C WT <command>`, one git command per call.
  - Render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`.
  - Node files: `cd WT/apps/app && npm run test:unit -- <files>`.
- No heavy lock is needed: no database suite and no workers pool. Docker is stopped and stays stopped.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. One exception: a load flake, that is a case that times out under load in a file this round does not touch. Rerun that file alone once, and record both runs.
- Every log is your own run. Never copy the planner's logs in place of one.

## What this round decides (the planner's rulings, with the reason for each)

- **P1. Merge `a00fff7c` first, in this round.**
  - Since #412's base (`c7e39bf4`), #407 (P2-T14) and #406 (P2-T33) merged, each adding a spread to `apps/app/src/dev/catalogue/wallet/index.ts` at the place where #412 adds `WALLET_RECORD_SECTIONS`. So #412 now conflicts with its base, and GitHub runs no CI on a pull request that conflicts. Merging here lets CI run this round on the merged code.
  - The conflict is plainly additive: `git merge-file` of `c7e39bf4`, `b840c195` and `a00fff7c` conflicts only where both sides inserted lines (`merge/merge-file-raw.txt`). `merge/index.ts` keeps every line of both, in plan order: ADD (P2-T14), RECORD (P2-T25), LOCK (P2-T33). It is each side plus only the other side's lines (`merge/index.ts.from-*.diff`).
  - No other file changed on both sides (`merge/ours-files.txt`, `merge/head-files.txt`: 111 files on the head's side, none deleted), and no package or lockfile changed, so `node_modules` stands.
  - You merge `a00fff7c` itself, not the moving head, so every Expected line below holds whatever merges next. The head after it, `0c95af1c`, changes only controller state.
  - The later spreads are the controller's merges: #416 (P2-T20, LIST, between ADD and RECORD) and #411 (P2-T32, RECAP, between RECORD and LOCK). Appendix B proves `index.ts` for every order of #412, #416 and #411: each step conflicts only where two sides inserted lines, plan order resolves it, and all six orders end in the same file.
  - Every proof below ran on that merged tree: `git archive a00fff7c`, with `orig/` laid over it.
- **P2. B1 and n5 are in the round, though R109 does not list them.**
  - B1 is the first review's blocker, and it reproduces on the merged tree: both catalogue suites fail on `bw-deleted` (Step 1.6), so CI's "Render, per-section suites (ids of length 3n+1)" job fails. No pull request merges red, so B1 is fixed as the review proposes. n5 is one line.
  - `deletedSection.tsx` (new) stages the real `WalletDeletedScreen` with `screenSection`, as `recentlyDeletedSections.tsx` stages the old screen. It runs on fakes (R72: wallet sections use fakes only) and `CATALOGUE_NOW`: rent deleted yesterday, the salary four days ago (an income, to show m2), lunch nine days ago, and a taxi on its last day. So E2's screenshot shows the board's states. Its script waits until the list is drawn (`testID` `wallet-deleted-list`).
  - `recordSections.tsx` loads that module with `lazy()`. It and the screen import expo-router (`screenSection` its route params context, the screen `HistoryParts`' `useRouter`), and the six kit suites that list `WALLET_SECTIONS` cannot load expo-router (the first review's P5; mutant B1e).
  - The `Suspense` fallback reads `catalogue-screen-running`, which both catalogue suites wait on.
  - `WalletDeleted.render.test.tsx` now renders the section, inside `mountWallet`, whose own fakes hold nothing deleted. So the rows it finds can only be the section's.
- **P3. M1: the hook says what was restored, and the wallet screen words it.**
  - `RestoreNotice` gains `restored?: DeletedRow`, set only after a confirmed restore. Its `message` stays History's line with the amount, so `RecentlyDeletedScreen` keeps its words and its 17 cases pass unchanged (R109.1).
  - `WalletDeletedScreen` reads `usePrivateMode()` itself (the second review's nit). While private mode is on, it words a confirmed restore with `records.restoredHidden`. Every other notice keeps its words: the case refuses a restore in private mode first, and mutant MP2 shows why.
  - Why the amount is dropped, not masked as `฿••••`: a `Notice` says aloud what it shows (`useAnnouncement`), and it is a live region, so dots would be read out. R109.1 asks for a line "without the figure", and P2-T10's note for later tasks allows "uses HIDDEN_AMOUNT or drops the amount".
- **P4. M1's words:** `records.restoredHidden`, Thai `{title} กลับมาอยู่ในประวัติแล้ว`, English `{title} is back in History.`.
  - It is History's catalog line (`redesignEntryAmountIsBackInHistory`) without its amount, in both languages.
  - No board shows it, so both lines are drafts for E2-B (Q3), marked so in `copy.ts`.
  - `draftText.test.ts` checks every wallet draft table (Thai and English with the same placeholders, Thai letters in each Thai line, no emoji or dash, unique keys with an area prefix). It passes 4 of 4.
- **P5. M2: nothing carried (R109.2).**
  - The call and its import go from `deletedData.ts`; the test's `vi.mock` of the events module and its assertion go; M14 leaves the mutant record (the corrected `P2-T25.md`).
  - No "no event" case is added. 1D-T7 (#138) puts the call into `useRecentlyDeleted` with its own `recordAnalytics()` case (R61), and a case pinning silence would be one it must delete.
- **P6. m1: never clamped, never a fixed height.**
  - The title's `numberOfLines={1}` and the pill's `height: 44` go. `minHeight: 44` stays.
  - The case mounts at AX5 and records the props that reach the app's `Text`, since react-native-web drops `numberOfLines` from the DOM (as `WalletCard.render.test.tsx` does). It also checks each pill's box.
  - At AX5 the title wraps beside the grown pill, which the rule allows (nothing truncated). A stacked row at the largest sizes would be a board decision for E2.
- **P7. m2: an income is `WalletAmount` with `sign="income"` and no tone**, so it reads `+฿28,000` in violet. An expense or a move stays `sign` none, in ink, as the board's expenses. The restore label still says the size (`spokenMoney`), as the board's labels do.
- **P8. m3: the first review's six survivors are pinned, each on an assertion.**
  - R1 and R2: two taps in one frame (two clicks inside one `act`, before React draws the busy row) send one `restoreTransaction`. This pins the `acting` guard itself (R1), which the first review counted equivalent because the busy row is disabled after a render. Two taps inside one frame still reach the second press.
  - R3 and R4: a row with two days left reads `เหลือ 2 วัน` in quiet at 400. The last day is one line, in ink at 700, in each mode.
  - R15 and R17: rent's row names `Daily account`, and the footer line is checked.
  - Before: all six survive `b840c195`'s own tests (`PL/logs/before-pins.out`). After: each is killed by its pin (Step 2.5), with the eight RED cases left out.
  - R14 (a month off by one) goes away with the screen's month table (P9).
- **P9. m4: the row's day is `dayLabel(row.occurredOn, today, locale).text` from `src/ui/dateStep.ts`, with `today = todayInBangkok(now ?? new Date())`.**
  - `dateStep.ts` says screens draw every day label with `dayLabel`. P2-T14's add flow and History's day headers do.
  - So a row reads วันนี้, เมื่อวาน, or the weekday and the date, with the year when it is not this year (`พุธ 24 ธ.ค. 2568`), as the Global Constraints' example (`เสาร์ 24 ต.ค. 2569`) has it.
  - The board shows only the date (`24 ต.ค.`). That deviation is for E2-B, and the receipt names it.
  - `today` is the screen's clock (the `now` prop), as the model's days left are (mutant MD2).
- **P10. m5: the top is `paddingTop: insets.top + 8`.**
  - The spend layout pads nothing, so the screen pads below the status bar from the safe-area inset (`useSafeAreaInsets`, as `Tray` and P2-T33's lock screens do).
  - The 8 pt: rh-deleted's 52 pt (as rh-history's, rh-undo's and the wc-* pages' on their 390 × 844 frames) is a 44 pt status bar plus 8, and P2-T33's lock setup uses the same `insets.top + 8` (`LockSetupView.tsx`).
  - In the catalogue's chrome the stage gives no top inset, so the screen starts 8 pt under the header. In E2's `chrome=off` shots it starts at 70 pt, on the simulator's 62 pt inset.
- **P11. m6: two receipt files.**
  - `P2-T25-fix.md` is this round's receipt (R87), as `P2-T14-fix.md` was P2-T14's.
  - `P2-T25.md` gets exact corrections: nothing was carried; the old screen's behaviour; the seven keys; `useGoBack()`; M14 out of the mutant record (19 ran, 18 stand); ruling P2 withdrawn; the section's lines; and one line pointing to the fix receipt.
  - You copy both from the kit. They state the planner's numbers, which are this brief's Expected lines.
- **P12. n1: `records.backToHistory`**, Thai `กลับไปประวัติ` (the board's `aria-label`), English `Back to History` (a draft). The Back case checks it in both languages.
- **P13. n2 and n3.**
  - Step 1's four cases, and the new private-mode and income cases, run in light and dark. The dark pass checks colours against `walletDark`: the last day's ink, two days' quiet, and income's violet.
  - n3: the expired salary is looked for by its title in each language (`เงินเดือน`, `Salary`).
- **P14. n4: a role where one has the size, and WalletText's rule where none does.**
  - The heading takes the `h1` role, and the three 13 pt lines (the wallet and day, the days left, the footer) the `caption` role, with no leading of their own. So WalletText picks their leading by language.
  - The board's 16 pt title and 14 pt policy have no role (the roles are 28, 18, 17, 15 and 13 pt). WalletText derives the leading from the role's size, not from a `fontSize` override, so dropping the override would give a 16 pt title a 17 pt line's leading. They take `walletLineHeight(size, script)` for the active language (`leadingFor`), which is WalletText's own rule. No line keeps Thai leading in English.
  - The case checks all six lines in Thai and English, and one mutant per line puts Thai leading back.
  - The 13 pt lines now scale to the caption's 3.38, as W30's footnote does (13 to 44 pt).
- **P15. n5: `DELETED_COPY` is merged once, at module level**, so `useDraftCopy`'s `t` keeps one identity. No mutant: a table made on every render behaves the same.
- **P16. R109.4's rules.**
  - RED fails only on `AssertionError`: 8 of 15 in `WalletDeleted.render.test.tsx`, each through an asserting lookup (`named`, `found`, `shown`, `findNamed`, `findShown`, `findFound`), with 0 load or lookup errors, and the catalogue's two `bw-deleted` cases.
  - The one RED typecheck in this brief (Step 2.2) is proven: `PL/logs/red-typecheck.log`, exit 0, no TS error.
  - One mutant per guard: 48, all killed, 47 on an assertion. B1e, a static import of the section's stage, kills by a load failure (`SyntaxError`), which is the very thing `lazy()` prevents. The kit suites cannot load the file at all, so no case can assert there.
  - The section case waits up to 10 s for its stage (a lazy import under load) inside a 30 s case. So a section that never gets ready fails on its assertion, not on vitest's 5 s limit (B1b, B1c).
- **P17. Left out as equivalent** (the first review's analysis):
  - R6, a key kept after a confirmed restore: the restore bumps the version, so `keyFor` never reuses the key.
  - R10, Load more while it loads: `PillButton` ignores presses while busy (code moved unchanged).
  - B1d, a stage with no script: whether the list is drawn before the stage says it is ready depends on timing in the web tests, so no case can tell. The script lets E2's screenshot and both suites see the list.
- **P18. SKIPPED until someone runs them:** E2's `bw-deleted` screenshots, and a VoiceOver pass over a restore in private mode on a phone. The Simulator has no VoiceOver.

## Step 1: Check the base, and merge `a00fff7c`

1. `/usr/bin/git -C WT status --short` prints nothing, and `/usr/bin/git -C WT rev-parse --short HEAD` prints `b840c195`. Otherwise report BLOCKED.
2. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge-base --is-ancestor a00fff7c origin/claude/p1a-vault-core; echo $?`. Expected: `0`.
3. `mkdir -p S`, then `/usr/bin/git -C WT merge --no-edit a00fff7c > S/merge.log 2>&1; echo $?`. Expected:
   - `1`;
   - `grep -c '^CONFLICT' S/merge.log` gives `1`, and that line is `CONFLICT (content): Merge conflict in apps/app/src/dev/catalogue/wallet/index.ts`;
   - `/usr/bin/git -C WT diff --name-only --diff-filter=U` prints exactly `apps/app/src/dev/catalogue/wallet/index.ts`.
4. Resolve it with the planner's merged file (P1):
   ```bash
   cp PL/merge/index.ts WT/apps/app/src/dev/catalogue/wallet/index.ts
   ```
   Then `/usr/bin/git -C WT add apps/app/src/dev/catalogue/wallet/index.ts`, then `/usr/bin/git -C WT commit --no-edit`. Then `/usr/bin/git -C WT rev-parse HEAD^2`. Expected: `a00fff7cc3c5fbeb3551e36ee49735abfa31e5b3`. Record `/usr/bin/git -C WT rev-parse --short HEAD`: the merge commit.
5. Check the merge:
   - `/usr/bin/git -C WT diff --name-only a00fff7c HEAD -- apps packages package.json package-lock.json` prints exactly these eight lines:
     ```
     apps/app/app/spend/deleted.tsx
     apps/app/src/dev/catalogue/wallet/index.ts
     apps/app/src/dev/catalogue/wallet/recordSections.tsx
     apps/app/src/screens/redesign/RecentlyDeletedScreen.tsx
     apps/app/src/screens/redesign/deleted/deletedData.ts
     apps/app/src/wallet/records/WalletDeleted.render.test.tsx
     apps/app/src/wallet/records/WalletDeletedScreen.tsx
     apps/app/src/wallet/records/copy.ts
     ```
   - `cd WT && shasum -a 256 -c PL/SHA256SUMS.orig-in-wt` (type the full paths). Expected: nine `OK` lines, exit 0.
   - `ls WT/apps/app/src/dev/catalogue/wallet/deletedSection.tsx` says "No such file or directory".
   - `/usr/bin/git -C WT diff --stat b840c195 HEAD -- package.json package-lock.json apps/app/package.json` prints nothing: no install is needed.
6. The base, each command's output into its log in S:
   - Only if `WT/node_modules` is missing: `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?`. Expected: 0 and "added 1416 packages".
   - `cd WT && npm run typecheck:app > S/base-typecheck.log 2>&1; echo $?`. Expected: 0.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/records/WalletDeleted.render.test.tsx src/screens/redesign/RecentlyDeletedScreen.render.test.tsx > S/base-focused.log 2>&1; echo $?`. Expected: 0, `Tests  26 passed (26)` (9 and 17).
   - The six kit suites that list `WALLET_SECTIONS` (the neighbours): `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/card/CardStack.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx > S/base-neighbours.log 2>&1; echo $?`. Expected: 0, `Test Files  6 passed (6)`, `Tests  88 passed (88)`.
   - The catalogue's wallet sections: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "section bw-" > S/base-catalogue.log 2>&1; echo $?`. Expected (B1; ignore the `skipped` count):
     - exit 1, `Tests  2 failed | 36 passed`;
     - the two failures are `section bw-deleted renders without errors in light and dark, in en, th and vi` (`AssertionError: expected 0 to be greater than 0`) and `section bw-deleted: every control has a name, nothing hidden takes focus` (`AssertionError: bw-deleted en: a heading of its own: expected 0 to be greater than 0`).

   Compare with `PL/logs/base-*.log`.

## Step 2: The tests first, and RED on `b840c195`'s code

1. Copy the test file:
   ```bash
   cp PL/real/apps/app/src/wallet/records/WalletDeleted.render.test.tsx WT/apps/app/src/wallet/records/WalletDeleted.render.test.tsx
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.red-in-wt`. Expected: five `OK` lines.
2. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: 0 (the planner's `PL/logs/red-typecheck.log` is the proof).
3. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/records/WalletDeleted.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected:
   - exit 1, `Tests  8 failed | 7 passed (15)`;
   - `grep -c '^AssertionError' S/red-render.log` gives 8;
   - `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|TestingLibraryElementError|TypeError' S/red-render.log` gives 0.

   The eight, each failing on (one finding each):
   - `private mode: a restore names its entry without the amount, on screen and in every live region (R109)`: `expected text "ค่าบิล กลับมาอยู่ในประวัติแล้ว" to appear: expected null not to be null`
   - `at the largest text size the title wraps and each restore pill grows with its words (m1)`: `th: ค่าบิล: expected [ 1, undefined, undefined ] to deeply equal [ undefined, undefined, undefined ]`
   - `a deleted income draws as income: violet, with its plus (m2)`: `expected text "+฿28,000" to be in DOM: expected null not to be null`
   - `each row says its wallet and its day as dateStep says it: yesterday, a weekday, and another year's with its year (m4)`: `expected text "· Cash → Daily account · เมื่อวาน" to be in DOM: expected null not to be null`
   - `the page starts 8 pt below the status bar, from the safe-area inset (m5)`: `expected '52px' to be '70px' // Object.is equality`
   - `Back, named as rh-deleted names it, returns to History, or opens it when there is nothing to go back to (n1)`: `expected button named กลับไปประวัติ to appear: expected null not to be null`
   - `each line takes WalletText's leading for its language (n4)`: `en: expected [ Array(6) ] to deeply equal [ Array(6) ]`
   - `the catalogue section bw-deleted draws the real screen on its own fakes (B1)`: `expected testID catalogue-screen-running to be in DOM: expected null not to be null`

   The other 7 pass: they guard what the first round already did right.
4. The catalogue's own `bw-deleted` cases (unchanged tests; B1): `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "section bw-deleted" > S/red-catalogue.log 2>&1; echo $?`. Expected: exit 1, `Tests  2 failed` (ignore the `skipped` count), and `grep -c '^AssertionError' S/red-catalogue.log` gives 2.
5. The pins on code that is already right: the first review's six survivors, each now killed by its own pin on `b840c195`'s code. The eight RED cases are left out by name (`RENDER_T`, a test-name pattern that `mutants.py` passes to vitest as `-t`). Type it on one line:
   ```bash
   RENDER_T='^(?!.*\((?:R109|m1|m2|m4|m5|n1|n4|B1)\)$).*$' python3 -I PL/tools/mutants.py WT S/red-pins-logs --pins R1 R2 R3 R4 R15 R17 > S/red-pins.out 2>&1; echo $?
   ```
   Expected: exit 0, and these 7 lines. Each mutant fails one case on one assertion. Compare with `PL/logs/red-pins.out`. The same six survive `b840c195` with its own tests (`PL/logs/before-pins.out`).
   ```
   R1 KILLED: no acting guard: two taps in one frame restore twice [deletedData.ts] -> Tests 1 failed | 23 passed | 8 skipped (32); first failing: "Recently deleted says how many days are left and restores one entry (restoreTransaction once with its version and key)"; AssertionError x1; restored sha256 equal
   R2 KILLED: no acting guard, and the busy row stays enabled [WalletDeletedScreen.tsx, deletedData.ts] -> Tests 1 failed | 6 passed | 8 skipped (15); first failing: "Recently deleted says how many days are left and restores one entry (restoreTransaction once with its version and key)"; AssertionError x1; restored sha256 equal
   R3 KILLED: the last day from two days left [WalletDeletedScreen.tsx] -> Tests 1 failed | 6 passed | 8 skipped (15); first failing: "the last day says so"; AssertionError x1; restored sha256 equal
   R4 KILLED: the last day not in ink [WalletDeletedScreen.tsx] -> Tests 1 failed | 6 passed | 8 skipped (15); first failing: "the last day says so"; AssertionError x1; restored sha256 equal
   R15 KILLED: the row without its wallet [WalletDeletedScreen.tsx] -> Tests 1 failed | 6 passed | 8 skipped (15); first failing: "Recently deleted says how many days are left and restores one entry (restoreTransaction once with its version and key)"; AssertionError x1; restored sha256 equal
   R17 KILLED: no footer line [WalletDeletedScreen.tsx] -> Tests 1 failed | 6 passed | 8 skipped (15); first failing: "Recently deleted says how many days are left and restores one entry (restoreTransaction once with its version and key)"; AssertionError x1; restored sha256 equal
   6 killed, 0 survived, 0 not as expected
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.red-in-wt` again: five `OK` lines. The runner puts each file back.

## Step 3: GREEN

1. Copy the code:
   ```bash
   cp PL/real/apps/app/src/screens/redesign/deleted/deletedData.ts WT/apps/app/src/screens/redesign/deleted/deletedData.ts
   cp PL/real/apps/app/src/wallet/records/WalletDeletedScreen.tsx WT/apps/app/src/wallet/records/WalletDeletedScreen.tsx
   cp PL/real/apps/app/src/wallet/records/copy.ts WT/apps/app/src/wallet/records/copy.ts
   cp PL/real/apps/app/src/dev/catalogue/wallet/recordSections.tsx WT/apps/app/src/dev/catalogue/wallet/recordSections.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/deletedSection.tsx WT/apps/app/src/dev/catalogue/wallet/deletedSection.tsx
   ```
2. `cd WT && shasum -a 256 -c PL/SHA256SUMS.real-in-wt`. Expected: six `OK` lines. Then `/usr/bin/git -C WT status --short`, which shows exactly these six lines:
   ```
    M apps/app/src/dev/catalogue/wallet/recordSections.tsx
    M apps/app/src/screens/redesign/deleted/deletedData.ts
    M apps/app/src/wallet/records/WalletDeleted.render.test.tsx
    M apps/app/src/wallet/records/WalletDeletedScreen.tsx
    M apps/app/src/wallet/records/copy.ts
   ?? apps/app/src/dev/catalogue/wallet/deletedSection.tsx
   ```
   The diffs are in Appendix A.
3. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: 0.
4. `cd WT/apps/app && npm run test:unit -- src/wallet/copy/draftText.test.ts > S/green-draftText.log 2>&1; echo $?`. Expected: 0, `ℹ tests 4`, `ℹ pass 4`, `ℹ fail 0`.
5. Step 1.6's focused command, into `S/green-focused.log`, with `--reporter=verbose`. Expected:
   - exit 0, `Tests  32 passed (32)` (`WalletDeleted.render.test.tsx` 15, `RecentlyDeletedScreen.render.test.tsx` 17, unchanged), each case marked `✓`;
   - `grep -c '^stderr |' S/green-focused.log` gives 0: no `act(...)` warning and no `console.error`.
6. Step 1.6's neighbours command, into `S/green-neighbours.log`. Expected: exit 0, `Tests  88 passed (88)`.
7. Step 1.6's catalogue command, into `S/green-catalogue.log`. Expected: exit 0, `Tests  38 passed` (ignore the `skipped` count).

## Step 4: Mutation check

1. `python3 -I PL/tools/mutants.py WT S/mutant-logs > S/mutants.out 2>&1; echo $?` (full paths).
   - It applies each mutant alone, runs its test files (`WalletDeleted.render.test.tsx`; with `RecentlyDeletedScreen.render.test.tsx` for the hook's mutants; `walletHarness` and `Tray` for B1e) and puts each file back with its SHA-256 checked.
   - It took the planner about four minutes, at a load average near 11. B1b and B1c each wait 10 s by design.
   - Expected: exit 0, and these 49 lines, one per mutant and then the tally. Compare with `PL/logs/mutants.out`.
   ```
   M1 KILLED: days left shown one too many [WalletDeletedScreen.tsx] -> Tests 3 failed | 12 passed (15); first failing: "Recently deleted says how many days are left and restores one entry (restoreTransaction once with its version and key)"; AssertionError x3; restored sha256 equal
   M2 KILLED: the last day never said [WalletDeletedScreen.tsx] -> Tests 2 failed | 13 passed (15); first failing: "the last day says so"; AssertionError x2; restored sha256 equal
   M3 KILLED: the restore label says the amount in private mode [WalletDeletedScreen.tsx] -> Tests 2 failed | 13 passed (15); first failing: "private mode hides every amount and masks the restore label"; AssertionError x2; restored sha256 equal
   M4 KILLED: the row ignores private mode [WalletDeletedScreen.tsx] -> Tests 2 failed | 13 passed (15); first failing: "private mode hides every amount and masks the restore label"; AssertionError x2; restored sha256 equal
   M5 KILLED: the restore pill 40 pt [WalletDeletedScreen.tsx] -> Tests 2 failed | 13 passed (15); first failing: "every restore button is 44 pt and names its entry"; AssertionError x2; restored sha256 equal
   M6 KILLED: the restore pill not a pill [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "every restore button is 44 pt and names its entry"; AssertionError x1; restored sha256 equal
   M7 KILLED: the other restores stay enabled while one is unconfirmed [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "an unconfirmed restore is frozen: only Try again, which resends the same command"; AssertionError x1; restored sha256 equal
   M8 KILLED: the frozen restore keeps its Restore label [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "an unconfirmed restore is frozen: only Try again, which resends the same command"; AssertionError x1; restored sha256 equal
   M9 KILLED: the frozen restore says Cancel [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "an unconfirmed restore is frozen: only Try again, which resends the same command"; AssertionError x1; restored sha256 equal
   M10 KILLED: a new key on every send [deletedData.ts] -> Tests 2 failed | 30 passed (32); first failing: "an unconfirmed restore is frozen: only Try again, which resends the same command"; AssertionError x1; restored sha256 equal
   M11 KILLED: the refusal said as any save problem [deletedData.ts] -> Tests 3 failed | 29 passed (32); first failing: "a refused restore says why in plain words and reads the list again"; AssertionError x2; restored sha256 equal
   M12 KILLED: no reload after a definite refusal [deletedData.ts] -> Tests 3 failed | 29 passed (32); first failing: "a refused restore says why in plain words and reads the list again"; AssertionError x3; restored sha256 equal
   M13 KILLED: version 1 sent [deletedData.ts] -> Tests 7 failed | 25 passed (32); first failing: "Restore sends the entry's own version under its own key, takes it off the list and says where it went"; AssertionError x3; restored sha256 equal
   M15 KILLED: the empty state without its words [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "with nothing deleted it says so and shows the empty state"; AssertionError x1; restored sha256 equal
   M16 KILLED: the empty state without Bun [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "with nothing deleted it says so and shows the empty state"; AssertionError x1; restored sha256 equal
   M17 KILLED: Bun not sleepy [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "with nothing deleted it says so and shows the empty state"; AssertionError x1; restored sha256 equal
   M18 KILLED: Back falls back to Home [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "Back, named as rh-deleted names it, returns to History, or opens it when there is nothing to go back to (n1)"; AssertionError x1; restored sha256 equal
   M19 KILLED: no policy line [WalletDeletedScreen.tsx] -> Tests 2 failed | 13 passed (15); first failing: "Recently deleted says how many days are left and restores one entry (restoreTransaction once with its version and key)"; AssertionError x2; restored sha256 equal
   P1 KILLED: the plan's mutant: a 31-day window [historyModel.ts] -> Tests 4 failed | 11 passed (15); first failing: "Recently deleted says how many days are left and restores one entry (restoreTransaction once with its version and key)"; AssertionError x4; restored sha256 equal
   MP1 KILLED: a restore loses its amount with private mode off too [WalletDeletedScreen.tsx] -> Tests 2 failed | 13 passed (15); first failing: "Recently deleted says how many days are left and restores one entry (restoreTransaction once with its version and key)"; AssertionError x1; restored sha256 equal
   MP2 KILLED: every notice in private mode is worded as a restore [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "private mode: a restore names its entry without the amount, on screen and in every live region (R109)"; AssertionError x1; restored sha256 equal
   MP3 KILLED: the notice as the hook words it, amount and all (b840c195's leak) [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "private mode: a restore names its entry without the amount, on screen and in every live region (R109)"; AssertionError x1; restored sha256 equal
   MH KILLED: the hook does not say what was restored [deletedData.ts] -> Tests 1 failed | 14 passed (15); first failing: "private mode: a restore names its entry without the amount, on screen and in every live region (R109)"; AssertionError x1; restored sha256 equal
   MT1 KILLED: the title clamped to one line [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "at the largest text size the title wraps and each restore pill grows with its words (m1)"; AssertionError x1; restored sha256 equal
   MT2 KILLED: the restore pill a fixed 44 pt [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "at the largest text size the title wraps and each restore pill grows with its words (m1)"; AssertionError x1; restored sha256 equal
   MI1 KILLED: income without its plus [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "a deleted income draws as income: violet, with its plus (m2)"; AssertionError x1; restored sha256 equal
   MI2 KILLED: income in ink [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "a deleted income draws as income: violet, with its plus (m2)"; AssertionError x1; restored sha256 equal
   R1 KILLED: no acting guard: two taps in one frame restore twice [deletedData.ts] -> Tests 1 failed | 31 passed (32); first failing: "Recently deleted says how many days are left and restores one entry (restoreTransaction once with its version and key)"; AssertionError x1; restored sha256 equal
   R2 KILLED: no acting guard, and the busy row stays enabled [WalletDeletedScreen.tsx, deletedData.ts] -> Tests 1 failed | 14 passed (15); first failing: "Recently deleted says how many days are left and restores one entry (restoreTransaction once with its version and key)"; AssertionError x1; restored sha256 equal
   R3 KILLED: the last day from two days left [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "the last day says so"; AssertionError x1; restored sha256 equal
   R4 KILLED: the last day not in ink [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "the last day says so"; AssertionError x1; restored sha256 equal
   R15 KILLED: the row without its wallet [WalletDeletedScreen.tsx] -> Tests 3 failed | 12 passed (15); first failing: "Recently deleted says how many days are left and restores one entry (restoreTransaction once with its version and key)"; AssertionError x3; restored sha256 equal
   R17 KILLED: no footer line [WalletDeletedScreen.tsx] -> Tests 2 failed | 13 passed (15); first failing: "Recently deleted says how many days are left and restores one entry (restoreTransaction once with its version and key)"; AssertionError x2; restored sha256 equal
   MD1 KILLED: the day not through dateStep [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "each row says its wallet and its day as dateStep says it: yesterday, a weekday, and another year's with its year (m4)"; AssertionError x1; restored sha256 equal
   MD2 KILLED: today from the phone's clock, not the screen's [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "each row says its wallet and its day as dateStep says it: yesterday, a weekday, and another year's with its year (m4)"; AssertionError x1; restored sha256 equal
   MS1 KILLED: a fixed 52 pt top [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "the page starts 8 pt below the status bar, from the safe-area inset (m5)"; AssertionError x1; restored sha256 equal
   MS2 KILLED: the top flush with the status bar [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "the page starts 8 pt below the status bar, from the safe-area inset (m5)"; AssertionError x1; restored sha256 equal
   MB KILLED: Back named common.back [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "Back, named as rh-deleted names it, returns to History, or opens it when there is nothing to go back to (n1)"; AssertionError x1; restored sha256 equal
   ML1 KILLED: the title in Thai leading [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "each line takes WalletText's leading for its language (n4)"; AssertionError x1; restored sha256 equal
   ML2 KILLED: the policy in Thai leading [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "each line takes WalletText's leading for its language (n4)"; AssertionError x1; restored sha256 equal
   ML3 KILLED: the heading in Thai leading [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "each line takes WalletText's leading for its language (n4)"; AssertionError x1; restored sha256 equal
   ML4 KILLED: the wallet and day line in Thai leading [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "each line takes WalletText's leading for its language (n4)"; AssertionError x1; restored sha256 equal
   ML5 KILLED: the days-left line in Thai leading [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "each line takes WalletText's leading for its language (n4)"; AssertionError x1; restored sha256 equal
   ML6 KILLED: the footer in Thai leading [WalletDeletedScreen.tsx] -> Tests 1 failed | 14 passed (15); first failing: "each line takes WalletText's leading for its language (n4)"; AssertionError x1; restored sha256 equal
   B1a KILLED: the section reads nothing while it loads (no catalogue-screen-running) [recordSections.tsx] -> Tests 1 failed | 14 passed (15); first failing: "the catalogue section bw-deleted draws the real screen on its own fakes (B1)"; AssertionError x1; restored sha256 equal
   B1b KILLED: the section draws the screen with no stage (b840c195's blocker) [deletedSection.tsx] -> Tests 1 failed | 14 passed (15); first failing: "the catalogue section bw-deleted draws the real screen on its own fakes (B1)"; AssertionError x1; restored sha256 equal
   B1c KILLED: the stage on fakes with nothing deleted [deletedSection.tsx] -> Tests 1 failed | 14 passed (15); first failing: "the catalogue section bw-deleted draws the real screen on its own fakes (B1)"; AssertionError x1; restored sha256 equal
   B1e KILLED: the section imported statically, not lazily (the first review P5) [recordSections.tsx] -> Tests no tests; load failure; restored sha256 equal
   48 killed, 0 survived, 0 not as expected
   ```
   - The first 19 are the first round's 18 (M14 is gone with its call) and the plan's own mutant (P1). The other 29 are this round's.
   - Every kill is an assertion in the case named, except B1e's: a static import that `walletHarness` and `Tray` fail to load (`SyntaxError: Unexpected token 'typeof'`), which is why the section is lazy (P16).
2. `cd WT && shasum -a 256 -c PL/SHA256SUMS.real-in-wt`, and `/usr/bin/git -C WT status --short`. Expected: unchanged from Step 3.2.

## Step 5: The fast local gate (R100)

From WT, in this order, each with its log in S:

1. `npm run typecheck:app`: exit 0.
2. `npm run typecheck:routes -w gogospend-app`: exit 0. The merge brings P2-T33's route `app/settings/lock.tsx` into this branch.
3. `npm run test:unit`: exit 0 and `ℹ fail 0`. (R100: no total is checked; record what it prints.)
4. `npm run test:app`: exit 0 and `ℹ fail 0`.
5. The focused files and the neighbours once more: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/records/WalletDeleted.render.test.tsx src/screens/redesign/RecentlyDeletedScreen.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/card/CardStack.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx`. Expected: exit 0, `Test Files  8 passed (8)`, `Tests  120 passed (120)`.
6. The catalogue's `bw-deleted` cases: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "section bw-deleted"`. Expected: exit 0, `Tests  2 passed` (ignore the `skipped` count).
7. `/usr/bin/git -C WT diff --check` before the commit, and `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD` after it: no output.

Not run here, and why (the receipt says so):
- In CI on the PR (R100): the full render suite (its per-section jobs run `bw-deleted` in both catalogue suites), `export:web`, the iOS export, `test:ops` and the database suites. This round's commit changes no route, config, app entry, package or lockfile; the merge's route is P2-T33's, which CI checked on #406.
- Not needed: the API and edge suites. Nothing outside `apps/app` and the receipts changes in the commit.
- SKIPPED: P18's checks.

## Step 6: Receipts

1. Copy both:
   ```bash
   cp PL/real/docs/implementation/receipts/P2-T25-fix.md WT/docs/implementation/receipts/P2-T25-fix.md
   cp PL/real/docs/implementation/receipts/P2-T25.md WT/docs/implementation/receipts/P2-T25.md
   ```
2. `cd WT && shasum -a 256 -c PL/SHA256SUMS.receipts-in-wt`. Expected: two `OK` lines.

They state the planner's numbers, which are this brief's Expected lines; you reached the same numbers, or you would have stopped. Do not edit them.

## Step 7: Commit

1. `/usr/bin/git -C WT add apps/app/src/screens/redesign/deleted/deletedData.ts apps/app/src/wallet/records/WalletDeletedScreen.tsx apps/app/src/wallet/records/copy.ts apps/app/src/wallet/records/WalletDeleted.render.test.tsx apps/app/src/dev/catalogue/wallet/recordSections.tsx apps/app/src/dev/catalogue/wallet/deletedSection.tsx docs/implementation/receipts/P2-T25.md docs/implementation/receipts/P2-T25-fix.md`
2. `/usr/bin/git -C WT status --short` shows exactly these eight staged lines, and nothing else:
   ```
   A  apps/app/src/dev/catalogue/wallet/deletedSection.tsx
   M  apps/app/src/dev/catalogue/wallet/recordSections.tsx
   M  apps/app/src/screens/redesign/deleted/deletedData.ts
   M  apps/app/src/wallet/records/WalletDeleted.render.test.tsx
   M  apps/app/src/wallet/records/WalletDeletedScreen.tsx
   M  apps/app/src/wallet/records/copy.ts
   A  docs/implementation/receipts/P2-T25-fix.md
   M  docs/implementation/receipts/P2-T25.md
   ```
3. Write the message to `S/commit-message.txt`. The trailer names the model you run as: `Claude Haiku 5.5 <noreply@anthropic.com>` below; if you are another model, put its name and address there instead (for example `Gemini 3.8 Flash <noreply@google.com>`).
   ```
   Keep the amount out of a private-mode restore and draw bw-deleted on fakes

   A restore in private mode put its amount on screen and in the live
   region a screen reader speaks. The hook now says which entry came back,
   and the wallet screen names it without the amount while private mode
   is on; the old screen keeps its words. The restore event was added, not
   carried, since 1D-T7 has not merged, so the call is gone. The catalogue
   section drew the screen with no fakes, and both catalogue suites failed
   on it; it now stages the real screen on fakes, loaded lazily. From the
   reviews too: the title wraps and the Restore pill grows at the largest
   sizes, income draws as income, each row's day comes from dateStep, the
   top follows the safe-area inset, Back has the board's name, each line
   has its language's leading, and the first review's survivors are
   pinned.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-message.txt`, then `/usr/bin/git -C WT log --oneline -3` (the fix commit, the merge commit, `b840c195`) and `/usr/bin/git -C WT show --stat HEAD`: 8 files. `/usr/bin/git -C WT status --short` prints nothing. Do not push.

## Your final message

As the protocol says:
- `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker) on the first line;
- the merge commit and the fix commit SHAs, and the files changed;
- RED: 8 of 15 failing on assertions, the catalogue's two `bw-deleted` cases, and the six survivors killed by their pins;
- GREEN: the counts;
- mutants: 48, all killed (47 on assertions, B1e on a load failure);
- each gate command with its result, and no whole-suite totals;
- SKIPPED and CI items.

Name what the reviewer should look at first:
- the merge commit's `index.ts` (P1, Appendix B);
- `noticeWords` and `RestoreNotice.restored` (M1, P3);
- `deletedSection.tsx` and the `Suspense` fallback (B1, P2);
- the two-taps-in-one-frame pin in the first case (P8).

---

## Appendix A: the diffs

Each block is the kit's diff, byte for byte. Copy from `PL/real/`, not from here.

`apps/app/src/screens/redesign/deleted/deletedData.ts`:

```diff
diff --git a/apps/app/src/screens/redesign/deleted/deletedData.ts b/apps/app/src/screens/redesign/deleted/deletedData.ts
index 3c0ad3f..6c28ba5 100644
--- a/apps/app/src/screens/redesign/deleted/deletedData.ts
+++ b/apps/app/src/screens/redesign/deleted/deletedData.ts
@@ -3,7 +3,6 @@ import type { CategoryDto, DeletedHistoryPage, DeletedTransactionDto, WalletSnap
 import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

 import { V1Error } from '@mobile/api/client';
-import { trackRecordRestored } from '@mobile/analytics/events';
 import { useCopy } from '@mobile/i18n/useCopy';
 import { playHaptic } from '@mobile/lib/hapticMoment';
 import { saveProblem, useCommandKeys, useMoneyLocale } from '@mobile/screens/v1/parts';
@@ -21,7 +20,16 @@ export const RESTORE_PAGE_LIMIT = 50;
 export type DeletedLists = { page: DeletedHistoryPage; items: DeletedTransactionDto[] };
 export type DeletedReferences = { wallets: readonly Pick<WalletSnapshot, 'id' | 'name'>[]; categories: readonly CategoryDto[] };
 export type RestoreTarget = { id: string; version: number };
-export type RestoreNotice = { tone: 'alert' | 'status'; message: string; about?: string };
+export type RestoreNotice = {
+  tone: 'alert' | 'status';
+  message: string;
+  about?: string;
+  /**
+   * After a confirmed restore: the entry that came back. `message` says it with its amount (History's words, which
+   * the old screen shows); the wallet screen words it without the amount while private mode is on (R109).
+   */
+  restored?: DeletedRow;
+};

 /** Each entry's restore keeps its own command key. */
 export const restoreSlot = (id: string) => `restore:${id}`;
@@ -123,12 +131,11 @@ export function useRecentlyDeleted(now?: Date): RecentlyDeletedState {
     setRestoring(row.recordId);
     try {
       await resources.restoreTransaction(row.recordId, row.version, key);
-      trackRecordRestored({ kind: row.type });
       keys.settle(slot);
       setPending(null);
       // Off this list at once; the list is read again in place below.
       setLists((current) => (current ? { ...current, items: current.items.filter((item) => item.id !== row.recordId) } : current));
-      setNotice({ tone: 'status', message: restoredText(row, locale, tc) });
+      setNotice({ tone: 'status', message: restoredText(row, locale, tc), restored: row });
       playHaptic('saveLanded');
     } catch (problem) {
       playHaptic('saveFailed');
```

`apps/app/src/wallet/records/WalletDeletedScreen.tsx`:

```diff
diff --git a/apps/app/src/wallet/records/WalletDeletedScreen.tsx b/apps/app/src/wallet/records/WalletDeletedScreen.tsx
index 51b9bff..276b47b 100644
--- a/apps/app/src/wallet/records/WalletDeletedScreen.tsx
+++ b/apps/app/src/wallet/records/WalletDeletedScreen.tsx
@@ -1,27 +1,33 @@
 // The Bun Wallet's Recently deleted screen (plan P2-T25, rh-deleted):
 // entries deleted in the last 30 days, most recently deleted first, with
 // their retention policy first. Each row has the category icon, title,
-// amount, wallet and date, days left to restore (or last day), and a 44 pt
-// Restore button.
+// amount, wallet and day, days left to restore (or last day), and a Restore
+// pill at least 44 pt tall that grows with its words. The rules are the old
+// screen's, through useRecentlyDeleted; in private mode a restore's notice
+// names the entry without its amount (R109).
 import type { CategoryDto } from '@gogospend/contracts';
 import { Pressable, ScrollView, View } from 'react-native';
+import { useSafeAreaInsets } from 'react-native-safe-area-context';
 import Svg, { Circle, Path } from 'react-native-svg';

 import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
 import { Bun } from '@mobile/mascot/Bun';
 import { LoadingBlock, Notice, useGoBack } from '@mobile/screens/redesign/HistoryParts';
 import { useRecentlyDeleted } from '@mobile/screens/redesign/deleted/deletedData';
+import type { RestoreNotice } from '@mobile/screens/redesign/deleted/deletedData';
 import type { DeletedRow } from '@mobile/spend/v1/redesign/historyModel';
-import type { Lookups } from '@mobile/spend/v1/redesign/shared';
+import { todayInBangkok } from '@mobile/spend/v1/viewModels';
 import { useWalletColors } from '@mobile/theme/ThemeProvider';
 import { walletLineHeight } from '@mobile/theme/walletType';
 import { DECORATIVE } from '@mobile/ui/a11y';
 import { categoryInitial } from '@mobile/ui/categoryIcons';
+import { dayLabel } from '@mobile/ui/dateStep';
 import { EmptyState } from '@mobile/ui/EmptyState';
 import { PillButton } from '@mobile/ui/PillButton';
 import { SyncBanner } from '@mobile/ui/SyncBanner';
 import { COMMON_COPY } from '../common/copy';
 import { IconButton } from '../controls/IconButton';
+import type { WalletT } from '../copy/draftText';
 import { useDraftCopy } from '../copy/useDraftCopy';
 import { WalletCategoryIcon } from '../looks/WalletCategoryIcon';
 import { WalletAmount } from '../money/WalletAmount';
@@ -32,20 +38,20 @@ import { COPY } from './copy';

 export type WalletDeletedScreenProps = { now?: Date };

-const SHORT_MONTHS: Readonly<Record<string, readonly string[]>> = {
-  th: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
-  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
-  vi: ['thg 1', 'thg 2', 'thg 3', 'thg 4', 'thg 5', 'thg 6', 'thg 7', 'thg 8', 'thg 9', 'thg 10', 'thg 11', 'thg 12'],
-};
+/** The screen's lines and the shared ones, merged once, so `t` keeps one identity across renders. */
+const DELETED_COPY = { ...COMMON_COPY, ...COPY };

-export function formatDeletedDate(date: string, locale: string): string {
-  const parts = date.split('-');
-  if (parts.length !== 3) return date;
-  const day = parseInt(parts[2], 10);
-  const monthIndex = parseInt(parts[1], 10) - 1;
-  const months = SHORT_MONTHS[locale] ?? SHORT_MONTHS.th;
-  const month = months[monthIndex] ?? '';
-  return `${day} ${month}`;
+/** WalletText's leading for a size no type role has (the board's 16 and 14 pt lines), in this language. */
+const leadingFor = (size: number, locale: string) => walletLineHeight(size, locale === 'th' ? 'thai' : 'latin');
+
+/**
+ * The notice's words: the hook's, except a confirmed restore while private
+ * mode is on, which names the entry alone. A Notice says aloud what it
+ * shows, so this keeps the amount off the screen and out of the screen
+ * reader (R109, Review Focus 2).
+ */
+function noticeWords(notice: RestoreNotice, hidden: boolean, t: WalletT): string {
+  return hidden && notice.restored !== undefined ? t('records.restoredHidden', { title: notice.restored.title }) : notice.message;
 }

 function ClockIcon({ size = 12, color }: { size?: number; color: string }) {
@@ -82,6 +88,7 @@ function BackChevron({ size = 16, color }: { size?: number; color: string }) {
 function DeletedRowView({
   row,
   category,
+  today,
   restoring,
   frozen,
   disabled,
@@ -90,6 +97,8 @@ function DeletedRowView({
 }: {
   row: DeletedRow;
   category: CategoryDto | undefined;
+  /** Bangkok's date on the screen's clock: the row's day is said from it (src/ui/dateStep.ts). */
+  today: string;
   restoring: boolean;
   frozen: boolean;
   disabled: boolean;
@@ -97,7 +106,7 @@ function DeletedRowView({
   isFirst: boolean;
 }) {
   const colors = useWalletColors();
-  const t = useDraftCopy({ ...COMMON_COPY, ...COPY });
+  const t = useDraftCopy(DELETED_COPY);
   const tc = useCopy();
   const locale = useActiveLocale();
   const { hidden } = usePrivateMode();
@@ -141,25 +150,18 @@ function DeletedRowView({
       )}

       <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
-        <WalletText style={{ fontSize: 16, fontWeight: '500', lineHeight: walletLineHeight(16, 'thai'), color: colors.ink }} numberOfLines={1}>
-          {row.title}
-        </WalletText>
+        {/* Never clamped: at the largest text sizes the title wraps. */}
+        <WalletText style={{ fontSize: 16, fontWeight: '500', lineHeight: leadingFor(16, locale) }}>{row.title}</WalletText>
         <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
-          <WalletAmount minor={row.amountMinor} size={13} tone="ink" />
-          <WalletText style={{ fontSize: 13, lineHeight: walletLineHeight(13, 'thai'), color: colors.quiet }}>
-            {` · ${row.detail} · ${formatDeletedDate(row.occurredOn, locale)}`}
+          {/* Income is violet with its plus; an expense or a move is the size alone, in ink. */}
+          <WalletAmount minor={row.amountMinor} size={13} sign={row.type === 'income' ? 'income' : 'none'} />
+          <WalletText role="caption" tone="quiet">
+            {` · ${row.detail} · ${dayLabel(row.occurredOn, today, locale).text}`}
           </WalletText>
         </View>
         <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
           <ClockIcon size={12} color={daysColor} />
-          <WalletText
-            style={{
-              fontSize: 13,
-              lineHeight: walletLineHeight(13, 'thai'),
-              fontWeight: isLastDay ? '700' : '400',
-              color: daysColor,
-            }}
-          >
+          <WalletText role="caption" style={{ fontWeight: isLastDay ? '700' : '400', color: daysColor }}>
             {isLastDay ? t('records.lastDay') : t('records.daysLeft', { n: row.daysLeft })}
           </WalletText>
         </View>
@@ -173,8 +175,8 @@ function DeletedRowView({
         disabled={disabled || restoring}
         onPress={onRestore}
         style={{
+          // At least 44 pt, and taller when its words grow.
           minHeight: 44,
-          height: 44,
           paddingLeft: 12,
           paddingRight: 14,
           borderRadius: 999,
@@ -206,9 +208,13 @@ function DeletedRowView({

 export function WalletDeletedScreen({ now }: WalletDeletedScreenProps) {
   const colors = useWalletColors();
-  const t = useDraftCopy({ ...COMMON_COPY, ...COPY });
+  const t = useDraftCopy(DELETED_COPY);
   const tc = useCopy();
+  const locale = useActiveLocale();
   const goBack = useGoBack();
+  const insets = useSafeAreaInsets();
+  const { hidden: amountsHidden } = usePrivateMode();
+  const today = todayInBangkok(now ?? new Date());

   const {
     lists,
@@ -233,43 +239,29 @@ export function WalletDeletedScreen({ now }: WalletDeletedScreenProps) {
         style={{ flex: 1 }}
         contentContainerStyle={{
           paddingHorizontal: 18,
-          paddingTop: 52,
+          // The spend layout pads nothing: start below the status bar, 8 pt clear of it, as rh-deleted's 52 pt does.
+          paddingTop: insets.top + 8,
           paddingBottom: 40,
           gap: 16,
         }}
       >
         <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
-          <IconButton label={t('common.back')} onPress={goBack}>
+          <IconButton label={t('records.backToHistory')} onPress={goBack}>
             <BackChevron size={16} color={colors.ink} />
           </IconButton>
         </View>

         <View style={{ gap: 4 }}>
-          <WalletText
-            role="h1"
-            accessibilityRole="header"
-            style={{
-              fontSize: 28,
-              fontWeight: '700',
-              lineHeight: walletLineHeight(28, 'thai'),
-              color: colors.ink,
-            }}
-          >
+          <WalletText role="h1" accessibilityRole="header">
             {t('records.deletedTitle')}
           </WalletText>
-          <WalletText
-            style={{
-              fontSize: 14,
-              lineHeight: walletLineHeight(14, 'thai'),
-              color: colors.quiet,
-            }}
-          >
+          <WalletText tone="quiet" style={{ fontSize: 14, lineHeight: leadingFor(14, locale) }}>
             {t('records.deletedPolicy')}
           </WalletText>
         </View>

         {banner ? <SyncBanner {...banner} /> : null}
-        {shownNotice ? <Notice tone={shownNotice.tone} message={shownNotice.message} /> : null}
+        {shownNotice ? <Notice tone={shownNotice.tone} message={noticeWords(shownNotice, amountsHidden, t)} /> : null}
         {lists?.page.refresh_suggested && !error ? (
           <Notice
             message={tc('Entries changed since you opened this list.')}
@@ -294,12 +286,13 @@ export function WalletDeletedScreen({ now }: WalletDeletedScreenProps) {
             />
           ) : (
             <View style={{ gap: 12 }}>
-              <View style={{ backgroundColor: colors.card, borderRadius: 20, overflow: 'hidden' }}>
+              <View testID="wallet-deleted-list" style={{ backgroundColor: colors.card, borderRadius: 20, overflow: 'hidden' }}>
                 {model.rows.map((row, index) => (
                   <DeletedRowView
                     key={row.recordId}
                     row={row}
                     category={row.categoryId ? lookups.categories.get(row.categoryId) : undefined}
+                    today={today}
                     restoring={restoring === row.recordId}
                     frozen={held?.id === row.recordId}
                     disabled={(busy && restoring !== row.recordId) || (held !== null && held.id !== row.recordId)}
@@ -308,14 +301,7 @@ export function WalletDeletedScreen({ now }: WalletDeletedScreenProps) {
                   />
                 ))}
               </View>
-              <WalletText
-                style={{
-                  marginHorizontal: 4,
-                  fontSize: 13,
-                  lineHeight: walletLineHeight(13, 'thai'),
-                  color: colors.quiet,
-                }}
-              >
+              <WalletText role="caption" tone="quiet" style={{ marginHorizontal: 4 }}>
                 {t('records.deletedFooter')}
               </WalletText>
             </View>
```

`apps/app/src/wallet/records/copy.ts`:

```diff
diff --git a/apps/app/src/wallet/records/copy.ts b/apps/app/src/wallet/records/copy.ts
index 08d780b..2a6cdef 100644
--- a/apps/app/src/wallet/records/copy.ts
+++ b/apps/app/src/wallet/records/copy.ts
@@ -29,4 +29,14 @@ export const COPY = {
     th: 'เรียงจากที่ลบล่าสุด · ยอดในงบและกระเป๋าไม่นับรายการที่ลบ',
     en: 'Ordered by most recently deleted · Totals in budget and wallets do not count deleted entries.',
   },
+  // rh-deleted's back button. The Thai is the board's; the English is a draft for E2-B.
+  'records.backToHistory': {
+    th: 'กลับไปประวัติ',
+    en: 'Back to History',
+  },
+  // A restore in private mode: History's line without its amount (R109). No board shows it: Thai and English are drafts for E2-B.
+  'records.restoredHidden': {
+    th: '{title} กลับมาอยู่ในประวัติแล้ว',
+    en: '{title} is back in History.',
+  },
 } as const satisfies DraftTable;
```

`apps/app/src/dev/catalogue/wallet/recordSections.tsx`:

```diff
diff --git a/apps/app/src/dev/catalogue/wallet/recordSections.tsx b/apps/app/src/dev/catalogue/wallet/recordSections.tsx
index 8881475..1a833e5 100644
--- a/apps/app/src/dev/catalogue/wallet/recordSections.tsx
+++ b/apps/app/src/dev/catalogue/wallet/recordSections.tsx
@@ -1,12 +1,18 @@
 // The Bun Wallet's records catalogue sections (plan P2-T25, development only),
 // drawn on fakes. A section never imports the wallet test harness, which loads vitest.
+//
+// bw-deleted is the real WalletDeletedScreen on its own fakes (deletedSection.tsx).
+// It loads lazily: the screen and its stage import expo-router, which the
+// kit's own suites (walletHarness, Tray and the others that list
+// WALLET_SECTIONS) cannot load. While it loads, the section reads
+// `catalogue-screen-running`, as a screen section's stage does while its
+// script runs, so the catalogue's suites wait for it.
 import { lazy, Suspense } from 'react';
+import { View } from 'react-native';

 import type { CatalogueSection } from '../registry';

-const LazyDeleted = lazy(() =>
-  import('@mobile/wallet/records/WalletDeletedScreen').then((m) => ({ default: m.WalletDeletedScreen }))
-);
+const DeletedSection = lazy(() => import('./deletedSection'));

 export const WALLET_RECORD_SECTIONS: readonly CatalogueSection[] = [
   {
@@ -15,8 +21,8 @@ export const WALLET_RECORD_SECTIONS: readonly CatalogueSection[] = [
     group: 'Screens',
     layout: 'screen',
     render: () => (
-      <Suspense fallback={null}>
-        <LazyDeleted />
+      <Suspense fallback={<View testID="catalogue-screen-running" style={{ flex: 1 }} />}>
+        <DeletedSection />
       </Suspense>
     ),
   },
```

`apps/app/src/dev/catalogue/wallet/deletedSection.tsx` (new):

```diff
diff --git b/apps/app/src/dev/catalogue/wallet/deletedSection.tsx b/apps/app/src/dev/catalogue/wallet/deletedSection.tsx
new file mode 100644
index 0000000..d9ca780
--- /dev/null
+++ b/apps/app/src/dev/catalogue/wallet/deletedSection.tsx
@@ -0,0 +1,43 @@
+// bw-deleted's stage (plan P2-T25, development only), which recordSections.tsx
+// loads lazily: the real WalletDeletedScreen on fakes, staged by screenSection
+// as recentlyDeletedSections.tsx stages the old screen (R72: wallet sections
+// use fakes only). The fixtures' today is 29 September 2026: rent was deleted
+// yesterday, the September salary four days ago, lunch nine days ago, and a
+// taxi on 30 August at 22:00 Bangkok time, so its last day ends tonight. The
+// script waits until the list is drawn.
+import type { TransactionDto } from '@gogospend/contracts';
+
+import { WalletDeletedScreen } from '@mobile/wallet/records/WalletDeletedScreen';
+import { CATALOGUE_NOW, GOLDEN, expense, goldenFake } from '../screenFixtures';
+import { screenSection } from '../screenSection';
+import type { ScreenFixture } from '../screenSection';
+
+const DELETED_AT: Readonly<Record<string, string>> = {
+  [GOLDEN.rentId]: '2026-09-28T03:00:00.000Z',
+  [GOLDEN.salaryId]: '2026-09-25T03:00:00.000Z',
+  [GOLDEN.lunchId]: '2026-09-20T03:00:00.000Z',
+};
+
+/** The golden diary with four entries deleted, one of them on its last day. */
+function deletedGolden(): ScreenFixture {
+  const taxi = expense(1, '2026-08-30', '12000', { category_id: GOLDEN.categories.travel.id, deleted_at: '2026-08-30T15:00:00.000Z', version: 2 });
+  const fake = goldenFake([taxi]);
+  for (const [id, deletedAt] of Object.entries(DELETED_AT)) {
+    const record = fake.records.get(id) as TransactionDto;
+    fake.records.set(id, { ...record, deleted_at: deletedAt, version: 2 } as TransactionDto);
+  }
+  return { resources: fake.resources, diary: null };
+}
+
+// The registry lists the section (its id and title) in recordSections.tsx; only this stage's render is drawn here.
+const STAGE = screenSection({
+  id: 'bw-deleted',
+  title: 'Bun Wallet: recently deleted',
+  fixture: deletedGolden,
+  script: () => [{ waitFor: 'wallet-deleted-list' }],
+  render: () => <WalletDeletedScreen now={CATALOGUE_NOW} />,
+});
+
+export default function DeletedSection() {
+  return <>{STAGE.render()}</>;
+}
```

`apps/app/src/wallet/records/WalletDeleted.render.test.tsx`:

```diff
diff --git a/apps/app/src/wallet/records/WalletDeleted.render.test.tsx b/apps/app/src/wallet/records/WalletDeleted.render.test.tsx
index 3447e73..a3cc5f5 100644
--- a/apps/app/src/wallet/records/WalletDeleted.render.test.tsx
+++ b/apps/app/src/wallet/records/WalletDeleted.render.test.tsx
@@ -1,24 +1,46 @@
+// Recently deleted in the Bun Wallet (plan P2-T25, rh-deleted) and its fix
+// round (ruling R109): days left and the last day; one restore, once, with
+// its version and key; private mode before and after a restore; Restore
+// pills of at least 44 pt that grow with their words; income in violet; each
+// row's wallet and day; the top below the status bar; the board's back
+// label; the leading of each language; and the catalogue section on its own
+// fakes. Every case runs in Thai and English; Step 1's cases also in light
+// and dark. Lookups assert, so a missing element fails on an AssertionError.
 import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
 import { afterEach, beforeEach, expect, test, vi } from 'vitest';

 const nav = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: vi.fn(() => true) } }));
 vi.mock('expo-router', () => ({ useRouter: () => nav.router }));
+// The catalogue section's stage (screenSection) reads expo-router's route params context.
+vi.mock('expo-router/build/Route', () => import('../../dev/catalogue/routerTestStub'));
 vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
 vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
 vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
-vi.mock('@mobile/analytics/events', () => ({ trackRecordRestored: vi.fn() }));
+
+// react-native-web drops numberOfLines and the other clamps from the DOM, so
+// the props that reach the app's Text are recorded and the real one renders,
+// as WalletCard.render.test.tsx does.
+const seen = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
+vi.mock('@mobile/theme/AppText', async (importOriginal) => {
+  const actual = await importOriginal<typeof import('@mobile/theme/AppText')>();
+  const { createElement, forwardRef } = await import('react');
+  const Text = forwardRef<unknown, Record<string, unknown>>(function RecordedText(props, ref) {
+    seen.props.push(props);
+    return createElement(actual.Text as never, { ...props, ref });
+  });
+  return { ...actual, Text };
+});

 import type { TransactionDto } from '@gogospend/contracts';
-import { trackRecordRestored } from '@mobile/analytics/events';
+import { rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
 import { WALLET_SECTIONS } from '@mobile/dev/catalogue/wallet';
-import { FOOD_ID, NOW, RENT, SALARY_ID } from '@mobile/screens/redesign/HistoryTestHarness';
+import { FOOD_ID, MOVE, NOW, RENT, SALARY_ID } from '@mobile/screens/redesign/HistoryTestHarness';
 import { createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
+import { walletDark, walletLight } from '@mobile/theme/walletPalette';
 import { HIDDEN_AMOUNT } from '../money/walletMoney';
-import { mountWallet } from '../testing/walletHarness';
+import { AX5, mountWallet } from '../testing/walletHarness';
 import { WalletDeletedScreen } from './WalletDeletedScreen';

-const LAST_DAY_ID = '0000000b-0000-4000-8000-000000000005';
-
 beforeEach(() => {
   for (const fn of [nav.router.push, nav.router.replace, nav.router.back]) fn.mockReset();
   nav.router.canGoBack.mockReturnValue(true);
@@ -27,8 +49,65 @@ beforeEach(() => {
 afterEach(() => {
   cleanup();
   vi.restoreAllMocks();
+  seen.props.length = 0;
 });

+const LOCALES = ['th', 'en'] as const;
+const MODES = ['light', 'dark'] as const;
+const PALETTE = { light: walletLight, dark: walletDark } as const;
+const PRIVATE = { 'private-mode': '1' } as const;
+
+/** The words each case looks for: the draft tables', the catalogs' and dateStep's. */
+const WORDS = {
+  th: {
+    heading: 'รายการที่เพิ่งลบ',
+    policy: 'รายการที่ลบแล้วกู้คืนได้ภายใน 30 วัน หลังจากนั้นจะถูกลบถาวร กู้คืนแล้วรายการจะกลับไปอยู่ในวันเดิมของมัน',
+    footer: 'เรียงจากที่ลบล่าสุด · ยอดในงบและกระเป๋าไม่นับรายการที่ลบ',
+    daysLeft: (n: number) => `เหลือ ${n} วัน`,
+    lastDay: 'วันสุดท้ายที่กู้คืนได้',
+    bills: 'ค่าบิล',
+    food: 'อาหาร',
+    salary: 'เงินเดือน',
+    restore: (title: string, amount: string) => `กู้คืน ${title} ${amount}`,
+    restorePattern: /^กู้คืน /,
+    baht: (amount: string) => `${amount} บาท`,
+    hidden: 'ซ่อนยอดเงินอยู่',
+    restored: 'ค่าบิล ฿12,268.00 กลับมาอยู่ในประวัติแล้ว',
+    restoredHidden: 'ค่าบิล กลับมาอยู่ในประวัติแล้ว',
+    conflict: 'รายการนี้ถูกแก้ไขจากอุปกรณ์อื่น',
+    back: 'กลับไปประวัติ',
+    /** dateStep's day labels on 29 September 2026: yesterday, a weekday, and last year's with its Buddhist-era year. */
+    dayLines: ['· Cash → Daily account · เมื่อวาน', '· Daily account · อาทิตย์ 27 ก.ย.', '· Cash · พุธ 24 ธ.ค. 2568'],
+    sectionRows: ['กู้คืน ค่าบิล 12,268 บาท', 'กู้คืน เงินเดือน 28,000 บาท', 'กู้คืน อาหาร 182 บาท', 'กู้คืน การเดินทาง 120 บาท'],
+  },
+  en: {
+    heading: 'Recently deleted',
+    policy: 'Deleted entries can be restored for 30 days. After that, they are gone for good. Restored entries return to their original day.',
+    footer: 'Ordered by most recently deleted · Totals in budget and wallets do not count deleted entries.',
+    daysLeft: (n: number) => `${n} days left`,
+    lastDay: 'Last day to restore',
+    bills: 'Bills',
+    food: 'Food',
+    salary: 'Salary',
+    restore: (title: string, amount: string) => `Restore ${title} ${amount}`,
+    restorePattern: /^Restore /,
+    baht: (amount: string) => `${amount} baht`,
+    hidden: 'Amount hidden',
+    restored: 'Bills ฿12,268.00 is back in History.',
+    restoredHidden: 'Bills is back in History.',
+    conflict: 'This entry changed on another device.',
+    back: 'Back to History',
+    dayLines: ['· Cash → Daily account · Yesterday', '· Daily account · Sun 27 Sep', '· Cash · Wed 24 Dec 2025'],
+    sectionRows: ['Restore Bills 12,268 baht', 'Restore Salary 28,000 baht', 'Restore Food 182 baht', 'Restore Travel 120 baht'],
+  },
+} as const;
+
+/** WalletText's leading (walletLineHeight): 1.5 in Thai and 1.3 in every other language, rounded up. */
+const LEADING = {
+  th: { h1: '42px', policy: '21px', title: '24px', caption: '20px' },
+  en: { h1: '37px', policy: '19px', title: '21px', caption: '17px' },
+} as const;
+
 /** The element with this role and name, which must be in the DOM. Fails on AssertionError, never TestingLibraryElementError. */
 function named(role: string, name: string | RegExp, inside: HTMLElement = document.body): HTMLElement {
   const element = within(inside).queryByRole(role, { name });
@@ -44,7 +123,7 @@ function found(testID: string): HTMLElement {
 }

 /** The element showing these words, which must be in the DOM. Fails on AssertionError, never TestingLibraryElementError. */
-function shown(words: string, inside: HTMLElement = document.body): HTMLElement {
+function shown(words: string | RegExp, inside: HTMLElement = document.body): HTMLElement {
   const element = within(inside).queryByText(words);
   expect(element, `expected text "${words}" to be in DOM`).not.toBeNull();
   return element as HTMLElement;
@@ -54,9 +133,9 @@ function shown(words: string, inside: HTMLElement = document.body): HTMLElement
 async function findNamed(role: string, name: string | RegExp, inside: HTMLElement = document.body): Promise<HTMLElement> {
   let matched: HTMLElement | null = null;
   await waitFor(() => {
-    const el = within(inside).queryByRole(role, { name });
-    expect(el, `expected ${role} named ${name} to appear`).not.toBeNull();
-    matched = el as HTMLElement;
+    const element = within(inside).queryByRole(role, { name });
+    expect(element, `expected ${role} named ${name} to appear`).not.toBeNull();
+    matched = element as HTMLElement;
   });
   return matched!;
 }
@@ -65,47 +144,66 @@ async function findNamed(role: string, name: string | RegExp, inside: HTMLElemen
 async function findShown(words: string, inside: HTMLElement = document.body): Promise<HTMLElement> {
   let matched: HTMLElement | null = null;
   await waitFor(() => {
-    const el = within(inside).queryByText(words);
-    expect(el, `expected text "${words}" to appear`).not.toBeNull();
-    matched = el as HTMLElement;
+    const element = within(inside).queryByText(words);
+    expect(element, `expected text "${words}" to appear`).not.toBeNull();
+    matched = element as HTMLElement;
   });
   return matched!;
 }

-function deletedSeed(extra: TransactionDto[] = []): TransactionDto[] {
-  const seed = goldenSeed();
-  const when: Record<string, string> = {
+/** Wait for an element with this test id (a lazy import under load can take seconds). Fails on AssertionError, never TestingLibraryElementError. */
+async function findFound(testID: string, timeout = 10_000): Promise<HTMLElement> {
+  let matched: HTMLElement | null = null;
+  await waitFor(() => {
+    const element = screen.queryByTestId(testID);
+    expect(element, `expected testID ${testID} to appear`).not.toBeNull();
+    matched = element as HTMLElement;
+  }, { timeout });
+  return matched!;
+}
+
+/** Every live region inside `container`: what a screen reader reads out as it changes. */
+function liveRegions(container: HTMLElement): HTMLElement[] {
+  return [...container.querySelectorAll<HTMLElement>('[aria-live], [role="status"], [role="alert"]')];
+}
+
+/**
+ * The golden diary with rent deleted yesterday (29 days left) and food nine
+ * days ago (21 days left). The salary was deleted on 1 August, past its 30
+ * days, so it is not listed, unless `when` says otherwise.
+ */
+function deletedSeed(extra: TransactionDto[] = [], when: Readonly<Record<string, string>> = {}): TransactionDto[] {
+  const deletedAt: Record<string, string> = {
     [RENT]: '2026-09-28T03:00:00.000Z',
     [FOOD_ID]: '2026-09-20T03:00:00.000Z',
     [SALARY_ID]: '2026-08-01T03:00:00.000Z',
+    ...when,
   };
   return [
-    ...seed.records.map((record) => (when[record.id] ? { ...record, deleted_at: when[record.id], version: 2 } : record)),
+    ...goldenSeed().records.map((record) => (deletedAt[record.id] ? { ...record, deleted_at: deletedAt[record.id], version: 2 } : record)),
     ...extra,
   ];
 }

-function seedWithLastDay(): TransactionDto[] {
-  const lastDayRecord: TransactionDto = {
-    id: LAST_DAY_ID,
-    wallet_id: '00000000-0000-4000-8000-000000000002',
-    type: 'expense',
-    amount_minor: '39900',
-    occurred_on: '2026-08-30',
-    category_id: '0000000c-0000-4000-8000-000000000003',
-    merchant: null,
-    note: 'Phone bill',
-    version: 2,
-    deleted_at: '2026-08-30T15:00:00.000Z',
-  };
-  return deletedSeed([lastDayRecord]);
-}
-
-async function mount(options: {
+/** A phone bill deleted at 22:00 Bangkok on 30 August: its 30 days end at 22:00 tonight. */
+const LAST_DAY: TransactionDto = {
+  id: '0000000b-0000-4000-8000-000000000005', wallet_id: '00000000-0000-4000-8000-000000000002', type: 'expense', amount_minor: '39900',
+  occurred_on: '2026-08-30', category_id: '0000000c-0000-4000-8000-000000000003', merchant: null, note: 'Phone bill', version: 2, deleted_at: '2026-08-30T15:00:00.000Z',
+};
+/** Deleted a day later: 36 hours left, so two days, and not yet the last. */
+const TWO_DAYS: TransactionDto = { ...LAST_DAY, id: '0000000b-0000-4000-8000-000000000006', occurred_on: '2026-08-31', deleted_at: '2026-08-31T15:00:00.000Z' };
+/** A lunch from last December, deleted two days ago. */
+const LAST_YEAR: TransactionDto = {
+  id: '0000000b-0000-4000-8000-000000000007', wallet_id: '0000000a-0000-4000-8000-000000000001', type: 'expense', amount_minor: '50000',
+  occurred_on: '2025-12-24', category_id: '0000000c-0000-4000-8000-000000000001', merchant: null, note: null, version: 3, deleted_at: '2026-09-27T03:00:00.000Z',
+};
+
+function mount(options: {
   records?: TransactionDto[];
   locale?: 'th' | 'en';
   mode?: 'light' | 'dark';
   device?: Readonly<Record<string, string>>;
+  fontScale?: number;
 } = {}) {
   const fake = createFakeResources({ wallets: goldenSeed().wallets, records: options.records ?? deletedSeed() });
   const mounted = mountWallet(<WalletDeletedScreen now={NOW} />, {
@@ -113,112 +211,179 @@ async function mount(options: {
     locale: options.locale ?? 'th',
     mode: options.mode ?? 'light',
     device: options.device,
+    fontScale: options.fontScale,
   });
   return { fake, mounted };
 }

 test('Recently deleted says how many days are left and restores one entry (restoreTransaction once with its version and key)', async () => {
-  for (const locale of ['th', 'en'] as const) {
-    const { fake } = await mount({ locale });
-    const isThai = locale === 'th';
-
-    const heading = isThai ? 'รายการที่เพิ่งลบ' : 'Recently deleted';
-    await findNamed('heading', heading);
-
-    const policy = isThai
-      ? 'รายการที่ลบแล้วกู้คืนได้ภายใน 30 วัน หลังจากนั้นจะถูกลบถาวร กู้คืนแล้วรายการจะกลับไปอยู่ในวันเดิมของมัน'
-      : 'Deleted entries can be restored for 30 days. After that, they are gone for good. Restored entries return to their original day.';
-    shown(policy);
-
-    const days29 = isThai ? 'เหลือ 29 วัน' : '29 days left';
-    const days21 = isThai ? 'เหลือ 21 วัน' : '21 days left';
-    shown(days29);
-    shown(days21);
-
-    // Expired record is not listed
-    expect(screen.queryByText('Salary')).toBeNull();
-
-    // Restore Rent
-    const titleBills = isThai ? 'ค่าบิล' : 'Bills';
-    const restoreRentName = isThai ? `กู้คืน ${titleBills} 12,268 บาท` : `Restore ${titleBills} 12,268 baht`;
-    const restoreRentBtn = named('button', restoreRentName);
-
-    fireEvent.click(restoreRentBtn);
-
-    const restoredNotice = isThai ? `${titleBills} ฿12,268.00 กลับมาอยู่ในประวัติแล้ว` : `${titleBills} ฿12,268.00 is back in History.`;
-    await findShown(restoredNotice);
-
-    const [restoreCall] = fake.callsOf('restoreTransaction');
-    expect(restoreCall.args.slice(0, 2)).toEqual([RENT, 2]);
-    expect(restoreCall.args[2]).toEqual(expect.any(String));
-    expect(trackRecordRestored).toHaveBeenCalledWith({ kind: 'expense' });
-
-    await waitFor(() => expect(screen.queryByText(days29)).toBeNull());
-    shown(days21);
-
-    cleanup();
+  for (const locale of LOCALES) {
+    for (const mode of MODES) {
+      const words = WORDS[locale];
+      const { fake } = mount({ locale, mode });
+      const rent = await findNamed('button', words.restore(words.bills, words.baht('12,268')));
+      named('heading', words.heading);
+      shown(words.policy);
+      shown(words.daysLeft(29));
+      shown(words.daysLeft(21));
+      // Past its 30 days, the salary is not listed: looked for by its title in this language.
+      expect(screen.queryByText(words.salary), `${locale} ${mode}: no salary row`).toBeNull();
+      expect(screen.queryAllByRole('button', { name: words.restorePattern }), `${locale} ${mode}: restore buttons`).toHaveLength(2);
+      // Each row names its wallet; the list ends with the footer line.
+      expect(rent.parentElement?.textContent, `${locale} ${mode}: rent's row`).toContain('· Daily account ·');
+      shown(words.footer);
+
+      // Two taps before the screen draws again: the second finds a restore on its way.
+      act(() => {
+        fireEvent.click(rent);
+        fireEvent.click(rent);
+      });
+      await findShown(words.restored);
+      await waitFor(() => expect(fake.callsOf('recentlyDeleted').length).toBeGreaterThanOrEqual(2));
+      const calls = fake.callsOf('restoreTransaction');
+      expect(calls, `${locale} ${mode}: restore commands`).toHaveLength(1);
+      expect(calls[0].args.slice(0, 2)).toEqual([RENT, 2]);
+      expect(calls[0].args[2]).toEqual(expect.any(String));
+
+      await waitFor(() => expect(screen.queryByText(words.daysLeft(29))).toBeNull());
+      shown(words.daysLeft(21));
+      cleanup();
+    }
   }
 });

 test('the last day says so', async () => {
-  for (const locale of ['th', 'en'] as const) {
-    await mount({ records: seedWithLastDay(), locale });
-    const isThai = locale === 'th';
-    const lastDayText = isThai ? 'วันสุดท้ายที่กู้คืนได้' : 'Last day to restore';
-    const el = await findShown(lastDayText);
-    expect(el.style.fontWeight).toBe('700');
-    cleanup();
+  for (const locale of LOCALES) {
+    for (const mode of MODES) {
+      const words = WORDS[locale];
+      const colors = PALETTE[mode];
+      mount({ records: deletedSeed([LAST_DAY, TWO_DAYS]), locale, mode });
+      await findNamed('button', words.restore(words.bills, words.baht('12,268')));
+      // Only the final 24 hours are the last day: two days left is not.
+      const lastDays = screen.queryAllByText(words.lastDay);
+      expect(lastDays, `${locale} ${mode}: one last day`).toHaveLength(1);
+      const two = shown(words.daysLeft(2));
+      expect([lastDays[0].style.fontWeight, lastDays[0].style.color], `${locale} ${mode}: the last day`).toEqual(['700', rgba(colors.ink)]);
+      expect([two.style.fontWeight, two.style.color], `${locale} ${mode}: two days left`).toEqual(['400', rgba(colors.quiet)]);
+      cleanup();
+    }
   }
 });

 test('private mode hides every amount and masks the restore label', async () => {
-  for (const locale of ['th', 'en'] as const) {
-    const isThai = locale === 'th';
-    const { mounted } = await mount({ locale, device: { 'private-mode': '1' } });
-    await findNamed('heading', isThai ? 'รายการที่เพิ่งลบ' : 'Recently deleted');
-
-    // Amounts are masked to HIDDEN_AMOUNT
-    const hiddenAmounts = screen.queryAllByText(HIDDEN_AMOUNT);
-    expect(hiddenAmounts.length, 'hidden amounts count').toBeGreaterThanOrEqual(2);
+  for (const locale of LOCALES) {
+    for (const mode of MODES) {
+      const words = WORDS[locale];
+      const { mounted } = mount({ locale, mode, device: PRIVATE });
+      await findNamed('button', words.restore(words.bills, words.hidden));
+      named('button', words.restore(words.food, words.hidden));
+      expect(screen.queryAllByText(HIDDEN_AMOUNT), `${locale} ${mode}: masked amounts`).toHaveLength(2);
+      expect(mounted.container.textContent, `${locale} ${mode}`).not.toMatch(/12,268|182/);
+      cleanup();
+    }
+  }
+});

-    // No raw amount figures like 12,268 or 182 in the text content
-    expect(mounted.container.textContent).not.toMatch(/12,268|182/);
+test('private mode: a restore names its entry without the amount, on screen and in every live region (R109)', async () => {
+  for (const locale of LOCALES) {
+    for (const mode of MODES) {
+      const words = WORDS[locale];
+      const { fake, mounted } = mount({ locale, mode, device: PRIVATE });
+      // A refusal keeps its own words in private mode.
+      fake.fail('restoreTransaction', 'conflict', { status: 409, code: 'VERSION_CONFLICT' });
+      fireEvent.click(await findNamed('button', words.restore(words.food, words.hidden)));
+      await findShown(words.conflict);
+
+      fireEvent.click(named('button', words.restore(words.bills, words.hidden)));
+      await findShown(words.restoredHidden);
+      await waitFor(() => expect(fake.callsOf('recentlyDeleted').length).toBeGreaterThanOrEqual(3));
+      expect(fake.callsOf('restoreTransaction'), `${locale} ${mode}: restore commands`).toHaveLength(2);
+      const regions = liveRegions(mounted.container);
+      expect(regions.length, `${locale} ${mode}: the notice is a live region`).toBeGreaterThan(0);
+      for (const region of [mounted.container, ...regions]) {
+        expect(region.textContent, `${locale} ${mode}: ฿ and a digit`).not.toMatch(/฿\s*\d/);
+        expect(region.textContent, `${locale} ${mode}: rent's amount`).not.toContain('12,268');
+      }
+      cleanup();
+    }
+  }
+});

-    // Restore button accessibilityLabel masks the amount
-    const titleBills = isThai ? 'ค่าบิล' : 'Bills';
-    const hiddenPhrase = isThai ? 'ซ่อนยอดเงินอยู่' : 'Amount hidden';
-    const restoreLabel = isThai ? `กู้คืน ${titleBills} ${hiddenPhrase}` : `Restore ${titleBills} ${hiddenPhrase}`;
-    named('button', restoreLabel);
+test('every restore button is 44 pt and names its entry', async () => {
+  for (const locale of LOCALES) {
+    for (const mode of MODES) {
+      const words = WORDS[locale];
+      mount({ locale, mode });
+      await findNamed('button', words.restore(words.bills, words.baht('12,268')));
+      const buttons = screen.queryAllByRole('button', { name: words.restorePattern });
+      expect(buttons.map((button) => button.getAttribute('aria-label')), `${locale} ${mode}`).toEqual([
+        words.restore(words.bills, words.baht('12,268')),
+        words.restore(words.food, words.baht('182')),
+      ]);
+      for (const button of buttons) {
+        expect([button.style.minHeight, button.style.borderRadius], `${locale} ${mode}`).toEqual(['44px', '999px']);
+      }
+      cleanup();
+    }
+  }
+});

+test('at the largest text size the title wraps and each restore pill grows with its words (m1)', async () => {
+  for (const locale of LOCALES) {
+    const words = WORDS[locale];
+    mount({ locale, fontScale: AX5 });
+    await findNamed('button', words.restore(words.bills, words.baht('12,268')));
+    // No text is clamped or shrunk to fit.
+    expect(seen.props.length, locale).toBeGreaterThan(0);
+    for (const props of seen.props) {
+      expect([props.numberOfLines, props.adjustsFontSizeToFit, props.ellipsizeMode], `${locale}: ${String(props.children)}`).toEqual([undefined, undefined, undefined]);
+    }
+    // At least 44 pt, and no fixed height: the pill is as tall as its words need.
+    for (const button of screen.queryAllByRole('button', { name: words.restorePattern })) {
+      expect([button.style.minHeight, button.style.height], locale).toEqual(['44px', '']);
+    }
     cleanup();
+    seen.props.length = 0;
   }
 });

-test('every restore button is 44 pt and names its entry', async () => {
-  for (const locale of ['th', 'en'] as const) {
-    for (const mode of ['light', 'dark'] as const) {
-      await mount({ locale, mode });
-      const isThai = locale === 'th';
-      const pattern = isThai ? /^กู้คืน / : /^Restore /;
-      await waitFor(() => {
-        const buttons = screen.queryAllByRole('button', { name: pattern });
-        expect(buttons.length, 'restore buttons count').toBe(2);
-      });
-      const buttons = screen.queryAllByRole('button', { name: pattern });
-
-      for (const btn of buttons) {
-        expect(btn.style.height).toBe('44px');
-        expect(btn.style.minHeight).toBe('44px');
-        expect(btn.style.borderRadius).toBe('999px');
-        expect(btn.getAttribute('aria-label')).toMatch(pattern);
-      }
+test('a deleted income draws as income: violet, with its plus (m2)', async () => {
+  for (const locale of LOCALES) {
+    for (const mode of MODES) {
+      const words = WORDS[locale];
+      const colors = PALETTE[mode];
+      // The salary deleted four days ago: an income with 26 days left.
+      mount({ locale, mode, records: deletedSeed([], { [SALARY_ID]: '2026-09-25T03:00:00.000Z' }) });
+      await findNamed('button', words.restore(words.salary, words.baht('28,000')));
+      expect(shown('+฿28,000').style.color, `${locale} ${mode}: income`).toBe(rgba(colors.violet));
+      // An expense is its size alone, in ink.
+      expect(shown('฿12,268').style.color, `${locale} ${mode}: expense`).toBe(rgba(colors.ink));
       cleanup();
     }
   }
 });

+test("each row says its wallet and its day as dateStep says it: yesterday, a weekday, and another year's with its year (m4)", async () => {
+  for (const locale of LOCALES) {
+    const words = WORDS[locale];
+    // The move (28 September) was deleted yesterday as well.
+    mount({ locale, records: deletedSeed([LAST_YEAR], { [MOVE]: '2026-09-28T05:00:00.000Z' }) });
+    await findNamed('button', words.restore(words.bills, words.baht('12,268')));
+    for (const line of words.dayLines) shown(line);
+    cleanup();
+  }
+});
+
+test('the page starts 8 pt below the status bar, from the safe-area inset (m5)', async () => {
+  mount();
+  await findNamed('button', WORDS.th.restore(WORDS.th.bills, WORDS.th.baht('12,268')));
+  // The scroll view's content: the harness's phone has a 62 pt top inset.
+  const content = found('wallet-deleted-screen').firstElementChild?.firstElementChild as HTMLElement | null | undefined;
+  expect(content?.style.paddingTop).toBe('70px');
+});
+
 test('an unconfirmed restore is frozen: only Try again, which resends the same command', async () => {
-  const { fake } = await mount();
+  const { fake } = mount();
   fake.loseResponse('restoreTransaction');
   const rentBtn = await findNamed('button', 'กู้คืน ค่าบิล 12,268 บาท');
   fireEvent.click(rentBtn);
@@ -240,9 +405,9 @@ test('an unconfirmed restore is frozen: only Try again, which resends the same c
 });

 test('a refused restore says why in plain words and reads the list again', async () => {
-  for (const locale of ['th', 'en'] as const) {
+  for (const locale of LOCALES) {
     const isThai = locale === 'th';
-    const { fake } = await mount({ locale });
+    const { fake } = mount({ locale });
     const titleBills = isThai ? 'ค่าบิล' : 'Bills';
     const restoreRentName = isThai ? `กู้คืน ${titleBills} 12,268 บาท` : `Restore ${titleBills} 12,268 baht`;
     const titleFood = isThai ? 'อาหาร' : 'Food';
@@ -275,21 +440,26 @@ test('a refused restore says why in plain words and reads the list again', async
   }
 });

-test('Back returns to History, or opens it when there is nothing to go back to', async () => {
-  await mount();
-  const backBtn = await findNamed('button', 'กลับ');
-  fireEvent.click(backBtn);
-  expect(nav.router.back).toHaveBeenCalledTimes(1);
+test("Back, named as rh-deleted names it, returns to History, or opens it when there is nothing to go back to (n1)", async () => {
+  for (const locale of LOCALES) {
+    mount({ locale });
+    const back = await findNamed('button', WORDS[locale].back);
+    fireEvent.click(back);
+    expect(nav.router.back, locale).toHaveBeenCalledTimes(1);

-  nav.router.canGoBack.mockReturnValue(false);
-  fireEvent.click(backBtn);
-  expect(nav.router.replace).toHaveBeenLastCalledWith('/spend/all');
+    nav.router.canGoBack.mockReturnValue(false);
+    fireEvent.click(back);
+    expect(nav.router.replace, locale).toHaveBeenLastCalledWith('/spend/all');
+    cleanup();
+    nav.router.back.mockReset();
+    nav.router.canGoBack.mockReturnValue(true);
+  }
 });

 test('with nothing deleted it says so and shows the empty state', async () => {
-  for (const locale of ['th', 'en'] as const) {
+  for (const locale of LOCALES) {
     const isThai = locale === 'th';
-    await mount({ records: goldenSeed().records, locale });
+    mount({ records: goldenSeed().records, locale });
     const emptyText = isThai ? 'ไม่มีรายการที่ถูกลบในช่วง 30 วันที่ผ่านมา' : 'Nothing deleted in the last 30 days';
     const emptyBody = isThai ? 'รายการที่คุณลบจะแสดงที่นี่' : 'Entries you delete show up here.';
     await findShown(emptyText);
@@ -300,9 +470,39 @@ test('with nothing deleted it says so and shows the empty state', async () => {
   }
 });

-test('catalogue section bw-deleted is registered and renders', () => {
-  const section = WALLET_SECTIONS.find((s) => s.id === 'bw-deleted');
-  expect(section, 'section bw-deleted registered in WALLET_SECTIONS').toBeDefined();
-  expect(section?.title).toBe('Bun Wallet: recently deleted');
-  expect(section?.render).toBeDefined();
+test("each line takes WalletText's leading for its language (n4)", async () => {
+  for (const locale of LOCALES) {
+    const words = WORDS[locale];
+    const leading = LEADING[locale];
+    mount({ locale });
+    await findNamed('button', words.restore(words.bills, words.baht('12,268')));
+    expect([
+      named('heading', words.heading).style.lineHeight,
+      shown(words.policy).style.lineHeight,
+      shown(words.bills).style.lineHeight,
+      shown(/^· Daily account · /).style.lineHeight,
+      shown(words.daysLeft(29)).style.lineHeight,
+      shown(words.footer).style.lineHeight,
+    ], locale).toEqual([leading.h1, leading.policy, leading.title, leading.caption, leading.caption, leading.caption]);
+    cleanup();
+  }
 });
+
+test('the catalogue section bw-deleted draws the real screen on its own fakes (B1)', async () => {
+  const section = WALLET_SECTIONS.find((each) => each.id === 'bw-deleted');
+  expect(section, 'section bw-deleted registered in WALLET_SECTIONS').toBeDefined();
+  expect([section?.title, section?.group, section?.layout]).toEqual(['Bun Wallet: recently deleted', 'Screens', 'screen']);
+  for (const locale of LOCALES) {
+    const words = WORDS[locale];
+    // The harness's own fakes hold nothing deleted: every row below is the section's.
+    mountWallet(<>{section?.render()}</>, { locale });
+    // While the screen loads, and while its script runs, the catalogue's suites wait on this.
+    found('catalogue-screen-running');
+    await findFound('catalogue-screen-ready');
+    named('heading', words.heading);
+    for (const label of words.sectionRows) named('button', label);
+    shown(words.lastDay);
+    cleanup();
+  }
+  // Longer than findFound's 10 s, so a section that never gets ready fails on its assertion, not on the case's time.
+}, 30_000);
```

`docs/implementation/receipts/P2-T25.md`:

```diff
diff --git a/docs/implementation/receipts/P2-T25.md b/docs/implementation/receipts/P2-T25.md
index 5ded60e..878a79c 100644
--- a/docs/implementation/receipts/P2-T25.md
+++ b/docs/implementation/receipts/P2-T25.md
@@ -4,12 +4,12 @@
 - **Base:** `c7e39bf4`, the head after the sync from `origin/claude/p1a-vault-core`. The worktree was cut at `675569e2`, and the sync fast-forwarded it by 11 controller-state commits (all under `.claude/`). `git diff 675569e2 HEAD -- apps packages package-lock.json vendor docs/implementation/receipts` prints nothing, so no whole-suite count moves.
 - **Files:** created `apps/app/src/screens/redesign/deleted/deletedData.ts`, `apps/app/src/wallet/records/copy.ts`, `apps/app/src/wallet/records/WalletDeletedScreen.tsx`, `apps/app/src/wallet/records/WalletDeleted.render.test.tsx`, `apps/app/src/dev/catalogue/wallet/recordSections.tsx` and this receipt. Modified `apps/app/src/screens/redesign/RecentlyDeletedScreen.tsx` (285 lines before, 168 lines after), `apps/app/app/spend/deleted.tsx` (16 lines before, 17 after), and `apps/app/src/dev/catalogue/wallet/index.ts` (14 lines before, 16 after).
 - **What changed:**
-  - `deletedData.ts`: extracts `useRecentlyDeleted(now?: Date): RecentlyDeletedState` from `RecentlyDeletedScreen.tsx`. Encapsulates paging (`recentlyDeleted`, `loadMore`), `restore` with unconfirmed freeze tracking (`held`, `pending`, `restoreSlot`), domain refusal text (`restoreRefusalText`), and banner / load problems. Carry rule: 1D-T7's `trackRecordRestored({ kind: row.type })` moves with `restore`.
-  - `RecentlyDeletedScreen.tsx`: refactored to consume `useRecentlyDeleted(now)`. Zero behaviour change; all 17 existing tests pass unchanged.
-  - `records/copy.ts`: exports `COPY` with 7 draft keys (`records.deletedTitle`, `records.deletedPolicy`, `records.daysLeft`, `records.lastDay`, `records.restoreLabel`, `records.emptyDeletedTitle`, `records.emptyDeletedHint`) satisfying `DraftTable`.
-  - `WalletDeletedScreen.tsx`: complete Bun Wallet screen matching design board `rh-deleted.dc.html`. Features 44 pt back button (`useGoBack('/spend/all')`), 28/700 header (`records.deletedTitle`), retention policy text (`records.deletedPolicy`), row items with category icon, category name, wallet name, occurred date, days left (or bold 700 last day indicator), 44 pt restore pill button with `accessibilityLabel` masking in private mode (`Amount hidden` / `ซ่อนยอดเงินอยู่`), unconfirmed freeze handling (only held item shows "Try again" / "ลองอีกครั้ง", other restores disabled), and empty state with sleepy Bun mascot (`recently-deleted-empty-bun`).
+  - `deletedData.ts`: extracts `useRecentlyDeleted(now?: Date): RecentlyDeletedState` from `RecentlyDeletedScreen.tsx`. Encapsulates paging (`recentlyDeleted`, `loadMore`), `restore` with unconfirmed freeze tracking (`held`, `pending`, `restoreSlot`), domain refusal text (`restoreRefusalText`), and banner / load problems. Corrected in the fix round (R109): nothing was carried. No app code at the base calls `trackRecordRestored`, and 1D-T7 (#138) has not merged; it puts the call into `useRecentlyDeleted` with its own `recordAnalytics()` case (R61). The call this round added is removed (`P2-T25-fix.md`).
+  - `RecentlyDeletedScreen.tsx`: refactored to consume `useRecentlyDeleted(now)`. All 17 existing tests pass unchanged. Corrected in the fix round: as committed, a restore on this routed screen also sent `record_restored`, which the base never did; with the call removed, its behaviour is the base's again.
+  - `records/copy.ts`: exports `COPY` with 7 draft keys (`records.deletedTitle`, `records.deletedPolicy`, `records.daysLeft`, `records.lastDay`, `records.restore`, `records.restoreLabel`, `records.deletedFooter`) satisfying `DraftTable`. The fix round adds `records.backToHistory` and `records.restoredHidden`.
+  - `WalletDeletedScreen.tsx`: complete Bun Wallet screen matching design board `rh-deleted.dc.html`. Features 44 pt back button (`useGoBack()`, whose fallback is `/spend/all`), 28/700 header (`records.deletedTitle`), retention policy text (`records.deletedPolicy`), row items with category icon, category name, wallet name, occurred date, days left (or bold 700 last day indicator), 44 pt restore pill button with `accessibilityLabel` masking in private mode (`Amount hidden` / `ซ่อนยอดเงินอยู่`), unconfirmed freeze handling (only held item shows "Try again" / "ลองอีกครั้ง", other restores disabled), and empty state with sleepy Bun mascot (`recently-deleted-empty-bun`).
   - `app/spend/deleted.tsx`: conditionally renders `WalletDeletedScreen` when `isRedesignEnabled('wallet')`, falling back to `RecentlyDeletedScreen`.
-  - `recordSections.tsx` & `index.ts`: defines catalogue section `bw-deleted` (`Bun Wallet: recently deleted`) under `Screens` with `lazy()` import to avoid pulling `expo-router` into kit tests. Spreads `WALLET_RECORD_SECTIONS` into `WALLET_SECTIONS`.
+  - `recordSections.tsx` & `index.ts`: defines catalogue section `bw-deleted` (`Bun Wallet: recently deleted`) under `Screens` with `lazy()` import to avoid pulling `expo-router` into kit tests. Spreads `WALLET_RECORD_SECTIONS` into `WALLET_SECTIONS`. Corrected in the fix round: the section drew the screen with no fakes, so both catalogue suites failed on it (the first review's B1).
 - **RED to GREEN:**
   - RED, with typed stubs for `deletedData.ts` and `WalletDeletedScreen.tsx`, and real tests: `npx vitest run --config vitest.render.config.ts src/wallet/records/WalletDeleted.render.test.tsx` (in `apps/app`): exit code 1, `Test Files 1 failed (1)`, `Tests 9 failed (9)`. Every failure was an `AssertionError` (0 `TestingLibraryElementError`, 0 type errors, 0 load errors, 0 timeouts). All 9 cases failed on assertions:
     - T1 `Recently deleted says how many days are left and restores one entry`: `expected heading named รายการที่เพิ่งลบ to appear: expected null not to be null`
@@ -26,7 +26,7 @@
     - `RecentlyDeletedScreen.render.test.tsx`: exit code 0, `Test Files 1 passed (1)`, `Tests 17 passed (17)`.
     - Unit tests (`npm run test:unit -w gogospend-app`): exit code 0, `974 passed (974 tests, including draftText.test.ts)`.
     - Catalogue neighbours (`walletHarness.render.test.tsx` and `Tray.render.test.tsx`): exit code 0, `Test Files 2 passed (2)`, `Tests 36 passed (36)`.
-- **Mutation check:** 19 mutants: 19 killed (100%), 0 survivors. Runner `p2-t25-planner/tools/mutants.py` applied each mutant alone, verified kill on `WalletDeleted.render.test.tsx`, and verified clean restoration via SHA-256:
+- **Mutation check:** 19 mutants ran, and 19 were killed. M14 is removed from this record with the call it removed (R109), so 18 stand. The first review found survivors among its own mutants; the fix round pins them (`P2-T25-fix.md`). Runner `p2-t25-planner/tools/mutants.py` applied each mutant alone, verified kill on `WalletDeleted.render.test.tsx`, and verified clean restoration via SHA-256:
   - M1: killed - Count days left from delete day plus 31 (the plan's mutant)
   - M2: killed - Last day not highlighted in bold 700
   - M3: killed - Private mode does not mask spoken restore label
@@ -40,7 +40,6 @@
   - M11: killed - Restore refusal does not show plain domain reason
   - M12: killed - Definite refusal does not reload the list in place
   - M13: killed - Restore sends wrong row version to API
-  - M14: killed - Carry rule: omit trackRecordRestored on restore
   - M15: killed - Empty state title does not say 30 days
   - M16: killed - Empty state mascot art omitted
   - M17: killed - Empty state mascot pose changed from sleepy
@@ -55,7 +54,7 @@
 - **Deviations:**
   - The controller accepted the planner's rulings P1 to P6:
     - P1: Prerequisite readiness after P2-T8 and P2-T10.
-    - P2: Carry rule for `trackRecordRestored` moving to `useRecentlyDeleted`.
+    - P2: Carry rule for `trackRecordRestored` moving to `useRecentlyDeleted`. Withdrawn: its premise was false (the first review's M2, R109).
     - P3: Pure hook extraction of `useRecentlyDeleted`.
     - P4: Board fidelity matching `rh-deleted.dc.html`.
     - P5: Catalogue isolation via `lazy()` import in `recordSections.tsx`.
@@ -65,4 +64,5 @@
 - **Notes for later tasks:**
   - `useRecentlyDeleted` encapsulates all state, paging, and restore command-key tracking for recently deleted entries; future views or consumers should use this hook.
   - Restore buttons are 44 pt minimum height pill buttons (border radius 999). In private mode, spoken restore label masks amount to `common.amountHidden`.
-  - `recordSections.tsx` uses `lazy()` to load `WalletDeletedScreen`, avoiding `expo-router` imports in kit tests.
+  - `recordSections.tsx` uses `lazy()` to load the section's stage (`deletedSection.tsx` since the fix round), so the kit suites never load `expo-router`.
+- **Fix round:** `P2-T25-fix.md` (R109): the first review's B1, M1, M2, m1 to m6 and n1 to n5, and the second review's points.
```

`docs/implementation/receipts/P2-T25-fix.md` (new):

```diff
diff --git b/docs/implementation/receipts/P2-T25-fix.md b/docs/implementation/receipts/P2-T25-fix.md
new file mode 100644
index 0000000..3ccfde9
--- /dev/null
+++ b/docs/implementation/receipts/P2-T25-fix.md
@@ -0,0 +1,76 @@
+# P2-T25-fix: a private-mode restore without its amount, nothing carried, bw-deleted on its own fakes, and the reviews' minors
+
+- **Status:** built and verified locally on `p2/t25-recently-deleted` (`.claude/worktrees/p2-t25`): a merge of `a00fff7c` into PR #412's reviewed head `b840c195`, then one commit. Not pushed. This is the fix round on PR #412 after two reviews:
+  - the first (`.claude/controller/reviews/P2-T25.md`) said Needs fixes: one blocker (B1), two majors (M1, M2), six minors and five nits;
+  - the second (`P2-T25-second.md`, money and privacy) said Needs fixes. Its major is the first review's M1. Its minor is the case R109 asks for (a restore with private mode on). Its nit is one way to do R109's item 1, `usePrivateMode()` read at the screen level, which this round does.
+
+  The controller ruled R109, and the planner's brief is `.claude/controller/briefs/P2-T25-fix.md`. Under R87 this receipt is its own file; `P2-T25.md` is corrected (m6) and points here.
+- **Base:** the merge of `a00fff7c` (P2-T33's PR #406, merged into `claude/p1a-vault-core`) into `b840c195`.
+  - Since #412's base (`c7e39bf4`), P2-T14's #407 and P2-T33's #406 each added a spread to the catalogue's `index.ts` where #412 added its own, so #412 no longer merged cleanly, and GitHub runs no CI on a pull request that conflicts.
+  - The merge keeps every spread in plan order: P2-T14's `WALLET_ADD_SECTIONS`, P2-T25's `WALLET_RECORD_SECTIONS`, then P2-T33's `WALLET_LOCK_SECTIONS` (the planner's `merge/index.ts`, from a three-way merge of `c7e39bf4`, `b840c195` and `a00fff7c`). No other file changed on both sides. The merge also brings P2-T23's Home data, P3-T4's gateway transport and P2-T33's lock, with its route `app/settings/lock.tsx`.
+  - The planner's `merge/orders/` proves `index.ts` for every order of #412, #416 (P2-T20, `WALLET_LIST_SECTIONS`) and #411 (P2-T32, `WALLET_RECAP_SECTIONS`) onto `a00fff7c`. Each conflict is two insertions at one place, resolved in plan order (ADD, LIST, RECORD, RECAP, LOCK), and all six orders end in the same file.
+- **Files:**
+  - Modified:
+    - `apps/app/src/screens/redesign/deleted/deletedData.ts`: no `trackRecordRestored` (M2); a confirmed restore's notice carries `restored`, the row (M1);
+    - `apps/app/src/wallet/records/WalletDeletedScreen.tsx`;
+    - `apps/app/src/wallet/records/copy.ts`: 7 keys before, 9 after;
+    - `apps/app/src/wallet/records/WalletDeleted.render.test.tsx`: 9 cases before, 15 after;
+    - `apps/app/src/dev/catalogue/wallet/recordSections.tsx`: it loads the section's stage lazily, with a fallback the catalogue suites wait on (B1);
+    - `docs/implementation/receipts/P2-T25.md`: m6's corrections and a line pointing here.
+  - Created: `apps/app/src/dev/catalogue/wallet/deletedSection.tsx` (B1) and this receipt.
+  - No shared file changes in this commit. `index.ts` is the merge's.
+- **B1, the catalogue section on its own fakes:**
+  - `bw-deleted` drew `WalletDeletedScreen` with no `SpendV1Provider`, so both catalogue suites failed on it (CI's "Render, per-section suites (ids of length 3n+1)" job), and on a phone the section threw `useSpendV1 needs a SpendV1Provider.`
+  - `deletedSection.tsx` stages the real screen with `screenSection`, as `recentlyDeletedSections.tsx` stages the old one, on fakes and the fixtures' clock: rent deleted yesterday, the salary four days ago, lunch nine days ago, and a taxi on its last day. Its script waits until the list is drawn.
+  - `recordSections.tsx` loads that module with `lazy()`, since it and the screen import expo-router, which the kit's suites cannot load (the first review's P5). The `Suspense` fallback reads `catalogue-screen-running`, which both catalogue suites wait on.
+  - `WalletDeleted.render.test.tsx` now renders the section, in Thai and English, and finds its own rows.
+- **M1, private mode after a restore (R109.1):**
+  - The hook's notice for a confirmed restore carries the restored row (`RestoreNotice.restored`). Its `message` is unchanged, so `RecentlyDeletedScreen` says the words its suite pins.
+  - `WalletDeletedScreen` reads `usePrivateMode()` itself and, while private mode is on, words a restore with `records.restoredHidden` (ค่าบิล กลับมาอยู่ในประวัติแล้ว). A `Notice` speaks what it shows (`useAnnouncement`) and is a live region, so no amount is drawn, announced or read out.
+  - A refusal keeps its own words in private mode.
+  - The case R109 names: a restore with private mode on, then no `฿` followed by a digit and no `12,268`, in the screen and in every live region, in Thai and English, light and dark.
+- **M2, nothing carried (R109.2):**
+  - `deletedData.ts` no longer calls `trackRecordRestored`, nor imports it. The test's `vi.mock` of the events module and its assertion are gone, and M14 from the first round's mutant record.
+  - Nothing was carried: no app code at the base calls `trackRecordRestored`, and 1D-T7 (#138) has not merged. 1D-T7 puts the call into `useRecentlyDeleted`, with its own `recordAnalytics()` case (R61).
+- **The minors (R109.3):**
+  - m1: the title is never clamped, so it wraps at the largest text sizes. Each Restore pill is at least 44 pt (`minHeight`) with no fixed height, so it grows with its words.
+  - m2: a deleted income draws as income: `+฿28,000` in violet, through `WalletAmount`'s `sign="income"` and no tone. An expense or a move stays its size alone, in ink.
+  - m3: the first review's six survivors are pinned: two taps in one frame send one restore (R1, R2), the last day is the final 24 hours only and is drawn in ink (R3, R4), and each row names its wallet (R15) above the footer line (R17). Before this round all six survive `b840c195`'s own tests (the planner's `logs/before-pins.out`); each now fails a case on an assertion.
+  - m4: the row's day is `dateStep`'s `dayLabel` on the screen's clock: วันนี้ or เมื่อวาน, else the weekday and the date, with the year when it is not this year (พุธ 24 ธ.ค. 2568). The screen's own month table is gone.
+  - m5: the page starts 8 pt below the status bar, from the safe-area inset (`insets.top + 8`), as rh-deleted's 52 pt sits below a 44 pt bar.
+  - m6: `P2-T25.md` is corrected: the carry rule, the old screen's behaviour, the seven keys, `useGoBack()`, the mutant record without M14, ruling P2 withdrawn, and the section's notes.
+- **The nits:**
+  - n1: Back is named as rh-deleted names it, กลับไปประวัติ (`records.backToHistory`).
+  - n2: Step 1's four cases, and the new private-mode and income cases, run in light and dark, with colours checked against each mode.
+  - n3: the expired salary is looked for by its title in each language (เงินเดือน, Salary).
+  - n4: each line takes WalletText's leading for its language. The heading is the `h1` role and the 13 pt lines the `caption` role, with no leading of their own. The board's 16 pt title and 14 pt policy have no role, so they take `walletLineHeight` for the active script, never Thai's in every language.
+  - n5: the copy table is merged once, at module level.
+- **RED to GREEN:**
+  - RED, on `b840c195`'s code (as merged) with the round's test file:
+    - `typecheck:app` exit 0.
+    - `WalletDeleted.render.test.tsx`: 8 of 15 fail, each on an `AssertionError`, with no load or lookup error: R109, m1, m2, m4, m5, n1, n4 and B1. The other 7 guard what the first round already did right.
+    - The catalogue's two `section bw-deleted` cases fail on assertions (B1).
+    - The six survivors on that code, the eight RED cases left out: 6 killed, each on an assertion.
+  - GREEN: `WalletDeleted.render.test.tsx` 15 of 15 and `RecentlyDeletedScreen.render.test.tsx` 17 of 17, unchanged; `draftText.test.ts` 4 of 4; the six kit suites that list `WALLET_SECTIONS` 88 of 88; the catalogue's `section bw-` cases 38 of 38.
+- **Mutation check:** 48, all killed, each file restored with its SHA-256 checked:
+  - the first round's 18 (M14 is gone with its call) and the plan's own mutant, a 31-day window (P1);
+  - this round's 29: M1's four (MP1 to MP3, MH), m1's two, m2's two, the six pins, m4's two, m5's two, n1's one, n4's six and B1's four.
+  - Every kill is an assertion but B1e's: a static import of the section's stage, which `walletHarness` and `Tray` fail to load (`SyntaxError`), which is why the section is lazy.
+  - Left out as equivalent, as the first review found: a restore key kept after a confirmed restore (a restore bumps the version, so the key is never reused), and Load more while it loads (`PillButton` ignores presses while busy).
+- **Gate (R100):**
+  - `npm run typecheck:app`: exit 0.
+  - `npm run typecheck:routes -w gogospend-app`: exit 0 (the merge brings P2-T33's route).
+  - `npm run test:unit`: exit 0, 0 failed.
+  - `npm run test:app`: exit 0, 0 failed.
+  - The focused files and the six kit suites: 8 files, 120 of 120.
+  - The catalogue's `section bw-deleted` cases: 2 of 2.
+  - `git diff --check`: clean, before and after the commit.
+- **SKIPPED and CI:**
+  - In CI on the PR (R100): the full render suite (its per-section jobs run `bw-deleted` in both catalogue suites), `export:web`, the iOS export, `test:ops` and the database suites. This round's commit changes no route, config, app entry, package or lockfile; the merge's route is P2-T33's, which CI checked on #406.
+  - Not needed: the API and edge suites; nothing outside `apps/app` and the receipts changes.
+  - SKIPPED until run: the E2 screenshots of `bw-deleted`, and a VoiceOver pass over a restore in private mode on a phone.
+- **Notes for later tasks:**
+  - 1D-T7 (#138): add `trackRecordRestored({ kind: row.type })` to `useRecentlyDeleted`'s `restore`, after the acknowledgement, with its own `recordAnalytics()` case (R61). Nothing calls it today, so its `RecentlyDeletedScreen` case starts RED.
+  - P2-T26: a wallet line built from the shared restore or undo words that carries an amount needs this round's treatment in private mode: name the entry and drop the amount (`records.deletedBar` is the next). `records/copy.ts` is the table P2-T26 extends.
+  - P2-T28 and every later screen section: draw the real screen through `screenSection` on fakes, behind `lazy()` when the kit suites list its section, with a fallback that reads `catalogue-screen-running`, and run both catalogue suites with `-t 'section <id>'` before committing.
+  - E2-B: `records.restoredHidden`, and the English of `records.backToHistory`, are drafts. A row's day now reads as History's day headers do (a weekday, วันนี้ or เมื่อวาน), where the board shows only the date.
```

## Appendix B: the merge proofs for `index.ts`

Step 1's merge gives `merge/index.ts` (copy it from the kit, not from here):

```ts
// The Bun Wallet's catalogue sections (plan P2, development only), last in the
// catalogue's list (registry.tsx). Each wallet task with sections adds one
// spread of its own list here, in plan order. Ids start with `bw-` and titles
// with `Bun Wallet: ` (R72); walletHarness.render.test.tsx holds them to that.
import type { CatalogueSection } from '../registry';
import { WALLET_LOCK_SECTIONS } from './lockSections';
import { WALLET_KIT_SECTIONS } from './kitSections';
import { WALLET_STACK_SECTIONS } from './stackSections';
import { WALLET_TRAY_SECTIONS } from './traySections';
import { WALLET_ADD_SECTIONS } from './addSections';
import { WALLET_RECORD_SECTIONS } from './recordSections';

export const WALLET_SECTIONS: readonly CatalogueSection[] = [
  ...WALLET_KIT_SECTIONS,
  ...WALLET_STACK_SECTIONS,
  ...WALLET_TRAY_SECTIONS,
  ...WALLET_ADD_SECTIONS,
  ...WALLET_RECORD_SECTIONS,
  ...WALLET_LOCK_SECTIONS,
];
```

`python3 -I PL/tools/merge-orders.py PL` replays Step 1's merge, then every order of #412 (after Step 1, so its merge base is `a00fff7c`), #416 (`f6a2b681`, merge base `a00fff7c`) and #411 (`71b2255e`, merge base `647cb4a0`) merged one by one onto `a00fff7c`. Each step is `git merge-file` of the head so far, the pull request's merge base and its file. Each conflict is resolved by keeping every line of both sides in plan order (ADD, LIST, RECORD, RECAP, LOCK) and checked against the expected file for the pull requests merged so far, built separately from `a00fff7c`'s. Each step's raw output and result are in `merge/orders/<order>/`. If #411's fix round merges the integration head first, its merge base changes but each result does not.

```
   step 1: a00fff7c into b840c195 (base c7e39bf4): git merge-file exit 2, 2 conflicts, both sides kept -> sha256 4b3c63826b02; equals merge/index.ts and the expected file: True
   order 412-416-411, step 1: #412 -> git merge-file exit 0, 0 conflicts resolved by plan order -> sha256 4b3c63826b02; equals the expected file for {#412}: True
   order 412-416-411, step 2: #416 -> git merge-file exit 2, 2 conflicts resolved by plan order -> sha256 6a4b164425e8; equals the expected file for {#412, #416}: True
   order 412-416-411, step 3: #411 -> git merge-file exit 2, 2 conflicts resolved by plan order -> sha256 a07ed2049044; equals the expected file for {#411, #412, #416}: True
   order 412-411-416, step 1: #412 -> git merge-file exit 0, 0 conflicts resolved by plan order -> sha256 4b3c63826b02; equals the expected file for {#412}: True
   order 412-411-416, step 2: #411 -> git merge-file exit 2, 2 conflicts resolved by plan order -> sha256 a97a4f624d7f; equals the expected file for {#411, #412}: True
   order 412-411-416, step 3: #416 -> git merge-file exit 2, 2 conflicts resolved by plan order -> sha256 a07ed2049044; equals the expected file for {#411, #412, #416}: True
   order 416-412-411, step 1: #416 -> git merge-file exit 0, 0 conflicts resolved by plan order -> sha256 e086e8a0f84b; equals the expected file for {#416}: True
   order 416-412-411, step 2: #412 -> git merge-file exit 2, 2 conflicts resolved by plan order -> sha256 6a4b164425e8; equals the expected file for {#412, #416}: True
   order 416-412-411, step 3: #411 -> git merge-file exit 2, 2 conflicts resolved by plan order -> sha256 a07ed2049044; equals the expected file for {#411, #412, #416}: True
   order 416-411-412, step 1: #416 -> git merge-file exit 0, 0 conflicts resolved by plan order -> sha256 e086e8a0f84b; equals the expected file for {#416}: True
   order 416-411-412, step 2: #411 -> git merge-file exit 2, 2 conflicts resolved by plan order -> sha256 ddd2e6a057dc; equals the expected file for {#411, #416}: True
   order 416-411-412, step 3: #412 -> git merge-file exit 2, 2 conflicts resolved by plan order -> sha256 a07ed2049044; equals the expected file for {#411, #412, #416}: True
   order 411-412-416, step 1: #411 -> git merge-file exit 2, 2 conflicts resolved by plan order -> sha256 bb114a0ae350; equals the expected file for {#411}: True
   order 411-412-416, step 2: #412 -> git merge-file exit 2, 2 conflicts resolved by plan order -> sha256 a97a4f624d7f; equals the expected file for {#411, #412}: True
   order 411-412-416, step 3: #416 -> git merge-file exit 2, 2 conflicts resolved by plan order -> sha256 a07ed2049044; equals the expected file for {#411, #412, #416}: True
   order 411-416-412, step 1: #411 -> git merge-file exit 2, 2 conflicts resolved by plan order -> sha256 bb114a0ae350; equals the expected file for {#411}: True
   order 411-416-412, step 2: #416 -> git merge-file exit 2, 2 conflicts resolved by plan order -> sha256 ddd2e6a057dc; equals the expected file for {#411, #416}: True
   order 411-416-412, step 3: #412 -> git merge-file exit 2, 2 conflicts resolved by plan order -> sha256 a07ed2049044; equals the expected file for {#411, #412, #416}: True
   every order ends in the same file: True (a07ed2049044)
```


# Brief P2-T29 fix round: the categories on today's rules, the wallet kit and real states

You are the fixer for the P2-T29 fix round. PR #423 (branch `p2/t29-categories`, commit `cee7eff5`) adds the Bun Wallet's categories, the category tray and the Thai pack tray. Its review (`reviews/P2-T29.md`, Claude Opus 5.5) says **Needs fixes**: four blockers (B1 to B4), twelve majors (M1 to M12), thirteen minors (m1 to m13) and four nits. No second review has landed. The controller ruled **R113** (quoted under the rulings).

The planner (Claude Opus 5.5) wrote every file below and proved it in a scratch copy of `cee7eff5`:
- RED on typed stubs, each failing case on an assertion;
- GREEN;
- 119 mutants, all killed, each file restored byte for byte;
- R100's fast local gate, with `export:web` (the route changed).

You copy the planner's files, check them by checksum, prove RED, GREEN and the mutants in your own worktree, run the gate, and commit. Most of the first round's code is replaced. Do exactly what this brief says.

Read first:
1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only, and no whole-suite total as an expected value. R87 applies: the round's receipt is its own new file, `docs/implementation/receipts/P2-T29-fix.md`, and `P2-T29.md` gains one line pointing to it; `premium-progress.md` is not edited.
2. The review: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T29.md`.

## Paths and rules

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t29` (branch `p2/t29-categories`, head `cee7eff5`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t29-fix`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t29-fix-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the round's thirteen files at their repo paths (eleven code and test files, and two receipts);
  - `stubs/`: the RED forms (typed stubs) of `WalletCategoriesScreen.tsx`, `CategoryTray.tsx`, `ThaiPackTray.tsx` and `categorySections.tsx`;
  - `orig/`: `cee7eff5`'s copies of the twelve files the round reads or changes; `base/`: `2ff43b0e`'s `CategoriesScreen.tsx` and route, today's code before the first round;
  - `diffs/`: one diff per changed file against `cee7eff5` (paths `a/<repo path>`, `b/<repo path>`), `CategoriesScreen.tsx` also against `2ff43b0e` (`.base.diff`: the move and nothing else), and `p2-t29-fix.patch`, the whole round;
  - `tools/`: `mutants.py` (the runner), `contrast.mjs` (the tile contrast table, run into `logs/contrast.log`), `tc_lookup.py` (a catalog line's Thai, as `tc()` finds it), `diffs.py`, `sums.py`, and `brief.py` with this brief's parts (`brief.head.md`, `rulings.md`, `steps.md`);
  - `logs/`: the planner's runs (RED, GREEN, the gate, the final mutant run `mutants.out` with `mutants.time`, and `subset.out`, the run that killed the first run's four survivors and the guards added after it); `work/` is the planner's scratch copy of `cee7eff5` with the round applied, not part of the kit;
  - `SHA256SUMS` (the kit), `SHA256SUMS.logs` (the planner's `logs/`), and three lists to check WT with `shasum -a 256 -c`, paths relative to WT:
    - `SHA256SUMS.orig-in-wt`: the twelve `cee7eff5` files, before you change anything;
    - `SHA256SUMS.red-in-wt`: the three tests from `real/` and the four stubs;
    - `SHA256SUMS.real-in-wt`: all thirteen `real/` files.
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above. Git: `/usr/bin/git -C WT <command>`, one git command per call. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`. Focused Node files: `cd WT/apps/app && npm run test:unit -- <files>`.
- **No sync merge this round.** The fix commit goes on top of `cee7eff5`. `apps/app/src/dev/catalogue/wallet/index.ts` stays the first round's (sha256 `911e4ce08ddec1143743843611b248a05b4911aa8a99e0c9f06589c6f74318ea`: KIT, STACK, TRAY, ADD, LIST, CATEGORY, LOCK). The controller merges the head in later: #411 (RECAP, merged) and #412 (RECORD) land in `index.ts` in plan order (LIST, RECORD, CATEGORY, RECAP, LOCK).
- No heavy lock is needed: no database suite and no workers pool. Docker is stopped and stays stopped.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. One exception, a load flake: a case that times out under load in a file this round does not touch. Rerun that file alone once, and record both runs.
- Every log is your own run. Never copy the planner's logs in place of one.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/screens/redesign/planning/categoryCommands.ts` | Rewritten. Today's `sendCommand`, `send`, `refused` and `tryAgain`, moved verbatim; the five points where today's `send` changed the screen's state are required host callbacks (`rebase`, `stopped`, `saved`, `changedElsewhere`, `fieldErrors`). |
| `apps/app/src/screens/redesign/planning/CategoriesScreen.tsx` | Shared. Rewritten from `2ff43b0e`: the move, the hook with the screen's own effects as its host, and three comment lines. `diffs/…CategoriesScreen.tsx.base.diff` shows nothing else. |
| `apps/app/src/screens/redesign/planning/categoryCommands.render.test.tsx` | **New**, 4 cases: the review's A1 and A2 (a failed archive closes the sheet), and two paths today's suite does not cover (mutants S4, S6). |
| `apps/app/src/wallet/categories/WalletCategoriesScreen.tsx` | Rewritten. One read (categories through `ensureBuiltinCategories`, the budget, the summary) with loading and problem states; tiles on the mode's tint; the pack card; the archived categories with Unarchive; Back; a read again whenever a tray closes. |
| `apps/app/src/wallet/categories/CategoryTray.tsx` | Rewritten. Today's rules through the hook; `budget` from the screen; the frozen Try again; locked while sending; archive as a second step; private mode; named fields, glyphs and swatches. |
| `apps/app/src/wallet/categories/ThaiPackTray.tsx` | Rewritten. Starts empty; only the picked items; the frozen Try again; locked while sending; Reload after a refusal. |
| `apps/app/src/wallet/categories/copy.ts` | Rewritten. The plan's lines, the board's names for the swatches, glyphs, fields and type group, and two drafts (`categories.tileIncome`, `categories.packAddOne`). |
| `apps/app/app/spend/categories.tsx` | The route imports the wallet screen directly, as `wallets.tsx` does. |
| `apps/app/src/dev/catalogue/wallet/categorySections.tsx` | Rewritten. The real screen, loaded when a section opens, staged by `screenSection` on the board's month in the catalogue's language and theme. |
| `apps/app/src/wallet/categories/WalletCategories.render.test.tsx` | Rewritten: 38 cases (18 before), of which 4 are carried P2-T11 cases. |
| `apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx` | Shared. Stubs the wallet screen and adds the wallet-area case for `categories.tsx`. |
| `docs/implementation/receipts/P2-T29-fix.md` | **New**: the round's receipt (R87). |
| `docs/implementation/receipts/P2-T29.md` | One line under "Notes for later tasks" pointing to the fix receipt. |

Unchanged: `apps/app/src/dev/catalogue/wallet/index.ts` (the first round's), `categoriesModel.ts`, `thaiPack.ts`, the wallet kit, the fakes and `CategoriesScreen.render.test.tsx`.

Shared files with in-flight PRs: none. #412, #411, #420 and #421 touch none of these thirteen files (`PlanningRoutes.render.test.tsx` is no other PR's; #412 edits `SpendRoutes`, #411 and #421 `InsightsRoutes`).

## Planner rulings (what this round decides, with the reason for each)

R113, the controller's ruling (12 Nov): fix every blocker, major and minor as the review proposes, unless the plan says otherwise; where the plan cannot settle a question, stop and report BLOCKED. B1: no Web Crypto global; B2: the five kit render files load (the category sections' screens load lazily); B3: every text field has a name; B4: an unconfirmed save keeps today's frozen Try again, with the same ids and keys, Save and Add disabled while unconfirmed, no second category or pack item. M1 to M12 as written; m2 (money through BigInt only) and m6 (archive) are required; the rest are fixed or ruled out with a reason.

- **P1. No sync merge; `index.ts` unchanged.**
  The controller's notes: the fix commit goes on `cee7eff5`, whose `index.ts` is the proven `911e4ce0…` (KIT, STACK, TRAY, ADD, LIST, CATEGORY, LOCK). #411 has since merged RECAP at the same lines, so #423 conflicts there. The controller resolves `index.ts` in plan order at merge time (LIST, RECORD, CATEGORY, RECAP, LOCK, with every import). This round proves no permutations.
- **P2. The moved rule keeps today's screen as it was (M1, W2).**
  - `useCategoryCommands(host)` holds today's `sendCommand`, `send`, `refused` and `tryAgain` word for word, with today's state (status, message, resendBlocked, blocked, conflict, done, unarchiving, the pending commands and the running ref).
  - The five places where today's `send` changed the screen's own state are host callbacks, each called exactly where today's line ran:
    - `rebase(draft)`: `setForm(… draft …)`;
    - `stopped()`: `setConfirming(false)`, in every catch path;
    - `saved(origin)`: the success branch's `setConfirming(false)`, `setForm(null)`, `setType` and `loaded.refresh()`;
    - `changedElsewhere()`: `setForm(null)` and `loaded.reload()`;
    - `fieldErrors(errors)`: `setForm(… errors …)`.
  - All five are required, so no caller can leave a sheet open after a failure (the review's note for later tasks).
  - `CategoriesScreen.tsx` is `2ff43b0e`'s file with the move and the host wiring only: `diffs/…CategoriesScreen.tsx.base.diff`. Its 56 cases run unchanged.
  - `categoryCommands.render.test.tsx` adds the review's A1 and A2 (a failed archive closes the sheet), and the two paths today's suite does not cover: a category changed elsewhere closes the form and reads again (mutant S4), and a refused budget after an accepted category rebases the form (S6).
  - Why: the plan says "moved unchanged" and "no behaviour change".
- **P3. One read, told when it fails (M3).**
  - The screen reads the categories through `ensureBuiltinCategories()` (as every category screen does), this month's budget and this month's summary together (`useLoad`, one `Promise.all`).
  - Loading says today's `กำลังโหลดบันทึกของคุณ`. A problem says `classifyLoadProblem`'s words, with Try again only when a retry can help.
  - Nothing of a failed read is drawn: no tiles, no ฿0, no pack card, no new button.
  - Why: M3 and checklist points 2 and 4.
- **P4. The grid reads again whenever a tray closes (M2).**
  - The plan's tray props carry no `onSaved`. A tray closes itself after every save, and the person closes it after an unconfirmed send that may have landed.
  - So `onClose` closes the tray and refreshes the screen's read in place: the grid stays while it reads, as after today's save.
  - The next opening then edits the version just saved.
- **P5. `CategoryTray` takes this month's `budget` from the screen (a deviation from the plan's props).**
  - The plan's interface (`visible`, `onClose`, `category`, `type`) has no budget, but the limit needs it. The first round read it inside the tray and added a `now` prop, which made a second copy that went stale after a save (M2 for the budget) and that reset the person's edits when it landed (m9).
  - With the screen's one read: the tiles and the tray agree; a tray opens only once the budget is known; Save checks against the latest budget, as today's `submit(form, seen)` does.
  - The session (the draft, the picked glyph, the switch) is made once when the tray opens, so a later read never resets what was typed (m9).
- **P6. The frozen Try again (B4, B1, m3; P2-T16's rule).**
  - A new category's id is made once when the tray opens, with `newId` (expo-crypto; B1). So every resend is the same category, under the same key (`useCommandKeys`).
  - Unconfirmed, a tray says today's words and offers only Try again (`tryAgain`: the same commands under the same keys), with every field disabled. There is no Save or Add.
  - The tray can be closed then (P2-T16: "the tray can be closed"), and the screen reads again. A tray opened again while its send is unconfirmed keeps its frozen draft or picks and Try again until the outcome is known; it never makes a second category or pack item.
  - Every other opening starts afresh, with no failure from the last one (m3).
- **P7. Locked only while sending (M8, Review Focus 1).**
  - Both trays pass `Tray`'s `locked` while the hook's status is `saving`.
  - Unconfirmed or refused, they can be closed.
- **P8. Tiles read 4.5:1 in both modes (M4; Global Constraints).**
  - The tile is the category's hue tinted for the mode (`tileTint(color, colors.isDark)`, the kit's rule), or `raised` with no colour. Names and amounts are `ink`: 14.14:1 or more by day, 9.70:1 or more at night (`tools/contrast.mjs`).
  - The limit line is `quietOnGround`, at 6.74:1 and 4.52:1. `quiet` measures 4.04:1 on some tints.
  - `เกิน {amount}` stays `over` (budget state, §2) on a small `card` chip, at 5.86:1 and 6.77:1. On the tints `over` measures 4.18 to 4.38:1 for six hues (#4E93D9, #9B7EDB by day; #F2CE5C, #9CD4F5, #D3C2F2, #D6EE8A at night).
  - The test computes every tile word's contrast against what it sits on, in both modes.
  - The trays' preview, swatches and the pack's glyph tiles take the mode's tint too.
- **P9. The tile composes the kit's parts, not `WalletCategoryIcon` (m4).**
  - The kit's icon draws its glyph at half its square: the board's 22 pt glyph needs a 44 pt square, and with the three lines that passes the plan's 104 pt tile. So the tile draws the same parts on its own tint: `iconOf`, `CategoryGlyph` at 22 pt, else `categoryInitial` (which skips a leading Thai vowel).
  - `WalletCategoryIcon` is used where the boards draw a square tile: the pack tray's rows (42 pt) and the archived rows (36 pt).
- **P10. Private mode leaks nothing in the trays (M9, W10, R106).**
  - The budget in the hint, the total and the over-total refusal (as typed and when saving) read `฿••••`.
  - A stored limit is masked in its field (empty, with `••••`) until a key is pressed, as R106 masks an amount the person did not type. What the person types shows.
  - Each tile says only that its amount is hidden.
- **P11. Problems in words (M10, m1).**
  - Today's catalog lines, through `tc()`: the over-total refusal (`categoriesModel`'s `overTotalText` wording, with the tray's own amounts so private mode can mask them), `LIMIT_PROBLEM_TEXT` and `LABEL_PROBLEM_TEXT`.
  - When, as today's screen does: a name too long or not one line, and a limit over the budget, as they are typed; an empty name and a mistyped amount when saving. A field's problem goes as it is edited.
  - The refusal differs from the total line in words, not only colour (m1).
  - Problem lines are `ink` with an alert role: red and green are only for budget state (§2).
- **P12. Archive and unarchive (m6, required by R113).**
  - The tray's edit offers today's `เก็บหมวดหมู่ถาวร`, which asks first as the tray's second step: today's question and consequence, `tc()` lines, with Back.
  - The grid lists the archived categories of the type shown, each with today's `นำกลับมาใช้` (named `นำ {name} กลับมาใช้`), through the same hook.
  - Why: the plan's Consumes lists `archiveCommand` (both kinds) and `groupCategories`, whose `archived` group is there to show. `categories.packNote` promises archiving, and today's consequence line says "you can unarchive it here any time".
  - No board draws either, so both are drafts for E2-C.
- **P13. The catalogue (B2, M11).**
  - One file, as `walletListSections.tsx` (P2-T20) does: the screen module loads when a section opens (`lazy()`), so the wallet catalogue's list never loads `screens/v1/parts.tsx` (expo-crypto) or expo-router. The eight render files that read the list load again (B2).
  - `screenSection` stages each section in the catalogue's own language and theme: no `LanguageProvider` or `ThemeProvider` of its own (M11).
  - The fixture is the board's month: per-category totals on top of the fakes, whose summary keeps none (the shared fake is not changed); one tile ฿310 over; ครอบครัว's heart kept for a catalogue account of its own; ทำบุญ held, so the pack card names the rest.
  - Scripts open the trays by test id, so they work in every language.
- **P14. The route and its test.**
  - `categories.tsx` imports the wallet screen directly, as `wallets.tsx` (P2-T20) does.
  - `PlanningRoutes.render.test.tsx` stubs it, as it stubs its other screens, and adds the wallet-area case (the controller's rule 1). Unstubbed, the file fails to load ("SyntaxError: Unexpected token 'typeof'"; seen in the planner's run).
  - The route changed, so `typecheck:routes` and `export:web` are in the gate.
- **P15. Names, never keys (M5, M6, m8).**
  - The swatches are named สีส้มพีช, สีฟ้า, สีม่วงอ่อน, สีชมพู, สีเหลือง, สีเทาฟ้า, สีเทาม่วง, and the glyphs by the board's twelve names, all in the draft table.
  - A built-in's tray is titled and its field placeheld with `draftName`'s name (อาหาร), never its key.
- **P16. Back (M7).** `useGoBack('/spend/budget')`, today's: back, or Budget when there is nothing to go back to. The screen's props stay the plan's `{ now?: Date }`.
- **P17. Fields are named (B3).** The name and limit fields carry `accessibilityLabel` (ชื่อหมวด, วงเงินต่อเดือน). Their visible captions are decorative, as P2-T14's merchant field does.
- **P18. AX5 (m5).**
  - Tiles have a minimum height of 104 pt and grow with their words. At the largest text sizes each tile takes a row of its own.
  - Fields have a minimum height of 44 pt and no fixed height. Nothing sets `numberOfLines`.
- **P19. The pack card (m7) and the pack tray (n1, R2, R3).**
  - The card follows the plan's binding: it shows on either tab while any of C3's nine is missing.
  - The names are joined as the board joins them (a space in Thai; a comma in the English drafts), with `categories.packMore` only when more remain.
  - The tray's picks start empty (the first round's accepted P5). A row the person has is disabled and says มีแล้ว. Add creates only the picked, still missing items, in C3's order and the person's language.
  - After a refusal the tray offers Reload, not Add: a refused send may have added some items, and the read after closing marks them มีแล้ว, so none is added twice.
- **P20. Icons (m10, followups).**
  - An icon is kept only once Jotbun has accepted the category, and only when the picked glyph differs from what the category already shows. An icon-only change sends nothing and is kept at once.
  - With no account open (the web, opening, locked or signed out) nothing could be kept, so the icon picker is not offered. This is P2-T20's rule for จัดเรียง and settles the followup for P2-T21 and P2-T29. A setter's promise resolves either way; nothing waits on it.
- **P21. Income tiles (m11).** Money in: `categories.tileIncome` ({name} ได้รับ {amount}), with no limit line, since limits are spending only. It is a draft for E2-C.
- **P22. Money (m2).** Satang strings through BigInt only: spending against a limit (`BigInt`), `editCategoryDraft`'s `minorToInputText` for a stored limit, and `walletMoneyText` and `spokenMoney` for words. No `Number(...)` touches an amount. Spending equal to its limit is not over (R4; budgetPace's rule).
- **P23. Copy (m7, n3).**
  - The draft table holds the plan's lines and the board's names. Lines already in the catalogs are read through `tc()`: เพิ่มหมวดนี้, บันทึกการแก้ไข, เก็บหมวดหมู่ถาวร, the archive question and consequence, นำกลับมาใช้, เก็บถาวรแล้ว, the load, save and refusal words, and the no-budget line.
  - The first round's unused keys are gone. `categories.packAddOne` fixes "Add 1 categories"; "Built-ins" is now "Built-in categories".
- **P24. Guards and mutants (M12, m12).**
  - Each guard has a mutant: 119 in `tools/mutants.py`, every one killed in the planner's final run (`logs/mutants.out`). The review's R1 to R6 are W10, P1, P2, W3, T14 and the R5 and R6 case.
  - The planner's first full run left four alive, each a gap in the tests, not the code: S4 and S6 (paths of today's screen that its own suite never reaches; now the hook file's two extra cases), P3 (the pack's first picks, seen only when a host mounts the tray already open) and P9 (the singular Add line, which only English tells apart). Each gained its case. `logs/subset.out` shows them killed, with C3 (whose first form did not parse) and the 29 mutants added after an audit of every remaining guard.
  - Guards that the controls' `disabled` and `busy`, and the hook's `running` ref, already enforce are not repeated in handlers, so no guard is untestable.
  - The four P2-T11 cases (followups: its m2 and n5; RV1, RV2, RV3, RV4 and RV4s) are carried and counted apart. They hold the kit's glyph and initial, not this round's screens.
- **P25. Nits.**
  - n2: the unused names go with the rewrite.
  - n4: text uses the kit's roles only (h1, h2, label, caption) and amounts `WalletAmount`'s sizes (13). The board's 14 pt name and 12 pt line take the nearest roles, label (15) and caption (13).
- **P26. The receipts (m13, R87).**
  - `P2-T29-fix.md` is new. It records what the first round's receipt missed: the routes' 12 against an Expected 11; that the first round's gate skipped `test:unit` and the eight render files, which is how B1 and B2 reached CI; and the risks.
  - `P2-T29.md` gains one line pointing to it.
- **P27. Flash's second review** (`reviews/P2-T29-second.md`) had not landed when this brief was written, so nothing is folded in.
- **P28. Commit summary:** `Rebuild the Bun Wallet categories on today's rules and the wallet kit`.

## Step 1: Check the base

1. `/usr/bin/git -C WT status --short` prints nothing, and `/usr/bin/git -C WT rev-parse --short HEAD` prints `cee7eff5`. Otherwise report BLOCKED.
2. `mkdir -p S`, then `cd WT && shasum -a 256 -c PL/SHA256SUMS.orig-in-wt` (type full paths). Expected: 12 `OK` lines, exit 0.
3. `ls WT/node_modules WT/apps/app/node_modules > /dev/null; echo $?`. Expected: 0. Only if it is not 0: `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?`, Expected: 0.
4. `ls WT/apps/app/src/screens/redesign/planning/categoryCommands.render.test.tsx WT/docs/implementation/receipts/P2-T29-fix.md` says "No such file or directory" for both.

## Step 2: The tests first, and RED on the typed stubs

1. Copy the three test files and the four stubs:
   ```bash
   cp PL/real/apps/app/src/wallet/categories/WalletCategories.render.test.tsx WT/apps/app/src/wallet/categories/WalletCategories.render.test.tsx
   cp PL/real/apps/app/src/screens/redesign/planning/categoryCommands.render.test.tsx WT/apps/app/src/screens/redesign/planning/categoryCommands.render.test.tsx
   cp PL/real/apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx WT/apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx
   cp PL/stubs/apps/app/src/wallet/categories/WalletCategoriesScreen.tsx WT/apps/app/src/wallet/categories/WalletCategoriesScreen.tsx
   cp PL/stubs/apps/app/src/wallet/categories/CategoryTray.tsx WT/apps/app/src/wallet/categories/CategoryTray.tsx
   cp PL/stubs/apps/app/src/wallet/categories/ThaiPackTray.tsx WT/apps/app/src/wallet/categories/ThaiPackTray.tsx
   cp PL/stubs/apps/app/src/dev/catalogue/wallet/categorySections.tsx WT/apps/app/src/dev/catalogue/wallet/categorySections.tsx
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.red-in-wt`. Expected: seven `OK` lines, exit 0.
   At RED, `categoryCommands.ts`, `CategoriesScreen.tsx`, `copy.ts` and the route are still the first round's: the new hook cases fail on its hook, and the new route case on its lazy route.
2. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: 0.
3. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/categories/WalletCategories.render.test.tsx > S/red-wallet.log 2>&1; echo $?`. Expected:
   - exit 1, `Test Files  1 failed (1)`, `Tests  33 failed | 5 passed (38)`;
   - `grep -c '^AssertionError' S/red-wallet.log` gives 33;
   - `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function|TestingLibraryElementError' S/red-wallet.log` gives 0.

   The 33 failing cases, each on an assertion (the stub draws nothing, so most fail at their first asserting lookup):
   - `the grid shows each category's spending against its limit, over in the over colour`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `the pack card names the first three missing C3 items`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `the pack tray adds only the picked missing items, and marks the ones the person has`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `a new category keeps its icon for the account only after Jotbun accepted it`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `a limit that would pass the month's budget is refused in words`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `private mode hides the tiles' amounts`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `every glyph, swatch and checkbox is at least 44 pt and named`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `B4: an unconfirmed save keeps the frozen Try again, with the same id and key, and makes no second category`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `B4: an unconfirmed pack add keeps Try again with the same ids and keys, and adds nothing twice`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `M8: a tray that is saving cannot be closed, and the save still lands`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `M2: the screen reads again after a save, so a second change sends the new version`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `M3: a read that fails says so with Try again, and shows no grid, no pack card and no new`: `AssertionError: categories-problem: expected 0 to be greater than 0`
   - `M4: in dark mode the trays draw on the mode: tints for the preview, the swatches and the pack glyphs`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `M5 and M6: names, never keys: the swatches by colour, a built-in's tray by its name`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `M7: Back goes back, or to Budget when there is nothing to go back to`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `M9: private mode leaks no amount in the category tray`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `M10: problems with a field are said in words, never a code`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `M11: a catalogue section draws in the catalogue's language and theme`: `AssertionError: bw-categories: expected undefined to be defined`
   - `M12: the catalogue's four sections are wallet screens, in the plan's order`: `AssertionError: expected [] to deeply equal [ 'bw-categories', …(3) ]`
   - `m3: a new opening shows no failure from the last one`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `m6: archive asks first, and an archived category comes back with Unarchive`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `R5 and R6: the type is chosen for a new category only, and a changed limit replaces the old one`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `m10 and the followup: an icon is kept only when it changes, and only with an account`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `m11: income tiles say what came in, never a limit`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `m5: at AX5 each tile takes a row, grows with its words, and nothing is clamped`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `the trays mount on their own with the plan's props`: `AssertionError: a heading named หมวดใหม่: expected undefined to be defined`
   - `a change made elsewhere says so, and Reload closes the tray so the grid reads again`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `the limit switch: off removes the limit, and a month with no budget says why there is none`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `a later refusal keeps what was accepted: the field says why, and saving again sends only what is left`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `m6: unarchive is one at a time, keeps Try again when unconfirmed, and says a change made elsewhere`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `blocked (an update is needed): the trays and Unarchive wait, and say why`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `a pack add that meets its own id with other fields says so, and the next opening starts clean`: `AssertionError: categories-builtins: expected 0 to be greater than 0`
   - `m6: the archive question cannot be left while it sends`: `AssertionError: categories-builtins: expected 0 to be greater than 0`

   The 5 that pass hold what the first round already had: the four carried P2-T11 cases (`P2-T11 m2 (RV1)…`, `(RV2)…`, `P2-T11 n5 (RV3)…`, `(RV4, RV4s)…`) and `the draft table holds the plan's Thai lines`.
4. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/screens/redesign/planning/categoryCommands.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx > S/red-hook-routes.log 2>&1; echo $?`. Expected:
   - exit 1, `Test Files  2 failed (2)`, `Tests  3 failed | 6 passed (9)`;
   - `grep -c '^AssertionError' S/red-hook-routes.log` gives 3;
   - `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function|TestingLibraryElementError' S/red-hook-routes.log` gives 0.

   The 3 failing cases, each on an assertion:
   - `in the wallet area categories.tsx shows the Bun Wallet categories with the shared resources, and the legacy build still goes back to Home`: `AssertionError: expected null not to be null`
   - `an archive that is not confirmed closes the sheet and offers Try again`: `AssertionError: the archive sheet closes: expected <div …(4)><div …(1)>…(1)</div></div> to be null`
   - `an archive that is refused closes the sheet and says why`: `AssertionError: the archive sheet closes: expected <div …(4)><div …(1)>…(1)</div></div> to be null`

   The 6 that pass: the four routes cases from before, and the hook's `a category changed on another device closes the form, says so, and reads the grid again` and `once the category is accepted and the budget refused, saving again sends only the budget` (paths the first round kept; they kill the new code's mutants S4 and S6).

   Compare with `PL/logs/red-wallet.log` and `PL/logs/red-hook-routes.log`.

## Step 3: GREEN

1. Copy the code, the catalogue sections and the receipts:
   ```bash
   cp PL/real/apps/app/src/screens/redesign/planning/categoryCommands.ts WT/apps/app/src/screens/redesign/planning/categoryCommands.ts
   cp PL/real/apps/app/src/screens/redesign/planning/CategoriesScreen.tsx WT/apps/app/src/screens/redesign/planning/CategoriesScreen.tsx
   cp PL/real/apps/app/src/wallet/categories/WalletCategoriesScreen.tsx WT/apps/app/src/wallet/categories/WalletCategoriesScreen.tsx
   cp PL/real/apps/app/src/wallet/categories/CategoryTray.tsx WT/apps/app/src/wallet/categories/CategoryTray.tsx
   cp PL/real/apps/app/src/wallet/categories/ThaiPackTray.tsx WT/apps/app/src/wallet/categories/ThaiPackTray.tsx
   cp PL/real/apps/app/src/wallet/categories/copy.ts WT/apps/app/src/wallet/categories/copy.ts
   cp PL/real/apps/app/app/spend/categories.tsx WT/apps/app/app/spend/categories.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/categorySections.tsx WT/apps/app/src/dev/catalogue/wallet/categorySections.tsx
   cp PL/real/docs/implementation/receipts/P2-T29-fix.md WT/docs/implementation/receipts/P2-T29-fix.md
   cp PL/real/docs/implementation/receipts/P2-T29.md WT/docs/implementation/receipts/P2-T29.md
   ```
   Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.real-in-wt`. Expected: thirteen `OK` lines, exit 0.
   Then `/usr/bin/git -C WT status --short`. Expected, in any order:
   ```
    M apps/app/app/spend/categories.tsx
    M apps/app/src/dev/catalogue/wallet/categorySections.tsx
    M apps/app/src/screens/redesign/planning/CategoriesScreen.tsx
    M apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx
    M apps/app/src/screens/redesign/planning/categoryCommands.ts
    M apps/app/src/wallet/categories/CategoryTray.tsx
    M apps/app/src/wallet/categories/ThaiPackTray.tsx
    M apps/app/src/wallet/categories/WalletCategories.render.test.tsx
    M apps/app/src/wallet/categories/WalletCategoriesScreen.tsx
    M apps/app/src/wallet/categories/copy.ts
    M docs/implementation/receipts/P2-T29.md
   ?? apps/app/src/screens/redesign/planning/categoryCommands.render.test.tsx
   ?? docs/implementation/receipts/P2-T29-fix.md
   ```
2. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: 0.
3. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/categories/WalletCategories.render.test.tsx > S/green-wallet.log 2>&1; echo $?`. Expected: 0, `Test Files  1 passed (1)`, `Tests  38 passed (38)`.
4. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/screens/redesign/planning/categoryCommands.render.test.tsx src/screens/redesign/planning/CategoriesScreen.render.test.tsx > S/green-hook.log 2>&1; echo $?`. Expected: 0, `Test Files  2 passed (2)`, `Tests  60 passed (60)` (the hook's 4 and today's 56, unchanged).

   Compare with `PL/logs/green-wallet.log` and `PL/logs/green-hook.log`.

## Step 4: Mutation check

Run the 119 mutants:
```bash
python3 -I PL/tools/mutants.py WT S/mutant-logs > S/mutants.out; echo $?
```
Expected: 0, taking about 15 minutes.
`tail -1 S/mutants.out` prints `119 killed, 0 survived, 0 not as expected`, and every line before it says `KILLED` and `restored sha256 equal`.
Then `cd WT && shasum -a 256 -c PL/SHA256SUMS.real-in-wt`. Expected: thirteen `OK` lines: every file is back as it was.

Every mutant killed and restored byte for byte (the planner's run; a mutant's first failing case and counts are as below):
```
H1 KILLED: a send that stops short never tells its host (M1) -> m6: archive asks first, and an archived category comes back with Unarchive [categoryCommands.ts; Tests 3 failed | 95 passed (98); AssertionError x3; restored sha256 equal]
H2 KILLED: a later refusal never rebases the draft -> once the category is accepted and the budget refused, saving again sends only the budget [categoryCommands.ts; Tests 2 failed | 96 passed (98); AssertionError x2; restored sha256 equal]
H3 KILLED: every command acknowledged, and the host never told -> the pack tray adds only the picked missing items, and marks the ones the person has [categoryCommands.ts; Tests 26 failed | 72 passed (98); AssertionError x11; restored sha256 equal]
H4 KILLED: a change made elsewhere is not told -> a change made elsewhere says so, and Reload closes the tray so the grid reads again [categoryCommands.ts; Tests 2 failed | 96 passed (98); AssertionError x2; restored sha256 equal]
H5 KILLED: a refusal of the draft's fields is not told -> a later refusal keeps what was accepted: the field says why, and saving again sends only what is left [categoryCommands.ts; Tests 2 failed | 96 passed (98); AssertionError x1; restored sha256 equal]
S1 KILLED: the archive sheet stays open after a failed send (M1) -> an archive that is not confirmed closes the sheet and offers Try again [CategoriesScreen.tsx; Tests 2 failed | 96 passed (98); AssertionError x2; restored sha256 equal]
S2 KILLED: the grid is not read again after a save -> creating: a name, a colour from the palette and a limit, with a live chip preview; Add this category sends one create, then the limit [CategoriesScreen.tsx; Tests 15 failed | 83 passed (98); AssertionError x1; restored sha256 equal]
S3 KILLED: the type just saved is not shown -> creating an income category: the type is chosen in the form, and income has no limit [CategoriesScreen.tsx; Tests 1 failed | 97 passed (98); AssertionError x0; restored sha256 equal]
S4 KILLED: a change made elsewhere keeps the stale form -> a category changed on another device closes the form, says so, and reads the grid again [CategoriesScreen.tsx; Tests 1 failed | 97 passed (98); AssertionError x1; restored sha256 equal]
S5 KILLED: a refusal of the fields is not shown beside them -> a definite refusal unfreezes the form, and the corrected save is a new command with a new key [CategoriesScreen.tsx; Tests 1 failed | 97 passed (98); AssertionError x0; restored sha256 equal]
S6 KILLED: the open form never rebased -> once the category is accepted and the budget refused, saving again sends only the budget [CategoriesScreen.tsx; Tests 1 failed | 97 passed (98); AssertionError x1; restored sha256 equal]
W1 KILLED: the categories read without ensureBuiltinCategories (M3) -> M8: a tray that is saving cannot be closed, and the save still lands [WalletCategoriesScreen.tsx; Tests 4 failed | 34 passed (38); AssertionError x4; restored sha256 equal]
W2 KILLED: nothing read again after a tray closes (M2) -> the pack tray adds only the picked missing items, and marks the ones the person has [WalletCategoriesScreen.tsx; Tests 7 failed | 31 passed (38); AssertionError x7; restored sha256 equal]
W3 KILLED: spending equal to its limit counts as over (R4) -> the grid shows each category's spending against its limit, over in the over colour [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W4 KILLED: the over line on the tint, not on a card chip (M4) -> the grid shows each category's spending against its limit, over in the over colour [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W5 KILLED: the tile's light tint in dark mode (M4) -> the grid shows each category's spending against its limit, over in the over colour [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W6 KILLED: the limit line in quiet, 4.04:1 on a tint (M4) -> the grid shows each category's spending against its limit, over in the over colour [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W7 KILLED: private mode: a tile speaks its amounts -> private mode hides the tiles' amounts [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W8 KILLED: private mode: the limit and over lines show amounts -> private mode hides the tiles' amounts [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W9 KILLED: an income tile draws a limit line (m11) -> m11: income tiles say what came in, never a limit [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W10 KILLED: the pack card names one missing item, not three (R1) -> the pack card names the first three missing C3 items [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W11 KILLED: the pack card says และอีก 0 หมวด -> the pack card names the first three missing C3 items [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W12 KILLED: the pack card with nothing missing -> the pack card names the first three missing C3 items [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W13 KILLED: the Thai names joined with commas (m7) -> the pack card names the first three missing C3 items [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W14 KILLED: Try again for a problem a retry cannot fix -> M3: a read that fails says so with Try again, and shows no grid, no pack card and no new [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W15 KILLED: Back with nothing to go back to goes Home, not to Budget (M7) -> M7: Back goes back, or to Budget when there is nothing to go back to [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W16 KILLED: three tiles to a row at AX5 (m5) -> m5: at AX5 each tile takes a row, grows with its words, and nothing is clamped [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W17 KILLED: a fixed tile height (m5) -> m5: at AX5 each tile takes a row, grows with its words, and nothing is clamped [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W18 KILLED: new offered before the read (M3) -> M3: a read that fails says so with Try again, and shows no grid, no pack card and no new [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W19 KILLED: the archived categories never shown (m6) -> m6: archive asks first, and an archived category comes back with Unarchive [WalletCategoriesScreen.tsx; Tests 4 failed | 34 passed (38); AssertionError x4; restored sha256 equal]
W20 KILLED: Unarchive sends an archive (m6) -> m6: archive asks first, and an archived category comes back with Unarchive [WalletCategoriesScreen.tsx; Tests 3 failed | 35 passed (38); AssertionError x3; restored sha256 equal]
W21 KILLED: an unarchived category is not read again (m6) -> m6: archive asks first, and an archived category comes back with Unarchive [WalletCategoriesScreen.tsx; Tests 2 failed | 36 passed (38); AssertionError x2; restored sha256 equal]
W22 KILLED: the income segment shows spending -> m11: income tiles say what came in, never a limit [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W23 KILLED: the pack tray never told what the person has (R3) -> the pack tray adds only the picked missing items, and marks the ones the person has [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W24 KILLED: the tray never given the month's budget -> a limit that would pass the month's budget is refused in words [WalletCategoriesScreen.tsx; Tests 9 failed | 29 passed (38); AssertionError x9; restored sha256 equal]
W25 KILLED: loading never said (M3) -> M3: a read that fails says so with Try again, and shows no grid, no pack card and no new [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W26 KILLED: a failed read never said (M3) -> M3: a read that fails says so with Try again, and shows no grid, no pack card and no new [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W27 KILLED: Unarchive offered while blocked -> blocked (an update is needed): the trays and Unarchive wait, and say why [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W28 KILLED: several unarchives at once -> m6: unarchive is one at a time, keeps Try again when unconfirmed, and says a change made elsewhere [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W29 KILLED: no Try again for an unconfirmed unarchive (B4) -> m6: unarchive is one at a time, keeps Try again when unconfirmed, and says a change made elsewhere [WalletCategoriesScreen.tsx; Tests 2 failed | 36 passed (38); AssertionError x2; restored sha256 equal]
W30 KILLED: an unarchive changed elsewhere offers no Reload -> m6: unarchive is one at a time, keeps Try again when unconfirmed, and says a change made elsewhere [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W31 KILLED: a tile with no colour on the card, not raised -> the grid shows each category's spending against its limit, over in the over colour [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W32 KILLED: a short last row stretches its tiles -> the grid shows each category's spending against its limit, over in the over colour [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
W33 KILLED: the screen's segments never stack at AX5 (m5) -> m5: at AX5 each tile takes a row, grows with its words, and nothing is clamped [WalletCategoriesScreen.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T1 KILLED: a new id from the Web Crypto global, which Hermes lacks (B1) -> no app code reaches for the Web Crypto global, which Hermes lacks [CategoryTray.tsx; Tests 1 failed | 0 passed (1); AssertionError x1; restored sha256 equal]
T2 KILLED: an unconfirmed draft dropped when the tray opens again (B4) -> B4: an unconfirmed save keeps the frozen Try again, with the same id and key, and makes no second category [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T3 KILLED: Save offered while unconfirmed (B4) -> B4: an unconfirmed save keeps the frozen Try again, with the same id and key, and makes no second category [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T4 KILLED: the name editable while unconfirmed (B4) -> B4: an unconfirmed save keeps the frozen Try again, with the same id and key, and makes no second category [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T5 KILLED: the tray not locked while it saves (M8) -> M8: a tray that is saving cannot be closed, and the save still lands [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T6 KILLED: the icon kept before Jotbun accepts the category (the plan) -> a new category keeps its icon for the account only after Jotbun accepted it [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T7 KILLED: an unchanged glyph kept as an icon (m10) -> m10 and the followup: an icon is kept only when it changes, and only with an account [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T8 KILLED: the icon picker offered with no account (followup) -> m10 and the followup: an icon is kept only when it changes, and only with an account [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T9 KILLED: private mode: the stored limit shows in its field (M9) -> M9: private mode leaks no amount in the category tray [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T10 KILLED: private mode: the budget, the total and the refusal show amounts (M9) -> M9: private mode leaks no amount in the category tray [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T11 KILLED: the refusal in the total's words (m1) -> a limit that would pass the month's budget is refused in words [CategoryTray.tsx; Tests 2 failed | 36 passed (38); AssertionError x2; restored sha256 equal]
T12 KILLED: Save's problems never said (M10) -> M10: problems with a field are said in words, never a code [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T13 KILLED: a name too long not said as it is typed (M10) -> M10: problems with a field are said in words, never a code [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T14 KILLED: the type offered when editing (R5) -> R5 and R6: the type is chosen for a new category only, and a changed limit replaces the old one [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T15 KILLED: a built-in's placeholder is its key (M6) -> M5 and M6: names, never keys: the swatches by colour, a built-in's tray by its name [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T16 KILLED: the swatches named by their keys (M5) -> every glyph, swatch and checkbox is at least 44 pt and named [CategoryTray.tsx; Tests 6 failed | 32 passed (38); AssertionError x6; restored sha256 equal]
T17 KILLED: the glyphs named by their keys (m8) -> a new category keeps its icon for the account only after Jotbun accepted it [CategoryTray.tsx; Tests 4 failed | 34 passed (38); AssertionError x4; restored sha256 equal]
T18 KILLED: the preview's light tint in dark mode (M4) -> M4: in dark mode the trays draw on the mode: tints for the preview, the swatches and the pack glyphs [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T19 KILLED: the swatches' light tints in dark mode (M4) -> M4: in dark mode the trays draw on the mode: tints for the preview, the swatches and the pack glyphs [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T20 KILLED: no way back from the archive question (m6) -> m6: archive asks first, and an archived category comes back with Unarchive [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T21 KILLED: archive sends an unarchive (m6) -> m6: archive asks first, and an archived category comes back with Unarchive [CategoryTray.tsx; Tests 2 failed | 36 passed (38); AssertionError x2; restored sha256 equal]
T22 KILLED: a new opening shows the last one's failure (m3) -> m3: a new opening shows no failure from the last one [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T23 KILLED: a draft changed elsewhere still offers Save -> a change made elsewhere says so, and Reload closes the tray so the grid reads again [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T24 KILLED: a version conflict still offers Save -> a change made elsewhere says so, and Reload closes the tray so the grid reads again [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T25 KILLED: the limit switch off keeps the limit -> the limit switch: off removes the limit, and a month with no budget says why there is none [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T26 KILLED: the name field unnamed (B3) -> a new category keeps its icon for the account only after Jotbun accepted it [CategoryTray.tsx; Tests 11 failed | 27 passed (38); AssertionError x11; restored sha256 equal]
T27 KILLED: the limit field unnamed (B3) -> a limit that would pass the month's budget is refused in words [CategoryTray.tsx; Tests 7 failed | 31 passed (38); AssertionError x7; restored sha256 equal]
T28 KILLED: private mode: Save says planSave's refusal, with amounts (M9) -> M9: private mode leaks no amount in the category tray [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T29 KILLED: no word when the month has no budget -> the limit switch: off removes the limit, and a month with no budget says why there is none [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T30 KILLED: the tray never rebased: an accepted category sent again -> a later refusal keeps what was accepted: the field says why, and saving again sends only what is left [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T31 KILLED: a refusal of the fields not said beside them -> a later refusal keeps what was accepted: the field says why, and saving again sends only what is left [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T32 KILLED: a failed archive stays on its question (M1, as the sheet) -> m6: archive asks first, and an archived category comes back with Unarchive [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T33 KILLED: the glyphs pickable while unconfirmed (B4) -> B4: an unconfirmed save keeps the frozen Try again, with the same id and key, and makes no second category [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T34 KILLED: the swatches pickable while unconfirmed (B4) -> B4: an unconfirmed save keeps the frozen Try again, with the same id and key, and makes no second category [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T35 KILLED: the type changeable while unconfirmed (B4) -> B4: an unconfirmed save keeps the frozen Try again, with the same id and key, and makes no second category [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T37 KILLED: a conflict stays for the next opening (m3) -> a change made elsewhere says so, and Reload closes the tray so the grid reads again [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T38 KILLED: Save not busy while it sends -> M8: a tray that is saving cannot be closed, and the save still lands [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T39 KILLED: a budget with 100 limits refused in the wrong words -> M10: problems with a field are said in words, never a code [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T40 KILLED: Save offered while blocked -> blocked (an update is needed): the trays and Unarchive wait, and say why [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T41 KILLED: Archive offered while blocked -> blocked (an update is needed): the trays and Unarchive wait, and say why [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T42 KILLED: the tray's segments never stack at AX5 (m5) -> m5: at AX5 each tile takes a row, grows with its words, and nothing is clamped [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T43 KILLED: a total with no limit typed -> every glyph, swatch and checkbox is at least 44 pt and named [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T44 KILLED: a name problem stays as it is typed (M10) -> M10: problems with a field are said in words, never a code [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T45 KILLED: a limit problem stays when the type changes -> M10: problems with a field are said in words, never a code [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T46 KILLED: a new category titled as a name -> the trays mount on their own with the plan's props [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T47 KILLED: Back while the archive sends -> m6: the archive question cannot be left while it sends [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T48 KILLED: the archive link on a stale draft -> a change made elsewhere says so, and Reload closes the tray so the grid reads again [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T49 KILLED: the archive link while a save is out -> M2: the screen reads again after a save, so a second change sends the new version [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T50 KILLED: a new category's swatch not shown as chosen -> every glyph, swatch and checkbox is at least 44 pt and named [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
T36 KILLED: the limit switch usable while unconfirmed (B4) -> B4: an unconfirmed save keeps the frozen Try again, with the same id and key, and makes no second category [CategoryTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
P1 KILLED: every missing item created, not only the picked (the plan) -> the pack tray adds only the picked missing items, and marks the ones the person has [ThaiPackTray.tsx; Tests 2 failed | 36 passed (38); AssertionError x2; restored sha256 equal]
P2 KILLED: a row the person has can be picked (R3) -> the pack tray adds only the picked missing items, and marks the ones the person has [ThaiPackTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
P3 KILLED: every item picked at first (n1) -> the trays mount on their own with the plan's props [ThaiPackTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
P4 KILLED: an unconfirmed add dropped when the tray opens again (B4) -> B4: an unconfirmed pack add keeps Try again with the same ids and keys, and adds nothing twice [ThaiPackTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
P5 KILLED: Add offered while unconfirmed (B4) -> B4: an unconfirmed pack add keeps Try again with the same ids and keys, and adds nothing twice [ThaiPackTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
P6 KILLED: the pack tray not locked while it adds (M8) -> M8: a tray that is saving cannot be closed, and the save still lands [ThaiPackTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
P7 KILLED: a refused add offers Add again -> a change made elsewhere says so, and Reload closes the tray so the grid reads again [ThaiPackTray.tsx; Tests 3 failed | 35 passed (38); AssertionError x3; restored sha256 equal]
P8 KILLED: the items named in Thai in every language -> the pack tray adds only the picked missing items, and marks the ones the person has [ThaiPackTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
P9 KILLED: one item said as เพิ่ม 1 หมวด in the plural line -> the pack tray adds only the picked missing items, and marks the ones the person has [ThaiPackTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
P10 KILLED: a row the person has is not marked มีแล้ว -> the pack tray adds only the picked missing items, and marks the ones the person has [ThaiPackTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
P11 KILLED: a new opening shows the last add's failure (m3) -> a change made elsewhere says so, and Reload closes the tray so the grid reads again [ThaiPackTray.tsx; Tests 2 failed | 36 passed (38); AssertionError x2; restored sha256 equal]
P12 KILLED: Add with nothing picked -> the pack tray adds only the picked missing items, and marks the ones the person has [ThaiPackTray.tsx; Tests 2 failed | 36 passed (38); AssertionError x2; restored sha256 equal]
P13 KILLED: a conflict stays for the next opening (m3) -> a pack add that meets its own id with other fields says so, and the next opening starts clean [ThaiPackTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
P14 KILLED: the rows pickable after a refusal -> a change made elsewhere says so, and Reload closes the tray so the grid reads again [ThaiPackTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
P15 KILLED: Add offered while blocked -> blocked (an update is needed): the trays and Unarchive wait, and say why [ThaiPackTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
P16 KILLED: a picked item the person now has is still added -> the trays mount on their own with the plan's props [ThaiPackTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
P17 KILLED: Add not busy while it sends -> M8: a tray that is saving cannot be closed, and the save still lands [ThaiPackTray.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
R1 KILLED: the wallet area shows the Bun diary screen -> in the wallet area categories.tsx shows the Bun Wallet categories with the shared resources, and the legacy build still goes back to Home [categories.tsx; Tests 1 failed | 4 passed (5); AssertionError x1; restored sha256 equal]
R2 KILLED: the legacy build opens a redesign screen -> 2: the screen only under the planning area (on since E2 checkpoint 2), with the shared resources [categories.tsx; Tests 2 failed | 3 passed (5); AssertionError x1; restored sha256 equal]
R3 KILLED: the wallet area needs the planning area -> in the wallet area categories.tsx shows the Bun Wallet categories with the shared resources, and the legacy build still goes back to Home [categories.tsx; Tests 1 failed | 4 passed (5); AssertionError x1; restored sha256 equal]
C1 KILLED: the screen loaded with the wallet catalogue's list (B2) [categorySections.tsx; Tests no tests; AssertionError x0; restored sha256 equal]
C2 KILLED: a section in Thai whatever the catalogue's language (M11) -> M11: a catalogue section draws in the catalogue's language and theme [categorySections.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
C3 KILLED: the board's month without its spending (M11: ฿0 everywhere) -> M11: a catalogue section draws in the catalogue's language and theme [categorySections.tsx; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
C4 KILLED: the sections left out of the catalogue (M12) -> M12: the catalogue's four sections are wallet screens, in the plan's order [index.ts; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
Y1 KILLED: the plan's และอีก {n} หมวด changed -> the draft table holds the plan's Thai lines [copy.ts; Tests 1 failed | 37 passed (38); AssertionError x1; restored sha256 equal]
119 killed, 0 survived, 0 not as expected
```

## Step 5: The fast local gate (R100)

1. `cd WT && npm run typecheck:app > S/gate-typecheck.log 2>&1; echo $?`. Expected: 0.
2. `cd WT && npm run typecheck:routes -w gogospend-app > S/gate-typecheck-routes.log 2>&1; echo $?`. Expected: 0 (the route changed).
3. `cd WT && npm run test:app > S/gate-test-app.log 2>&1; echo $?`. Expected: 0, `ℹ fail 0`.
4. `cd WT && npm run test:unit > S/gate-test-unit.log 2>&1; echo $?`. Expected: 0, `ℹ fail 0`. This holds B1 (the Hermes guard, `src/testing/hermesGlobals.test.ts`) and the draft tables' rules (`src/wallet/copy/draftText.test.ts`).
5. The focused files: Steps 3.3 and 3.4 (38, and 60).
6. The eight render files that read the wallet catalogue's list (B2):
   `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/card/CardStack.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx > S/gate-kit.log 2>&1; echo $?`. Expected: 0, `Test Files  8 passed (8)`, `Tests  138 passed (138)`.
7. The catalogue's suites for the four sections (and P2-T11's `bw-category-icons`, which the pattern also matches):
   `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-categor|bw-thai-pack" > S/gate-catalogue.log 2>&1; echo $?`. Expected: 0, `Test Files  2 passed (2)`, `Tests  10 passed | 612 skipped (622)`.
8. The four routes tests:
   `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx > S/gate-routes.log 2>&1; echo $?`. Expected: 0, `Test Files  4 passed (4)`, `Tests  13 passed (13)` (`PlanningRoutes` 5).
9. `cd WT && npm run export:web -w gogospend-app -- --max-workers 2 > S/gate-export-web.log 2>&1; echo $?`. Expected: 0 (the route changed). Then `/usr/bin/git -C WT status --short` shows no new path outside the scope table (the export writes only ignored files).
10. `/usr/bin/git -C WT diff --check`. Expected: no output, exit 0. (After the commit, Step 7 runs it against the base.)

CI on PR #423 runs the full render suite, the iOS export, the edge, database and ops suites (R100); record them as "CI" in your final message.

## Step 6: Receipt

The receipt `docs/implementation/receipts/P2-T29-fix.md` and the pointer line in `docs/implementation/receipts/P2-T29.md` were copied in Step 3. They are the planner's account of the planner's runs. Check them:
`cd WT && shasum -a 256 docs/implementation/receipts/P2-T29.md docs/implementation/receipts/P2-T29-fix.md`. Expected: the same two hashes as `PL/SHA256SUMS.real-in-wt`.
If any of your counts differs from it, you have already stopped at that step (BLOCKED).

## Step 7: Commit

Write the commit message to `S/commit.msg`:
```
Rebuild the Bun Wallet categories on today's rules and the wallet kit

The fix round on PR #423 (review: 4 blockers, 12 majors, 13 minors;
ruling R113):
- the moved category commands keep today's screen as it was, telling
  their host every way a send stops (M1)
- one read with loading and problem states, read again after each tray
  (M2, M3); tiles on the mode's tint at 4.5:1 (M4)
- an unconfirmed save keeps today's frozen Try again with the same ids
  and keys; new ids from expo-crypto; trays locked while sending (B1, B4,
  M8)
- named fields, swatches and glyphs; Back; words for every problem;
  private mode in the trays; archive and unarchive (B3, M5 to M10, m6)
- the catalogue loads the screen lazily, in the catalogue's language and
  theme, on the board's month (B2, M11)
- 38 wallet cases (4 carried from P2-T11), 4 hook cases and a
  route case; 119 mutants killed

Co-Authored-By: Gemini 3.8 Flash High <noreply@google.com>
```
Then:
```bash
/usr/bin/git -C WT add apps/app/app/spend/categories.tsx apps/app/src/dev/catalogue/wallet/categorySections.tsx apps/app/src/screens/redesign/planning/CategoriesScreen.tsx apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx apps/app/src/screens/redesign/planning/categoryCommands.ts apps/app/src/screens/redesign/planning/categoryCommands.render.test.tsx apps/app/src/wallet/categories docs/implementation/receipts/P2-T29.md docs/implementation/receipts/P2-T29-fix.md
/usr/bin/git -C WT commit -F S/commit.msg
/usr/bin/git -C WT rev-parse --short HEAD
/usr/bin/git -C WT diff --stat cee7eff5 HEAD
/usr/bin/git -C WT diff --check cee7eff5 HEAD
/usr/bin/git -C WT status --short
```
Expected: the stat lists the thirteen files; `diff --check` prints nothing; `status --short` prints nothing.

## Your final message

The orchestrator reads only this:
- First line: `STATUS: DONE` (or `STATUS: BLOCKED` with the step, the command and its output).
- The commit SHA and branch `p2/t29-categories` (one commit on `cee7eff5`); the thirteen files (shared: `CategoriesScreen.tsx`, `PlanningRoutes.render.test.tsx`).
- RED: wallet 33 failed and 5 passed of 38 (33 `AssertionError`); hook and routes 3 failed and 6 passed of 9 (3 `AssertionError`); typecheck 0.
- GREEN: wallet 38 of 38 (34 of the round and the 4 carried P2-T11 cases); hook 4 and `CategoriesScreen` 56 (60 of 60).
- Mutants: 119 killed, 0 survived, every restore equal.
- Gate: `typecheck:app` 0, `typecheck:routes` 0, `test:app` and `test:unit` with `ℹ fail 0`, the eight kit files 138 of 138, catalogue 10 passed, 612 skipped, routes 13 of 13, `export:web` 0, `diff --check` clean.
- CI's: the full render suite, the iOS export, edge, database and ops.
- Deviations: none from this brief, or each one with its reason.

## Appendix A: the files (as `PL/real/` holds them; copy them, never retype them)

### `apps/app/src/screens/redesign/planning/categoryCommands.ts`

```ts
// The Categories screen's commands (plan P2-T29, W2): today's `sendCommand`
// and `send`, with their keys, refusals and conflicts, moved out of
// CategoriesScreen.tsx unchanged, so the Bun diary's screen and the Bun
// Wallet's trays share one rule.
//
// Saving follows the R3 screens' rules: every change is an immutable command
// with its own key (`useCommandKeys`), sent in order (the category's, then
// the budget's). An unconfirmed command freezes the sender and only Try again
// is offered, which resends the very same commands under the same keys. A
// definite refusal settles the key, so a corrected save is a new command. A
// version conflict shows the category or budget as it now is beside yours.
//
// What the caller drew around a send (its form, the sheet that asked, its
// grid) is the caller's: `send` tells it through `host`, at exactly the points
// where today's screen changed its own state. Every path is told, so no caller
// leaves a sheet open after a failure.
import type { BudgetDto, CategoryDto } from '@gogospend/contracts';
import { useRef, useState } from 'react';

import { V1Error } from '@mobile/api/client';
import type { V1Outcome } from '@mobile/api/client';
import { useCopy } from '@mobile/i18n/useCopy';
import { SAVE_PROBLEM_WORDS, afterCategoryAck, budgetConflict, categoryConflict, commandSlot, readConflict } from '@mobile/spend/v1/redesign/planning/categoriesModel';
import type { CategoryCommand, CategoryDraft, ConflictView, FormErrors } from '@mobile/spend/v1/redesign/planning/categoriesModel';
import type { Translate } from '@mobile/spend/v1/redesign/shared';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import type { SaveProblem } from '../../v1/parts';
import { isOwnCreate, ownCreateMatches, refusedBeforeProcessing, saveProblem, useCommandKeys, useMoneyLocale } from '../../v1/parts';

/** What to say once every command is acknowledged, and the draft (if any) the commands came from. */
export type Origin = { success: string; draft: CategoryDraft | null; seen: BudgetDto | null };
/** `idle`: nothing running. `saving`: commands are being sent. `unconfirmed`: one may have committed; frozen until Try again. */
export type Status = 'idle' | 'saving' | 'unconfirmed';
export type Conflict = { view: ConflictView; withYours: boolean };

/** What the caller does at each point of a send, where today's screen changed its own state. */
export type CategoryCommandsHost = {
  /** A later command failed: the open draft, rebased on the commands acknowledged before it. */
  rebase(draft: CategoryDraft): void;
  /** The send stopped short, unconfirmed or refused: the sheet that asked closes. */
  stopped(): void;
  /** Every command was acknowledged. */
  saved(origin: Origin): void;
  /** It changed elsewhere and there is no usable copy of theirs: the draft goes and everything is read again. */
  changedElsewhere(): void;
  /** A refusal of the draft's own fields, said beside them. */
  fieldErrors(errors: FormErrors): void;
};

/** Refusals that keep the shared words; those that speak of an entry are said in a category's (`SAVE_PROBLEM_WORDS`). */
const SHARED_WORDS: readonly V1Outcome[] = ['policy_required', 'signed_out', 'session_changed'];

/** `saveProblem` (unconfirmed, blocked, fields) in a category's words. */
function categoryProblem(error: unknown, tc: Translate): SaveProblem {
  const problem = saveProblem(error, tc);
  const outcome = error instanceof V1Error ? error.outcome : undefined;
  const own = outcome ? SAVE_PROBLEM_WORDS[outcome] : undefined;
  if (own) return { ...problem, message: tc(own) };
  if ((outcome && SHARED_WORDS.includes(outcome)) || (outcome === 'invalid' && Object.keys(problem.fields).length > 0)) return problem;
  return { ...problem, message: tc('Could not save that. Try again.') };
}

/** Sends one command under its key. */
function sendCommand(resources: SpendV1Resources, command: CategoryCommand, key: string) {
  if (command.slot === 'budget') return resources.setBudget(command.month, command.input, key, command.existing);
  switch (command.kind) {
    case 'create': return resources.createCategory(command.input, key);
    case 'update': return resources.updateCategory(command.id, command.version, command.changes, key);
    case 'archive': return resources.archiveCategory(command.id, command.version, key);
    case 'unarchive': return resources.unarchiveCategory(command.id, command.version, key);
  }
}

/** A refusal about the category's state (already archived, archived elsewhere, not archived): it changed elsewhere. */
const stateChanged = (error: unknown) => error instanceof V1Error && (error.outcome === 'not_found' || error.outcome === 'deleted' || 'archived' in (error.fields ?? {}));

export function useCategoryCommands(host: CategoryCommandsHost) {
  const resources = useSpendV1();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const keys = useCommandKeys();
  const [status, setStatus] = useState<Status>('idle');
  /** A problem with the last send, said in the footer. */
  const [message, setMessage] = useState<string | null>(null);
  /** Frozen, and resending must wait (an update, a changed session): Try again is disabled. */
  const [resendBlocked, setResendBlocked] = useState(false);
  /** Saving cannot work until the person acts elsewhere (an update, a changed session): the draft stays, saving waits. */
  const [blocked, setBlocked] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  /** What the last finished change did, said politely on the grid. */
  const [done, setDone] = useState<string | null>(null);
  /** The unarchive being sent, for its busy button. */
  const [unarchiving, setUnarchiving] = useState<string | null>(null);
  /** The commands whose outcome is unknown: Try again resends exactly these. */
  const pending = useRef<{ commands: CategoryCommand[]; origin: Origin } | null>(null);
  const running = useRef(false);

  /**
   * Sends the commands in order. Each acknowledged category command rebases
   * the open draft, so if a later one is refused, saving again sends only
   * what is left. The first unconfirmed one freezes the sender with the
   * commands from it on, under their keys.
   */
  async function send(commands: readonly CategoryCommand[], origin: Origin) {
    if (running.current) return;
    running.current = true;
    const resend = pending.current !== null;
    let draft = origin.draft;
    setStatus('saving');
    setMessage(null);
    setDone(null);
    try {
      for (const [index, command] of commands.entries()) {
        const slot = commandSlot(command);
        const key = keys.keyFor(slot, command);
        try {
          const ack = await sendCommand(resources, command, key);
          keys.settle(slot);
          draft = draft ? afterCategoryAck(draft, command, ack.version) : null;
          continue;
        } catch (error) {
          // The category's id is fixed for this draft: if it already exists, an earlier attempt committed.
          if (command.slot === 'category' && command.kind === 'create' && isOwnCreate(error, command.input.id) && ownCreateMatches(error, command.input)) {
            keys.settle(slot);
            const held = (error as V1Error).current as CategoryDto;
            draft = draft ? afterCategoryAck(draft, command, held.version) : null;
            continue;
          }
          const problem = categoryProblem(error, tc);
          // Once unconfirmed, a refusal before processing says nothing about that attempt: it stays frozen with its key.
          const stillUnknown = problem.unconfirmed || (resend && index === 0 && refusedBeforeProcessing(error));
          if (!stillUnknown) keys.settle(slot);
          const rebased = draft;
          if (rebased) host.rebase(rebased);
          host.stopped();
          if (stillUnknown) {
            pending.current = { commands: commands.slice(index), origin: { ...origin, draft } };
            setResendBlocked(problem.blocked);
            setMessage(problem.message);
            setStatus('unconfirmed');
            return;
          }
          pending.current = null;
          setResendBlocked(false);
          setBlocked(problem.blocked);
          setStatus('idle');
          refused(error, command, problem, { ...origin, draft });
          return;
        }
      }
      pending.current = null;
      setResendBlocked(false);
      setStatus('idle');
      setDone(origin.success);
      host.saved(origin);
    } finally {
      running.current = false;
      setUnarchiving(null);
    }
  }

  /** A definite refusal: a conflict to show, a change made elsewhere, or a problem to fix here. */
  function refused(error: unknown, command: CategoryCommand, problem: SaveProblem, origin: Origin) {
    const outcome = error instanceof V1Error ? error.outcome : undefined;
    if (outcome === 'conflict') {
      const copy = readConflict(command, (error as V1Error).current);
      if (copy?.kind === 'category') {
        setConflict({ view: categoryConflict(origin.draft, copy.server, tc), withYours: origin.draft !== null });
        return;
      }
      if (copy?.kind === 'budget' && origin.draft && origin.seen) {
        setConflict({ view: budgetConflict(origin.draft, origin.seen, copy.server, { tc, locale }), withYours: true });
        return;
      }
    }
    if (outcome === 'conflict' || stateChanged(error)) {
      // No usable copy of theirs: read everything again rather than loop on a stale version.
      host.changedElsewhere();
      setMessage(tc('This category changed on another device.'));
      return;
    }
    setMessage(problem.message);
    const fields = problem.fields;
    host.fieldErrors({ label: fields.label, limit: fields.category_limits ?? fields.overall_limit_minor });
  }

  function tryAgain() {
    const stored = pending.current;
    if (stored && !resendBlocked) void send(stored.commands, stored.origin);
  }

  return { status, message, setMessage, resendBlocked, blocked, conflict, setConflict, done, setDone, unarchiving, setUnarchiving, send, tryAgain };
}
```

### `apps/app/src/screens/redesign/planning/CategoriesScreen.tsx`

```tsx
// R4 Planning: the Categories screen (plan §6.2, /spend/categories), behind
// the `planning` area (on since E2 checkpoint 2). It is opened from Budget, so the
// stage has Back.
//
// - The grid: Expense or Income, built-in and custom categories together,
//   each with its icon (a built-in's drawing, a custom one's initial) in its
//   colour and this month's limit; archived ones in a collapsed section, each
//   with Unarchive.
// - New category: a one-line name (the API's rule), a palette colour, an
//   optional limit for an expense category, and a live chip preview; the
//   action is pinned in the ActionFooter.
// - Edit: the name and colour (a built-in can go back to its default name,
//   label null), the limit, and Archive, which asks first in a sheet.
// - The limit is part of this month's budget: setting it replaces the whole
//   budget at the version read, with the overall limit unchanged, and is
//   refused before sending when the limits would add up to more than the
//   budget. With no budget this month it says a budget comes first and links
//   to Budget; it never creates one.
//
// Saving follows the R3 screens' rules: every change is an immutable command
// with its own key (`useCommandKeys`), sent in order (the category's, then
// the budget's). An unconfirmed command freezes the screen and only Try again
// is offered, which resends the very same commands under the same keys. A
// definite refusal settles the key, so a corrected save is a new command. A
// version conflict shows the category or budget as it now is beside yours,
// with Reload. The rule itself is `useCategoryCommands` (categoryCommands.ts,
// P2-T29), which the Bun Wallet's trays share; this screen hands it its own
// effects (the form, the archive sheet, the type shown and the reads).
import type { BudgetDto, CategoryDto, CategoryType } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { isRedesignEnabled } from '@mobile/config/featureFlags';
import { PACK_BEFORE_C3, missingPackItems, packCommands } from '@mobile/spend/v1/redesign/planning/thaiPack';
import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { Bun } from '@mobile/mascot/Bun';
import { formatMinor } from '@mobile/spend/v1/money';
import { classifyLoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import {
  LABEL_PROBLEM_TEXT, archiveCommand, checkLabel, draftName, editCategoryDraft, groupCategories, hasLimitField, limitProblem, newCategoryDraft, planSave, readLimit, suggestColor,
} from '@mobile/spend/v1/redesign/planning/categoriesModel';
import type { CategoryDraft, CategoryItem, FormErrors } from '@mobile/spend/v1/redesign/planning/categoriesModel';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { monthOf, todayInBangkok } from '@mobile/spend/v1/viewModels';
import { EmptyState } from '@mobile/ui/EmptyState';
import { BUN_SPACE } from '@mobile/ui/layout';
import { Card } from '@mobile/ui/Card';
import { BunText } from '@mobile/ui/BunText';
import { PillButton } from '@mobile/ui/PillButton';
import { ConfirmSheet } from '@mobile/ui/Sheet';
import { StageHeader } from '@mobile/ui/StageHeader';
import { newId, useLoad, useMoneyLocale } from '../../v1/parts';
import { ActionFooter, ActionRow, EntryPage } from '../ActionFooter';
import { LoadingBlock, Notice, useGoBack } from '../HistoryParts';
import { ArchivedSection, CategoryTile, ChipPreview, ConflictPanel, LabelField, LimitField, NoBudgetNote, SwatchPicker, TypeToggle } from './CategoryParts';
import { useCategoryCommands } from './categoryCommands';

export type CategoriesScreenProps = {
  /** The clock, for tests; this month is its Bangkok month. */
  now?: Date;
};

type Loaded = { categories: CategoryDto[]; budget: BudgetDto | null };
type Form = { draft: CategoryDraft; errors: FormErrors };

export function CategoriesScreen({ now }: CategoriesScreenProps = {}) {
  const resources = useSpendV1();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const activeLocale = useActiveLocale();
  const companion = isRedesignEnabled('companion');
  const router = useRouter();
  const goBack = useGoBack('/spend/budget');
  const month = monthOf(todayInBangkok(now ?? new Date()));
  const loaded = useLoad(async (): Promise<Loaded> => {
    const [categories, budget] = await Promise.all([resources.ensureBuiltinCategories(), resources.budget(month)]);
    return { categories, budget };
  }, [resources, month]);

  const [type, setType] = useState<CategoryType>('expense');
  const [form, setForm] = useState<Form | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { status, message, setMessage, resendBlocked, blocked, conflict, setConflict, done, setDone, unarchiving, setUnarchiving, send, tryAgain } = useCategoryCommands({
    rebase: (rebased) => setForm((current) => (current ? { ...current, draft: rebased } : current)),
    stopped: () => setConfirming(false),
    saved: (origin) => {
      setConfirming(false);
      setForm(null);
      // The grid shows the type just saved, so a new income category is in view.
      if (origin.draft) setType(origin.draft.type);
      // Reading the result is a separate load: its failure is a load problem, never an unconfirmed save.
      loaded.refresh();
    },
    changedElsewhere: () => {
      setForm(null);
      loaded.reload();
    },
    fieldErrors: (errors) => setForm((current) => (current ? { ...current, errors } : current)),
  });

  const locked = status !== 'idle';
  const data = loaded.state === 'ready' ? loaded.data : null;

  function reload() {
    setConflict(null);
    setForm(null);
    setMessage(null);
    loaded.reload();
  }

  function openForm(draft: CategoryDraft) {
    if (locked) return;
    setDone(null);
    setMessage(null);
    setForm({ draft, errors: {} });
  }

  function submit(current: Form, seen: BudgetDto | null) {
    if (locked || blocked) return;
    const plan = planSave(current.draft, { budget: seen, tc, locale });
    if (!plan.ok) {
      setForm({ ...current, errors: plan.errors });
      return;
    }
    if (plan.commands.length === 0) {
      setForm(null);
      return;
    }
    void send(plan.commands, { success: tc('Saved.'), draft: current.draft, seen });
  }

  /** Changes the draft, unless it is frozen; a field's old problem goes as it is edited. */
  function edit(patch: Partial<CategoryDraft>) {
    if (locked) return;
    setForm((current) => (current ? {
      draft: { ...current.draft, ...patch },
      errors: { label: 'label' in patch ? undefined : current.errors.label, limit: 'limitText' in patch || 'type' in patch ? undefined : current.errors.limit },
    } : current));
  }

  // -------------------------------------------------------------------------
  // What shows

  let title = tc('Categories');
  let body: ReactNode;
  let footer: ReactNode = null;
  let sheet: ReactNode = null;
  const footerMessage = message ? <Notice tone="alert" message={message} /> : null;
  const retry = <PillButton label={tc('Try again')} disabled={resendBlocked} onPress={tryAgain} />;

  if (loaded.state === 'loading') {
    body = <LoadingBlock label={tc('Loading your diary')} />;
  } else if (loaded.state === 'error') {
    const problem = classifyLoadProblem(loaded.error, tc);
    body = <Notice tone="alert" message={problem.message} action={problem.retry ? { label: tc('Try again'), onPress: loaded.reload } : undefined} />;
  } else if (conflict) {
    title = form?.draft.mode === 'create' ? tc('New category') : form ? tc('Edit category') : tc('Categories');
    body = <ConflictPanel view={conflict.view} withYours={conflict.withYours} onReload={reload} />;
  } else if (form && data) {
    const { draft } = form;
    const seen = data.budget;
    const builtin = draft.builtinKey !== null;
    title = draft.mode === 'create' ? tc('New category') : tc('Edit category');
    // A name too long or not one line is said as it is typed; an empty one when saving.
    const live = checkLabel(draft.label, builtin);
    const labelError = form.errors.label ?? (!live.ok && live.problem !== 'empty' ? tc(LABEL_PROBLEM_TEXT[live.problem]) : null);
    // A limit over the total is said as it is typed; a mistyped amount when saving.
    const over = limitProblem(draft, { budget: seen, tc, locale });
    const limitError = form.errors.limit ?? (over && over.minor !== null ? over.message : null);
    const typedLimit = readLimit(draft.limitText, locale);
    const name = draftName(draft, tc);
    body = (
      <View style={{ gap: BUN_SPACE.md }}>
        {draft.mode === 'create' ? <TypeToggle value={draft.type} onChange={(next) => edit({ type: next })} disabled={locked} /> : null}
        <ChipPreview name={name} iconName={builtin ? name : draft.label.trim()} builtinKey={draft.builtinKey} color={draft.color} />
        <LabelField
          value={draft.label}
          onChangeText={(label) => edit({ label })}
          error={labelError}
          editable={!locked}
          placeholder={builtin ? draftName({ ...draft, label: '' }, tc) : undefined}
        />
        {builtin && draft.label.trim() !== '' ? (
          <PillButton kind="secondary" label={tc('Use the default name')} disabled={locked} onPress={() => edit({ label: '' })} />
        ) : null}
        <SwatchPicker value={draft.color} onChange={(color) => edit({ color })} disabled={locked} />
        {hasLimitField(draft, seen) ? (
          <LimitField
            value={draft.limitText}
            onChangeText={(limitText) => edit({ limitText })}
            error={limitError}
            editable={!locked}
            overall={formatMinor(seen.overall_limit_minor, locale)}
            preview={typedLimit.ok && typedLimit.minor !== null ? formatMinor(typedLimit.minor, locale) : null}
          />
        ) : draft.type === 'expense' ? (
          <NoBudgetNote onOpenBudget={() => router.push('/spend/budget')} />
        ) : null}
        {draft.mode === 'edit' && draft.base ? (
          <PillButton kind="secondary" label={tc('Archive category')} disabled={locked} onPress={() => setConfirming(true)} />
        ) : null}
      </View>
    );
    footer = (
      <ActionFooter testID="categories-footer">
        {footerMessage}
        {status === 'unconfirmed' ? retry : (
          <ActionRow
            secondary={<PillButton kind="secondary" label={tc('Cancel')} disabled={locked} onPress={() => {
              setMessage(null);
              setForm(null);
            }} />}
            primary={<PillButton
              label={draft.mode === 'create' ? tc('Add this category') : tc('Save changes')}
              busy={status === 'saving'}
              busyLabel={tc('Saving…')}
              disabled={blocked}
              onPress={() => submit(form, seen)}
            />}
          />
        )}
      </ActionFooter>
    );
    const base = draft.base;
    if (base) {
      sheet = (
        <ConfirmSheet
          visible={confirming}
          title={tc('Archive {name}?', { name })}
          consequence={tc("{name} won't show in Quick add any more. Past entries keep it, and you can unarchive it here any time.", { name })}
          confirmLabel={tc('Archive')}
          busy={status === 'saving'}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void send([archiveCommand(base, 'archive')], { success: tc('{name} is archived.', { name }), draft, seen })}
        />
      );
    }
  } else if (data) {
    const groups = groupCategories(data.categories, type, { tc, budget: data.budget });
    const limitWords = (item: CategoryItem) => (item.limitMinor === null ? null : tc('{amount} a month', { amount: formatMinor(item.limitMinor, locale) }));
    const unarchive = (item: CategoryItem) => {
      if (locked || blocked) return;
      setUnarchiving(item.category.id);
      void send([archiveCommand(item.category, 'unarchive')], { success: tc('{name} is back in Quick add.', { name: item.name }), draft: null, seen: data.budget });
    };
    // Thai everyday categories (premium plan A2): today's seven until the screen switches to C3.
    const pack = companion ? missingPackItems(data.categories, PACK_BEFORE_C3) : [];
    body = (
      <View style={{ gap: BUN_SPACE.md }}>
        <TypeToggle value={type} onChange={setType} disabled={locked} />
        {done ? <Notice message={done} /> : null}
        <View testID="categories-grid" style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: BUN_SPACE.sm }}>
          {groups.active.map((item) => (
            <CategoryTile key={item.category.id} item={item} limit={limitWords(item)} disabled={locked} onPress={() => openForm(editCategoryDraft(item.category, data.budget))} />
          ))}
        </View>
        {groups.hasCustom ? null : (
          <EmptyState art={<Bun pose="thinking" size="m" />} title={tc('No categories of your own yet')} body={tc("Add one for anything the built-in categories don't cover.")} />
        )}
        {pack.length > 0 ? (
          <Card padding="sm" testID="thai-everyday-pack">
            <View style={{ gap: BUN_SPACE.xs }}>
              <BunText variant="heading">{tc('Thai everyday')}</BunText>
              <BunText tone="muted">{pack.map((item) => (activeLocale === 'th' ? item.th : item.en)).join(' · ')}</BunText>
              <PillButton
                kind="secondary"
                label={pack.length === 1 ? tc('Add 1 category') : tc('Add {count} categories', { count: pack.length })}
                disabled={locked || blocked}
                onPress={() => void send(packCommands(data.categories, activeLocale, newId, { pack: PACK_BEFORE_C3 }), { success: tc('Added. They are in Quick add now.'), draft: null, seen: data.budget })}
              />
            </View>
          </Card>
        ) : null}
        {groups.archived.length > 0 ? (
          <ArchivedSection
            items={groups.archived}
            expanded={archivedOpen}
            onToggle={() => setArchivedOpen((open) => !open)}
            onUnarchive={unarchive}
            busyId={status === 'saving' ? unarchiving : null}
            disabled={locked || blocked}
          />
        ) : null}
      </View>
    );
    footer = (
      <ActionFooter testID="categories-footer">
        {footerMessage}
        {status === 'unconfirmed' ? retry : (
          <PillButton
            label={tc('New category')}
            disabled={locked || blocked}
            onPress={() => openForm(newCategoryDraft({ id: newId(), type, color: suggestColor(data.categories, type) }))}
          />
        )}
      </ActionFooter>
    );
  }

  // Back leaves the grid; the form leaves by Cancel (or Reload after a conflict).
  const showBack = !form && !conflict;
  return (
    <EntryPage testID="categories-screen">
      <ScrollView testID="categories-scroll" style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: footer ? BUN_SPACE.sm : BUN_SPACE.xl, gap: BUN_SPACE.md }} keyboardShouldPersistTaps="handled">
        <StageHeader title={title} back={showBack ? { onPress: goBack } : undefined} />
        <View style={{ paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.md }}>{body}</View>
      </ScrollView>
      {footer}
      {sheet}
    </EntryPage>
  );
}
```

### `apps/app/src/wallet/categories/WalletCategoriesScreen.tsx`

```tsx
// The Bun Wallet's Categories screen (P2-T29; wc-categories, W1): back and
// new, the heading, the type segments, the Thai pack card, the built-in and
// custom grids of 104 pt tiles with this month's spending against each limit,
// the new tile, and the archived categories with นำกลับมาใช้.
//
// - One read, as today's screen reads: the categories (ensureBuiltinCategories),
//   this month's budget and this month's summary together. Loading says so;
//   a read that fails says why in today's words, with Try again when trying
//   again can help, and shows no grid, no tiles and no pack card in its place.
// - A tile is the category's glyph (the kept icon, the pack's or the
//   built-in's) or its initial, on its colour tinted for the mode (the kit's
//   tileTint), with its name, this month's money and, for spending, its limit:
//   งบ {amount}, ไม่จำกัด, or เกิน {amount} in `over` on a card chip (the over
//   colour reads 4.5:1 on the card, not on every tint). Spending equal to its
//   limit is not over. Income says what came in, never a limit. Each tile is
//   one button, labelled as the board labels it, with ฿ read as บาท.
// - The pack card shows while any of C3's nine is missing: the first three
//   missing names, then และอีก {n} หมวด. It opens ThaiPackTray.
// - The trays: a tile opens CategoryTray for it, new opens it for a new
//   category of the type shown, and the pack card opens ThaiPackTray. A tray
//   that closes may have changed something (saved, or sent a change whose
//   answer never came), so the screen reads again in place.
// - Back goes back, or to Budget when there is nothing to go back to, as
//   today's screen does.
// - Private mode (W10): every amount is ฿••••, and each tile says only that
//   its amount is hidden.
// - Nothing is clamped to a line: tiles grow with their words, and at the
//   largest text sizes each tile takes a row of its own.
import type { BudgetDto, CategoryDto, CategoryType, Minor, MonthSummary } from '@gogospend/contracts';
import { CATEGORY_COLORS } from '@gogospend/contracts';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { useGoBack } from '@mobile/screens/redesign/HistoryParts';
import { useCategoryCommands } from '@mobile/screens/redesign/planning/categoryCommands';
import { useLoad } from '@mobile/screens/v1/parts';
import { classifyLoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import { archiveCommand, groupCategories } from '@mobile/spend/v1/redesign/planning/categoriesModel';
import type { CategoryItem } from '@mobile/spend/v1/redesign/planning/categoriesModel';
import { THAI_EVERYDAY_PACK, missingPackItems } from '@mobile/spend/v1/redesign/planning/thaiPack';
import type { C3Item } from '@mobile/spend/v1/redesign/planning/thaiPack';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { monthOf, todayInBangkok } from '@mobile/spend/v1/viewModels';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { tileTint } from '@mobile/theme/walletPalette';
import { DECORATIVE } from '@mobile/ui/a11y';
import { Glyph } from '@mobile/ui/Glyph';
import { useLargeText } from '@mobile/ui/largeText';
import { COMMON_COPY } from '../common/copy';
import { useDraftCopy } from '../copy/useDraftCopy';
import { IconButton } from '../controls/IconButton';
import { PACK_GLYPH } from '../looks/categoryIcons';
import { CategoryGlyph, WalletCategoryIcon } from '../looks/WalletCategoryIcon';
import { useCategoryIcons } from '../looks/WalletLooksProvider';
import { WalletAmount } from '../money/WalletAmount';
import { HIDDEN_AMOUNT, spokenMoney, walletMoneyText } from '../money/walletMoney';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { TextLink } from '../tray/TextLink';
import { WalletText } from '../WalletText';
import { CategoryMark, CategoryTray } from './CategoryTray';
import { COPY } from './copy';
import { ThaiPackTray } from './ThaiPackTray';

const LINES = { ...COMMON_COPY, ...COPY } as const;

/** wc-categories' tile, the chosen segment's lift by day, and the pack card's yellow (CATEGORY_COLORS' fourth, tinted). */
const TILE = 104;
const LIFT = '0px 2px 6px rgba(17, 16, 20, 0.08)';
const PACK_HUE = CATEGORY_COLORS[3];

type Loaded = { categories: CategoryDto[]; budget: BudgetDto | null; summary: MonthSummary };
/** The tray open: the category tray (a category, or null for a new one) or the pack tray. */
type Open = { tray: 'category'; category: CategoryDto | null } | { tray: 'pack' };

export type WalletCategoriesScreenProps = {
  /** The clock, for tests; this month is its Bangkok month. */
  now?: Date;
};

export function WalletCategoriesScreen({ now }: WalletCategoriesScreenProps = {}) {
  const resources = useSpendV1();
  const insets = useSafeAreaInsets();
  const colors = useWalletColors();
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const goBack = useGoBack('/spend/budget');
  const month = monthOf(todayInBangkok(now ?? new Date()));
  const loaded = useLoad(async (): Promise<Loaded> => {
    const [categories, budget, summary] = await Promise.all([resources.ensureBuiltinCategories(), resources.budget(month), resources.summary(month)]);
    return { categories, budget, summary };
  }, [resources, month]);
  const [type, setType] = useState<CategoryType>('expense');
  const [open, setOpen] = useState<Open | null>(null);
  const data = loaded.state === 'ready' ? loaded.data : null;
  // A tray that closes may have changed something: read again in place (the grid stays while it reads).
  const closeTray = () => {
    setOpen(null);
    loaded.refresh();
  };
  const plus = (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M12 5v14M5 12h14" fill="none" stroke={colors.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
  return (
    <View testID="categories-screen" style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 12 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <IconButton label={t('common.back')} onPress={goBack}>
            <Glyph name="chevron-left" size={18} color={colors.ink} />
          </IconButton>
          {data === null ? null : (
            <IconButton label={t('categories.new')} onPress={() => setOpen({ tray: 'category', category: null })}>
              <View {...DECORATIVE}>{plus}</View>
            </IconButton>
          )}
        </View>
        <WalletText role="h1" accessibilityRole="header">{t('categories.title')}</WalletText>
        {loaded.state === 'loading' ? <WalletText testID="categories-loading" role="label" tone="quietOnGround">{tc('Loading your diary')}</WalletText> : null}
        {loaded.state === 'error' ? <LoadProblem error={loaded.error} onRetry={loaded.reload} /> : null}
        {data === null ? null : (
          <CategoriesBody data={data} type={type} onType={setType} onOpen={setOpen} onChanged={loaded.refresh} />
        )}
      </ScrollView>
      {data === null ? null : (
        <>
          <CategoryTray
            visible={open?.tray === 'category'}
            onClose={closeTray}
            category={open?.tray === 'category' ? open.category : null}
            type={type}
            budget={data.budget}
          />
          <ThaiPackTray visible={open?.tray === 'pack'} onClose={closeTray} categories={data.categories} />
        </>
      )}
    </View>
  );
}

function CategoriesBody({ data, type, onType, onOpen, onChanged }: {
  data: Loaded;
  type: CategoryType;
  onType(type: CategoryType): void;
  onOpen(open: Open): void;
  onChanged(): void;
}) {
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const groups = groupCategories(data.categories, type, { tc, budget: data.budget });
  const spent = new Map(data.summary.categories.map((total) => [total.category_id, total.total_minor]));
  const missingKeys = new Set(missingPackItems(data.categories).map((item) => item.key));
  const missing = THAI_EVERYDAY_PACK.filter((item) => missingKeys.has(item.key));
  const tile = (item: CategoryItem) => (
    <CategoryTile key={item.category.id} item={item} spentMinor={spent.get(item.category.id) ?? '0'} onPress={() => onOpen({ tray: 'category', category: item.category })} />
  );
  return (
    <>
      <TypeSwitch type={type} onType={onType} />
      {missing.length > 0 ? <PackCard missing={missing} onPress={() => onOpen({ tray: 'pack' })} /> : null}
      <View testID="categories-builtins" style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 8 }}>
          <WalletText role="h2" accessibilityRole="header">{t('categories.builtins')}</WalletText>
          <WalletText role="caption" tone="quietOnGround">{t('categories.thisMonth')}</WalletText>
        </View>
        <TileGrid>{groups.active.filter((item) => !item.custom).map(tile)}</TileGrid>
      </View>
      <View testID="categories-custom" style={{ gap: 10 }}>
        <WalletText role="h2" accessibilityRole="header">{t('categories.custom')}</WalletText>
        <TileGrid>
          {[...groups.active.filter((item) => item.custom).map(tile), <NewTile key="new" onPress={() => onOpen({ tray: 'category', category: null })} />]}
        </TileGrid>
      </View>
      {groups.archived.length > 0 ? <ArchivedCategories items={groups.archived} onChanged={onChanged} /> : null}
    </>
  );
}

/** Three tiles to a row, each the same width; at the largest text sizes one to a row. */
function TileGrid({ children }: { children: ReactNode[] }) {
  const large = useLargeText();
  const perRow = large ? 1 : 3;
  const rows: ReactNode[][] = [];
  for (let at = 0; at < children.length; at += perRow) rows.push(children.slice(at, at + perRow));
  return (
    <View style={{ gap: 10 }}>
      {rows.map((row, index) => (
        <View key={index} style={{ flexDirection: 'row', gap: 10 }}>
          {row}
          {/* A short last row keeps its tiles the width of the others. */}
          {Array.from({ length: perRow - row.length }, (_, gap) => <View key={`gap-${gap}`} style={{ flex: 1 }} />)}
        </View>
      ))}
    </View>
  );
}

/** รายจ่าย and รายรับ (wc-categories): the chosen one a card segment with bold ink words. */
function TypeSwitch({ type, onType }: { type: CategoryType; onType(type: CategoryType): void }) {
  const colors = useWalletColors();
  const large = useLargeText();
  const t = useDraftCopy(LINES);
  return (
    <View
      testID="categories-type"
      role="radiogroup"
      accessibilityLabel={t('categories.typeGroup')}
      style={{ flexDirection: large ? 'column' : 'row', gap: 2, padding: 4, borderRadius: 14, backgroundColor: colors.track }}
    >
      {(['expense', 'income'] as const).map((each) => {
        const checked = each === type;
        const label = t(each === 'expense' ? 'categories.expense' : 'categories.income');
        return (
          <Pressable
            key={each}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked }}
            aria-checked={checked}
            onPress={() => onType(each)}
            style={{
              flex: large ? undefined : 1,
              minHeight: 44,
              borderRadius: 11,
              paddingHorizontal: 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: checked ? colors.card : 'transparent',
              boxShadow: checked && !colors.isDark ? LIFT : undefined,
            }}
          >
            <WalletText role="label" tone={checked ? 'ink' : 'quietOnGround'} style={{ fontWeight: checked ? '700' : '500', textAlign: 'center' }}>{label}</WalletText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The pack card (wc-categories): three of the missing items' glyphs, its name, and the first three missing names. */
function PackCard({ missing, onPress }: { missing: readonly C3Item[]; onPress(): void }) {
  const colors = useWalletColors();
  const locale = useActiveLocale();
  const t = useDraftCopy(LINES);
  const first = missing.slice(0, 3);
  const names = first.map((item) => (locale === 'th' ? item.th : item.en)).join(locale === 'th' ? ' ' : ', ');
  const more = missing.length - first.length;
  const line = more > 0 ? `${names} ${t('categories.packMore', { n: more })}` : names;
  return (
    <Pressable
      testID="categories-pack"
      accessibilityRole="button"
      accessibilityLabel={`${t('categories.packTitle')} ${t('categories.packName')} ${line}`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 84,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: tileTint(PACK_HUE, colors.isDark),
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View {...DECORATIVE} style={{ width: 64, height: 62 }}>
        {first.map((item, index) => (
          <View
            key={item.key}
            style={{
              position: 'absolute',
              left: [0, 33, 15][index],
              top: [2, 0, 31][index],
              width: 31,
              height: 31,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: tileTint(item.color, colors.isDark),
              transform: [{ rotate: ['-8deg', '7deg', '-3deg'][index] }],
            }}
          >
            <CategoryGlyph glyph={PACK_GLYPH[item.key]} size={17} color={colors.ink} />
          </View>
        ))}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <WalletText role="label" style={{ fontWeight: '700' }}>{t('categories.packTitle')}</WalletText>
        <WalletText role="label" style={{ fontWeight: '700' }}>{t('categories.packName')}</WalletText>
        <WalletText testID="categories-pack-line" role="caption" tone="quietOnGround">{line}</WalletText>
      </View>
      <View {...DECORATIVE}>
        <Glyph name="chevron-right" size={12} color={colors.ink} />
      </View>
    </Pressable>
  );
}

/** A 104 pt tile (wc-categories), labelled as the board labels it. */
function CategoryTile({ item, spentMinor, onPress }: { item: CategoryItem; spentMinor: Minor; onPress(): void }) {
  const colors = useWalletColors();
  const t = useDraftCopy(LINES);
  const { hidden } = usePrivateMode();
  const { iconOf } = useCategoryIcons();
  const { category, name, limitMinor } = item;
  const income = category.type === 'income';
  // Spending equal to its limit is not over (budgetPace's rule). Limits are spending's only.
  const overMinor = limitMinor !== null && BigInt(spentMinor) > BigInt(limitMinor) ? (BigInt(spentMinor) - BigInt(limitMinor)).toString() : null;
  const shown = (minor: Minor) => (hidden ? HIDDEN_AMOUNT : walletMoneyText(minor));
  const spoken = (minor: Minor) => spokenMoney(minor, t);
  const label = hidden
    ? `${name} ${t('common.amountHidden')}`
    : income
      ? t('categories.tileIncome', { name, amount: spoken(spentMinor) })
      : overMinor !== null
        ? t('categories.tileOver', { name, spent: spoken(spentMinor), over: spoken(overMinor) })
        : limitMinor !== null
          ? t('categories.tileLabel', { name, spent: spoken(spentMinor), limit: spoken(limitMinor) })
          : t('categories.tileUnlimited', { name, spent: spoken(spentMinor) });
  return (
    <Pressable
      testID={`category-tile-${category.id}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        minHeight: TILE,
        paddingVertical: 11,
        paddingHorizontal: 12,
        borderRadius: 18,
        justifyContent: 'space-between',
        gap: 4,
        backgroundColor: category.color === null ? colors.raised : tileTint(category.color, colors.isDark),
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <CategoryMark glyph={iconOf(category)} name={name} size={22} />
      <View>
        <WalletText role="label" style={{ fontWeight: '700' }}>{name}</WalletText>
        <WalletAmount minor={spentMinor} size={13} tone="ink" />
        {income ? null : overMinor !== null ? (
          <View testID={`category-over-${category.id}`} style={{ alignSelf: 'flex-start', paddingHorizontal: 6, borderRadius: 8, backgroundColor: colors.card }}>
            <WalletText role="caption" tone="over" style={{ fontWeight: '700' }}>{t('categories.over', { amount: shown(overMinor) })}</WalletText>
          </View>
        ) : (
          <WalletText testID={`category-limit-${category.id}`} role="caption" tone="quietOnGround">
            {limitMinor === null ? t('categories.unlimited') : t('categories.limit', { amount: shown(limitMinor) })}
          </WalletText>
        )}
      </View>
    </Pressable>
  );
}

/** หมวดใหม่ (wc-categories): a dashed tile with the ink + . */
function NewTile({ onPress }: { onPress(): void }) {
  const colors = useWalletColors();
  const t = useDraftCopy(LINES);
  return (
    <Pressable
      testID="categories-new-tile"
      accessibilityRole="button"
      accessibilityLabel={t('categories.new')}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        minHeight: TILE,
        padding: 8,
        borderRadius: 18,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: colors.hairline,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View {...DECORATIVE} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Path d="M12 5v14M5 12h14" fill="none" stroke={colors.onPrimary} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
      <WalletText role="label" style={{ fontWeight: '700', textAlign: 'center' }}>{t('categories.new')}</WalletText>
    </Pressable>
  );
}

/**
 * The archived categories of the type shown, each with นำกลับมาใช้ (today's
 * unarchive, through useCategoryCommands): one at a time; an unconfirmed one
 * offers Try again under the same key; a refusal or a change made elsewhere
 * says so, and the screen reads again.
 */
function ArchivedCategories({ items, onChanged }: { items: readonly CategoryItem[]; onChanged(): void }) {
  const colors = useWalletColors();
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const commands = useCategoryCommands({
    rebase: () => undefined,
    stopped: () => undefined,
    saved: () => onChanged(),
    changedElsewhere: () => onChanged(),
    fieldErrors: () => undefined,
  });
  const held = commands.status !== 'idle' || commands.blocked;
  const notice = commands.conflict?.view.message ?? commands.message;
  // Each button is disabled while one is out, unconfirmed or blocked; the hook sends one at a time.
  const unarchive = (item: CategoryItem) => {
    void commands.send([archiveCommand(item.category, 'unarchive')], { success: tc('{name} is back in Quick add.', { name: item.name }), draft: null, seen: null });
  };
  return (
    <View testID="categories-archived" style={{ gap: 10 }}>
      <WalletText role="h2" accessibilityRole="header">{tc('Archived')}</WalletText>
      {notice ? (
        <View testID="categories-unarchive-problem" style={{ gap: 4, alignItems: 'flex-start' }}>
          <WalletText role="label" accessibilityRole="alert">{notice}</WalletText>
          {commands.status === 'unconfirmed' && !commands.resendBlocked ? <TextLink label={t('common.tryAgain')} onPress={commands.tryAgain} /> : null}
          {commands.conflict ? (
            <TextLink
              label={tc('Reload')}
              onPress={() => {
                commands.setConflict(null);
                onChanged();
              }}
            />
          ) : null}
        </View>
      ) : null}
      {items.map((item) => (
        <View
          key={item.category.id}
          testID={`archived-category-${item.category.id}`}
          style={{ minHeight: 60, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, backgroundColor: colors.card }}
        >
          <WalletCategoryIcon category={item.category} name={item.name} />
          <WalletText role="label" style={{ flex: 1, minWidth: 120, fontWeight: '700' }}>{item.name}</WalletText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tc('Unarchive {name}', { name: item.name })}
            accessibilityState={{ disabled: held }}
            aria-disabled={held}
            disabled={held}
            onPress={() => unarchive(item)}
            style={({ pressed }) => ({
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 16,
              borderRadius: 22,
              backgroundColor: colors.raised,
              opacity: held ? 0.4 : pressed ? 0.7 : 1,
            })}
          >
            <WalletText role="label">{tc('Unarchive')}</WalletText>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/** A load problem in today's words, with Try again when trying again can help. */
function LoadProblem({ error, onRetry }: { error: unknown; onRetry(): void }) {
  const colors = useWalletColors();
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const problem = classifyLoadProblem(error, tc);
  return (
    <View testID="categories-problem" style={{ gap: 4, alignItems: 'flex-start', padding: 16, borderRadius: 22, backgroundColor: colors.card }}>
      <WalletText accessibilityRole="alert">{problem.message}</WalletText>
      {problem.retry ? <TextLink label={t('common.tryAgain')} onPress={onRetry} /> : null}
    </View>
  );
}
```

### `apps/app/src/wallet/categories/CategoryTray.tsx`

```tsx
// The Bun Wallet's category tray (P2-T29; wc-category-edit): a new category,
// or one to change, on P2-T13's Tray. The rules are today's, shared with the
// Bun diary's Categories screen (useCategoryCommands, categoriesModel):
//
// - The draft: a new one gets its id once, when the tray opens (newId, from
//   expo-crypto), so every resend is the same category. The name is the API's
//   one-line rule (checkLabel); a built-in left empty goes back to its own
//   name. The type is chosen for a new one only. The colour is one of the
//   seven swatches (TRAY_SWATCHES), each named in words. The limit belongs to
//   this month's budget (an expense, in a month that has one): setting it
//   replaces the budget at the version read, and a limit that would pass the
//   month's budget is refused in today's words as it is typed.
// - Saving sends planSave's commands through useCategoryCommands. While they
//   are sent the tray is locked (Review Focus 1). An answer that never came
//   freezes it with today's Try again, which resends the same commands under
//   the same keys; the tray can be closed, and opened again it is still
//   frozen until the outcome is known (B4). A refusal of a field says so
//   beside it; a conflict or a change made elsewhere says so, and Reload
//   closes the tray so the screen reads again. Every other opening starts
//   afresh.
// - The icon (W7): the picker is offered only while an account is open, since
//   nothing could be kept without one. The picked glyph is kept for the
//   account only once Jotbun has accepted the category, and only when it
//   differs from what the category already shows (a pack's or a built-in's
//   glyph needs no keeping).
// - เก็บถาวร asks first, as today's sheet does, as the tray's second step.
// - Private mode (W10, R106): the budget, the total and the refusal show
//   ฿••••, and a stored limit is masked in its field until a key is pressed.
// - Every control is at least 44 pt in its own box and named: the glyphs and
//   swatches by the board's names, the fields by their labels.
import type { BudgetDto, CategoryDto, CategoryType, Minor } from '@gogospend/contracts';
import { CATEGORY_COLORS } from '@gogospend/contracts';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { useCategoryCommands } from '@mobile/screens/redesign/planning/categoryCommands';
import { newId, useMoneyLocale } from '@mobile/screens/v1/parts';
import {
  LABEL_PROBLEM_TEXT, LIMIT_PROBLEM_TEXT, archiveCommand, checkLabel, checkLimits, draftName, editCategoryDraft, hasLimitField, newCategoryDraft, planSave, readLimit,
} from '@mobile/spend/v1/redesign/planning/categoriesModel';
import type { CategoryDraft, FormErrors } from '@mobile/spend/v1/redesign/planning/categoriesModel';
import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { Text, TextInput } from '@mobile/theme/AppText';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { LATIN_UI_FONT_FAMILY, THAI_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { tileTint } from '@mobile/theme/walletPalette';
import { WALLET_TYPE, amountMaxScale, walletLineHeight } from '@mobile/theme/walletType';
import { DECORATIVE } from '@mobile/ui/a11y';
import { categoryInitial } from '@mobile/ui/categoryIcons';
import { BUN_TOUCH } from '@mobile/ui/layout';
import { useLargeText } from '@mobile/ui/largeText';
import { COMMON_COPY } from '../common/copy';
import { useDraftCopy } from '../copy/useDraftCopy';
import { CATEGORY_PICKER_GLYPHS } from '../looks/categoryGlyphs';
import type { GlyphKey } from '../looks/categoryGlyphs';
import { CategoryGlyph } from '../looks/WalletCategoryIcon';
import { useCategoryIcons } from '../looks/WalletLooksProvider';
import { HIDDEN_AMOUNT, walletMoneyText } from '../money/walletMoney';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { PrimaryButton } from '../tray/PrimaryButton';
import { TextLink } from '../tray/TextLink';
import { Tray } from '../tray/Tray';
import { WalletText } from '../WalletText';
import { COPY } from './copy';

const LINES = { ...COMMON_COPY, ...COPY } as const;

/** wc-category-edit's seven swatches: สีส้มพีช, สีฟ้า, สีม่วงอ่อน, สีชมพู, สีเหลือง, สีเทาฟ้า, สีเทาม่วง. */
export const TRAY_SWATCHES: readonly string[] = [0, 4, 5, 2, 3, 6, 8].map((index) => CATEGORY_COLORS[index]);
const SWATCH_NAMES = [
  'categories.swatchPeach', 'categories.swatchBlue', 'categories.swatchLilac', 'categories.swatchPink', 'categories.swatchYellow', 'categories.swatchSky', 'categories.swatchSlate',
] as const;

/** The picker's twelve, by the board's names. */
const GLYPH_NAMES: Readonly<Record<string, string>> = {
  food: 'categories.glyphFood',
  coffee: 'categories.glyphCoffee',
  car: 'categories.glyphCar',
  bag: 'categories.glyphBag',
  home: 'categories.glyphHome',
  receipt: 'categories.glyphReceipt',
  heart: 'categories.glyphHeart',
  lotus: 'categories.glyphLotus',
  gift: 'categories.glyphGift',
  phone: 'categories.glyphPhone',
  paw: 'categories.glyphPaw',
  book: 'categories.glyphBook',
};

/** Today's over-total refusal (categoriesModel's overTotalText), with its amounts given here so private mode can mask them. */
const OVER_TOTAL = "Category limits would add up to {total}, more than this month's budget of {overall}.";

/** The swatch's size, and the circle drawn in it. */
const SWATCH = 44;
const SWATCH_FILL = 34;
const GLYPH_BUTTON = 48;
/** The tray's switch (wc-category-edit): 56 × 44 pt, a 51 × 31 track. */
const SWITCH = { width: 56, height: 44, track: { width: 51, height: 31 }, thumb: 27 } as const;

/**
 * A category's mark: its glyph, or else its name's first letter
 * (categoryInitial, which skips a leading Thai vowel), in ink, at the kit's
 * proportions (an initial is 5/6 of the glyph). Decorative.
 */
export function CategoryMark({ glyph, name, size }: { glyph: GlyphKey | null; name: string; size: number }) {
  const colors = useWalletColors();
  const initial = Math.round((size * 5) / 6);
  return (
    <View {...DECORATIVE}>
      {glyph === null ? (
        <WalletText role="label" allowFontScaling={false} style={{ fontSize: initial, lineHeight: walletLineHeight(initial, 'thai'), fontWeight: '700' }}>
          {categoryInitial(name)}
        </WalletText>
      ) : (
        <CategoryGlyph glyph={glyph} size={size} color={colors.ink} />
      )}
    </View>
  );
}

export type CategoryTrayProps = {
  visible: boolean;
  onClose(): void;
  /** The category to change, or null for a new one. */
  category: CategoryDto | null;
  /** A new category's type, the one the grid shows. */
  type: CategoryType;
  /** This month's budget as the screen read it; null when the month has none. */
  budget: BudgetDto | null;
};

/** One opening of the tray. */
type Session = {
  readonly draft: CategoryDraft;
  /** The glyph picked, and the one the category showed when the tray opened. */
  readonly glyph: GlyphKey | null;
  readonly shownGlyph: GlyphKey | null;
  readonly limitOn: boolean;
  /** A key was pressed in the limit field this opening, so a stored limit is no longer masked. */
  readonly limitTyped: boolean;
  readonly step: 'edit' | 'archive';
  readonly errors: FormErrors;
  /** It changed on another device and there is no copy of theirs: only Reload is offered. */
  readonly gone: boolean;
};

function startSession(category: CategoryDto | null, type: CategoryType, budget: BudgetDto | null, shownGlyph: GlyphKey | null): Session {
  const draft = category ? editCategoryDraft(category, budget) : newCategoryDraft({ id: newId(), type, color: TRAY_SWATCHES[0] });
  return { draft, glyph: shownGlyph, shownGlyph, limitOn: draft.limitText !== '', limitTyped: false, step: 'edit', errors: {}, gone: false };
}

export function CategoryTray({ visible, onClose, category, type, budget }: CategoryTrayProps) {
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const locale = useMoneyLocale();
  const colors = useWalletColors();
  const large = useLargeText();
  const { hidden } = usePrivateMode();
  const { accountId } = useDiaryView();
  const { iconOf, setIcon } = useCategoryIcons();
  const [session, setSession] = useState<Session>(() => startSession(category, type, budget, category ? iconOf(category) : null));
  const commands = useCategoryCommands({
    rebase: (draft) => setSession((now) => ({ ...now, draft })),
    stopped: () => setSession((now) => ({ ...now, step: 'edit' })),
    saved: () => {
      keepIcon();
      onClose();
    },
    changedElsewhere: () => setSession((now) => ({ ...now, gone: true, step: 'edit' })),
    fieldErrors: (errors) => setSession((now) => ({ ...now, errors })),
  });

  // Each opening starts afresh (no failure from the last one), unless its send is unconfirmed: that keeps
  // today's frozen Try again with the same draft until the outcome is known.
  const [opened, setOpened] = useState(visible);
  if (visible !== opened) {
    setOpened(visible);
    if (visible && commands.status !== 'unconfirmed') {
      setSession(startSession(category, type, budget, category ? iconOf(category) : null));
      commands.setMessage(null);
      commands.setConflict(null);
    }
  }

  const { draft, glyph, limitOn, limitTyped, step, errors, gone } = session;
  const builtin = draft.builtinKey !== null;
  /** Sending, or unconfirmed: nothing changes (today's rule). */
  const frozen = commands.status !== 'idle';
  const saving = commands.status === 'saving';
  const stale = gone || commands.conflict !== null;
  const name = draftName(draft, tc);
  const money = (minor: Minor) => (hidden ? HIDDEN_AMOUNT : walletMoneyText(minor));
  const showLimit = hasLimitField(draft, budget);

  // A name too long or not one line is said as it is typed; an empty one when saving.
  const live = checkLabel(draft.label, builtin);
  const labelError = errors.label ?? (!live.ok && live.problem !== 'empty' ? tc(LABEL_PROBLEM_TEXT[live.problem]) : null);
  // A limit over the month's budget is said as it is typed; a mistyped amount when saving.
  const read = readLimit(draft.limitText, locale);
  const fits = showLimit && read.ok ? checkLimits(budget, draft.id, read.minor) : null;
  const overTotal = fits && !fits.ok
    ? fits.problem === 'too_many' ? tc(LIMIT_PROBLEM_TEXT.too_many) : tc(OVER_TOTAL, { total: money(fits.total), overall: money(fits.overall) })
    : null;
  const limitError = errors.limit ?? overTotal;
  const total = showLimit && fits?.ok && read.ok && read.minor !== null ? t('categories.limitsTotal', { total: money(fits.total), budget: money(budget.overall_limit_minor) }) : null;
  const masked = hidden && !limitTyped && draft.limitText !== '';

  /** Keeps the picked glyph for the account, once the category exists, when it is not what the category already shows. */
  function keepIcon() {
    if (glyph !== null && glyph !== session.shownGlyph) void setIcon(draft.id, glyph);
  }

  /** Changes the draft (its fields are disabled while frozen); a field's old problem goes as it is edited (today's rule). */
  function edit(patch: Partial<CategoryDraft>, more: Partial<Session> = {}) {
    setSession((now) => ({
      ...now,
      ...more,
      draft: { ...now.draft, ...patch },
      errors: { label: 'label' in patch ? undefined : now.errors.label, limit: 'limitText' in patch || 'type' in patch ? undefined : now.errors.limit },
    }));
  }

  /** planSave's problems in words, with private mode's masked amounts. */
  function problems(): FormErrors {
    const label = checkLabel(draft.label, builtin);
    return {
      label: label.ok ? undefined : tc(LABEL_PROBLEM_TEXT[label.problem]),
      limit: !showLimit ? undefined : !read.ok ? tc(LIMIT_PROBLEM_TEXT[read.problem]) : overTotal ?? undefined,
    };
  }

  /** Save (offered only while nothing is sent or unconfirmed, and not while blocked; the hook sends one at a time). */
  function submit() {
    const plan = planSave(draft, { budget, tc, locale });
    if (!plan.ok) {
      setSession((now) => ({ ...now, errors: problems() }));
      return;
    }
    if (plan.commands.length === 0) {
      // Nothing for Jotbun: the category is already accepted, so a new icon is kept at once.
      keepIcon();
      onClose();
      return;
    }
    void commands.send(plan.commands, { success: tc('Saved.'), draft, seen: budget });
  }

  function archive() {
    const base = draft.base;
    if (base === null) return;
    void commands.send([archiveCommand(base, 'archive')], { success: tc('{name} is archived.', { name }), draft, seen: budget });
  }

  const title = step === 'archive' ? tc('Archive {name}?', { name }) : draft.base === null ? t('categories.new') : name;
  const notice = commands.conflict?.view.message ?? commands.message;
  const footer = (
    <>
      {notice ? <WalletText testID="category-tray-problem" role="label" accessibilityRole="alert">{notice}</WalletText> : null}
      {commands.status === 'unconfirmed' ? (
        <PrimaryButton testID="category-tray-retry" label={t('common.tryAgain')} disabled={commands.resendBlocked} onPress={commands.tryAgain} />
      ) : stale ? (
        <TextLink label={tc('Reload')} onPress={onClose} />
      ) : step === 'archive' ? (
        <PrimaryButton testID="category-tray-archive" label={tc('Archive')} busy={saving} busyLabel={tc('Saving…')} disabled={commands.blocked} onPress={archive} />
      ) : (
        <PrimaryButton
          testID="category-tray-save"
          label={draft.mode === 'create' ? tc('Add this category') : tc('Save changes')}
          busy={saving}
          busyLabel={tc('Saving…')}
          disabled={commands.blocked}
          onPress={submit}
        />
      )}
    </>
  );

  return (
    <Tray
      visible={visible}
      onClose={onClose}
      title={title}
      step={step}
      onBack={step === 'archive' && !frozen ? () => setSession((now) => ({ ...now, step: 'edit' })) : undefined}
      footer={footer}
      locked={saving}
      testID="category-tray"
    >
      {step === 'archive' ? (
        <WalletText testID="category-archive-words">
          {tc("{name} won't show in Quick add any more. Past entries keep it, and you can unarchive it here any time.", { name })}
        </WalletText>
      ) : (
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: large ? 'column' : 'row', alignItems: large ? 'flex-start' : 'center', gap: 12 }}>
            <View
              {...DECORATIVE}
              testID="category-preview"
              style={{ width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: draft.color === null ? colors.raised : tileTint(draft.color, colors.isDark) }}
            >
              <CategoryMark glyph={glyph} name={name} size={30} />
            </View>
            <View style={{ flex: large ? undefined : 1, alignSelf: 'stretch', minWidth: 0, paddingHorizontal: 14, paddingTop: 6, borderRadius: 12, backgroundColor: colors.raised, borderBottomWidth: 2, borderBottomColor: colors.ink }}>
              {/* The field says its own name, so screen readers skip the caption above it. */}
              <WalletText role="caption" tone="quiet" {...DECORATIVE}>{t('categories.name')}</WalletText>
              <TextInput
                testID="category-name"
                accessibilityLabel={t('categories.name')}
                value={draft.label}
                onChangeText={(label) => edit({ label })}
                editable={!frozen}
                placeholder={builtin ? draftName({ ...draft, label: '' }, tc) : undefined}
                placeholderTextColor={colors.quiet}
                maxFontSizeMultiplier={WALLET_TYPE.body.maxScale}
                style={{ fontFamily: THAI_UI_FONT_FAMILY, fontSize: WALLET_TYPE.body.size, color: colors.ink, minHeight: BUN_TOUCH, padding: 0 }}
              />
            </View>
          </View>
          {labelError ? <WalletText testID="category-name-problem" role="caption" accessibilityRole="alert">{labelError}</WalletText> : null}
          {draft.mode === 'create' ? (
            <TypeSegments type={draft.type} disabled={frozen} onType={(next) => edit({ type: next })} />
          ) : null}
          {accountId === null ? null : (
            <GlyphPicker glyph={glyph} disabled={frozen} onPick={(next) => edit({}, { glyph: next })} />
          )}
          <SwatchPicker color={draft.color} disabled={frozen} onPick={(color) => edit({ color })} />
          {showLimit ? (
            <View testID="category-limit-section" style={{ gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.hairline }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <WalletText role="label" {...DECORATIVE}>{t('categories.setLimit')}</WalletText>
                  <WalletText testID="category-limit-hint" role="caption" tone="quiet">{t('categories.limitHint', { budget: money(budget.overall_limit_minor) })}</WalletText>
                </View>
                <LimitSwitch
                  on={limitOn}
                  label={t('categories.setLimit')}
                  disabled={frozen}
                  onPress={() => edit({ limitText: limitOn ? '' : draft.limitText }, { limitOn: !limitOn, limitTyped: limitOn ? false : limitTyped })}
                />
              </View>
              {limitOn ? (
                <View style={{ gap: 6 }}>
                  <View style={{ paddingHorizontal: 14, paddingTop: 6, borderRadius: 12, backgroundColor: colors.raised, borderBottomWidth: 2, borderBottomColor: colors.hairline }}>
                    <WalletText role="caption" tone="quiet" {...DECORATIVE}>{t('categories.limitField')}</WalletText>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <Text {...DECORATIVE} maxFontSizeMultiplier={amountMaxScale(22)} style={{ fontFamily: LATIN_UI_FONT_FAMILY, fontWeight: '700', fontSize: 22, color: colors.ink }}>฿</Text>
                      <TextInput
                        testID="category-limit"
                        accessibilityLabel={t('categories.limitField')}
                        value={masked ? '' : draft.limitText}
                        onChangeText={(limitText) => edit({ limitText }, { limitTyped: true })}
                        editable={!frozen}
                        placeholder={masked ? '••••' : '0'}
                        placeholderTextColor={colors.quiet}
                        keyboardType="decimal-pad"
                        maxFontSizeMultiplier={amountMaxScale(22)}
                        style={{ flex: 1, fontFamily: LATIN_UI_FONT_FAMILY, fontWeight: '700', fontSize: 22, color: colors.ink, minHeight: BUN_TOUCH, padding: 0 }}
                      />
                    </View>
                  </View>
                  {limitError ? (
                    <WalletText testID="category-limit-problem" role="caption" accessibilityRole="alert">{limitError}</WalletText>
                  ) : total ? (
                    <WalletText testID="category-limit-total" role="caption" tone="quiet">{total}</WalletText>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : draft.type === 'expense' ? (
            <WalletText testID="category-no-budget" role="caption" tone="quiet">{tc("Category limits are part of a monthly budget. Set this month's budget first.")}</WalletText>
          ) : null}
          {draft.base !== null && !frozen && !stale ? (
            <View style={{ alignItems: 'flex-start' }}>
              <TextLink label={tc('Archive category')} tone="ink" onPress={() => setSession((now) => ({ ...now, step: 'archive' }))} />
            </View>
          ) : null}
        </View>
      )}
    </Tray>
  );
}

/** รายจ่าย and รายรับ for a new category (wc-category-edit): the chosen one in the main button's fill. */
function TypeSegments({ type, disabled, onType }: { type: CategoryType; disabled: boolean; onType(type: CategoryType): void }) {
  const colors = useWalletColors();
  const large = useLargeText();
  const t = useDraftCopy(LINES);
  return (
    <View
      testID="category-type"
      role="radiogroup"
      accessibilityLabel={t('categories.typeGroup')}
      style={{ flexDirection: large ? 'column' : 'row', gap: 2, padding: 4, borderRadius: 14, backgroundColor: colors.raised }}
    >
      {(['expense', 'income'] as const).map((each) => {
        const checked = each === type;
        const label = t(each === 'expense' ? 'categories.expense' : 'categories.income');
        return (
          <Pressable
            key={each}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked, disabled }}
            aria-checked={checked}
            disabled={disabled}
            onPress={() => onType(each)}
            style={{
              flex: large ? undefined : 1,
              minHeight: BUN_TOUCH,
              borderRadius: 11,
              paddingHorizontal: 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: checked ? colors.primary : 'transparent',
              opacity: disabled ? 0.4 : 1,
            }}
          >
            <WalletText role="label" tone={checked ? 'onPrimary' : 'quiet'} style={{ fontWeight: checked ? '700' : '500', textAlign: 'center' }}>{label}</WalletText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The icon picker's twelve at 48 pt, six to a row (wc-category-edit): the chosen one in the main button's fill. */
function GlyphPicker({ glyph, disabled, onPick }: { glyph: GlyphKey | null; disabled: boolean; onPick(glyph: GlyphKey): void }) {
  const colors = useWalletColors();
  const t = useDraftCopy(LINES);
  const rows = [CATEGORY_PICKER_GLYPHS.slice(0, 6), CATEGORY_PICKER_GLYPHS.slice(6)];
  return (
    <View style={{ gap: 6 }}>
      <WalletText role="caption" tone="quiet" {...DECORATIVE}>{t('categories.icon')}</WalletText>
      <View testID="category-glyphs" role="radiogroup" accessibilityLabel={t('categories.icon')} style={{ gap: 8 }}>
        {rows.map((row, index) => (
          <View key={index} style={{ flexDirection: 'row', gap: 8 }}>
            {row.map((each) => {
              const checked = each === glyph;
              return (
                <Pressable
                  key={each}
                  testID={`category-glyph-${each}`}
                  accessibilityRole="radio"
                  accessibilityLabel={t(GLYPH_NAMES[each])}
                  accessibilityState={{ checked, disabled }}
                  aria-checked={checked}
                  disabled={disabled}
                  onPress={() => onPick(each)}
                  style={{ flex: 1, minHeight: GLYPH_BUTTON, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: checked ? colors.primary : colors.raised, opacity: disabled ? 0.4 : 1 }}
                >
                  <CategoryGlyph glyph={each} size={22} color={checked ? colors.onPrimary : colors.ink} />
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

/** The seven swatches, each a 44 pt radio named for its colour; the chosen one ringed in ink. */
function SwatchPicker({ color, disabled, onPick }: { color: string | null; disabled: boolean; onPick(color: string): void }) {
  const colors = useWalletColors();
  const t = useDraftCopy(LINES);
  return (
    <View style={{ gap: 4 }}>
      <WalletText role="caption" tone="quiet" {...DECORATIVE}>{t('categories.color')}</WalletText>
      <View testID="category-swatches" role="radiogroup" accessibilityLabel={t('categories.color')} style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 4 }}>
        {TRAY_SWATCHES.map((swatch, index) => {
          const checked = swatch === color;
          return (
            <Pressable
              key={swatch}
              testID={`category-swatch-${index}`}
              accessibilityRole="radio"
              accessibilityLabel={t(SWATCH_NAMES[index])}
              accessibilityState={{ checked, disabled }}
              aria-checked={checked}
              disabled={disabled}
              onPress={() => onPick(swatch)}
              style={{ width: SWATCH, height: SWATCH, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}
            >
              <View
                {...DECORATIVE}
                style={{
                  width: SWATCH_FILL + 8,
                  height: SWATCH_FILL + 8,
                  borderRadius: (SWATCH_FILL + 8) / 2,
                  borderWidth: 2,
                  borderColor: checked ? colors.ink : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  testID={`category-swatch-fill-${index}`}
                  style={{ width: SWATCH_FILL, height: SWATCH_FILL, borderRadius: SWATCH_FILL / 2, borderWidth: 1, borderColor: colors.hairline, backgroundColor: tileTint(swatch, colors.isDark) }}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** ตั้งวงเงินต่อเดือน: a 56 × 44 pt switch; violet when on. */
function LimitSwitch({ on, label, disabled, onPress }: { on: boolean; label: string; disabled: boolean; onPress(): void }) {
  const colors = useWalletColors();
  return (
    <Pressable
      testID="category-limit-switch"
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on, disabled }}
      aria-checked={on}
      disabled={disabled}
      onPress={onPress}
      style={{ width: SWITCH.width, height: SWITCH.height, alignItems: 'flex-end', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}
    >
      <View
        {...DECORATIVE}
        style={{
          width: SWITCH.track.width,
          height: SWITCH.track.height,
          borderRadius: SWITCH.track.height / 2,
          padding: 2,
          alignItems: on ? 'flex-end' : 'flex-start',
          backgroundColor: on ? colors.violet : colors.quiet,
        }}
      >
        <View style={{ width: SWITCH.thumb, height: SWITCH.thumb, borderRadius: SWITCH.thumb / 2, backgroundColor: colors.sheet }} />
      </View>
    </Pressable>
  );
}
```

### `apps/app/src/wallet/categories/ThaiPackTray.tsx`

```tsx
// The Thai pack tray (P2-T29; wc-thai-pack, C3): one 60 pt checkbox row per
// C3 item, with its glyph, its name in the person's language and its line.
// One the person has says มีแล้ว and cannot be picked. The picks start empty
// (ruling P5), and เพิ่ม {n} หมวด creates only the picked ones that are still
// missing (packCommands with `only`), named in the person's language.
//
// - Saving goes through useCategoryCommands. While it sends, the tray is
//   locked (Review Focus 1). An answer that never came freezes it with today's
//   Try again, which resends the same items under the same ids and keys; the
//   tray can be closed, and opened again it is still frozen until the outcome
//   is known (B4). A refusal says so, and Reload closes the tray so the screen
//   reads again: the items it did add are then shown as มีแล้ว, so none is
//   added twice. Every other opening starts afresh.
// - Pack categories show their glyph through iconFor (by name, W8), so no
//   icon is kept for them.
import type { CategoryDto } from '@gogospend/contracts';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { useCategoryCommands } from '@mobile/screens/redesign/planning/categoryCommands';
import { newId } from '@mobile/screens/v1/parts';
import { THAI_EVERYDAY_PACK, missingPackItems, packCommands } from '@mobile/spend/v1/redesign/planning/thaiPack';
import type { C3Item, PackKey } from '@mobile/spend/v1/redesign/planning/thaiPack';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from '@mobile/ui/a11y';
import { COMMON_COPY } from '../common/copy';
import { useDraftCopy } from '../copy/useDraftCopy';
import { WalletCategoryIcon } from '../looks/WalletCategoryIcon';
import { PrimaryButton } from '../tray/PrimaryButton';
import { TextLink } from '../tray/TextLink';
import { Tray } from '../tray/Tray';
import { WalletText } from '../WalletText';
import { COPY } from './copy';

const LINES = { ...COMMON_COPY, ...COPY } as const;

/** A row's height (wc-thai-pack) and its check circle. */
const ROW = 60;
const CHECK = 28;

export type ThaiPackTrayProps = {
  visible: boolean;
  onClose(): void;
  /** The person's categories, archived ones included. */
  categories: readonly CategoryDto[];
};

/** A C3 item as WalletCategoryIcon reads a category: by its name, so iconFor finds its pack glyph. */
const asCategory = (item: C3Item, name: string) => ({ id: `pack-${item.key}`, builtin_key: null, color: item.color, label: name, type: item.type });

export function ThaiPackTray({ visible, onClose, categories }: ThaiPackTrayProps) {
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const locale = useActiveLocale();
  const colors = useWalletColors();
  const [picked, setPicked] = useState<ReadonlySet<PackKey>>(() => new Set());
  const commands = useCategoryCommands({
    rebase: () => undefined,
    stopped: () => undefined,
    saved: () => onClose(),
    changedElsewhere: () => undefined,
    fieldErrors: () => undefined,
  });

  // Each opening starts afresh, with nothing picked, unless its send is unconfirmed: that keeps today's
  // frozen Try again with the same picks until the outcome is known.
  const [opened, setOpened] = useState(visible);
  if (visible !== opened) {
    setOpened(visible);
    if (visible && commands.status !== 'unconfirmed') {
      setPicked(new Set());
      commands.setMessage(null);
      commands.setConflict(null);
    }
  }

  const missing = new Set(missingPackItems(categories).map((item) => item.key));
  const frozen = commands.status !== 'idle';
  const refused = !frozen && (commands.message !== null || commands.conflict !== null);
  const chosen = THAI_EVERYDAY_PACK.filter((item) => picked.has(item.key) && missing.has(item.key)).map((item) => item.key);

  /** A row the person has, or any row while a send is out or refused, is disabled, so it never reaches here. */
  function toggle(key: PackKey) {
    setPicked((now) => {
      const next = new Set(now);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** Add is offered only with something picked, not while blocked, and the hook sends one at a time. */
  function add() {
    void commands.send(packCommands(categories, locale, newId, { only: chosen }), { success: tc('Added. They are in Quick add now.'), draft: null, seen: null });
  }

  const notice = commands.conflict?.view.message ?? commands.message;
  const footer = (
    <>
      {notice ? <WalletText testID="thai-pack-problem" role="label" accessibilityRole="alert">{notice}</WalletText> : null}
      {commands.status === 'unconfirmed' ? (
        <PrimaryButton testID="thai-pack-retry" label={t('common.tryAgain')} disabled={commands.resendBlocked} onPress={commands.tryAgain} />
      ) : refused ? (
        <TextLink label={tc('Reload')} onPress={onClose} />
      ) : (
        <PrimaryButton
          testID="thai-pack-add"
          label={chosen.length === 1 ? t('categories.packAddOne') : t('categories.packAdd', { n: chosen.length })}
          busy={commands.status === 'saving'}
          busyLabel={tc('Saving…')}
          disabled={chosen.length === 0 || commands.blocked}
          onPress={add}
        />
      )}
    </>
  );

  return (
    <Tray visible={visible} onClose={onClose} title={t('categories.packHeading')} footer={footer} locked={commands.status === 'saving'} testID="thai-pack-tray">
      <WalletText role="body" tone="quiet">{t('categories.packIntro')}</WalletText>
      <View testID="thai-pack-items" role="group" accessibilityLabel={t('categories.packPick')}>
        {THAI_EVERYDAY_PACK.map((item, index) => {
          const name = locale === 'th' ? item.th : item.en;
          const had = !missing.has(item.key);
          const checked = !had && picked.has(item.key);
          const disabled = had || frozen || refused;
          return (
            <Pressable
              key={item.key}
              testID={`thai-pack-${item.key}`}
              accessibilityRole="checkbox"
              accessibilityLabel={name}
              accessibilityState={{ checked, disabled }}
              aria-checked={checked}
              aria-disabled={disabled}
              disabled={disabled}
              onPress={() => toggle(item.key)}
              style={{
                minHeight: ROW,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 8,
                borderBottomWidth: index === THAI_EVERYDAY_PACK.length - 1 ? 0 : 1,
                borderBottomColor: colors.hairline,
              }}
            >
              <WalletCategoryIcon category={asCategory(item, name)} name={name} size={42} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <WalletText role="label" tone={had ? 'quiet' : 'ink'} style={{ fontWeight: '700' }}>{name}</WalletText>
                <WalletText role="caption" tone="quiet">{t(`pack.${item.key}`)}</WalletText>
              </View>
              {had ? (
                <View style={{ minHeight: CHECK, justifyContent: 'center', paddingHorizontal: 10, borderRadius: CHECK / 2, backgroundColor: colors.raised }}>
                  <WalletText role="caption" tone="quiet">{t('categories.packHave')}</WalletText>
                </View>
              ) : (
                <View
                  {...DECORATIVE}
                  style={{
                    width: CHECK,
                    height: CHECK,
                    borderRadius: CHECK / 2,
                    borderWidth: 2,
                    borderColor: checked ? colors.primary : colors.quiet,
                    backgroundColor: checked ? colors.primary : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {checked ? (
                    <Svg width={14} height={14} viewBox="0 0 24 24">
                      <Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={colors.onPrimary} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  ) : null}
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.raised }}>
        <View {...DECORATIVE} style={{ paddingTop: 2 }}>
          <Svg width={16} height={16} viewBox="0 0 24 24">
            <Circle cx={12} cy={12} r={9} fill="none" stroke={colors.ink} strokeWidth={1.8} />
            <Path d="M12 11v6 M12 7.5v.5" fill="none" stroke={colors.ink} strokeWidth={1.8} strokeLinecap="round" />
          </Svg>
        </View>
        <WalletText role="caption" style={{ flex: 1 }}>{t('categories.packNote')}</WalletText>
      </View>
    </Tray>
  );
}
```

### `apps/app/src/wallet/categories/copy.ts`

```ts
import type { DraftTable } from '../copy/draftText.ts';

/**
 * The categories screen's lines (wc-categories), the category tray's
 * (wc-category-edit) and the Thai pack tray's (wc-thai-pack). Data only: read
 * through `useDraftCopy` with COMMON_COPY. Lines already in the catalogs (the
 * loading, save, archive and refusal messages, เพิ่มหมวดนี้, บันทึกการแก้ไข,
 * นำกลับมาใช้) are read through `tc()` instead.
 *
 * Default pending owner Q3: built as written. The English lines, the Thai
 * lines no board shows (pack.pets, pack.family_in, categories.tileIncome,
 * categories.packAddOne) and the board's own names for the swatches, glyphs,
 * fields and the type group are drafts for E2-C.
 */
export const COPY = {
  'categories.title': { th: 'หมวดหมู่', en: 'Categories' },
  'categories.expense': { th: 'รายจ่าย', en: 'Spending' },
  'categories.income': { th: 'รายรับ', en: 'Income' },
  'categories.typeGroup': { th: 'ประเภทหมวด', en: 'Category type' },
  'categories.packTitle': { th: 'เพิ่มชุดหมวด', en: 'Add a set of categories' },
  'categories.packName': { th: 'ชีวิตประจำวันแบบไทย', en: 'Thai everyday life' },
  'categories.packMore': { th: 'และอีก {n} หมวด', en: 'and {n} more' },
  'categories.builtins': { th: 'หมวดตั้งต้น', en: 'Built-in categories' },
  'categories.thisMonth': { th: 'เดือนนี้', en: 'This month' },
  'categories.custom': { th: 'หมวดของคุณ', en: 'Your categories' },
  'categories.limit': { th: 'งบ {amount}', en: 'Limit {amount}' },
  'categories.over': { th: 'เกิน {amount}', en: '{amount} over' },
  'categories.unlimited': { th: 'ไม่จำกัด', en: 'No limit' },
  'categories.tileLabel': { th: '{name} ใช้ไป {spent} จากงบ {limit}', en: '{name}, spent {spent} of {limit}' },
  'categories.tileOver': { th: '{name} ใช้ไป {spent} เกินงบ {over}', en: '{name}, spent {spent}, {over} over the limit' },
  'categories.tileUnlimited': { th: '{name} ใช้ไป {spent} ไม่จำกัดงบ', en: '{name}, spent {spent}, no limit' },
  'categories.tileIncome': { th: '{name} ได้รับ {amount}', en: '{name}, received {amount}' },
  'categories.new': { th: 'หมวดใหม่', en: 'New category' },
  'categories.name': { th: 'ชื่อหมวด', en: 'Category name' },
  'categories.icon': { th: 'ไอคอน', en: 'Icon' },
  'categories.color': { th: 'สี', en: 'Colour' },
  'categories.setLimit': { th: 'ตั้งวงเงินต่อเดือน', en: 'Monthly limit' },
  'categories.limitHint': { th: 'ไม่ตั้งก็ได้ นับรวมในงบเดือนนี้ {budget}', en: "Optional. It counts towards this month's {budget} budget" },
  'categories.limitField': { th: 'วงเงินต่อเดือน', en: 'Limit a month' },
  'categories.limitsTotal': { th: 'วงเงินทุกหมวดรวมกันจะเป็น {total} จากงบ {budget}', en: 'All category limits will add up to {total} of the {budget} budget' },
  'categories.swatchPeach': { th: 'สีส้มพีช', en: 'Peach' },
  'categories.swatchBlue': { th: 'สีฟ้า', en: 'Blue' },
  'categories.swatchLilac': { th: 'สีม่วงอ่อน', en: 'Lilac' },
  'categories.swatchPink': { th: 'สีชมพู', en: 'Pink' },
  'categories.swatchYellow': { th: 'สีเหลือง', en: 'Yellow' },
  'categories.swatchSky': { th: 'สีเทาฟ้า', en: 'Sky grey' },
  'categories.swatchSlate': { th: 'สีเทาม่วง', en: 'Lavender grey' },
  'categories.glyphFood': { th: 'อาหาร', en: 'Food' },
  'categories.glyphCoffee': { th: 'กาแฟ', en: 'Coffee' },
  'categories.glyphCar': { th: 'รถ', en: 'Car' },
  'categories.glyphBag': { th: 'ถุงช้อปปิ้ง', en: 'Shopping bag' },
  'categories.glyphHome': { th: 'บ้าน', en: 'Home' },
  'categories.glyphReceipt': { th: 'ใบเสร็จ', en: 'Receipt' },
  'categories.glyphHeart': { th: 'หัวใจ', en: 'Heart' },
  'categories.glyphLotus': { th: 'ดอกบัว', en: 'Lotus' },
  'categories.glyphGift': { th: 'ของขวัญ', en: 'Gift' },
  'categories.glyphPhone': { th: 'มือถือ', en: 'Phone' },
  'categories.glyphPaw': { th: 'รอยเท้าสัตว์', en: 'Paw print' },
  'categories.glyphBook': { th: 'หนังสือ', en: 'Book' },
  'categories.packHeading': { th: 'ชุดหมวดแบบไทย', en: 'Thai everyday set' },
  'categories.packIntro': { th: 'หมวดที่ใช้กันทุกวันในไทย เลือกเฉพาะที่ใช่ แล้วเพิ่มทีเดียว', en: 'Categories people in Thailand use every day. Pick the ones that fit, then add them at once.' },
  'categories.packPick': { th: 'เลือกหมวดที่จะเพิ่ม', en: 'Pick the categories to add' },
  'categories.packHave': { th: 'มีแล้ว', en: 'Already yours' },
  'categories.packNote': {
    th: 'เพิ่มแล้วเป็นหมวดของคุณเหมือนหมวดอื่น เปลี่ยนชื่อ ไอคอน สี หรือเก็บถาวรได้ทุกเมื่อ',
    en: 'Once added they are yours like any other: rename them, change the icon or colour, or archive them any time.',
  },
  'categories.packAdd': { th: 'เพิ่ม {n} หมวด', en: 'Add {n} categories' },
  'categories.packAddOne': { th: 'เพิ่ม 1 หมวด', en: 'Add 1 category' },
  'pack.family_out': { th: 'เงินที่โอนให้พ่อแม่หรือญาติ', en: 'Money you send to parents or relatives' },
  'pack.merit': { th: 'ใส่บาตร ทำบุญที่วัด หรือบริจาค', en: 'Alms, temple offerings or donations' },
  'pack.delivery': { th: 'สั่งอาหารผ่านแอป รวมค่าส่ง', en: 'Food ordered through apps, delivery included' },
  'pack.motorbike_rail': { th: 'วิน BTS และ MRT แยกจากเดินทางอื่น', en: 'Motorbike taxis, BTS and MRT, apart from other travel' },
  'pack.topup': { th: 'เติมเงินหรือจ่ายค่าโทรรายเดือน', en: 'Top-ups or the monthly phone bill' },
  'pack.seven': { th: 'ของกินของใช้จากร้านสะดวกซื้อ', en: 'Food and things from convenience stores' },
  'pack.lottery': { th: 'สลากงวดวันที่ 1 และ 16', en: 'Lottery tickets for the 1st and the 16th' },
  'pack.pets': { th: 'อาหารและค่าหมอของสัตว์เลี้ยง', en: 'Food and vet bills for your pets' },
  'pack.family_in': { th: 'เงินที่พ่อแม่หรือญาติโอนมาให้', en: 'Money parents or relatives send you' },
} as const satisfies DraftTable;
```

### `apps/app/app/spend/categories.tsx`

```tsx
import { Redirect } from 'expo-router';

import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isLegacySpendEnabled, isRedesignEnabled } from '@mobile/config/featureFlags';
import { CategoriesScreen } from '@mobile/screens/redesign/planning/CategoriesScreen';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';
import { WalletCategoriesScreen } from '@mobile/wallet/categories/WalletCategoriesScreen';

/**
 * The Bun Wallet's categories while the `wallet` area is on (W1, P2-T29).
 * Otherwise R4 Planning's screen, only under the `planning` area (E2
 * checkpoint 2). Never in the legacy build.
 */
export default function SpendCategoriesRoute() {
  if (isLegacySpendEnabled()) return <Redirect href="/spend" />;
  if (isRedesignEnabled('wallet')) return <SpendV1Provider resources={getSharedV1Resources()}><WalletCategoriesScreen /></SpendV1Provider>;
  if (!isRedesignEnabled('planning')) return <Redirect href="/spend" />;
  return <SpendV1Provider resources={getSharedV1Resources()}><CategoriesScreen /></SpendV1Provider>;
}
```

### `apps/app/src/dev/catalogue/wallet/categorySections.tsx`

```tsx
// The Bun Wallet's categories in the catalogue (P2-T29, development only),
// each drawn by the real WalletCategoriesScreen on fakes (R72), in the
// catalogue's own language and theme:
// - bw-categories: wc-categories' month: six built-ins with their spending,
//   one of them over its limit, two of the person's own (one a C3 item, so
//   the pack card names the rest), and the new tile;
// - bw-category-new: the category tray for a new category, named, with an
//   icon and a colour picked (wc-category-edit);
// - bw-category-limit: the tray for อาหาร, whose limit shows with the month's
//   total;
// - bw-thai-pack: the Thai pack tray with three items picked and the one the
//   person has marked มีแล้ว (wc-thai-pack).
// Their own list, spread after the wallets list's in ./index.ts.
//
// - The kept icons belong to a catalogue account of its own, never the
//   person's: each time a section opens, its fake diary opens that account and
//   the board's icon for ครอบครัว is written before the screen mounts, so
//   every opening starts from the board.
// - The screen is loaded when a section opens, not when this list is read: it
//   reaches the category commands' keys (screens/v1/parts.tsx loads
//   expo-crypto) and expo-router, which the kit's suites that read the
//   wallet's list do not stand in for (the catalogue's own suites do).
// - A section never imports the wallet test harness, which loads vitest.
import type { BudgetDto, CategoryDto, MonthSummary } from '@gogospend/contracts';
import { lazy, Suspense } from 'react';

import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { BUILTINS, createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import { CATEGORY_ICONS_NAME, WalletLooksProvider } from '@mobile/wallet/looks/WalletLooksProvider';
import { walletAccountStore } from '@mobile/wallet/store/deviceWalletStore';
import type { CatalogueSection } from '../registry';
import { CATALOGUE_NOW } from '../screenFixtures';
import { screenSection } from '../screenSection';
import type { ScreenFixture, ScriptStep } from '../screenSection';

const WalletCategoriesScreen = lazy(() => import('@mobile/wallet/categories/WalletCategoriesScreen').then((module) => ({ default: module.WalletCategoriesScreen })));

/** The catalogue's own account: its kept icons are never the person's. */
const CATALOGUE_ACCOUNT = '0000000c-0000-4000-8000-00000000ca7b';

const [FOOD, TRAVEL, BILLS, SALARY, GIFT] = BUILTINS as [CategoryDto, CategoryDto, CategoryDto, CategoryDto, CategoryDto];
const builtin = (n: string, key: 'household' | 'shopping' | 'fun', color: string): CategoryDto => ({
  id: `0000000c-0000-4000-8000-0000000000b${n}`, type: 'expense', builtin_key: key, label: null, color, archived: false, version: 1,
});
const HOUSEHOLD = builtin('1', 'household', '#B49BE8');
const SHOPPING = builtin('2', 'shopping', '#F291C4');
const FUN = builtin('3', 'fun', '#F2CE5C');
const custom = (n: string, label: string, color: string): CategoryDto => ({
  id: `0000000c-0000-4000-8000-0000000000c${n}`, type: 'expense', builtin_key: null, label, color, archived: false, version: 1,
});
/** wc-categories' two of the person's own: ครอบครัว (its heart is kept) and ทำบุญ (C3's merit, so its lotus comes from the pack). */
const FAMILY = custom('1', 'ครอบครัว', '#F291C4');
const MERIT = custom('2', 'ทำบุญ', '#F2CE5C');

/** wc-categories' month: ฿18,000, with อาหาร ฿6,000, เดินทาง ฿2,500 and ช้อปปิ้ง ฿2,000. */
const BUDGET: BudgetDto = {
  id: '0000000d-0000-4000-8000-0000000000c1',
  month: '2026-09',
  overall_limit_minor: '1800000',
  category_limits: [
    { category_id: FOOD.id, limit_minor: '600000' },
    { category_id: TRAVEL.id, limit_minor: '250000' },
    { category_id: SHOPPING.id, limit_minor: '200000' },
  ],
  version: 1,
};

/** wc-categories' spending this month; ช้อปปิ้ง is ฿310 over. */
const TOTALS: MonthSummary['categories'] = [
  { category_id: FOOD.id, type: 'expense', total_minor: '462000' },
  { category_id: TRAVEL.id, type: 'expense', total_minor: '198000' },
  { category_id: SHOPPING.id, type: 'expense', total_minor: '231000' },
  { category_id: BILLS.id, type: 'expense', total_minor: '27000' },
  { category_id: FAMILY.id, type: 'expense', total_minor: '300000' },
  { category_id: MERIT.id, type: 'expense', total_minor: '30000' },
  { category_id: SALARY.id, type: 'income', total_minor: '2800000' },
];

/** The fakes' summary keeps no per-category totals; this month's are the board's. */
function withTotals(resources: SpendV1Resources): SpendV1Resources {
  return { ...resources, summary: async (month: string) => ({ ...(await resources.summary(month)), categories: TOTALS }) };
}

function fixture(): ScreenFixture {
  return {
    resources: withTotals(createFakeResources({ categories: [FOOD, TRAVEL, HOUSEHOLD, BILLS, SHOPPING, FUN, FAMILY, MERIT, SALARY, GIFT], budgets: [BUDGET] }).resources),
    diary: createFakeDiary({ accountId: CATALOGUE_ACCOUNT }).diary,
    // The board's icon for ครอบครัว, written afresh each time the section opens.
    prepare: async () => {
      await walletAccountStore(CATALOGUE_ACCOUNT).set(CATEGORY_ICONS_NAME, JSON.stringify({ [FAMILY.id]: 'heart' }));
    },
  };
}

function Stage() {
  return (
    <WalletLooksProvider>
      <Suspense fallback={null}>
        <WalletCategoriesScreen now={CATALOGUE_NOW} />
      </Suspense>
    </WalletLooksProvider>
  );
}

/** The grid is drawn once the built-ins show. */
const LISTED: ScriptStep = { waitFor: 'categories-builtins' };
const press = (testID: string): ScriptStep => ({ call: 'onPress', on: { testID } });

export const WALLET_CATEGORY_SECTIONS: readonly CatalogueSection[] = [
  screenSection({
    id: 'bw-categories',
    title: 'Bun Wallet: categories',
    fixture,
    script: () => [LISTED],
    render: () => <Stage />,
  }),
  screenSection({
    id: 'bw-category-new',
    title: 'Bun Wallet: category tray, new',
    fixture,
    script: () => [
      LISTED,
      press('categories-new-tile'),
      { waitFor: 'category-name' },
      { call: 'onChangeText', on: { testID: 'category-name' }, args: ['สัตว์เลี้ยง'] },
      press('category-glyph-paw'),
      press('category-swatch-1'),
    ],
    render: () => <Stage />,
  }),
  screenSection({
    id: 'bw-category-limit',
    title: 'Bun Wallet: category tray, a limit',
    fixture,
    script: () => [LISTED, press(`category-tile-${FOOD.id}`), { waitFor: 'category-limit-total' }],
    render: () => <Stage />,
  }),
  screenSection({
    id: 'bw-thai-pack',
    title: 'Bun Wallet: Thai pack tray',
    fixture,
    script: () => [LISTED, press('categories-pack'), { waitFor: 'thai-pack-items' }, press('thai-pack-family_out'), press('thai-pack-delivery'), press('thai-pack-motorbike_rail')],
    render: () => <Stage />,
  }),
];
```

### `apps/app/src/wallet/categories/WalletCategories.render.test.tsx`

```tsx
// The Bun Wallet's Categories screen, its category tray and the Thai pack
// tray (P2-T29; wc-categories, wc-category-edit, wc-thai-pack). Each case
// mounts through mountWallet, in Thai and by day unless it says otherwise.
//
// The plan's seven cases come first, then the fix round's (the review of
// P2-T29: B1 to B4, M1 to M12, m1 to m13), then the four P2-T11 carried
// (followups: its m2 and n5), which hold WalletCategoryIcon's glyph and
// initial, not this task's screens.
//
// Reanimated keeps a tray's card unseen (visibility: hidden) until its
// entering animation starts, which happy-dom never fires, and queries by role
// skip what is unseen: startAnimations() fires it, as Tray.render.test.tsx
// does. react-native-web drops numberOfLines from the DOM, so the props that
// reach the app's Text are recorded, as WalletsList.render.test.tsx does.
// Every lookup asserts, so a missing part fails as an AssertionError.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-router', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
// The commands' keys and a new category's id come from the device's id maker (as the catalogue suites mock it).
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
const seen = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock('@mobile/theme/AppText', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mobile/theme/AppText')>();
  const { createElement, forwardRef } = await import('react');
  const Text = forwardRef<unknown, Record<string, unknown>>(function RecordedText(props, ref) {
    seen.props.push(props);
    return createElement(actual.Text as never, { ...props, ref });
  });
  return { ...actual, Text };
});

import { CATEGORY_COLORS } from '@gogospend/contracts';
import type { BudgetDto, CategoryDto, MonthSummary } from '@gogospend/contracts';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';

import { mountInApp, rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
import { router } from '@mobile/dev/catalogue/routerTestStub';
import { WALLET_SECTIONS } from '@mobile/dev/catalogue/wallet';
import { translateCopy } from '@mobile/i18n/messages';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { BUILTINS, createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import { contrastRatio } from '@mobile/theme/contrast';
import { ThemePreferenceOverride } from '@mobile/theme/ThemeProvider';
import { tileTint, walletDark, walletLight } from '@mobile/theme/walletPalette';
import { walletLineHeight } from '@mobile/theme/walletType';
import { WALLET_CATEGORY_SECTIONS } from '../../dev/catalogue/wallet/categorySections';
import { COMMON_COPY } from '../common/copy';
import { draftText } from '../copy/draftText';
import type { CopyValues } from '../copy/draftText';
import { CATEGORY_ICONS_NAME } from '../looks/WalletLooksProvider';
import { CategoryGlyph, WalletCategoryIcon } from '../looks/WalletCategoryIcon';
import { PRIVATE_MODE_NAME } from '../privacy/PrivateModeProvider';
import { AX5, TEST_ACCOUNT_ID, mountWallet } from '../testing/walletHarness';
import type { MountWalletOptions } from '../testing/walletHarness';
import { CategoryTray, TRAY_SWATCHES } from './CategoryTray';
import { COPY } from './copy';
import { ThaiPackTray } from './ThaiPackTray';
import { WalletCategoriesScreen } from './WalletCategoriesScreen';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const fn of [router.push, router.replace, router.back]) fn.mockReset();
  router.canGoBack.mockReset();
  router.canGoBack.mockReturnValue(true);
  seen.props.length = 0;
});

// ---------------------------------------------------------------------------
// The board's month

const NOW = new Date('2026-09-29T03:00:00Z');
const MONTH = '2026-09';
type Locale = 'th' | 'en';
const LOCALES: readonly Locale[] = ['th', 'en'];
const MODES = [['light', walletLight], ['dark', walletDark]] as const;

const [FOOD, TRAVEL, BILLS, SALARY, GIFT] = BUILTINS as [CategoryDto, CategoryDto, CategoryDto, CategoryDto, CategoryDto];
/** ช้อปปิ้ง, over its limit, on the one hue whose tint `over` cannot read on by day (4.38:1; the card chip reads 5.86:1). */
const SHOPPING: CategoryDto = { id: '0000000c-0000-4000-8000-0000000000b2', type: 'expense', builtin_key: 'shopping', label: null, color: '#4E93D9', archived: false, version: 1 };
const PETS: CategoryDto = { id: '0000000c-0000-4000-8000-0000000000a1', type: 'expense', builtin_key: null, label: 'Pets', color: CATEGORY_COLORS[2], archived: false, version: 1 };
/** C3's merit, by its Thai name: a pack category, whose lotus comes from the pack. */
const MERIT: CategoryDto = { id: '0000000c-0000-4000-8000-0000000000a3', type: 'expense', builtin_key: null, label: 'ทำบุญ', color: '#F2CE5C', archived: false, version: 1 };
const OLD: CategoryDto = { id: '0000000c-0000-4000-8000-0000000000a2', type: 'expense', builtin_key: null, label: 'Old hobby', color: CATEGORY_COLORS[9], archived: true, version: 3 };
/** One of the person's own with no colour: its tile is `raised`. */
const PLAIN: CategoryDto = { id: '0000000c-0000-4000-8000-0000000000a5', type: 'expense', builtin_key: null, label: 'Plain', color: null, archived: false, version: 1 };

/** ฿20,000, with อาหาร ฿6,000, การเดินทาง ฿100 and ช้อปปิ้ง ฿2,000 (฿8,100 of limits). */
const BUDGET: BudgetDto = {
  id: '0000000d-0000-4000-8000-000000000001',
  month: MONTH,
  overall_limit_minor: '2000000',
  category_limits: [
    { category_id: FOOD.id, limit_minor: '600000' },
    { category_id: TRAVEL.id, limit_minor: '10000' },
    { category_id: SHOPPING.id, limit_minor: '200000' },
  ],
  version: 4,
};

/** This month: อาหาร under its limit, การเดินทาง exactly at it, ช้อปปิ้ง ฿310 over, ค่าบิล with no limit, and a salary. */
const TOTALS: MonthSummary['categories'] = [
  { category_id: FOOD.id, type: 'expense', total_minor: '462000' },
  { category_id: TRAVEL.id, type: 'expense', total_minor: '10000' },
  { category_id: SHOPPING.id, type: 'expense', total_minor: '231000' },
  { category_id: BILLS.id, type: 'expense', total_minor: '27000' },
  { category_id: SALARY.id, type: 'income', total_minor: '2800000' },
];

type Board = ReturnType<typeof createFakeResources> & { shown: SpendV1Resources };

/** The fakes, with this month's per-category totals (the fake summary keeps none). */
function board(categories: readonly CategoryDto[] = [FOOD, TRAVEL, BILLS, SALARY, GIFT, SHOPPING, PETS, PLAIN, OLD], budgets: readonly BudgetDto[] = [BUDGET]): Board {
  const fake = createFakeResources({ categories: [...categories], budgets: [...budgets] });
  const shown: SpendV1Resources = { ...fake.resources, summary: async (month: string) => ({ ...(await fake.resources.summary(month)), categories: TOTALS }) };
  return { ...fake, shown };
}

function mountScreen(fake: Board, options: MountWalletOptions = {}) {
  return mountWallet(<WalletCategoriesScreen now={NOW} />, { resources: fake.shown, ...options });
}

// ---------------------------------------------------------------------------
// Helpers

const LINES = { ...COMMON_COPY, ...COPY };
const say = (key: string, locale: Locale = 'th', values?: CopyValues) => draftText(LINES, key, locale, values);
const tc = (english: string, locale: Locale = 'th', values?: CopyValues) => translateCopy(english, locale, values);

/** Lets the reads, the kept looks' read and the commands land. */
async function settle() {
  for (let tick = 0; tick < 6; tick += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

/** Starts the entering animations, as a browser does a frame after they mount (see the note at the top). */
function startAnimations() {
  act(() => {
    for (const node of document.querySelectorAll<HTMLElement>('[style*="visibility: hidden"]')) node.dispatchEvent(new Event('animationstart'));
  });
}

/** The element with this role and name, which must be there. */
function named(role: string, name: string | RegExp, inside: HTMLElement = document.body): HTMLElement {
  const element = within(inside).queryAllByRole(role, { name })[0];
  expect(element, `a ${role} named ${String(name)}`).toBeDefined();
  return element as HTMLElement;
}

/** The element with this test id, which must be there: the newest, while a closed tray's Modal is still leaving. */
function found(testID: string): HTMLElement {
  const elements = screen.queryAllByTestId(testID);
  expect(elements.length, testID).toBeGreaterThan(0);
  return elements[elements.length - 1];
}

async function press(element: HTMLElement) {
  fireEvent.click(element);
  await settle();
  startAnimations();
}

async function typeInto(element: HTMLElement, text: string) {
  fireEvent.change(element, { target: { value: text } });
  await settle();
}

/** `#RRGGBB` from react-native-web's `rgba(r, g, b, a)`. */
function hex(colour: string): string {
  const [r, g, b] = (colour.match(/\d+/g) ?? []).map(Number);
  expect([r, g, b].every((channel) => Number.isInteger(channel)), `a colour, got "${colour}"`).toBe(true);
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

const BUILTIN_EN: Readonly<Record<string, 'Food' | 'Travel' | 'Bills' | 'Shopping' | 'Salary'>> = { food: 'Food', travel: 'Travel', bills: 'Bills', shopping: 'Shopping', salary: 'Salary' };
const builtinName = (key: 'Food' | 'Travel' | 'Bills' | 'Shopping' | 'Salary', locale: Locale) => tc(key, locale);
const baht = (amount: string, locale: Locale) => say('common.baht', locale, { amount });
const tileOf = (category: CategoryDto) => found(`category-tile-${category.id}`);

/** The grid, read. */
async function openScreen(fake: Board = board(), options: MountWalletOptions = {}) {
  const view = mountScreen(fake, options);
  await settle();
  found('categories-builtins');
  return view;
}

/** The category tray, opened from a tile or from the new tile. */
async function openTray(from: HTMLElement) {
  await press(from);
  found('category-tray');
}

const nameField = (locale: Locale = 'th') => named('textbox', say('categories.name', locale));
const limitField = (locale: Locale = 'th') => named('textbox', say('categories.limitField', locale));
const NOT_CONFIRMED = (locale: Locale = 'th') => tc('Not confirmed yet. Your changes are kept; try again.', locale);

// ---------------------------------------------------------------------------
// The plan's cases

test("the grid shows each category's spending against its limit, over in the over colour", async () => {
  for (const [mode, colors] of MODES) {
    for (const locale of LOCALES) {
      await openScreen(board(), { mode, locale });
      const at = `${mode} ${locale}`;
      const food = builtinName('Food', locale);
      const travel = builtinName('Travel', locale);
      const shopping = builtinName('Shopping', locale);
      const bills = builtinName('Bills', locale);
      expect(tileOf(FOOD).getAttribute('aria-label'), at).toBe(say('categories.tileLabel', locale, { name: food, spent: baht('4,620', locale), limit: baht('6,000', locale) }));
      // Spending equal to its limit is not over.
      expect(tileOf(TRAVEL).getAttribute('aria-label'), at).toBe(say('categories.tileLabel', locale, { name: travel, spent: baht('100', locale), limit: baht('100', locale) }));
      expect(tileOf(SHOPPING).getAttribute('aria-label'), at).toBe(say('categories.tileOver', locale, { name: shopping, spent: baht('2,310', locale), over: baht('310', locale) }));
      expect(tileOf(BILLS).getAttribute('aria-label'), at).toBe(say('categories.tileUnlimited', locale, { name: bills, spent: baht('270', locale) }));
      expect(tileOf(PETS).getAttribute('aria-label'), at).toBe(say('categories.tileUnlimited', locale, { name: 'Pets', spent: baht('0', locale) }));
      // The lines the board draws.
      expect(found(`category-limit-${FOOD.id}`).textContent, at).toBe(say('categories.limit', locale, { amount: '฿6,000' }));
      expect(found(`category-limit-${TRAVEL.id}`).textContent, at).toBe(say('categories.limit', locale, { amount: '฿100' }));
      expect(found(`category-limit-${BILLS.id}`).textContent, at).toBe(say('categories.unlimited', locale));
      expect(screen.queryAllByTestId(`category-over-${TRAVEL.id}`), `${at}: at its limit is not over`).toEqual([]);
      // Three to a row; ช้อปปิ้ง alone on the last row keeps a third of it.
      expect((tileOf(SHOPPING).parentElement as HTMLElement).children.length, at).toBe(3);
      expect(found('categories-type').style.flexDirection, at).toBe('row');
      const over = found(`category-over-${SHOPPING.id}`);
      expect(over.textContent, at).toBe(say('categories.over', locale, { amount: '฿310' }));
      // Over in `over`, on a card chip.
      expect((over.firstElementChild as HTMLElement).style.color, at).toBe(rgba(colors.over));
      expect(over.style.backgroundColor, at).toBe(rgba(colors.card));
      // Each tile on its colour tinted for the mode (`raised` with none); its words 4.5:1 on whatever they sit on.
      for (const category of [FOOD, TRAVEL, SHOPPING, BILLS, PETS, PLAIN]) {
        const tile = tileOf(category);
        expect(tile.style.backgroundColor, `${at} ${category.id}`).toBe(rgba(category.color === null ? colors.raised : tileTint(category.color, colors.isDark)));
        const words = [...tile.querySelectorAll<HTMLElement>('*')].filter((node) => node.style.color && [...node.childNodes].some((child) => child.nodeType === 3 && (child.textContent ?? '').trim() !== ''));
        expect(words.length, `${at} ${category.id}: words`).toBeGreaterThan(1);
        for (const word of words) {
          let ground: HTMLElement | null = word;
          while (ground && ground !== tile && !ground.style.backgroundColor) ground = ground.parentElement;
          const back = (ground ?? tile).style.backgroundColor;
          expect(contrastRatio(hex(word.style.color), hex(back)), `${at} ${category.id}: "${word.textContent}"`).toBeGreaterThanOrEqual(4.5);
        }
      }
      cleanup();
    }
  }
}, 60_000);

test('the pack card names the first three missing C3 items', async () => {
  for (const locale of LOCALES) {
    const join = locale === 'th' ? ' ' : ', ';
    // None of C3's nine yet: the first three, and six more.
    await openScreen(board([FOOD, TRAVEL, BILLS, SALARY, GIFT]), { locale });
    expect(found('categories-pack-line').textContent, locale).toBe(
      `${locale === 'th' ? ['ส่งเงินให้ครอบครัว', 'ทำบุญ', 'เดลิเวอรี'].join(join) : ['Family support', 'Merit making', 'Delivery'].join(join)} ${say('categories.packMore', locale, { n: 6 })}`,
    );
    expect(found('categories-pack').getAttribute('aria-label'), locale).toBe(`${say('categories.packTitle', locale)} ${say('categories.packName', locale)} ${found('categories-pack-line').textContent}`);
    cleanup();
    // ทำบุญ held: the next three, and five more.
    await openScreen(board([FOOD, TRAVEL, BILLS, SALARY, GIFT, MERIT]), { locale });
    expect(found('categories-pack-line').textContent, locale).toBe(
      `${locale === 'th' ? ['ส่งเงินให้ครอบครัว', 'เดลิเวอรี', 'วินมอไซค์และรถไฟฟ้า'].join(join) : ['Family support', 'Delivery', 'Motorbike taxi and rail'].join(join)} ${say('categories.packMore', locale, { n: 5 })}`,
    );
    cleanup();
  }
  // One missing: its name alone. None missing: no card.
  const held = (label: string, n: number): CategoryDto => ({ ...PETS, id: `0000000c-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`, label, type: label === 'เงินจากครอบครัว' ? 'income' : 'expense' });
  const eight = ['ส่งเงินให้ครอบครัว', 'ทำบุญ', 'เดลิเวอรี', 'วินมอไซค์และรถไฟฟ้า', 'เติมเงินมือถือ', 'เซเว่น', 'สัตว์เลี้ยง', 'เงินจากครอบครัว'].map(held);
  await openScreen(board([FOOD, ...eight]));
  expect(found('categories-pack-line').textContent).toBe('ลอตเตอรี่');
  cleanup();
  await openScreen(board([FOOD, ...eight, held('ลอตเตอรี่', 9)]));
  expect(screen.queryAllByTestId('categories-pack'), 'no pack card once all nine are there').toEqual([]);
}, 60_000);

test('the pack tray adds only the picked missing items, and marks the ones the person has', async () => {
  for (const locale of LOCALES) {
    const fake = board([FOOD, TRAVEL, BILLS, SALARY, GIFT, MERIT]);
    await openScreen(fake, { locale });
    await press(found('categories-pack'));
    found('thai-pack-tray');
    const items = found('thai-pack-items');
    expect(within(items).queryAllByRole('checkbox').map((box) => box.getAttribute('aria-label')), locale).toEqual(
      locale === 'th'
        ? ['ส่งเงินให้ครอบครัว', 'ทำบุญ', 'เดลิเวอรี', 'วินมอไซค์และรถไฟฟ้า', 'เติมเงินมือถือ', 'เซเว่น', 'ลอตเตอรี่', 'สัตว์เลี้ยง', 'เงินจากครอบครัว']
        : ['Family support', 'Merit making', 'Delivery', 'Motorbike taxi and rail', 'Mobile top-up', 'Convenience store', 'Lottery', 'Pets', 'From family'],
    );
    // Nothing is picked at first; the one the person has says มีแล้ว and cannot be picked.
    expect(within(items).queryAllByRole('checkbox', { checked: true }), locale).toEqual([]);
    const merit = found('thai-pack-merit');
    expect(merit.getAttribute('aria-disabled'), locale).toBe('true');
    expect(within(merit).queryAllByText(say('categories.packHave', locale)), locale).not.toEqual([]);
    await press(merit);
    expect(merit.getAttribute('aria-checked'), `${locale}: a held row never checks`).toBe('false');
    // Pick เดลิเวอรี and ลอตเตอรี่ (not the first missing ones), then un-pick and re-pick one.
    expect(named('button', say('categories.packAdd', locale, { n: 0 })).getAttribute('aria-disabled'), `${locale}: nothing to add yet`).toBe('true');
    await press(found('thai-pack-lottery'));
    // One picked: the singular line (in Thai it reads as the plural one does).
    expect(named('button', say('categories.packAddOne', locale)).getAttribute('aria-disabled'), locale).not.toBe('true');
    await press(found('thai-pack-delivery'));
    await press(found('thai-pack-lottery'));
    await press(found('thai-pack-lottery'));
    expect(within(items).queryAllByRole('checkbox', { checked: true }).map((box) => box.getAttribute('aria-label')), locale).toEqual(
      locale === 'th' ? ['เดลิเวอรี', 'ลอตเตอรี่'] : ['Delivery', 'Lottery'],
    );
    await press(named('button', say('categories.packAdd', locale, { n: 2 })));
    // Only the picked, in C3's order, named in the person's language, in C3's colours.
    const created = fake.callsOf('createCategory').map((call) => call.args[0] as { label: string; color: string; type: string });
    expect(created.map((input) => [input.label, input.color, input.type]), locale).toEqual(
      locale === 'th' ? [['เดลิเวอรี', '#F0A868', 'expense'], ['ลอตเตอรี่', '#D3C2F2', 'expense']] : [['Delivery', '#F0A868', 'expense'], ['Lottery', '#D3C2F2', 'expense']],
    );
    // The tray closes and the screen reads again: the two are no longer missing.
    expect(screen.queryAllByTestId('thai-pack-tray'), `${locale}: the tray closes`).toEqual([]);
    expect(found('categories-pack-line').textContent, locale).not.toContain(locale === 'th' ? 'เดลิเวอรี' : 'Delivery');
    cleanup();
  }
}, 60_000);

test('a new category keeps its icon for the account only after Jotbun accepted it', async () => {
  for (const [mode, locale] of [['light', 'th'], ['dark', 'en']] as const) {
    const fake = board();
    const view = await openScreen(fake, { mode, locale });
    await openTray(found('categories-new-tile'));
    await typeInto(nameField(locale), 'Boba');
    await press(named('radio', say('categories.glyphCoffee', locale)));
    const release = fake.hold('createCategory');
    await press(named('button', tc('Add this category', locale)));
    const iconsKey = `jotbun.account.${TEST_ACCOUNT_ID}.${CATEGORY_ICONS_NAME}`;
    expect(view.stored.get(iconsKey), `${locale}: nothing kept before Jotbun answers`).toBeUndefined();
    release();
    await settle();
    const id = (fake.callsOf('createCategory')[0]?.args[0] as { id: string } | undefined)?.id;
    expect(id, locale).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(view.stored.get(iconsKey) ?? '{}'), `${locale}: kept once accepted`).toEqual({ [id as string]: 'coffee' });
    // The grid reads again and shows it.
    expect(found(`category-tile-${id as string}`).getAttribute('aria-label'), locale).toBe(say('categories.tileUnlimited', locale, { name: 'Boba', spent: baht('0', locale) }));
    cleanup();
  }
  // A refusal keeps nothing.
  const fake = board();
  const view = await openScreen(fake);
  await openTray(found('categories-new-tile'));
  await typeInto(nameField(), 'Boba');
  await press(named('radio', say('categories.glyphCoffee')));
  fake.fail('createCategory', 'invalid');
  await press(named('button', tc('Add this category')));
  expect(view.stored.get(`jotbun.account.${TEST_ACCOUNT_ID}.${CATEGORY_ICONS_NAME}`), 'a refused category keeps no icon').toBeUndefined();
}, 60_000);

test("a limit that would pass the month's budget is refused in words", async () => {
  for (const locale of LOCALES) {
    const fake = board();
    await openScreen(fake, { locale });
    await openTray(tileOf(FOOD));
    // Within the budget: the total, not a refusal (฿8,100 of limits becomes ฿9,100).
    await typeInto(limitField(locale), '7000');
    expect(found('category-limit-total').textContent, locale).toBe(say('categories.limitsTotal', locale, { total: '฿9,100', budget: '฿20,000' }));
    expect(screen.queryAllByTestId('category-limit-problem'), locale).toEqual([]);
    // Exactly the budget still fits.
    await typeInto(limitField(locale), '17900');
    expect(screen.queryAllByTestId('category-limit-problem'), `${locale}: equal fits`).toEqual([]);
    // One satang more is refused in today's words, as it is typed.
    await typeInto(limitField(locale), '17900.01');
    const problem = found('category-limit-problem');
    expect(problem.textContent, locale).toBe(tc("Category limits would add up to {total}, more than this month's budget of {overall}.", locale, { total: '฿20,000.01', overall: '฿20,000' }));
    expect(problem.getAttribute('role'), locale).toBe('alert');
    expect(screen.queryAllByTestId('category-limit-total'), `${locale}: the refusal is not the total`).toEqual([]);
    // Saving sends nothing.
    await press(named('button', tc('Save changes', locale)));
    expect(fake.callsOf('setBudget'), locale).toEqual([]);
    expect(found('category-limit-problem').textContent, locale).toBe(problem.textContent);
    cleanup();
  }
}, 60_000);

test("private mode hides the tiles' amounts", async () => {
  for (const locale of LOCALES) {
    await openScreen(board(), { locale, device: { [PRIVATE_MODE_NAME]: '1' } });
    for (const category of [FOOD, TRAVEL, SHOPPING, BILLS, PETS]) {
      const tile = tileOf(category);
      expect(tile.getAttribute('aria-label'), locale).toBe(`${category.label ?? tc(BUILTIN_EN[category.builtin_key as string], locale)} ${say('common.amountHidden', locale)}`);
      expect(tile.textContent, `${locale}: no digit on ${category.id}`).not.toMatch(/\d/);
      expect(tile.textContent, locale).toContain('฿••••');
    }
    expect(found(`category-over-${SHOPPING.id}`).textContent, locale).toBe(say('categories.over', locale, { amount: '฿••••' }));
    expect(found(`category-limit-${FOOD.id}`).textContent, locale).toBe(say('categories.limit', locale, { amount: '฿••••' }));
    cleanup();
  }
}, 60_000);

test('every glyph, swatch and checkbox is at least 44 pt and named', async () => {
  const minimum = (element: HTMLElement) => Math.min(
    Number.parseFloat(element.style.minHeight || element.style.height),
    Number.parseFloat(element.style.width || element.style.minWidth || '44'),
  );
  for (const [mode, locale] of [['light', 'th'], ['dark', 'en']] as const) {
    await openScreen(board(), { mode, locale });
    // The screen's type segments, tiles and buttons.
    for (const radio of within(found('categories-type')).queryAllByRole('radio')) expect(minimum(radio), `${locale}: ${radio.getAttribute('aria-label')}`).toBeGreaterThanOrEqual(44);
    await openTray(found('categories-new-tile'));
    // The fields say their names (B3).
    nameField(locale);
    const glyphs = within(found('category-glyphs')).queryAllByRole('radio');
    expect(glyphs.map((glyph) => glyph.getAttribute('aria-label')), locale).toEqual(
      ['Food', 'Coffee', 'Car', 'Bag', 'Home', 'Receipt', 'Heart', 'Lotus', 'Gift', 'Phone', 'Paw', 'Book'].map((each) => say(`categories.glyph${each}`, locale)),
    );
    if (locale === 'th') expect(glyphs.map((glyph) => glyph.getAttribute('aria-label'))).toEqual(['อาหาร', 'กาแฟ', 'รถ', 'ถุงช้อปปิ้ง', 'บ้าน', 'ใบเสร็จ', 'หัวใจ', 'ดอกบัว', 'ของขวัญ', 'มือถือ', 'รอยเท้าสัตว์', 'หนังสือ']);
    for (const glyph of glyphs) expect(Number.parseFloat(glyph.style.minHeight), `${locale}: ${glyph.getAttribute('aria-label')}`).toBeGreaterThanOrEqual(48);
    const swatches = within(found('category-swatches')).queryAllByRole('radio');
    expect(swatches.map((swatch) => swatch.getAttribute('aria-label')), locale).toEqual(
      ['Peach', 'Blue', 'Lilac', 'Pink', 'Yellow', 'Sky', 'Slate'].map((each) => say(`categories.swatch${each}`, locale)),
    );
    if (locale === 'th') expect(swatches.map((swatch) => swatch.getAttribute('aria-label'))).toEqual(['สีส้มพีช', 'สีฟ้า', 'สีม่วงอ่อน', 'สีชมพู', 'สีเหลือง', 'สีเทาฟ้า', 'สีเทาม่วง']);
    for (const swatch of swatches) expect([swatch.style.width, swatch.style.height], `${locale}: ${swatch.getAttribute('aria-label')}`).toEqual(['44px', '44px']);
    for (const radio of within(found('category-type')).queryAllByRole('radio')) expect(minimum(radio), `${locale}: ${radio.getAttribute('aria-label')}`).toBeGreaterThanOrEqual(44);
    expect(named('radio', say('categories.swatchPeach', locale)).getAttribute('aria-checked'), `${locale}: a new category starts peach`).toBe('true');
    const limitSwitch = named('switch', say('categories.setLimit', locale));
    expect([limitSwitch.style.width, limitSwitch.style.height], locale).toEqual(['56px', '44px']);
    await press(limitSwitch);
    limitField(locale);
    expect(screen.queryAllByTestId('category-limit-total'), `${locale}: no total until a limit is typed`).toEqual([]);
    await press(named('button', say('common.close', locale)));
    // The pack tray's checkboxes.
    await press(found('categories-pack'));
    const boxes = within(found('thai-pack-items')).queryAllByRole('checkbox');
    expect(boxes.length, locale).toBe(9);
    for (const box of boxes) {
      expect((box.getAttribute('aria-label') ?? '').trim(), locale).not.toBe('');
      expect(Number.parseFloat(box.style.minHeight), `${locale}: ${box.getAttribute('aria-label')}`).toBeGreaterThanOrEqual(44);
    }
    cleanup();
  }
}, 60_000);

// ---------------------------------------------------------------------------
// The fix round's cases (the review of P2-T29)


test('B4: an unconfirmed save keeps the frozen Try again, with the same id and key, and makes no second category', async () => {
  const fake = board();
  await openScreen(fake);
  await openTray(found('categories-new-tile'));
  await typeInto(nameField(), 'Boba');
  fake.loseResponse('createCategory');
  await press(named('button', tc('Add this category')));
  expect(found('category-tray-problem').textContent).toBe(NOT_CONFIRMED());
  // Only Try again: no second Add, and the draft is frozen.
  expect(screen.queryAllByRole('button', { name: tc('Add this category') }), 'no Add while unconfirmed').toEqual([]);
  expect(nameField().hasAttribute('readonly'), 'the name is frozen').toBe(true);
  for (const [role, name] of [['radio', say('categories.swatchBlue')], ['radio', say('categories.glyphCoffee')], ['radio', say('categories.income')], ['switch', say('categories.setLimit')]] as const) {
    expect(named(role, name, found('category-tray')).getAttribute('aria-disabled'), `${name} is frozen`).toBe('true');
  }
  // Closed and opened again it is still frozen, on the same draft.
  await press(named('button', say('common.close')));
  await openTray(found('categories-new-tile'));
  expect((nameField() as HTMLInputElement).value).toBe('Boba');
  expect(screen.queryAllByRole('button', { name: tc('Add this category') }), 'still no Add').toEqual([]);
  await press(named('button', say('common.tryAgain')));
  const calls = fake.callsOf('createCategory');
  expect(calls.length).toBe(2);
  expect((calls[1].args[0] as { id: string }).id, 'the same id').toBe((calls[0].args[0] as { id: string }).id);
  expect(calls[1].args[1], 'the same key').toBe(calls[0].args[1]);
  expect([...fake.categories.values()].filter((category) => category.label === 'Boba').length, 'one Boba').toBe(1);
  expect(screen.queryAllByTestId('category-tray'), 'saved: the tray closes').toEqual([]);
}, 30_000);

test('B4: an unconfirmed pack add keeps Try again with the same ids and keys, and adds nothing twice', async () => {
  const fake = board([FOOD, TRAVEL, BILLS, SALARY, GIFT]);
  await openScreen(fake);
  await press(found('categories-pack'));
  await press(found('thai-pack-merit'));
  fake.loseResponse('createCategory');
  await press(named('button', say('categories.packAddOne')));
  expect(found('thai-pack-problem').textContent).toBe(NOT_CONFIRMED());
  expect(screen.queryAllByRole('button', { name: say('categories.packAddOne') }), 'no Add while unconfirmed').toEqual([]);
  expect(found('thai-pack-merit').getAttribute('aria-disabled'), 'the picks are frozen').toBe('true');
  // Closed, the screen reads again (ทำบุญ did land, so it is มีแล้ว now); opened again the tray is still frozen.
  await press(named('button', say('common.close')));
  await press(found('categories-pack'));
  expect(found('thai-pack-problem').textContent).toBe(NOT_CONFIRMED());
  expect(screen.queryAllByRole('button', { name: say('categories.packAddOne') }), 'still no Add').toEqual([]);
  await press(named('button', say('common.tryAgain')));
  const calls = fake.callsOf('createCategory');
  expect(calls.length).toBe(2);
  expect((calls[1].args[0] as { id: string }).id).toBe((calls[0].args[0] as { id: string }).id);
  expect(calls[1].args[1]).toBe(calls[0].args[1]);
  expect([...fake.categories.values()].filter((category) => category.label === 'ทำบุญ').length, 'one ทำบุญ').toBe(1);
}, 30_000);

test('M8: a tray that is saving cannot be closed, and the save still lands', async () => {
  const fake = board();
  await openScreen(fake);
  await openTray(found('categories-new-tile'));
  await typeInto(nameField(), 'Boba');
  const release = fake.hold('createCategory');
  await press(named('button', tc('Add this category')));
  expect(named('button', tc('Saving…')).getAttribute('aria-busy'), 'Save says it is saving').toBe('true');
  const reads = fake.callsOf('ensureBuiltinCategories').length;
  const close = named('button', say('common.close'));
  expect(close.getAttribute('aria-disabled'), 'close says it is unavailable').toBe('true');
  await press(close);
  await press(found('tray-backdrop'));
  expect(found('category-tray'), 'still open').toBeTruthy();
  expect(fake.callsOf('ensureBuiltinCategories').length, 'not closed').toBe(reads);
  release();
  await settle();
  expect(screen.queryAllByTestId('category-tray'), 'the save lands and the tray closes').toEqual([]);
  expect(fake.callsOf('ensureBuiltinCategories').length, 'and the grid reads again').toBe(reads + 1);
  // The pack tray too.
  await press(found('categories-pack'));
  await press(found('thai-pack-delivery'));
  const releasePack = fake.hold('createCategory');
  await press(named('button', say('categories.packAddOne')));
  expect(named('button', tc('Saving…')).getAttribute('aria-busy'), 'Add says it is saving').toBe('true');
  expect(named('button', say('common.close')).getAttribute('aria-disabled'), 'the pack tray is locked').toBe('true');
  await press(found('tray-backdrop'));
  expect(found('thai-pack-tray'), 'still open').toBeTruthy();
  releasePack();
  await settle();
  expect(screen.queryAllByTestId('thai-pack-tray'), 'the add lands and the tray closes').toEqual([]);
}, 30_000);

test('M2: the screen reads again after a save, so a second change sends the new version', async () => {
  const fake = board();
  await openScreen(fake);
  await openTray(tileOf(PETS));
  await press(named('radio', say('categories.swatchYellow')));
  const release = fake.hold('updateCategory');
  await press(named('button', tc('Save changes')));
  expect(screen.queryAllByRole('button', { name: tc('Archive category') }), 'no archive while a save is out').toEqual([]);
  release();
  await settle();
  expect(screen.queryAllByTestId('category-tray'), 'saved').toEqual([]);
  await openTray(tileOf(PETS));
  await press(named('radio', say('categories.swatchBlue')));
  await press(named('button', tc('Save changes')));
  expect(fake.callsOf('updateCategory').map((call) => call.args[1]), 'versions 1, then 2').toEqual([1, 2]);
  expect(fake.categories.get(PETS.id)?.color).toBe(TRAY_SWATCHES[1]);
}, 30_000);

test('M3: a read that fails says so with Try again, and shows no grid, no pack card and no new', async () => {
  const fake = board();
  fake.fail('summary', 'network');
  await act(async () => { mountScreen(fake); });
  await settle();
  expect(found('categories-problem').textContent).toContain(tc("We couldn't load your diary."));
  for (const testID of ['categories-builtins', 'categories-pack', 'categories-new-tile']) expect(screen.queryAllByTestId(testID), testID).toEqual([]);
  expect(screen.queryAllByRole('button', { name: say('categories.new') }), 'no new').toEqual([]);
  await press(named('button', say('common.tryAgain')));
  expect(found(`category-tile-${FOOD.id}`)).toBeTruthy();
  cleanup();
  // A problem a retry cannot fix offers no Try again.
  const signedOut = board();
  signedOut.fail('budget', 'signed_out');
  mountScreen(signedOut);
  await settle();
  expect(found('categories-problem').textContent).toContain(tc('Sign in again to see your diary.'));
  expect(screen.queryAllByRole('button', { name: say('common.tryAgain') }), 'no Try again').toEqual([]);
  cleanup();
  // Loading says so; the categories come from ensureBuiltinCategories, so the built-ins are there.
  const loading = board([PETS]);
  const release = loading.hold('ensureBuiltinCategories');
  mountScreen(loading);
  await settle();
  expect(found('categories-loading').textContent).toBe(tc('Loading your diary'));
  expect(screen.queryAllByTestId('categories-builtins')).toEqual([]);
  release();
  await settle();
  expect(tileOf(FOOD)).toBeTruthy();
}, 30_000);

test('M4: in dark mode the trays draw on the mode: tints for the preview, the swatches and the pack glyphs', async () => {
  await openScreen(board(), { mode: 'dark' });
  await openTray(tileOf(PETS));
  expect(found('category-preview').style.backgroundColor).toBe(rgba(tileTint(PETS.color as string, true)));
  const fills = TRAY_SWATCHES.map((_, index) => found(`category-swatch-fill-${index}`).style.backgroundColor);
  expect(fills).toEqual(TRAY_SWATCHES.map((swatch) => rgba(tileTint(swatch, true))));
  await press(named('button', say('common.close')));
  await press(found('categories-pack'));
  const glyphTile = found('thai-pack-family_out').querySelector<HTMLElement>('[aria-hidden="true"]');
  expect(glyphTile?.style.backgroundColor).toBe(rgba(tileTint('#F291C4', true)));
}, 30_000);

test("M5 and M6: names, never keys: the swatches by colour, a built-in's tray by its name", async () => {
  for (const locale of LOCALES) {
    await openScreen(board(), { locale });
    await openTray(tileOf(FOOD));
    const food = builtinName('Food', locale);
    expect(named('heading', food).textContent, locale).toBe(food);
    expect((nameField(locale) as HTMLInputElement).placeholder, locale).toBe(food);
    expect(within(found('category-tray')).queryAllByText(/^food$|swatch\.|categories\./).length, `${locale}: no key on screen`).toBe(0);
    cleanup();
  }
}, 30_000);

test('M7: Back goes back, or to Budget when there is nothing to go back to', async () => {
  await openScreen();
  await press(named('button', say('common.back')));
  expect(router.back).toHaveBeenCalledTimes(1);
  router.canGoBack.mockReturnValue(false);
  await press(named('button', say('common.back')));
  expect(router.replace).toHaveBeenCalledWith('/spend/budget');
});

test('M9: private mode leaks no amount in the category tray', async () => {
  for (const locale of LOCALES) {
    await openScreen(board(), { locale, device: { [PRIVATE_MODE_NAME]: '1' } });
    await openTray(tileOf(FOOD));
    expect(found('category-limit-hint').textContent, locale).toBe(say('categories.limitHint', locale, { budget: '฿••••' }));
    // The stored limit is masked until a key is pressed.
    expect((limitField(locale) as HTMLInputElement).value, `${locale}: the stored limit is masked`).toBe('');
    expect((limitField(locale) as HTMLInputElement).placeholder, locale).toBe('••••');
    expect(found('category-limit-total').textContent, locale).toBe(say('categories.limitsTotal', locale, { total: '฿••••', budget: '฿••••' }));
    await typeInto(limitField(locale), '18000');
    expect(found('category-limit-problem').textContent, locale).toBe(tc("Category limits would add up to {total}, more than this month's budget of {overall}.", locale, { total: '฿••••', overall: '฿••••' }));
    // What the person types is theirs to see; Save says the refusal again, still masked.
    expect((limitField(locale) as HTMLInputElement).value, locale).toBe('18000');
    await press(named('button', tc('Save changes', locale)));
    expect(found('category-limit-problem').textContent, `${locale}: masked when saving too`).not.toMatch(/\d/);
    cleanup();
  }
}, 30_000);

test('M10: problems with a field are said in words, never a code', async () => {
  await openScreen();
  await openTray(tileOf(FOOD));
  for (const [typed, words] of [['abc', 'Enter an amount like 65 or 65.50'], ['12.345', 'Use at most two decimal places'], ['0', 'Enter an amount above zero']] as const) {
    await typeInto(limitField(), typed);
    expect(screen.queryAllByTestId('category-limit-problem'), `${typed}: a mistyped amount is said when saving`).toEqual([]);
    await press(named('button', tc('Save changes')));
    expect(found('category-limit-problem').textContent, typed).toBe(tc(words));
  }
  await press(named('button', say('common.close')));
  await openTray(found('categories-new-tile'));
  // Too long is said as it is typed; empty when saving.
  await typeInto(nameField(), 'ก'.repeat(81));
  expect(found('category-name-problem').textContent).toBe(tc('Use one line of up to 80 characters.'));
  await typeInto(nameField(), '');
  expect(screen.queryAllByTestId('category-name-problem')).toEqual([]);
  await press(named('button', tc('Add this category')));
  expect(found('category-name-problem').textContent).toBe(tc('Give the category a name.'));
  expect(document.body.textContent ?? '').not.toMatch(/\b(invalid|too_precise|zero|too_large|too_long|not_one_line|empty)\b/);
  await typeInto(nameField(), 'Boba');
  expect(screen.queryAllByTestId('category-name-problem'), 'the name problem goes as it is typed').toEqual([]);
  // A mistyped limit's problem goes when the type changes, as today's screen does.
  await press(named('switch', say('categories.setLimit')));
  await typeInto(limitField(), 'abc');
  await press(named('button', tc('Add this category')));
  expect(found('category-limit-problem').textContent).toBe(tc('Enter an amount like 65 or 65.50'));
  await press(named('radio', say('categories.income'), found('category-tray')));
  await press(named('radio', say('categories.expense'), found('category-tray')));
  expect(screen.queryAllByTestId('category-limit-problem'), 'gone with the type change').toEqual([]);
  cleanup();
  // A budget already holding 100 limits takes no more.
  const full: BudgetDto = { ...BUDGET, overall_limit_minor: '100000000', category_limits: Array.from({ length: 100 }, (_, n) => ({ category_id: `0000000c-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`, limit_minor: '100' })) };
  await openScreen(board(undefined, [full]));
  await openTray(tileOf(FOOD));
  await press(named('switch', say('categories.setLimit')));
  await typeInto(limitField(), '10');
  expect(found('category-limit-problem').textContent).toBe(tc('A budget holds up to 100 category limits.'));
}, 30_000);

test("M11: a catalogue section draws in the catalogue's language and theme", async () => {
  const section = WALLET_CATEGORY_SECTIONS.find((each) => each.id === 'bw-categories');
  expect(section, 'bw-categories').toBeDefined();
  mountInApp(
    <IntlProvider locale="en">
      <ThemePreferenceOverride preference="dark">{(section as { render(): ReactElement }).render()}</ThemePreferenceOverride>
    </IntlProvider>,
    'en',
  );
  await waitFor(() => expect(screen.queryAllByRole('heading', { name: say('categories.title', 'en') }), 'the English heading').not.toEqual([]), { timeout: 10_000 });
  expect(found('categories-screen').style.backgroundColor, 'the dark ground').toBe(rgba(walletDark.ground));
  // The catalogue's ช้อปปิ้ง has this suite's id, and is ฿310 over.
  expect(found(`category-over-${SHOPPING.id}`).textContent, "the board's over tile").toBe(say('categories.over', 'en', { amount: '฿310' }));
}, 30_000);

test("M12: the catalogue's four sections are wallet screens, in the plan's order", () => {
  const ids = WALLET_SECTIONS.map((each) => each.id);
  const at = ids.indexOf('bw-categories');
  expect(ids.slice(at, at + 4)).toEqual(['bw-categories', 'bw-category-new', 'bw-category-limit', 'bw-thai-pack']);
  expect(ids.indexOf('bw-wallets'), 'after the wallets list').toBeLessThan(at);
  expect(WALLET_CATEGORY_SECTIONS.map((each) => [each.group, each.layout])).toEqual(Array.from({ length: 4 }, () => ['Screens', 'screen']));
  for (const each of WALLET_CATEGORY_SECTIONS) expect(each.title).toMatch(/^Bun Wallet: /);
});

test('m3: a new opening shows no failure from the last one', async () => {
  const fake = board();
  await openScreen(fake);
  await openTray(found('categories-new-tile'));
  await typeInto(nameField(), 'Boba');
  fake.fail('createCategory', 'invalid');
  await press(named('button', tc('Add this category')));
  expect(found('category-tray-problem').textContent).toBe(tc('Could not save that. Try again.'));
  await press(named('button', say('common.close')));
  await openTray(tileOf(PETS));
  expect(screen.queryAllByTestId('category-tray-problem'), 'a fresh opening starts clean').toEqual([]);
}, 30_000);

test('m6: archive asks first, and an archived category comes back with Unarchive', async () => {
  const fake = board();
  await openScreen(fake);
  await openTray(tileOf(PETS));
  await press(named('button', tc('Archive category')));
  expect(named('heading', tc('Archive {name}?', 'th', { name: 'Pets' }))).toBeTruthy();
  expect(found('category-archive-words').textContent).toBe(tc("{name} won't show in Quick add any more. Past entries keep it, and you can unarchive it here any time.", 'th', { name: 'Pets' }));
  // Back returns to the form without sending.
  await press(named('button', say('common.back'), found('category-tray')));
  expect(fake.callsOf('archiveCategory')).toEqual([]);
  // A refused archive goes back to the form and says why, as today's sheet closes.
  await press(named('button', tc('Archive category')));
  fake.fail('archiveCategory', 'invalid');
  await press(named('button', tc('Archive')));
  expect(found('category-tray-problem').textContent).toBe(tc('Could not save that. Try again.'));
  nameField();
  await press(named('button', tc('Archive category')));
  await press(named('button', tc('Archive')));
  expect(fake.callsOf('archiveCategory').map((call) => call.args.slice(0, 2))).toEqual([[PETS.id, 1], [PETS.id, 1]]);
  expect(screen.queryAllByTestId(`category-tile-${PETS.id}`), 'archived: off the grid').toEqual([]);
  expect(found(`archived-category-${PETS.id}`)).toBeTruthy();
  await press(named('button', tc('Unarchive {name}', 'th', { name: 'Pets' })));
  expect(fake.callsOf('unarchiveCategory').map((call) => call.args.slice(0, 2))).toEqual([[PETS.id, 2]]);
  expect(tileOf(PETS), 'back on the grid').toBeTruthy();
}, 30_000);

test('R5 and R6: the type is chosen for a new category only, and a changed limit replaces the old one', async () => {
  const fake = board();
  await openScreen(fake);
  await openTray(found('categories-new-tile'));
  expect(screen.queryAllByTestId('category-type'), 'a new category picks its type').not.toEqual([]);
  await press(named('button', say('common.close')));
  await openTray(tileOf(FOOD));
  expect(screen.queryAllByTestId('category-type'), 'an existing one keeps its type').toEqual([]);
  await typeInto(limitField(), '7000');
  await press(named('button', tc('Save changes')));
  const [month, input, , existing] = fake.callsOf('setBudget')[0]?.args ?? [];
  expect(month).toBe(MONTH);
  expect(input).toEqual({
    overall_limit_minor: '2000000',
    category_limits: [
      { category_id: FOOD.id, limit_minor: '700000' },
      { category_id: TRAVEL.id, limit_minor: '10000' },
      { category_id: SHOPPING.id, limit_minor: '200000' },
    ].sort((a, b) => a.category_id.localeCompare(b.category_id)),
  });
  expect(existing).toEqual({ id: BUDGET.id, version: 4 });
}, 30_000);

test('m10 and the followup: an icon is kept only when it changes, and only with an account', async () => {
  const fake = board([FOOD, TRAVEL, BILLS, SALARY, GIFT, MERIT]);
  const view = await openScreen(fake);
  const iconsKey = `jotbun.account.${TEST_ACCOUNT_ID}.${CATEGORY_ICONS_NAME}`;
  // A pack category and a built-in show their own glyphs: saving them keeps none.
  await openTray(tileOf(MERIT));
  expect(named('radio', say('categories.glyphLotus')).getAttribute('aria-checked'), "the pack's lotus is shown").toBe('true');
  await press(named('radio', say('categories.swatchPink')));
  await press(named('button', tc('Save changes')));
  await openTray(tileOf(FOOD));
  await typeInto(nameField(), 'Meals');
  await press(named('button', tc('Save changes')));
  expect(view.stored.get(iconsKey), 'nothing kept for an unchanged glyph').toBeUndefined();
  // Only the glyph changed: kept at once, with nothing to send.
  await openTray(tileOf(FOOD));
  const updates = fake.callsOf('updateCategory').length;
  await press(named('radio', say('categories.glyphCoffee')));
  await press(named('button', tc('Save changes')));
  expect(fake.callsOf('updateCategory').length).toBe(updates);
  expect(JSON.parse(view.stored.get(iconsKey) ?? '{}')).toEqual({ [FOOD.id]: 'coffee' });
  cleanup();
  // With no account (the web) nothing could be kept, so no picker is offered.
  await openScreen(board(), { diary: null });
  await openTray(found('categories-new-tile'));
  expect(screen.queryAllByTestId('category-glyphs'), 'no icon picker without an account').toEqual([]);
}, 30_000);

test('m11: income tiles say what came in, never a limit', async () => {
  await openScreen();
  await press(named('radio', say('categories.income')));
  const salary = tileOf(SALARY);
  expect(salary.getAttribute('aria-label')).toBe(say('categories.tileIncome', 'th', { name: builtinName('Salary', 'th'), amount: baht('28,000', 'th') }));
  expect(screen.queryAllByTestId(`category-limit-${SALARY.id}`)).toEqual([]);
  expect(salary.textContent).not.toContain(say('categories.unlimited'));
});

test('m5: at AX5 each tile takes a row, grows with its words, and nothing is clamped', async () => {
  await openScreen(board(), { fontScale: AX5 });
  for (const category of [FOOD, SHOPPING, PETS]) {
    const tile = tileOf(category);
    expect((tile.parentElement as HTMLElement).children.length, `${category.id}: alone in its row`).toBe(1);
    expect([tile.style.minHeight, tile.style.height], category.id).toEqual(['104px', '']);
  }
  expect(found('categories-type').style.flexDirection, 'the segments stack').toBe('column');
  await openTray(tileOf(FOOD));
  for (const field of [nameField(), limitField()]) expect([field.style.minHeight, field.style.height]).toEqual(['44px', '']);
  await press(named('button', say('common.close')));
  await openTray(found('categories-new-tile'));
  expect(found('category-type').style.flexDirection, "the tray's segments stack").toBe('column');
  expect(seen.props.filter((props) => props.numberOfLines !== undefined), 'nothing clamped').toEqual([]);
}, 30_000);

// ---------------------------------------------------------------------------
// Carried from P2-T11's review (followups: its m2 and n5): the kit's glyph and
// initial, which this task's tiles and rows draw.

test('P2-T11 m2 (RV1): an unfilled ring is a stroke in the colour, 2 pt wide, with no fill', () => {
  const { container } = render(<CategoryGlyph glyph="paw" color="#111014" size={48} />);
  const rings = [...container.querySelectorAll('circle')];
  expect(rings.length).toBeGreaterThan(0);
  for (const ring of rings) expect([ring.getAttribute('stroke'), ring.getAttribute('stroke-width'), ring.getAttribute('fill')]).toEqual(['#111014', '2', 'none']);
});

test('P2-T11 m2 (RV2): every stroke has round caps and joins', () => {
  const { container } = render(<CategoryGlyph glyph="travel" color="#111014" size={48} />);
  const strokes = [...container.querySelectorAll('path')];
  expect(strokes.length).toBeGreaterThan(0);
  for (const stroke of strokes) expect([stroke.getAttribute('stroke-linecap'), stroke.getAttribute('stroke-linejoin')]).toEqual(['round', 'round']);
});

test("P2-T11 n5 (RV3): the tile's initial has Thai leading", () => {
  const category: CategoryDto = { ...PETS, label: 'ขนม' };
  mountWallet(<WalletCategoryIcon category={category} name="ขนม" size={52} />);
  const [initial] = screen.queryAllByText('ข');
  expect(initial, 'the initial').toBeDefined();
  expect(initial.style.lineHeight).toBe(`${walletLineHeight(Math.round((52 * 15) / 36), 'thai')}px`);
});

test('P2-T11 n5 (RV4, RV4s): a glyph drawn alone is hidden from screen readers', () => {
  const { container } = render(<CategoryGlyph glyph="food" color="#111014" size={48} />);
  expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
});

// The trays on their own, as a host other than the screen mounts them.
test("the trays mount on their own with the plan's props", async () => {
  mountWallet(<CategoryTray visible onClose={() => undefined} category={null} type="income" budget={BUDGET} />, { resources: board().shown });
  await settle();
  startAnimations();
  expect(named('heading', say('categories.new')).textContent, 'a new category is หมวดใหม่').toBe(say('categories.new'));
  expect(named('radio', say('categories.income')).getAttribute('aria-checked'), "a new category takes the host's type").toBe('true');
  expect(screen.queryAllByTestId('category-limit-section'), 'income has no limit').toEqual([]);
  cleanup();
  // Open from the start: nothing picked (n1). A picked item the host now reads as the person's is not added.
  const pack = mountWallet(<ThaiPackTray visible onClose={() => undefined} categories={[FOOD]} />, { resources: board().shown });
  await settle();
  startAnimations();
  expect(within(found('thai-pack-items')).queryAllByRole('checkbox', { checked: true }), 'nothing picked at first').toEqual([]);
  await press(found('thai-pack-delivery'));
  named('button', say('categories.packAddOne'));
  const delivery: CategoryDto = { ...PETS, id: '0000000c-0000-4000-8000-0000000000d1', label: 'เดลิเวอรี' };
  pack.rerender(<ThaiPackTray visible onClose={() => undefined} categories={[FOOD, delivery]} />);
  await settle();
  expect(named('button', say('categories.packAdd', 'th', { n: 0 })).getAttribute('aria-disabled'), 'not added once it is theirs').toBe('true');
});

test('a change made elsewhere says so, and Reload closes the tray so the grid reads again', async () => {
  const fake = board();
  await openScreen(fake);
  // Gone elsewhere (no copy of theirs).
  await openTray(tileOf(PETS));
  await press(named('radio', say('categories.swatchYellow')));
  fake.fail('updateCategory', 'not_found');
  await press(named('button', tc('Save changes')));
  expect(found('category-tray-problem').textContent).toBe(tc('This category changed on another device.'));
  expect(screen.queryAllByRole('button', { name: tc('Save changes') }), 'no Save on a stale draft').toEqual([]);
  expect(screen.queryAllByRole('button', { name: tc('Archive category') }), 'no archive on a stale draft').toEqual([]);
  const reads = fake.callsOf('ensureBuiltinCategories').length;
  await press(named('button', tc('Reload')));
  expect(screen.queryAllByTestId('category-tray'), 'Reload closes the tray').toEqual([]);
  expect(fake.callsOf('ensureBuiltinCategories').length, 'and the grid reads again').toBe(reads + 1);
  // A version conflict with their copy says so too.
  await openTray(tileOf(PETS));
  await press(named('radio', say('categories.swatchYellow')));
  fake.fail('updateCategory', 'conflict', { current: { ...PETS, label: 'Animals', version: 2 } });
  await press(named('button', tc('Save changes')));
  expect(found('category-tray-problem').textContent).toBe(tc('This category changed on another device.'));
  // Reload closes it; opened again it starts clean.
  await press(named('button', tc('Reload')));
  await openTray(tileOf(PETS));
  expect(screen.queryAllByTestId('category-tray-problem'), 'no conflict from the last opening').toEqual([]);
  named('button', tc('Save changes'));
  await press(named('button', say('common.close')));
  // A refused pack add says so, and offers Reload, not Add.
  await press(found('categories-pack'));
  await press(found('thai-pack-delivery'));
  fake.fail('createCategory', 'invalid');
  await press(named('button', say('categories.packAddOne')));
  expect(found('thai-pack-problem').textContent).toBe(tc('Could not save that. Try again.'));
  expect(screen.queryAllByRole('button', { name: say('categories.packAddOne') }), 'no Add after a refusal').toEqual([]);
  expect(found('thai-pack-lottery').getAttribute('aria-disabled'), 'nothing to pick after a refusal').toBe('true');
  // Reload closes it; opened again it starts clean.
  await press(named('button', tc('Reload')));
  await press(found('categories-pack'));
  expect(screen.queryAllByTestId('thai-pack-problem'), 'a fresh opening starts clean').toEqual([]);
}, 30_000);

test('the limit switch: off removes the limit, and a month with no budget says why there is none', async () => {
  const fake = board();
  await openScreen(fake);
  await openTray(tileOf(FOOD));
  const limitSwitch = named('switch', say('categories.setLimit'));
  expect(limitSwitch.getAttribute('aria-checked'), 'on: อาหาร has a limit').toBe('true');
  await press(limitSwitch);
  expect(screen.queryAllByRole('textbox', { name: say('categories.limitField') }), 'no field once off').toEqual([]);
  await press(named('button', tc('Save changes')));
  const [, input] = fake.callsOf('setBudget')[0]?.args ?? [];
  expect((input as { category_limits: { category_id: string }[] } | undefined)?.category_limits.map((limit) => limit.category_id), 'no limit for อาหาร').toEqual(
    [TRAVEL.id, SHOPPING.id].sort((a, b) => a.localeCompare(b)),
  );
  cleanup();
  await openScreen(board(undefined, []));
  await openTray(found('categories-new-tile'));
  expect(screen.queryAllByTestId('category-limit-section'), 'no limit without a budget').toEqual([]);
  expect(found('category-no-budget').textContent).toBe(tc("Category limits are part of a monthly budget. Set this month's budget first."));
}, 30_000);

test("the draft table holds the plan's Thai lines", () => {
  const plan: Readonly<Record<string, string>> = {
    'categories.title': 'หมวดหมู่',
    'categories.expense': 'รายจ่าย',
    'categories.income': 'รายรับ',
    'categories.packTitle': 'เพิ่มชุดหมวด',
    'categories.packName': 'ชีวิตประจำวันแบบไทย',
    'categories.packMore': 'และอีก {n} หมวด',
    'categories.builtins': 'หมวดตั้งต้น',
    'categories.thisMonth': 'เดือนนี้',
    'categories.custom': 'หมวดของคุณ',
    'categories.limit': 'งบ {amount}',
    'categories.over': 'เกิน {amount}',
    'categories.unlimited': 'ไม่จำกัด',
    'categories.tileLabel': '{name} ใช้ไป {spent} จากงบ {limit}',
    'categories.tileOver': '{name} ใช้ไป {spent} เกินงบ {over}',
    'categories.tileUnlimited': '{name} ใช้ไป {spent} ไม่จำกัดงบ',
    'categories.new': 'หมวดใหม่',
    'categories.limitsTotal': 'วงเงินทุกหมวดรวมกันจะเป็น {total} จากงบ {budget}',
    'categories.packHeading': 'ชุดหมวดแบบไทย',
    'categories.packIntro': 'หมวดที่ใช้กันทุกวันในไทย เลือกเฉพาะที่ใช่ แล้วเพิ่มทีเดียว',
    'categories.packPick': 'เลือกหมวดที่จะเพิ่ม',
    'categories.packHave': 'มีแล้ว',
    'categories.packNote': 'เพิ่มแล้วเป็นหมวดของคุณเหมือนหมวดอื่น เปลี่ยนชื่อ ไอคอน สี หรือเก็บถาวรได้ทุกเมื่อ',
    'categories.packAdd': 'เพิ่ม {n} หมวด',
    'pack.family_out': 'เงินที่โอนให้พ่อแม่หรือญาติ',
    'pack.merit': 'ใส่บาตร ทำบุญที่วัด หรือบริจาค',
    'pack.delivery': 'สั่งอาหารผ่านแอป รวมค่าส่ง',
    'pack.motorbike_rail': 'วิน BTS และ MRT แยกจากเดินทางอื่น',
    'pack.topup': 'เติมเงินหรือจ่ายค่าโทรรายเดือน',
    'pack.seven': 'ของกินของใช้จากร้านสะดวกซื้อ',
    'pack.lottery': 'สลากงวดวันที่ 1 และ 16',
    'pack.pets': 'อาหารและค่าหมอของสัตว์เลี้ยง',
    'pack.family_in': 'เงินที่พ่อแม่หรือญาติโอนมาให้',
  };
  expect(Object.fromEntries(Object.keys(plan).map((key) => [key, (COPY as Readonly<Record<string, { th: string }>>)[key]?.th]))).toEqual(plan);
});

test('a later refusal keeps what was accepted: the field says why, and saving again sends only what is left', async () => {
  const fake = board();
  await openScreen(fake);
  await openTray(found('categories-new-tile'));
  await typeInto(nameField(), 'Boba');
  await press(named('switch', say('categories.setLimit')));
  await typeInto(limitField(), '500');
  fake.fail('setBudget', 'invalid', { fields: { category_limits: 'errors.limits' } });
  await press(named('button', tc('Add this category')));
  expect(found('category-tray-problem').textContent).toBe(tc('Check the highlighted fields.'));
  expect(found('category-limit-problem').textContent).toBe(tc('Check this and try again.'));
  // Boba was accepted: the tray now saves changes to it.
  expect(named('button', tc('Save changes'))).toBeTruthy();
  await typeInto(limitField(), '400');
  expect(screen.queryAllByTestId('category-limit-problem'), 'the field problem goes as it is edited').toEqual([]);
  await press(named('button', tc('Save changes')));
  expect(fake.callsOf('createCategory').length, 'Boba is created once').toBe(1);
  expect(fake.callsOf('setBudget').length).toBe(2);
  expect(screen.queryAllByTestId('category-tray'), 'saved').toEqual([]);
}, 30_000);

test('m6: unarchive is one at a time, keeps Try again when unconfirmed, and says a change made elsewhere', async () => {
  const OLDER: CategoryDto = { ...OLD, id: '0000000c-0000-4000-8000-0000000000a6', label: 'Older hobby' };
  const OLDEST: CategoryDto = { ...OLD, id: '0000000c-0000-4000-8000-0000000000a7', label: 'Oldest hobby' };
  const fake = board([FOOD, TRAVEL, BILLS, SALARY, GIFT, OLD, OLDER, OLDEST]);
  await openScreen(fake);
  const unarchive = (name: string) => named('button', tc('Unarchive {name}', 'th', { name }));
  // One at a time.
  const release = fake.hold('unarchiveCategory');
  await press(unarchive('Old hobby'));
  expect(unarchive('Older hobby').getAttribute('aria-disabled'), 'one at a time').toBe('true');
  release();
  await settle();
  expect(tileOf(OLD), 'back on the grid').toBeTruthy();
  // An answer that never came: Try again, under the same key.
  fake.loseResponse('unarchiveCategory');
  await press(unarchive('Older hobby'));
  expect(found('categories-unarchive-problem').textContent).toContain(NOT_CONFIRMED());
  expect(unarchive('Oldest hobby').getAttribute('aria-disabled'), 'frozen until the outcome is known').toBe('true');
  await press(named('button', say('common.tryAgain'), found('categories-unarchive-problem')));
  const keys = fake.callsOf('unarchiveCategory').map((call) => call.args[2]);
  expect(keys[2], 'the same key').toBe(keys[1]);
  expect(tileOf(OLDER), 'back on the grid').toBeTruthy();
  // Changed on another device: said, and Reload reads again.
  fake.fail('unarchiveCategory', 'conflict', { current: { ...OLDEST, version: 9 } });
  await press(unarchive('Oldest hobby'));
  expect(found('categories-unarchive-problem').textContent).toContain(tc('This category was archived on another device.'));
  const reads = fake.callsOf('ensureBuiltinCategories').length;
  await press(named('button', tc('Reload'), found('categories-unarchive-problem')));
  expect(screen.queryAllByTestId('categories-unarchive-problem'), 'cleared').toEqual([]);
  expect(fake.callsOf('ensureBuiltinCategories').length, 'read again').toBe(reads + 1);
}, 30_000);

test('blocked (an update is needed): the trays and Unarchive wait, and say why', async () => {
  const fake = board();
  await openScreen(fake);
  const UPDATE = tc('Update Jotbun to keep saving. Your changes are kept.');
  await openTray(tileOf(PETS));
  await press(named('radio', say('categories.swatchYellow')));
  fake.fail('updateCategory', 'upgrade_required');
  await press(named('button', tc('Save changes')));
  expect(found('category-tray-problem').textContent).toBe(UPDATE);
  expect(named('button', tc('Save changes')).getAttribute('aria-disabled'), 'Save waits').toBe('true');
  await press(named('button', tc('Archive category')));
  expect(named('button', tc('Archive')).getAttribute('aria-disabled'), 'Archive waits').toBe('true');
  await press(named('button', say('common.close')));
  // The pack tray: Reload after the refusal, and Add waits on the next opening.
  await press(found('categories-pack'));
  await press(found('thai-pack-delivery'));
  fake.fail('createCategory', 'upgrade_required');
  await press(named('button', say('categories.packAddOne')));
  expect(found('thai-pack-problem').textContent).toBe(UPDATE);
  await press(named('button', tc('Reload')));
  await press(found('categories-pack'));
  await press(found('thai-pack-delivery'));
  expect(named('button', say('categories.packAddOne')).getAttribute('aria-disabled'), 'Add waits').toBe('true');
  await press(named('button', say('common.close')));
  // Unarchive.
  fake.fail('unarchiveCategory', 'upgrade_required');
  await press(named('button', tc('Unarchive {name}', 'th', { name: 'Old hobby' })));
  expect(found('categories-unarchive-problem').textContent).toBe(UPDATE);
  expect(named('button', tc('Unarchive {name}', 'th', { name: 'Old hobby' })).getAttribute('aria-disabled'), 'Unarchive waits').toBe('true');
}, 30_000);

test("a pack add that meets its own id with other fields says so, and the next opening starts clean", async () => {
  const fake = board([FOOD, TRAVEL, BILLS, SALARY, GIFT]);
  await openScreen(fake);
  await press(found('categories-pack'));
  await press(found('thai-pack-delivery'));
  const id = '0000000c-0000-4000-8000-0000000000e1';
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValueOnce(id);
  fake.fail('createCategory', 'conflict', { current: { ...PETS, id, label: 'Something else' } });
  await press(named('button', say('categories.packAddOne')));
  expect(found('thai-pack-problem').textContent).toBe(tc('This category changed on another device.'));
  await press(named('button', tc('Reload')));
  await press(found('categories-pack'));
  expect(screen.queryAllByTestId('thai-pack-problem'), 'a fresh opening starts clean').toEqual([]);
}, 30_000);

test('m6: the archive question cannot be left while it sends', async () => {
  const fake = board();
  await openScreen(fake);
  await openTray(tileOf(PETS));
  await press(named('button', tc('Archive category')));
  const release = fake.hold('archiveCategory');
  await press(named('button', tc('Archive')));
  expect(within(found('category-tray')).queryAllByRole('button', { name: say('common.back') }), 'no Back while it sends').toEqual([]);
  release();
  await settle();
  expect(found(`archived-category-${PETS.id}`)).toBeTruthy();
}, 30_000);
```

### `apps/app/src/screens/redesign/planning/categoryCommands.render.test.tsx`

```tsx
// The categories' commands, moved out of CategoriesScreen.tsx (plan P2-T29,
// W2), keep today's screen as it was: its suite runs unchanged, and these
// cases hold what it does not cover:
// - when an archive is not confirmed, or is refused, the archive sheet
//   closes, so the footer's words (and Try again) are seen (the review of
//   P2-T29, M1; its probes A1 and A2);
// - a category changed on another device closes the form and reads again;
// - once the category is accepted and the budget refused, the form is
//   rebased on it, so saving again sends only the budget.
// The moved hook tells the screen every way a send stops. Same setup as
// CategoriesScreen.render.test.tsx.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('@mobile/dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import { CATEGORY_COLORS } from '@gogospend/contracts';
import type { BudgetDto, CategoryDto } from '@gogospend/contracts';
import { router } from '@mobile/dev/catalogue/routerTestStub';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { mountScreen } from '../HistoryTestHarness';
import { CategoriesScreen } from './CategoriesScreen';

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => {
  for (const fn of [router.push, router.replace, router.back]) fn.mockReset();
  router.canGoBack.mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const NOW = new Date('2026-09-29T03:00:00Z');
const [, TRAVEL] = BUILTINS;
const PETS: CategoryDto = { id: '0000000c-0000-4000-8000-0000000000a1', type: 'expense', builtin_key: null, label: 'Pets', color: CATEGORY_COLORS[2], archived: false, version: 1 };
const BUDGET: BudgetDto = { id: '0000000d-0000-4000-8000-000000000001', month: '2026-09', overall_limit_minor: '2000000', category_limits: [{ category_id: TRAVEL.id, limit_minor: '300000' }], version: 4 };
const NOT_CONFIRMED = 'Not confirmed yet. Your changes are kept; try again.';

/** The element with this role and name, which must be there. */
async function named(role: string, name: string): Promise<HTMLElement> {
  await waitFor(() => expect(screen.queryByRole(role, { name }), `a ${role} named ${name}`).not.toBeNull());
  return screen.queryByRole(role, { name }) as HTMLElement;
}

/** Pets' form, open, on the routed Bun diary screen. */
async function editPets() {
  const fake = createFakeResources({ wallets: goldenSeed().wallets, categories: [...BUILTINS, PETS], budgets: [BUDGET] });
  mountScreen(<CategoriesScreen now={NOW} />, { resources: fake.resources, locale: 'en', mode: 'light' });
  fireEvent.click(await named('button', 'Pets'));
  await named('heading', 'Edit category');
  return fake;
}

async function confirmArchive() {
  fireEvent.click(await named('button', 'Archive category'));
  const sheet = await named('dialog', 'Archive Pets?');
  const archive = within(sheet).queryByRole('button', { name: 'Archive' });
  expect(archive, 'the sheet asks with Archive').not.toBeNull();
  fireEvent.click(archive as HTMLElement);
}

test('an archive that is not confirmed closes the sheet and offers Try again', async () => {
  const fake = await editPets();
  fake.fail('archiveCategory', 'network');
  await confirmArchive();
  await waitFor(() => expect(within(screen.getByTestId('categories-footer')).queryByText(NOT_CONFIRMED), 'the footer says so').not.toBeNull());
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Archive Pets?' }), 'the archive sheet closes').toBeNull());
  expect(within(screen.getByTestId('categories-footer')).queryByRole('button', { name: 'Try again' }), 'Try again').not.toBeNull();
});

test('an archive that is refused closes the sheet and says why', async () => {
  const fake = await editPets();
  fake.fail('archiveCategory', 'invalid');
  await confirmArchive();
  await waitFor(() => expect(within(screen.getByTestId('categories-footer')).queryByText('Could not save that. Try again.'), 'the footer says why').not.toBeNull());
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Archive Pets?' }), 'the archive sheet closes').toBeNull());
});

/** The field with this name, which must be there. */
async function field(name: string): Promise<HTMLInputElement> {
  return (await named('textbox', name)) as HTMLInputElement;
}

test('a category changed on another device closes the form, says so, and reads the grid again', async () => {
  const fake = await editPets();
  fake.fail('updateCategory', 'not_found');
  fireEvent.change(await field('Name'), { target: { value: 'Cats' } });
  fireEvent.click(await named('button', 'Save changes'));
  await waitFor(() => expect(within(screen.getByTestId('categories-footer')).queryByText('This category changed on another device.'), 'said').not.toBeNull());
  expect(screen.queryAllByRole('heading', { name: 'Edit category' }), 'the form closes').toEqual([]);
  expect(fake.callsOf('ensureBuiltinCategories').length, 'read again').toBe(2);
});

test('once the category is accepted and the budget refused, saving again sends only the budget', async () => {
  const fake = createFakeResources({ wallets: goldenSeed().wallets, categories: [...BUILTINS, PETS], budgets: [BUDGET] });
  mountScreen(<CategoriesScreen now={NOW} />, { resources: fake.resources, locale: 'en', mode: 'light' });
  fireEvent.click(await named('button', 'New category'));
  fireEvent.change(await field('Name'), { target: { value: 'Boba' } });
  fireEvent.change(await field("This month's limit"), { target: { value: '100' } });
  fake.fail('setBudget', 'invalid', { status: 422, code: 'VALIDATION_FAILED', fields: { category_limits: 'errors.limits' } });
  fireEvent.click(await named('button', 'Add this category'));
  await waitFor(() => expect(within(screen.getByTestId('categories-footer')).queryByText('Check the highlighted fields.'), 'the refusal').not.toBeNull());
  // Boba was accepted: the form now changes it.
  fireEvent.change(await field("This month's limit"), { target: { value: '50' } });
  fireEvent.click(await named('button', 'Save changes'));
  await waitFor(() => expect(fake.callsOf('setBudget').length, 'the budget again').toBe(2));
  expect(fake.callsOf('createCategory').length, 'Boba is created once').toBe(1);
});
```

### `apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx`

```tsx
// The R4 Planning routes (app/spend/budget.tsx, wallets.tsx, categories.tsx):
// each shows its screen only under the `planning` area, never in the legacy
// build, and otherwise goes back to Home. While the `wallet` area is on,
// wallets.tsx shows the Bun Wallet's list instead (P2-T20), and
// categories.tsx the Bun Wallet's categories (P2-T29).
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import SpendBudgetRoute from '../../../../app/spend/budget';
import SpendCategoriesRoute from '../../../../app/spend/categories';
import SpendWalletsRoute from '../../../../app/spend/wallets';

const route = vi.hoisted(() => ({ params: {} as Record<string, string> }));
vi.mock('expo-router', async () => {
  const { createElement } = await import('react');
  const { Text } = await import('react-native');
  return {
    Redirect: ({ href }: { href: string }) => createElement(Text, null, `redirect to ${href}`),
    useLocalSearchParams: () => route.params,
  };
});
vi.mock('@mobile/api/sharedV1', () => ({ getSharedV1Resources: () => ({ marker: 'shared resources' }) }));
function stub(name: string, text: string) {
  return async () => {
    const { createElement } = await import('react');
    const { Text } = await import('react-native');
    const { useSpendV1 } = await import('@mobile/spend/v1/SpendV1Context');
    return { [name]: () => createElement(Text, null, `${text} with ${String((useSpendV1() as unknown as { marker: string }).marker)}`) };
  };
}
vi.mock('@mobile/screens/redesign/planning/BudgetScreen', stub('BudgetScreen', 'budget'));
vi.mock('@mobile/screens/redesign/planning/WalletsScreen', stub('WalletsScreen', 'wallets'));
vi.mock('@mobile/screens/redesign/planning/CategoriesScreen', stub('CategoriesScreen', 'categories'));
// The Bun Wallet's categories (P2-T29).
vi.mock('@mobile/wallet/categories/WalletCategoriesScreen', stub('WalletCategoriesScreen', 'wallet categories'));
// The Bun Wallet's list (P2-T20), which says whether it opens its reorder tray.
vi.mock('@mobile/wallet/wallets/WalletsListScreen', async () => {
  const { createElement } = await import('react');
  const { Text } = await import('react-native');
  const { useSpendV1 } = await import('@mobile/spend/v1/SpendV1Context');
  return {
    WalletsListScreen: ({ openReorder }: { openReorder?: boolean }) =>
      createElement(Text, null, `wallet list${openReorder ? ' reordering' : ''} with ${String((useSpendV1() as unknown as { marker: string }).marker)}`),
  };
});

const ENV = { redesign: process.env.EXPO_PUBLIC_REDESIGN, legacy: process.env.EXPO_PUBLIC_LEGACY_SPEND };
function flags({ redesign, legacy }: { redesign?: string; legacy?: string }) {
  if (redesign === undefined) delete process.env.EXPO_PUBLIC_REDESIGN;
  else process.env.EXPO_PUBLIC_REDESIGN = redesign;
  if (legacy === undefined) delete process.env.EXPO_PUBLIC_LEGACY_SPEND;
  else process.env.EXPO_PUBLIC_LEGACY_SPEND = legacy;
}
beforeEach(() => {
  flags({});
  route.params = {};
});
afterEach(() => {
  cleanup();
  flags(ENV);
});

const ROUTES = [[SpendBudgetRoute, 'budget'], [SpendWalletsRoute, 'wallets'], [SpendCategoriesRoute, 'categories']] as const;

test.each(ROUTES)('%#: the screen only under the planning area (on since E2 checkpoint 2), with the shared resources', (Route, name) => {
  flags({ redesign: '-planning' });
  render(<Route />);
  expect(screen.getByText('redirect to /spend')).toBeTruthy();
  cleanup();
  flags({});
  render(<Route />);
  expect(screen.getByText(`${name} with shared resources`)).toBeTruthy();
  cleanup();
  flags({ redesign: 'planning', legacy: '1' });
  render(<Route />);
  expect(screen.getByText('redirect to /spend')).toBeTruthy();
});

test('in the wallet area wallets.tsx shows the Bun Wallet list with the shared resources, ?reorder=1 opens its reorder tray, and the legacy build still goes back to Home', () => {
  flags({ redesign: 'wallet' });
  render(<SpendWalletsRoute />);
  expect(screen.queryByText('wallet list with shared resources')).not.toBeNull();
  cleanup();
  route.params = { reorder: '1' };
  render(<SpendWalletsRoute />);
  expect(screen.queryByText('wallet list reordering with shared resources')).not.toBeNull();
  cleanup();
  // The wallet area is its own (W1): it does not need the planning area.
  flags({ redesign: '-planning,wallet' });
  render(<SpendWalletsRoute />);
  expect(screen.queryByText('wallet list reordering with shared resources')).not.toBeNull();
  cleanup();
  route.params = { reorder: '0' };
  render(<SpendWalletsRoute />);
  expect(screen.queryByText('wallet list with shared resources')).not.toBeNull();
  cleanup();
  flags({ redesign: 'wallet', legacy: '1' });
  render(<SpendWalletsRoute />);
  expect(screen.queryByText('redirect to /spend')).not.toBeNull();
});

test('in the wallet area categories.tsx shows the Bun Wallet categories with the shared resources, and the legacy build still goes back to Home', () => {
  flags({ redesign: 'wallet' });
  render(<SpendCategoriesRoute />);
  expect(screen.queryByText('wallet categories with shared resources')).not.toBeNull();
  cleanup();
  // The wallet area is its own (W1): it does not need the planning area.
  flags({ redesign: '-planning,wallet' });
  render(<SpendCategoriesRoute />);
  expect(screen.queryByText('wallet categories with shared resources')).not.toBeNull();
  cleanup();
  flags({ redesign: 'wallet', legacy: '1' });
  render(<SpendCategoriesRoute />);
  expect(screen.queryByText('redirect to /spend')).not.toBeNull();
});
```

### `docs/implementation/receipts/P2-T29-fix.md`

```markdown
# P2-T29-fix: the categories on today's rules, the wallet kit and real states

- **Status:** built and verified locally on `p2/t29-categories` (`.claude/worktrees/p2-t29`): one fix commit on PR #423's reviewed head `cee7eff5`. Not pushed. This is the fix round after the review (`.claude/controller/reviews/P2-T29.md`), which said Needs fixes for four blockers (B1 to B4), twelve majors (M1 to M12), thirteen minors (m1 to m13) and four nits. No second review had landed. The controller ruled R113: fix every blocker, major and minor as the review proposes, unless the plan says otherwise. The planner's brief is `.claude/controller/briefs/P2-T29-fix.md` (its rulings P1 to P28). Under R87 this receipt is its own file; `P2-T29.md` gains one line pointing here, and `premium-progress.md` is not edited. The independent review is the controller's, after this receipt.
- **Base:** `cee7eff5` (the first round, on `2ff43b0e`). No sync merge: `apps/app/src/dev/catalogue/wallet/index.ts` stays the first round's (`911e4ce0…`: KIT, STACK, TRAY, ADD, LIST, CATEGORY, LOCK). #411 has since merged RECAP at the same lines; the controller resolves `index.ts` in plan order when it merges the head in (LIST, RECORD, CATEGORY, RECAP, LOCK).
- **Files:**
  - Rewritten: `apps/app/src/screens/redesign/planning/categoryCommands.ts`, `apps/app/src/wallet/categories/WalletCategoriesScreen.tsx`, `CategoryTray.tsx`, `ThaiPackTray.tsx`, `copy.ts`, `WalletCategories.render.test.tsx` (38 cases; 18 before), `apps/app/src/dev/catalogue/wallet/categorySections.tsx` and the route `apps/app/app/spend/categories.tsx`.
  - Created: `apps/app/src/screens/redesign/planning/categoryCommands.render.test.tsx` (4 cases).
  - Shared: `CategoriesScreen.tsx` (`2ff43b0e`'s file with the move and the hook's host only; its suite of 56 runs unchanged) and `PlanningRoutes.render.test.tsx` (stubs the wallet screen; one case added).
  - Unchanged: `index.ts`, `categoriesModel.ts`, `thaiPack.ts`, the wallet kit, the fakes, `CategoriesScreen.render.test.tsx`.
  - This receipt, and one line in `P2-T29.md`.
- **The blockers:**
  - B1: a new category's id is `newId` (expo-crypto), made once when the tray opens. No app code reaches for the Web Crypto global; the Hermes guard in `test:unit` passes.
  - B2: the catalogue's category sections load the screen when a section opens (`lazy()`, as `walletListSections.tsx` does), so the wallet catalogue's list loads neither `screens/v1/parts.tsx` (expo-crypto) nor expo-router. The eight render files that read the list pass.
  - B3: the name and limit fields are named (ชื่อหมวด, วงเงินต่อเดือน); their visible captions are decorative.
  - B4: an unconfirmed save or pack add keeps today's frozen Try again: the same ids and keys, every field disabled, no Save or Add. The tray can be closed (P2-T16's rule); opened again it is still frozen until the outcome is known. One category, one pack item.
- **The majors:**
  - M1: `useCategoryCommands(host)` is today's `send`, `refused` and `tryAgain` word for word. The five points where today's code changed the screen are required host callbacks (`rebase`, `stopped`, `saved`, `changedElsewhere`, `fieldErrors`), each called where today's line ran. The review's A1 and A2 pass.
  - M2: the screen reads again whenever a tray closes, so a new tile shows and a second change sends the new version (1, then 2).
  - M3: one read (`ensureBuiltinCategories`, the budget, the summary); loading and a failed read say so in today's words, with Try again only when it can help, and nothing of a failed read is drawn.
  - M4: tiles take the mode's tint; names and amounts `ink`, the limit line `quietOnGround`, and `เกิน` in `over` on a `card` chip. Every tile word is 4.5:1 or more in both modes (the test computes each one).
  - M5, M6, m8: swatches and glyphs by the board's names; a built-in's tray by its name, never its key.
  - M7: Back is today's `useGoBack('/spend/budget')`.
  - M8: both trays are locked while they send.
  - M9: in private mode the tray's budget, total and refusal read `฿••••`, and a stored limit is masked in its field until a key is pressed (R106).
  - M10: problems are today's words: as typed for a name too long or a limit over the budget, when saving for an empty name or a mistyped amount.
  - M11: the sections are drawn in the catalogue's language and theme, on the board's month (per-category totals over the fakes, one tile ฿310 over).
  - M12: the plan's tests 2 and 3 now check the whole pack line and exactly which items are created; the review's R1 to R6 are killed.
- **The minors:**
  - m1: the refusal is today's over-total sentence, not the total's.
  - m2: money goes through BigInt and `minorToInputText` only.
  - m3: a new opening shows no failure from the last.
  - m4: the tile draws the kit's `CategoryGlyph`, `categoryInitial` and dark-aware `tileTint` at the board's 22 pt; `WalletCategoryIcon` is used where a square tile is drawn (the pack rows, the archived rows).
  - m5: tiles and fields have minimum heights and grow; at AX5 each tile takes a row and the segments stack.
  - m6: archive asks first, as the tray's second step; the grid lists archived categories with Unarchive (drafts for E2-C).
  - m7: the board's เพิ่มหมวดนี้ and วงเงินต่อเดือน; the pack card joins names as the board does; unused keys removed.
  - m9: a tray's session is made when it opens, so a later read never resets what was typed.
  - m10: an icon is kept only when it changes.
  - m11: income tiles say ได้รับ, with no limit line.
  - m12: the four carried P2-T11 cases are counted apart (below).
  - m13: corrected below.
- **The nits:** n1, the pack's picks start empty; n2, the unused names go; n3, "Add 1 category" and "Built-in categories"; n4, only the kit's type roles.
- **RED to GREEN:**
  - RED, on the planner's typed stubs of `WalletCategoriesScreen.tsx`, `CategoryTray.tsx`, `ThaiPackTray.tsx` and `categorySections.tsx`, with the round's three tests and the first round's hook, screen, copy and route:
    - `typecheck:app` exit 0;
    - `WalletCategories.render.test.tsx`: 33 failed and 5 passed of 38, each failure an `AssertionError` through an asserting lookup (33), with no module-load error. The 5 that pass hold what the first round already had: the four carried P2-T11 cases and the plan's Thai lines;
    - `categoryCommands.render.test.tsx` and `PlanningRoutes.render.test.tsx`: 3 failed and 6 passed of 9, each failure an `AssertionError` (3): A1 and A2 on the first round's hook, and the new route case on the first round's lazy route. The other two hook cases hold paths the first round kept (they kill mutants S4 and S6 of the new code).
  - GREEN:
    - `typecheck:app` exit 0;
    - `WalletCategories.render.test.tsx` 38 of 38 (34 of this round's, and the 4 carried P2-T11 cases);
    - `categoryCommands.render.test.tsx` 4 and `CategoriesScreen.render.test.tsx` 56 (unchanged): 60 of 60;
    - `PlanningRoutes.render.test.tsx` 5 of 5.
- **Mutation check:** 119 mutants, all killed (about 15 minutes), each restore's SHA-256 checked (`tools/mutants.py`).
  - The runner's groups: the moved commands (H1 to H5) and today's screen's host (S1 to S6), against the hook's cases, today's suite and the wallet suite; the wallet screen (W1 to W33), the category tray (T1 to T50), the pack tray (P1 to P17), the route (R1 to R3), the catalogue (C1 to C4) and the copy (Y1).
  - C1 is killed by the kit's render files failing to load (B2's own failure), and S3 and S5 by today's suite's own lookups (`TestingLibraryElementError`); every other one by an assertion, T1's in the Hermes guard (`test:unit`).
  - The plan's two mutants are T6 (the icon kept before the acknowledgement) and P1 (every missing item created).
  - The four carried P2-T11 cases (RV1 to RV4s) hold the kit's glyph and initial; all 119 mutants are in this round's own files.
- **Gate** (R100):
  - `typecheck:app` exit 0; `typecheck:routes` exit 0 (the route changed);
  - `test:app` exit 0, `ℹ fail 0`; `test:unit` exit 0, `ℹ fail 0`;
  - the focused files above;
  - the eight render files that read the wallet catalogue's list: 8 files, 138 of 138 (`CardStack`, `WalletLooks`, `PrivateMode`, `walletHarness`, `Tray`, `Lock`, `AmountStep`, `WalletsList`);
  - the catalogue suites for the four sections (and P2-T11's `bw-category-icons`): 10 passed, 612 skipped (622), with `-t "bw-categor|bw-thai-pack"`;
  - the four routes tests: 4 files, 13 of 13 (`PlanningRoutes` 5);
  - `export:web` exit 0;
  - whitespace: clean.
- **CI** (R100): the full render suite, the iOS export, the edge, database and ops suites run on the PR.
- **Corrections to the first round's receipt (m13):**
  - Its routes line read `Tests 12 passed (12)` against its brief's Expected 11; that was a missed Expected line and should have stopped the build.
  - Its gate skipped `test:unit` and every render file that reads the wallet catalogue's list. That is how B1 (the Hermes guard) and B2 (five files that no longer loaded) reached CI. Both are in this round's gate.
  - Its "Risks: None identified" was wrong: see the review's B1 to B4 and the risks below.
  - Its 18 cases and 14 mutants counted four cases and four mutants of P2-T11's `WalletCategoryIcon.tsx`.
- **Deviations** (the brief's planner rulings):
  - P5: `CategoryTray` takes this month's `budget` from the screen, beside the plan's props. The plan's interface has none, and the first round's own read inside the tray went stale after a save.
  - P4: the screen reads again whenever a tray closes, since the plan's tray props carry no `onSaved`.
  - P8: the over line sits on a `card` chip, since `over` measures 4.18 to 4.38:1 on six hues' tints.
  - P9: the tile composes the kit's parts rather than `WalletCategoryIcon`, whose square would not fit the plan's 104 pt tile at the board's 22 pt glyph.
  - P12: archive and unarchive in the wallet look, which no board draws.
  - P19: the pack card shows on either tab, as the plan binds it.
  - P21: income tiles say ได้รับ (`categories.tileIncome`, a draft).
- **SKIPPED:** device checks (VoiceOver, Dynamic Type at AX5) until E2-C; Docker is stopped, so the database suites are CI's.
- **Risks:**
  - No app route mounts `WalletLooksProvider` yet (P2-T18's `WalletShell` will). Until then, with an account open on a phone, the icon picker is offered but `setIcon` keeps nothing (the review's note; P2-T20's list has the same gap). The wallet area stays off until P2-T38.
  - Every tray close reads the categories, the budget and the summary again, even when nothing was saved.
  - Today's screen also keeps a failed refresh quiet (`useLoad`'s `refresh` keeps the data on screen); so does this one.
- **For E2-C (owner, Q3):** the English drafts; the board names for the swatches and glyphs; `categories.tileIncome` and `categories.packAddOne`; the over chip; the archived list and the archive step; the pack card on the income tab; the name and the limit line at the kit's label (15) and caption (13), where the board draws 14 and 12; the pack tray's empty start (the board pre-picks the missing items).
- **Notes for later tasks:**
  - P2-T18: mount `WalletLooksProvider` in `WalletShell` (the risk above).
  - P2-T37: no colour literal in `src/wallet/categories` but the segments' lift shadow (as `TypeSwitchHeader`'s); `tc()` is called only with catalog lines.
  - P2-T38: the draft lines move to the catalogs.
  - A change to `dev/catalogue/wallet/index.ts` or a section it lists runs the eight render files that read it, and `test:unit`.
```

### `docs/implementation/receipts/P2-T29.md`

```markdown
# P2-T29: Categories, the category tray and the Thai pack tray

- **Status:** built and verified locally on `p2/t29-categories` (`.claude/worktrees/p2-t29`), from `2ff43b0e`. Not pushed. The independent review is the controller's, after this receipt. Under ruling R87 this receipt is its own file; `premium-progress.md` is not edited.
- **Base:** `2ff43b0e` (fast-forwarded from `8434af6`, which incorporated #416 P2-T20 and #418 P3-T5). Verified all shared files and imports (WALLET_LOCK_SECTIONS count 2, WALLET_ADD_SECTIONS count 2).
- **Files:**
  - Created:
    - `apps/app/src/screens/redesign/planning/categoryCommands.ts` (pure command sender, `useCategoryCommands`, `sendCommand`, `send`, `categoryProblem`, `stateChanged`)
    - `apps/app/src/wallet/categories/WalletCategoriesScreen.tsx` (`WalletCategoriesScreen`, 104 pt tiles with spending and limits, wrapping names without clamping, 44 pt type switch with light-only lift, Thai everyday pack card, new category tile, private mode masking)
    - `apps/app/src/wallet/categories/CategoryTray.tsx` (`CategoryTray`, 12 glyphs at 48 pt, 7 swatches at 44 pt without raw hex literals, monthly limit switch with 56 × 44 pt tap area and over-budget refusal, `setIcon` on acceptance only)
    - `apps/app/src/wallet/categories/ThaiPackTray.tsx` (`ThaiPackTray`, 56 pt checkbox rows for 9 C3 items, 'มีแล้ว' badge for existing items, adds only picked items via `packCommands`, surfaces send error messages in Thai with a way out)
    - `apps/app/src/wallet/categories/copy.ts` (`COPY` draft table for categories, swatches, and C3 pack items)
    - `apps/app/src/wallet/categories/WalletCategories.render.test.tsx` (18 render test cases: 7 plan tests + RV1-RV4s vector unit tests + no account open + catalogue sections + AX5 wrapping + 3 ThaiPackTray send failure cases + reduced motion)
    - `apps/app/src/dev/catalogue/wallet/categorySections.tsx` (4 sections: `bw-categories`, `bw-category-new`, `bw-category-limit`, `bw-thai-pack`)
    - `docs/implementation/receipts/P2-T29.md`
  - Modified:
    - `apps/app/src/screens/redesign/planning/CategoriesScreen.tsx` (delegates command sending to `categoryCommands.ts`; runs all 56 tests unchanged)
    - `apps/app/app/spend/categories.tsx` (lazy loads `WalletCategoriesScreen` when wallet area is on)
    - `apps/app/src/dev/catalogue/wallet/index.ts` (adds `WALLET_CATEGORY_SECTIONS` spread between ADD/LIST and LOCK)
- **What changed:**
  - Command extraction (`categoryCommands.ts`, P3): `useCategoryCommands` hook, `sendCommand`, and `send` moved out of `CategoriesScreen.tsx`. Sends category commands (`create`, `update`, `archive`, `unarchive`, `setBudget`) under their command keys, rebases drafts on acknowledgement, handles unconfirmed states, and formats conflicts and refusals. `CategoriesScreen.tsx` delegates to it, running all 56 tests unchanged.
  - Categories screen (`WalletCategoriesScreen.tsx`, P4, P8, P9): 104 pt tiles showing spending against limit or 'ไม่จำกัด', wrapping names without clamping (no `numberOfLines`), 44 pt type switch with light-only lift (`LIFT = '0px 1px 4px rgba(17, 16, 20, 0.14)'`), Thai everyday pack card naming first three missing C3 items followed by `categories.packMore`, new category dashed tile, and private mode masking (`฿••••` and `common.amountHidden`).
  - Category edit/create tray (`CategoryTray.tsx`, P6, P7, P9, P10): 12 glyphs at 48 pt, 7 swatches (`TRAY_SWATCHES`) at 44 pt with zero raw hex literals, monthly limit switch covering the entire board tap area (56 × 44 pt via `switchButton` wrapping the track) with `categories.limitsTotal` over-budget refusal against month's budget. `setIcon(generatedId, pickedGlyph)` is persisted to account storage only after server acknowledgement (`if (ok)`).
  - Thai everyday pack tray (`ThaiPackTray.tsx`, P5, P9): 56 pt checkbox rows for 9 C3 items, disabled 'มีแล้ว' badge for already held items, adds only picked items using `packCommands(categories, locale, newId, { only: keysToAdd })`. On send failures (refused, conflict, unconfirmed), displays Thai error message with highest precedence `(commands.conflict ? commands.conflict.view.message : null) ?? commands.message ?? errorMsg` and provides an active way out.
  - Route lazy loading (`app/spend/categories.tsx`, P4): uses `React.lazy` to load `WalletCategoriesScreen`, preventing wallet theme and status bar modules from breaking `PlanningRoutes.render.test.tsx` when wallet area is off.
  - Reduced motion and vector glyphs (P9, P10): motion 100% owned by `Tray` via `useWalletReducedMotion()`; `CategoryTray` and `ThaiPackTray` declare no local animations. `CategoryGlyph` unfilled circles use `fill="none"`, `stroke=color`, `strokeWidth=2`. Paths use round linecaps and linejoins. Initial uses Thai leading (`walletLineHeight(initial, 'thai')`). Standalone glyphs have `DECORATIVE` wrapper (`aria-hidden="true"`).
  - Catalogue sections (`categorySections.tsx`, `index.ts`, P11): 4 sections (`bw-categories`, `bw-category-new`, `bw-category-limit`, `bw-thai-pack`) rendering real screens on fakes under `WalletRoot`. Spreads `WALLET_CATEGORY_SECTIONS` between LIST and LOCK in `index.ts`.
- **RED to GREEN:**
  - RED: On typed stubs, `npm run typecheck:app`: exit 0. `WalletCategories.render.test.tsx`: exit 1, `Tests 14 failed | 4 passed (18)`. 14 `AssertionError` failures, 0 module/resolution errors. The 4 passing tests are the pure vector unit tests RV1-RV4s.
  - GREEN: With real implementation and proven merged `index.ts`, all checksums matched. `npm run typecheck:app`: exit 0. `node --test apps/app/src/wallet/copy/draftText.test.ts`: exit 0, `✔ pass 4`. `WalletCategories.render.test.tsx`: exit 0, `Tests 18 passed (18)`. `CategoriesScreen.render.test.tsx`: exit 0, `Tests 56 passed (56)`. Four routes tests (`SpendRoutes`, `AccountRoutes`, `InsightsRoutes`, `PlanningRoutes`): exit 0, `Test Files 4 passed (4)`, `Tests 12 passed (12)`.
- **Mutation check:** 14 mutants run via `PL/tools/mutants.py`: 14 killed, 0 survived, 0 not as expected:
  - M1: killed (killed) [OK] pack tray creates every missing item, not only picked ones
  - M2: killed (killed) [OK] icon kept for account before Jotbun accepted category
  - M3: killed (killed) [OK] over-budget refusal removed: save enabled on limit over budget
  - M4: killed (killed) [OK] private mode masking removed (amounts shown in tiles)
  - M5: killed (killed) [OK] RV1: CategoryGlyph unfilled circles filled
  - M6: killed (killed) [OK] RV2: CategoryGlyph linecaps square
  - M7: killed (killed) [OK] RV3: CategoryGlyph tile initial uses Latin line height
  - M8: killed (killed) [OK] RV4: standalone glyph DECORATIVE wrapper removed
  - M9: killed (killed) [OK] catalogue sections empty
  - M10: killed (killed) [OK] category names clamped to 1 line instead of wrapping at AX5
  - M11: killed (killed) [OK] screen type segments under 44 pt minHeight
  - M12: killed (killed) [OK] tray type segments under 44 pt minHeight
  - M13: killed (killed) [OK] limit switch tap area under 56 x 44
  - M14: killed (killed) [OK] ThaiPackTray fails to display error message on send failure
- **Gate** (worktree root, R100):
  - `npm run typecheck:app`: exit 0.
  - `npx vitest run --config vitest.render.config.ts src/wallet/categories/WalletCategories.render.test.tsx`: exit 0, `Tests 18 passed (18)`.
  - `npx vitest run --config vitest.render.config.ts src/screens/redesign/planning/CategoriesScreen.render.test.tsx`: exit 0, `Tests 56 passed (56)`.
  - `node --test apps/app/src/wallet/copy/draftText.test.ts`: exit 0, `✔ pass 4`.
  - `npx vitest run --config vitest.render.config.ts src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx`: exit 0, `Test Files 4 passed (4)`, `Tests 12 passed (12)`.
  - `/usr/bin/git -C WT diff --check`: exit 0, clean.
- **Deviations:**
  - The controller accepted the planner calls P1 to P11 as written.
  - Per controller notes, `index.ts` already had #416 (P2-T20 LIST sections) at head `8434af6` / `2ff43b0e`. The planner's proven merge `PL/logs/merge/index.t20-t29.ts` was copied directly instead of 3-way diff application, yielding sha256 `911e4ce08ddec114...`.
  - Step 1.1 ran `npm ci` as instructed by the brief, completing in 16s with 1416 packages added.
  - Whole-suite totals omitted locally per R100 (CI runs them).
- **SKIPPED:**
  - Full render suite (`test:render`), `export:web`, and iOS export: run in CI per R100.
  - Database suites (`test:db`, `test:edge:db`) and edge workers: Docker is stopped and stays stopped; CI runs them.
  - `test:ops`: no package or lockfile change.
  - Device and simulator checks: VoiceOver / TalkBack live testing, physical touch target measurement on device.
- **Risks:** None identified.
- **Notes for later tasks:**
  - `WalletCategoriesScreen` is mounted via `React.lazy` in `app/spend/categories.tsx` behind the wallet area flag.
  - `CategoryTray` and `ThaiPackTray` have zero local springs or animations, delegating motion to `Tray`.
  - Category icon storage occurs only on server ack; with no account open, `setIcon` is a no-op.
  - **Fix round (12 Nov):** the review (`.claude/controller/reviews/P2-T29.md`) found four blockers, twelve majors and thirteen minors; most of this round's code is replaced. See `receipts/P2-T29-fix.md`, which also corrects this receipt (its m13).
```

## Appendix B: the RED stubs (as `PL/stubs/` holds them)

### `apps/app/src/dev/catalogue/wallet/categorySections.tsx`

```tsx
// RED stub (P2-T29 fix round): the real list's export, with no sections.
import type { CatalogueSection } from '../registry';

export const WALLET_CATEGORY_SECTIONS: readonly CatalogueSection[] = [];
```

### `apps/app/src/wallet/categories/CategoryTray.tsx`

```tsx
// RED stub (P2-T29 fix round): the real tray's exports and types, drawing nothing.
import type { BudgetDto, CategoryDto, CategoryType } from '@gogospend/contracts';
import { CATEGORY_COLORS } from '@gogospend/contracts';

import type { GlyphKey } from '../looks/categoryGlyphs';

export const TRAY_SWATCHES: readonly string[] = [0, 4, 5, 2, 3, 6, 8].map((index) => CATEGORY_COLORS[index]);

export function CategoryMark(_props: { glyph: GlyphKey | null; name: string; size: number }) {
  return null;
}

export type CategoryTrayProps = {
  visible: boolean;
  onClose(): void;
  category: CategoryDto | null;
  type: CategoryType;
  budget: BudgetDto | null;
};

export function CategoryTray(_props: CategoryTrayProps) {
  return null;
}
```

### `apps/app/src/wallet/categories/ThaiPackTray.tsx`

```tsx
// RED stub (P2-T29 fix round): the real tray's exports and types, drawing nothing.
import type { CategoryDto } from '@gogospend/contracts';

export type ThaiPackTrayProps = {
  visible: boolean;
  onClose(): void;
  categories: readonly CategoryDto[];
};

export function ThaiPackTray(_props: ThaiPackTrayProps) {
  return null;
}
```

### `apps/app/src/wallet/categories/WalletCategoriesScreen.tsx`

```tsx
// RED stub (P2-T29 fix round): the real screen's exports and types, drawing nothing.
export type WalletCategoriesScreenProps = {
  /** The clock, for tests; this month is its Bangkok month. */
  now?: Date;
};

export function WalletCategoriesScreen(_props: WalletCategoriesScreenProps = {}) {
  return null;
}
```

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

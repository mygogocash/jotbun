#!/usr/bin/env python3
import os
import sys

PL = "/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t29-planner"
TARGET = "/Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/P2-T29.md"

def read_file(rel):
    with open(os.path.join(PL, rel), "r", encoding="utf-8") as f:
        return f.read()

def count_lines(rel):
    return len(read_file(rel).splitlines())

brief_content = f"""# Brief P2-T29: Categories, the category tray and the Thai pack tray

You are the implementer for plan P2, Task P2-T29 (Gemini 3.8 Flash or Claude Haiku 5.5). You add the Bun Wallet's Categories screen (`WalletCategoriesScreen`: back and new buttons, type switch for expense/income, the Thai everyday pack card, 104 pt category tiles showing spending against limit or 'ไม่จำกัด', new category dashed tile, and private mode masking), the category edit/create tray (`CategoryTray`: name input, type switch for new, 12 glyphs at 48 pt, 7 swatches at 44 pt without raw hex literals, monthly limit toggle and over-budget refusal, and keeping icon via `setIcon` only after Jotbun acknowledges acceptance), the Thai everyday pack tray (`ThaiPackTray`: 44 pt checkbox rows for C3's nine items, 'มีแล้ว' badge for existing categories, and adding only picked items via `packCommands`), the pure category command hook extracted from R4 (`categoryCommands.ts`: `useCategoryCommands`, `sendCommand`, `send`), the draft copy table (`wallet/categories/copy.ts`), the spend route (`app/spend/categories.tsx` via lazy loading), four catalogue sections (`categorySections.tsx`), and the catalogue list spread in `index.ts`.

The planner wrote every file below and proved it in a scratch copy of the integration head `a00fff7`: RED on typed stubs (9 of 13 render cases fail, each on an assertion; the 4 that pass are pure `CategoryGlyph` RV1-RV4s vector unit tests), GREEN (all 13 pass), 9 mutants (all killed, 0 survived), the fast local gate (R100: typecheck, 56 CategoriesScreen tests, 13 WalletCategories tests, 4 draftText tests, 3 PlanningRoutes tests), and merge proofs for `index.ts` with in-flight #416 (P2-T20). Do exactly what this brief says.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only (Step 6), and no whole-suite total anywhere; CI runs the whole suites on the PR. R87 applies: your receipt is its own file, `docs/implementation/receipts/P2-T29.md`; do not edit `premium-progress.md`.
2. The checklist: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/dispatch/flash-ui-planner-checklist-20261112.md`.
3. The plan task: `docs/superpowers/plans/2026-10-25-jotbun-p2-bun-wallet-core.md`, `### Task P2-T29` (lines 1403 to 1445); and Global Constraints (lines 82 to 108: copy and E2 on line 85, accessibility on line 87, money on line 89, both modes and both languages on line 106, pure modules on line 107).
4. The boards: `docs/design/bun-wallet/wc-categories.dc.html`, `wc-category-edit.dc.html`, `wc-thai-pack.dc.html`.
5. The receipts this task builds on: `docs/implementation/receipts/P2-T7.md` (Thai everyday pack in redesign), `P2-T11.md` and `wallet-looks-unstored.md` (kept looks and category icons via `useCategoryIcons`), `P2-T13.md` and `P2-T14.md` (`Tray`, `PrimaryButton`), `P2-T10.md` (money text and private mode) and `P2-T8.md` (mount through `mountWallet`).

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t29` (branch `p2/t29-categories`, made by the orchestrator from `origin/claude/p1a-vault-core`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t29`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t29-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the final version of the ten files this task creates or changes, at their repo paths (the receipt is yours);
  - `stubs/`: the RED forms (typed stubs) of `WalletCategoriesScreen.tsx`, `CategoryTray.tsx`, `ThaiPackTray.tsx` and `categorySections.tsx`;
  - `orig/`: the three existing files this task changes, as they are at the start (`CategoriesScreen.tsx`, `app/spend/categories.tsx`, `index.ts`);
  - `diffs/`: one diff per changed existing file, paths `a/<repo path>` and `b/<repo path>` with full blob ids, so `git apply --3way` can merge them: `apps_app_src_screens_redesign_planning_CategoriesScreen.tsx.diff`, `apps_app_app_spend_categories.tsx.diff` and `apps_app_src_dev_catalogue_wallet_index.ts.diff`. The planner checked that they turn `orig/` into `real/` byte for byte;
  - `tools/`: `mutants.py` (the mutant runner), `stage.sh` (puts a tree at base, RED or GREEN), `sums.sh`, `build_brief.py`;
  - `SHA256SUMS` (every file above) and `SHA256SUMS.logs` (everything in `logs/`: `base-*`, `red-*`, `green-*`, `gate-*`, `merge/`, `mutants.out` and `mutants/`).
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above: type the full path. Git: `/usr/bin/git -C WT <command>`, one git command per call. npm: `cd WT && npm run <script>`. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`. Focused Node files: `cd WT && node --test <files>`.
- This task needs no heavy lock: no database suite and no workers pool. Docker is stopped and stays stopped.
- To compare checksums: `shasum -a 256 <file>` and compare with the line for the same path in `PL/SHA256SUMS`.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/screens/redesign/planning/categoryCommands.ts` | **new**, pure ({count_lines("real/apps/app/src/screens/redesign/planning/categoryCommands.ts")} lines). `useCategoryCommands` hook, `sendCommand`, `send` extracted from `CategoriesScreen.tsx`. |
| `apps/app/src/screens/redesign/planning/CategoriesScreen.tsx` | **shared** ({count_lines("orig/apps/app/src/screens/redesign/planning/CategoriesScreen.tsx")} lines before, {count_lines("real/apps/app/src/screens/redesign/planning/CategoriesScreen.tsx")} after). Delegates command sending to `categoryCommands.ts`; runs all 56 tests unchanged. |
| `apps/app/src/wallet/categories/WalletCategoriesScreen.tsx` | **new** ({count_lines("real/apps/app/src/wallet/categories/WalletCategoriesScreen.tsx")} lines). `WalletCategoriesScreen`, 104 pt tiles with spending and limits, type switch, pack card, new tile, private mode. |
| `apps/app/src/wallet/categories/CategoryTray.tsx` | **new** ({count_lines("real/apps/app/src/wallet/categories/CategoryTray.tsx")} lines). `CategoryTray`, 12 glyphs at 48 pt, 7 swatches (`TRAY_SWATCHES`) at 44 pt, monthly limit toggle with `categories.limitsTotal` over-budget refusal, `setIcon` on acceptance. |
| `apps/app/src/wallet/categories/ThaiPackTray.tsx` | **new** ({count_lines("real/apps/app/src/wallet/categories/ThaiPackTray.tsx")} lines). `ThaiPackTray`, 44 pt checkbox rows for 9 C3 items, 'มีแล้ว' badge for held items, adds only picked items via `packCommands`. |
| `apps/app/src/wallet/categories/copy.ts` | **new** ({count_lines("real/apps/app/src/wallet/categories/copy.ts")} lines). `COPY` table for categories, swatches, and C3 pack items. |
| `apps/app/src/wallet/categories/WalletCategories.render.test.tsx` | **new**, render suite ({count_lines("real/apps/app/src/wallet/categories/WalletCategories.render.test.tsx")} lines). 13 cases (7 plan tests + RV1-RV4s + no account open + catalogue sections). |
| `apps/app/app/spend/categories.tsx` | **shared**, route ({count_lines("orig/apps/app/app/spend/categories.tsx")} lines before, {count_lines("real/apps/app/app/spend/categories.tsx")} after). Lazy loads `WalletCategoriesScreen` when wallet area is on. |
| `apps/app/src/dev/catalogue/wallet/categorySections.tsx` | **new**, dev ({count_lines("real/apps/app/src/dev/catalogue/wallet/categorySections.tsx")} lines). 4 sections: `bw-categories`, `bw-category-new`, `bw-category-limit`, `bw-thai-pack`. |
| `apps/app/src/dev/catalogue/wallet/index.ts` | **shared** ({count_lines("orig/apps/app/src/dev/catalogue/wallet/index.ts")} lines before, {count_lines("real/apps/app/src/dev/catalogue/wallet/index.ts")} after). Adds `WALLET_CATEGORY_SECTIONS` spread between ADD and LOCK. |
| `docs/implementation/receipts/P2-T29.md` | **new**. Your receipt (R87). |

## Planner rulings (the calls this brief makes, with the reason for each)

- **P1. Head is `a00fff7`.** Merged since previous notes: P2-T14 (`7cf4927`), P3-T4 (`431ea63`), P2-T33 (`a00fff7`). All merge proofs for #407 and #406 are dropped.
- **P2. In flight #416 (P2-T20: wallets list).** `index.ts` merge proofs for both merge orders with #416 are verified in `PL/logs/merge/` with sha256 checksums (`index.t20-t29.ts` sha256 `911e4ce0`). No files are shared with #411 (P2-T32) or #412 (P2-T25) except `index.ts`.
- **P3. Category commands hook extraction (`useCategoryCommands`).** Following the plan, `sendCommand` and `send` are moved out of `CategoriesScreen.tsx` into `src/screens/redesign/planning/categoryCommands.ts`. `CategoriesScreen.tsx` delegates to it, running all 56 tests unchanged.
- **P4. Route lazy loading in `app/spend/categories.tsx`.** Uses `React.lazy` to import `WalletCategoriesScreen`, preventing `PlanningRoutes.render.test.tsx` from pulling in wallet theme / status bar modules when wallet area is off. `PlanningRoutes.render.test.tsx` remains completely untouched, preventing any merge collision with in-flight #416.
- **P5. Thai everyday pack (C3's 9 items).** Items come from `THAI_EVERYDAY_PACK` in `thaiPack.ts`. The pack card names the first three missing items (`missingPackItems(categories)`), followed by `categories.packMore`. `ThaiPackTray` lists all 9 items in 44 pt checkbox rows, disables existing items with 'มีแล้ว' badge, starts with empty selection so the user picks only what applies, and adds only picked items using `packCommands(categories, locale, newId, {{ only: keysToAdd }})`. Pack categories show their glyphs through `iconFor`, so nothing is kept in account storage for them.
- **P6. CategoryTray and Swatches.** Swatches are `TRAY_SWATCHES = [0, 4, 5, 2, 3, 6, 8].map((i) => CATEGORY_COLORS[i])` (no raw hex literals in components). 7 swatches at 44 pt, 12 glyphs at 48 pt. The monthly limit switch toggles the limit input and shows `categories.limitsTotal`. If the limit exceeds the budget total, `checkLimits` refuses save and displays the refusal message inline.
- **P7. Account icon storage timing.** The category icon is kept in account storage via `setIcon(generatedId, pickedGlyph)` ONLY AFTER Jotbun accepts the category (`if (ok)`). With no account open (`accountId === null`), `setIcon` does not run.
- **P8. Private mode masking.** When private mode is enabled (`hidden: true`), category tiles show `฿••••` and accessible labels replace amounts with `common.amountHidden`. No raw amounts reach screen, accessibility labels, or logs.
- **P9. Motion and accessibility.** Tray animations read `isReducedMotion` (W6, R66) and avoid springs when reduced motion is on. Every control is at least 44 pt and has accessible role and name.
- **P10. Vector glyph rules (RV1-RV4s).** `CategoryGlyph` unfilled circles (e.g. travel wheel) have `fill="none"`, `stroke=color`, `strokeWidth=2`. Paths have round linecaps and linejoins. Tile initials use Thai leading (`lineHeight: walletLineHeight(initial, 'thai')`). Standalone glyphs have the `DECORATIVE` wrapper (`aria-hidden="true"`).
- **P11. Catalogue sections.** Four sections in `categorySections.tsx`: `bw-categories`, `bw-category-new`, `bw-category-limit`, `bw-thai-pack`, rendering the real screens on fakes under `WalletRoot`.

---

## Step 0: Sync, and what this task waits for

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date." or fast-forward to `a00fff7` or newer.
2. Confirm P2-T14, P3-T4, and P2-T33 are present:
   - `grep -c "WALLET_LOCK_SECTIONS" WT/apps/app/src/dev/catalogue/wallet/index.ts`. Expected: `2` (import and spread).
   - `grep -c "WALLET_ADD_SECTIONS" WT/apps/app/src/dev/catalogue/wallet/index.ts`. Expected: `2` (import and spread).
3. Check status of shared files:
   - `shasum -a 256 WT/apps/app/src/screens/redesign/planning/CategoriesScreen.tsx WT/apps/app/app/spend/categories.tsx WT/apps/app/src/dev/catalogue/wallet/index.ts`. Compare against `PL/orig/` lines in `PL/SHA256SUMS`. (If #416 merged first, `index.ts` will contain `WALLET_LIST_SECTIONS`; Step 4.1 applies the 3-way diff).

## Step 1: Install and the focused base

1. `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?`. Expected: 0.
2. `cd WT && npm run typecheck:app > S/base-typecheck.log 2>&1; echo $?`. Expected: 0.
3. The focused base:
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/planning/CategoriesScreen.render.test.tsx > S/base-categories-render.log 2>&1; echo $?`. Expected: 0, `Tests  56 passed (56)`.
   - `cd WT && node --test apps/app/src/wallet/copy/draftText.test.ts > S/base-draft.log 2>&1; echo $?`. Expected: 0, `✔ tests 4`, `✔ pass 4`.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/planning/PlanningRoutes.render.test.tsx > S/base-routes.log 2>&1; echo $?`. Expected: 0, `Tests  3 passed (3)`.

## Step 2: The tests, the copy, and the typed stubs (plan Step 1)

1. Copy the tests, copy table, and typed stubs:
   ```bash
   mkdir -p WT/apps/app/src/wallet/categories WT/apps/app/src/dev/catalogue/wallet
   cp PL/real/apps/app/src/wallet/categories/copy.ts WT/apps/app/src/wallet/categories/copy.ts
   cp PL/real/apps/app/src/wallet/categories/WalletCategories.render.test.tsx WT/apps/app/src/wallet/categories/WalletCategories.render.test.tsx
   cp PL/stubs/apps/app/src/wallet/categories/WalletCategoriesScreen.tsx WT/apps/app/src/wallet/categories/WalletCategoriesScreen.tsx
   cp PL/stubs/apps/app/src/wallet/categories/CategoryTray.tsx WT/apps/app/src/wallet/categories/CategoryTray.tsx
   cp PL/stubs/apps/app/src/wallet/categories/ThaiPackTray.tsx WT/apps/app/src/wallet/categories/ThaiPackTray.tsx
   cp PL/stubs/apps/app/src/dev/catalogue/wallet/categorySections.tsx WT/apps/app/src/dev/catalogue/wallet/categorySections.tsx
   ```
2. Verify checksums against `PL/SHA256SUMS`:
   `cd WT && shasum -a 256 apps/app/src/wallet/categories/copy.ts apps/app/src/wallet/categories/WalletCategories.render.test.tsx apps/app/src/wallet/categories/WalletCategoriesScreen.tsx apps/app/src/wallet/categories/CategoryTray.tsx apps/app/src/wallet/categories/ThaiPackTray.tsx apps/app/src/dev/catalogue/wallet/categorySections.tsx`

3. The stubs, for reference:

```tsx
{read_file("stubs/apps/app/src/wallet/categories/WalletCategoriesScreen.tsx")}
```

```tsx
{read_file("stubs/apps/app/src/wallet/categories/CategoryTray.tsx")}
```

```tsx
{read_file("stubs/apps/app/src/wallet/categories/ThaiPackTray.tsx")}
```

```tsx
{read_file("stubs/apps/app/src/dev/catalogue/wallet/categorySections.tsx")}
```

## Step 3: RED (plan Step 2)

1. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: 0.
2. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/categories/WalletCategories.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected: 1, `Tests  9 failed | 4 passed (13)`.
   - `grep -c '^AssertionError' S/red-render.log` gives 9.
   - `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function|TestingLibraryElementError' S/red-render.log` gives 0.
   - 4 passing tests are the pure vector unit tests RV1-RV4s.
   - 9 failing tests fail strictly on `AssertionError`:
     - `the grid shows each category's spending against its limit, over in the over colour` -> `AssertionError: a heading named หมวดหมู่: expected 0 to be greater than 0`
     - `the pack card names the first three missing C3 items` -> `AssertionError: เพิ่มชุดหมวด: expected 0 to be greater than 0`
     - `the pack tray adds only the picked missing items, and marks the ones the person has` -> `AssertionError: a heading named ชุดหมวดแบบไทย: expected 0 to be greater than 0`
     - `a new category keeps its icon for the account only after Jotbun accepted it` -> `AssertionError: category-name-input: expected null not to be null`
     - `a limit that would pass the month's budget is refused in words` -> `AssertionError: a switch named ตั้งวงเงินต่อเดือน: expected 0 to be greater than 0`
     - `private mode hides the tiles' amounts` -> `AssertionError: masked amount indicators: expected 0 to be greater than 0`
     - `every glyph, swatch and checkbox is at least 44 pt and named` -> `AssertionError: a radio named อาหาร: expected 0 to be greater than 0`
     - `with no account open, setIcon keeps nothing and changes nothing on screen` -> `AssertionError: category-name-input: expected null not to be null`
     - `catalogue sections bw-categories, bw-category-new, bw-category-limit, bw-thai-pack render cleanly` -> `AssertionError: expected +0 to be 4`

## Step 4: GREEN (plan Steps 3 and 4)

1. Copy the implementation from `PL/real/`:
   ```bash
   cp PL/real/apps/app/src/screens/redesign/planning/categoryCommands.ts WT/apps/app/src/screens/redesign/planning/categoryCommands.ts
   cp PL/real/apps/app/src/screens/redesign/planning/CategoriesScreen.tsx WT/apps/app/src/screens/redesign/planning/CategoriesScreen.tsx
   cp PL/real/apps/app/src/wallet/categories/WalletCategoriesScreen.tsx WT/apps/app/src/wallet/categories/WalletCategoriesScreen.tsx
   cp PL/real/apps/app/src/wallet/categories/CategoryTray.tsx WT/apps/app/src/wallet/categories/CategoryTray.tsx
   cp PL/real/apps/app/src/wallet/categories/ThaiPackTray.tsx WT/apps/app/src/wallet/categories/ThaiPackTray.tsx
   cp PL/real/apps/app/app/spend/categories.tsx WT/apps/app/app/spend/categories.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/categorySections.tsx WT/apps/app/src/dev/catalogue/wallet/categorySections.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/index.ts WT/apps/app/src/dev/catalogue/wallet/index.ts
   ```
   (If `index.ts` already contains changes from #416, apply with `/usr/bin/git -C WT apply --3way PL/diffs/apps_app_src_dev_catalogue_wallet_index.ts.diff`).

2. Verify checksums of all 10 files against `PL/SHA256SUMS`.
3. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: 0.
4. `cd WT && node --test apps/app/src/wallet/copy/draftText.test.ts > S/green-draft.log 2>&1; echo $?`. Expected: 0, `✔ pass 4`.
5. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/categories/WalletCategories.render.test.tsx > S/green-render.log 2>&1; echo $?`. Expected: 0, `Tests  13 passed (13)`.
6. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/planning/CategoriesScreen.render.test.tsx > S/green-categories-render.log 2>&1; echo $?`. Expected: 0, `Tests  56 passed (56)`.
7. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/planning/PlanningRoutes.render.test.tsx > S/green-routes-render.log 2>&1; echo $?`. Expected: 0, `Tests  3 passed (3)`.

## Step 5: Mutation check (plan Step 5)

1. `python3 -I PL/tools/mutants.py WT S/mutants > S/mutants.out 2>&1; echo $?`. Expected: exit 0, and these 9 lines:
   ```
{read_file("logs/mutants.out").strip()}
   ```
2. Verify with `git status --short`: clean working directory for all mutated files.

## Step 6: The fast local gate (R100)

Run from WT root:
1. `npm run typecheck:app`: exit 0.
2. `cd apps/app && npx vitest run --config vitest.render.config.ts src/wallet/categories/WalletCategories.render.test.tsx`: exit 0, `13 passed`.
3. `cd apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/planning/CategoriesScreen.render.test.tsx`: exit 0, `56 passed`.
4. `node --test apps/app/src/wallet/copy/draftText.test.ts`: exit 0, `4 pass`.
5. `cd apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/planning/PlanningRoutes.render.test.tsx`: exit 0, `3 passed`.
6. `/usr/bin/git -C WT diff --check`: exit 0, no output.

## Step 7: Receipt

Write `docs/implementation/receipts/P2-T29.md` following the house style. Include exact test counts, mutant outcomes, and rulings.

## Step 8: Commit

`/usr/bin/git -C WT add apps/app docs/implementation/receipts/P2-T29.md`
`/usr/bin/git -C WT commit -m "Add Bun Wallet categories, the category tray and the C3 Thai pack tray"`

## Your final message

Report READY: briefs/P2-T29.md with file counts and sha256 checksums.

---

## Appendix: the code

### `apps/app/src/screens/redesign/planning/categoryCommands.ts`
```ts
{read_file("real/apps/app/src/screens/redesign/planning/categoryCommands.ts")}
```

### `apps/app/src/screens/redesign/planning/CategoriesScreen.tsx`
```tsx
{read_file("real/apps/app/src/screens/redesign/planning/CategoriesScreen.tsx")}
```

### `apps/app/src/wallet/categories/WalletCategoriesScreen.tsx`
```tsx
{read_file("real/apps/app/src/wallet/categories/WalletCategoriesScreen.tsx")}
```

### `apps/app/src/wallet/categories/CategoryTray.tsx`
```tsx
{read_file("real/apps/app/src/wallet/categories/CategoryTray.tsx")}
```

### `apps/app/src/wallet/categories/ThaiPackTray.tsx`
```tsx
{read_file("real/apps/app/src/wallet/categories/ThaiPackTray.tsx")}
```

### `apps/app/src/wallet/categories/copy.ts`
```ts
{read_file("real/apps/app/src/wallet/categories/copy.ts")}
```

### `apps/app/src/wallet/categories/WalletCategories.render.test.tsx`
```tsx
{read_file("real/apps/app/src/wallet/categories/WalletCategories.render.test.tsx")}
```

### `apps/app/app/spend/categories.tsx`
```tsx
{read_file("real/apps/app/app/spend/categories.tsx")}
```

### `apps/app/src/dev/catalogue/wallet/categorySections.tsx`
```tsx
{read_file("real/apps/app/src/dev/catalogue/wallet/categorySections.tsx")}
```

### `apps/app/src/dev/catalogue/wallet/index.ts`
```ts
{read_file("real/apps/app/src/dev/catalogue/wallet/index.ts")}
```
"""

with open(TARGET, "w", encoding="utf-8") as f:
    f.write(brief_content)

print(f"Wrote brief to {TARGET} ({len(brief_content)} bytes)")

# Brief P2-T11: Looks kept on the phone: wallet looks, Bun faces, materials, category icons and the wallet card

You are the implementer for plan P2, Task P2-T11. You add the Bun Wallet's looks: each wallet's kind, material and Bun face, the wallet order and each category's icon, kept on the phone per account (`WalletLooksProvider`), with a look derived from the wallet's id when none is kept; Bun's five faces (`BunFace`); the five materials (`MaterialFill`); the category glyphs and tile (`categoryGlyphs.ts`, `categoryIcons.ts`, `WalletCategoryIcon`); and the wallet card (`WalletCard`) in its three variants. You move today's category line drawings into their own file, unchanged, so the wallet's glyphs share them. You add the looks provider to the wallet test harness, with the two harness cases P2-T8's review left ready, and three kit sections to the catalogue. The planner wrote every file below and proved it in a scratch copy of `30fb26b` (the integration head when this brief was written): RED on typed stubs (10 of 10 Node cases fail and 19 of 27 render cases fail, each on an assertion; the 8 that pass are the harness's own cases and the two review cases, which pin P2-T8's harness as it is), GREEN, 119 mutants all killed, and the fast local gate of R100. Do exactly what this brief says.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only (Step 6); whole suites run in CI on the PR. R87 applies: your receipt is its own file, `docs/implementation/receipts/P2-T11.md`; do not edit `premium-progress.md`.
2. The plan task: `docs/superpowers/plans/2026-10-25-jotbun-p2-bun-wallet-core.md`, `### Task P2-T11` (lines 757 to 806); W5, W7, W8, W10, W25 and W30 (lines 42, 44, 45, 47, 62 and 67); Review Focus 2 and 3 (lines 115 and 116); the Phase 5 handoff (lines 143 to 149); its Global Constraints (lines 82 to 108: copy and E2 on line 85, type on line 86, accessibility on line 87, colour on line 88, the R72 test traps on lines 94 to 99, "both modes and both languages" on line 106, pure modules on line 107); P2-T12 (lines 810 to 836), which uses this card; P2-T37's sweep (lines 1776 and 1777), whose rules every file here keeps (no `#RRGGBB` literal under `src/wallet` outside `walletPalette.ts` and `looks/BunFace.tsx`, no `under` or `over`, no amount with private mode on, 44 pt controls).
3. The notes this task carries in: P2-T10's receipt, `docs/implementation/receipts/P2-T10.md`, its last section; P2-T8's review, `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T8.md`, m-1 and m-2 (lines 98 to 150); and `/Users/kunanonjarat/Developer/jotbun/.claude/controller/followups.md`, the P2-T8 and P2-T10 entries (lines 40 to 90).

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t11` (branch `p2/t11-wallet-looks`, made by the orchestrator from `origin/claude/p1a-vault-core`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t11`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t11-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the final version of the 18 files this task creates or changes, at their repo paths (the receipt is yours);
  - `stubs/`: the eight code files in their RED form (typed stubs);
  - `orig/`: the four shared files as they are at `30fb26b`;
  - `diffs/`: one diff per changed shared file (`apps_app_src_ui_categoryIcons.tsx.diff`, `apps_app_src_wallet_testing_walletHarness.tsx.diff`, `apps_app_src_wallet_testing_walletHarness.render.test.tsx.diff`, `apps_app_src_dev_catalogue_wallet_kitSections.tsx.diff`), for reading only (each turns `orig/` into `real/`);
  - `tools/`: `mutants.py` (the mutant runner), `prove.sh` (the planner's own stages), `brief.py` and `brief.template.md` (how this brief was built: every code block below is the kit's file, byte for byte, and the mutant lines are `logs/mutants.out`);
  - `SHA256SUMS` (every file above) and `SHA256SUMS.logs` (the planner's logs in `logs/`: `summary.txt` (every stage, timed, with the load average), `base-*`, `red-*`, `green-*`, `gate-*`, `mutants.out` and `mutant-logs/`, `superseded/run-1/` (the first full run: 118 mutants, PR9 survived, so V3 gained `heldReads` and MA9 came with the material's style change) and `iter-*` (checks run while the files were written, kept as history; those before 22:56 ran on a copy of `6d7fc6a`, the head before 1D-T8 merged)).
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above: type the full path. Git: `/usr/bin/git -C WT <command>`, one git command per call. npm: `cd WT && npm run <script>`. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`. Node tests: `cd WT && npm run test:unit -w gogospend-app -- <files>`.
- This task needs no heavy lock: no database suite, no workers pool. Docker is stopped and stays stopped.
- To compare checksums: `shasum -a 256 <file>` and compare with the line for the same path in `PL/SHA256SUMS` (`real/...`, `stubs/...` or `orig/...`).
- **R100: no whole-suite totals.** `test:unit` and `test:app` must exit 0 with `ℹ fail 0`; their totals are not checked here. CI runs the full render suite, `export:web`, the iOS export and the rest on the PR.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. The exceptions: the merge rule in Step 1.2, and a load flake in Step 6 (a case that times out under load in a file this task does not touch: rerun that file alone once and record both runs).

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/ui/categoryDrawings.ts` | **new**, pure. Today's `DRAWINGS`, moved out of `categoryIcons.tsx` unchanged, exported as `CATEGORY_DRAWINGS`, with their shape type exported as `DrawingShape` (two optional fields, P5). |
| `apps/app/src/ui/categoryIcons.tsx` | **shared** (the Bun diary's icons; users: `CategoryGrid`, `CategoryChips`, `RecordRow`, History, Home, the planning screens, the catalogue). Imports `CATEGORY_DRAWINGS` in place of its own table; header comment. No behaviour change. 97 lines before, 84 after. |
| `apps/app/src/wallet/looks/walletLooks.ts` | **new**, pure. `WalletKind`, `WALLET_KINDS`, `BunFaceName`, `BUN_FACES`, `WalletLook`, `derivedLook`, `parseLooks`, plus `keptEntries` and `parseOrder` (P13). |
| `apps/app/src/wallet/looks/walletLooks.test.ts` | **new**, Node. 5 cases. |
| `apps/app/src/wallet/looks/categoryGlyphs.ts` | **new**, pure. `GlyphKey`, `CATEGORY_PICKER_GLYPHS`, `glyphShapes`, plus `isGlyphKey` (P13). |
| `apps/app/src/wallet/looks/categoryIcons.ts` | **new**, pure. `PACK_GLYPH`, `parseIcons`, `iconFor`, plus the `KeptIcons` type. |
| `apps/app/src/wallet/looks/categoryIcons.test.ts` | **new**, Node. 5 cases. |
| `apps/app/src/wallet/looks/WalletLooksProvider.tsx` | **new**. `WalletLooksProvider`, `useWalletLooks`, `useCategoryIcons` (P2), the three store names and the `WalletLooks` and `CategoryIcons` types. |
| `apps/app/src/wallet/looks/BunFace.tsx` | **new**. `BunFace`. |
| `apps/app/src/wallet/looks/MaterialFill.tsx` | **new**. `MaterialFill`. |
| `apps/app/src/wallet/looks/WalletCategoryIcon.tsx` | **new**. `WalletCategoryIcon`, plus `CategoryGlyph` (P13). |
| `apps/app/src/wallet/looks/WalletLooks.render.test.tsx` | **new**. 9 cases (P14). |
| `apps/app/src/wallet/card/copy.ts` | **new**, data. `COPY`: the card's eleven `card.*` lines. |
| `apps/app/src/wallet/card/WalletCard.tsx` | **new**. `WalletCardModel`, `walletCardWords`, `WalletCard`, plus `CARD_HEIGHT` and the `WalletCardWords` type (P13). |
| `apps/app/src/wallet/card/WalletCard.render.test.tsx` | **new**. 9 cases. |
| `apps/app/src/wallet/testing/walletHarness.tsx` | **shared** (P2-T8's; plan line 764). `WalletLooksProvider` innermost, its import, and the header (P11). 154 lines before, 161 after. |
| `apps/app/src/wallet/testing/walletHarness.render.test.tsx` | **shared** (P2-T8's). Three cases added before the last: P2-T8's review's two ready cases and one for the looks (P11); three imports and the header. 159 lines before, 225 after. |
| `apps/app/src/dev/catalogue/wallet/kitSections.tsx` | **shared** (P2-T10's kit list; one list per area, each kit task adds its sections). Three sections, `bw-materials`, `bw-card` and `bw-category-icons`, their imports and the header (P12). 107 lines before, 223 after. |
| `docs/implementation/receipts/P2-T11.md` | **new**. Your receipt (R87). |

Not in this task: `src/dev/catalogue/wallet/index.ts` (P2-T10 already spreads `WALLET_KIT_SECTIONS` there) and `registry.tsx` (the wallet list is last there, from P2-T8; 1D-T8's merge did not move it); `WalletRoot.tsx` (the looks provider goes in `WalletShell`, P2-T18, not the root); P2-T13's files (`src/wallet/tray/`, `src/ui/lockCover.tsx`, planned next); `src/slips/` (P4-T12 and P4-T13, in flight); `apps/edge`, `.github/workflows`, `scripts/ci` (1B-T8 and ci-parallel-jobs, in flight); `featureFlags.ts` and any route; the catalogue tests themselves; `en.json` and `th.json` (draft copy stays in `card/copy.ts` until P2-T38); any package or lockfile; `premium-progress.md`.

## Planner rulings (the calls this brief makes, with the reason for each)

- **P1. Ready, on base `30fb26b`.** Starts after P2-T1 (#329, `d193a68`), P2-T3 (#79, `7e56e14`), P2-T7 (#82, `e546bee`), P2-T8 (#365, `1502e65`) and P2-T10 (#370, `51be132`): all merged. No package (react-native-svg 15.16.0 is installed), Cloudflare resource, owner decision, approval or account setting is needed; the copy is draft under Q3's default (plan line 80). The task was dispatched at `331c2b2`; since then 1D-T8 merged (#372, `30fb26b`) with controller-state commits. 1D-T8 touched none of this task's files: `orig/` holds the four shared files at `30fb26b`, and they are byte-identical to `331c2b2`'s. No step waits on 1D-T8 any more. The planner's base at `30fb26b`: the focused files below pass (harness 6, `PrivateMode` 9, `WalletAmount` 5, `CategoryGrid` 4, `CategoryChips` 7, `RecordRow` 8, `kitUnification` 5; `CatalogueScreen` 298 and `screenReader` 278 cases), and `test:app` and `test:unit` exit 0 with `ℹ fail 0`.
- **P2. Where the hooks live.** `useCategoryIcons` is in `WalletLooksProvider.tsx`, beside `useWalletLooks`. The plan lists it after `iconFor`, but `categoryIcons.ts` is pure (its Node test reads it, plan line 107), and one provider reads all three kept names (`looks`, `wallet-order`, `category-icons`) for the open diary's account.
- **P3. How the provider keeps the person's data (W7, R64).**
  - Each change reads its name from the store, changes it and writes it back, after the account's first read and after the change before it (one queue). So two quick changes never drop each other; a read that lands late never hides a change; a change made just before the account changes is kept for the account it was made in, and shows under neither.
  - A name the store cannot read counts as nothing kept (P2-T10's rule) and is never written over: the person's kept looks are not replaced because of one failed read. A change to it, or a write that fails, shows until the app closes (P2-T10's rule).
  - With no account (no diary open: the web, opening, locked or signed out) every look is derived and the setters keep nothing, as the plan says. Right after the account changes, nothing of the last account shows for even one render.
  - Until the account's looks are read (a few milliseconds after the diary opens), each wallet shows its derived look. The plan's interface has no `ready`, and none is added: note for P2-T12 and P2-T24.
  - `setOrder` keeps each id once. Kept text is read leniently: a damaged entry is dropped, never thrown (the plan's `parseLooks` rule, applied to icons and the order too).
- **P4. One drawing per glyph key.** The built-in keys draw `CATEGORY_DRAWINGS` and the picker's other ten copy wc-category-edit's shapes unchanged, as the plan says. The picker's อาหาร and ของขวัญ are `food` and `gift`, which are built-in keys, so they draw today's built-in food and gift, not the board's bowl with steam and box. Reason: a kept icon is a key and a key has one drawing, and the plan keeps today's drawing for every built-in (the boards draw travel as a car and bills as a receipt too), so food and gift keeping theirs keeps every built-in category looking as the Bun diary draws it. For E2-A: `bw-category-icons` shows both, and the owner can ask for the board's.
- **P5. `DrawingShape` gains two optional fields that today's drawings never set.** The board's car has two filled dots (`filled` on a circle) and its phone a 2.5 corner (`rx` on a rectangle). Without them the ten board glyphs cannot be copied unchanged. `CategoryIcon` reads neither and draws exactly as before (every rectangle with a 2 pt corner); the moved table is byte-identical, and `categoryIcons.test.ts` pins its SHA-256. Each board `<path>` stays one `d` (the board writes several subpaths in one). Every glyph is drawn as 2 pt round strokes (the plan), not the board's 1.8.
- **P6. A credit card reads what was spent from zero down (W25).** wc-wallet-type: "บัตรเครดิตจะแสดงเป็นยอดที่ใช้ไปแทนยอดคงเหลือ". The plan names the negative balance; at zero, "ใช้ไป ฿0" (spent nothing yet) is true, while "฿0" said as "เหลือ 0 บาท" reads as no credit left. A credit card paid ahead (above zero) shows what is left, like any wallet.
- **P7. Private mode on the card (W10, Review Focus 2).** Every line keeps its place and only its amount is masked: `฿••••`, `รวม ฿•••• ที่กำลังบันทึก`, `วันนี้ ฿••••`, and ใช้ไป stays (it holds no amount). W10: "rows never change height", which the spine's list rows need. The card says the plan's words, `บัญชีหลัก, ซ่อนยอดเงินอยู่`. For E2-A: bw-private drops ใช้ไป and the today line.
- **P8. The card's words.**
  - `walletCardWords` also returns `todayLine`, a superset of the plan's return, so every word the card draws or says comes from one function.
  - A card draws the today line whenever `todayOutMinor` is passed and not zero, in every variant; the stack passes it for its front card only (P2-T12), which is how "the front stack card shows card.todayOut" holds. A zero, null or missing total draws no line.
  - Amounts: a balance is drawn with `sign="balance"` (followups: anything that can go negative), a credit card's spending as its size. The pending total and today's money out sit inside sentences, so they are drawn as text through `walletMoneyText` (or `HIDDEN_AMOUNT` in private mode), and the card's own label says them (followups: an amount nested in a sentence needs the sentence's own label).
  - The spoken label joins the name and each part with ", " (ax-voiceover, rh-offline). With no `onPress` the card is one element (`accessible`, labelled) and no button.
- **P9. Board calls the plan does not name (for E2-A, plan line 136).**
  - `stack`: radius 22, padding 16, Bun's face 28, the name 15/700 (`label` at 700), the amount 16 (bw-home's back cards). `full`: the face 38 and the amount 22, top right as the plan says (bw-wallet draws a 34 pt amount at the bottom), padding 16 and 18. The front card's larger face and amount, and the "Jotbun" mark, are not drawn: one `stack` variant serves every card.
  - Both are at least 200 pt and grow rather than clip should text ever need more; the stack uses `spine` at the largest text sizes (P2-T12).
  - `spine` (ax-large-home): the card colour, radius 22, padding 14, 18, 16 and 34, a 12 pt material strip at left 10 with a 6 pt corner, the name `body` at 700 (53 pt at AX5), the amount 17 (53 at AX5), the lines `caption` (44 at AX5), ใช้ไป and the lines in `quiet`.
  - Text on a material: the name, the amount, the kind line and the today line in the material's text colour, ใช้ไป and the pending line in its quiet text.
  - Not drawn: rh-offline's dashed clock beside the pending line; the paper spine's inset edge.
  - Bun's face keeps its ink outline on every material (bw-home leaves it off on titanium, where ink on near-black barely shows).
  - The material is react-native-svg's `LinearGradient` from (0, 0) to (1, 1) of the card's box, as `SpendIntroScreen` draws its wash (W5): CSS's 135° on a square card, the box's diagonal on a wide one. Dark titanium's edge is a 1 pt border drawn inside the corner. Every touch goes through the material to the card: `pointerEvents: 'none'` sits in its style, the house rule (`BunPeek`, and `CustomerSpendScreen`'s note: react-native-web 0.21 deprecates the prop).
- **P10. The category tile.** 36 pt with an 11 pt corner and an 18 pt glyph (the plan), in proportion at other sizes, as the boards draw 40 with 12 and 20, 52 with 16 and 26, and 64 with 20 and 32: corner `round(size × 11 / 36)`, glyph `size / 2`, initial `round(size × 15 / 36)` at 700 with the Thai leading. The initial never grows with the text size (the tile is a fixed square and decorative, as `CategoryIcon`'s). The hue is `tileTint` (P2-T1's, held to 4.5:1 for the ink), else `raised`.
- **P11. The harness (plan line 764, followups).** `WalletLooksProvider` goes innermost, inside `AiCompanionProvider`, as `WalletShell` will mount it (P2-T18). This brief folds in P2-T8's review m-1: its two ready cases (H6, H7) go into `walletHarness.render.test.tsx` as written. They pass at RED by design, since they pin P2-T8's harness as it is; mutants HA2, HA3 and HA4 (the review's E2, E3 and X2) show they now hold it. m-2's sentence goes into the harness header: a language chosen inside the mount changes the preference, not the language drawn.
- **P12. The catalogue.** `bw-materials` (titled "Bun Wallet: materials and faces": the five materials and Bun's five faces), `bw-card` (cash, bank with today's spending, credit card, a pending total, private, plus a full and a spine card) and `bw-category-icons` (the picker's twelve and tiles for built-ins, the Thai pack by name, a custom initial and no colour). Cards take their look as a prop, and a tile outside the wallet's looks shows no kept icon, so no section reads the person's kept looks. The private card mounts its own `PrivateModeProvider` over a store in memory, as `bw-private` does (P2-T10's P3). No section imports the harness.
- **P13. Names.** Beyond the plan's interface, for later tasks: `keptEntries` and `parseOrder` (`walletLooks.ts`), `isGlyphKey` (`categoryGlyphs.ts`), the `KeptIcons` type (`categoryIcons.ts`), `LOOKS_NAME`, `WALLET_ORDER_NAME`, `CATEGORY_ICONS_NAME` and the `WalletLooks` and `CategoryIcons` types (the provider), `CategoryGlyph` (one glyph in a box, for P2-T29's picker), `CARD_HEIGHT` and the `WalletCardWords` type (P2-T12's stack uses 200). `card/copy.ts` exports `COPY`, the plan's copy rule (plan line 368).
- **P14. Cases beyond the plan's named ones**, each pinning a rule above or a guard the mutants need:
  - `walletLooks.test.ts`: the plan's two, plus the hash itself (FNV-1a's own test vectors, and a Thai id that tells UTF-16 from UTF-8), the order, and the boards' kinds and faces.
  - `categoryIcons.test.ts`: the plan's three, plus C3's nine glyphs and the built-in drawings moved unchanged (P5). The picker glyph case reads wc-category-edit itself and compares each of the ten board glyphs shape by shape.
  - `WalletCard.render.test.tsx`: the plan's eight, plus "the full card adds the kind line; today's money out shows when it is passed; private mode masks each line in place" (P7, P8).
  - `WalletLooks.render.test.tsx` (a fourth test file, so the card's file keeps the plan's list): the provider (P3: the store names, two quick changes, the first read's turn, the account switch, an unreadable store, outside the provider), Bun's five faces against wc-wallet-edit, the five materials in both modes, the category tile (P10), and the three sections (P12). Two stores in the file make the provider's races happen in a fixed order: `slowFirstReads` (V2: the first read of each name waits; a change's read answers at once) and `heldReads` (V3: every read waits for the next release, so a switch away and back lands this account's read, the other account's, then this account's again). The face case parses only the board's button group, in a `<template>`: parsing the whole page would make happy-dom fetch the board's web fonts, and the tests never reach the network (the case asserts `fetch` is not called).
- **P15. Clear of the work in flight.** P2-T13 (`src/wallet/tray/`, `src/ui/lockCover.tsx`), P4-T12 and P4-T13 (`src/slips/`), 1B-T8 (`apps/edge`) and ci-parallel-jobs (`.github/workflows`, `scripts/ci`) share no file with this task. The four shared files take additive edits in named places: `categoryIcons.tsx` (the table moves out; nothing else changes), the harness (one provider, innermost) and its test (three cases before the last), and `kitSections.tsx` (three sections after P2-T10's two; P2-T12 adds `bw-stack` after these).
- **P16. The gate (R100).** `typecheck:app`; the focused files RED to GREEN; `test:unit` and `test:app`; the neighbours (`PrivateMode`, `WalletAmount`, and the Bun diary icon's users `CategoryGrid`, `CategoryChips`, `RecordRow`, `kitUnification`); `CatalogueScreen.render.test.tsx` whole, once, as the plan's Step 4 names it; `screenReader.render.test.tsx` for the three new sections; `git diff --check`. No route, config or app entry changes, so no `export:web` (CI runs it: the release bundle gains `ui/categoryDrawings.ts`; the wallet's looks and card are drawn only by tests and the development catalogue). No package changes, so no `test:ops`; nothing outside `apps/app`, so no API, edge or database suite.

---

## Step 1: Sync, install and check the base

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date." (or a fast-forward over controller-state commits only). Then `/usr/bin/git -C WT rev-parse --short HEAD` and record it.
2. `/usr/bin/git -C WT diff --stat 30fb26b HEAD -- apps/app package-lock.json`. When this brief was finished, the head had moved past `30fb26b` by #375 (P4-T13, `a915f95`: seven files under `apps/app/src/slips/`, Node modules and their tests) and #374 (1B-T8, `1c14dd1`: `apps/edge` only), so expect exactly those seven `apps/app/src/slips/` paths, or more only from later merges. If it lists any path in the Scope table, report BLOCKED. Otherwise run `/usr/bin/git -C WT log --oneline 30fb26b..HEAD` and keep the merged PRs it lists for the receipt; the focused per-file counts below may then differ only by cases those merges add to the files Step 1.5 runs (#374 and #375 add none).
3. Only if `WT/node_modules` is missing: `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?`. Expected: 0 and "added 1416 packages".
4. Check the base: `shasum -a 256` of `WT/apps/app/src/ui/categoryIcons.tsx`, `WT/apps/app/src/wallet/testing/walletHarness.tsx`, `WT/apps/app/src/wallet/testing/walletHarness.render.test.tsx` and `WT/apps/app/src/dev/catalogue/wallet/kitSections.tsx` equal their `orig/` lines in `PL/SHA256SUMS`. And `ls WT/apps/app/src/ui/categoryDrawings.ts WT/apps/app/src/wallet/looks WT/apps/app/src/wallet/card` must fail (none exists yet). If a checksum differs, report BLOCKED.
5. The focused base (the harness and the neighbours):
   ```bash
   cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/testing/walletHarness.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/money/WalletAmount.render.test.tsx src/ui/CategoryGrid.render.test.tsx src/ui/CategoryChips.render.test.tsx src/ui/RecordRow.render.test.tsx src/ui/kitUnification.render.test.tsx > S/base-focused.log 2>&1; echo $?
   ```
   Expected: 0, `Test Files  7 passed (7)`, `Tests  44 passed (44)` (6, 9, 5, 4, 7, 8 and 5). Compare with `PL/logs/base-focused.log`.

## Step 2: The tests, the data, the move and the typed stubs (plan Step 1)

1. Copy:
   ```bash
   mkdir -p WT/apps/app/src/wallet/looks WT/apps/app/src/wallet/card
   cp PL/real/apps/app/src/wallet/looks/walletLooks.test.ts WT/apps/app/src/wallet/looks/walletLooks.test.ts
   cp PL/real/apps/app/src/wallet/looks/categoryIcons.test.ts WT/apps/app/src/wallet/looks/categoryIcons.test.ts
   cp PL/real/apps/app/src/wallet/looks/WalletLooks.render.test.tsx WT/apps/app/src/wallet/looks/WalletLooks.render.test.tsx
   cp PL/real/apps/app/src/wallet/card/WalletCard.render.test.tsx WT/apps/app/src/wallet/card/WalletCard.render.test.tsx
   cp PL/real/apps/app/src/wallet/testing/walletHarness.render.test.tsx WT/apps/app/src/wallet/testing/walletHarness.render.test.tsx
   cp PL/real/apps/app/src/wallet/card/copy.ts WT/apps/app/src/wallet/card/copy.ts
   cp PL/real/apps/app/src/ui/categoryDrawings.ts WT/apps/app/src/ui/categoryDrawings.ts
   cp PL/real/apps/app/src/ui/categoryIcons.tsx WT/apps/app/src/ui/categoryIcons.tsx
   cp PL/stubs/apps/app/src/wallet/looks/walletLooks.ts WT/apps/app/src/wallet/looks/walletLooks.ts
   cp PL/stubs/apps/app/src/wallet/looks/categoryGlyphs.ts WT/apps/app/src/wallet/looks/categoryGlyphs.ts
   cp PL/stubs/apps/app/src/wallet/looks/categoryIcons.ts WT/apps/app/src/wallet/looks/categoryIcons.ts
   cp PL/stubs/apps/app/src/wallet/looks/WalletLooksProvider.tsx WT/apps/app/src/wallet/looks/WalletLooksProvider.tsx
   cp PL/stubs/apps/app/src/wallet/looks/BunFace.tsx WT/apps/app/src/wallet/looks/BunFace.tsx
   cp PL/stubs/apps/app/src/wallet/looks/MaterialFill.tsx WT/apps/app/src/wallet/looks/MaterialFill.tsx
   cp PL/stubs/apps/app/src/wallet/looks/WalletCategoryIcon.tsx WT/apps/app/src/wallet/looks/WalletCategoryIcon.tsx
   cp PL/stubs/apps/app/src/wallet/card/WalletCard.tsx WT/apps/app/src/wallet/card/WalletCard.tsx
   ```
   The copy table and the drawings' move go in final at this step: the table is data, and the move changes no behaviour (the neighbours prove it in Step 4). `walletHarness.tsx` and `kitSections.tsx` stay as they are until Step 4.
2. `shasum -a 256` the 16 files and compare: the `real/` lines for the five tests, `copy.ts`, `categoryDrawings.ts` and `categoryIcons.tsx`; the `stubs/` lines for the eight code files. If a `cp` source is missing or a checksum differs, report BLOCKED.
3. The stubs, for reference (each is the plan's interface with no behaviour; `stubs/` holds them):

`stubs/apps/app/src/wallet/looks/walletLooks.ts`:

{{stub:apps/app/src/wallet/looks/walletLooks.ts}}

`stubs/apps/app/src/wallet/looks/categoryGlyphs.ts`:

{{stub:apps/app/src/wallet/looks/categoryGlyphs.ts}}

`stubs/apps/app/src/wallet/looks/categoryIcons.ts`:

{{stub:apps/app/src/wallet/looks/categoryIcons.ts}}

`stubs/apps/app/src/wallet/looks/WalletLooksProvider.tsx`:

{{stub:apps/app/src/wallet/looks/WalletLooksProvider.tsx}}

`stubs/apps/app/src/wallet/looks/BunFace.tsx`, `MaterialFill.tsx` and `WalletCategoryIcon.tsx`:

{{stub:apps/app/src/wallet/looks/BunFace.tsx}}

{{stub:apps/app/src/wallet/looks/MaterialFill.tsx}}

{{stub:apps/app/src/wallet/looks/WalletCategoryIcon.tsx}}

`stubs/apps/app/src/wallet/card/WalletCard.tsx`:

{{stub:apps/app/src/wallet/card/WalletCard.tsx}}

## Step 3: RED (plan Step 2)

1. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: 0.
2. `cd WT && npm run test:unit -w gogospend-app -- src/wallet/looks/walletLooks.test.ts src/wallet/looks/categoryIcons.test.ts > S/red-unit.log 2>&1; echo $?`. Expected: 1, `ℹ tests 10`, `ℹ pass 0`, `ℹ fail 10`, and `grep -c 'AssertionError' S/red-unit.log` gives 10. The ten, each an `AssertionError`:
   - L1 `a derived look is stable and always valid`: actual `false`, expected `true` (the stub's face is no face in its empty `BUN_FACES`)
   - L2 `a derived look is the plan's: FNV-1a over the id's UTF-16 code units, ...`: actual `{ kind: null, material: 'silk', face: 'smile' }`, expected `{ kind: null, material: 'paper', face: 'wow' }`
   - L3 `damaged kept looks are dropped, not thrown`: actual `{}`, expected `{ b: { kind: null, material: 'paper', face: 'wow' } }`
   - L4 `the kept order is wallet ids in order, each once; anything else reads as no order`: actual `[]`, expected `[ 'w2', 'w1', 'w3' ]`
   - L5 `the kinds are §5.2's four and the faces wc-wallet-edit's five, in the boards' order`: actual `[]`, expected `[ 'cash', 'bank', 'credit_card', 'transit' ]`
   - G1 `a kept icon wins, then the pack glyph, then the built-in drawing, else the initial`: actual `null`, expected `'lotus'`
   - G2 `damaged kept icons are dropped`: actual `{}`, expected `{ c1: 'lotus', c4: 'food' }`
   - G3 `C3's nine each have the picker's glyph for them`: actual `{ family_out: 'food', merit: 'food', ... }`, expected `{ family_out: 'heart', merit: 'lotus', ... }`
   - G4 `every picker glyph has shapes copied from the board`: actual `[]`, expected the twelve keys
   - G5 `every built-in key and a transfer draw today's drawings, moved unchanged`: actual `[]`, expected food's three paths

   L1 to L5 are `walletLooks.test.ts` and G1 to G5 `categoryIcons.test.ts`, in file order; Step 5 names the cases by these ids.
3. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/card/WalletCard.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected: 1, `Test Files  3 failed (3)`, `Tests  19 failed | 8 passed (27)`, no "Unhandled" section, `grep -c '^AssertionError' S/red-render.log` gives 19 and `grep -cE 'Cannot find module|Failed to resolve' S/red-render.log` gives 0. The nineteen, each failing first on:
   - W1 `a credit card shows what was spent, others show what is left`: `th light: expected [ [ 'บัตรเครดิต' ], …(4) ] to deeply equal [ …(5) ]`
   - W2 `each card says itself as ax-voiceover and rh-offline write it`: `th: expected [ null, null, null ] to deeply equal [ 'บัตรเครดิต, ใช้ไป 3,920 บาท', …(2) ]`
   - W3 `the pending line shows on stack cards too`: `stack th: expected [ 'บัญชีหลัก' ] to include 'รวม ฿50 ที่กำลังบันทึก'`
   - W4 `the full card adds the kind line; today's money out shows when it is passed; private mode masks each line in place`: `cash: expected [ false, false, false ] to deeply equal [ true, false, false ]`
   - W5 `titanium carries white text, silk ink; dark titanium has a 1 pt edge of #5C5968`: `light: expected [ '' ] to deeply equal [ 'rgba(255, 255, 255, 1.00)', …(2) ]`
   - W6 `at AX5 a ฿999,999,999.99 balance and an 80-code-point Thai name wrap and never truncate`: `spine: expected [ Array(1) ] to deeply equal ArrayContaining{…}`
   - W7 `a card is at least 44 pt tall in every variant`: `stack button: expected null not to be null`
   - W8 `looks come from the open diary's account, and a look kept for another wallet is ignored`: `light: expected [ undefined, …(2) ] to deeply equal [ 'wallet-material-peach-light', …(2) ]`
   - W9 `with no diary open the derived look shows and setLook stores nothing`: `expected [ undefined, [ 'บัญชีบนเว็บ' ] ] to deeply equal [ …(2) ]`
   - V1 `a kept look, the wallet order and a category's icon go to this account's store, and two quick changes keep each other`: `expected { w1: …, …(4) } to deeply equal { w1: …, …(4) }`
   - V2 `a change waits for the account's first read, so the read never hides it`: `expected { …(1) } to deeply equal { …(2) }`
   - V3 `when the account changes, nothing of the last one shows, its late read is dropped, and a change stays with the account it was made in`: `expected { kind: null, material: 'silk', …(1) } to deeply equal { kind: 'credit_card', …(2) }`
   - V4 `a name the store cannot read is never written over, and what fails to store still shows until the app closes`: `expected { w1: …, …(4) } to match object { …(3) }`
   - V5 `outside the provider looks are derived, no order or icon is kept, and the setters keep nothing`: `expected { w1: …, …(4) } to deeply equal { w1: …, …(4) }`
   - V6 `Bun's five faces are wc-wallet-edit's: cream with an ink outline in both modes, and hidden from screen readers`: `expected [] to deeply equal [ 'smile', 'wink', 'calm', …(2) ]`
   - V7 `each material is materialPaint's gradient from corner to corner, its own in each mode, and only dark titanium has an edge`: `light silk: expected undefined to be 'wallet-material-silk-light'`
   - V8 `a category's tile is its glyph in ink on its hue tinted, or on raised, else its initial; 36 pt with an 11 pt corner, in proportion at 52`: `light: expected [] to deeply equal [ [ '36px', '11px', …(1) ], …(7) ]`
   - V9 `the kit's catalogue sections draw the materials, the cards and the category icons, and the card section's private card never touches the phone's setting`: `expected [] to deeply equal [ [ 'bw-materials', …(2) ], …(2) ]`
   - H8 `the harness mounts the wallet's looks innermost, kept for the diary's account`: `expected { look: { kind: null, …(2) }, …(2) } to deeply equal { look: { …(3) }, …(2) }`

   W1 to W9 are `WalletCard.render.test.tsx`, V1 to V9 `WalletLooks.render.test.tsx` and H1 to H9 `walletHarness.render.test.tsx`, in file order. The 8 that pass are H1 to H5 and H9 (the harness's own cases) and H6 and H7 (P2-T8's review's two, which pin the harness as it is: P11).

   Compare with `PL/logs/red-unit.log` and `PL/logs/red-render.log`.

## Step 4: GREEN (plan Steps 3 and 4)

1. Copy the code:
   ```bash
   cp PL/real/apps/app/src/wallet/looks/walletLooks.ts WT/apps/app/src/wallet/looks/walletLooks.ts
   cp PL/real/apps/app/src/wallet/looks/categoryGlyphs.ts WT/apps/app/src/wallet/looks/categoryGlyphs.ts
   cp PL/real/apps/app/src/wallet/looks/categoryIcons.ts WT/apps/app/src/wallet/looks/categoryIcons.ts
   cp PL/real/apps/app/src/wallet/looks/WalletLooksProvider.tsx WT/apps/app/src/wallet/looks/WalletLooksProvider.tsx
   cp PL/real/apps/app/src/wallet/looks/BunFace.tsx WT/apps/app/src/wallet/looks/BunFace.tsx
   cp PL/real/apps/app/src/wallet/looks/MaterialFill.tsx WT/apps/app/src/wallet/looks/MaterialFill.tsx
   cp PL/real/apps/app/src/wallet/looks/WalletCategoryIcon.tsx WT/apps/app/src/wallet/looks/WalletCategoryIcon.tsx
   cp PL/real/apps/app/src/wallet/card/WalletCard.tsx WT/apps/app/src/wallet/card/WalletCard.tsx
   cp PL/real/apps/app/src/wallet/testing/walletHarness.tsx WT/apps/app/src/wallet/testing/walletHarness.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/kitSections.tsx WT/apps/app/src/dev/catalogue/wallet/kitSections.tsx
   ```
2. `shasum -a 256` the 18 files against their `real/` lines in `PL/SHA256SUMS`: all equal. `/usr/bin/git -C WT status --short` shows exactly ` M apps/app/src/dev/catalogue/wallet/kitSections.tsx`, ` M apps/app/src/ui/categoryIcons.tsx`, ` M apps/app/src/wallet/testing/walletHarness.render.test.tsx`, ` M apps/app/src/wallet/testing/walletHarness.tsx`, `?? apps/app/src/ui/categoryDrawings.ts`, `?? apps/app/src/wallet/card/` and `?? apps/app/src/wallet/looks/`.
3. The code is in the appendix (from `PL/real/`, byte for byte), with the four shared files' diffs. Read the tests before the receipt: the receipt names every case.
4. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: 0.
5. `cd WT && npm run test:unit -w gogospend-app -- src/wallet/looks/walletLooks.test.ts src/wallet/looks/categoryIcons.test.ts src/wallet/copy/draftText.test.ts > S/green-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 14`, `ℹ pass 14`, `ℹ fail 0` (5, 5 and 4: `draftText.test.ts` now reads `card/copy.ts` too, and its four cases still pass; `card.kindTransit` is already in its `LATIN_LINES`). Node's `MODULE_TYPELESS_PACKAGE_JSON` warning per file is in the base logs too.
6. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/card/WalletCard.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx > S/green-render.log 2>&1; echo $?`. Expected: 0, `Test Files  3 passed (3)`, `Tests  27 passed (27)`, each case marked `✓`. The stderr holds only notices the base logs hold too: Vite's config-loader notice, two sourcemap notices for `expo-status-bar` and Node's `ExperimentalWarning: localStorage is not available ...`. No `act(...)` warning, no `console.error`, and no network error.
7. The neighbours: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/money/WalletAmount.render.test.tsx src/ui/CategoryGrid.render.test.tsx src/ui/CategoryChips.render.test.tsx src/ui/RecordRow.render.test.tsx src/ui/kitUnification.render.test.tsx > S/green-neighbours.log 2>&1; echo $?`. Expected: 0, `Test Files  6 passed (6)`, `Tests  38 passed (38)` (unchanged: the drawings' move and the three new sections change none of them).
8. The catalogue (plan Step 4), in the background if you like, then wait for it: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx > S/green-catalogue.log 2>&1; echo $?`. Expected: 0, `Test Files  1 passed (1)`, `Tests  301 passed (301)` (your Step 1 head's 298 plus the three new sections; five and a half minutes for the planner, at load 15 and at load 33 alike). Then the screen reader's pass over the three new sections: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/screenReader.render.test.tsx -t "bw-materials|bw-card|bw-category-icons" > S/green-screen-reader.log 2>&1; echo $?`. Expected: 0, `Tests  3 passed | 278 skipped (281)` (its 278 at your Step 1 head plus one case for each new section).

## Step 5: Mutation check (plan Step 5)

1. `python3 -I PL/tools/mutants.py WT S/mutant-logs > S/mutants.out 2>&1; echo $?`. It applies each mutant alone, runs its tests (the two Node files for the pure modules and the move; for the rest, the render files that hold that component's rules, one file after another), and restores the file with its SHA-256 checked; about five minutes for the planner, while the machine's load rose from 15 to 86. Expected: exit 0, and these 120 lines: one per mutant, each ending "restored sha256 equal", then the tally. The case named is the first that failed in the run, by its full name; Step 3 gives each name its id:
   ```
{{mutants}}
   ```
   Compare with `PL/logs/mutants.out`. The plan's three mutants are CA1 (a credit card's balance in place of its spending), CA2 (`numberOfLines={1}` on the name) and CA3 (the pending line hidden on stack cards). HA2, HA3 and HA4 are P2-T8's review's E2, E3 and X2 (P11). Every kill is an assertion in the case named, with these exceptions, each a failing test all the same: LK12 fails three cases on the `SyntaxError` that `JSON.parse` throws for `'nope'`, which it no longer catches. PR13 and PR14 fail V4 on the store's own `Error: the keychain is locked`, with which the setter's promise now rejects. CA17 throws `TypeError: Expected a canonical integer string of satang.` while drawing a card with no pending total, so eight cases fail. CA23 fails eight cases on `Unable to find an accessible element with the role "button"`. HA2 fails H6 on `Error: Changing the bun intensity needs <BunIntensityProvider>.`, the review's E2 exactly.
2. `shasum -a 256` the 18 files against `real/` again, and `/usr/bin/git -C WT status --short`. Expected: unchanged from Step 4.2.

## Step 6: Gate (R100's fast local gate)

From WT, in this order, each with its log in S:

1. `npm run typecheck:app`: exit 0.
2. `npm run test:unit`: exit 0 and `ℹ fail 0`. (R100: no total is checked; record what it prints.)
3. `npm run test:app`: exit 0 and `ℹ fail 0`.
4. The focused render files once more: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/card/WalletCard.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/money/WalletAmount.render.test.tsx src/ui/CategoryGrid.render.test.tsx src/ui/CategoryChips.render.test.tsx src/ui/RecordRow.render.test.tsx src/ui/kitUnification.render.test.tsx`: `Test Files  9 passed (9)`, `Tests  65 passed (65)` (27 and 38).
5. The catalogue's two passes over the three new sections: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-materials|bw-card|bw-category-icons"`: `Test Files  2 passed (2)`, `Tests  6 passed | 576 skipped (582)` (one case per new section in each file).
6. `/usr/bin/git -C WT diff --check` (before the commit) and, after it, `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD`: no output.

Not run here, and why (put this in the receipt): the full render suite, `export:web`, the iOS export, `test:ops` and the database suites run in CI on the PR (R100; no route, config, app entry, package or lockfile change); the API and edge suites (nothing outside `apps/app` changes); device and simulator checks, VoiceOver on a phone and the E2-A screenshots of `bw-materials`, `bw-card` and `bw-category-icons` (the controller's, after P2-T13): SKIPPED.

## Step 7: Receipt

Write `docs/implementation/receipts/P2-T11.md` in the house style (see `docs/implementation/receipts/P2-T10.md`), with your own numbers where they differ from these. Start from:

```markdown
# P2-T11: Looks kept on the phone: wallet looks, Bun faces, materials, category icons and the wallet card

- **Status:** built and verified locally on `p2/t11-wallet-looks` (`.claude/worktrees/p2-t11`), from `<head>`. Not pushed. The independent review is the controller's, after this receipt. Under ruling R87 this receipt is its own file; `premium-progress.md` is not edited.
- **Base:** `<head>`. (The brief was proven at `30fb26b`. If your head is later, name each merged PR from `git log --oneline 30fb26b..HEAD`.)
- **Files:** created `apps/app/src/ui/categoryDrawings.ts`, `apps/app/src/wallet/looks/walletLooks.ts`, `walletLooks.test.ts` (5 cases), `categoryGlyphs.ts`, `categoryIcons.ts`, `categoryIcons.test.ts` (5 cases), `WalletLooksProvider.tsx`, `BunFace.tsx`, `MaterialFill.tsx`, `WalletCategoryIcon.tsx`, `WalletLooks.render.test.tsx` (9 cases), `apps/app/src/wallet/card/copy.ts`, `WalletCard.tsx`, `WalletCard.render.test.tsx` (9 cases) and this receipt; modified `apps/app/src/ui/categoryIcons.tsx` (the drawings moved out, unchanged), `apps/app/src/wallet/testing/walletHarness.tsx` (the looks provider innermost), `walletHarness.render.test.tsx` (three cases: P2-T8's review's two and the looks) and `apps/app/src/dev/catalogue/wallet/kitSections.tsx` (three sections).
- **What changed:** (the derived look and the kept looks, order and icons per account; the provider's queue and its account and store rules; the five faces and materials from the boards; the glyphs, one drawing per key; the tile; the card's three variants, its words, the credit card's spending, the pending and today lines, private mode; the harness; the three sections.)
- **RED to GREEN:** ... (Step 3 and Step 4 numbers; the 10 and 19 failing cases and their messages; the 8 that pass at RED and why; the neighbours and the catalogue.)
- **Mutation check:** 119 mutants, all killed ... (one line per group, with the case that kills it; the plan's three are CA1, CA2 and CA3; HA2 to HA4 are P2-T8's E2, E3 and X2).
- **Gate** (worktree root, R100's fast local gate): ... (every command in Step 6 with its result; no whole-suite totals).
- **Deviations:** the rulings in force: P2 (where the hooks live), P3 (the provider's rules), P4 (one drawing per glyph key), P5 (`DrawingShape`'s two optional fields), P6 (a credit card from zero down), P7 (private mode keeps each line), P8 (the card's words, `todayLine`), P9 (the board calls), P10 (the tile), P11 (the harness and P2-T8's m-1 and m-2), P12 (the sections), P13 (names), P14 (the cases beyond the plan's, and the fourth test file).
- **SKIPPED and CI:** the full render suite, `export:web`, the iOS export, `test:ops` and the database suites run in CI (R100); the API and edge suites (no change there); device and simulator checks, VoiceOver on a phone and E2-A's screenshots (Step 6).
- **Notes for later tasks:**
  - P2-T12: pass `todayOutMinor` for the front card only; `CARD_HEIGHT` is 200 and `stack` and `full` grow rather than clip (use `spine` at the largest text sizes); until the account's looks are read a wallet shows its derived look (no `ready` flag); the card is one button when given `onPress`.
  - P2-T20, P2-T21 and P2-T23: read order and looks with `useWalletLooks()`, inside `WalletLooksProvider` (`WalletShell` mounts it in P2-T18; `mountWallet` mounts it innermost). A kept order is ids only: wallets not in it come after, and ids of deleted wallets are the reader's to skip.
  - P2-T29: the picker's twelve are `CATEGORY_PICKER_GLYPHS`; draw one with `CategoryGlyph`; keep a choice with `useCategoryIcons().setIcon`.
  - P2-T22 and P2-T24: a `WalletCard` without `onPress` is one element that says its words, not a button.
  - E2-A: the board calls in P4, P7 and P9 (food and gift glyphs, bw-private's dropped lines, the full card's amount position and sizes, the front card's size, the titanium face outline, the clock glyph).
  - Phase 5 handoff (plan line 145): the account store's `looks`, `wallet-order` and `category-icons` are what the app uploads once.
```

## Step 8: Commit

1. `/usr/bin/git -C WT add apps/app/src/ui/categoryDrawings.ts apps/app/src/ui/categoryIcons.tsx apps/app/src/wallet/looks apps/app/src/wallet/card apps/app/src/wallet/testing/walletHarness.tsx apps/app/src/wallet/testing/walletHarness.render.test.tsx apps/app/src/dev/catalogue/wallet/kitSections.tsx docs/implementation/receipts/P2-T11.md`
2. `/usr/bin/git -C WT status --short`: those 19 files staged (`A` for the 15 new ones, `M` for the four shared), nothing else (no `dist/`, no log).
3. Write the message to `S/commit-message.txt`:
   ```
   Add looks kept per account: wallet looks, Bun faces, the five materials, category icons and the wallet card

   Keep each wallet's kind, material and Bun face, the wallet order and
   each category's icon on the phone for the open diary's account, one
   change after another and never over what could not be read, with a
   look derived from the wallet's id when none is kept. Draw Bun's five
   faces and the five materials from the boards, the category glyphs and
   tile, and the wallet card in its stack, full and spine variants, with
   what a credit card spent, the pending total, today's money out and
   private mode. Move today's category drawings to their own file,
   unchanged; mount the looks in the wallet test harness; add the kit's
   catalogue sections.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-message.txt`, then `/usr/bin/git -C WT log --oneline -1` and `/usr/bin/git -C WT show --stat HEAD`: 19 files.

## Your final message

As the protocol says: `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker) on the first line; the commit SHA and branch; files changed; RED and GREEN counts (and the 8 that pass at RED, P11); mutants (all killed); each gate command with its result, no whole-suite totals; SKIPPED and CI items; deviations (P2 to P14); and what the reviewer should look at first: the provider's queue and its account and store rules (P3, cases V1 to V4), one drawing per glyph key and the two shape fields (P4, P5), the card's words and private mode (P6 to P8), and the harness fold-in (P11).

---

## Appendix: the code

Every block is the kit's file, byte for byte (`tools/brief.py` builds this brief from `tools/brief.template.md`). Copy from `PL/real/`, not from here.

### The four shared files

`apps/app/src/ui/categoryIcons.tsx` (97 lines before, 84 after):

{{diff:apps_app_src_ui_categoryIcons.tsx.diff}}

`apps/app/src/wallet/testing/walletHarness.tsx` (154 lines before, 161 after):

{{diff:apps_app_src_wallet_testing_walletHarness.tsx.diff}}

`apps/app/src/wallet/testing/walletHarness.render.test.tsx` (159 lines before, 225 after):

{{diff:apps_app_src_wallet_testing_walletHarness.render.test.tsx.diff}}

`apps/app/src/dev/catalogue/wallet/kitSections.tsx` (107 lines before, 223 after):

{{diff:apps_app_src_dev_catalogue_wallet_kitSections.tsx.diff}}

### The drawings' move

`apps/app/src/ui/categoryDrawings.ts`:

{{file:apps/app/src/ui/categoryDrawings.ts}}

### Wallet looks

`apps/app/src/wallet/looks/walletLooks.ts`:

{{file:apps/app/src/wallet/looks/walletLooks.ts}}

`apps/app/src/wallet/looks/walletLooks.test.ts`:

{{file:apps/app/src/wallet/looks/walletLooks.test.ts}}

### Category glyphs and icons

`apps/app/src/wallet/looks/categoryGlyphs.ts`:

{{file:apps/app/src/wallet/looks/categoryGlyphs.ts}}

`apps/app/src/wallet/looks/categoryIcons.ts`:

{{file:apps/app/src/wallet/looks/categoryIcons.ts}}

`apps/app/src/wallet/looks/categoryIcons.test.ts`:

{{file:apps/app/src/wallet/looks/categoryIcons.test.ts}}

### The looks provider

`apps/app/src/wallet/looks/WalletLooksProvider.tsx`:

{{file:apps/app/src/wallet/looks/WalletLooksProvider.tsx}}

### Bun's face, the material and the category tile

`apps/app/src/wallet/looks/BunFace.tsx`:

{{file:apps/app/src/wallet/looks/BunFace.tsx}}

`apps/app/src/wallet/looks/MaterialFill.tsx`:

{{file:apps/app/src/wallet/looks/MaterialFill.tsx}}

`apps/app/src/wallet/looks/WalletCategoryIcon.tsx`:

{{file:apps/app/src/wallet/looks/WalletCategoryIcon.tsx}}

`apps/app/src/wallet/looks/WalletLooks.render.test.tsx`:

{{file:apps/app/src/wallet/looks/WalletLooks.render.test.tsx}}

### The wallet card

`apps/app/src/wallet/card/copy.ts`:

{{file:apps/app/src/wallet/card/copy.ts}}

`apps/app/src/wallet/card/WalletCard.tsx`:

{{file:apps/app/src/wallet/card/WalletCard.tsx}}

`apps/app/src/wallet/card/WalletCard.render.test.tsx`:

{{file:apps/app/src/wallet/card/WalletCard.render.test.tsx}}

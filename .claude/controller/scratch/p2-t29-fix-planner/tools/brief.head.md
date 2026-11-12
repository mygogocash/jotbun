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

«RULINGS»

«STEPS»

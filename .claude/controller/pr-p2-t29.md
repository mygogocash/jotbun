## Summary
- **P2-T29: Bun Wallet categories** (boards `wc-categories`, `wc-category-edit` and the C3 Thai pack):
  - **`WalletCategoriesScreen`:** back and new buttons, an expense and income switch, the Thai everyday pack card, and 104 pt category tiles showing spending against the limit or ไม่จำกัด. There is a dashed new-category tile, and private mode masks every amount.
  - **`CategoryTray`** (edit and create): a name, the type switch for a new category, 12 glyphs at 48 pt, 7 swatches at 44 pt from the wallet kit, and a monthly limit behind a 56 × 44 switch. An over-budget limit is refused with the reason.
  - **`ThaiPackTray`:** picks from the Thai everyday pack and creates every missing item that was picked.
- **Rules shared with today's screen** move into `categoryCommands.ts`, which `CategoriesScreen` now reads, so both screens run one rule set.
- **The brief review's fixes** (`reviews/P2-T29-brief.md`, each held by a mutant):
  - names wrap at the largest text sizes, with no one-line clamp (M10);
  - the type segments are at least 44 pt on the screen and in the tray (M11, M12);
  - the limit switch has a full 56 × 44 tap area (M13);
  - no raw hex: shadows lift only in light mode, from kit tokens;
  - every fallback message goes through the Thai-first catalogs;
  - `ThaiPackTray` tells the person when a save is refused, conflicts or goes unconfirmed, with a way to try again (M14).
- **Motion** is the wallet `Tray`'s alone, so it follows the one reduced-motion answer (W6, R66, P9).
- **Glyph rules** RV1 to RV4s (P10): unfilled circles take `fill="none"` and an ink stroke, round line caps, Thai leading on a tile's initial, and decorative wrappers.
- **Catalogue:** four `bw-categor*` sections on fakes (P11). `index.ts` gains one spread in plan order.
  - With #416 merged first, it takes the planner's own proven merge `logs/merge/index.t20-t29.ts` (sha256 `911e4ce0…`): KIT, STACK, TRAY, ADD, LIST, CATEGORY, LOCK.
- **The controller accepted the planner's calls P1 to P11.**
  - Planned and built on Gemini 3.8 Flash. A Flash brief review sent the plan back once.
  - The controller checked the commit: 9 of 10 `real/` files are byte-identical, and `index.ts` equals the proven merge.
  - The receipt is its own file under R87: `docs/implementation/receipts/P2-T29.md`.
  - No package, lockfile, edge or database change.

## Test plan
- [x] RED: 14 of 18 render cases failing, every one an `AssertionError` on typed stubs, with 0 module errors. The 4 that pass are the pure glyph cases.
- [x] GREEN:
  - `WalletCategories.render` 18;
  - `CategoriesScreen.render` 56, unchanged;
  - `draftText` 4;
  - the four routes tests 12.
- [x] 14 of 14 mutants killed:
  - the pack tray's every-missing-item rule;
  - the icon kept before a category is accepted;
  - the over-budget refusal;
  - private-mode masking;
  - RV1 to RV4s;
  - the sections;
  - the wrap;
  - the two 44 pt segments;
  - the 56 × 44 switch;
  - the pack tray's error.
- [x] R100's fast gate: `typecheck:app`, the focused files, the routes tests, `export:web` (the route changed) and `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs, including the full render suite and the iOS export.
- [ ] Independent review (Opus), and a second review: limits, spending and private mode.
- [ ] SKIPPED: device checks (AX5 by hand and VoiceOver on the tray, for E2-B).

Closes #175 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

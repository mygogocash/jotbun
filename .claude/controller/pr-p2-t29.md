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
- [x] Independent review (Opus): **Needs fixes** on `cee7eff5`, with 4 blockers (`.claude/controller/reviews/P2-T29.md`):
  - B1: a Web Crypto global, caught by the Hermes guard in `test:unit`;
  - B2: five kit render files could not load the catalogue's eager import of `expo-crypto`;
  - B3: unnamed text fields;
  - B4: an unconfirmed save made a duplicate category.
  - There were also 12 majors (private mode in the tray, Back doing nothing, dark contrast, today's screen changed, among others) and 13 minors. CI at `cee7eff5` was red, and the run was cancelled.
- [x] **Fix round** (`ed1da2aa`, brief `.claude/controller/briefs/P2-T29-fix.md`; ruling R113 with the planner's P1 to P28). Every blocker, major and minor is fixed:
  - the moved hook leaves today's screen unchanged (56 of 56 as before);
  - an unconfirmed save or pack add keeps the frozen Try again, with the same ids and keys;
  - the trays lock while sending;
  - private mode in the tray;
  - names, not raw keys;
  - dark-mode contrast on a card chip;
  - Back works;
  - Archive and Unarchive;
  - the sections load their screens lazily.
  - The proofs: RED 33 of 38 and 3 of 9, all assertions; GREEN wallet 38, hook 4 plus today's 56, routes 5; **119 of 119 mutants killed**. The gate covered the eight kit files (138), the catalogue (10), the routes (13), `test:unit` and `export:web`. All 12 fix-kit files are byte-identical.
  - Planned on Claude Opus, built on Claude Haiku 5.5.
- [x] The controller merged the integration head (with #412, #411, #420, #428, #421) as `f7f47fa4`. `index.ts` is in plan order: ADD, LIST, RECORD, CATEGORY, INSIGHTS, RECAP, LOCK. On the merged tree: `typecheck:app` 0; 17 focused, kit and routes files 312 of 312; `test:unit` 1044 of 1044.
- [ ] CI on this pull request is green at `f7f47fa4`.
- [ ] Confirming review (Opus) of the fix round.
- [ ] SKIPPED: device checks (AX5 by hand and VoiceOver on the tray, for E2-B).

Closes #175 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

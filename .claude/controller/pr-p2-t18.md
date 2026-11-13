## Summary
- **P2-T18: the wallet shell.** It holds the layout order, the tab bar, the + button and the one add tray host. It is the second half of P2-T18's split; P2-T18a (#464, the guards) merges first and shares no file.
  - **The layout (P5, R58, R82, W34):** the wallet branch is one statement after the sign-in redirect, the legacy build and `ask`, and before the core branch. It mounts the shell inside the device diary and Bun's AI.
    - With `EXPO_PUBLIC_REDESIGN=all` the spend layout is now the wallet shell (P6), so one SpendLayout case now uses `all,-wallet`.
  - **`home/WalletShell.tsx`, `WalletTabBar.tsx`, `AddButton.tsx`, `shellRoutes.ts` (new):** two tabs, a link to Settings, and the floating + 16 pt above the bar. `useWalletTabInset()` is what a screen keeps clear of the + (P10).
    - Magic Tap opens the add tray on every screen inside the shell (P12).
    - The shell draws no amount and quotes nothing (P16); what it mounts follows private mode under `WalletRoot`.
  - **Lifetimes (P8; followups lines 359, 379 and 414):** the shell mounts `CardFramesProvider`, `WalletLooksProvider`, the one `AddTrayHost` and the saved moment's host for the shell's life.
- **The add route and copies, the controller's privacy note (P13):** every `/spend/*` route, the record screen included, renders inside the shell's add tray host. In the wallet area `/spend/add` opens the shell's tray, never today's Quick add, so a copied record's amount and merchant cannot show in the clear outside the wallet look. Two cases and mutant D7 pin it.
- **P2-T16's must-carries (P14; followups line 777):**
  - PROBE-C1 (one callback identity across redraws) and PROBE-C3 (the bound on every platform) are shell cases;
  - a Node check holds that `WalletShell` is the only add tray host;
  - the refused present stays a SKIPPED device check.
- **Copy (P15):** `home/copy.ts` gains the plan's six lines. The English lines are drafts (owner Q3).
- **The controller accepted the planner's calls P1 to P22.**
  - Planned on Claude Opus (also proved on #460's `real/`; `AddTrayHost.tsx` is read only), built on Claude Haiku 5.5.
  - The controller checked the commit: all 12 `real/` files are byte-identical.
  - The receipt is its own file under R87: `docs/implementation/receipts/P2-T18.md`.
  - No package, lockfile, edge or database change.
- **The reviews' pins (the controller's commit `74142ebc`, test-only plus the receipt).** Both reviews approve. Their findings were guards no case held, and two receipt lines:
  - the chip names the save's category in Thai (Opus m2);
  - the + glyph in `onPrimary`, its lift by day only, the blocked + dimmed, and each tab icon following the selection, in both modes (Opus n3, Sonnet m3);
  - only the spend layout mounts a wallet shell (Opus n1);
  - a hostile link to `/spend/add` opens the plain spending tray with nothing from the link (Sonnet m2);
  - the receipt: the shell is mounted once per spend layout, since Settings' links push a second (Opus m1, the controller's carry); the window-filling device check (Sonnet n4); Magic Tap's risk on Fabric iOS (Sonnet m1).
- **Follow-ups (the controller's `shell-carry`, before P2-T24's card stack):**
  - share the looks between spend layouts (Opus m1);
  - Insights (P2-T31's screen) pads `insets.bottom + 24`, so under the shell the + covers 18 pt of its last row with a 34 pt inset and 52 pt with none; it needs `useWalletTabInset()` (Opus n2, Sonnet m4).

## Test plan
- [x] RED: Node 8 of 8 and render 15 of 39 failing, every one an `AssertionError`.
- [x] GREEN: Node 8, render 39.
- [x] 87 mutants: 86 killed and 1 equivalent (S5). Every failing case is an assertion, and the output is identical to the planner's.
- [x] R100's fast gate:
  - `typecheck:app` and `typecheck:routes` (two routes change);
  - `test:app` 37 and `test:unit` 1117;
  - the eight kit files 142;
  - the four routes tests 17;
  - the other neighbours 131;
  - `export:web` (exported);
  - `git diff --check`.
- [x] The reviews' pins (`74142ebc`), under the heavy lock:
  - the two render files 34 of 34, the Node file 6 of 6, and `typecheck:app`;
  - the reviews' mutants V1, V2, V4, V5, V9, M1, M2, M3, M5 and N3 are each killed on an assertion;
  - the planner's A1 to A8, B1 to B20, D1 to D7, S10 to S12 and L1 to L9 are still killed.

  Proof: `.claude/controller/scratch/p2-t18-pins/`.
- [ ] CI on this pull request is green: the nine jobs. Note: GitHub Actions is queued org-wide. It runs again once #464 has merged.
- [x] Independent review (Opus), and a second review (Sonnet): the single host and the copy route (P13, P14), private mode under the shell (P16), the layout order (P5, P6) and Magic Tap. Both approve.
- [x] The Opus reviewer confirms `74142ebc`: approved, after 20 mutants rerun (each killed) and a compat run with #464's files laid over (34 of 34, 6 of 6).
- [ ] SKIPPED: device checks (the refused present on iOS, the + and Magic Tap under VoiceOver, the bar at the largest text size).

Closes #164 once merged, after #464 (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

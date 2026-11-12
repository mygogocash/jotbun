## Summary
- **P2-T21: a new wallet, editing a wallet, and the correction tray.**
  - **`NewWalletFlow`** (route `app/spend/wallet/new.tsx`): the wallet's fields, then its look (face and material), then it is made with its opening balance, exact in satang from the keypad. It ends with `dismissTo(returnTo ?? '/spend')`. The list's add tile now passes `returnTo`, so a wallet added from the list comes back to it.
  - **`WalletEditScreen`** (route `app/spend/wallet/[id]/edit.tsx`): edit the fields and look, and archive at ฿0. After a conflict, the form starts over from the newer version.
  - **`CorrectionTray`:** sets a wallet's balance by a correction record. For a wallet with entries, it asks why in the tray before anything is sent.
  - **`WalletFields`:** the shared form, with `today` and `locked`.
- **Every write** goes through `useWalletCommand`, held by a ref (P2-T19 m1). The look is kept only after `done`. `wallet_added` is sent after the outcome is decided, and a throw from it is caught (P2-T19 m2). Each `setLook` call gets a fresh object.
- **Private mode** hides the preview, the stored opening balance and the archive line.
- **Carried followups:**
  - P2-T20's review pins PA (no effect seeds the order, one write per press), PB (no second looks provider) and PF (Thai names sort by `localeCompare`);
  - the add tile's `returnTo`;
  - a new wallet's card drops from 200 pt;
  - with no account open the face and material pickers are hidden;
  - cards with no press action are one image to screen readers.
- **Catalogue:** five sections in `walletListSections.tsx`; `index.ts` is untouched. `routerTestStub.tsx` gains `dismissTo`. The routes test (`PlanningRoutes`) covers the two new routes.
- **The controller accepted the planner's calls P1 to P21.**
  - Planned on Claude Opus, built on Claude Haiku 5.5.
  - The controller checked the commit: all 18 `real/` files are byte-identical.
  - The controller's pre-flight before the build: the kit over the head passed the eight kit render files that import the wallet catalogue index, the new suites, the routes tests and `test:unit`.
  - The receipt is its own file under R87: `docs/implementation/receipts/P2-T21.md`.
  - No package, lockfile, edge or database change.

## Test plan
- [x] RED: 25 of 70 render cases failing across six files, every one an `AssertionError`, with no module errors. `typecheck:app` passes on the stubs.
- [x] GREEN: the six render files 70 of 70, `draftText` 4, neighbours 179, catalogue `bw-` 62, the Lock kit file 38.
- [x] 109 of 109 mutants killed, the plan's N1 (the look before acknowledgement) and E1 (archive at non-zero) among them. The verdicts match the planner's run.
- [x] R100's fast gate:
  - `typecheck:app` and `typecheck:routes`;
  - `test:app` and `test:unit`;
  - 17 focused files, 249 of 249;
  - `export:web` (the routes are new);
  - `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs, including the full render suite and the iOS export.
- [ ] Independent review (Opus), and a second review: opening balances, corrections and archive.
- [ ] SKIPPED: device checks (the drop animation, VoiceOver on the look pickers and the tray, AX5 by hand).

Closes #167 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

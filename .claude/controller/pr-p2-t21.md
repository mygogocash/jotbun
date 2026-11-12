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
- [x] CI at `2411001e`: 9 of 9, including the full render suite and the iOS export.
- [x] Second review (Sonnet: money, the wallet and privacy): **approved** on `2411001e` (`.claude/controller/reviews/P2-T21-second.md`). Money is exact in BigInt satang past 2^53, writes are held to one per press, and private mode leaks no amount.
- [x] Independent review (Opus): **Needs fixes** on `2411001e`, with one major (`.claude/controller/reviews/P2-T21.md`).
  - **M1:** after an unconfirmed create, step 2's back was held. When the resend was then blocked, nothing on the screen could be pressed, and on iOS nothing else leaves it in the wallet area.
  - The minors: m1, a save that lands after the person left went back a second time (the second review's W3 and W4 too); m2, guards no case held, one on the money path (Y7); m3, the tracking start can no longer be changed in the wallet area. The nits: n1, the new card's drop; n2, a ฿0 in private mode.
- [x] **Fix round** (`de3e6363`, brief `.claude/controller/briefs/P2-T21-fix.md`; ruling R115 with the planner's P22 to P35):
  - step 2's back is held only while a create is out. Once its answer is unknown, or a resend is blocked, back leaves the flow as step 1's does and keeps no look; the list reads again on return;
  - the wallet editor navigates once: a save or an archive that lands after the person left, or after the screen went away, takes no one further, and two quick presses on an unchanged save go back once;
  - the new card drops from a place of its own, one card's height;
  - the refused archive's zero is masked in private mode;
  - the reviews' probes and survivors are pinned (PR1, PR4, PR7, PR8, Y6, Y8, Y9 and W4);
  - m3 stays as text, with the consequence stated, for the owner at E2-B. So does a credit card's opening balance, which both reviews raised.
  - The proofs: RED 5 of 31, all assertions; GREEN 31 of 31; **134 of 134 mutants killed**, the log byte-identical to the planner's. The gate: `typecheck:app`, `typecheck:routes`, `test:app`, `test:unit` 1037, the eight kit files 141, the routes 13, neighbours 112, catalogue `bw-` 62, `export:web` and `git diff --check`. All 6 fix-kit files are byte-identical.
  - Planned on Claude Opus, built on Claude Haiku 5.5.
- [x] The controller merged the integration head (with #428, #421, #427, #423) as `001babaa`. The routes test keeps both sides: P2-T21's new-wallet and edit routes and P2-T29's categories route. On the merged tree:
  - `typecheck:app` and `typecheck:routes` 0;
  - `test:unit` 1047 of 1047;
  - the round and its neighbours 143 of 143;
  - the eight kit files 141 of 141;
  - the four routes tests 15 of 15;
  - catalogue `bw-` 90, and the registry rule;
  - the head's new wallet screens (add steps, categories, insights, recap, recently deleted) 121 of 121;
  - `export:web`, and `git diff --check` on the range.
- [ ] CI on this pull request is green at the merged head.
- [ ] Confirming review (Opus) of the fix round.
- [ ] SKIPPED: device checks (the drop on a simulator and under Reduce Motion, step 2's back with a lost answer on a development build, the system back during an edit's save, VoiceOver on the look pickers, the tray and the refused line, AX5 by hand).

Closes #167 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

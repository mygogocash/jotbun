## Summary
- **P2-T15: the transfer, confirm and pick steps of the Bun Wallet's add tray**, built on P2-T14's add flow.
  - **`TransferStep`:** from and to wallet cards with a swap (a 22 pt seam, so the 44 pt button never covers a long wallet name), and each wallet's balance after the move, exact in BigInt satang. It is pinned past 2^53 (9,007,199,254,740,993 satang).
  - **`ConfirmStep`:** the record's rows before it is written, titled per type (`confirmTitle`), with lookups for its category and wallet names.
  - **`PickSteps`:** category, date, note and wallet picks, each with its way back. The wallet pick takes a `back`, since the transfer cards and the amount chip open it too.
- **Move all is never offered above ฿999,999,999.99** (P5). This settles the P2-T14 review note, and avoids `keypadFromMinor`'s throw above the cap.
- **Private mode** (P8): filled amounts and every number in Bun's sentence are masked.
- **Catalogue:** P2-T14's `addSections.tsx` gains its steps' sections; `index.ts` is untouched. P2-T20's `WalletsList.render.test.tsx` gains one line.
- **Left to P2-T16** (P19): back to the amount, Save, where the type switch goes after the amount step, and switching to transfer opening the transfer step. Both followups for this task are carried.
- **The controller accepted the planner's calls P1 to P19.**
  - Planned on Claude Opus, built on Claude Haiku 5.5 (Gemini was out of quota).
  - The controller checked the commit: all 7 `real/` files are byte-identical.
  - The controller's pre-flight before the build: the kit over the head passed the eight kit render files that import the wallet catalogue index, and `test:unit`.
  - The receipt is its own file under R87: `docs/implementation/receipts/P2-T15.md`.
  - No package, lockfile, route, edge or database change.

## Test plan
- [x] RED: `AddSteps.render` 14 of 14 failing, every one an `AssertionError`, with no module errors. The stubs typecheck.
- [x] GREEN: `AddSteps.render` 14, and the Node files 12.
- [x] 104 of 104 mutants killed, the plan's X1 (the swap) and P22 (the date) among them. The verdicts match the planner's run line for line.
- [x] R100's fast gate:
  - `typecheck:app`, `test:app` and `test:unit`;
  - the eight catalogue-index kit files plus `AddSteps`: 152 of 152;
  - the routes tests: 15 of 15;
  - neighbours 138, and the catalogue's wallet sections;
  - `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs, including the full render suite, `export:web` and the iOS export.
- [ ] Independent review (Opus), and a second review: transfers move money between wallets, and private mode masks it.
- [ ] SKIPPED: device checks (VoiceOver on the cards, rows and pick groups; the swap on a phone; the note field with the Thai keyboard; Android back on a pick).

Closes #161 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

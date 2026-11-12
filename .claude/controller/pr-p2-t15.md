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
- [x] CI at `fd41909c`: 9 of 9.
- [x] Independent review (Opus) and second review (Sonnet): **both Needs fixes** on `fd41909c` (`.claude/controller/reviews/P2-T15.md`, `reviews/P2-T15-second.md`). Both found M1: private mode masked digits only, so Thai number words in Bun's sentence showed the amount. Also m1 (Next ignored an archived side), unpinned survivors and accessibility behaviours, and nits.
- [x] **Fix round** (`a4947e62`, brief `.claude/controller/briefs/P2-T15-fix.md`; ruling R114 with the planner's P1 to P33):
  - in private mode Bun's sentence is not drawn at all; the violet line reads บันอ่านจากที่คุณบอก and quotes none of it;
  - the cards and Next share one rule (`inUse`), so Next waits on an archived or unknown wallet;
  - every survivor and named gap is pinned;
  - the step sections load lazily (`addStepsSection.tsx`).
  - The proofs: RED 4 of 17 render and 1 of 15 Node, all assertions; GREEN 17 and 15; **120 of 120 mutants killed**. All 9 fix-kit files are byte-identical.
  - Planned on Claude Opus, built on Claude Haiku 5.5.
- [x] The controller merged the integration head (with #420, #428, #421) as `334847d3`, with no conflicts. On the merged tree: `typecheck:app` 0; `AddSteps`, the eight kit files and the routes 168 of 168; `test:unit` 1047 of 1047.
- [ ] CI on this pull request is green at `334847d3`.
- [ ] Confirming review (Opus) of the fix round.
- [ ] SKIPPED: device checks (VoiceOver on the cards, rows and pick groups; the swap on a phone; the note field with the Thai keyboard; Android back on a pick).

Closes #161 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

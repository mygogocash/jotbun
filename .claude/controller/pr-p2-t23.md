## Summary
- **P2-T23: Home's data moves into a hook, and the Home models.** Home's load, refresh and threshold haptic move out of `HomeScreen` into `useHomeData` (`screens/redesign/homeData.ts`, W2, the carry rule). `HomeScreen` reads the hook, with no change on screen.
- **The models, pure and Node-tested:**
  - `homeWallets` (bw-home, rh-offline; W7, W28): the stack's wallets in P2-T20's front-first order, balances exact past 2^53, today's money out, and saving drafts;
  - `budgetCardWords` (bw-home, bw-private, ax-voiceover; C4, W9, W10): the budget card's tone, its lines and the words it speaks.
- **P3:** `availableBalances` moves, unchanged, into a pure module (`spend/v1/redesign/availableBalances.ts`), and `entryHelpers.ts` re-exports it.
- **P4:** `homeWallets` holds a private copy of P2-T20's `frontFirst`, byte for byte. P2-T24 swaps it for an import.
- **P6:** the hook gets its own render test, since Home's suite alone let 16 of the hook's 23 mutants through.
- **P8:** the budget card's `headline` is the month's spending estimate (bw-home's 28 pt figure). Private mode keeps the side line's colour, says no number, and speaks as ax-voiceover does.
- **P9:** two spoken lines are added (`home.spokenSpent`, `home.spokenBudget`), as drafts under owner Q3.
- **The controller accepted the planner's calls P1 to P15** (receipt, Deviations).
  - No route, package, lockfile, edge, API or database change. It shares no file with #407 or #406.
  - The receipt is its own file under R87: `docs/implementation/receipts/P2-T23.md`.
  - Planned on Claude Code Opus, built on Gemini 3.8 Flash. The controller checked the commit: all 10 `real/` files are byte-identical to the kit.

## Test plan
- [x] RED, every failure an assertion: Node 14 of 14 (`homeWallets`, `budgetCardWords`); render 6 of 6 (`homeData`); the draft check 4 of 4, by design.
- [x] GREEN:
  - Node: 18 of 18;
  - render: 6 of 6, with nothing on stderr;
  - the neighbours: 152 of 152, unchanged (Home 44, Quick add 81, entrySave 9, SpendLayout 18);
  - the catalogue's Home and Quick add sections: 46.
- [x] 77 of 77 mutants killed: `homeWallets` 20, `availableBalances` 6, `budgetCardWords` 21, copy 4, the hook 25, `HomeScreen` 1.
- [x] R100's fast gate:
  - `typecheck:app`;
  - `test:app` 34 and `test:unit` 988;
  - the focused render files: 158;
  - `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs, including the full render suite, `export:web` and the iOS export.
- [ ] Independent review (Opus), and a second review: Home shows balances, budgets and private mode.
- [ ] SKIPPED: device checks (none for a data move; wallet Home's E2-B captures belong to P2-T24).

Closes #169 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

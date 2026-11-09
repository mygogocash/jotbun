## Summary
- The conflict choice (1D-T9, C16, board `rh-conflict`). In the new `conflict` redesign area, an online record edit refused with `VERSION_CONFLICT` is kept on the phone as a pending choice (1D-T4's diary) and shown on 1D's new `ChoicePanel`: two radio cards ("Yours" first), each differing field marked in words and weight, one main button that follows the chosen card, and "Decide later" while the phone keeps the choice.
- "Use yours" resends the same changes on the server's version. A choice the server already holds clears itself. History marks a record that is waiting for a choice.
- **Off until the owner approves (E2, Q9).** `conflict` is not in `APPROVED`, and the copy is a draft module (`conflictCopy.draft.ts`), not catalog keys. Six catalogue sections show it for the owner's review; the deep links are in the receipt.
- The planner's calls P1 to P13 were accepted by the controller (receipt, Deviations). The main ones: the screens take an optional `conflictArea` prop so the catalogue can draw the area while it is off (P1); `discardChoice` sits beside the plan's `choicePanel` (P5); an unconfirmed "Use yours" freezes to a notice with Try again (P4); `conflict_shown` is sent from the rule only, never from a render or a reopen (P8).
- No package, lockfile, edge, API or database change. The receipt is its own file under R87: `docs/implementation/receipts/1D-T9.md`.

## Test plan
- [x] RED on typed stubs: unit 2 of 23 failing, render 19 of 85 failing, all assertions. GREEN: unit 23 of 23, render 91 of 91 in the four record files.
- [x] 30 of 30 mutants killed (each by an assertion).
- [x] `typecheck:app`, `typecheck:routes`, `test:app` 32, `test:unit` 876, full `test:render` 1651 in 88 files, `export:web`, `git diff --check`.
- [ ] SKIPPED: the owner's E2 screenshots of the six catalogue sections (no browser here).
- [ ] CI on this pull request is green.
- [ ] Independent review.

Closes #140 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

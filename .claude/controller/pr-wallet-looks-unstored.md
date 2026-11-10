## Summary
- **The wallet-looks-unstored follow-up (P2-T11's review m1).** A look, order or icon that was never stored now stays on screen until the app closes, as P2-T11's brief rule P3 promised. Before, it dropped from view at the next stored change to the same name, or when the account's first read landed. No stored data was ever harmed.
- **The fix:** `WalletLooksProvider` keeps, per account, a list in a ref of each change that was not stored (its read or its write failed) and every change made after it. That list is laid over the account's first read and over each change's own read.
  - A later change always wins over an earlier unstored one (P3).
  - The list survives a locked diary and account switches, and lasts while the provider stays mounted (P5).
- **What does not change (P4):** writes hold only what was read and the change itself. Nothing unstored is folded into a write, so a name the store cannot read is still never written over. With an empty list, everything behaves byte for byte as before, and no export changes.
- **The review's D8 is not taken (P6):** it fails only on the order of the store's calls, while nothing is lost and the screen is right, which D8b pins.
- The controller accepted the planner's calls P1 to P13 (receipt, Deviations). No route, package, lockfile, edge, API or database change. The receipt is its own file under R87: `docs/implementation/receipts/wallet-looks-unstored.md`.
- **Unblocks:** P2-T20, P2-T21 and P2-T29 (the setters' first callers) come off hold when this merges.

## Test plan
- [x] RED: 4 of 13 failing (V4, D1, D2, D8b), every one an assertion. GREEN: 13 of 13. The five neighbouring render files pass 38 of 38.
- [x] 37 of 37 mutants killed, with output identical to the planner's run; both files match the planner's verified copies.
- [x] R100's fast gate: `typecheck:app`, the focused file plus its neighbours (51 of 51), `test:app` 34, `test:unit` 970, `git diff --check`.
- [ ] CI on this pull request is green (the nine jobs; render +4 cases).
- [ ] Independent review (Sonnet: size S).
- [ ] SKIPPED: a real-phone storage failure (no device here; the cases fail the store through the test backend).

No task issue: a follow-up from P2-T11's review.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## Summary
- Wallet commands move into one hook (P2-T19). A new `walletCommands.ts` holds the rules the Wallets screen's form and list each kept inline: one idempotency key per changed command, the freeze while a resend is refused before processing, the own-create match, a done key settled, and the refusal message. `WalletsScreen.tsx` now calls the hook.
- No visible change. The planner's calls C1 to C8 were accepted by the controller (receipt, Deviations). The main ones:
  - The in-flight guard stays in each page, because the hook's outcome has no "nothing was sent" case (C1).
  - Try again resends the page's `pending` through the hook (C2).
  - The own-create rule stays `isOwnCreate`, as today (C4).
  - The follow-ups run after the hook answers (C8).
- **One new event (C5, the plan's analytics line).** A create on the Wallets screen now sends `wallet_added`, with no look and with `origin: 'app'`. It is sent once, after the acknowledgement or a matching own create, through 1D-T1's consent gate.
- `WalletsScreen.tsx` is shared: 1D-T5 and 1D-T7 may also edit it. No package, lockfile, edge, API or database change. The receipt is its own file under R87: `docs/implementation/receipts/P2-T19.md`.

## Test plan
- [x] RED on a typed stub: 16 of 21 failing, all assertions. GREEN: 21 of 21. The Wallets suite passes 74 of 74 before and after, with its test file unchanged.
- [x] 49 of 54 mutants killed, including the plan's H1 and H2. The other 5 are equivalent, each explained in the receipt.
- [x] `typecheck:app`, `typecheck:routes`, `test:app` 32, `test:unit` 874, focused render 98, catalogue `wallets-` 31.
- [x] Full `test:render`: 88 files, 1640 tests. The first run hit the known HistoryReturn timeout under load; that file passed 6 of 6 alone, and the second full run passed.
- [x] `export:web`, `git diff --check`.
- [ ] CI on this pull request is green.
- [ ] Independent review.

Closes #165 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

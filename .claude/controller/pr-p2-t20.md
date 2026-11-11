## Summary
- **P2-T20: the wallets list, the archived list and reorder.** This adds the Bun Wallet's `WalletsListScreen` (wc-wallets). The screen has back and จัดเรียง, the summary card, a 68 pt row per wallet in the kept front-first order, the add tile, and the archived wallets, each with นำกลับมาใช้. A `ReorderTray` on P2-T13's `Tray` moves one wallet one place per press.
- **The rules, pure and Node-tested (`wallet/wallets/walletsList.ts`):**
  - `walletsSummary` adds every wallet in use exactly, past 2^53. It counts what credit cards have spent against what is held.
  - `frontFirst` (W7, W28) puts the kept ids first, then the wallets the order does not name, by name and then id. It passes over archived, unknown and repeated ids.
  - `moveWallet` moves one wallet one place and returns a new array each time.
- **Reorder (P4):** each press calls `setOrder` once with the whole order the tray shows. A ref orders presses, so two presses before React draws again move a wallet two places. Each opening starts from the kept order, and there is no Save button.
- **Unarchive (P6)** uses P2-T19's command hook, with presses held by a ref. It handles the done, unconfirmed (Try again resends the same key), blocked, refused and changed-elsewhere outcomes, all through catalog lines.
- **P5:** with no account open, nothing can be kept, so จัดเรียง is not drawn and `?reorder=1` opens nothing.
- **P7 and P8:** the summary's held line shows only once a credit card has spent. Each amount is a `WalletAmount`, so it is masked in private mode. The rows use the board's labels, and at the largest text sizes the amount moves under the name.
- **P9:** the two hrefs to routes not built yet (`/spend/wallet/<id>` for P2-T22, `/spend/wallet/new` for P2-T21) are typed by hand in one place.
- **P10:** the route `spend/wallets` goes through the legacy build's redirect, then the wallet area's list, then R4 Planning's screen. It mounts no looks provider, since P2-T18's `WalletShell` holds it.
- **P11:** three catalogue sections draw the real screen on fakes in the catalogue's own account: `bw-wallets`, `bw-wallets-archived` and `bw-wallets-reorder`. The screen loads lazily.
- **The controller accepted the planner's calls P1 to P15** (receipt, Deviations).
  - No package, lockfile, edge, API or database change.
  - The receipt is its own file under R87: `docs/implementation/receipts/P2-T20.md`.
  - Planned on Claude Code Opus, built on Claude Code Haiku 5.5. The controller checked the commit: all 10 `real/` files are byte-identical to the kit. `index.ts` matches the controller's 3-way copy, since P2-T14 merged first.
- **Merge order with #406 (P2-T33):** both add a spread to the catalogue's `index.ts`. If #406 merges first, the controller merges the head in, giving ADD, LIST and then LOCK, in plan order.

## Test plan
- [x] RED, every failure an assertion and none a module-load error: Node 0 of 4 pass; render 13 of 16 fail, the routes file's 3 old cases passing.
- [x] GREEN:
  - Node: 8 of 8 (`walletsList`, `draftText`);
  - render: 16 of 16, with no stderr and no `act` warnings;
  - the neighbours: 177 of 177. That is the brief's 169 plus the tray file's 5 new cases from tray-hardening's fix round, and 3 more;
  - the catalogue's wallet sections: 32. The registry: 1 of 1.
- [x] 84 of 84 mutants killed, matching the planner's `mutants.out` line for line.
- [x] R100's fast gate:
  - `typecheck:app` and `typecheck:routes`;
  - `test:app` and `test:unit`;
  - the focused render files: 193 of 193;
  - `export:web` (4834 modules);
  - `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs, including the full render suite and the iOS export.
- [ ] Independent review (Opus), and a second review: the list shows balances and private mode.
- [ ] SKIPPED: device checks (receipt, Step 6).

Closes #166 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

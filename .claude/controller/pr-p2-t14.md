## Summary
- **P2-T14, the add flow, the keypad and the amount step.** The Bun Wallet's add tray: the amount step (bw-tray-amount, rh-income; W14, W15), the keypad (W29), the type switch, the quick chips, and the flow's pure rules, which P2-T15 to P2-T20 build on.
- **The flow's rules (`addFlow.ts`, Node-tested):**
  - the step titles;
  - where Next goes (`stepAfterAmount`), and which keypad problem shows (`amountProblem`, P6);
  - the confirm rows;
  - the guesses;
  - "move all" at a zero balance (the plan's F18);
  - the balances.
  - `AddStep` gains `transfer` for P2-T15's two-wallet step (P3d). `confirmRows` reads built-in category names through the app's copy (P3e).
- **The amount step (P4, P10):**
  - The footer is its own component, `AmountFooter`: the keypad, its problem line, and Next. It is handed to the tray's `footer` (P3a).
  - At the largest text sizes (ax-large-tray), the amount scrolls with the middle of the step.
  - `useCanTellBun()` keeps the plan's `companion` rule in one place for P2-T16 (P3b).
- **The type switch (P7):** one radio group, named `add.typeGroup`, with three segments of at least 44 pt.
- **Private mode (P9):** the quick chips show stored amounts, so they are masked (฿••••) and each says it is hidden (W10). The amount being typed is never masked.
- **Copy and sections:**
  - `copy.ts` holds the plan's thirteen lines and two more (P3g).
  - P2-T3's draft check exempts `add.chip` (P3h).
  - The catalogue sections are in their own list, `addSections.tsx`. Its import and spread in `index.ts` go right after the tray's (P3f), merged after P2-T12's lines.
- **Merge order (P15, and P2-T33's P17):** this PR merges before P2-T33 (#406). That PR then keeps both spreads in `index.ts`, with the add's before the lock's.
- **The controller:**
  - accepted the planner's calls P1 to P17 (receipt, Deviations);
  - ruled on the rebased `index.ts` during the build: its own copy had the spread in the wrong place (from `check_kit.sh`'s patch fuzz, now fixed). The implementer's `git apply --3way` result is right, and it equals the planner's merge proofs.
  - No route, package, lockfile, edge, API or database change. The receipt is its own file under R87: `docs/implementation/receipts/P2-T14.md`.

## Test plan
- [x] RED. Every failure is an assertion, and there are no load errors:
  - `addFlow.test.ts`: 6 of 6 failing;
  - `AmountStep.render.test.tsx`: 12 of 12 failing;
  - the draft check: 4 of 4, by design.
- [x] GREEN:
  - Node: 10 of 10;
  - render: 12 of 12, with nothing on stderr;
  - the 4 neighbour files: 58 of 58;
  - the catalogue's `bw-` sections: 26, which is C + 4 (C = 22 at this head);
  - the registry rule: 1 of 1.
- [x] 92 of 92 mutants killed, line for line as the planner's run. The files match the planner's verified copies, and `index.ts` equals the planner's merge proofs.
- [x] R100's fast gate:
  - `typecheck:app`;
  - `test:app` 34 and `test:unit` 980;
  - the focused render files: 70 of 70;
  - `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs, including the full render suite, `export:web` and the iOS export.
- [ ] Independent review (Opus), and a second review: the add flow enters money, and P9 decides what private mode masks. Then the owner's yes before merging.
- [ ] SKIPPED: device checks (the keypad and the tray's footer on a phone, AX5 by hand for E2-B).

Closes #160 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## Summary
- **P2-T12, the card stack and card frames.** Home's wallets as a stack of cards (bw-home), and a list at the largest text sizes (ax-large-home). Each card's frame is kept for P2-T17's flight.
- **The stack (`CardStack.tsx`):**
  - The cards come in the order given. The cards behind the front one sit `STACK_PEEK` (54 pt) apart. The front card sits in the stack's own flow, so the stack is `54 × (n − 1) + 200` pt tall and grows with the front card's words rather than covering what is below (P4).
  - Today's money out shows on the front card only; pending totals show on every card (P5).
  - Shadows by day only, none at night or in the list (P9).
- **The press (P6, `walletOpen`; W6, R66):**
  - It plays the tick and calls `onOpen` at once.
  - The card lifts 12 pt on the gentle spring and comes back down, so it is in place when the person returns.
  - There is no lift under Reduce Motion, or before the phone answers whether Reduce Motion is on.
- **The largest text sizes (P7):** one column of spine cards, front card first, nothing clamped. Screen readers meet the cards in the order drawn.
- **The frames (`cardFrames.tsx`, P10):**
  - `CardFramesProvider`, `useRegisterCardFrame` and `useCardFrames()` (`frameOf`, plus a `measure()` beyond the plan's interface).
  - A view is measured when it registers and after each of the stack's own layouts. There is one view per wallet id, and a view that leaves forgets only its own frame.
  - `collapsable={false}` is pinned by a Node check that reads the source (R72's trap).
- **The sections (P3):** `bw-stack` and `bw-stack-large` live in their own list, `stackSections.tsx`. One import and one spread in `index.ts` sit between the kit's and the tray's (plan order), so the task waits on nothing in flight. Both the head's tray case and tray-hardening's rewrite (#392) pass.
- **Carried in:**
  - K5 (P2-T11's review n2) is in the stack's test file and kills RM5 (P12).
  - The derived-look flash and the empty `order` before the first read are the caller's, P2-T23 and P2-T24 (P8). `WalletLooksProvider` needs no change.
  - The new wallet's drop goes to P2-T21, with a shorter travel suggested (P11).
- The controller accepted the planner's calls P1 to P18 (receipt, Deviations). No route, package, lockfile, edge, API or database change, and no copy line added. The receipt is its own file under R87: `docs/implementation/receipts/P2-T12.md`.

## Test plan
- [x] RED: 13 of 13 failing (render 12 of 12, Node 1 of 1), every one an assertion.
- [x] GREEN: 12 of 12 and 1 of 1; the neighbours (`WalletCard`, `walletHarness`, `Tray`, `WalletLooks`) 47 of 47; the catalogue's `bw-` sections 22, up from 18.
- [x] 59 of 59 mutants killed, with output byte-identical to the planner's three runs; the six files match the planner's verified copies.
- [x] R100's fast gate:
  - `typecheck:app`, `test:unit`, `test:app`;
  - the focused files (59);
  - the catalogue's `bw-stack` sections in the every-section and screen-reader suites (4);
  - `git diff --check`.
- [ ] CI on this pull request is green (the nine jobs: render +1 file and +12 cases, plus the two new sections in each catalogue suite; `test:unit` +1). GitHub Actions is paused for billing; CI runs once that is fixed.
- [ ] Independent review (Opus: size M).
- [ ] SKIPPED, no device here: the lift and the shadows on a phone, `measureInWindow` on a phone, and the VoiceOver order. For E2-A, `bw-stack-large` has to be captured at AX5 by hand (P14).

Closes #158 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

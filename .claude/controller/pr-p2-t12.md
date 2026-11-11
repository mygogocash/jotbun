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
- **The fix round (review M1, plus m3, m4, n2, n3 and n4; commit `af61e89a`):**
  - **M1:** under VoiceOver on iOS, a double tap on a card behind the front one opened the card in front of it. The cause: iOS tapped the middle of the card's box, which lies under the next card.
    - `WalletCard`'s `Pressable` now has `onAccessibilityTap={onPress}`, so VoiceOver's double tap runs the card's own press. iOS synthesizes no tap; Android and the web ignore the prop.
    - It is pinned from the source (`cardNativeProps.test.ts`) and by a render case that calls the prop as iOS does.
    - `WalletCard.tsx` is P2-T11's file; the controller gave leave to edit it.
  - **n2:** a card view that comes back to the frames answers only what is measured after it is back. `forget()` drops the view's own frame, and a measurement that lands while its view is away is dropped.
  - **Pins for the review's eight surviving mutants:** pending totals behind the front card, a lone card's today line, one open per press, the list's keys, no `accessible` view in the stack, frames measured again after each layout but not on a plain re-render, and `frameOf`'s exact null.
  - **Carried elsewhere:** m1 and n1 to P2-T24, m2 to P2-T17 (`followups.md`).
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
- [x] CI on this pull request is green: 9 of 9 jobs at `af61e89a`, on the local runners.
- [x] Independent review (Opus): Needs fixes on `90b5079` for one major, M1 (`.claude/controller/reviews/P2-T12.md`).
- [x] Fix round (`af61e89a`, brief `.claude/controller/briefs/P2-T12-fix.md`):
  - RED on `90b5079`'s code: M1's two pins and the registry case. The review's eight survivors are each killed by their own pin.
  - GREEN: Node 4 of 4, `CardStack` and `WalletCard` 24 of 24. 73 of 73 mutants killed.
  - The post-restart gate: `typecheck:app`, `test:app` 34, `test:unit` 974, `git diff --check` and gitleaks are all clean.
- [x] Confirming review (Opus) of the fix commit: Approved (`.claude/controller/reviews/P2-T12-confirm.md`).
- [ ] SKIPPED, no device here:
  - the lift and the shadows on a phone;
  - `measureInWindow` on a phone;
  - the VoiceOver order;
  - with VoiceOver on an iPhone, a double tap on each card behind the front one opens its own wallet.
  - For E2-A, `bw-stack-large` has to be captured at AX5 by hand (P14).

Closes #158 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

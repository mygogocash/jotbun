## Summary
- Looks kept per account (P2-T11): each wallet's look (Bun's face and one of five materials), each category's icon and the wallets' order. A look is derived from the wallet's id until the person picks one. Kept text is read leniently: a damaged entry is dropped, never thrown.
- **The provider keeps the person's data (P3, W7, R64):**
  - One queue: each change reads its name, changes it and writes it back, after the account's first read and after the change before it. Two quick changes never drop each other, and a late read never hides a change.
  - A name the store cannot read is never written over.
  - Reads for an account that is no longer open are dropped, so nothing of the last account shows for even one render.
- **The wallet card** (stack, full and spine):
  - balances with `sign="balance"`;
  - a credit card shows what was spent, from zero down (P6, W25);
  - in private mode every line keeps its place and only the amounts are masked (P7, W10);
  - one spoken label joins the name and each part.
- **Category icons:** the built-in drawings move unchanged from `categoryIcons.tsx` to `ui/categoryDrawings.ts`, and a SHA-256 test pins that (P5). `DrawingShape` gains two optional fields that the ten board glyphs need. The picker's food and gift keep today's drawings (P4).
- **The wallet test harness** mounts the looks provider innermost. It also folds in P2-T8's review m-1: two ready cases that kill E2, E3 and X2. m-2's sentence goes in its header.
- **Off until the owner approves (E2, Q3):** the wallet area is not approved and the copy is draft. Three catalogue sections (`bw-materials`, `bw-card`, `bw-category-icons`) show it. The receipt lists the board calls for E2-A (P4, P7, P9).
- The controller accepted the planner's calls P1 to P16 (receipt, Deviations), and R103 for the gate (below). No package, lockfile, route or native change. The receipt is its own file under R87: `docs/implementation/receipts/P2-T11.md`.

## Test plan
- [x] RED on typed stubs: Node 10 of 10 failing; render 19 of 27 failing, every one an assertion. The 8 that pass are, by design, the harness's own cases and P2-T8's two. GREEN: Node 14 of 14, render 27 of 27.
- [x] 119 of 119 mutants killed; the 18 files match the planner's verified copies.
- [x] R100's fast gate: `typecheck:app`, the focused render files (9 files, 65 of 65), the three new sections in the catalogue and screen-reader suites, `test:unit` 955, `test:app` 34, `git diff --check`.
- [ ] CI on this pull request is green: the full render suite, including the whole `CatalogueScreen` file. **R103:** the local whole-file run could not finish while the Mac slept for heat; every one of its 301 cases passed in at least one run, and the four timed-out cases passed in a clean window.
- [ ] Independent review.
- [ ] SKIPPED: the owner's E2-A screenshots and device checks (no simulator or browser here).

Closes #157 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

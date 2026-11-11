## Summary
- Bun Wallet motion (P2-T9), in `apps/app/src/wallet/motion/`:
  - `walletMotion.ts`: the reduced-motion table, pure;
  - `useWalletMotion.ts`: its Reanimated builders;
  - `GrowBar.tsx`: the grow bar. It decides at mount, and animates the fill's width rather than a scale, so the rounded end keeps its shape.
- `theme/motion.ts` (shared) takes two additive edits: the paragraph above `spring` is rewritten, and three haptic moments are appended after `aiAccepted`.
- The controller accepted planner calls P1 to P14. Look first at:
  - **P3:** an extra test file, `useWalletMotion.render.test.tsx`. It reads each builder through Reanimated's `getAnimationAndConfig()` and `getReduceMotion()`.
  - **P10:** P2-T8's harness weakness (X2: kit parts answering the reduced-motion question first) is caught from the motion side. A part asks the phone itself, so the `mockReturnValueOnce` mutant fails. The harness is not edited.
  - `save` plays no haptic in the table, because the save rule (W17) already plays success.
- For E2-D: fades keep Reanimated's default curve. The board says ease-out, but the plan names durations only.
- The receipt is its own file under R87: `docs/implementation/receipts/P2-T9.md`.

## Test plan
- [x] RED on typed stubs: Node 0 of 4 pass and render 0 of 12, every one an assertion. GREEN: 4 of 4, 12 of 12, and the four focused files 26 of 26.
- [x] 65 mutants: 62 killed and 3 equivalent, each with its reason (P12). The plan's two are among those killed. Every file restored byte for byte.
- [x] Checks, each the head's measured baseline plus this task:
  - `typecheck:app` and `typecheck:routes`;
  - `test:app` 34;
  - `test:unit` 905;
  - the full `test:render`, 97 files and 1735 tests;
  - `export:web` 4785 modules;
  - `git diff --check`.
- [ ] SKIPPED: device and simulator checks (nothing draws the motion yet).
- [ ] CI on this pull request is green.
- [ ] Independent review.

Closes #155 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

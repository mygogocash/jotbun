## Summary
- Money text, `WalletAmount`, the icon button and private mode for Bun Wallet (P2-T10). One eye hides every amount.
  - `apps/app/src/wallet/money/` holds `walletMoney`, which is pure, and `WalletAmount`.
  - `wallet/controls/IconButton.tsx` is the icon button.
  - `wallet/privacy/` holds `PrivateModeProvider`, `PrivateEyeButton`, `PrivateTip` and their copy.
  - The catalogue gains `kitSections.tsx`.
- Two shared files take additive edits:
  - `WalletRoot.tsx` gets one provider and one import (P2: the provider order);
  - the catalogue's `wallet/index.ts` gets one import and one spread.
- Answering P2-T8's review (P3, P4): the catalogue's `inApp` does not change, and wallet sections work outside `WalletRoot`. `bw-private` mounts its own provider over an in-memory store, so the catalogue never touches the person's real setting.
- The controller accepted planner calls P1 to P16. Look first at:
  - **P5:** amounts read as hidden until the stored setting is read, and a tap before then does nothing.
  - **P7:** the provider reads the locale from `IntlContext`, not `useIntl`. With `useIntl`, 7 of P2-T2's 8 `WalletRoot` cases fail, because that test draws the root without an `IntlProvider`.
  - **P8:** signs and words.
  - **P12:** the one surviving mutant, the plan's `{ on }` event, is equivalent, because `cleanEvent` strips that key first.
- **For E2-A (P9):** three looks the board shows are not built yet:
  - a filled eye while amounts are hidden;
  - the board's `#3A57E8` on the tip, which uses the palette's toast colours instead;
  - P2-T9's 150 ms fade, not wired yet.
- The receipt is its own file under R87: `docs/implementation/receipts/P2-T10.md`.

## Test plan
- [x] RED on typed stubs: Node 6 of 6 and render 14 of 14 failing, every one an assertion. GREEN: 10 of 10 and 14 of 14; the focused neighbours pass 565.
- [x] 71 mutants: 70 killed and 1 equivalent (P12). Every file restored byte for byte.
- [x] Checks, each the head's measured baseline plus this task:
  - `typecheck:app`, `typecheck:routes`;
  - `test:app` 34, `test:unit` 907;
  - the full `test:render`, 97 files and 1741 tests;
  - `export:web`, 4788 modules;
  - `git diff --check`.

  The first export, run from a warm Metro cache, printed 4604 modules with byte-identical bundles. The controller ruled it a flake, and the re-run printed 4788.
- [ ] SKIPPED: device and simulator checks, VoiceOver on a phone, and E2-A's screenshots of `bw-amounts` and `bw-private` (after P2-T13).
- [ ] CI on this pull request is green.
- [ ] Independent review.

Closes #156 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## Summary
- **The Bun Wallet tray (P2-T13):** a card over a dimmed page, 8 pt in from the edges, with radius 34.
  - Its header row has back (when given), the title and close, as 44 pt buttons. The middle scrolls, the footer stays pinned, and the keyboard pushes the card up.
  - It moves with P2-T9's builders (`trayEntering`, `trayExiting`, `stepLayout`). A step change morphs the height and plays one tick, and the wallet's own reduced-motion answer decides every animation.
- **Closing (Review Focus 1):** one request serves close, the backdrop, Android's back, Escape and a swipe down past the line on the header. Nothing closes while `locked` (a save in flight): close says it is unavailable, and a locked swipe springs back.
  - The card plays its exit, then the Modal hides after the exit's own duration.
  - `onClosed` fires once: on iOS from the Modal's own `onDismiss` (R69).
- **The lock (R63):** while the lock cover is up, a plain cover replaces the backdrop and the card inside the Modal. The card's exit is skipped, so it never shows over the cover in the app switcher.
- **Names and focus:** exactly one named dialog. On the web the dialog layer takes focus; on a phone the title does.
- **Buttons:**
  - `PrimaryButton`: at least 54 pt, says its busy label while busy, and ignores presses while busy or disabled.
  - `TextLink`: at least 44 pt.
- **Two animation systems stay one per surface (P5).** A Sheet opened from a tray is its own Modal over it, and `theme/motion.ts`'s comment now says so. P2-T9's review m-2 is pinned here: the own-animation case walks all six builders.
- **Off until the owner approves (E2):** the wallet area is not approved. Four catalogue sections, in their own `traySections.tsx` to stay clear of P2-T11's `kitSections.tsx`, show the tray at its short, tall and largest-text sizes, and the buttons. The receipt lists the differences from the boards for E2-A (P19).
- The controller accepted the planner's calls P1 to P19 (receipt, Deviations). No package, lockfile, route, app entry or native change. The receipt is its own file under R87: `docs/implementation/receipts/P2-T13.md`.

## Test plan
- [x] RED on typed stubs: Node 4 of 4 failing and render 16 of 16 failing, every one an assertion. The builder file passes 6 of 6 by design: it pins P2-T9's code. GREEN: Node 4 of 4, render 22 of 22, neighbours 42 of 42.
- [x] 99 mutants: 98 killed and 1 equivalent. P10 is equivalent because Pressable reports `disabled` to screen readers itself. The output matches the planner's line for line, and the 11 files match the planner's verified copies. A server restart cut off the first run; the mutated file was restored from the verified copy and the whole check rerun.
- [x] R100's fast gate: `typecheck:app`, `test:app`, `test:unit`, the focused render files (7 files, 64 of 64), `git diff --check`.
- [ ] CI on this pull request is green: the full render suite, which picks up the four new sections in the catalogue, screen-reader and large-text suites.
- [ ] Independent review.
- [ ] SKIPPED, needs a device:
  - the swipe on a phone;
  - the exit and `onDismiss` on iOS;
  - the keyboard on iOS and Android;
  - VoiceOver focus;
  - Android's back;
  - the cover with no exit flash;
  - the E2-A screenshots.

Closes #159 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

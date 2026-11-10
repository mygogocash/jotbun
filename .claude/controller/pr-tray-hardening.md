## Summary
- **The tray-hardening follow-up:** the fixes and pins that P2-T13's review asked for in the Bun Wallet tray (m1's guard, m2, m3's reset, m4, m5, m6, n1, n3), before the first host trays (P2-T16, held until this lands).
- **The fixes (`Tray.tsx`; no exported name, type or prop changes):**
  - **m1:** under the lock cover nothing asks to close the tray. `closable` gains `!hidden`, so Android's back (and Escape on the web) no longer closes a covered tray, and a host's draft is kept while the app is locked (R63).
  - **m2:** on iOS, a dismissal that ends after the tray is shown again says nothing. `dismissed` calls `onClosed` only while the Modal is hidden: it reads a ref of `shown`, refreshed with `closed`.
    - A ref of `visible`, as the review suggested, would call `onClosed` twice, the first time too early, if the tray reopened and closed before the late end (mutant H3; ruling P3).
    - `shown` is not held until `onDismiss` (P4).
  - **m3's reset:** a drag the cover cuts off is gone when the cover lifts (`hidden` joins the drag reset's dependencies).
  - **m4:** a step change ticks only if the tray was open and uncovered in the commit before (`wasOpen`). Opening at another step, or a step change under the cover, plays no tick (P2-T13's P11(b), now in one render too).
  - **n1:** a swipe the system cancels springs back, even past the line (`!event.canceled`).
- **The pins:**
  - six new render cases: P-E, P-D, P-I, P-A with P-K, P-M2, and n3's new `onClosed`;
  - the phone case run with a header (m5);
  - two `assert.match` lines in the Node source case (m6);
  - n4's note on Gesture Handler corrected.

  The cancel case goes through Gesture Handler's own handler, and P-M2 through a Modal mock that can hold dismissals back (P10).
- **The catalogue case (P11)** reads the tray's four sections where they sit. P2-T14's and P2-T12's sections may then come after them.
- **Left out on purpose:** the rest of m3 stays with P2-T33, together with m1's plan gap. That rest is the card's entering when the cover lifts (probe P-J), where VoiceOver lands, and the scroll position. n1's flick-up rule stays with E2-A.
- The controller accepted the planner's calls P1 to P16 (receipt, Deviations). No route, package, lockfile, edge, API or database change. The receipt is its own file under R87: `docs/implementation/receipts/tray-hardening.md`.
- **Unblocks:** P2-T16 comes off hold when this merges.

## Test plan
- [x] RED: 5 of 22 render cases failing (m1, m3, n1, m4, m2), every one an assertion; the Node file passes 4 of 4, by design.
- [x] GREEN: 22 of 22 and 4 of 4; the catalogue's wallet sections pass 18.
- [x] 34 of 34 mutants killed, with output identical to the planner's run; the three files match the planner's verified copies.
- [x] R100's fast gate:
  - `typecheck:app`;
  - the focused files (22 and 4), and the catalogue's `bw-` sections (18);
  - `test:app` 34 and `test:unit` 970;
  - `git diff --check`.
- [ ] CI on this pull request is green (the nine jobs; render +6 cases).
- [ ] Independent review (Sonnet: size S).
- [ ] SKIPPED, no device here: the phone checks (a quick reopen on iOS, Android's back under the cover, a drag the cover cuts off, a swipe the system cancels). The cases drive React Native's Modal and Gesture Handler's own handler instead.

No task issue: a follow-up from P2-T13's review.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

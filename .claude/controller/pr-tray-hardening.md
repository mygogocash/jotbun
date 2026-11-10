## Summary
- **The tray-hardening follow-up:** the fixes and pins that P2-T13's review asked for in the Bun Wallet tray (m1's guard, m2, m3's reset, m4, m5, m6, n1, n3), before the first host trays (P2-T16, held until this lands).
- **The fixes (`Tray.tsx`; no exported name, type or prop changes):**
  - **m1:** under the lock cover nothing asks to close the tray. `closable` gains `!hidden`, so Android's back (and Escape on the web) no longer closes a covered tray, and a host's draft is kept while the app is locked (R63).
  - **m2:** on iOS, a dismissal that ends after the tray is shown again says nothing. `dismissed` calls `onClosed` only while the Modal is hidden: since the fix round it reads the render's `shown` (`if (!shown) closed.current?.()`).
    - A guard on `visible`, as P2-T13's review suggested, would call `onClosed` twice, the first time too early, if the tray reopened and closed before the late end (mutant H3; ruling P3).
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
- **Fix round (`fc78376`, after this PR's Sonnet review, `reviews/tray-hardening.md`).** CI could not run (GitHub Actions is paused for billing), so the controller folded the review's minors into this PR instead of a later follow-up:
  - **m-1:** the first round's guard read a ref refreshed in a passive effect. `Modal.js` calls `onDismiss` in its `setState` callback, in the layout phase of the commit that renders the end. So a native iOS end batched with a reopen still called `onClosed` while the tray was open.
    - The guard now reads the render's `shown`, and the `showing` ref is gone (F1).
    - The Modal seam now ends a held dismissal the way `Modal.js` does (F2).
    - The new case queues both updates inside one `act`, which avoids a flake of the two-task form (F3).
  - **m-2, n-1 and n-2:** three new cases pin code that was already right:
    - nothing moves during an exit, even as the cover comes and goes (mutant X1);
    - the tick's `hidden` dependency (D2);
    - an iOS tray with no `onClosed` (X4).
  - Ruling F1 says the first brief's P3 holds for one commit after another only, and withdraws P4's third reason. n-3 (`onClosed` twice for two hides, or none for a Modal that never presented) is a note for P2-T16.
- **Unblocks:** P2-T16 comes off hold when this merges, and P2-T14 starts.

## Test plan
- [x] First round: RED 5 of 22 render cases failing (m1, m3, n1, m4, m2), every one an assertion, with the Node file passing 4 of 4 by design. GREEN 22 of 22 and 4 of 4. 34 of 34 mutants killed.
- [x] Fix round, on 784667b merged with the head (#391's provider):
  - RED: 1 of 26 failing, m-1's case, on its assertion;
  - GREEN: 26 of 26 and 4 of 4; the catalogue's wallet sections pass 18;
  - 40 of 40 mutants killed, with output byte-identical to the planner's; both files match the fix kit's verified copies.
- [x] R100's fast gate, after the fix round:
  - `typecheck:app`;
  - the focused files (26 and 4), and the catalogue's `bw-` sections (18);
  - `test:app` 34 and `test:unit` 970;
  - `git diff --check`.
- [ ] CI on this pull request is green (the nine jobs; render +10 cases, `Tray.render.test.tsx` 16 to 26).
- [x] Independent review (Sonnet: size S): approved on 784667b, `reviews/tray-hardening.md`.
- [ ] Confirming review of the fix round (Sonnet).
- [ ] SKIPPED, no device here: the phone checks (a quick reopen on iOS, Android's back under the cover, a drag the cover cuts off, a swipe the system cancels). The cases drive React Native's Modal and Gesture Handler's own handler instead.

No task issue: a follow-up from P2-T13's review.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

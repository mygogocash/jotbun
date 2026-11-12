## Summary
- **P2-T16: the add tray's host** (`AddTrayHost.tsx`): it opens the Bun Wallet's add tray for spending, income and moving money, carries Tell Bun, and saves on Quick add's save rules. It runs P2-T14's amount step and P2-T15's transfer, confirm and pick steps.
- **One tray at a time** (P5): an `open()` asked while the tray is closing waits for it to finish (`whenClosed`). Each entry's state lives above the tray, so the lock cover cannot lose it.
- **The save in flight** (P9): the tray locks only while saving, the host's `close` does nothing then, and the entry is frozen while `useEntrySave` holds it. A refused save says why above Save and is announced on iOS.
- **The steps and the type** (P7): changing the type to transfer always goes to the transfer step and never stays on confirm. At AX5 the type is chosen on the amount step only.
- **Tell Bun** (P10): `TellBunSheet` stays unchanged, as the plan says (P3-T18 keeps its tests), so confirm quotes no sentence after Tell Bun. That is an E2-B difference. P2-T15's confirm m1 is pinned in `AddSteps.render.test.tsx`; `useDraftReview` is P3-T13's.
- **Private mode** (P6, P11) follows R114: filled amounts are hidden, and nothing quoting the person is drawn.
- **Analytics:** `record_started` carries no `kind` for a copy.
- **Catalogue:** `addHostSection.tsx`, loaded lazily from `addSections.tsx`. `index.ts` is untouched.
- **Carried:** tray-hardening's c-n1 (one case in `Tray.render.test.tsx`), the swipe during a save driven through Gesture Handler's real pointer path, R114.2, and all 16 followups that name this task.
- **The controller accepted the planner's calls P1 to P21.**
  - Planned on Claude Opus, built on Claude Haiku 5.5.
  - The controller checked the commit: all 8 `real/` files are byte-identical.
  - The controller's pre-flight before the build: the kit over the head passed the eight wallet catalogue kit render files with `AddTray` and `AddSteps` (176), the routes tests (15), `test:unit` and `typecheck:app`.
  - The receipt is its own file under R87: `docs/implementation/receipts/P2-T16.md`.
  - No package, lockfile, route, edge or database change.
- **Open risks:**
  - On iOS, a tray that never presented gets no `onClosed`, so later opens would wait for it. This needs a device check.
  - One defensive `catch` (a copied amount the keypad cannot hold) is left unpinned on purpose.

## Test plan
- [x] RED: `AddTray.render` 17 of 17 failing, every one an `AssertionError`, with the messages in the planner's order. `typecheck:app` passes on the stubs.
- [x] GREEN: `AddTray.render` 17, neighbours 249, catalogue 96, the registry rule, the Node files 19.
- [x] 86 of 86 mutants killed, every kill an assertion; the output matches the planner's line for line.
- [x] R100's fast gate:
  - `typecheck:app`, `test:app` and `test:unit`;
  - 12 focused render files, the eight kit files among them: 266;
  - the routes tests: 18;
  - `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs, including the full render suite and the iOS export.
- [ ] Independent review (Opus), and a second review: the save, the money and private mode.
- [ ] SKIPPED: device checks (Tell Bun's sheet over the tray on iOS and its keyboard; a swipe during a save and Android's back on a phone; a quick reopen while UIKit's dismissal ends; whether UIKit sends a dismissal for a refused present; VoiceOver on the save's problem).

Closes #162 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

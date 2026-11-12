## Summary
- **1D-T7: the phase 1 app events, sent once each from the rules that perform each action** (save, delete, restore, undo, sync, the onboarding and system-permission steps).
  - **Analytics:** `recordProps.ts` (new) builds each record event's properties from the allow-listed fields only; `bus.ts`, `appAnalytics.ts` and `controller.ts` carry the events to the PostHog controller.
  - **Sync:** `syncTelemetry.ts` (new) reports each sync's outcome; `SyncOutcome.reason` is optional (P10), so files outside the task need no change.
  - **Telemetry:** `consent/systemPermissionTelemetry.ts` and `spend/spendTelemetry.ts`.
  - **Rule sites:** each call sits in the rule's current file (P2's hooks where they exist): `entrySave.ts`, `QuickAddScreen.tsx`, `recordActions.ts`, `deletedData.ts`, `HistoryScreen.tsx`, `HomeScreen.tsx`, `BudgetScreen.tsx`, `OnboardingScreen.tsx`.
- **Privacy:** the bus's allow-list is the boundary. No event carries an amount, a note, a name or any text the person typed, and each render case checks what was actually sent with `JSON.stringify`.
- **The bus guard** (P12, beyond the plan): most calls run inside the save's `try`, so a PostHog client that throws would turn a saved record into "could not be saved". One `try`/`catch` in the bus prevents that.
- **Early events** (P13): events tracked before the controller installs are kept (capped at 50) and handed over once. The screen on display when consent turns yes is now sent. `ai_enabled` stays with P3.
- **Quick add has no Undo today**, so its "saved toast Undo" event is P2-T17's (P3).
- **Carried followups:** 1D-T6's review m3 points one and two (P13); P2-T25's review m1, the wallet route pinned in `SpendRoutes.render.test.tsx`, killing X3a and X3b (P15); line 111, the epoch move on a fresh sign-in (P14; 1D-T15's two-phone run checks it).
- **The controller accepted the planner's calls P1 to P20.**
  - Planned on Claude Opus, built on Claude Haiku 5.5.
  - The controller checked the commit: 36 of 37 `real/` files are byte-identical; the receipt adds only "accepted by the controller".
  - The controller's pre-flight before the build, at `0b66c92c`: the kit over the head passed 23 render files (559), `typecheck:app`, `test:unit` and `test:app`.
  - The receipt is its own file under R87: `docs/implementation/receipts/1D-T7.md`.
  - No package, lockfile, route, edge or database change.

## Test plan
- [x] RED: Node 11 of 70 and render 18 of 405 failing, every one an `AssertionError`, matching the planner's names.
- [x] GREEN: Node 70, render 405.
- [x] 64 of 64 mutants killed by assertions; the plan's equivalent mutant QE survives, as the plan says.
- [x] R100's fast gate:
  - `typecheck:app`;
  - the four routes tests: 17;
  - `test:app` 36 and `test:unit` 1063;
  - `git diff --check`.
- [x] CI at `78f91ca5`: 9 of 9, including the full render suite.
- [x] Independent review (Opus) and second review (Sonnet): **both Needs fixes** on `78f91ca5` (`.claude/controller/reviews/1D-T7.md`, `reviews/1D-T7-second.md`). The privacy boundary holds: no event can carry an amount, a note, a name or typed text. Both found M1: on a signed-out launch, the early events (P13) were dropped at `AnalyticsUpkeep`'s first `setAccount(null)`, so onboarding's first step never reached PostHog. Also unpinned guards, and the sync's hand-over order.
- [x] **Fix round** (`f09af7a1`, brief `.claude/controller/briefs/1D-T7-fix.md`; ruling R119 with the planner's P21 to P33):
  - the launch's first account answer keeps what is held, whether it says signed out or names an account; a sign-out and an account switch still drop it (L4, P14), pinned through `AnalyticsUpkeep`'s real signed-out start and the controller;
  - `deviceSync.ts` hands each outcome to the diary before its events;
  - pins for a save with no track sending nothing, "Use yours" reporting the server copy's category, and the kind of an income and a move at Quick add, History, Recently deleted and the record screen's Restore.
  - The proofs: RED 1 of 38 Node and 2 of 220 render, all assertions; GREEN 38 and 220; **75 of 75 mutants killed** (QE equivalent). All 12 fix-kit files are byte-identical.
  - Planned on Claude Opus, built on Claude Haiku 5.5.
- [x] The controller merged the integration head (with #441) as `d8d7364a`, with no conflicts. On the merged tree: `typecheck:app` 0; `test:unit` 1085; `test:app` 36; the task's render files 422; the eight kit files and the four routes tests 158; `git diff --check` on the range.
- [x] CI at `d8d7364a`: 9 of 9.
- [ ] Confirming review (Opus) of the fix round.
- [ ] SKIPPED: device checks (events on a real PostHog EU project, for 1D-T15's two-phone run).

Closes #138 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

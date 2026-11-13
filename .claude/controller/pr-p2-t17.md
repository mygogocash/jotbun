## Summary
- **P2-T17: the saved moment.** After a save, a toast says it landed and gives today's money out (bw-saved), or says the save stayed on the phone (rh-offline). It carries Undo. A chip drops into the wallet's card (`SaveFlight`).
  - **`savedMoment.ts`** (pure): `noticeOf`, `undoPlan`, `todayOutMinor`, `toastWords` and `toastAmount`.
  - **`SavedToastHost.tsx`:** `SavedToastHost` and `useSavedToast`. It reads the toast's figure, runs Undo and draws the neutral check (§5.3).
  - **`SaveFlight.tsx`:** the chip. It starts once the tray has left, calls `measure()` first, and aims at the card's top (followups lines 376 and 447).
- **Today's money out (P6)** counts every expense command dated today whose record the read does not list, except one Jotbun refused. The read's items and summary come from one revision, so the total stays exact even when a sync takes the draft mid-read. A failed read, or one with more than a page of expenses today, leaves the total unknown (P4).
- **Undo:**
  - **What it does (P7, R61):** it removes a draft that was never sent, or deletes a record Jotbun holds at version 1. Each Undo sends one `undo_used`.
  - **When it is offered (P7):** not for a save kept on the phone while no diary is open.
  - **Its answers (P8):** an unconfirmed delete keeps its key and offers Undo again, so a resend never commits twice.
- **Private mode (P10, R114):** the toast says `฿••••` and quotes nothing typed. The chip draws `฿••••` and no title.
- **`show` never throws (P12, followups line 783).** The toast and the chip have separate keys; the planner's run caught React mixing them up.
- **Shared edits:**
  - `TextLink` and `WalletText` gain the `toastLink` tone (P3g, which P2-T13's receipt left to this task).
  - The catalogue's `index.ts` gains one import and one spread. The four sections load lazily: `savedSections.tsx` lists them and `savedScreens.tsx` draws them (P3e, P14).
  - `WalletsList.render.test.tsx` and `AddTray.render.test.tsx` change one line each (P3f).
- **The controller accepted the planner's calls P1 to P22.**
  - Planned on Claude Opus, built on Claude Haiku 5.5.
  - The controller checked the commit: all 13 `real/` files are byte-identical.
  - The receipt is its own file under R87: `docs/implementation/receipts/P2-T17.md`.
  - No package, lockfile, route, edge or database change. The English lines are drafts for the owner at E2-B (Q3).

## Test plan
- [x] RED: Node 7 of 7 and render 16 of 16 failing, every one an `AssertionError`, matching the planner's lists. `typecheck:app` passes on the stubs.
- [x] GREEN: Node 33 (26 base + 7), render 16.
- [x] 94 of 94 mutants killed, every failing case an assertion. The output is byte-identical to the planner's. The plan's three (P12, H37, F9) are among them.
- [x] R100's fast gate:
  - `typecheck:app`, `test:app` and `test:unit`;
  - the eight kit files 142;
  - the four routes tests 17;
  - the other neighbours 83;
  - the catalogue's `bw-` sections 110 and the registry rule;
  - `git diff --check`.
- [x] CI at `fa09a9c0`: 9 of 9, including the full render suite and the iOS export.
- [ ] Independent review (Opus), and a second review (Sonnet): today's total (P6), Undo and its event (P7 and P8), and private mode (P10).
- [ ] SKIPPED: device checks:
  - the toast and the chip as the tray's Modal leaves on iOS;
  - VoiceOver hearing the toast and Undo's answer;
  - the flight on a phone;
  - the toast over elevated cards on Android.

Closes #163 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

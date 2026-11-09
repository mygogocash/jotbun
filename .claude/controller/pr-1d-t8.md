## Summary
- The consent question and Privacy's switch (1D-T8, D34). While the server says the account was never asked, the spend layout shows the question in place of the screens (inside `CompanionBoundary`, where `<Slot />` was). Loading never blocks.
- The question has two buttons of equal weight, neither chosen. No takes effect at once. Yes waits for the server, and on a failure keeps the question with a calm line. The question names what is never sent.
- Privacy's switch ("ช่วยพัฒนา Jotbun") is on when the answer is yes. Off takes effect at once; on waits for the server. While a no has not reached the server, a caption says it stopped on this phone.
- `useAnalyticsConsent` reads 1D-T1's installed controller, which gains `pendingNo()` (P2, P3). Privacy's own transport gains the shared transport's LAN rule and analytics-off header (P7). The import area's two transports are left to P4, as 1D-T6's m4 says.
- **Off until the owner approves (E2, Q4, Q9, Q10).** `analytics` is a new redesign area, not in `APPROVED`. The copy is the plan's draft table in `analyticsConsentCopy.draft.ts`, not catalog keys. Five catalogue sections draw every state for the owner's review; the deep links are in the receipt.
- The controller accepted the planner's calls P1 to P13 (receipt, Deviations). Only today's `<Slot />` swap is made; P2-T18 writes the Bun Wallet layout's swap and its two consent cases (P1).
- No route, package, lockfile, catalog key, edge, API or database change. The receipt is its own file under R87: `docs/implementation/receipts/1D-T8.md`.
- The work spans the controller takeover of 9 Nov: the first mutation run was cut off at 22:04 after 39 of 47 mutants. The controller restored the file it left mutated (checksum verified), and the full check was rerun (Deviations 7 to 9).

## Test plan
- [x] RED on typed stubs, every failure an assertion: unit 5 of 48 failing, render 12 of 57, catalogue 7 of 11 (565 skipped).
- [x] GREEN: unit 48 of 48; render 57 of 57 in 4 files; catalogue 11 passed in 2 files.
- [x] 47 of 47 mutants killed, each file restored (SHA-256 checked); the 18 files match the planner's verified copies.
- [x] R100's fast gate: `typecheck:app`, `typecheck:routes`, `test:app` 34 of 34, `test:unit` 927 of 927, `export:web` (4794 modules), `git diff --check`.
- [ ] CI on this pull request is green: the full `test:render` suite (+2 files, +23 cases) and the iOS export run there.
- [ ] Independent review.
- [ ] SKIPPED: the owner's E2 screenshots of the five catalogue sections (no simulator or browser here).

Closes #139 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

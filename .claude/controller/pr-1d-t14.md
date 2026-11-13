## Summary
- **1D-T14: the account events, from 1C's credential provider.** The provider sends `signed_up`, `signed_in` and `signed_out`. 1D-T1 holds them until the person says yes, so none is sent before then.
- **Sign-in (P2, P3):** an active sign-in sends `signed_up` when the server says it created the account (`SignInResult.created`, 1C's K23), and `signed_in` otherwise, each with `request.method`.
  - A request's `signUp: true` never decides it, since a returning Apple user may send it too.
  - The event goes right after the `bootstrapped` dispatch, so on an account switch it is never captured under the previous account.
- **Sign-out (P4, followups line 770):** `signed_out` is tracked first in `signOut()`, before the session change. Otherwise `AnalyticsUpkeep` resets the identity before the event is captured.
  - **The planner's guard:** it is sent only from an active session. From a locked or ended session, the event would be held and sent under the next account's yes (mutant M5).
- **R125, the controller's ruling (P10):** `signOut({ event: false })` sends no `signed_out`.
  - **Who passes it:** Settings' sign-out everywhere and its Try again (the plan: "sends nothing in phase 1"), and Privacy's Done after an accepted deletion (an event under the deleted person's id could recreate the PostHog person after 1D-T13's step 6; Global Constraints, Q11).
  - **Who does not:** Settings' plain Sign out still sends the event.
- **Privacy:** no email address, Apple subject, session or account id, or token reaches analytics. The new render file walks both screens with the real provider and the real `AnalyticsUpkeep`, the recorder answering yes. The next account's yes sends only its own sign-up.
- **The controller accepted the planner's calls P1 to P12 (P10 is R125).**
  - Planned on Claude Opus, built on Claude Haiku 5.5.
  - The controller checked the commit: all 8 `real/` files are byte-identical, the receipt included (the planner wrote it).
  - No package, lockfile, route, edge or database change.
  - The worktree's `node_modules` was the controller's link farm onto a fresh install with the same lockfile; nothing was installed.

## Test plan
- [x] RED: Node 9 of 47 and render 3 of 3 failing, every one an `AssertionError`. The interface stub's typecheck passes.
- [x] GREEN: Node 47 of 47; render 3 of 3 (passed 5 runs out of 5 at planning).
- [x] 12 of 12 mutants killed, including M8 (the provider ignores the option) and M9 to M12 (the option dropped or wrong at each caller). The output is identical to the planner's.
- [x] R100's fast gate:
  - `typecheck:app`;
  - `test:app` 37 and `test:unit` 1118;
  - 11 render files, 158 tests: the four that load the provider, both screens' suites, `privacyServices`, the new file and the four routes tests;
  - `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs. Note: GitHub Actions is queued org-wide.
- [ ] Independent review (Opus), and a second review (Sonnet): what reaches analytics, the event order around the session change, the active-session guard, and R125 at both callers.

Closes #145 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## Summary
- 1C-T8 adds the sign-in screens as drafts, for the owner's E2 review:
  - email code;
  - account exists;
  - terms, with its gate;
  - session ended, with the other account's records;
  - devices;
  - the "Confirm it's you" sheet, with `useFreshSignIn`;
  - the reminder question;
  - the welcome sign-in link.

  They live in `apps/app/src/screens/redesign/signin/` (13 screens and parts, 7 render tests). They sit behind a redesign area that stays off until approved, and the catalogue draws them in 22 sections (`signinSections.tsx`).
- `spend/v1/policies.ts` (with tests) holds the terms and policy model. `onboardingModel` and `OnboardingScreen` gain the sign-in steps.
- Shared files take additive edits:
  - `registry.tsx`: `SIGNIN_SECTIONS` goes last, and the header now names the companion list, fixing P2-T8's review nit;
  - `featureFlags.ts` and its test: `'signin'` goes after `'wallet'`;
  - `catalogs.test.ts`.

  1D-T8 follows in the same lane.
- The controller accepted planner calls P1 to P16. Look first at:
  - **P1:** approved words stay on `tc`; new lines go through `sc` and the Thai drafts.
  - **P4:** one `as unknown as Href` cast in `OnboardingScreen`. `/onboarding/reminder` is 1C-T9's route, which deletes the cast.
  - **P5:** the "Confirm it's you" sheet opens for every method, so Apple and Google take one more tap. That is an owner question for E2.
- The receipt is its own file under R87: `docs/implementation/receipts/1C-T8.md`. It lists the 22 catalogue deep links for the screenshots.

## Fix round (review of 5e8b70e, rulings R98 and R99)
- R98 (review M1): on the session-ended screen, when the main button is the email code to the account's own address, "Use another way" also offers an email code to another address. An email-only build (Android until Google is on) can no longer strand an account that was deleted or disabled elsewhere, and keep-or-erase for another account is reachable. New catalogue section `signin-session-ended-email` (23 sections now).
- R99: nothing navigates to 1C-T9's `/onboarding/reminder` yet; the story's end keeps today's in-place reminder step, so the cast is gone.
- Tests for the seven unpinned guards (m1), including that a fresh sign-in never reuses an earlier answer; two copy-rule slips fixed (m3); the receipt's E2 owner list gains m2 and m4.

## Test plan
- [x] RED:
  - unit: 8 of 36 failing;
  - render: 34 of 61 failing.

  None fails on a missing module. GREEN: 36 of 36, 61 of 61, and the catalogue's sign-in sections pass 48.
- [x] 67 of 67 mutants killed, with every file restored byte for byte.
- [x] Checks, each the head's measured baseline plus this task:
  - `typecheck:app`, `typecheck:routes`;
  - `test:app` 34, `test:unit` 911;
  - full `test:render`: 102 files and 1802 tests;
  - `export:web`: 4788 modules;
  - `git diff --check`.
- [ ] SKIPPED: the E2 screenshots of the 22 sections. No simulator or browser runs here; the deep links are in the receipt.
- [x] Fix round: RED 3 of 69 (the R98 and R99 cases), GREEN 69 of 69; 15 of 15 mutants killed; `test:app` 34, `test:unit` 912, full `test:render` 102 files and 1812 tests, `export:web` 4788 modules.
- [ ] CI on this pull request is green.
- [x] Independent review (Needs fixes: M1, fixed in the round above).
- [ ] Confirming review of the fix round.

Closes #125 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

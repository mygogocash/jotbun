## Summary
- D37 and fresh sign-in (1C-T6). Deletion, export and sign-out everywhere now run on 1C-T5's fresh sign-in, using the new session's own credentials (R86), in place of the old purpose proofs. `auth/reauthentication.ts` is deleted.
- The D37 model, `auth/sessionEnded.ts`, gives the layout guard an `ended` flag for the provider's `locked` and `reauth_required` states, and the v1 transport gains `acceptLanguage`.
- The two account screens, their services and the catalogue fakes are rewired. These are types and wiring only: no copy changes and no new screens.
- The controller accepted planner calls P1 to P17. Look first at:
  - P1: what a fresh sign-in that does not go through returns;
  - P3: the screens keep their states and words;
  - P13: credentials on the wire;
  - P17: the resend.
- The receipt is its own file under R87: `docs/implementation/receipts/1C-T6.md`.
- Built on `5dbd7be`. #361 (1D-T6) later edited the same `api/client.ts` and `client.test.ts` in other places, and git merges the two cleanly. CI tests that merged tree.

## Test plan
- [x] RED on typed stubs: unit 22 of 46, and render 49 of 106 in 3 files, every one an assertion. GREEN: 46 of 46 and 106 of 106; the catalogue's settings and privacy sections pass.
- [x] 41 of 41 mutants killed, every file restored byte for byte.
- [x] At `5dbd7be`:
  - `typecheck:app`, `typecheck:routes`;
  - `test:app` 33, `test:unit` 887;
  - the five focused render files, 125 tests; the full `test:render`, 90 files and 1660 tests;
  - `export:web` 4775 modules; `git diff --check`.
- [ ] On the merged tree (CI): `test:app` 34, `test:unit` 901, `test:render` 94 files and 1717 tests. That is 1C-T6's own tests added to the head's measured 33, 894, and 93 files and 1706 tests.
- [ ] CI on this pull request is green.
- [ ] Independent review.

Closes #123 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

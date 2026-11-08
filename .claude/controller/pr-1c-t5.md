## Summary
- Replaces the app's Auth0 sign-in with a Better Auth port over `@better-auth/expo` (1C-T5), with the session cookie in SecureStore. It is tested against an in-memory fake server; Task 12 joins it to 1C-T1's real server (#334, merged).
  - Packages added: the plan's own, pinned (`better-auth` 1.6.33, `@better-auth/expo`, `@better-auth/core`, `better-call`, `@better-fetch/fetch`).
  - Lockfile: zod 3.25.76 moves to 4.6.7 at the root. The review checked this is safe: `@expo/cli` gets its own nested zod 3, everything else reading the root copy wants zod 4, and the API typecheck, build, tests and release graph pass.
- Review history:
  - **First review: Needs fixes.** A token read in flight across a sign-in could be cached for the next session. Sign-out of a device, and sign-out everywhere, read the server's 204 as a failure.
  - **Round 2 (`8deea1d`):** a generation counter guards the token cache, and the 204 routes are success. **Confirming review: Needs fixes.** A deeper issue that predates this task: during a sign-in beside an existing session, a request could go out with one session's token and another session's id. After a failed session read, one account's queued commands could flush into another account's vault, which breaks spec §6.4 D37.
  - **Round 3 (`cfd1cc4`, ruling R86):** a token is handed out only when its `sid` matches the session the provider holds, including sign-out's vault call. A sign-in whose session read fails after the server accepted it signs out. **Confirming review: Approved.** It found no request pairing one session's token with another's id, and no queued command reaching another account's vault, in any interleaving it built. Normal use never sees "not ready".
- Known gap, handed to Task 8 (recorded in the receipt): if the app is killed between the server accepting a sign-in and the record's save, it relaunches on the old account holding the new cookie. Nothing is sent; the diary asks to sign in again; signing out or in again recovers.
- Ledger: the 1C sections are combined. There is one `## 1C:` heading, with Task 5 under it after Task 1, and the head's renamed 1D heading is kept.

## Test plan
- [x] Round 3: RED 9 of 98 on `8deea1d`, GREEN 98 of 98, 28 of 28 mutants killed. Rounds 1 and 2 mutants included.
- [x] On `cfd1cc4`: `typecheck:app`, `test:app` 32, `test:unit` 784, full `test:render` 83 files and 1592 tests (the reviewer's run). Earlier rounds: `export:web` and the iOS export, `test:ops`.
- [x] After merging the integration head `92c14d6`: `typecheck:app`.
- [ ] CI on this pull request is green

Closes #122 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

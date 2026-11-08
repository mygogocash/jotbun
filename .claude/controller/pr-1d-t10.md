## Summary
- `GET /v1/sync/live` on the UserVault (1D-T10). A phone opens a hibernating WebSocket, and after each commit the vault pokes the person's other phones, never the one that saved. Sessions that have ended are closed after every call and alarm. The new code is in `src/vault/live.ts`.
- Each socket is tied to the token's `sid` (R78: no session header). With 1C-T5's R86, the app hands out a token only when its `sid` matches its session, so a phone's writes and its socket share one session.
- Accepted deviation (controller, 8 November): `webSocketClose` answers the phone's close itself. The installed workerd (1.20261019.1) does not do this automatically, despite the plan's compat-date assumption. The six smaller calls are in the receipt.
- Shared files take only additive edits in named places: `user-vault.ts`, `v1/handler.ts`, `v1/routes.ts`, `cloudflare-workers.d.ts`, the test client and route coverage.
- Integrator note: after a sign-in finishes, the app's live socket waits for the next foreground. Restarting the channel on a session change belongs to a later 1D task.
- The receipt is its own file under R87: `docs/implementation/receipts/1D-T10.md`.

## Test plan
- [x] RED: 21 of 21 Workers cases and 2 of 8 coverage cases failed on assertions. GREEN: 21 of 21 and 8 of 8. 23 of 23 mutants killed. No real timer waits; the tests use the `cloudflare:test` helpers.
- [x] `typecheck:edge`, `test:edge` 164, `test:edge:workers` 392 passed plus 3 todo under the heavy lock, `build:edge`.
- [ ] CI on this pull request is green.
- [ ] Independent review.

Closes #141 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

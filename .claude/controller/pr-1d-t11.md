## Summary
- **1D-T11: server events and the analytics id.**
  - **Server events from the change log** (`apps/edge/src/vault/analytics.ts`, new): after a vault call that changed something, the vault sends `record_saved`, `sync_failed` and `resync_required` from the server (`origin: 'server'`) for people who said yes.
  - **Real failures, by class name only:** the vault marks a failure only on a 500 `INTERNAL_ERROR` (`user-vault.ts`), and the Worker counts exactly what `errorResponse` answers with 500 (`countWorkerFailure`, `handler.ts`). 422, 400 and 413 are refusals, not failures (P5, read with L6).
  - **The analytics id:** `/v1/me/analytics` answers exactly `analytics_id` (an HMAC), `weeks_since_signup` (an integer 0 to 1040, never null) and `consent` (P7).
- **Consent is read only when the vault holds the caller's own account** (P3). The analytics reads and sending never throw, so they cannot change a call's answer (P4).
- **The off header** is matched in any case (P6). 1D-T6's m4 (only the shared transport sends it) leaves no gap for these events (P12).
- **Carried followups:**
  - line 34, a `live.test.ts` case for "the work after a call never throws" (killed by the review's G1 mutant);
  - line 182 (`/v1/me/analytics`'s exact keys, and no 404 `NOT_FOUND` but for a missing route);
  - the `VaultRoute` comment nit;
  - `VAULT_ADDED_ROUTES` pinned exactly.
- **It shares `vault/routes.ts`, `v1/protocol.ts` and `v1/routes.ts` with P3-T7** and was planned on P3-T7's final files, which merged byte-identical (#435).
- **The controller accepted the planner's calls P1 to P13.**
  - Planned on Claude Opus, built on Claude Haiku 5.5.
  - The controller checked the commit: all 13 `real/` files are byte-identical.
  - The receipt is its own file under R87: `docs/implementation/receipts/1D-T11.md`.
  - `posthog-node` (already a dependency, 5.56.2) is now in the bundle. No package, lockfile, app or database change.
- **Nothing is sent** until Q5's PostHog secrets are set.

## Test plan
- [x] RED: Node 1 of 9 and workers 19 of 41 failing, every one an `AssertionError`, under the heavy lock. `typecheck:edge` passes at RED.
- [x] GREEN: Node 9, workers 41. The Worker-exception case logs the class name only (`"error":"RangeError"`).
- [x] 41 of 41 mutants killed by assertions, the plan's five among them; the output is identical to the planner's.
- [x] R100's fast gate:
  - `typecheck:edge`;
  - `test:edge` (20 files, 206);
  - `build:edge` (`eu.i.posthog.com` is in the bundle);
  - `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs, including the full workers suite.
- [ ] Independent review (Opus), and a second review: privacy (consent, what each server event carries) and the failure counting.
- [ ] SKIPPED: a live capture to PostHog EU (no project or keys, Q5).

Closes #142 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

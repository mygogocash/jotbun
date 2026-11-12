## Summary
- **P3-T7: a failed model call gives its use back** (H5, B5 as A14 refines it).
  - A use is still counted before the first model call.
  - When the request ends without a model answer (the rules, the plain facts or 503), the vault gives the use back. This happens only when the last call failed with a rate limit, a 5xx, a timeout or no connection, and the use goes back to the Bangkok day it was counted on, before the route answers.
  - A decline, an unusable or ungrounded answer, a request the API rejected and any other failure still spend it.
- **The day is the vault's** (P5): `consumeAi` answers the Bangkok day it counted, on the vault's clock, and the new `ai.refund` step writes to that day's row. A call that crosses midnight refunds the day it was counted on.
- **`shouldRefund`** (`apps/edge/src/v1/ai/uses.ts`) reads only the last recorded call, against an allowlist of failures (`GIVES_BACK`). A failure class added later spends the use until someone adds it.
- **The refund step runs after the session ends** (P2, `anySession: true`): it only gives back the request's own use, has no HTTP route, and `ensureAccount` still refuses an erased vault.
- **A refund never fails the request** (P3): the route still answers, and the service logs one `ai_refund_failed` line with the feature and the failure's class name only.
- **The refund runs on each route's failure path** (P4), as `shouldRefund(trace.calls, false)`.
- **Carried followups:**
  - P3-T4's m1 (P9): `callFailure` reads a DOMException named `AbortError` or `TimeoutError` as `timeout`, with a real-time stalled-body case. This puts `transport.ts` and `ai-transport.test.ts` outside the plan's file list.
  - P3-T6's X4 pin (P10) and its n1 deadline comment (P11).
  - P3-T6's m1 slip row is left untouched for P3-T8.
- **The controller accepted the planner's calls P1 to P14.**
  - Planned on Claude Opus, built on Claude Haiku 5.5.
  - The controller checked the commit: all 12 `real/` files are byte-identical.
  - The receipt is its own file under R87: `docs/implementation/receipts/P3-T7.md`.
  - No package, lockfile, route, app or database change. No client minimum (P14).
- **Risk, for the record (P14):** a call that times out on the server may still be billed by Anthropic though its use comes back. B27 (no global limiter in v1) and P6C's spend alerts are the guards. Whether workerd fails a stalled body the same way as Node is left to P6C's hosted check.

## Test plan
- [x] RED, every failure an `AssertionError`, with both typechecks passing on the stubs:
  - Node `ai-transport.test.ts` 2 of 10;
  - workers 10 of 62, under the heavy lock.
- [x] GREEN: Node 10, workers 62 (`ai-uses`, `ai-routing`, `ai.test`).
- [x] 35 of 35 mutants killed, all by assertion, the plan's two (U9/G10 and V1) among them.
- [x] R100's fast gate:
  - `typecheck` and `typecheck:edge`;
  - `test:edge` (19 files, 196);
  - `build:edge`;
  - `git diff --check`.
- [x] CI at `088b346a`: 9 of 9, including the full workers suite.
- [ ] Independent review (Opus), and a second review: the refund rules, the day, and the session.
- [ ] SKIPPED: none beyond R100's whole suites, which CI runs.

Closes #191 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

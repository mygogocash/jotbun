## Summary
- **P3-T3: the ai gate.** The edge gets its own gate scopes, so `config:v1` can pause Bun without pausing writes.
  - **`v1/gates.ts` (new):** `EDGE_GATE_SCOPES` (the API's five plus `ai`) and `EdgeGates`, a `FeatureGates` that also knows `ai` (P4).
    - It keeps the API's rule: 404 first for any unreleased scope, then 503 for the first paused scope in the order given.
    - A paused `ai` answers `AI_PAUSED` (`errors.ai_paused`) with the config's retry.
  - **`v1/config.ts`:** `config:v1` may name `ai` (`gatesOf`). A config that fails closed pauses every edge scope, `ai` included, with a 30-second retry (P5).
  - **`v1/routes.ts` and `worker-routes.ts`:** AI's four model routes carry exactly `['ai']`, so pausing writes leaves Bun open. The two preferences routes carry no gate (P8).
  - **`v1/ai/routes.ts`:** the preferences answer `available: false` while `ai` is paused, on GET and PUT (P6). The routes stay ungated, following owner Q5's default.
- **`handler.ts` needs no edit (P2).** It already sends a route's gates to `config.gates`, and the order stays P4-T3's: the route, the release check, the body, the gates (503), then the client check and the token. A paused `ai` answers before authentication, with no model call and no use spent.
- **Two test files beyond the plan's list (P3):** `files-front-door.test.ts` and `imports-review.test.ts` build `new EdgeGates()`; without that, `typecheck:edge` fails with TS2739.
- **Built on P4-T3's merged `routes.ts`, `route-coverage.test.ts` and `handler.ts`,** which match the planner's base byte for byte.
- **The controller accepted the planner's calls P1 to P11.**
  - Planned on Claude Opus, built on Claude Haiku 5.5.
  - The controller checked the commit: 11 of 12 `real/` files are byte-identical. The receipt adds one line, the skipped installs.
  - The receipt is its own file under R87: `docs/implementation/receipts/P3-T3.md`.
  - No package, lockfile, Cloudflare resource or app change.
- **Deploy order (P11, 1B's owner answer 3), the owner's call:** deploy this reader before any `config:v1` names `ai`, since an older Worker reads `ai` as unknown and pauses every gate. Remove `ai` from `config:v1` before any rollback past this task.

## Test plan
- [x] RED: Node 5 of 17 and Workers 6 of 12 failing, every one an `AssertionError`, under the heavy lock. `typecheck:edge` passes at RED.
- [x] GREEN: Node 17, Workers 12. The 11 neighbour files pass (382), the AI workers files, the two edited files and the `Proxy`-double files among them.
- [x] 31 of 31 mutants killed (Node 23, Workers 8), every failure an assertion, the plan's three (C1, R1, P1) among them. Both outputs are byte-identical to the planner's.
- [x] R100's fast gate:
  - `typecheck:edge` and the root `npm run typecheck`;
  - `test:edge` (214);
  - `build:edge` (the gate is in the bundle);
  - `git diff --check`.
- [x] CI at `2c642055`: 9 of 9, with the whole workers suite.
- [x] Independent review (Opus) and second review (Sonnet): **both approved** on `2c642055` (`.claude/controller/reviews/P3-T3.md`, `reviews/P3-T3-second.md`), with no blocker, major or minor. Both agree the 503 before the token reveals only the service's state. Their nits and notes are carried in `followups.md`: the fail-closed answer at the front door pinned in parts, consent withdrawal under a pause, `MODEL_ROUTE_WORKERS` kept by hand, and the deploy order in the runbook.
- [ ] SKIPPED: a hosted config change (the owner's deploy step).

Closes #187 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

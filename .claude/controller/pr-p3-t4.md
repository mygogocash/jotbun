## Summary
- **P3-T4: the gateway transport, one deadline per request, and the call trace.** Every AI model call on the vault now goes through one `ModelTransport` (`apps/edge/src/v1/ai/transport.ts`). That covers `parse`, `slip`, `note` and `ask`.
- **The gateway (Cloudflare AI Gateway):**
  - `anthropicTransport` wraps the Anthropic SDK with `AI_GATEWAY_HEADERS`: logging and caching are off, so the gateway keeps no prompt or reply.
  - It adds `cf-aig-authorization: Bearer <token>` only when the optional `AI_GATEWAY_TOKEN` secret is set.
  - `transportFromEnv` is `null` unless AI is on and keyed.
- **One deadline per request:**
  - `AiDeadline` caps a request at 25 s.
  - A call with less than 2 s left is never made (`MIN_CALL_MS`), and a child deadline ends at the earlier of its cap and its parent's.
  - A call that outlives its time fails as `timeout`.
  - `callFailure` names each failure (`timeout`, `rate_limited` with its wait, `rejected`, `other`). A 529 is not treated as a rejection.
- **The call trace:** `AiTrace` and `tracedSend` record each call's model, status, stop reason and tokens (`RecordedCall`).
- **Replaced:** the old direct-fetch `SendMessage` and `anthropicSender` (`src/server/ai/model.ts`), and `send` in `V1Deps`, `WorkerContext`, `startV1` and `FakeModel`. The base request builders stay.
- **Docs:** `README.md` and `wrangler.jsonc` document `AI_GATEWAY_TOKEN`. Nothing is deployed; the gateway resource is the owner's to set up.
- **The controller:**
  - accepted the planner's calls P1 to P5 (receipt, Deviations);
  - ruled at RED that the type-only `env.ts` change is copied at Step 1, and that the one timeout case at RED is expected (the stub has no deadline).
  - No package, lockfile, app or API change. It shares no file with #407, #406 or #409.
  - Planned and built on Gemini 3.8 Flash. The controller checked the commit: 13 of 14 `real/` files are byte-identical, and the receipt adds only its Deviations.

## Test plan
- [x] RED: 9 of 9 failing in `ai-transport.test.ts`. 8 fail on `AssertionError`; 1 is "a call that outlives its time fails as a timeout and is recorded", which times out because the stub has no deadline.
- [x] GREEN:
  - the Node unit files: 38 (`ai-transport` 9, `request` 21, `route-coverage` 8);
  - `test/workers/ai.test.ts`, under the heavy lock: 43 of 43;
  - `test:edge`: 189 in 17 files.
- [x] 8 of 8 mutants killed: gateway logging and caching off, the 2 s floor, a 529 handled as a 529, a rate limit failing at once, the gateway token, the child deadline, and env gating.
- [x] R100's fast gate: `typecheck:edge`, `build:edge` and `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs, including the full workers suite.
- [ ] Independent review (Opus), and a second review: user prompts now pass through the AI Gateway.
- [ ] SKIPPED: a live call through a real AI Gateway (the owner sets up the resource; nothing is deployed).

Closes #188 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

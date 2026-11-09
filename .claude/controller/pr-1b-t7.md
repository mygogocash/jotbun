## Summary
- **The AI routes on vault reads (1B-T7):** Tell Bun's drafts, slip reads, Ask Bun, the day's note and the AI preferences. The vault serves each one's consent, switch, daily uses, facts and tools from its own SQL.
- **The steps keep `AiService`'s order and refusals (P1):**
  1. consent (403 `AI_CONSENT_REQUIRED`);
  2. the switch (Tell Bun falls back to its rules; slips and Ask Bun answer 503 `AI_PAUSED`);
  3. the day's use, counted before each model call, so a failed call still costs it;
  4. the model.
- **Every step rechecks the session, the policy and that the account is active (P5).** That is stricter than `AiService`: a session signed out while Ask Bun runs is refused at its next tool step, before any model call.
- **Inside Ask Bun, a 500 from a vault step falls back** as the old database error did; any other refusal is the answer (P4).
- **Input is read in the Worker before the first step (P2),** as 1B-T9's and 1B-T10's routes do. A signed-out session sending a malformed body now gets 422 where the PostgreSQL edge gave 401. The token is still verified first, and nothing is read or sent to a model either way.
- **The model reaches the handlers as `WorkerContext.send` (P3).**
  - That needs three minimal `handler.ts` edits, none on a `headOf` line, so fix-download-aborts applies on top.
  - A given model wins. Otherwise `AI_ENABLED` and `ANTHROPIC_API_KEY` build the Anthropic sender.
  - `AI_ENABLED` is `"false"` in `wrangler.vault.jsonc`, and there is no gate (owner answer 3).
- **Logs:** `ai_fallback` carries the failure's class name only: never a message, a body, an amount or a slip (P7). Amounts are `amount_minor`, as in the summary (P17).
- **Bundle:** the vault grows to 1,645 kB (gzip 377 kB), almost all of it the Anthropic SDK that the plan's sender requires. Every PostgreSQL driver marker still counts 0 (R95).
- The controller accepted the planner's calls P1 to P18 (receipt, Deviations). No package (the SDK is already an edge dependency), lockfile, app, API or database change. The receipt is its own file under R87: `docs/implementation/receipts/1B-T7.md`.

## Test plan
- [x] RED on typed stubs: 38 of 38 failing, every one an assertion. GREEN: 38 of 38.
- [x] 99 of 99 mutants killed, including the plan's two, each file restored; the 13 files match the planner's verified copies.
- [x] R100's fast gate:
  - `typecheck:edge`;
  - the focused run (38 of 38, under the heavy lock);
  - `test:edge`, 15 files and 176 tests;
  - `build:edge` (every driver marker at 0, `AI_ENABLED` `'false'`);
  - `git diff --check`.
- [ ] CI on this pull request is green, in the nine-job layout: the workers suite (+1 file, +38 tests) and the database suites.
- [ ] Independent review.
- [ ] SKIPPED: the hosted AI path (no key, no AI Gateway, nothing deployed; every test fakes the model), and `test:edge:db` locally (Docker stopped; CI runs it).

Closes #111 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

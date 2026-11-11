# Review: P3-T4 Second Review (Gemini 3.8 Flash)

**Task:** P3-T4: "The gateway transport, one deadline per request and the call trace"
**PR:** #410 (`mygogocash/jotbun`, branch `p3/t4-gateway-transport`, base `origin/claude/p1a-vault-core`)
**Commit under review:** `a68fcd81`
**Focus:** Privacy, secrets, gateway headers, request deadlines, tracing, off-by-default behavior.

---

## 1. Focus Areas Verification

### 1.1 Logging and Caching Disabled on Every Request
- `AI_GATEWAY_HEADERS` in `apps/edge/src/v1/ai/transport.ts` defines:
  ```ts
  export const AI_GATEWAY_HEADERS = {
    'cf-aig-collect-log': 'false',
    'cf-aig-skip-cache': 'true',
  } as const
  ```
- In `anthropicTransport`, these headers are merged into `defaultHeaders` on the Anthropic SDK client (`new Anthropic({ ..., defaultHeaders })`).
- `maxRetries: 0` is explicitly set, preventing internal SDK retries from looping or swallowing status codes and headers.
- Every model call via `client.beta.messages.create` automatically transmits `cf-aig-collect-log: false` and `cf-aig-skip-cache: true`.
- No alternate paths, fallbacks, or retry mechanisms bypass `AI_GATEWAY_HEADERS`.

### 1.2 Secrets Handling (`AI_GATEWAY_TOKEN` and `ANTHROPIC_API_KEY`)
- `AI_GATEWAY_TOKEN?: string` is defined in `V1Env` (`apps/edge/src/v1/env.ts:31`).
- In `apps/edge/wrangler.jsonc`, `AI_GATEWAY_TOKEN` and `ANTHROPIC_API_KEY` are only referenced in documentation comments; neither key is placed in `vars`.
- In `apps/edge/README.md`, both are clearly documented under secrets managed via `npx wrangler secret put`.
- In `anthropicTransport`, `cf-aig-authorization: Bearer <gatewayToken>` is attached only when `gatewayToken` is present and non-empty.
- Neither `AI_GATEWAY_TOKEN` nor `ANTHROPIC_API_KEY` is ever stored in `RecordedCall`, passed to `AiTrace`, logged via `logFailure`, or exposed in error messages/responses.

### 1.3 The Call Trace and Privacy Integrity
- `RecordedCall` (`apps/edge/src/v1/ai/transport.ts:90-103`) contains strictly operational metadata:
  `spanId`, `feature`, `requested`, `model`, `escalated`, `latencyMs`, `sent`, `httpStatus`, `retryAfterSeconds`, `failure`, `stopReason`, and `usage` (token counts).
- Verified via independent probe (`probe 1`) that prompt text, response completions, base64 image data, account/session IDs, and user identifiers never appear in `RecordedCall` or `AiTrace`.
- `logFailure` in `apps/edge/src/v1/ai/service.ts:283-286` emits only `{ level: 'warn', event: 'ai_fallback', feature, failure: failureName(error) }`.

### 1.4 Off by Default Behavior
- `transportFromEnv(env)` returns `null` unless `flag(env.AI_ENABLED)` (strictly `'1'` or `'true'`) is truthy AND `env.ANTHROPIC_API_KEY` is populated.
- When `transport` is `null`:
  - `parse` falls back to offline heuristic rules (`draftFromRules`) without spending quota uses.
  - `slip` and `ask` fail closed with `503 AI_PAUSED` without spending quota uses.
  - `note` returns plain vault facts without spending quota uses.
  - No external HTTP requests are dispatched when AI is unconfigured or disabled.

### 1.5 Deadlines and Failure Categorization
- Route deadline: `new AiDeadline(25_000)` enforces a 25 s total request budget.
- Pre-call check: calls with remaining time below `MIN_CALL_MS` (2,000 ms) record `sent: false, failure: 'timeout'` and throw `DeadlinePassed` without sending.
- In-call timeout: `timeoutMs` is passed to the SDK with `AbortSignal.timeout(timeoutMs)`, reliably terminating hanging calls within budget.
- Child deadlines clamp to `Math.min(remainingMs(), capMs)`.
- `callFailure` maps abort/connection timeout errors to `'timeout'`, network failures to `'no_connection'`, 429 to `'rate_limited'`, >= 500 to `'server_error'`, and 4xx to `'rejected'`.
- `parseRetryAfter` correctly clamps retry intervals to whole seconds between 1 and 3,600 inclusive, returning `null` on invalid or out-of-bounds headers.

---

## 2. Independent Probes & Mutation Verification

Tested in scratch workspace (`/Users/kunanonjarat/.claude/controller/scratch/p3-t4-second`):

1. **Planner Mutants (8/8 killed):**
   - M1 (`M1_drop_collect_log`): KILLED
   - M2 (`M2_ignore_deadline`): KILLED
   - M3 (`M3_529_as_rejected`): KILLED
   - M4 (`M4_max_retries_1`): KILLED
   - M5 (`M5_drop_skip_cache`): KILLED
   - M6 (`M6_drop_gateway_auth`): KILLED
   - M7 (`M7_child_deadline_no_min`): KILLED
   - M8 (`M8_env_ignores_ai_enabled`): KILLED

2. **Reviewer Probe Suite (`test/second-probes.test.ts` - 6 passed):**
   - Probe 1: Confirmed `RecordedCall` keys contain only the 12 permitted operational fields; verified zero prompt/completion/secret leakage.
   - Probe 2: Confirmed `cf-aig-authorization`, `cf-aig-collect-log: false`, and `cf-aig-skip-cache: true` headers.
   - Probe 3: Confirmed empty string `gatewayToken: ''` never sends `cf-aig-authorization`.
   - Probe 4: Tested boundary conditions: 2,000 ms remaining executes; 1,999 ms throws `DeadlinePassed` with `sent: false`.
   - Probe 5: Tested `retry-after` bounds: 1, 40, 3,600 parsed; 0, -1, 3,601, and non-numeric strings yield `null`.
   - Probe 6: Verified `transportFromEnv` is strictly null for undefined, empty, `'false'`, `'0'`, and `'yes'`.

3. **Additional Reviewer Mutants (3/3 killed):**
   - X1 (`X1_retry_after_no_upper_bound`): removed `<= 3_600` bound -> KILLED by probe 5.
   - X2 (`X2_empty_gateway_token_sends_header`): changed truthy check to `!== undefined` -> KILLED by probe 3.
   - X3 (`X3_negative_remaining_ms`): removed `Math.max(0, ...)` floor in `remainingMs` -> KILLED by probe 4.

4. **Edge Workers Test Suite:**
   - `test/workers/ai.test.ts`: 43/43 tests passed under heavy lock in 3.89s.

---

## 3. CI Status (PR #410, Workflow Run 43051770978)

- `Edge Worker (types, unit, workerd, build, PostgreSQL container)`: SUCCESS (1m32s)
  - `npm run typecheck:edge`: PASSED
  - `npm run test:edge`: PASSED
  - `npm run test:edge:workers`: PASSED
  - `npm run build:edge`: PASSED
  - `npm run test:edge:db`: PASSED
- `Typecheck, unit, API, build`: SUCCESS (1m52s)
- `Release image and smoke`: SUCCESS (17s)
- `Render (every file but the per-section suites)`: SUCCESS (1m53s)
- `Render, per-section suites (ids of length 3n)`: SUCCESS (2m46s)
- `Render, per-section suites (every other test)`: SUCCESS (3m33s)
- Remaining queued jobs: `Render (3n+1)`, `Exports`, `SQL integration` (waiting for GitHub Actions runner slots; unaffected by `apps/edge` changes).

---

## 4. Findings

- **Blocker:** None.
- **Major:** None.
- **Minor:** None.
- **Nit:**
  - `parseRetryAfter` uses `parseInt(String(header), 10)`. Inputs with trailing characters like `'40s'` would parse as `40`. A strict regex `/^\d+$/` would be slightly stricter, though in practice standard HTTP `retry-after` integer format is fully validated by `Number.isInteger(seconds) && seconds >= 1 && seconds <= 3_600`.

---

## 5. Notes for Later Tasks

- **P3-T6 (Models & Deadlines):** Will retire `DEFAULT_AI_MODEL` and wire Haiku 5.5 as base with Opus 5.5 for escalations, applying child deadline budgets per model turn.
- **P3-T10 (Analytics):** Will wire `AiTrace.analytics` consent flag to PostHog generation events.

VERDICT: Approved

# P3-T3 second review: The ai gate (PR #457, commit 2c642055)

Reviewer: Claude Sonnet 5.5, the independent second reviewer (privacy path). Read-only: no edit, commit, push or merge anywhere. Every probe and mutant ran in a scratch copy (`git archive 2c642055`, `node_modules` linked entry by entry from the worktree with the workspace links re-pointed into the copy); every workers run and every mutant run held the shared heavy lock, and none is left behind. This file was written before I read any other review of the task.

Range: `origin/claude/p1a-vault-core...2c642055`: merge base `a16a44d8` (#452); after `git fetch` the integration branch is `1ae7b383`, two controller-state commits ahead, no edge file changed. 12 files, +411 -33; `git diff --check` clean. The commit trailer names Claude Haiku 5.5, as the brief asked. 11 of the 12 files are byte-identical to the planner's `real/`; the receipt differs by one line (the "Installs" line: both installs skipped because the worktree already had its `node_modules`, which it does).

## Result

No blocker, no major, no minor. Five nits and a list of notes for later tasks. Every guard I mutated was killed by an assertion (24 of 24: ten of the planner's, fourteen of mine), every probe of the front door behaved as the plan says, the independent typecheck passes, and all nine CI jobs on #457 pass at the reviewed head (the Edge Worker job ran the whole workers suite: 37 files, 850 tests, 1 todo).

## Answers to the controller's focus list

1. **The order (P2, P4-T3's P8).** Confirmed at the front door, by probes in the workers pool (`handler.ts:117-128`): route match 404, release check 404, body 400 or 413, config read, gates 503, then the client check 426 and the token 401. Probe results with `ai` paused and no token: a garbage client header and bearer, a client below the minimum version, `/V1/AI/PARSE/` (case and trailing slash), `HEAD /v1/ai/note`, and `GET /v1/ai/note?date=zzz&locale=xx` all answer 503 `AI_PAUSED` with `Retry-After`; `GET` and `OPTIONS` on `/v1/ai/parse` are 404; a malformed JSON body is 400 and a body over 2 MB is 413 (before the gate, as the API orders them). A paused `ai` spends nothing: with all four routes called signed in and anonymous, the fake model has no call and `remaining` in the preferences still equals `AI_DAILY_LIMITS`.
   **Does the 503 before the token reveal anything about a person? No.** At that point the handler holds no claims. The anonymous and the signed-in refusals are identical (body without `request_id`, headers without `x-request-id`, on all four routes: probe D), carry no per-person field, and are computed from `config:v1` and the route alone. It is the service's state, as `WRITES_PAUSED` already is. The header set is the same `BASE_HEADERS` plus `Retry-After`; `Cache-Control: no-store`.
2. **`EdgeGates` (P4).** Read against the API's `FeatureGates.assertOpen`: the same two rules (404 first for any unreleased scope, then 503 for the first paused scope in the order given), `ai` looked up as `AI_PAUSED`, the API's codes spread from `GATE_PROBLEM_CODES`, message key `errors.<scope>_paused` (`errors.ai_paused` is also what the service's own "AI not configured" 503 already answers by default), the config's retry. `isExposed('ai')` is always true; `pausedScopes()` stays the API's list; an unknown scope still reaches `FeatureGates`' constructor and throws `RangeError`. Killed by mutants: S1 (constructor drops `unexposed` and the retry), S2 (last paused answers), S3 (key from the first scope asked), S4 (`every` for `some`), S5 (API scopes never paused), S6 (a paused `ai` thrown as 500), G1, G6, G12.
3. **Fail closed (P5).** Probe C at the HTTP door: with `config:v1` malformed, and with a KV whose `get` throws, all four model routes answer 503 `AI_PAUSED` with `Retry-After: 30`, writes answer `WRITES_PAUSED` 30, and `GET /v1/me/ai-preferences` still answers 200 with `available: false`. A config naming `ai` keeps its policies (repo case; killed S7). The retry stays 30 (S8); both branches are held: a mutant that opens `ai` only on the malformed branch dies (S19), as does one that pauses the API's scopes only (C1), and so does one that makes a config naming `ai` malformed (C2).
4. **The coverage rule (P8).** `MODEL_ROUTE_WORKERS` is exactly `ai.parse`, `ai.slip`, `ai.note`, `ai.ask` (`gates.ts:56`); exactly those four routes carry `['ai']` (`routes.ts:129-132`); the two preference routes carry no gate (`routes.ts:127-128`). Killed: R1, R5 (planner), S11 (PUT preferences gated), S12 (the note also waiting for writes). Pausing `writes` leaves Bun open and pausing `ai` leaves writes open (probe B and the repo's third case).
5. **The preferences (P6).** `available` is `dto.available && !w.gates.isPaused('ai')` on the GET and the PUT (`ai/routes.ts:23,28,35`): false while paused, false with no model configured, true only with both. A PUT while paused saves and answers `available: false`; reopening shows the change kept. Killed: P1, P2 (planner), S14 (`||`), S16 (reads the writes gate). **Can it mislead a person into thinking Bun is on? No.** The answer carries their stored `companion` and `available: false`. The app derives `enabled = companion && available` (`AiCompanionProvider.tsx:57`), both settings screens print the "resting" caption when `!preferences.available` (`CompanionSettings.tsx:74`, `WalletAiSettingsScreen.tsx:233`), and Tell Bun uses the phone's rules while `enabled` is false (`TellBunSheet.tsx:139-140`). Two facts that matter for privacy, and that hold because the preference routes have no gate: a person can withdraw consent while `ai` is paused, while the config is malformed and while KV is down (probes C and D: `PUT {companion: false}` answers 200 and the withdrawal is still there after reopening); and consent given while paused is recorded for the current notice, nothing is read while the gate is shut, and Bun starts without a further prompt once it opens, on the notice the person agreed to.
6. **P3's two test edits.** Needed, and the only two. I reverted just those two files to base in my copy: `tsc --noEmit` then fails with exactly two TS2739 errors, `files-front-door.test.ts(139,5)` and `imports-review.test.ts(803,7)`; nothing else in `apps/edge` builds a `FeatureGates` where an `EdgeGates` is required. The other `new FeatureGates(...)` sites (`files-objects.test.ts:85,357`, `imports-intake.test.ts:626,647`, `imports-parse.test.ts:354,378`) feed `PendingWorkHost.gates` and the parse consumer's `Deps.gates`, which are typed `FeatureGates`, so they stay as they are. Production code builds gates in one place, `config.ts` `gatesFor`.
7. **The deploy order (P11).** The receipt says it for the owner (its last section, first note): an older Worker reads `"ai"` as an unknown scope, fails closed and pauses every gate, and so does a rollback to such a Worker while `config:v1` names `ai`; remove `ai` before any rollback past this task. I checked the base: `gatesOf` tested `GATE_SCOPES` only (the diff replaces that line), so the claim is right. See n3 for one precision.

## Findings

### Blocker

None.

### Major

None.

### Minor

None.

### Nit

- **n1. Consent withdrawal under a pause is not asserted by name.** The plan's PUT case (`ai-gate.test.ts:79-81`) sends `cashback_tips`. That a person can switch Bun off while `ai` is paused or the config is unreadable holds today only because the two preference routes carry no gate, which the route-coverage case pins (killed R5 and S11), and a handler-level check would break the PUT-while-paused 200. My probes C and D show it working. One extra `put('/v1/me/ai-preferences', { companion: false })` with its `companion: false, available: false` answer in the preferences case would name the guarantee (a withdrawal under a paused `ai`, and one under a malformed config).
- **n2. `MODEL_ROUTE_WORKERS` is a hand-kept list.** The coverage case proves listed implies gated and gated implies listed, but a new model route that is in neither passes it. P4-T6 must add its id (the receipt says so). A cheap extra line: every `WorkerRouteId` starting `ai.` other than `ai.preferences.*` must be in the list.
- **n3. The deploy-order note could say "rolled out everywhere".** "Deploy this reader before any `config:v1` names `ai`" is right, but a split rollout leaves older Worker versions reading `ai` as unknown for a while, and the vault's own pending work reads the same config through `readGates` (`user-vault.ts:364`, `parse-consumer.ts:114`). Say: name `ai` only once the new version serves all traffic.
- **n4. A pause does not shed the body read.** The body is read and parsed (up to 2 MB, `readJsonBody`) before the gate answers (`handler.ts:119` then `:123`), so a paused `ai` saves the model call but not the Worker's work on a slip-sized body. That is the API's order and the plan's (P2), and it is the same for every gate; I record it only because `ai` is the one gate an operator may use to shed load during a provider incident.
- **n5. Install step.** The brief's Step 0.7 says the edge install always runs; the receipt says both installs were skipped on the controller's note. The note is the controller's own, so I record it, not as a defect.

## Evidence

### Probes (workers pool, scratch copy, under the heavy lock)

`probes/zz-second-probe.test.ts` (kept in my scratch folder; run once with a design flaw of mine, which rewrote the shared KV entry between phases, then fixed and rerun: 5 of 5 pass). Each case sets the config it needs just before use, because `startV1` rewrites the one KV entry.

| Probe | Request | Observed |
| --- | --- | --- |
| A1 | `ai` paused, malformed JSON body, no token | 400 `VALIDATION_FAILED` |
| A2 | `ai` paused, body over 2 MB | 413 `COMMAND_TOO_LARGE` |
| A3-A5 | no body; garbage client header and bearer; client `ios/0.0.1` | 503 `AI_PAUSED`, `Retry-After: 120`, keys `code, message_key, request_id, retry_after_seconds` |
| A6-A8 | `/V1/AI/PARSE/`; `HEAD /v1/ai/note`; note with `date=zzz&locale=xx` | 503 `AI_PAUSED` |
| A9-A10 | `GET` and `OPTIONS` on `/v1/ai/parse` | 404 |
| B1 | `ai` and `writes` paused, retry 3600 | parse 503 `AI_PAUSED`, `Retry-After: 3600` |
| B2-B3 | only `writes`, then every other scope, paused | parse is not gated (reaches the client check, 426 without a header) |
| B4-B5 | `{"gates":{"paused":["AI"]}}` (a typo) | the whole config fails closed: parse 503 `AI_PAUSED` and wallets 503 `WRITES_PAUSED`, both retry 30 |
| C | malformed config; KV that throws | the four model routes 503 `AI_PAUSED` retry 30; preferences GET 200 `available: false`; withdrawing PUT 200; writes 503 `WRITES_PAUSED` |
| D | withdraw consent under a paused `ai`, reopen; anonymous against signed-in refusals; `remaining` after | withdrawal kept and `available: true` after reopening; refusals identical but `request_id`; `remaining` equals `AI_DAILY_LIMITS`; with the gate open and no consent, parse is 403 `AI_CONSENT_REQUIRED` and calls no model |
| E | header names of a signed-in refusal | only `BASE_HEADERS`, `Retry-After`, `Content-Type`, `X-Request-Id` |

### Mutants (each file restored byte for byte, checked by SHA-256 against the commit)

- **The planner's, ten of 31, all killed by assertions** (every failing case an `AssertionError`): G1, G6, G12, R1, R5 (Node) and C1, C2, P1, P2, H1 (workers).
- **Mine, fourteen, all killed by assertions** (`scratch/p3-t3-second/my_mutants.py`): S1 constructor drops `unexposed` and the retry; S2 `findLast`; S3 message key from the first scope asked; S4 `every` for `some` in the 404 check; S5 API scopes never read paused; S6 a paused `ai` thrown as a 500; S11 PUT preferences gated; S12 the note also waits for `writes`; S7 a config naming `ai` drops its policies; S8 fail closed retries 300; S14 `available` is model OR gate open; S16 preferences read the `writes` gate; S17 the handler's `assertOpen` call filters `ai` out; S19 a malformed config still opens `ai`.

### Typecheck, and the P3 probe

`npx tsc --noEmit` in `apps/edge` of the scratch copy: exit 0 (6 s). With the two edited test files at base: exit 2, exactly the two TS2739 errors named in item 6; both files restored and checked.

### Not done, by R100 and the brief

No whole suite (CI ran them: see below), no database suite (Docker is stopped locally; CI ran `test:edge:db`), no app suite, routes test or export (no app file, route or entry changed). I did not read any other review of this task before writing this one.

### The implementer's logs

Match the receipt: RED Node `5 failed | 12 passed (17)`, workers `6 failed | 6 passed (12)`, all 11 on `AssertionError`; GREEN `17` and `12 passed`; neighbours `11 files, 382 tests` passed; mutants 23 of 23 and 8 of 8; `test:edge` 21 files, 214 tests; typecheck, root typecheck and `build:edge` pass.

### CI

Run 43349595993 on head `2c642055` (read with `gh pr checks 457 --repo mygogocash/jotbun` at 12:06 UTC on 13 November; the PR is still open and its head has not moved). All nine jobs pass: Typecheck, unit, API, build (2m33s); Exports, web and iOS bundles (2m28s); Render, every file but the per-section suites (2m56s); Render, per-section suites 3n (2m51s), 3n+1 (3m38s) and every other test (3m44s); SQL integration and ops (2m7s); Edge Worker (2m20s); Release image and smoke (18s).
The Edge Worker job's log (read through the jobs API, job 131637149144): `typecheck:edge`, `test:edge`, `test:edge:workers`, `build:edge` and `test:edge:db` all succeeded. `test:edge`: 21 files, 214 tests passed (the same counts as the implementer's local run; `edge-gates.test.ts` 6 tests and `route-coverage.test.ts` 11 tests among them). `test:edge:workers`: 37 files, 850 tests passed, 1 todo (851), with `ai-gate.test.ts` 3, `config.test.ts` 9, `ai.test.ts` 43, `ai-uses.test.ts` 12, `ai-routing.test.ts` 7, `files-front-door.test.ts` 7 and `imports-review.test.ts` 64 all green; no failing case lines in the log. `test:edge:db`: 3 files, 12 tests passed.

## Notes for later tasks

1. **P4-T6 (the slips route).** Add `'slips.read'` to `MODEL_ROUTE_WORKERS` and to the coverage case's first list; carry `gates: ['ai', 'imports']` (with `['ai', ...]` first, `AI_PAUSED` answers when both are paused); the rest of the case passes unchanged (checked against the case's text). Its release check (404) stays before the gates.
2. **P3-T24 (the notice bump to 2).** `ai-gate.test.ts:40` and `:77` hard-code `notice_version: 1`, as do `ai.test.ts`, `ai-uses.test.ts` and `ai-routing.test.ts`; the bump must update this file too.
3. **App tasks (P3-T14, T17, T20, T21; P6B-T15).** While `ai` is paused: parse and note are 503 (Tell Bun already falls back to the phone's rules on any error, `TellBunSheet.tsx:145-148`); `BunNote` calls the note route even for a person with AI off (`BunNote.tsx:28-43`: it only keys its cache on `enabled`, and drops a failure silently), so during a pause the Home note is absent for everyone, not only for people using Bun (the receipt says "no note on any failure"; this is the wider reach of it); preferences stay 200 with `available: false`, and a withdrawal saves. `AiCompanionProvider.tsx:63` (and `aiConsent.ts:38`) set the `ai_enabled` common property to `companion && available`, so every event reads `ai_enabled: false` for consenting people during a pause: a dashboard that reads it as adoption will dip with every pause.
4. **P6C (runbooks and `config:v1` tooling).** (a) A scope name outside `EDGE_GATE_SCOPES` fails the whole config closed, all six scopes for 30 s (probe B4 and B5, and the repo's third config case): `"AI"` or `"ai "` would stop writes, not only Bun, so any tool that writes `config:v1` (P6C-T6's `kv-seed`) should validate scope names against `EDGE_GATE_SCOPES` first. (b) A pause is not instant: Cloudflare's KV docs say a changed value can take up to 60 seconds or more to show in other locations (the Worker reads with the default `cacheTtl` of 60 s, minimum 30), so an incident runbook should say so, for pausing and for resuming. (c) The deploy order and rollback rule of focus item 7, and n3. (d) `docs/operations/incident.md` still lists only the API's five scopes and `OPERATIONAL_PAUSE`; the edge's switch is `config:v1`, and `OPERATIONAL_PAUSE=ai` on the retired NestJS API would stop its startup.
5. **If a pause is ever used to shed load,** n4: the body read happens first; moving the gate ahead of it is a handler decision with the API's parity order against it.

VERDICT: Approved

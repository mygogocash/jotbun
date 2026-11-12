# P3-T6 second review: Haiku first, and AI results that name their model

Reviewer: Claude Sonnet 5.5, the independent second reviewer (model routing, deadlines, privacy). Read-only: no edit, commit or push in any worktree, and the main checkout was never touched. Every probe ran in a `git archive` copy of the commit under `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p3-t6-second/tree`, with a link-farmed `node_modules` so `@gogospend/contracts` resolves inside that copy. After the mutant runs I compared the changed sources to the worktree with `cmp`: identical. The worktree is at `8b528df1` with a clean `git status`.

Target: PR #428 (`mygogocash/jotbun`), commit `8b528df1` on `p3/t6-haiku-first`, range `origin/claude/p1a-vault-core...8b528df1` (merge base `150cfb82`, 21 files). I wrote every finding below before opening any other review of this task.

## Summary

No blocker and no major. The three review focuses hold for the code as shipped, and I checked each one with a run, not only by reading:

1. The model on a result is the tier whose words are shown. All eight route and `source` variants, captured from real workerd runs, pair correctly, and the phone accepts every one.
2. Every route answers at its deadline when the model stalls, including with the real Anthropic transport and a body that stalls after the headers. Ask Bun's turns share one window.
3. The PR adds no log or analytics call. The one AI log line is the existing `logFailure`, and under hostile failures it wrote only a feature and a class name.

Two minor findings (one is a missing regression test for the log invariant, which three of my mutants slipped past) and four nits follow. Notes for P3-T7 to P3-T10 and the release are at the end.

## CI (R100)

Run 43140748908 on head `8b528df1` (`gh pr checks 428`, job logs): attempt 3 is green on all nine jobs.

- Edge Worker job: `typecheck:edge` passed; `test:edge` 19 files, 195 tests (includes `contracts-ai.test.ts`, 3); `test:edge:workers` 33 files, 792 passed and 1 todo (includes `ai.test.ts` 43 and `ai-routing.test.ts` 7); the edge database suite 3 files, 12 tests; `build:edge` passed.
- Typecheck, unit, API, build: API jest 47 suites, 1,000 tests; `test:app` 35; `test:unit` 1,039.
- Render (every file but the per-section suites): 119 files, 1,475 tests. The three per-section render jobs and the exports (web and iOS) passed. The release image smoke passed.
- SQL integration and ops: attempt 3 green (41 suites, 694 tests). Attempts 1 and 2 failed in this job at `npm run test:db`, both times in `apps/api` `src/attachments/attachments.integration.spec.ts`, "two records retaining one image at once keep one receipt, made by one copy" (expected 1 write, received 2). That is a timing-sensitive attachments test, and no file of this PR touches it. I count it a CI flake; the controller may want it tracked.

## Review Focus 1: the model named is the model whose words are shown

- Reading `apps/edge/src/v1/ai/service.ts`: every successful return is `...BY_HAIKU` (Haiku's own drafts, note text, slip read or answer) or `...BY_RULES` (the rules' draft, the plain facts, the figures). `message.model` is read only by the trace (`transport.ts:177`), never by a result. `escalated` is a literal `false` in both constants and in the four `tracedSend` calls; no Opus path exists in this PR.
- Real bodies: probe `zz-probe-bodies.test.ts` (workerd, `logs/probe-bodies.log`) printed parse ai and rules, note ai and facts, slip ai and an empty read, ask ai and facts. Every `ai` body says `claude-haiku-5-5`, every `rules` or `facts` body says `rules`, all say `escalated: false`, although the fake model's own `message.model` was `claude-opus-5-5` throughout.
- The phone's validators accept all eight bodies (`zz-probe-crossvalidate.test.ts`, `logs/probe-crossvalidate.log`), so the exact-key change and the server output agree.
- Mutants Y1 (a grounded Ask Bun answer names `rules`), Y2 (a Haiku note drops `escalated`), planner S2 (names `message.model`) and S5 (Haiku says `escalated: true`): all killed.
- On the definition of `escalated`: I applied H4 ("true when an Opus call ran") and the plan's P3-T6 line ("every result says `escalated: false`"). The dispatch's paraphrase, "true exactly when the first model did not answer", differs from H4 in two later cases: a rules answer after Haiku failed (false under H4, since no Opus ran) and an Opus call that ran and failed after a Haiku draft (true under H4). This PR cannot produce either, so both readings give `false` here. P3-T8 and P3-T9 must choose one and pin it (see notes).

## Review Focus 2: no route outlives its deadline, every hang ends on the server first

- Reading: `start()` (`service.ts:263-266`) makes one trace and one `AiDeadline` per request, first thing in each method, on the service's clock. `tracedSend` (`transport.ts:134-163`) gives each call `min(remaining, capMs)` and refuses a call when under 2 s is left. The real transport sets both the SDK timeout and `AbortSignal.timeout` (`transport.ts:37-42`). Ask Bun's turns share one child deadline made once before the loop (`service.ts:220`).
- Production cannot shorten a deadline: `aiDeadlines` is read only from `V1Deps`, and the only production callers, `src/routes/v1/$.ts:10` and `src/vault-worker.ts:33`, pass no deps. `handler.ts:133` is the only `WorkerContext` built, and it passes the option on.
- Probe 1, `zz-probe-hang.test.ts` (`logs/probe-hang.log`): the real `anthropicTransport` inside workerd, three stalled fetches (never answers; headers then silence; a body trickling one byte every 200 ms), 2.5 s deadlines. Every route, for every stall, answered at 2,501 to 2,507 ms: parse 200 `rules`, note 200 `facts`, slip and ask 503 `AI_PAUSED`. The planner's hang case uses a transport that obeys `timeoutMs` by construction, so it shows the service hands over the right time; this shows the real transport ends a stall.
- Probe 2, `zz-probe-ask.test.ts` (`logs/probe-ask.log`): Ask Bun with turn 1 a scripted tool read and turn 2 a stall on the real transport, 3 s deadline. Result: 200, `source: 'facts'`, `model: 'rules'`, `escalated: false`, the figure kept, finished at 3,004 ms. The second call was given 2,996 ms, what was left of the one window, not a fresh one.
- Phone side: `phoneWait` sends `timeoutMs` and `deadlineMs` (`aiResources.ts:91`); the transport's per-attempt timer covers the whole response including the body (`client.ts:286-308`) and a refreshed resend honors `deadlineMs` (`client.ts:330,367`); nothing between the UI and the transport adds a timer (grep over `spend/v1/ai`, `screens/redesign/ai`). The app's shared transport sets no `timeoutMs` (`sharedV1.ts:46`), so before this PR every AI route waited 20 s on the phone against a 25 s server deadline; now each route outwaits itself.
- Mutants killed: Y3 (slip on Ask Bun's 55 s), Y4 (an outage with no figures answers 200), Y5 (the 2 s floor is 0), Y8 and Y9 (slip and Ask Bun start their deadline after their first vault step), planner S7, S10, S11, S12, W2, A3. See n1 for the one claim in the contract that the code does not make good.

## Review Focus 3: no prompt, model words or user text in a log or event

- The diff adds no logging or analytics call: a search of the added lines for `console.`, `logFailure`, `track*`, `analytics`, `posthog` finds nothing. The only AI log line is the existing `logFailure` (`service.ts:303-306`): a feature and either `ModelUnavailable:<reason>` or `failureName(error)`, which prints a class name (plus a safe code) and never a message (`apps/api/src/common/operational-metrics.ts`, `describeFailure`).
- The implementer's GREEN workers log has 20 `ai_fallback` lines, all feature plus class (`DeadlinePassed`, `Error`, `ModelUnavailable:refusal`, `ProblemException`).
- My probe `zz-probe-logs.test.ts` (`logs/mut3/YL0.log`): six hostile failures whose messages carry the person's sentence and a marker string, through all four routes, wrote 20 console lines, each exactly `{level, event: "ai_fallback", feature, failure}` with a class name. Four successful replies whose words carry the marker wrote 0 lines. The marker appears nowhere. H8 holds.
- The invariant is not pinned by the PR's tests: see m1.

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. No test pins what the AI routes log; three log-leak mutants survive the PR's own workers files.**
- Where: `apps/edge/src/v1/ai/service.ts:303-306` (`logFailure`); tests `apps/edge/test/workers/ai-routing.test.ts` and `ai.test.ts`.
- Evidence: Y10 (the `ai_fallback` line carries the error message, not its class), Y11 (the note's model words are logged) and Y12 (the person's sentence is logged before the parse call) all SURVIVED both files (`logs/mut2.out`). Nothing under `apps/edge/test` spies on the console for the AI routes. My probe (above) passes on the commit and fails on Y10, Y11 and Y12 (`logs/mut3.out`), so it is a sufficient guard.
- Why it matters: Review Focus 3 and the plan's Global Constraint "Logging: `logFailure` with `failureName` only" are enforced today only by a reader. This PR sends new failure classes (`DeadlinePassed`) down that line, and P3-T7 to P3-T10 will add more.
- Suggested fix: add the probe's two cases to `ai-routing.test.ts` (`startV1`, a hostile transport, `vi.spyOn(console, ...)`, the pattern `exports.test.ts` already uses), or carry them to P3-T10 before `$ai_generation` is wired. No shipped behavior is wrong, so this does not hold the merge.

**m2. A result whose `source`, `model` and `escalated` disagree is accepted by the phone and by the types, so "the model whose words are shown" rests on the server alone.**
- Where: `apps/app/src/spend/v1/ai/aiResources.ts:57` (`namesItsModel` checks membership and a boolean only, planner ruling P12); `packages/contracts/src/v1/ai.ts:136,139,167,172` (`source` and `model` are independent unions).
- Evidence: `zz-probe-crossvalidate.test.ts`: `{ source: 'ai', model: 'rules' }` and `{ source: 'rules', model: 'claude-haiku-5-5', escalated: true }` both pass `isAiParseResult`. The server does not produce either today (all eight real bodies pair correctly).
- Why it matters: the dispatch calls the model shown a user-facing truth. P3-T18 and the Ask Bun and slip screens will read `model`; a future server bug or a stale server would then show a false claim rather than a refused result.
- Suggested fix, before the model is shown or reported: make the results a union (`source: 'ai'` with `claude-haiku-5-5 | claude-opus-5-5`, `'rules' | 'facts'` with `'rules'`) so a wrong `BY_HAIKU` or `BY_RULES` spread fails to compile in `service.ts`, and have `namesItsModel` check the same pairing, plus `claude-opus-5-5` implying `escalated: true`.

### Nit

**n1. The contract says more than the code does about vault steps.** `packages/contracts/src/v1/ai.ts:33-37` says "every vault step and model call of one request ends inside it". Only model calls are bounded (each gets what is left, with a 2 s floor). Vault steps are awaited unbounded: Ask Bun's `ai.tool` steps after the last call (`service.ts:232-243`), and P3-T7's coming `ai.refund`. The 5 s margin (15 s for a slip) is what covers them. The planner's cases pin that steps count against the deadline (S7, S8, the fake-clock rows), and none claims one is cut short, which is right. Reword the comment: no model call starts after the deadline and each ends by it; steps count against it but are not cut short.

**n2. The hang case's bound leaves 1.5 s of slack for four sequential routes under CI load.** `ai-routing.test.ts:139-148` asserts each route under 4,000 ms against a 2,500 ms deadline. Its own transport caps a hang at 6,000 ms, so a route that ignored its deadline would take at least 6,000 ms; a 5,000 ms bound catches that just as well with 1 s more room. It passed in CI (the whole case took about 10 s).

**n3. `haikuRequest`'s effort argument is dead for parse, slip and note.** `service.ts:118-119, 143-144, 188-189` spread `haikuRequest('low', ...)` and then set their own `output_config: { effort: 'low', format }`, which wins. Y17 (parse calls `haikuRequest('high', 8_000)`) SURVIVED; the control Y18 (`8_000` to `16_000`) was killed, so `max_tokens` is pinned and the effort argument is not. Pass the effort once, for example `output_config: { ...base.output_config, format }`, or drop the argument.

**n4. `apps/edge/src/server/env.ts:32` still types `AI_MODEL?: string`** (`EdgeSettings`, planner ruling P10; the receipt lists it as clean-up). Nothing reads it, so an operator who sets it sees no effect.

## What I checked and found fine

- Haiku's request base against the Claude API docs (the `claude-api` skill, "Migrating to Claude Haiku 5.5"): `claude-haiku-5-5`; `output_config.effort` `low` to `max` (default `medium`); no `fallbacks` (a list is a 400, `"default"` leaves a decline declined); sampling parameters and an assistant prefill are 400s; thinking is on by default, so content must be read by type (`finishedText` filters `text` blocks, `apps/edge/src/server/ai/model.ts:17-24`) and thinking counts toward `max_tokens` (8,000, 4,000 and 12,000 leave room at effort `low` and `medium`). Ask Bun echoes the assistant content unmodified and keeps the conversation append-only (the history-editing check). I made no API call (protocol), so Haiku's image input is not independently confirmed; the guide's Haiku section does not restrict it.
- Opus's base keeps the fallback beta and `fallbacks: 'default'` (pinned by `contracts-ai.test.ts`; unused until P3-T8 and P3-T9). Mutant Y16 (an assistant prefill on Ask Bun's first turn) is killed, and the fake model records `structuredClone(params)`, so the no-prefill assertion sees each call as sent.
- The privacy case for prompts (account, session, vault id, balance) now runs on every Haiku route, and the prompt text itself is unchanged.
- The four fixture files outside the plan's list are type-only and keep correct pairings (`rules` with `facts` and `rules`, Haiku with `ai`). `AI_MIN_CLIENT_VERSION` is `0.2.0` and `app.json` is `0.2.0` (`aiClientVersion.test.ts`), so this build carries the validators. No stale `AI_MODEL` or model name remains in app copy or operations docs. `git diff --check` is clean.

## Mutants and probes

Heavy lock taken around every run and released after (also after a failure); I never removed a lock I did not take. Nothing under `/private/tmp` is kept by me.

| Id | Change | Result |
| --- | --- | --- |
| Y1 | Ask Bun's grounded Haiku answer says `rules` | killed |
| Y2 | a Haiku note drops `escalated` | killed |
| Y3 | slip runs on Ask Bun's 55 s | killed |
| Y4 | Ask Bun outage with no figures answers 200 | killed |
| Y5 | the 2 s floor is 0 (`transport.ts`) | killed |
| Y8, Y9 | slip, Ask Bun start their deadline after their first step | killed |
| Y10, Y11, Y12 | log the error message, the note's words, the person's sentence | SURVIVED (m1) |
| Y16 | assistant prefill on Ask Bun's first turn | killed |
| Y17 | effort argument `'high'` in parse | SURVIVED (n3, equivalent) |
| Y18 | parse `max_tokens` 16,000 (control) | killed |
| S2, S5, S7, S10, S11, S12, M1, W2, A3, A7 | the planner's, a sample of 10 of 30 | all killed |
| YL0 | my log probe on the commit | passes |
| YL10, YL11, YL12 | the probe on Y10, Y11, Y12 | probe fails, leak caught |

Scripts and logs: `mut2.py`, `mut3.py`, `mut4.py` and `logs/` under `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p3-t6-second/`; probe sources `tree/apps/edge/test/workers/zz-probe-{hang,ask,bodies,logs}.test.ts` and `tree/apps/app/src/spend/v1/ai/zz-probe-crossvalidate.test.ts`. I did not rerun whole suites (R100).

## Notes for later tasks

- **P3-T7 (refund):** `callFailure` classifies a body that stalls after the headers as `other`, so `shouldRefund` would not give that use back. In probe 1, with a fetch whose body stream errors on abort, `tracedSend` threw `DOMException/AbortError` and recorded `failure: 'other'` (`logs/probe-hang.log`, `PROBE-CLASS headers-then-silence` and `trickle`); a connect-time stall threw `APIUserAbortError` and recorded `timeout`. Map a `DOMException` named `AbortError` or `TimeoutError` to `timeout`, and test it. The stall is emulated; confirm against the real `fetch` when convenient.
- **P3-T8, P3-T9, P3-T18 (`escalated`):** settle whether `escalated` means "an Opus call ran" (H4) or "Haiku did not answer", and pin the two cases where they differ (Opus ran and failed after a Haiku draft; Haiku failed and the rules answered). Result `model` must stay the tier whose words show.
- **P3-T8:** `HAIKU_SLIP_CAP_MS` (20,000) is declared and not pinned by any test; pin it where `readSlipImage` first passes it. The slip's fake-clock row (30 s of steps, then 15,000 ms) stays true under the cap.
- **P3-T9:** keep the Opus escalation a fresh conversation (H7). Haiku 5.5 thinking blocks are account-bound and an edited history is a 400 for newer accounts, so never replay Haiku's blocks to Opus.
- **P3-T10:** add m1's cases before wiring `$ai_generation`, and keep `RecordedCall` free of prompt and answer content.
- **P3-T17 and P4 (slip margin):** the slip's 15 s margin is fixed, and the phone's timer starts with the upload. `AI_SLIP_MAX_BYTES` is 1,200,000, about 1.6 MB as base64, which takes about 26 s at 0.5 Mbps, so on a slow uplink the phone can give up before the server's 45 s deadline, with the use already spent. Only a slow upload plus a slow model hits it; consider an upload-aware margin for the per-slip import.
- **Release and P6C:** an older app refuses the new results (exact keys), so a release carrying P3-T6 needs the client minimum at or above `AI_MIN_CLIENT_VERSION` (`0.2.0`), as the receipt says. The worst-case wait on a hung call changes: parse 20 s to 15 s, note 20 s to 10 s, ask 20 s to 25 s (Haiku's cap), and the slip 20 s to 45 s until P3-T8 caps Haiku at 20 s (planner ruling P7).

VERDICT: Approved

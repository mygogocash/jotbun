# P3-T7 second review (money path, auth, privacy): A failed model call gives its use back

**Reviewer:** Claude Sonnet 5.5, independent second reviewer. I read the protocol (R87, R100, "Reviewers"), the plan task P3-T7 with its Global Constraints and H5, the brief, the receipt and the implementer's logs. I read no other review of this task before writing this one.

**Reviewed:** commit `088b346a` on branch `p3/t7-ai-use-refund` (one commit on `9e77a022`), range `origin/claude/p1a-vault-core...088b346a`, PR #435 (head SHA and CI run SHA both `088b346aa7e6efa04bc32469f67595ca8fb73a42`, state OPEN, MERGEABLE). The task worktree is clean at that commit and I changed nothing in it. Probes and mutants ran in two `git archive` copies (`tree`, `tree2`) under `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p3-t7-second/`, with `node_modules` symlinked from the worktree. Every mutated file was restored and compared byte for byte with `git show 088b346a:<path>` (14 of 14 identical). Workers runs held the heavy lock. Nothing was kept under `/private/tmp`.

## Summary

No blocker, no major.

- `ai.refund` is reachable only from `VaultAiService.giveBack`. No HTTP route, no client-facing table, no client field reaches its body.
- A request refunds at most once by construction, on the Bangkok day the vault counted, and a request refused at the day's limit never refunds.
- A phone dropping its request cannot earn a refund. I found no path from a client action to an `AbortError` in the model call's catch. What a person can do is make the model slow enough to hit a deadline, and H5 refunds that by design (measured below, accepted in the brief's P14).
- A failed refund is logged by class name and feature only and never changes the answer.

Three refund-path guards are not pinned by the task's tests: my mutants M1, M6 and M9 survive all 62 cases, and my probes kill each. They are minors that can ride with P3-T8, which adds the next call site of `giveBack`.

## CI (R100)

PR #435, run 43216210206: all nine jobs `success`.

- **Edge Worker** (typecheck:edge, test:edge, test:edge:workers, build:edge, test:edge:db): `test:edge` 196 passed (19 files, equal to the implementer's local `gate-test-edge.log`); `test:edge:workers` 804 passed, 1 todo (34 files); `test:edge:db` 12 passed (3 files). `ai-uses`, `ai-routing`, `ai.test`, `ai-transport` and `route-coverage` appear as passing in the log.
- **Typecheck, unit, API, build:** 47 API suites passed. **Render (every file but the sections):** 125 files, 1599 tests. **SQL integration and ops:** 41 suites. **Exports, Release image, and the three per-section render jobs:** success. No app file changed, so the render and export jobs are not exercised by this change.
- My own focused runs, in the scratch tree: `test/ai-transport.test.ts` 10 passed; `ai-uses` + `ai-routing` + `ai.test` 62 passed. These equal the implementer's GREEN and the receipt. I re-ran nothing whole (R100). `git diff --check origin/claude/p1a-vault-core...088b346a` is clean.

## The five focus points

### 1. Who can cause a refund

- Only `giveBack` (`apps/edge/src/v1/ai/service.ts:304-311`) names `ai.refund`. Its body is `{ feature, day }`, built from the route's constant feature and the vault's own `ai.consume` reply (`service.ts:289-293`). No client field flows into it.
- No way in from outside. `VAULT_V1_ROUTES` has no entry whose `vault`, `worker` or path mentions it; `vaultRouteOf('ai.refund')` is undefined and `stepRouteOf('ai.refund')` is `{ anySession: true }`. Every `.call(` site that builds a vault call uses a table id or a literal (`handler.ts:143`, `worker-routes.ts:77`, `service.ts:69`, `uploads.ts:35`, `downloads.ts:62,97,128`, `receipts.ts:50,57,147,186`). The helpers that take the id as a parameter (`uploads.ts:35`, `receipts.ts:49,108,134`) are called with string literals or typed unions of literals. `VaultRouteId` is edge-internal; no app or contracts file names `ai.refund`. Probes: `tree/apps/edge/test/probe-reach.test.ts` (Node, static) and `tree/apps/edge/test/workers/probe-reach.test.ts` (six POST paths through the real front door, signed in and not, all 404).
- P2 (`anySession: true`) is acceptable. It skips `assertSession` and `assertPolicyAccepted` (`vault/user-vault.ts:203-222`), but `ensureAccount` still refuses a deleted vault and an owner mismatch (`vault/session.ts:21-34`), and every AI route's first step (`ai.context` or `ai.facts`) is session-checked, so a revoked session cannot start a request. It is the sixth `anySession` step; the other five are the 1B-T5 import and receipt clean-ups (`imports.reservePart`, `.abort`, `.discarded`, `.bytesRetry`, `attachments.release`). It is pinned by the session-ended case (mutant S1 killed, and I re-ran it). See note 5 for 1C.
- Once per request: one `giveBack` per catch, none inside a loop (`service.ts:134, 169, 210, 264`). True by reading, **not pinned by any test** (m1).
- Never below what it spent: `UPDATE ... WHERE day = ? AND feature = ? AND uses > 0` (`vault/ai.ts:116-118`), and a request refused at the limit never counted a use, so it never calls the step.
  - Probe PA: every feature seeded at its limit, so parse, slip and ask answer 429 and note answers plain facts. Zero `ai.refund` calls, the model never asked, rows unchanged.
  - Probe PC: twelve concurrent parses, six declined and six failed with 503, random 20 to 100 ms delays. Six refund calls, the count ends at six.

### 2. Can a person game the quota?

Short answer: a phone drop cannot. Slowness can, by H5's design.

**Every source of an AbortError on the Worker's side:**

1. `AbortSignal.timeout(timeoutMs)` at `transport.ts:40`. It is the only signal the SDK is given: `request.signal` is read nowhere under `apps/edge/src` (grep). After headers it surfaces as a `DOMException` named `AbortError` (P9, new). Before headers it surfaces as the SDK's `APIUserAbortError` (already `timeout` at base) or `APIConnectionTimeoutError` (the SDK's own timer, same milliseconds). Both fire only at the call's own deadline.
2. `DeadlinePassed` when under 2 s remain (`sent: false`). The request never left the Worker.
3. Not sources: the incoming request's signal, `waitUntil` (not used on the AI routes), and the request-body read (it happens before `consume`).

**Probes in real workerd 1.20261019.1** (this repo's binary; scripts and logs in `.../p3-t7-second/probe/`):

- The repo's real `transport.ts` with SDK 1.2.0, bundled into a Worker, against a stand-in upstream (`run3.log`).
  - K1, headers then a stalled body, deadline 2.1 s: `DOMException`, name `AbortError`, `callFailure` is `timeout`, trace `sent: true, failure: timeout, latencyMs: 2104`. The same run with P9's branch removed from `callFailure` (`run4.log`) gives `other`. So **P9 is needed and works in workerd**, and the receipt's "not proven here, left to P6C" is proven locally.
  - K4, no headers before the deadline: `APIUserAbortError`, `timeout`.
  - A raw `fetch` with `AbortSignal.timeout` and a stalled body (S2, `run2.log`): `TimeoutError` DOMException. Both names are covered by `endedBySignal`.
- A client that drops mid-call (S1 GET, S5 POST with a body, K2 through the real transport; the client destroys its socket at 0.8 s and the model would answer at 4 s): the Worker is not aborted, the call completes at 4 s, no `AbortError`, no `request.signal` event. A drop after headers (S4): the catch ran only at the call's own timeout, as a `TimeoutError`.
- **Limit of that evidence.** Local workerd never surfaced a dropped TCP client, so these runs show only that nothing in this code aborts the call. For production:
  - This Worker is on compatibility date 2026-10-01 with only `nodejs_compat` (`apps/edge/wrangler.jsonc`), so `enable_request_signal` is off. Cloudflare's changelog (2026-11-02) says disconnects reach `request.signal` by default only from compatibility date 2026-11-17.
  - Cloudflare's docs say outstanding work "may be canceled" when the client disconnects (limits and subrequests pages), and the tail docs define the `canceled` outcome as an invocation cancelled before completion, commonly by a client disconnect. In workerd issue 3033 a workerd maintainer describes subrequests as "canceled implicitly" when nothing keeps the request alive with `waitUntil`. I found no page describing a rejection delivered to user code. (I read these pages through a fetch agent, not directly; treat the quotes as second-hand.)
  - So a drop cancels the invocation: no catch, no refund. The person pays a use for an answer they never get. That is a fairness gap, not a gaming path, and it is outside H5.
  - I could not prove this on the production edge. P6C should (note 3). If a drop is ever seen to refund, `giveBack` should also check that the incoming request is still live.
- **What a person can do: make the model slow.** Probe PD: four parallel parses whose model never answers (deadline 2.5 s) give four 200 rules answers in 2,507 ms, four `ai.refund` calls, and `remaining.parse` stays 30. This is H5's timeout rule working as written; the brief's P14 and the receipt accept it (B27, P6C alerts). Its bounds are the input caps (`AI_TEXT_MAX_CHARS` 200, `AI_QUESTION_MAX_CHARS` 300, slip image 1.2 MB, `AI_DRAFTS_MAX` 5), the per-call deadlines (parse 15 s, note 10 s, slip 45 s, ask 55 s) and the vault's per-minute budgets (`RATE_BUDGETS`: write 60 per session, read 120 per session, principal 360). See m3.

### 3. The day (P5)

- `consumeAi` returns the vault's Bangkok day (`vault/ai.ts:96-109`). The service carries it in `CountedUse`, the step parses it with `parseAiDate` (422 `INVALID_DATE` otherwise), and `refundAi` updates exactly that `(day, feature)` row. The plan's direct midnight case and the front-door midnight case hold it (V1, V5, R2, G8 killed; I re-ran V1, V5 and R2).
- A call that crosses midnight refunds the day it was counted on. A refund to the earlier day gives the person nothing on the new day (the new day's row is untouched), so it cannot be used to gain uses.
- Concurrency: the vault runs each step in one synchronous transaction, so interleavings are whole consume or refund steps. Probe PC above. A refusal at the limit rolls the count back inside the call's transaction (`consumeAi` throws), so the 31st request neither counts nor refunds.

### 4. P3 (class name and feature only, never changes the answer)

- The line is `{"level":"warn","event":"ai_refund_failed","feature":<feature>,"failure":<failureName(error)>}`, the same shape as the service's `ai_fallback` line. `failureName` never prints a message (`apps/api/src/common/operational-metrics.ts`, `describeFailure` with `withMessage: false`; a `code` is appended only when it matches the safe-code pattern). I read the actual lines in the runs: only `ProblemException` (the task's case) and `Error` (my probe PK).
- The refund body and the log carry no amount, name, note, slip or session identifier. No wallet, points or payment code is touched.
- Never changes the answer: the task's case covers a handler that fails. My probe PK covers the other shape, where the vault call itself rejects (a patched `UserVault.prototype.call`): 200 rules answer, use spent. That guard is not pinned by the task's tests (m2).

### 5. P4 (the refund runs on the catch paths only)

- parse, slip, note, ask: every failed model call throws out of `tracedSend` into the route's catch, where `giveBack` runs before the answer. After an answered call (decline, empty or ungrounded answer, `ModelUnavailable`, five exhausted ask turns) the last call has `failure: null` and nothing is refunded. Probes PH (slip, note and ask declines spend) and PI (400, 413 and 408 spend), plus the task's decline and ungrounded cases.
- Paths that end without a model answer after a refundable failure and do not refund, in this commit: none. `logFailure` rethrows a non-500 `ProblemException` before `giveBack` (a vault refusal at an `ai.tool` step), but the last call on that path answered. Known and carried: P3-T9's `askWithEscalation` (the receipt names it) and P3-T8's `SlipNotRead` (the plan's text covers it).
- Between `consume` and its `try` nothing can throw (slip and parse: nothing; ask: three pure expressions), so no counted use escapes the catch. In `note`, `consume` sits inside the `try`, and the `if (use)` guard is an equivalent mutant (n2).

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. Nothing pins "one request refunds once."**

- Evidence: my mutant M6 (`giveBack` runs the `ai.refund` step twice) survives all 62 cases of `ai-uses.test.ts`, `ai-routing.test.ts` and `ai.test.ts`. Every refund case runs one request against an empty row, so the count ends at 0 whether the step ran once or twice (`refundAi` clamps at `uses > 0`). A second refund only shows when another use shares the row.
- My probes PB, PC and PD kill it (PB seeds the row with 5 uses, fails one request on each of the four routes, and expects 5 and exactly one `ai.refund` call per route).
- The code is correct today. It matters because "never push a day's count below what it spent" is the money invariant of this task, and P3-T8 and P3-T9 add new call sites of `giveBack` (the first places a second refund could appear).
- Fix: one case in `ai-uses.test.ts` that seeds a prior use and counts `ai.refund` calls through a wrapper over `VAULT_HANDLERS['ai.refund']` (the task's own G6 case already swaps that handler). PB is ready to copy.

**m2. Two more refund-path guards survive: ask's 503 path and a refund whose call itself rejects.**

- M1 (ask refunds only when it read figures): survives all 62 cases. The plan's case list has only "an ask that loses its second turn" (figures present), so the implementer followed the plan; the 503 path of ask (first turn fails, nothing read) is the one route path with no refund case. Probe PG kills it (first turn 500: 503 `AI_PAUSED`, `remaining.ask` 20).
- M9 (`giveBack` rethrows anything that is not a `ProblemException`): survives. The task's case scripts the vault handler to throw, which the vault turns into a 500 problem reply, so `step` throws `ProblemException` and the mutant's `instanceof` check passes. A rejection of `stub.call` itself (a Durable Object overload or reset, a network error) is the realistic shape. Probe PK kills it.
- The code is correct in both. Fix: add PG and PK to `ai-uses.test.ts`.

**m3. H5's timeout refund after billing is accepted, but its volume is invisible to operations.**

- Evidence: probe PD above. A timed-out call is refunded although the provider may have billed its input and part of its output, and the Worker cannot know. The comment on `GIVES_BACK` (`uses.ts:7`) calls these failures "nobody's doing", which is not quite true for a timeout that the person's own input caused (n1).
- A granted refund writes no log line (only a failed refund does). `ai_fallback` logs `failure: Error` for every SDK API failure, because the SDK's error classes keep `name` as `Error` (in my K4 run the thrown `APIUserAbortError` has `name: "Error"`), so 429, 5xx and most timeouts look the same (`DeadlinePassed` sets its own name and is the exception). The provider-side spend alerts that the receipt names as the guard (P6C) cannot be matched to refunds.
- Not a defect against the plan (H5, P14, B27 and the Global Constraints, "Logging: `logFailure` with `failureName` only"). Two optional hardenings for the owner, both small:
  - Log one line per granted refund with `feature` and the last call's `CallFailure` (a fixed six-value enum, safe by construction). This needs a ruling on the Logging constraint.
  - Cap refunds per feature per day, so that free retries have a bound beyond the request budgets.

### Nit

**n1.** `uses.ts:7`: "The failures that are nobody's doing". A timeout can be the person's doing (a prompt that makes the model slow, a very dense slip). Suggest "failures the person is not charged for".

**n2.** `service.ts:210` (`if (use) await this.giveBack(...)`) is an equivalent mutant: my M8 (guard removed) survives the task's tests and my probes. When `consume` throws, no call was made, so `trace.calls` is empty and `shouldRefund` returns false before it reads `use`. The guard exists for type narrowing and the comment says so. No action; recorded so nobody chases it.

## Mutants

**Planner's, sample of 10 of 35** (`mutants.py --only`, run on my scratch tree): U2, U7, V1, V2, V5, R2, S1, G6, G10, T5. 10 of 10 killed by assertions, none unrestored (`mutants-sample.out`). The receipt's "35 of 35 killed" matches the implementer's `mutants.out`.

**Mine** (`mymutants.py`, nine, run on `tree2`; each first against the task's three workers files, then, if it survived, against my probe file):

| Id | Mutation | Task's tests | My probes |
| --- | --- | --- | --- |
| M1 | ask refunds only when it read figures (503 path never refunds) | survives | killed by PG, PB |
| M2a-d | slip, note, ask or parse calls the refund step directly, bypassing `shouldRefund` | killed (`ai.test.ts` "a failed call still counts"; parse also by the decline case) | not needed |
| M6 | `giveBack` refunds twice | survives | killed by PB, PC, PD |
| M8 | note's `if (use)` guard removed | survives | survives (equivalent, n2) |
| M9 | a refund failure that is not a `ProblemException` fails the request | survives | killed by PK |
| M13 | `ai.consume` marked `anySession` | killed (1B-T7 pin "a session signed out between the context step and the use is refused at the use") | not needed |

## Receipt and gate check

- RED and GREEN counts in the receipt match the logs: Node `2 failed | 8 passed (10)` then `10 passed`; workers `10 failed | 52 passed (62)` with 10 `AssertionError` and 0 other error types, then `62 passed`. The 12 cases are the plan's 7 (exact names) plus 5.
- Gate: both typechecks, `test:edge` (196, same as CI), `build:edge` and `git diff --check` all pass. Whole suites are recorded as CI, as R100 asks.
- Scope: the extra files (`transport.ts`, `ai-transport.test.ts`, `ai-routing.test.ts`, the contracts comment) are the three followups the brief carries (P9 to P11). The commit message and trailer match the plan and the model.

## Notes for later tasks

1. **P3-T8 (slip with escalation):** call `giveBack(s, use, trace)` on `SlipNotRead` before the 503, as the receipt says. That adds a second refund call site for slips, so land m1's once-per-request pin first or with it.
2. **P3-T9 (`askWithEscalation`):** it returns its facts answer after an outage without a catch, so it must call `giveBack` too. Add m2's PG case (ask 503 refund) when touching that path.
3. **P6C hosted smoke test:**
   - Drop a request mid-call against the deployed Worker. Expect the use spent, no `ai.refund`, and outcome `canceled`.
   - The stalled-body shape is already proven locally in workerd 1.20261019.1 with the real SDK (K1), so it need not be re-proven there.
   - Watch the `rejected` rate: a systematic 4xx (a bad key, a gateway that requires `AI_GATEWAY_TOKEN` while it is unset, a wrong model id, a request-shape bug) burns every person's day with no answer, because `rejected` spends the use by design.
4. **Any change that forwards the client's signal into the model call** (passing `request.signal`, or moving the compatibility date to 2026-11-17 or later together with `request_signal_passthrough`): `callFailure` reads `APIUserAbortError` (base) and any `AbortError` (P9) as `timeout`, so a phone drop would then earn a refund after billing. Today the only signal is the transport's own deadline, so the mapping is right. Before forwarding any other signal, make the transport decide by whose signal fired (for example, check its own `AbortSignal.timeout` signal's `aborted`) and have it throw `DeadlinePassed` for that case only. Today is 2026-11-12; the 2026-11-17 default changes nothing for code that never reads `request.signal`, per Cloudflare's changelog.
5. **1C (account deletion):** if the account gains a status between `active` and `deleted`, `assertSession` refuses on it but `anySession` steps skip that check, `ai.refund` included. Decide then whether a late refund write is acceptable (it only lowers a counter in a vault that is going away).
6. **P3-T10:** `RecordedCall.failure` now reads a stalled body as `timeout` (confirmed in workerd), so `$ai_generation` gets it right.

## What I did not verify

The production edge's behavior on a client disconnect (note 3); whether the provider bills a request the Worker aborts (H5 assumes it may); real Haiku latency under adversarial inputs (the caps in focus point 2 bound the exposure but I did not measure it); any database suite (Docker stopped, CI ran them).

## Evidence index

All under `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p3-t7-second/`:

- `tree2/apps/edge/test/workers/probe-refund.test.ts` (PA to PK; run log `probe-refund-2.log`), `tree/apps/edge/test/probe-reach.test.ts`, `tree/apps/edge/test/workers/probe-reach.test.ts` (`probe-reach.log`, `probe-reach-workers.log`).
- `mymutants.py`, `mymutants.out`, `mymutants/` (logs); `mutants-sample.out`, `mutants-sample/`.
- `probe/` (workerd probes): `run2.log` (S1 to S5), `run3.log` (K1 to K4, real `transport.ts` and SDK), `run4.log` (K1 with the base `callFailure`). `run1.log` is an invalid first attempt (the upstream was not up yet); ignore it.
- `base-node.log`, `base-workers.log` (my baseline runs), `ci-edge-job.log` (CI edge job log).

VERDICT: Approved

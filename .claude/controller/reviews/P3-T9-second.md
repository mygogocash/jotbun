# P3-T9 second review: Ask Bun asks Opus again in a fresh conversation

- **Reviewer:** Claude Sonnet 5.5, the independent second reviewer for the money path and privacy. Read-only: nothing was edited, committed or pushed in any worktree, and every probe ran in a scratch copy made with `git archive` (node_modules linked entry by entry, the workspace links re-pointed into the copy).
- **Commit:** `5cb1055e8aff59cc233012b56b7203c5fb2025b7` on `p3/t9-ask-escalation`, PR #461, base `claude/p1a-vault-core`, one commit on `fb6aa0bd`. After `git fetch`, the integration branch has moved only by controller state (six sync commits; none touches a file outside `.claude/`, so none touches this task's 20).
- **Range read:** `origin/claude/p1a-vault-core...5cb1055e`, 20 files, +1002 -147. All 20 are byte-identical to the planner's `real/` (cmp, 20 of 20). `git diff --check` is clean.
- **What I read:** the plan task, the Global Constraints, H3 to H7 and Review Focus 2 and 3, the brief (rulings P1 to P16), the receipt, every changed file, and, for P15 only, the P3-T7 reviews' PR3, PR4 and PK. I read no other review of this task.
- **Scratch:** `.claude/controller/scratch/p3-t9-second/` (logs, `probes/`, `mymutants.py`, `mktree.sh`).

## Summary

**No blocker and no major.** The escalation is built as the plan and the brief say, and it holds under what I threw at it:

- 28 front-door probes (workerd, scripted models, the day already holding 5 uses so that any over-refund shows) over every way an Ask Bun can end;
- 17 of the planner's 79 mutants (all six batches), all killed by assertions;
- 17 mutants of my own: 12 killed by the task's tests; 5 survive them, and my probes kill all 5.

Nothing changes what a person is charged or what a model is sent beyond what the brief says. Four minors and three nits follow; the one I would look at first is m1 (a figure's `scope` can carry a day that is no calendar date), because P3-T20 will build "see all" on it.

**CI has not run on this head.** See the next section. The verdict below is on the code; the merge has to wait for green CI, as the controller already plans.

## CI (R100)

- `gh pr checks 461`: all nine jobs `pending`. The run (`43429773211`) was created at 12:59Z and was still `queued`, with no job started, at 17:05Z.
- The controller's handover (13 Nov, 20:15) says GitHub Actions is blocked org-wide (the included minutes are very likely used up). So there is no whole-suite evidence for this head yet: the full workers suite, the full render suite and its sections, both exports, the database suites and `test:ops` have not run anywhere.
- My focused runs below do not replace them. Nothing in them suggests a problem outside the files I ran.

## What I ran

All in a scratch copy of `5cb1055e`; workers runs under the heavy lock (taken and released through the planner's `locked.sh`; I hold no lock now and kept nothing under `/private/tmp`).

| Check | Result |
| --- | --- |
| Workers: `ask-escalation`, `ai-uses`, `ai`, `ai-routing`, `slip-read` | 126 passed (5 files), the receipt's GREEN |
| Node edge: `ask-deadline`, `ai-grounding`, `contracts-ai`, `ai-transport`, `route-coverage` | 70 passed |
| Node app: `aiResources`, `aiClientVersion`, `clientVersion` | 6 passed |
| Render: `AskBunScreen` | 6 passed |
| `typecheck` (root), `typecheck:app`, `typecheck:edge` | all rc 0, 0 errors (edge includes my own probes) |
| Implementer's logs against the receipt | agree: RED 3 of 4, 6 of 46, 26 of 126; GREEN 4, 46, 126; 12 render files 130 tests; routes 4 files 17 tests; `ai-gate` 3; `test:edge` 227; `test:app` 37; `test:unit` 1110; mutant batches 11, 11, 11, 10, 13, 23 killed |
| Planner's mutants (17 of 79, every batch) | 17 of 17 killed by assertions, none unrestored |
| My mutants (17) | 12 killed by the task's tests, 5 survived them (all killed by my probes) |
| My probes | 28 at the front door, 2 in Node, 1 on the base commit |
| Skipped | database suites (Docker is stopped; CI), whole suites (CI), anything that needs a device or the real Anthropic API |

## The controller's focus, item by item

### 1. Refunds (P2, P6, R116)

**`giveBack` runs once after every answer** (`service.ts:228`, before the 503 is thrown at `:229`). My probe PS1 drives 13 endings with the day's row already at 5 uses and counts the vault's `ai.refund` steps and the row:

| Ending | Models asked | The route answers | `ai.refund` | Uses |
| --- | --- | --- | --- | --- |
| Haiku grounded | H H | 200, `ai`, Haiku, `escalated` false | 0 | 6 |
| Haiku ungrounded, Opus grounded | H H O O | 200, `ai`, Opus, `escalated` true | 0 | 6 |
| Haiku cut short, Opus grounded | H O O | 200, `ai`, Opus | 0 | 6 |
| Haiku ungrounded, Opus declines | H H O | 200, `facts`, `rules`, `escalated` true, Haiku's figure | 0 | 6 |
| Haiku declines, Opus declines, no figures | H O | 200, could-not-find line, `escalated` true | 0 | 6 |
| Haiku ungrounded, Opus 529 (a figure read) | H H O | 200, `facts`, `rules`, `escalated` true | 1 | 5 |
| Haiku ungrounded (no tool), Opus 529 | H O | 503 `AI_PAUSED` | 1 | 5 |
| Haiku 429 on its first call | H | 503 | 1 | 5 |
| Haiku 400 on its first call (rejected) | H | 503 | 0 | 6 |
| Haiku tool turn, then a 500 | H H | 200, `facts`, `rules`, `escalated` false | 1 | 5 |
| Haiku declines, Opus 400 (rejected) | H O | 503 | 0 | 6 |
| Haiku declines, Opus 500 | H O | 503 | 1 | 5 |
| Five tool turns on each model | H x5, O x5 | 200, `facts`, `rules`, `escalated` true | 0 | 6 |

Every 200 passes the phone's `isAiAskResult`, and `remaining.ask` is 20 minus the uses in every row. A failed vault tool step (PS1b) never reaches Opus: at Haiku's first tool step it is 503 with the use spent (as the base did); in Opus's conversation it answers Haiku's figures with `escalated: true`, spent.

**R116 for every route.** `shouldRefund` (`uses.ts:21-25`) refunds a never-sent last call only when no earlier call answered.

- **Ask Bun:** a billed turn followed by turns the deadline never lets start is spent (PR4's rebuilt case; planner's U1 to U4; my Y8). When nothing was ever sent, it is refunded (PS3: a 1.5 s deadline gives the could-not-find line, 0 calls sent, one refund, `remaining.ask` 20).
- **Parse and the note are unchanged.** Each makes one call, so an unsent last call has no earlier call. PS3 with 1 s deadlines: parse answers by the rules, the note by the plain facts, 0 calls sent, both uses refunded.
- **The slip reach is as the controller accepted it.** "Haiku answered, Opus never started" is now spent (the second P3-T8 review's PC2, pinned with a 4 s deadline). In production it needs more than 23 s of vault steps: the route's 45 s, less Haiku's 20 s cap, leaves Opus at least 25 s less the steps. P4's per-slip deadline has to keep that room, as the receipt says.

**Does any path refund after a billed answer?** Yes, three, none new in kind; R116 closes only a fourth:

1. A Haiku tool turn answers, then a later Haiku call fails with 429, 5xx, timeout or no connection: plain figures, `escalated` false, refunded (row "tool turn, then a 500").
2. Haiku is ungrounded, declines or ends unfinished, then Opus fails the same way: refunded (rows "Opus 529" and "Opus 500"). This is Review Focus 3, and the receipt's risk note names it.
3. A Haiku call that is sent and then cut by Haiku's own 25 s cap while in flight reads as a timeout: no Opus, plain figures, refunded after the billed turns before it. I confirmed it in Node (PS7). It is H5 and H7 as written, but it is the same slow-input lever R116 was ruled to close, still open in its in-flight flavour. See m2.
4. R116 closes the flavour where the next turn could not start: that is spent.

**Does any path spend a use when no model answered?** Only an API rejection (another 4xx on a call), as A14 says (rows 400 and "Opus 400"), and a failed vault tool step after a billed tool turn (a model did answer there). Neither is new.

**No path refunds a model's words.** A grounded answer's last call has `failure: null`, so `shouldRefund` is false; rows 1 to 3 and the "ten turns" row show 0 refunds.

### 2. D28's escalation (`ask.ts`)

- **Haiku within 25 s** (`ask.ts:119`, a child deadline): the Node case sees the first Haiku call given 25,000 ms and Opus 31,000 (P4, K29 killed).
- **A fresh Opus conversation** (`ask.ts:61-67`, `:122`): the first request has one message equal to Haiku's first, the same `system` and `tools`, Opus's own base and no thinking or sampling; Opus's second request is its own tool turn only (the plan's first case; P1, K14 to K19 killed; PS2 adds the exact key sets of both requests).
- **An outage never goes to Opus** (`:121`; P2 killed). Haiku 429, 500 and a tool-turn 500 all stop at Haiku (PS1).
- **A failed vault step never escalates** (`:83-90`; K11, K12, Y12 killed; PS1b).
- **A turn that never started is `no_answer` and escalates** (`:75`; K1 killed). **When no model can be asked in time** the answer is the could-not-find line with the use given back, 200, nothing sent (PS3), as the receipt's second risk says. See n2 for its wording.
- **`escalated` means it went to Opus** (P7): true on the plain-figures answers after Opus and false after a Haiku outage (K25, Y2, Y11 killed).

### 3. What each model is sent; logging (P5)

PS2 scripts both conversations and reads the whole wire:

- Neither model receives the wallet name, a merchant, a note, the opening balance (`100000`, `฿1,000`), the account, session or vault id, the client string, `metadata` or a user id. The top-level keys of Haiku's request are exactly `max_tokens, messages, model, output_config, system, tools`, and Opus's the same plus `betas, fallbacks`.
- Both see the question; nothing of Haiku's words or tool ids reaches Opus (`฿999` and `toolu_haiku` absent from both of Opus's requests). Opus's second request is `user, assistant, user`.
- Across both scenarios (an escalation with an Opus outage, and a Haiku outage) every console line is free of the question, the answer text, names, notes, `฿`, amounts and ids. Our `ai_` lines carry exactly `event, failure, feature, level`, with a class name only (`Error`, the SDK's name for API errors).

The first message is the route's earlier one byte for byte (P11). Its content is not pinned by a test (m4, Y3 and Y4).

### 4. The figures (P8, P9)

- The vault's four tools give each figure its `count` and `scope` as P8 says (V1 to V10 in the planner's list; I ran V3; Y15 and Y16 killed). A category id that is none of the person's reads as every category, with `category_id: null` in the scope (the figures case, V3).
- The phone's `isAiAskResult` is exact on figures and scopes (A1 to A12; I ran A10; the test's accept and refuse rows are thorough). PS4 sends the real figures of all four tools, in `en` and `th`, through the phone's validator: all accepted.
- Client minimum: `AI_MIN_CLIENT_VERSION` is `0.2.0` (`contracts/src/v1/ai.ts:25`), unchanged, pinned by `aiClientVersion.test.ts` (passes). The receipt says an older app refuses the new answers and repeats the minimum for P6C. Day validity of a scope is m1.

### 5. The P3-T8 carries (P14)

- **The date guard and the `readOnce` catch:** `isRealDate` (`drafts.ts`) refuses `2026-10-32`, `2026-13-05`, `2026-00-10`, `0000-00-00` and `9999-99-99` without a throw (the Node case, D1). A Haiku date of `2026-10-32` or `0000-00-00` is flagged `date_guessed`, so Opus re-reads (two front-door rows pass); parse keeps the draft dated today with `date_guessed` (its case passes). The catch at `slip-read.ts:165` is reachable only with a context day that is no date, which R1 pins. See n1 for the catch's silence.
- **MO2** (an unusable, no-draft or unreadable Haiku answer, then an Opus 529: 503, two calls, `remaining.slip` 10): three rows pass; T2 killed.
- **One `draftChoices`** with its archived filters, used by parse and the slip read: the new slip case and the parse case pass; D2, D3, R5 and R6 are in the planner's list.
- **MC, MJ, MO3, MA:** T1, T5, T3 and T4 in the planner's list; T1 and T2 I ran (T2 killed).
- **The NaN-token clamp:** `counted` at `slip-read.ts` clamps a missing, negative or fractional count to 0; three rows pass; R2 killed.

### 6. P15: the rebuilt probes

- **PR3** (a first Haiku call fails with a 529, 503 `AI_PAUSED`, `remaining.ask` 20): rebuilt as `it.each([529, 500])`; it asserts the 503 body, one Haiku call and the full refund. My Y17 (the 503 path never refunds) is killed by it. It tests what the review meant.
- **PR4** (a billed turn, then a turn the deadline never lets start): the review's 3,500 ms and 1.8 s became 4,000 ms and 2.2 s, which leaves both Haiku's second turn and Opus's first unable to start. It now asserts R116's ruling (200, Haiku's figures, `escalated: true`, one call sent, `remaining.ask` 19) where the review recorded the refund. Same lever, the ruling's answer. It tests what the review meant.
- **PK** (the vault call itself rejects for `ai.refund`): rebuilt on `UserVault.prototype.call`, restored in `finally`; it asserts the 503, the `ai_refund_failed` line by class name and the spent use. S6 (the planner's M9) is killed. Workerd's "uncaught exception" line is expected. It tests what the review meant, for Ask Bun's route; the guard is the shared `giveBack`.

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. A figure's `scope` days are the model's own, checked for shape only, so `2026-02-30` reaches the phone.**

- **Where:** `vault/ai.ts:210-216` (`dates()` takes the `YYYY-MM-DD` pattern, `from <= through` and a finite span), producing the scope at `:256` and `:273`; `aiResources.ts:33` and `:88-90` (the phone's `DATE` is a pattern).
- **Evidence (PS5, front door):** a `spending_total` over `2026-02-01` to `2026-02-30` answers a figure labelled "1-30 Feb 2026" with `count: 0` and `scope.through: '2026-02-30'`, and `isAiAskResult` accepts it. The same for `2026-04-31` and for `2026-02-29` (2026 is no leap year). The reason: V8's date parser rolls a day up to 31 into the next month, so `Date.parse` is finite. The totals are right (the SQL compares text).
- **Why it matters:** H14 gives the scope to P3-T20 for "see all". The server validates record dates as real Gregorian dates (`validation.ts:106`, `:127`), so a scope day the server's own validators would refuse is a bad thing to hand a screen. A model writing "30 February" or "31 April" is a plausible slip.
- **Fix, small:** in `dates()` reject a day that is no calendar date with a `ToolInputError`, so the model sees an `is_error` result and corrects itself and no figure ever carries one; and, if wanted, round-trip the days in `isFigureScope`. It can ride with P3-T20. No money effect.

**m2. The 25 s cap splits a slow Haiku two ways, and the in-flight way refunds after billed turns.**

- **Evidence (Node probe PS7, fake clock):** with 12 s tool turns the third turn cannot start, Haiku ends `no_answer` and Opus answers (the task's case; given 25,000, 13,000, then Opus 31,000). With 10 s turns the third turn is sent with 5,000 ms and is cut in flight: a `timeout`, so `failed`, so no Opus; the answer is the two Haiku figures as plain facts with `escalated: false`, and `shouldRefund` is true, after two billed Haiku turns.
- **Reading:** this is what H7 ("a timeout never escalates") and the plan's `DeadlinePassed` to `no_answer` rule say, so the code conforms. But the cap is ours, not an outage, and whether Opus rescues a slow Haiku depends on where the cap lands. It also leaves the slow-input lever the P3-T7 reviews raised open in this flavour (R116 closes the other). The receipt's risk note covers only "after an ungrounded Haiku answer".
- **Fix:** a ruling, not a code change in this PR. Either leave it with the owner's refund-caps item (B27, P6C) and name it in the receipt, or treat a timeout in Haiku's capped conversation as `no_answer` while the parent deadline still has `MIN_CALL_MS` (then Opus is asked, and the refund follows from its answer).

**m3. No catch-all is left around Ask Bun's loop: an unexpected exception is now a 500.**

- **Where:** `ask.ts:70-76` and `:82-90` catch a failed model call and a failed tool step only; `service.ask` (`:209-231`) has no `try`. The base wrapped the whole loop in a catch that logged by class name, gave back an outage and answered the figures or 503.
- **Evidence:** the same probe on both commits, a model message with no `content`. The base answers 503 `AI_PAUSED` and logs `{"event":"ai_fallback","feature":"ask","failure":"TypeError"}`; the commit answers 500 `INTERNAL_ERROR` (the iteration at `ask.ts:80` throws) and logs no `ai_` line. The use stays spent on both (`remaining.ask` 19), so there is no money difference.
- **Reading:** the realistic triggers are a malformed provider reply or a future bug in the loop, both rare, and the handler counts the 500 as a Worker failure by class name, which is arguably the better signal. But the brief's P3 ruling names only the tool-step change, and the receipt does not mention this one.
- **Fix:** either wrap `askWithEscalation`'s two conversations so an unexpected throw is a `failed` outcome logged by class name (as before), or accept the 500 and say so in the receipt.

**m4. Five guards are open in the task's tests (my mutants survive them; my probes kill each).**

| Mutant | What it breaks | Task's tests | My probe |
| --- | --- | --- | --- |
| Y9 | a Haiku refusal after a tool turn no longer escalates | survives (only a refusal at turn 1 is run through the front door; the Node table pins the outcome, not the escalation) | PS6 `Y9`: killed |
| Y3 | the first message loses `locale` | survives (the first case pins that Opus's first message equals Haiku's, not what it holds) | PS6 `Y3, Y4`: killed |
| Y4 | the first message loses `today` | survives, as Y3 | PS6 `Y3, Y4`: killed |
| Y5 | only a 401 is thrown on from a tool step (`!== 500` became `=== 401`) | survives (`ai.test.ts` pins the 401; a 403 `ACCOUNT_UNAVAILABLE` mid-conversation is unpinned) | PS6 `Y5`: killed |
| Y1 | today's date is not an allowed number for grounding | survives (an answer naming the day, after a tool that allowed no date, is unpinned) | PS6 `Y1`: killed |

- All five lines moved unchanged from the base loop, and the base's `ai.test.ts` cases ran unchanged in my sample, so none of this is new. None is a code bug.
- Y3 and Y4 matter most: dropping `today` from both models' first message would make Ask Bun resolve "this month" blindly, and nothing would fail.
- **Fix:** copy the four probe cases into `ask-escalation.test.ts` (its helpers `person`, `ask`, `total`, `modelsAsked` and `remaining` are the ones the probes use). File: `scratch/p3-t9-second/probes/zz-second-t9.test.ts`.

### Nit

**n1. `readOnce`'s new `catch { return { kind: 'unusable' } }` (`slip-read.ts:165`) logs nothing.** With the date guard in place it can fire only for a context day that is no date, or for a future bug in `sanitizeDrafts`. A persistent cause would then show only as an Opus call on every slip. One `ai_fallback` line by class name would make it visible. The brief (P14) asked for the catch, not for a log.

**n2. The could-not-find line, when no model could be asked in time, says Bun looked and found nothing.** That path needs more than 53 s of vault steps (or a test's short deadline), and the use is refunded, so a retry works. The plan's rules produce the line (P4) and the receipt names the risk. If it is ever worth changing: when no call was ever sent, answer `{ paused: true }` (503, retry after 300 s), which tells the person the truth. Related: `escalated` is true there although no Opus call was sent (P7 as ruled; H4's text says "when an Opus call ran").

**n3. The receipt's third risk bullet is narrower than the behaviour.** It names an outage after an ungrounded Haiku answer. The same refund-after-billing follows an outage after a Haiku tool turn (row "tool turn, then a 500") and a cap cut in flight (m2). Worth one more clause.

## Mutants

**Planner's, 17 of 79** (`mutants.py --only`, on my scratch copy; each restored, `not restored []`): P1, P2, P3, P4, P5, K3, K10, K19, K29, S3, S4 (run twice), S6, U3, V3, R2, T2, A10. All killed by assertions. By batch: 1 (P1, P2, P3, P5, K3), 2 (K19), 3 (S3, S4, S6, U3), 4 (V3), 5 (R2, T2), 6 (P4, K10, K29, A10). The five of the plan's Step 5 are P1 to P5.

**Mine, 17** (`mymutants.py`, each run against the task's workers and Node files, then, if it survived, against my probe file; each restored, hash checked):

| Id | Mutation | Task's tests |
| --- | --- | --- |
| Y1 | today's date not allowed in grounding | survives (probe kills) |
| Y2 | a Haiku outage answers `escalated: true` | killed |
| Y3 | first message loses `locale` | survives (probe kills) |
| Y4 | first message loses `today` | survives (probe kills) |
| Y5 | only a 401 thrown on from a tool step | survives (probe kills) |
| Y6 | Haiku's grounded answer carries no figures | killed |
| Y7 | Opus's grounded answer carries Haiku's figures | killed |
| Y8 | an earlier sent call, not an answered one, spends an unstarted turn | killed |
| Y9 | a refusal after figures does not escalate | survives (probe kills) |
| Y11 | the could-not-find answer says `escalated: false` | killed |
| Y12 | a failed tool step also escalates | killed (the Node case) |
| Y13 | Opus's calls recorded on Haiku's model | killed |
| Y14 | the refund names today, not the counted day | killed |
| Y15 | a figure's count as text | killed |
| Y16 | a category row's scope type forced to expense | killed |
| Y17 | the 503 path never refunds | killed |
| Y18 | an escalated question never refunds | killed |

## Notes for later tasks

- **P3-T20 and P3-T21 (Ask Bun screens):** settle m1 before "see all" reads `scope`. A plain-figures answer can carry `escalated: true`, with or without an Opus call sent. `count` is null for a budget line and `scope` is null for a place's total and a budget line.
- **P3-T10 (`$ai_generation`):** both conversations' calls share one trace, Opus's marked `escalated: true`. A turn the deadline never let start is `sent: false` and so no event, though the result may still say `escalated: true`.
- **P6C (spend alerts, refund caps):** an escalated Ask Bun is now up to 10 model calls for one use (5 Haiku turns and 5 Opus turns at medium effort, up to 12,000 output tokens each). Refunds after billed calls stay uncapped on three paths (see the first focus item and m2). `AI_MIN_CLIENT_VERSION` 0.2.0 does not tell a build with the old figure validator from one with the new: the server's minimum has to be raised in the release that carries P3-T9, as the receipt says.
- **P4-T4:** the per-slip deadline must leave Opus at least 2 s after Haiku's 20 s cap, or a read whose Opus call never starts spends its use (R116, confirmed above).
- **Merging:** wait for green CI. This head has had no whole-suite run anywhere.

## Reproduce

- `bash .claude/controller/scratch/p3-t9-second/mktree.sh <dir>` rebuilds the scratch copy of `5cb1055e` (set `BASE_SHA` in `mktree2.sh` for the base). I removed the two trees when I finished, since their linked node_modules dangle once the worktree goes.
- Probes: `scratch/p3-t9-second/probes/zz-second-t9.test.ts` (copy into `apps/edge/test/workers/`), `zz-second-deadline.test.ts` (into `apps/edge/test/`), `zz-second-base.test.ts` (into the base copy's `apps/edge/test/workers/`). Run logs: `probe-1.log` to `probe-4.log`, `probe-node-deadline.log`, `probe-base.log`.
- Mutants: `python3 -I mymutants.py <tree> <log dir> <ids|all>`; the planner's sample logs are in `mutants/` and `mutants-sample-*.out`.

VERDICT: Approved

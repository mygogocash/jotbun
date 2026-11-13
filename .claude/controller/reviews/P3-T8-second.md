# P3-T8 second review (money path, privacy): Reading one slip with D25's escalation

**Reviewer:** Claude Sonnet 5.5, independent second reviewer. I read the protocol (R87, R100, "Reviewers"), the plan task P3-T8 with its Global Constraints and H4 to H7, the brief with the planner's rulings P1 to P18, the receipt, the implementer's logs and the followups notes that name P3-T8. I read no other review of this task before writing the findings below.

**Reviewed:** commit `53d24947` on `p3/t8-slip-escalation` (one commit on `2062b89a`), range `origin/claude/p1a-vault-core...53d24947`, PR #454 (head SHA `53d24947bb6f627f89aabc1e65c62a51c8d18281`, OPEN, MERGEABLE). I ran `git fetch` first. The worktree is clean at that commit and I changed nothing in it. All 16 files of the commit are byte-identical to the planner's `real/` (compared with `cmp`, none differ). Probes and mutants ran in one `git archive` copy under `.claude/controller/scratch/p3-t8-second/tree/`, with `node_modules` symlinked from the worktree. Every mutated file was restored and compared with `git show 53d24947:<path>` (identical). Workers runs held the heavy lock (`locked.sh`; `mutants.py` takes it itself). Nothing was kept under `/private/tmp`, and every locked run gave the lock back (`exit n; unlocked`); any lock present when I finished is another agent's.

## Summary

No blocker, no major.

- **Money.** `giveBack` runs once, in the slip route's catch, before the 503, and a shown read never reaches it. A 400 spends the use. A Haiku or Opus outage that ends with no read gives it back. I found no path that refunds after a read the person is shown. The three paths that refund after a call that was billed and answered or may have been billed are listed in focus point 1; each is by design (H5, A14, the plan's Review Focus 3) or known (the 20 s cap), and I call the cap case an accepted risk, not a defect.
- **Privacy.** Each model is sent the image and `{ today, locale, wallets: [{ id, name }], categories: [{ id, type, name }] }`, the same for both calls, with no balance, note or identifier. Nothing from the image is kept, and a slip no model read writes one log line, naming the feature and `SlipNotRead`.
- **Escalation.** `slipNeedsOpus` is the plan's list exactly, no more, and the read's order of outcomes, the bank, `escalated` and `declined` all behave as rulings P4 to P6 say. I checked each with a case or a probe.
- **Two minors.** (m1) A model date that is not a calendar date, such as `2026-10-32` or `0000-00-00`, makes `sanitizeDrafts` throw, so the read answers 503 and spends the use instead of going to Opus (probe PA, proven). The bug is old (`drafts.ts`), but D25's "date is implausible" row is this task's. (m2) Seven guards of the new code are held by no test (my mutants MA, MB1, MB2, MC, MJ, MO2 and MO3 survive the 94 focused cases, and probes show the code is right today).
- **CI.** All nine jobs pass on the reviewed commit, including the whole workers suite (36 files, 863 passed, 1 todo).
- **Verdict.** Approved. m1 is the one I would fix first (two lines in `readOnce` and one case); it can ride with a later task as set out under m1.

## CI (R100)

PR #454, run 43347295102 (`pull_request`, head SHA `53d24947bb6f627f89aabc1e65c62a51c8d18281`, the reviewed commit). **Final read at 09:19 Bangkok: the run is `completed`, conclusion `success`, all nine jobs `pass`.** Counts are from the job logs (read through the jobs API, since `gh run view --log` refuses while a run is in progress):

| Job | Counts |
| --- | --- |
| Typecheck, unit, API, build | `typecheck`, `typecheck:app` and `typecheck:routes` passed; `test:api` 47 suites, 1000 tests; `test:app` 37 of 37; `test:unit` 1109 of 1109; `test:dev` 7 of 7; the API build |
| Edge Worker (types, unit, workerd, build, PostgreSQL container) | `typecheck:edge` passed; `test:edge` 20 files, 206 tests; **`test:edge:workers` 36 files, 863 passed and 1 todo (864)**; `build:edge` built; `test:edge:db` 3 files, 12 tests |
| Render (every file but the per-section suites) | 131 files, 1696 tests |
| Render, per-section suites (three jobs) | 254, 192 and 236 passed (682 in all, each case run once) |
| SQL integration and ops | `test:db` 41 suites, 694 tests; `test:ops` 111 of 111 |
| Exports (web and iOS bundles) | `export:web` and `export:ios` passed |
| Release image and smoke | pass |

The controller's gate (the whole workers suite green) is met on the reviewed commit.

My own focused runs, in the scratch copy: `slip-read`, `ai-routing`, `ai-uses` and `ai.test` together, `Test Files 4 passed (4)`, `Tests 94 passed (94)` (the implementer's GREEN and the receipt); `aiResources.test.ts` through `scripts/test-unit.mjs`, `tests 3, pass 3, fail 0`. The implementer's logs agree with the receipt: RED `27 failed | 67 passed (94)` and Node `3 failed`; GREEN `94 passed` and Node `3 passed`; render files `12 passed (12)`, `130 passed`; routes `4 passed (4)`, `17 passed`; `test:edge` `20 files, 206 passed`; `test:app` 37 passed. I re-ran no whole suite. `git diff --check origin/claude/p1a-vault-core...53d24947` is clean.

## The focus points

### 1. Refunds and billing (P11, R116's neighbour, P3-T7's carry)

**The route** (`service.ts:151-167`): `consume` before the first call; `readSlipImage`; on any throw, `logFailure('slip', error)`, then `await this.giveBack(s, use, trace)`, then 503 `AI_PAUSED` with `retryAfterSeconds` 300. `giveBack` (`service.ts:301-308`) refunds only when `shouldRefund(trace.calls, false)` holds: the request's last recorded call failed with `rate_limited`, `server_error`, `timeout` or `no_connection`. `giveBack` sits only in the catch, so a request that returns a read, however it was reached, never refunds.

**Every path, with what pins it:**

| Path | Last call | Use | Pinned by |
| --- | --- | --- | --- |
| Haiku complete read | 200 | spent | case 1 (`remaining.slip` 9) |
| Haiku 429, 5xx, timeout, no connection | failed | given back, 503 | "an outage on Haiku" (529); `SlipNotRead` carries `server_error` and `timeout` |
| Haiku 400 | `rejected` | **spent**, 503, no Opus | "a slip the API rejects (a 400)" |
| Haiku past its 20 s cap | `timeout` | given back, 503, no Opus (H7) | the cap case; see item 1 below |
| Haiku draft that needs Opus, then Opus fails | failed | **spent**, Haiku's draft shown, `escalated: true` | "Opus failing after a Haiku draft keeps Haiku's draft" (`remaining.slip` 9) |
| Haiku declined, unusable or no draft, then Opus outage | failed | given back, 503 | for a decline only: "a Haiku refusal followed by an Opus outage" (two calls, `remaining.slip` 10, one log line). The unusable and no-draft rows take the same line (`slip-read.ts:95`) and are unpinned (m2, MO2); my probe PO shows 503, two calls and `remaining.slip` 10 for each |
| Haiku declined, unusable or no draft, then Opus 400 | `rejected` | spent, 503 | my probe PF (`calls` two, `remaining.slip` 9); same `SlipNotRead` line as the Haiku 400 |
| Opus answers, with or without a draft | 200 | spent | "an escalated read spends one use", "when Opus also finds nothing" |
| Haiku answered, Opus never started (under 2 s left) | `timeout`, `sent: false` | given back today | my probe PC2; see "Notes for later tasks", R116 |

**Does any path refund after a billed call that should spend?** Three do, none a defect:

1. **Haiku past `HAIKU_SLIP_CAP_MS`.** A timeout after a call Anthropic may still bill (I did not verify how Anthropic bills a call the client abandons). H5 and A14 refund a timeout by design, H7 keeps Opus out, and the receipt's risk note (`receipts/P3-T8.md:33`) says so, as followups line 736 required. **I read this as an accepted risk under the owner's open refund-caps item (followups line 747), not a defect.** A person chooses the image (at most 1.2 MB), and whether a dense image or a long receipt can reliably push Haiku past 20 s is unmeasured, so refunds that are uncapped today could be farmed by someone who finds such an image. The exposure is bounded, as P3-T7's second review measured for the other routes, by the input caps, the per-call deadlines and the vault's per-minute request budgets, and by B27 and P6C's spend alerts; the owner's open cap is the real guard. The cap itself is the product risk, not the money: a cap that is too tight turns a good slow slip into a refunded 503 with 25 s unused and no Opus. P3-T22's run should record Haiku's slip latency against 20 s (note 3).
2. **Haiku declined, unusable or no draft, then an Opus outage.** Haiku's call answered and was billed, and the use comes back. The plan's Review Focus 3 says exactly this ("after a Haiku decline, unusable or ungrounded answer, an Opus outage gives the use back").
3. **Haiku answered, Opus never started.** The 2-second floor skips the call, `shouldRefund` reads the last call as a `timeout` and refunds. R116 (Ask Bun's, P3-T9's) says a request where any call answered spends. With the constants as they are this needs more than 23 s of vault steps before the model calls, so it is not reachable today. See note 1.

No path refunds after a read the person is shown. A use is spent after a failed call in two cases only, both A14's: Haiku's draft is shown after an Opus failure, or the API rejected the request (a 400).

**"One request refunds once" on every route.** `giveBack` is called once per catch (parse `service.ts:139`, slip `:164`, note `:207`, ask `:261`), and `ai-uses.test.ts`'s new case seeds each row (5, 5, 1, 5), fails one request on each route and expects exactly one `ai.refund` call per route and the rows back at 5, 5, 1 and 5. My sample killed M6 (a second refund in `giveBack`) with it.

**A refund the vault fails never changes the 503 and is logged before the answer.** `giveBack`'s try/catch (`service.ts:303-307`) logs `ai_refund_failed` with `failureName(error)` and returns; the new `ai-uses` case fails `ai.refund` with a plain `Error`, reads the log immediately after the response (`failure: 'ProblemException'`, the vault step's wrapper) and then expects `remaining.slip` 9. My sample killed RV5 (the refund not awaited).

### 2. What each model is sent (P14)

- **The text turn** is `JSON.stringify({ today, locale, ...choices(ctx) })` (`slip-read.ts:137`). `choices` (`slip-read.ts:164-169`) is character for character the service's (`service.ts:318-323`): active wallets as `{ id, name }`, active categories as `{ id, type, name: label ?? builtin_key }`. It never sees a balance: `DraftContext` types wallets as `id`, `name`, `archived` only, and `choices` copies just `id` and `name`.
- **The same for both calls.** The first case asserts `opus.messages` equals `haiku.messages` and the systems are equal; the privacy case runs both calls and asserts that none of the account's `sub`, `sid`, vault id, client string `ios/1.0.0`, the opening balance `100000` and `฿1,000` appears anywhere on the wire (`JSON.stringify(model.calls)`).
- **Through the real transport** (`anthropicTransport` over a recording `fetch`), both requests carry `cf-aig-collect-log: false` and `cf-aig-skip-cache: true`, the gateway URL and the same image; only Opus's carries the fallback beta.
- **Nothing from the image is kept.** The base64 lives in `readOnce`'s `params` and the one transport call; the trace records only model, timings, status, stop reason and usage (`transport.ts:184-197`), and `SlipNotRead` carries only a failure enum. The case checks R2 under every vault prefix, `import_uploads`, `ai_usage` (exactly `[{ feature: 'slip', uses: 1 }]`) and that no console line carries any 16 characters of the image.
- **One gap:** the private `choices` copy's archived filters are held by no test (m2, MB1 and MB2). P14 says both copies are pinned; E35 pins only that choices are sent at all.

### 3. Logging (P12)

A slip no model read writes one line, `{"level":"warn","event":"ai_fallback","feature":"slip","failure":"SlipNotRead"}`: `describeFailure` prints the class name only (and a `code` when the error has one, which `SlipNotRead` does not). The `CallFailure` is not logged, `SlipNotRead`'s message holds only the enum (`No model read the slip (server_error).`) and is never logged, and no model text reaches any log. The case asserts the whole log array with `toEqual`. A failed refund logs `ai_refund_failed` with the feature and a class name (P3-T7's line, unchanged).

### 4. D25's escalation (`slipNeedsOpus`, E1 to E9)

- **Every trigger the plan names, and nothing more** (`slip-read.ts:68-76`): true for a decline, an unusable answer (truncated, not JSON, no or an unknown `kind`), no draft, any draft with `amount_minor === null`, any draft with a `date_guessed` flag, or a `slip` expense with `merchant === null`; false for a failed call. The table case has 13 rows, among them a guessed category and wallet (false), a receipt with no receiver (false), a slip income with no receiver (false), a rejected request (false) and a second draft with no amount (true). My sample killed E5 (receipt without receiver re-read) and E7 (only the first draft checked); by reading, no other flag is consulted.
- **A model-supplied `date_guessed` flag on a valid date also escalates** (probe PG: two calls, Opus's draft shown). The plan says "a `date_guessed` flag", so I count it as the plan's, not a gap.
- **A guessed category or wallet never escalates:** the front-door case and the table row; the planner's P1 guards it (I did not rerun it).
- **An income slip or a receipt without a receiver is not re-read:** the `it.each` case and the table rows; my sample killed E5.
- **The bank travels with the read shown (P4).** Probe PM: Haiku's draft has a null amount and bank `HAIKU BANK`, Opus answers `unreadable` with bank `OPUS BANK`; the result is `model: haiku`, `escalated: true`, `kind: slip`, bank `HAIKU BANK`, one draft. With Opus's draft, Opus's bank (case 2 and `SCB EASY`); with nothing from Opus, Opus's own unreadable read keeps its bank (the "when Opus also finds nothing" case, `toEqual` with `bank: 'K PLUS'`).
- **`escalated` (P5)** is `outcomes.length > 1`, so it is true whenever D25 sent the slip to Opus, whatever Opus did. Probe PC: Haiku takes 44 of 45 s with a null amount; Opus is never sent (`sent: false`, `failure: 'timeout'`, recorded `escalated: true`), and the read is Haiku's draft with `escalated: true`. That is what P5 says and the same line serves the tested "Opus failed" case.
- **`unreadable` always comes with no draft and `escalated: true`**, by the code's own paths: Haiku's reply with no draft triggers Opus, and an Opus decline or unusable answer after a Haiku with nothing becomes `{ kind: 'unreadable', drafts: [], bank: null }`. P3-T17's B3 rule can rely on it.
- **Order of outcomes** (`slip-read.ts:85-98`): a failed Haiku throws and Opus is not asked; no trigger returns Haiku's read; else Opus, and Opus's drafts win, else Haiku's, else a thrown `SlipNotRead` if Opus failed, else an unreadable Opus read. I traced every branch against the tests and my probes; the one branch a test misses is "Opus answered with no draft while Haiku has one" (MC, m2), and probe PM shows it behaves.

### 5. The deadline (P8)

`tracedSend` gives Haiku `min(remaining, 20,000)` and Opus the remaining deadline. The direct case runs a fake clock: Haiku is given 20,000 ms of 45,000, takes all of it, and Opus is given 25,000. The route's fake-clock case has the new row `['slip', 0, 20_000]` and the 30 s row still reads 15,000. A cap under 2 s makes no call and records `sent: false, failure: 'timeout', latencyMs: 0`, and a cap of 3 s is sent as 3,000. My sample killed E19 (Haiku not capped) and E21 (Opus not marked escalated in the trace), and the planner's batch killed E20, T1 and T2 by its own log. The phone waits 60 s for the slip route (`AI_PHONE_TIMEOUT_MS`) against a 45 s deadline, so an Opus timeout plus the refund step still answers inside it.

### 6. The contract (P18) and the fakes (P13)

- `AiSlipResult` gains `kind`, `declined` and `tokens`; `SLIP_KINDS` and `SlipKind` are exported. The phone's `isAiSlipResult` takes exactly the eight keys, `kind` in `SLIP_KINDS`, `declined` a boolean and `tokens` exactly `{ input, output }`, each a safe integer of 0 or more. The new case refuses nine bad shapes, and my sample killed A4. An older app refuses the new result (exact keys), so the client minimum is `AI_MIN_CLIENT_VERSION` = `0.2.0` (`packages/contracts/src/v1/ai.ts:25`); the receipt says so for P6C (`receipts/P3-T8.md:30`).
- **Does any render test now pass for the wrong reason?** No. A search of `apps/app/src` and `apps/app/app` finds no code that reads a slip result's `kind`, `model`, `escalated`, `declined` or `tokens`; the only consumer of a slip result is `TellBunSheet.tsx:170-172`, which reads `drafts` and `bank`. The fake's default changed only in those unread fields (`model: opus`, `escalated: true`, `kind: 'unreadable'`, zero tokens) and still answers `drafts: []`, so every flow that used the old default sees the same thing. The one scripted slip result with drafts (`TellBunSheet.render.test.tsx`) gains the three keys and nothing else. The default is also the safe one for P3-T17, since an `unreadable` read never keeps a photo.

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. A model date that is not a calendar date crashes the read, so D25's "date is implausible" row never reaches Opus.**

- **Probe PA** (`scratch/p3-t8-second/tree/apps/edge/test/workers/probe-t8-second.test.ts`, `probe1.log`). Through the front door, Haiku answers a complete slip whose date is `2026-10-32`, then `2026-13-05`, then `2026-00-10`, with a good Opus reply scripted behind it. Each run: status 503, `calls: ['claude-haiku-5-5']` only, `remaining.slip` 9 (the use is spent: the last call answered, so `giveBack` does not refund), and one log line `failure: "RangeError"`. D25 and `slipNeedsOpus` send an implausible date to Opus.
- **Cause.** `isRealDate` (`apps/edge/src/server/ai/drafts.ts:30`) tests the shape `DATE` (four digits, two, two) and then calls `new Date(...).toISOString()`, which throws a `RangeError` for a month over 12 or 00 and a day over 31 or 00 (`2026-02-30` rolls over and is caught by the comparison; `2026-13-45` throws). `sanitizeDrafts` calls it at `drafts.ts:90`. `readOnce` calls `sanitizeDrafts` outside any try (`slip-read.ts:158`), so the throw leaves `readSlipImage` and the route's catch answers 503.
- **How wide.** A fuzz of `sanitizeDrafts` (30 odd values in each of the nine draft fields and six odd whole replies; `scratch/p3-t8-second/fuzz-result.json`) found exactly four throwing inputs, all dates: `2026-13-45`, `2026-00-10`, `0000-00-00`, `9999-99-99`. Nothing else in a draft throws. `0000-00-00` is the placeholder a model may write when it cannot read a date, and the schema lets `date` be null while `SLIP_SYSTEM`'s date rule never says to use null.
- **Old, not new.** The base route and `parse` throw the same way (`parse` then falls back to the rules); this commit changes nothing there, so it is no regression. What it breaks is this task's promise: the plan's case list tests an implausible date only as "next year", a date that parses.
- **Harm.** The charge is right by A14 (a malformed answer spends). The loss is the missed re-read, and a misleading `AI_PAUSED` ("Bun is resting") that invites a retry which spends another use.
- **Fix, in this task's own file.** In `readOnce`, wrap `sanitizeDrafts` so that a throw returns `{ kind: 'unusable' }`; Opus then re-reads, and a second failure ends as unreadable. Also give `isRealDate` a `Number.isNaN(date.getTime())` guard in `drafts.ts` (shared with `parse`, which would then keep the model's draft with a `date_guessed` flag instead of falling back to the rules). Add a case: a Haiku date of `2026-10-32` and one of `0000-00-00` are re-read by Opus (it kills a mutant that removes the wrapper). I would land it with this PR if any fix round happens for another reason. Otherwise carry it to the next task that edits the AI service files (P3-T9) or to a one-line follow-up before P3-T22's run, which would count these as failed reads; P4-T4, which extends `slip-read.ts`, is the latest carrier.

**m2. Seven guards of the new code are held by no test.**

The planner's 64 mutants do not name these. My mutants (`scratch/p3-t8-second/my_mutants.py`) survive: MA to MJ ran `slip-read.test.ts` (the two choices mutants also `ai-routing.test.ts`), and MO2 and MO3 ran all four focused files. For each, a probe on the unmutated commit shows the code is right today, so these are test gaps, not defects. MO2 and MO3 are also in the first review (its m1 and n1), which I read only after writing my first pass; I then reproduced both with my own mutants and probes.

| Mutant | Change | What is unpinned | Probe |
| --- | --- | --- | --- |
| MA | `slice(first)` becomes `slice(0)` (`slip-read.ts:87`) | Ruling P6 and A16: `tokens` count this read's calls only. Every test uses a fresh trace, so `first` is always 0. | PB passes: a trace that already holds a 1,000/100 read; the second read's `tokens` are its own 70/7. |
| MB1, MB2 | drop the archived filter on wallets, on categories (`slip-read.ts:166-167`) | P14's "both copies are pinned": the privacy cases archive nothing, so an archived wallet's or category's name could reach both models. | Add a case with one archived wallet and one archived category; neither name nor id appears in either call's text turn. |
| MC | `opus.kind === 'answer'` without the draft count (`slip-read.ts:93`) | "Opus drafts win; else Haiku's, if any": an Opus answer with no draft must not replace a Haiku draft. The cases pin Opus failing or declining, and both models finding nothing. | PM passes: Haiku draft with a null amount, Opus `unreadable`: Haiku's draft, Haiku's bank, `escalated: true`. |
| MJ | `reply = raw` with no object guard (`slip-read.ts:155`) | A whole answer of `null` would throw instead of going to Opus. The unusable rows are not JSON, cut short, no kind, a fourth kind, no draft and `unreadable`; none is a bare value. | PL passes for `null`, `[]` and `"hello"`. |
| MO2 | `if (opus.kind === 'failed') throw ...` only when Haiku declined (`slip-read.ts:95`) | Review Focus 3: after a decline, an unusable or an ungrounded Haiku answer, an Opus outage gives the use back. Only the decline row is pinned (`slip-read.test.ts:256` and `:465`); every "unusable" row scripts an Opus that answers. With the mutant, an unusable or empty Haiku answer plus an Opus outage answers 200 `unreadable` and spends the use. | PO passes for a bare-string, a no-draft and an `unreadable` Haiku answer: 503, two calls, `remaining.slip` 10. |
| MO3 | `media_type: 'image/png'` fixed (`slip-read.ts:136`) | Every slip case posts a PNG, so the media type that reaches the calls is unpinned. A phone's camera photo is a JPEG, and a wrong type is a 400 from Anthropic, a spent use and a 503. | PQ passes: a JPEG upload reaches both calls as `image/jpeg`. |

Add the cases (PB, PL, PM, PO, PQ and an archived-wallet case); one `it.each` row each is enough. (MK, `declined` read from the last outcome only, was killed.)

### Nit

- **n1. `tokens` trusts the API's usage.** `settled` (`slip-read.ts:101-108`) adds `usage.input` and `usage.output` as they come. Probe PJ: a usage with no `input_tokens` gives `tokens.input` NaN, which JSON writes as `null`, and the phone's `isAiSlipResult` (`isCount`) then refuses the whole read after the models billed it. Hypothetical: the SDK's type says a number, and I could not check what the server-side fallback beta returns for `usage`. A `Number.isSafeInteger` clamp per addend closes the class.
- **n2. `service.ts:46-51`** still opens with "Since P3-T6 every call is Haiku 5.5's" and then, two sentences on, says a slip is read by Haiku and then Opus. Reword the first to name parse, the note and Ask Bun.
- **n3. The receipt's risk note (`receipts/P3-T8.md:33-34`) names one of two refund-after-billing paths.** It names a Haiku read cut at its cap. The second is a Haiku answer with nothing usable followed by an Opus call that times out after it was sent: two calls Anthropic may bill, one use given back (the plan asks for that refund). The owner's refund-cap item (followups line 747) should list both.

## Checked and sound

- All 16 files equal the kit's `real/`; `git diff --check` is clean; no file outside the brief's list changed; the receipt is its own file (R87) and `premium-progress.md` is untouched; the trailer names Claude Haiku 5.5, the model that built it.
- The route answers exactly `{ drafts, bank, source, model, escalated, kind, declined, tokens }` (the first case uses `toEqual`).
- `SLIP_SCHEMA` requires `kind` with the contract's three values, and `SLIP_SYSTEM` carries the plan's rule verbatim (the first case asserts the schema's shape and the rule's text; R1 to R3 are the planner's, not rerun).
- Parse and the note keep their effort (`{ ...base.output_config, format }` builds the same `{ effort: 'low', format }` as before); the slip's effort is `medium` as before.
- The model's `bank` is trimmed and cut to 60 (`ai.test.ts`'s bank case, now three complete reads).
- `afterEach(() => expect(model.left()).toBe(0))` in the front-door suite means every scripted reply was asked for, so no case passes by leaving Opus unasked.
- Besides the files in the diff, the only files that name the slip route, `readSlipImage` or `AiSlipResult` are the route tables (`apps/edge/src/v1/ai/routes.ts`, `apps/edge/src/v1/routes.ts`), `route-coverage.test.ts` and `TellBunSheet.tsx` (the one app caller of `resources.slip`, line 170), so no other workers file scripts a slip reply that Opus would now re-read.

## Mutants

**Planner's, sample of 13 (one run each, in my scratch copy, by `mutants.py --only`):** P3, P4, E5, E7, E19, E21, E28, E34, E35, G1, M6, A4 and RV5. 13 of 13 killed, every one by an assertion (`mutants-sample.out`, `mutants-rv5.out`). They span all five batches (batch 1: P3, P4, E5, E7; batch 2: E19, E21; batch 3: E28, E34, E35; batch 4: G1, RV5, M6; batch 5: A4). Every mutated file was restored byte for byte.

**Mine, 8:** MA, MB1, MB2, MC, MJ, MO2 and MO3 survived (m2); MK was killed (`mutants-mine.out`, `mutants-mine2.out`).

## Probes (scratch, under `scratch/p3-t8-second/`)

| Probe | Result |
| --- | --- |
| PA, a Haiku date of `2026-10-32`, `2026-13-05`, `2026-00-10` | 503, one Haiku call, `remaining.slip` 9, `RangeError` logged (m1) |
| PB, a trace that already holds a read | tokens are the second read's own |
| PC, Opus never starts (44 of 45 s used by Haiku) | Haiku's draft, `escalated: true`, last call `sent: false`, `timeout`, `escalated: true` |
| PC2, same, Haiku declined | `SlipNotRead('timeout')`, `shouldRefund` true (note 1) |
| PF, Haiku declines and Opus answers 400 | 503, two calls, `remaining.slip` 9 (spent, A14) |
| PG, a model-supplied `date_guessed` on a valid date | escalates, Opus's draft shown |
| PJ, a usage without `input_tokens` | `tokens.input` NaN, JSON null (n1) |
| PK, a real date 134 days old (`2026-07-01` on `2026-11-12`) | two calls, Opus's draft still `date_guessed` with `occurred_on` set to today (note 2) |
| PL, a whole answer of `null`, `[]`, `"hello"` | Opus is asked (m2, MJ) |
| PM, Opus answers `unreadable` while Haiku has a draft | Haiku's draft, Haiku's bank (m2, MC) |
| PO, a bare-string, a no-draft and an `unreadable` Haiku answer, each then an Opus 529 | 503, two calls, `remaining.slip` 10 (m2, MO2) |
| PQ, a JPEG upload with a Haiku refusal and an Opus read | `image/jpeg` reaches both calls (m2, MO3) |
| Fuzz of `sanitizeDrafts` | four throwing inputs, all dates (m1) |

## Notes for later tasks

1. **P3-T9 (R116) and P4.** R116's rule ("a last call that is a `sent: false` timeout refunds only when no earlier call answered") changes `shouldRefund`, which the slip route shares. Probe PC2 is the slip's case: Haiku declines, Opus is never started, today `shouldRefund` is true. It cannot happen with a 45 s deadline and a 20 s Haiku cap unless the vault steps take over 23 s, but P4's per-slip deadline can make it reachable: it must leave Opus at least 2 s after Haiku's 20 s cap, or the floor case appears. P3-T9 should add a slip row to R116's pin (PR4) and the receipt's "unchanged on purpose" (`receipts/P3-T8.md:36`) should be revisited then.
2. **P4-T4 and P3-T22 (the date trigger).** `date_guessed` fires for a real date older than the 90-day window `sanitizeDrafts` applies (`drafts.ts:78` and `:91`), as well as for a missing, impossible or future date. Probe PK: a genuine slip dated 134 days back is read twice and Opus returns the same flagged draft with the date replaced by today. For a live read this costs two billed calls for nothing, and for P4's backfill of old slips it would do so for every slip. P4-T4's import mode needs a wider window or no date trigger for old dates, and P3-T22 should count the escalations whose result still carries `date_guessed` (Opus could not fix them).
3. **P3-T22 and P6C.** Record Haiku's slip latency against the 20 s cap (a read past it is a refundable 503 with no Opus), the share of reads that escalate (a photo that is not a slip always costs two calls, since no draft triggers Opus), and the `rejected` rate on `/v1/ai/slip` after an escalation: Opus carries the fallback beta and `fallbacks: 'default'`, and a systematic 400 there would spend a use on every escalated read (followups line 746 names the rate for all routes).
4. **P3-T17.** `kind` is the model's word about the image, so a hostile image can claim `receipt`; B3's keep rule leans on it. The photo lives only in memory until its record saves (H10), so I rate the risk low, but the rule should not be read as a check on what the image is. `declined: true` can come with Opus's drafts (Haiku refused, Opus read the slip), so the tray should decide from `kind` and `drafts`, not from `declined`.
5. **P3-T10.** The Opus call is recorded with `escalated: true`; a call the floor skipped has `sent: false` and `latencyMs: 0` (probe PC), so `$ai_generation` must not emit it as a model call. `RecordedCall.model` is the response's model, which may differ from the tier under the fallback beta.
6. **Next edit of `service.ts` (P3-T9).** `choices` now exists twice (`service.ts:318-323`, `slip-read.ts:164-169`). P14 accepted that to stay inside the plan's file list; move it to one module with one pin when `service.ts` next changes, so MB1 and MB2 are held once.
7. **P3-T10 (logs).** A model failure inside a read that is then shown leaves no log line any more: an Opus failure or refusal, and a Haiku refusal that Opus then reads, write no `ai_fallback` line, because the route's catch runs only when `readSlipImage` throws. Before this task a Haiku refusal on a slip logged `ModelUnavailable:refusal` and answered 503. Only the trace keeps these now, so `$ai_generation` (for people who consented) is where an Opus 429 or a refusal rate will show, and B27's limiter question needs them. (The first review makes the same point.)

## Cross-check with the first review

I read `reviews/P3-T8.md` (Claude Opus 5.5) only after the findings above were written. It reaches the same verdict, with no blocker and no major. The overlap is large and was found independently: its m2, m3 and n2 are my MC, MB1 and MB2, and MA. Two of its items were not in my first pass: an Opus outage after an unusable or empty Haiku answer (its m1) and the image's media type (its n1). I reproduced both with my own mutants (MO2, MO3) and probes (PO, PQ) and folded them into m2 above. I also added its receipt-wording nit (my n3), its note on lost log lines (my note 7) and the `declined` advice for P3-T17. My m1, an impossible calendar date from the model crashing the read, is not in the first review, and I proved it with a front-door probe and a fuzz of `sanitizeDrafts`. I disagree with nothing in the first review; on the Haiku-cap risk it says refunds can be farmed with photos that reliably run slow, and I softened my first wording to match.

## Method and limits

I did not run whole suites (R100), the render files (CI's Render jobs cover them) or the database suites (Docker is stopped, SKIPPED). I did not measure real Haiku or Opus latency, cost or billing, and I could not see what the server-side fallback beta returns for `usage` or for a 400. No hosted, native or device check was possible or asked. CI was read from `gh pr checks` and the jobs API once the run had completed.

VERDICT: Approved

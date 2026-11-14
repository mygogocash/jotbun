# P4-T4 second review: the reader's import mode (Claude Sonnet 5.5, money and privacy)

**Reviewed:** commit `ae0ba163` on `p4/t4-slip-import` (PR #480, base `claude/p1a-vault-core`, merge base `37877cb2`; the base head is still `06b9c5fe`). Range `origin/claude/p1a-vault-core...ae0ba163`: 5 files, +834 -18.

**Method:** read-only. I read the plan task and its rulings, the brief, the implementer's logs and the code first, and I did not read the other reviews of this task. Every probe and mutant ran in scratch copies made with `git archive ae0ba163` (`scratch/p4-t4-second/tree` and `tree2`, `node_modules` linked from the worktree, `@gogospend/contracts` re-pointed at the copy). The worktree is clean at `ae0ba163`, the planner's folder is untouched, and nothing is kept under `/private/tmp`. Docker stayed stopped, so database suites were not run (CI runs them).

## Summary

No blocker and no major. The model request is exactly the image, today and the locale (checked at the wire with the real SDK transport), the reader makes at most two billed calls on every outcome (all 169 Haiku and Opus outcome pairs probed), the refund rule holds for each trace this mode can produce, the moved call is held by P3's own tests (CW1 to CW3 killed), and a 60,000-answer fuzz of the sanitizer broke none of the plan's promises. The findings are three minors (a weak no-log pin, a two-billed-calls cost edge on a bad `today`, and a digit rule that a few separators slip past) and two nits.

## CI (R100, R127)

All nine jobs are green on `ae0ba163` (re-read from `gh pr checks 480` after the controller's message). The SQL job's first failure was `attachments.integration.spec.ts` in frozen `apps/api` (`retry_after` 181 against a limit of 180); this PR touches no `apps/api` file, and the job passed on rerun.

| Job | Result |
| --- | --- |
| Edge Worker (types, unit, workerd, build, PostgreSQL container) | pass |
| Typecheck, unit, API, build | pass |
| Exports (web and iOS bundles) | pass |
| Render (every file but the per-section suites) | pass |
| Render, per-section suites (3n, 3n+1, every other test) | pass, pass, pass |
| SQL integration and ops | pass (on rerun) |
| Release image and smoke | pass |

From the edge job's log (first run, same commit): `test:edge` 23 files and 276 tests passed, with `slip-read-import.test.ts` at 48; `test:edge:workers` 40 files, 927 passed and 1 todo, with `slip-read.test.ts` 46, `ai-uses` 16, `ai.test` 44, `ai-routing` 7 and `ask-escalation` 13; `build:edge` and `test:edge:db` (3 files, 12 tests) ran and passed.

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. The "no log line" pin reaches 2 of about 7 outcome paths, so a log of the model's raw answer on any other path passes every test.**
- Evidence: `apps/edge/test/slip-read-import.test.ts:337-346` spies on the console for two reads only (Haiku incomplete then Opus complete, and a Haiku 429). My mutants on the focused file, each of which passes 48 of 48:
  - **LOGU:** a `console.warn(JSON.stringify(answer.raw))` when the answer is not a slip (`slip-read.ts:265`).
  - **LOGD:** a `console.warn` of the error on a decline or an unusable answer (`slip-read.ts:221`).
  - **LOGS:** a `console.warn` of the raw answer in the sanitizer's catch (`slip-read.ts:260-263`).
  - LOGF (a log on a failed call) is killed, because the 429 flow reaches it.
- Why it matters: the raw answer holds both names and last-four digits, and the paths where someone would add a debug line (a decline, a receipt, a cut-short answer, a sanitizer throw) are exactly the unheld ones. Ruling P10 and Global Constraints ("privacy anti-goals are tests") promise this pin.
- Fix, with no code change: run the existing spy case over both models declining, a receipt then an unreadable answer, broken JSON, a cut-short answer, a sanitizer throw (a bad `today`) and a 5xx.
- Why not major: the shipped code writes no log line (I read all of it), and my wire probe (see "What each model is sent") spied `console`, `stdout` and `stderr` over four real-transport calls and saw zero writes.

**m2. A bad `today` costs two billed calls before the reader finds out.**
- `importOnce` reads a sanitizer throw as unusable (`slip-read.ts:257-263`), so Opus is asked. The only throw source in the sanitizer is `addDays(today, 1)` (`slip-import.ts:131`): every other step is guarded or total (60,000 hostile answers with a real `today` never threw). So that second billed call can never help, because Opus cannot repair the caller's day.
- `parseAiDate` checks only the shape `dddd-dd-dd` (`packages/contracts/src/v1/ai.ts:217,224-227`), and `parseSlipBatchRequest` uses it (`slips.ts:271`). A body `today` of `2026-02-30`, `0000-00-00`, `2026-13-45` or `9999-12-31` is accepted. My probe `probes/probe-today.test.ts` shows each one making the reader call Haiku and then Opus and answer `kind: 'unreadable'` with no `import`, the use spent.
- The single route is safe because `trustedToday` (`service.ts:61-65`, private to that file) clamps the client's day to within one day of the server's Bangkok date. Nothing in this PR, and nothing in the plan's P4-T6 text, says the slips handler does the same; the brief only says "P4-T6 always passes a real day (the trusted Bangkok day)".
- This is a known, accepted behaviour (ruling P9; the receipt's third Risk; the case at `slip-read-import.test.ts:348-359` pins the two calls), and it adds no amplification, since a client can already spend two calls on a non-slip image. It is minor because P4-T6 is not written yet.
- Action: P4-T6 must clamp the day and pin it (a body `today` of `2026-02-30` or `9999-12-31` reaches no `readSlipImage` input and no model request). Optionally the reader can check `today` before its first call (for example `addDays(input.context.today, 1)` first). If it throws there, P4-T6's catch-all makes the slip `paused`, so only add it together with the clamp, or a bad day becomes a resend loop.

**m3. The seven-digit rule is bypassed by separators other than one space, dot or dash.**
- `slip-import.ts:82`: `/\p{Nd}(?:[ .-]?\p{Nd}){6,}/u`. In the fuzz (`fuzz-summary.txt`) these ten-digit names were kept: `ร้าน 081_234_5678`, `ร้าน 081,234,5678`, `ร้าน 081/234/5678`, `ร้าน 081  234  5678` (two spaces) and `ร้าน 081<ZWSP>234<ZWSP>5678`.
- This is within the plan's literal words ("seven or more digits in a row"), but ruling P7's intent is a phone number as printed (`081-234-5678` is one number), and the rule covers only three of its spellings. The rule exists so that a number never becomes a record's merchant (P4-T16a).
- Suggested fix, verified on the five names above and on the keepers: `/\p{Nd}(?:[^\p{L}\p{N}]{0,2}\p{Nd}){6,}/u` drops all five, and still keeps `ร้าน 7-11 สาขา 123456` and `ร้าน 123456`, since letters break the run. Add one row per separator. It can ride with P4-T16a; it does not block this PR.

### Nit

**n1. Guards the 48 cases do not hold (my mutants that survive).** Add one row each:
- **L7, L9:** the threshold of seven is unheld. Only six-digit and ten-digit names are tested, so a rule needing eight or ten digits passes. Add names of exactly 7, 8 and 9 digits.
- **LDOT:** no row has a dot between digits.
- **FITER:** `flags` as a number or an object. Iterating it as it is would throw and ask Opus; the only row is a string.
- **TNC:** the time pattern's `^` is unheld (a time with a prefix would pass). Practically equivalent.
- **LOCFIX:** every case sends locale `th`, so a reader that always sends `th` passes. My probe shows `en` passes through in the code (`probe-misc.test.ts`).

**n2. A comment overstates.** `slip-import.ts:7-8` says an import read holds "never ... more than four digits of any number", but ruling P7 lets a name keep a run of up to six digits (a branch code), and m3 notes the gaps. Reword to "no account or phone number beyond its last four digits".

## What I checked, by the controller's focus

### 1. What each model is sent (P10)

- **Code:** the import path reads nothing of `context` but `today` (`slip-read.ts:254`). `callSlip` (`slip-read.ts:188-210`) builds the request from the base, the constant prompt and schema, the image and that text. The tests pin the whole request with `toEqual` for Haiku, for Opus and for a JPEG (`slip-read-import.test.ts:100-111, 271-280, 323-328`).
- **Wire probe** (`probes/probe-wire.test.ts`): the real `anthropicTransport` over a capturing `fetch`, with a context carrying a wallet, a category and four ids the type does not allow (account, session, vault, device). Four requests: Haiku, Opus, then a 429 and a 500.
  - Every body has exactly `max_tokens, messages, model, output_config, system`; Opus adds `fallbacks: "default"` and the `anthropic-beta` header, as P3's base already does.
  - The user turn is the image block and `{"today":"2026-10-25","locale":"th"}`.
  - No id, name, category or trace id appears in any URL or body of the four requests, nor in the headers of the first two (the 429 and 500 requests recorded none).
  - The first two requests' headers are the SDK's own, `cf-aig-collect-log: false`, `cf-aig-skip-cache: true` and the auth headers.
  - `console` (six methods), `process.stdout.write` and `process.stderr.write` were spied for the whole run: zero calls.
- **Logs:** the new code has no console call; m1 is only about the pin's reach.

### 2. When a second billed call happens (P4, P5)

- **Code:** at most two `importOnce` calls, no loop (`slip-read.ts:140-149`).
- **Probe** (`probes/probe-outcomes.test.ts`, table in `outcome-table.txt`): every pair of 13 outcomes, 169 in all (complete slip, incomplete slip, receipt, unreadable, decline, broken JSON, cut short, 429 with `retry-after`, 529, 500, timeout, connection error, 400). Invariants held on all of them:
  - calls never above 2;
  - Opus asked exactly when Haiku is neither a failure nor a complete slip;
  - `escalated` is exactly "Opus was asked";
  - `kind: 'slip'` exactly when `import` is present, and `drafts` always `[]`;
  - a wait is present only from the last, failed call.
- **Refund** (`shouldRefund`, R116) on the same traces:

| Haiku, then Opus | Reader | Refund |
| --- | --- | --- |
| outage (429, 5xx, timeout, connection) | throws | yes |
| 400 | throws | no |
| decline, receipt or unreadable, then an Opus outage | throws, with Opus's failure and wait | yes (A14) |
| incomplete slip, then an Opus outage or 400 | Haiku's read | no (spent, A14) |
| any returned read, `unreadable` included | read | no |

- **Floor:** the tests pin 22,000 ms (Opus gets 2,000), 21,999 ms (no Opus call, Haiku stands) and the trace's unsent record (`slip-read-import.test.ts:282-315`). My probe (`probe-floor.test.ts`), with Haiku using its full 20 s on a 21,999 ms deadline:
  - Opus is recorded `sent: false, failure: timeout` and never sent;
  - an incomplete slip stands (Haiku's, `escalated: true`, `shouldRefund` false);
  - a receipt, a decline or broken JSON throws `SlipNotRead('timeout', null)` and `shouldRefund` is false (R116: Haiku's call answered).
  - A deadline of 0 or 1,999 ms at the start sends nothing and throws `SlipNotRead('timeout')` with one unsent call, refund true (`probe-start-floor.test.ts`); 2,000 ms sends with a 2,000 ms timeout (`probe-misc.test.ts`).

### 3. The moved call (P2)

- **Diff:** `callSlip` is `readOnce`'s request, traced send and JSON read, with `prompt.schema`, `prompt.system` and `prompt.text` in place of the three single-read values. `readOnce` evaluates the same text before the call, so the order of evaluation and the error mapping are unchanged (a refusal is a decline, anything else from `finishedJson` is unusable, a failed call is `failed`). The single route's try and catch (`service.ts:146-156`) is untouched and ignores the new field.
- **P3's file in my scratch tree** (workers, under the heavy lock): `test/workers/slip-read.test.ts` passes 46 of 46. CW1, CW2 and CW3 are each killed by it (4, 1 and 4 failing cases, all assertions). CI ran the whole workers suite, including P3's five AI files.

### 4. What a read keeps (P6 to P9)

- **Fuzz** (`probe-fuzz.test.ts`, seeded, 60,000 answers with a real `today`): hostile types and values in every field, among them `__proto__`, `constructor`, `NaN`, `Infinity`, Thai and fullwidth digits, control and bidi characters, a lone surrogate and 121 code points. No throw. Every output held:
  - amount text `^[1-9][0-9]{0,10}$` and at most 99,999,999,999;
  - a real day from 1970-01-01 to today plus one;
  - the time pattern;
  - a bank in `THAI_BANK_KEYS`;
  - an account of four ASCII digits;
  - a name of one line, 1 to 120 code points, NFC, trimmed, with no control or bidi character and no run the rule sees;
  - flags known, unique and in the contract's order;
  - `amount_unclear` whenever the amount is null, and `date_guessed` whenever the day is null;
  - `missingImportFields` agreeing with the nulls.
- **Fidelity:** the prompt text in `slip-import.ts` is byte-identical to the plan's text (945 characters, checked by script, preceded by `VOICE` and a blank line). The four code and test files are identical to the planner's `real/`; only the receipt differs, as the controller said. The schema matches the plan's. `VOICE` differs from the base only by `export` and one comment line. `git diff --check` is clean.
- **Gaps:** m3 and n1.

### 5. `retryAfterSeconds` (P3)

- **Code:** `lastWait(trace)` is `trace.calls.at(-1)?.retryAfterSeconds ?? null` (`slip-read.ts:156`), used at all four throw sites (`112, 118, 141, 147`). `tracedSend` records a failed call before it throws (`transport.ts:199-216`), so the last call is the failed one. A call the deadline never let start is recorded with null (`transport.ts:154-169`).
- **Probe through the real transport** (`probe-misc.test.ts`, `retry-after-table.txt`):
  - `retry-after` of 40, 1 and 3600 gives 40, 1 and 3600;
  - 3601, 0, -5, `abc`, an HTTP date and an absent header give null;
  - `40.9` and ` 40 ` give 40;
  - a 500 with 20 gives 20, and a 529 with 7 gives 7;
  - a 400 with 40 is `rejected` with wait 40, so callers must ignore the wait for `rejected` and `other`.
- **Shared trace:** the wait and the tokens read the trace by position, so they rely on one trace per slip (A16). My two-reads-at-once probe did not corrupt either value in the interleaving it produced; the dependence is structural, and the receipt documents it.

## Mutants

**The planner's, sampled (13, all killed by assertions, each file restored byte for byte):**

| Id | What it breaks | Result |
| --- | --- | --- |
| P1 | sends the wallet list | killed, 3 failing cases |
| P2 | keeps five digits | killed, 2 |
| P5 | `retryAfterSeconds` left null | killed, 3 |
| F6 | a complete Haiku read is read again | killed, 6 |
| F8 | Haiku's read dropped when Opus fails (A14) | killed, 5 |
| F10 | Opus's failure loses its wait | killed, 1 |
| F21 | Opus's slip read loses when it misses a field too | killed, 1 |
| Z3 | a 90-day window | killed, 2 |
| Z10 | a separator breaks a long number | killed, 1 |
| Z13 | a name not read by the merchant rule | killed, 1 |
| CW1, CW2, CW3 | the moved call, run against P3's `slip-read.test.ts` | killed, 4, 1 and 4 |

**My own (12 on the focused file; 3 killed, 9 survive):**

| Id | Mutation | Result |
| --- | --- | --- |
| L10 | eleven digits needed | killed |
| LSPACE | a space does not span a number | killed |
| LOGF | a log on a failed call | killed |
| L7, L9, LDOT | digit threshold 8 and 10; no dot separator | survive (n1) |
| FITER, TNC, LOCFIX | non-array flags; unanchored time; locale always `th` | survive (n1) |
| LOGU, LOGD, LOGS | a log of the raw answer on a non-slip, a decline or unusable answer, a sanitizer throw | survive (m1) |

## Run and not run

- **Run:** the focused file in scratch (48 of 48); P3's `slip-read.test.ts` (46 of 46, under the lock); the 13 planner mutants and 12 of mine; seven probe files (outcomes, wire, fuzz, floor, start-floor, misc and today), all in `scratch/p4-t4-second/probes/`; fidelity checks against the plan and the planner's `real/`.
- **Not run (CI's under R100 and R127):** whole suites, `test:edge`, `build:edge`, the exports, the render suites, the database suites and `test:ops`. I did not rerun CI.
- **Not read:** the other reviews of this task.

## Notes for later tasks

- **P4-T6, the day:** pass a clamped `today` (the server's Bangkok date, or the client's only when within one day of it, as `trustedToday` does), not the body's raw value (m2). `trustedToday` is private to `service.ts`; share it or restate it. The reader's day window and the text sent to the model both come from it.
- **P4-T6, traces:** one `newTrace()` per slip (A16), as the receipt says. Add a case with `readsAtOnce: 2` where one read is rate limited, so each read's wait and tokens stay its own.
- **P4-T6, R116:** a non-slip Haiku answer followed by an Opus call the deadline never let start throws `SlipNotRead('timeout', null)` while `shouldRefund` says the use is spent; the handler's `paused` path would return it. The 55 s limits make this unreachable, so pin that every read gets at least 22 s (22,000 ms gives Opus 2 s, 21,999 ms none), or account the use with `shouldRefund(trace.calls, false)`.
- **P4-T6, failures:** `SlipNotRead.retryAfterSeconds` can be non-null for `rejected` (a 400 carrying `retry-after`), so ignore it for `rejected` and `other` (unreadable, per the plan). A header outside 1 to 3,600 or not a number is null, which the plan turns into 30 s.
- **P4-T6, privacy pin:** its console spy should cover a decline, a receipt and an unreadable photo too, since P4-T4's covers two flows (m1).
- **P4-T6 and P4-T16a:** a property named `import` cannot be destructured under its own name (`const { import } = read` is a syntax error); use `read.import` or rename on destructure.
- **P3-T22 and P4-T23:** names dropped by the digit rule make `to.name` null and so cost a second billed call; count them with the other two-call reads. The base `bahtToSatang` strips every comma, so a decimal comma (`12,50`) would read as 1,250.00 baht; the prompt asks for the amount as printed and Thai slips print a point, so this is unchanged base behaviour, but an evaluation row for it would be cheap.
- **P3, Opus's base:** it keeps the server-side fallback beta (`fallbacks: "default"`); "never a third call" counts the Worker's calls, which the probe shows are at most two.

## After the verdict

- PR #480 shows as merged at 04:00:40Z (11:00 Bangkok), merge commit `3fd26736`, shortly after this verdict was written; the task worktree was then removed. Everything above was run on `ae0ba163` before that, so m1 to m3 and n1 and n2 are now follow-ups, not gates. Suggested homes: m2 and the P4-T6 notes go to P4-T6's brief; m1 and n1 are test-only rows (the focused file, or P4-T6's route test for the log pin); m3 can ride with P4-T16a.
- The two scratch source trees were removed once their `node_modules` links dangled with the worktree; everything else stays in `scratch/p4-t4-second/` (the probes in `probes/`, the logs, `outcome-table.txt`, `floor-table.txt`, `retry-after-table.txt`, `fuzz-summary.txt`, `wire-summary.json`, `my-mutants.py` and the mutant logs). To rerun: `git archive <sha> apps/edge apps/api packages/contracts package.json package-lock.json | tar -x -C <tree>`, link `node_modules` for the root, `apps/edge` and `apps/api` entry by entry from a worktree with installs (re-pointing `@gogospend/contracts` at the copy), copy `probes/*.test.ts` into `apps/edge/test/`, and run `npx vitest run test/<file>` in `apps/edge`; `python3 -I my-mutants.py --tree <tree> --out <dir>` reruns my mutants.

VERDICT: Approved

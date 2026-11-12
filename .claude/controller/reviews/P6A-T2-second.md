# P6A-T2 second review: the widget snapshot (PR #441, `cf538e69`)

Second reviewer (money, privacy and Bangkok time), Claude Sonnet 5.5. Read-only: nothing edited, committed or pushed in any worktree, the main checkout untouched, every probe in a scratch copy (`git archive cf538e69`, `node_modules` symlinked). I wrote this before reading any other review of the task.

Range: `origin/claude/p1a-vault-core...cf538e69` on `p6a/t2-widget-snapshot` (8 files, 721 insertions, 1 deletion: the import line of `dateStep.test.ts`).

## Result in one paragraph

The shipped code is correct. I found no defect in `widgetSnapshot.ts`, `outsideCopy.draft.ts`, `useOutsideCopy.ts` or the `dateStep.ts` additions: every probe of my own passes on it (11 probe tests, about 6,000 seeded fuzz cases against independent oracles, every Bangkok day of 2026 to 2029 at three instants, three time zones). What I did find is that the 32 tests hold fewer guards than the 51 planner mutants suggest. Of 19 mutants I wrote, **12 survive the implementer's tests** (7 are killed), and all 19 are killed by my probes. They are test gaps, not behaviour: the amounts in every fixture are whole baht, the gauge fixtures never reach a fraction where floor and nearest differ, the privacy check is the plan's literal list of seven decimal strings, and ruling P4 (the one deviation from the plan's text) is not asserted anywhere. No blocker, no major. Five minors and two nits, all test-only, with ready tests in `probes/probe.test.ts`.

CI on PR #441 is green on all nine jobs (details below).

## CI (PR #441, head `cf538e69`, run 43230245880)

All 9 jobs pass (`gh pr checks 441 --repo mygogocash/jotbun`):

| Job | Result | Counts from the job log |
| --- | --- | --- |
| Typecheck, unit, API, build | pass | `typecheck` (contracts, api), `typecheck:app`, `typecheck:routes` clean; `test:app` 36 of 36; `test:unit` 1069 of 1069 (includes the 3 new files: `monthName gives short and long names...`, `shortDayName gives...`, `the home face reads as ox-widget-home`, the B21 case, `every outside line has Thai and English...`, and the Hermes guard); `test:dev` 7 of 7; no failing case in the log |
| Render (every file but the per-section suites) | pass | 125 of 125 files; the four routes tests are in it: `PlanningRoutes` 6, `SpendRoutes` 3, `AccountRoutes` 2, `InsightsRoutes` 4 tests |
| Render, per-section suites (3 jobs) | pass | 2 of 2 files each |
| Exports (web and iOS bundles) | pass | `export:web` and the iOS export |
| Edge Worker | pass | `test:edge` 20 files, `test:edge:workers` 34 files, `test:edge:db` 3 files |
| SQL integration and ops | pass | `test:ops` 111 of 111 |
| Release image and smoke | pass | |

Logs are saved in `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t2-second/` (`ci-typecheck-unit.log`, `ci-job-*.log`).

## What I ran, and what I did not

- **Focused files** in the scratch copy: `widgetSnapshot.test.ts`, `outsideCopy.test.ts`, `dateStep.test.ts`: `ℹ tests 32`, `ℹ pass 32`, `ℹ fail 0` (`green-focused.log`).
- **10 of the planner's mutants** (P1, P2, P3, P4, W5, W10, W14, W24, W25, W31): 10 of 10 KILLED, and the printed lines are byte-identical to the implementer's `mutants.out` for those ids (`planner-sample.out` against `planner-sample.expected`). The file was restored (sha256 equal to the commit's).
- **19 mutants of my own** (`my-mutants.py`, `my-mutants.out`, logs in `my-mutant-logs/`), each run against the implementer's 3 files and against my probe file.
- **11 probe tests** (`probes/probe.test.ts` with `probes/probeKit.ts`): all pass on the unmodified code. Under `TZ=America/Los_Angeles`, `TZ=Pacific/Kiritimati` (UTC+14) and `TZ=Asia/Bangkok` the 32 focused cases and the 10 probes of that time all pass (42 of 42 each).
- **Static checks**: `git diff --check` clean; no U+2013 or U+2014 and no emoji in any added line; the 21 draft keys match the plan's copy list, and each Thai line equals the plan's by exact string comparison (`copycheck.py`, then an exact-equality recheck: 21 of 21); no other file uses an `outside.` key; nothing imports the new modules yet (unwired, as the brief says); `widgetSnapshot.ts` has no logging, network, storage, clock or local-time call (only `getTime()`).
- **Not run (R100 and the machine rules)**: whole suites (CI's); `typecheck:app` and the render suites locally (CI's, green); database suites SKIPPED (Docker stopped; CI ran them).

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. The privacy checks would not see a raw figure that is not one of seven decimal strings** (highest priority of the minors). `widgetSnapshot.test.ts:100-110` and `:112-123` check the lock and masked faces by `JSON.stringify(...).includes(amount)` over `AMOUNTS = ['132','580','662','74','13,360','4,640','18,000']` (the plan's own list, plan line 199). A leak in satang or a field name outside the drawn text is invisible to it. Mutant **X14** adds `used: budget === null ? null : budget.spent.toString()` to every face: the lock face then carries `"1336000"`, which contains none of the seven strings, so all 32 tests pass. (X15, the same with today's `13200`, is killed only because `'132'` is a substring.) This is exactly the controller's question "any field, not only the drawn text". Probe `P-A/B` kills X14: for every face that must be masked, every string leaf of the whole face (including `spoken.*`) may hold only the entry's record count and the day of the month as digit runs, and no numeric leaf may exist. Suggested: replace the two substring loops with that leaf walk (about 15 lines, `probes/probe.test.ts` `leaves()` and the `allowed` check).

**m2. No amount in any test has satang, so exact money text is not held** (the controller's "the wallet's money text for every amount"). The fixtures are `todayOutMinor: '13200'` and over by `42000`; the only fractional amount is the per-day division. Four mutants survive: **X10** draws today's spending with `perDayText` (whole baht), **X11** draws the over-by amount with `perDayText`, **X8** has VoiceOver say the over-by amount in whole baht, **X9** has VoiceOver say today's spending in whole baht (drawn `฿132.50`, said `132`). The shipped code is right: `P-A/B` compares every drawn amount and every amount handed to `spoken` against an independent oracle, with random satang in today's spending, the limit and the over-by amount. Suggested: probe `P-I` (today `13250`, over by `42050`: `฿132.50`, `฿420.50`, `spoken` handed exactly `13250` and `42050`), 10 lines.

**m3. The gauge and per-day arithmetic is held only where floor, nearest and float agree.** The gauge fixtures are 74.2 percent and 102.3 percent, neither is a float boundary, and nothing has a fraction of .5 or more. Four mutants survive: **X1** percent rounded to the nearest (74.6 percent would read 75), **X2** the fraction rounded to the nearest thousandth, **X13** the gauge in floats (`Math.floor(Number(spent) / Number(limit) * 100)`: 29 of 100 reads `28%`, because `0.29 * 100` is `28.999999999999996`; the float form is off by one at 29, 57, 58 and 113 to 116 percent of a ฿100 limit), **X18** the per-day figure rounded to the nearest satang before the whole-baht cut (a per-day figure of 99.5 satang shows `฿1`). P8 and the plan's "rounded down in BigInt" are the requirement; only the round-up mutant (W12) was in the planner's list. Probe `P-K` sweeps every whole percent 0 to 130 and every thousandth 0 to 1100 and kills X1, X2 and X13; `P-A/B` kills X18. Suggested: `P-K` (or two rows: 99.6 percent reads `99%`, 29 of 100 reads `29%`), and one satang case for X18.

**m4. Ruling P4, the brief's one deviation from the plan's text, is not asserted.** The brief replaces the plan's `perDayText(perDayMinor)` and `leftMinor ÷ (daysLeft − 1)` with "the days left from the face's own day", citing two failures of the literal form (a pace from a later day divides by zero; a pace from an earlier day repeats that day's figure under a new day's name). Every same-month fixture builds the pace on `now`'s own day, so mutant **X7** (the plan's literal form: `pace.daysLeft`, minus 1 for tomorrow) passes all 32 tests. The code is right: probe `P-H` (pace for Saturday 24 October, now 00:30 on the 25th) gives `≈ ฿662` for the 25th and `≈ ฿773` for the 26th, and `P-A/B` has a `stale` pace kind (an earlier day of the same month) that agrees with the oracle in 1,000+ cases. Because the plan is the spec, a future reader who "fixes" the code back to the plan's text would break Review Focus 2 with no failing test. Suggested: `P-H`, 8 lines.

**m5. `signedOutSnapshot`'s `day` is not tested at an hour where UTC and Bangkok differ.** The signed-out case (`widgetSnapshot.test.ts:240-245`) uses `NOW = 2026-10-24T13:00:00Z`, where the UTC and Bangkok dates agree. Mutant **X3** (`day: now.toISOString().slice(0, 10)`, plan: "each `day` is the Bangkok date it starts on") survives; between 00:00 and 07:00 Bangkok it would name the day before. Probe `P-D` (every hour of a day) kills it. (The same mutation on entry 0, X4, is killed by the planner's month case.) No face reads this `day` today, so the impact is low. Suggested: one assertion at `2026-10-24T18:00:00Z` (`day` `2026-10-25`).

### Nit

**n1. P13 ("a family added later gets the more masked face") is not asserted.** `faceFor` uses `family.startsWith('system') ? entry.home : entry.lock` (`widgetSnapshot.ts:240`). Mutant **X12** (`startsWith('accessory') ? lock : home`) is equivalent over the five-member union, so it survives, and gives any future family the unmasked face. Probe `P-J` (a cast `'accessoryCorner'`, `'standBy'`, `''`) pins it. One line.

**n2. A masked lock face still says more than "no amount", by the plan's design.** It keeps the record count, the day and month, the side label and `over` (`เกินงบไป` against `เหลือวันนี้`, so whether the month is over budget), and whether a budget exists (`side` is `฿••••` or null). The plan says so ("keeps the side labels", "keeps the count", ox-widget-lock). It meets B21's "no amounts"; I note it only because B21's intent is a locked phone showing no money. The over-budget bit is a financial signal. An owner decision for E2, not a defect.

## The controller's focus, answered

**1. The lock faces (B21, P17).** With `lockOn`, no field of any lock face holds a figure. Evidence: `P-A/B`, 6,000 seeded cases, each with 2 entries and 2 faces. For every face that must be masked (home when `hidden`; lock when `hidden || lockOn`; entries 0 and 1): `masked` true; `out` is `฿••••`; `side` is `฿••••` or null (and null exactly when the oracle says no budget figures); `gaugeText` and `gaugeFraction` null; `over` and the side label as for the unmasked face; and across **every leaf of the face** (strings and numbers, `spoken.*` and `dayLabel` included) the only digit runs are that entry's record count and the day of the month, with no numeric leaf. Entry 2 (`stale`) and the signed-out entry have `lock: null`. What stays on a masked lock face is listed in n2. What a native widget could still show **from the same file**: whenever private mode is off, the `home` faces of entries 0 and 1 carry every figure (`out`, `side`, `gaugeText`, `gaugeFraction`, `spoken.*`), lock on or not. That is the plan's Q9 default and `buildWidgetSnapshot` matches it (`:200`), but it means the file as a whole is not safe to read from a locked phone; it is safe only if T8 chooses the face through `faceFor`. Entry 1's lock face is masked as entry 0's (`:199-202` builds both from one closure; mutant X6 is killed).

**2. The entries.**
- Bangkok time: `entries[0].day` equals an independent Bangkok date; `nextBangkokMidnight` is strictly after now, within 24 hours, and on a 00:00 +07 boundary (instants at -2, -1, 0, +1, +2 ms around midnight, 1 minute either side, and random); entry 1's `from` and `day`, and entry 2's, as the oracle says. **Every Bangkok day from 2026-01-01 to 2029-12-31 at 00:00:00.000, 12:00 and 23:59:59.999** (`P-L`: 144 month ends, 12 year ends and the 2028 leap day asserted by count): entry 1 is the next day; in the same month it is left ÷ its own days left with the gauge kept; at a month end it has no side line, no gauge figure and the new month's short name. `P-C`: across 2,000 snapshots, `entryAt` at 20 random instants each, and at and just before each midnight, shows the Bangkok date of that instant; after the second midnight it is `stale` for 40 days (no yesterday-as-today).
- P5: a pace for another month draws no figures in any entry (the fuzz's `prev` kind; the 1st at 00:30). P6: a zero limit draws none (the `zero` kind). P4: right, unpinned (m4).
- No local-time call: the module reads the clock only through `getTime()` and the contracts' `bangkokDate`; 42 of 42 under three time zones.

**3. Money.** Exact. The only `Number(` is `widgetSnapshot.ts:133`, on a BigInt already capped at `1000n` (P8 holds); `Math.floor` appears only in `nextBangkokMidnight` (time); no `parseFloat`, `toFixed`, `Intl` or locale call. Every drawn amount is `walletMoneyText` or `perDayText`; VoiceOver is handed whole baht only for the per-day figure (`wholeBaht`, `:114`), satang otherwise. Checked against an independent oracle with satang amounts (`P-A/B`) and a sweep of every whole percent and thousandth (`P-K`). The guards the tests do not hold are m2 and m3.

**4. `dateStep.ts`.** `git diff --numstat`: 32 added, 0 removed. `head -n 221` of the new file is byte-identical to the base file (`cmp`); the base is 221 lines. `monthIndex` is private; `monthName` and `shortDayName` are the only new exports. Against `Date`, `shortDayName` is correct for every day 2024 to 2030 in th, en and vi, and `monthName` for all 12 months in short and long (`P-G`). `dateStep.test.ts`: the import line gains the two names in order, two cases are appended. Not a finding: both new functions throw the same `TypeError` text as `monthShortLabel`.

## Mutant tables

Planner sample (10 of 51), all KILLED, identical to the implementer's output: P1, P2, P3, P4, W5, W10, W14, W24, W25, W31.

My 19 (`my-mutants.out`; "impl" is the implementer's 3 files, "probe" is `probes/probe.test.ts`):

| Id | Mutation | impl | probe |
| --- | --- | --- | --- |
| X1 | percent rounded to nearest | SURVIVED | killed |
| X2 | fraction rounded to nearest thousandth | SURVIVED | killed |
| X3 | signed-out `day` in UTC | SURVIVED | killed |
| X4 | entry 0's day in UTC | killed | killed |
| X5 | lock face masked only by the Face ID lock | killed | killed |
| X6 | tomorrow's lock face masked only in private mode | killed | killed |
| X7 | plan-literal days left (P4) | SURVIVED | killed |
| X8 | VoiceOver says over-by in whole baht | SURVIVED | killed |
| X9 | VoiceOver says today's spending in whole baht | SURVIVED | killed |
| X10 | today's spending drawn as whole baht | SURVIVED | killed |
| X11 | over-by drawn as whole baht | SURVIVED | killed |
| X12 | unknown family gets the home face | SURVIVED | killed |
| X13 | gauge in floats | SURVIVED | killed |
| X14 | raw estimated spending rides on every face | SURVIVED | killed |
| X15 | raw today's spending rides on every face | killed | killed |
| X16 | masked face hides `over` | killed | killed |
| X17 | zero limit passes the guard | killed | killed |
| X18 | per-day rounded to nearest satang | SURVIVED | killed |
| X19 | the stale entry keeps a lock face | killed | killed |

Reproduce one: `python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t2-second/my-mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t2-second/tree /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t2-second/my-mutant-logs X14`. Every run restored the file (sha256 equal to the commit's, rechecked at the end).

## Recommended action

Approve and merge. The five test gaps need no source change: add `P-A/B`'s leaf walk (m1), `P-I` (m2), `P-K` or two rows (m3), `P-H` (m4), `P-D` or one assertion (m5) and `P-J` (n1) to `widgetSnapshot.test.ts`, about 50 lines in all, either as a test-only commit here before P6A-T3a builds on the module or as the first commit of P6A-T3a's test work. The module is not wired to anything yet, so nothing user-facing depends on them today; m1 is the one worth doing before T8 adds native consumers.

## Notes for later tasks

**P6A-T3a (the bridge):**
- Fail closed. `WidgetFacts` cannot say "unknown": pass `hidden: true` and `lockOn: true` until private mode is `ready` and the Face ID lock setting is read (the receipt carries only the `ready` half). An unmasked default writes amounts to the lock screen.
- Advance the `sameSnapshot` memory only after the write resolves. If the memory is updated before a failed write, `sameSnapshot(last, next)` is true and the unmasked lock faces stay in the app group after the person turns the lock on (B21).
- Rewrite on the lock toggle itself, before the toggle returns, not on the next focus (Review Focus 1).
- Catch throws from `buildWidgetSnapshot` and `signedOutSnapshot`: an invalid clock throws `RangeError`, a malformed minor-unit string throws `TypeError` or `SyntaxError`, and nothing in the module catches them. Keep the last good snapshot (Logging constraint).
- `facts.locale` and `t` are separate inputs and the module trusts them to agree; derive both from `useActiveLocale`.
- `hidden` is stored twice (the snapshot and the account file, X5): one write path.
- Build the facts for `now`'s Bangkok day (the receipt's note); a pace from earlier the same month is safe (m4), but `todayCount` and `todayOutMinor` are not day-stamped.

**P6A-T8 (the widgets):**
- Choose the face only through `faceFor`. The file holds the `home` figures whenever private mode is off (Q9), so a hand-written family switch that reads `home` for an accessory family would draw amounts on a locked phone.
- Validate a snapshot read back from the group before `entryAt`: check `v === 1` and a non-empty `entries`. `entryAt` is typed to return a `WidgetEntry` but returns `undefined` for an empty list (P14).
- Mark home amounts privacy-sensitive (Q9); n2 is the owner's call on what a masked lock face keeps.

**P6A-T13 and E2:** the receipt's items stand (`1 records`, the new month's gauge saying "No budget set yet" until Jotbun opens). Add: a masked face with no budget says "This month's budget is hidden", which reads as if a budget exists; harmless (it fails closed) but worth a copy look.

VERDICT: Approved

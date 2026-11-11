# Brief fix-parser-regex: linear amount and sign matching

You are the implementer (Haiku) for a small fix in the parser child (`apps/api/src/imports/parsers/`).

- **Background:** the P4-T10 confirming review and its sweep found four places whose cost grows with the square of the input:
  - three regexes, slow on a long run;
  - one check repeated for every cell style.

  A few megabytes of CSV, or a workbook of a few kilobytes, holds the shared parser child until its 30 s deadline.
- **Ruling R89** (controller, 8 November 2026): this is a denial of service on the shared parser, so a fix in the frozen `apps/api` is allowed. It is limited to the parser's regexes:
  - `THB_SUFFIX` in `amount.ts`;
  - `explicitPlus` in `table.ts`;
  - any other regex in `apps/api/src/imports/parsers/` proven slow;
  - plus the review's NIT-A test.
  - **Extended the same day:** `readDateStyles` in `xlsx.ts` judges each custom number format once, when it is read, not once per cell style.
- **Base:** P4-T10 (#345) merged into `claude/p1a-vault-core` at `3ab5d42`. The branch starts there.
- **Already proven:** the planner did every step below in a scratch copy of `3ab5d42`:
  - the RED and the GREEN;
  - a differential check of old against new;
  - 11 mutants;
  - the whole API gate.

Do exactly what this brief says.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`.
   - Note its opening rule **R87**: your receipt is its own file, `docs/implementation/receipts/fix-parser-regex.md`. You do not edit `docs/implementation/premium-progress.md`.
   - This is maintenance with no plan task: this brief is the spec. Where the protocol says "the plan", read "this brief".
2. The review: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P4-T10-confirm.md`, MIN-A and NIT-A.

## Scope (ruling R89)

**In this PR:**

1. `amount.ts`: `THB_SUFFIX` loses its leading `\s*` (Edit 1).
2. `table.ts`: `explicitPlus` is rewritten so that no two `\s*` sit side by side (Edit 2).
3. `xlsx.ts`:
   - `isDateFormat` strips bracketed sections only up to the last `]` (Edit 3a). The sweep found this third slow regex.
   - `readDateStyles` judges each custom number format once, when it reads the `<numFmt>`, and a cell style looks the verdict up (Edit 3b). R89 was extended to this.
4. Tests:
   - NIT-A, one line in `bank-statements.spec.ts` (Edit 4);
   - an optional `stylesXml` for the XLSX fixture (Edit 5);
   - a new spec, `parser-linear.spec.ts` (Edit 6).
5. The receipt file.

**Not in this PR:**

- No other parser change.
- No `premium-progress.md`.
- No package or lockfile change.
- Nothing outside `apps/api/src/imports/` and the receipt.

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex`.
  - Its branch is `fix/parser-regex`, which the orchestrator cut from `origin/claude/p1a-vault-core` at `3ab5d42` or later.
  - Work only here. If WT does not exist, stop: BLOCKED.
  - Run git as `/usr/bin/git -C WT ...`, one plain command per call.
  - Run npm as `cd WT && npm run ...`.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-impl`, your scratch folder.
  - Create it with `mkdir -p`.
  - Keep logs and copies only there; never under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex`, the planner's folder. Read it and run its scripts. Never write into it. It holds:
  - `files/edit_code.py`: Edits 1, 2, 3a and 3b, as exact Find/Replace pairs it checks match once;
  - `files/edit_tests.py`: Edits 4 and 5 the same way, and Edit 6 by copying the verified spec;
  - `files/differential.mjs`: the old-against-new check;
  - `files/mutate.py`: the mutant runner;
  - `files/receipt.py`: writes and checks the receipt from your logs;
  - `files/commit-message.txt`;
  - `files/sweep.mjs`, `files/margins.cjs` and `files/styles-repeat-probe.cjs`: the planner's evidence, which you do not run;
  - `verified/`: the six files as they must end up, plus the receipt template;
  - `SHA256SUMS.start` (the six files at `3ab5d42`), `SHA256SUMS.final` (the six files after the edits) and `SHA256SUMS` (the scripts and templates);
  - `logs/`: the planner's own runs.
- The Bash shell is zsh, and shell variables do not survive between calls. Write the full paths out in every command.
- Do not use a jest path pattern containing `parser-regex`. Jest matches the absolute path, and every spec under WT has `fix-parser-regex` in its path. That is why the new spec is `parser-linear.spec.ts`.

## Diagnosis (read once)

### The four slow places

| File | Pattern | Why it is slow | Planner's proof (the parser code as at `3ab5d42`) |
|---|---|---|---|
| `amount.ts` | `THB_SUFFIX = /\s*(?:฿\|thb\|บาท)$/i` | Not anchored at its start. A match is tried from every space of a long run inside an amount; each try runs `\s*` to the end of the run and fails. | `(` + 9,980 spaces + `5`: 55 ms per call. A generic CSV of 320 such rows (3.2 MB) ends in `{"kind":"timeout"}`. |
| `table.ts` | `explicitPlus`: `/^\s*\(?\s*(?:฿\|thb)?\s*\+/i` | Between two `\s*` sit only optional items, so a run of spaces can be split between them in quadratically many ways. The cell is trimmed first, so the run comes after a `(`. | `(` + 9,980 spaces + `1.00)` (a valid amount): 43 ms per cell. 300 rows: 16 s of child CPU. |
| `xlsx.ts` | `isDateFormat`'s `.replace(/\[[^\]]*\]/g, '')` | A format code of `[` with no `]` after: the scan starts at every `[` and runs to the end. | A workbook of 2,384 bytes (one format of 400,000 `[`): `{"kind":"timeout"}`. With 300,000 `[`: 28.4 s of CPU. |
| `xlsx.ts` | `readDateStyles`: `styles.push(custom.has(id) ? isDateFormat(custom.get(id) ?? '') : ...)` (no regex) | Every cell style `<xf>` judges its custom format code again, so styles × code length. Linear per call, repeated. | A workbook of 4,423 bytes (one format code of 1,000,000 characters, 25,000 styles): `{"kind":"timeout"}`, even with the three regexes fixed (`PL/files/styles-repeat-probe.cjs`). 10,000 styles: 15.8 s of CPU. In process: 1.5 to 1.8 ms per style. The new child case's workbook, built by the fixture, is 6,790 bytes. |

### The sweep

- **Method** (`PL/files/sweep.mjs`, results in `PL/logs/sweep-base.log` and `sweep-fixed.log`):
  - It pumped all 55 regexes in `apps/api/src/imports/parsers/` with long runs, including `date.ts`'s built `YEAR_FIRST`, `NUMERIC`, `DAY_NAMED` and `NAMED_DAY`.
  - Inputs: 18 prefixes × 54 run units × 4 suffixes, at 1,000 and 10,000 repeats: 205,920 pumps.
  - A regex was flagged when 10× the input cost over 20× the time.
- **Result:** only the three regexes above were flagged. With the three rewritten forms, none is.
- **The repeated check:** `readDateStyles` is no regex shape, so the sweep cannot see it. The planner found it while probing the styles part, and the controller extended R89 to it.
- **Linear by construction:**
  - The XML tokenizer's patterns are anchored, sticky or bounded.
  - The date patterns run after `normalize` collapses whitespace.
  - The part-name and ZIP-name patterns, and the other amount patterns, are anchored or unambiguous.

### The rewrites read exactly what the old forms read

- **`THB_SUFFIX`:** `numberText` does `.replace(THB_SUFFIX, '').trim()`. The `\s*` before the marker is exactly what `.trim()` then removes, because JS `\s` and `String.prototype.trim` use the same set of characters.
- **`explicitPlus`:**
  - The old and new forms accept the same strings: `\s*`, then optionally `(` and `\s*`, then optionally `฿` or `thb` and `\s*`, then `+`.
  - Each run of spaces now belongs to one `\s*`, and `(`, `฿` and `t` are not spaces. So a failed try gives back one space at a time, at constant cost.
- **`isDateFormat`:**
  - A bracketed section ends at the first `]` after its `[`. So every section lies at or before the last `]`, and past it nothing is stripped.
  - Up to the last `]`, every `[` finds its `]`, so the scans are disjoint.
- **`readDateStyles`:**
  - `isDateFormat` is pure and cannot throw, so judging a code when its `<numFmt>` is read gives the verdict the old code computed later.
  - A cell style still sees the same map: the last `<numFmt>` with its id read before the style.
  - A style with no custom format still falls back to the built-in ids. `custom.get(id) ?? ...` equals `custom.has(id) ? ... : ...`, because the map now holds only booleans.
  - The only change is when the check runs. Every `<numFmt>` is judged once, even one no style uses. The total is linear in the part's size.
- **Proof:** `PL/logs/differential.log`, 0 differences over 4,672,840 comparisons.
  - It now also compares every cell style's date decision from each side's own `readDateStyles` (with its own `isDateFormat` and XML tokenizer). That covers 7 hand-picked and 50,000 random `styles.xml` parts: numFmts before or after `cellXfs`, duplicate or missing ids, built-in ids, `cellStyleXfs`, nested `<xf>` children. Of the random parts, 19,834 have a date style and 38,541 a style that is no date.
  - The checker does find each behaviour mutant: F4 gave 170 differences, F6 64, F8 113 and F11 23.

### Margins of the new tests

All bounds are CPU time, not wall time. The child measures itself with `process.resourceUsage()`; the in-process cases use `process.cpuUsage()`.

| Case | RED (old code) | GREEN | GREEN with 36 busy processes on 18 cores | Bound |
|---|---|---|---|---|
| In process: 40 amounts of `(` + 9,980 spaces + `5` | 4,468 ms | 1.8 to 2.7 ms | 1.8 to 2.7 ms | 1,000 ms |
| In process: `buildRows`, 100 rows of `(` + 9,980 spaces + `1.00)` | 5,100 ms | 5.9 to 8.7 ms | 5.8 to 7.7 ms | 1,000 ms |
| In process: `readXlsx`, one format of 150,000 `[` | 8,553 ms | 1 to 2.7 ms | 0.9 to 2.2 ms | 1,000 ms |
| Child: 6 MB CSV (300 rows of each amount above) | `timeout` | 191 to 198 ms | 179 to 185 ms | 5,000 ms |
| Child: 2,665-byte XLSX, one format of 400,000 `[` | `timeout` | 129 to 135 ms | 118 to 122 ms | 5,000 ms |
| In process: `readXlsx`, one format of 1,000,000 characters shared by 3,500 styles | 5,578 ms | 5.6 to 9.3 ms | 5.8 to 8.5 ms | 1,000 ms |
| Child: 6,790-byte XLSX, the same format shared by 25,000 styles | `timeout` | 156 to 161 ms | 141 to 145 ms | 5,000 ms |

## Step 0: Start

1. `ls -d /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex`. If it is missing, stop: BLOCKED.
2. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex status --short` must print nothing.
3. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex branch --show-current` must print `fix/parser-regex`.
4. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex rev-parse --short HEAD`. Call the answer `HEAD_SHA`. It is `3ab5d42`, or later.
5. Check that P4-T10 is in the branch: `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex merge-base --is-ancestor 8c06e1a HEAD; echo $?` must print `0`.
   - If it prints `1`, run `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex fetch origin claude/p1a-vault-core`.
   - Then run `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex merge --no-edit origin/claude/p1a-vault-core`.
   - Then repeat this check, and set `HEAD_SHA` to the merged-in `origin/claude/p1a-vault-core` (`/usr/bin/git -C ... rev-parse --short origin/claude/p1a-vault-core`).
   - Still `1`, or any conflict: stop, BLOCKED.
6. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex/SHA256SUMS.start` must give 6 `OK`. Any `FAILED` means the base moved under these files: stop, BLOCKED, and name the files.
7. `ls /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex/apps/api/src/imports/parser-linear.spec.ts` must say "No such file".
8. `cd /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex && shasum -a 256 -c SHA256SUMS` must give 11 `OK`.
9. `mkdir -p /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-impl`
10. `node --version` (record it). Then `docker info > /dev/null 2>&1 && echo up || echo down`. Docker is stopped, so expect `down`. Do not start it.
11. If `WT/node_modules` is missing: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex && npm ci --ignore-scripts --no-audit --no-fund`.

## Step 1: Keep the old parsers for the differential check

`cp -R /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex/apps/api/src/imports/parsers /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-impl/orig-parsers`

## Step 2: The tests, then RED

1. `python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex/files/edit_tests.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex`
   - It prints `test edits applied: 3, parser-linear.spec.ts created`.
   - It applies Edits 4, 5a and 5b, and creates the spec (Edit 6). Appendix A quotes each.
   - If you prefer your Edit and Write tools, the result must be byte-identical. Step 3.2 checks it.
2. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex && npm run typecheck`: passes.
3. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex && npm run test:api -- parser-linear bank-statements > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-impl/red.log 2>&1`. It takes about 2 minutes: three child cases run to the 30 s deadline.
4. Expect `Test Suites: 1 failed, 1 passed, 2 total` and `Tests: 7 failed, 21 passed, 28 total`. The seven failures are all in `the parser reads long runs in linear time`, and all are assertions:
   - `an amount with a long run of spaces inside`: `toBeLessThan`, `Expected: < 1000`, `Received:` some thousands (the planner saw 4467.75);
   - `a parenthesized amount with a long run of spaces, checked for an explicit plus`: the same (5099.75);
   - `a custom number format of a long run of "["`: the same (8553.33);
   - `a long number format shared by many cell styles is judged once`: the same (5577.95);
   - `a CSV of such amounts parses in the child well inside the deadline`: `toMatchObject` received `"kind": "timeout"`;
   - `a workbook with such a number format parses in the child well inside the deadline`: the same;
   - `a workbook whose cell styles share one long number format parses in the child well inside the deadline`: the same.
5. The three cases of `the rewritten matching reads exactly as before` pass, and so does `bank-statements.spec.ts` (18). They pin today's behaviour, and the fix must keep it.
6. Anything else failing: stop and report it.

## Step 3: The fix, then GREEN

1. `python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex/files/edit_code.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex`
   - It prints `code edits applied: 4`.
   - These are Edits 1, 2, 3a and 3b in Appendix A.
2. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex/SHA256SUMS.final` must give 6 `OK`. If not, `cp` the failing file from `PL/verified/<same path>` and check again.
3. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex && npm run typecheck`: passes.
4. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex && npm run test:api -- parser-linear bank-statements > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-impl/green.log 2>&1`: `Tests: 28 passed, 28 total`.
5. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex && npm run test:api -- parser-linear bank-statements parse-server parser-runner parse-worker > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-impl/focused.log 2>&1`: `Test Suites: 5 passed, 5 total`, `Tests: 281 passed, 281 total`.

## Step 4: The differential check

`node --no-warnings /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex/files/differential.mjs /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-impl/orig-parsers /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex/apps/api/src/imports/parsers > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-impl/differential.log 2>&1; echo $?`

- Expect `0`.
- The log has 22 check lines, each with `"differences":0`, and one coverage line. It ends with `differential: 0 differences`. It equals `PL/logs/differential.log`, inputs included: the inputs are seeded.
- It compares old against new:
  - the THB strip, `parseAmountText` and `detectAmountConvention`;
  - `explicitPlus` and `buildRows`;
  - `isDateFormat`'s visible text and its answer;
  - every cell style's date decision from `readDateStyles`.

  Inputs are hand-picked, random and exhaustive.
- Any difference: stop and report it.

## Step 5: Mutation check

`python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex/files/mutate.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-impl/mutants > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-impl/mutants.log 2>&1`

- It takes about 5 minutes.
- Each mutant changes one exact string in one parser file and runs `npm run test -w gogospend-api -- parser-linear bank-statements`. Then it restores the file from its own copy.

The planner's run (`PL/logs/mutants.log`), every line `KILLED`:

| Mutant | File | Change | Tests | Fails |
|---|---|---|---|---|
| F1 | `amount.ts` | the THB suffix's leading `\s*` back | 2 failed, 26 passed, 28 total | the amount CPU case and the child CSV case |
| F2 | `table.ts` | the old explicit-plus regex | 2 failed, 26 passed | the explicit-plus CPU case and the child CSV case |
| F3 | `xlsx.ts` | the bracket strip over the whole format | 2 failed, 26 passed | the `"["` CPU case and the child workbook case |
| F4 | `amount.ts` | the THB marker anywhere, not only at the end | 1 failed, 27 passed | `a currency marker after the number, and only at the end` |
| F5 | `amount.ts` | no `บาท` in the suffix | 1 failed | the same |
| F6 | `table.ts` | no currency marker before the plus | 1 failed | `an explicit plus, with or without a currency marker before it, contradicts an expense` |
| F7 | `xlsx.ts` | the last `]` left out of the strip | 3 failed, 25 passed | `a custom number format is a date only when ...` and both bracket CPU cases |
| F8 | `xlsx.ts` | the text after the last `]` dropped | 1 failed | `a custom number format is a date only when ...` |
| F10 | `xlsx.ts` | each cell style judges its number format again: Edit 3b undone | 2 failed, 26 passed | `a long number format shared by many cell styles is judged once` and its child case |
| F11 | `xlsx.ts` | custom formats ignored, built-in ids only | 1 failed | `a custom number format is a date only when ...` |
| N1 | `bank.ts` | a digit allowed right before the mask (NIT-A) | 1 failed | `the bank helpers › reads the masked account from the first preamble cell holding one` |

- The last line must be `restored byte for byte: True`.
- A `SURVIVED` or `NOT APPLIED` line: stop and report it. Do not weaken a test.
- Then run `shasum -a 256 -c .../SHA256SUMS.final` from WT again: 6 `OK`.
- **One equivalent mutant, not in the runner:** dropping `(?:\(\s*)?` from `explicitPlus`. A `(` before a `+` never parses as an amount (`numberText` refuses a sign inside parentheses), and `explicitPlus` is only consulted for an amount that parsed. The differential's regex-level comparison still tells the two forms apart.

## Step 6: Gate (from WT)

1. `npm run typecheck`: passes.
2. `npm run test:api > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-impl/api.log 2>&1`
   - At `3ab5d42`, expect `Test Suites: 46 passed, 46 total` and `Tests: 990 passed, 990 total` (before: 45 and 980).
   - If `HEAD_SHA` is later and the integration added API tests, record what you see. The receipt reads it from this log.
   - If only a real-child case times out under the suite's load, run the suite once more and keep the passing log as `api.log`. Say so in your final message.
3. `npm run build -w gogospend-api`: `Successfully compiled: 296 files with swc`. That is 295 at the base plus the new spec.
4. `node apps/api/scripts/release-graph.mjs check`: `"files": 150`, `"closure_packages": 123`, `"problems": []`.
5. `node apps/api/scripts/parser-sandbox-check.cjs` (after the build): `"sandbox":{"supported":true}` and `"ok":true`.
6. SKIPPED, because Docker is stopped (do not start it): `npm run test:db -w gogospend-api`. Record "Docker is not running on this machine; CI runs it".
7. After the commit (Step 8): `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD` prints nothing.

## Step 7: Receipt (R87: its own file)

1. Write it: `python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex/files/receipt.py write /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex <HEAD_SHA> /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-impl`
   - It creates `docs/implementation/receipts/fix-parser-regex.md` from `PL/verified/docs/implementation/receipts/fix-parser-regex.md.template`.
   - It fills four things: `HEAD_SHA`, your RED `Tests:` line, your four RED CPU figures (from `red.log`), and your full-suite counts (from `api.log`).
   - It prints `receipt written: ...`.
2. Check it: `python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex/files/receipt.py check /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex <HEAD_SHA>`. It must print `receipt OK`. That proves:
   - the first line is `# fix-parser-regex: linear amount and sign matching`;
   - no placeholder is left;
   - the status names `HEAD_SHA`;
   - R89 is cited;
   - the RED line is `7 failed, 21 passed, 28 total`.
3. **If a count differs.** The receipt states the planner's other counts as fact: 281 focused, 296 files, 11 of 11 mutants, the differential totals. If you saw something different, change only that figure with your Edit tool and give the reason in its Deviations bullet. Then run the check again.
4. Do not edit `docs/implementation/premium-progress.md`.

The template, filled in for the planner's own run, is in Appendix B.

## Step 8: Commit

1. `cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex/files/commit-message.txt /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-impl/commit-message.txt`. Its text is below: a summary line of 59 characters, a body, a blank line, then the trailer.
2. Stage the seven paths: `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex add apps/api/src/imports/parsers/amount.ts apps/api/src/imports/parsers/table.ts apps/api/src/imports/parsers/xlsx.ts apps/api/src/imports/bank-statements.spec.ts apps/api/src/imports/fixtures/synthetic-parse.ts apps/api/src/imports/parser-linear.spec.ts docs/implementation/receipts/fix-parser-regex.md`
3. `/usr/bin/git -C ... status --short`. Expect only those seven, staged, the spec and the receipt as new (`A`). Nothing unstaged, nothing untracked.
4. `/usr/bin/git -C ... commit -F /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-impl/commit-message.txt`
5. `/usr/bin/git -C ... log --oneline -2`, then Step 6.7, then `receipt.py check` once more.

Do not push.

```text
Match amounts, plus signs and number formats in linear time

Three parser regexes took time quadratic in a run's length: the THB
suffix on spaces inside an amount, the explicit-plus check after "(",
and the bracket strip in a custom number format with no "]". And a
workbook's cell styles each judged their number format again, so one
long format code and many styles cost their product. A few megabytes
of CSV, or a workbook of a few kilobytes, held the shared parser
child until its deadline. Each now takes one pass and reads exactly
as before (ruling R89), and a test pins a digit right before a masked
account.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
```

## Your final message

As the protocol says:

- `STATUS: DONE` or `STATUS: BLOCKED` (with the exact blocker) on the first line.
- The commit SHA, the branch, and `HEAD_SHA`.
- The seven files.
- RED: 7 failed, 21 passed, 28 total, with your four CPU figures and the three timeouts. GREEN: 28, and 281 focused.
- The differential's last line.
- Mutants: 11 of 11 killed, restored.
- Each gate command with its counts, and `test:db` SKIPPED with the reason.
- The `receipt OK` line, and any count that differed and why.

## Appendix A: every edit

Each edit's find text occurs exactly once in its file at `3ab5d42`. The scripts refuse otherwise.

### Edit 1: `apps/api/src/imports/parsers/amount.ts`

Find:

```ts
const THB_SUFFIX = /\s*(?:฿|thb|บาท)$/i;
```

Replace with:

```ts
// The marker alone: numberText trims the spaces before it. A leading `\s*` here was
// tried from every space of a long run, quadratic in its length (fix-parser-regex, R89).
const THB_SUFFIX = /(?:฿|thb|บาท)$/i;
```

### Edit 2: `apps/api/src/imports/parsers/table.ts`

Find:

```ts
        explicitPlus = /^\s*\(?\s*(?:฿|thb)?\s*\+/i.test(amountText);
```

Replace with:

```ts
        // Each run of spaces is read by one `\s*` only: the old form split a run between
        // two, quadratic in its length (fix-parser-regex, R89).
        explicitPlus = /^\s*(?:\(\s*)?(?:(?:฿|thb)\s*)?\+/i.test(amountText);
```

### Edit 3a: `apps/api/src/imports/parsers/xlsx.ts`

Find:

```ts
function isDateFormat(code: string): boolean {
  const visible = code
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/[_*]./g, '')
    .replace(/\[[^\]]*\]/g, '')
    .toLowerCase();
  return /[yd]|[วดป]/.test(visible);
}
```

Replace with:

```ts
function isDateFormat(code: string): boolean {
  const unquoted = code
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/[_*]./g, '');
  // A bracketed section ends at a "]", so only the text up to the last "]" can hold one.
  // Past it, the strip scanned from every "[" to the end and failed: quadratic in the
  // run's length (fix-parser-regex, R89).
  const end = unquoted.lastIndexOf(']') + 1;
  const visible = (unquoted.slice(0, end).replace(/\[[^\]]*\]/g, '') + unquoted.slice(end)).toLowerCase();
  return /[yd]|[วดป]/.test(visible);
}
```

### Edit 3b: the same file, `readDateStyles` (R89 as extended)

Find:

```ts
  const custom = new Map<number, string>();
  const styles: boolean[] = [];
  let inCellXfs = false;
  let depth = 0;
  for (const event of xmlEvents(text)) {
    if (event.kind === 'open') {
      if (event.local === 'numFmt') custom.set(Number(event.attrs.numFmtId), event.attrs.formatCode ?? '');
      if (event.local === 'cellXfs' && !event.selfClosing) {
        inCellXfs = true;
        depth = 0;
      } else if (inCellXfs) {
        if (depth === 0 && event.local === 'xf') {
          const id = Number(event.attrs.numFmtId ?? 0);
          styles.push(custom.has(id) ? isDateFormat(custom.get(id) ?? '') : BUILTIN_DATE_FORMATS.has(id));
```

Replace with:

```ts
  // Each custom number format is judged once, when it is read; a cell style only looks
  // its verdict up. Judged again for every style that used it, one long format code and
  // many styles cost their product (fix-parser-regex, R89).
  const custom = new Map<number, boolean>();
  const styles: boolean[] = [];
  let inCellXfs = false;
  let depth = 0;
  for (const event of xmlEvents(text)) {
    if (event.kind === 'open') {
      if (event.local === 'numFmt') custom.set(Number(event.attrs.numFmtId), isDateFormat(event.attrs.formatCode ?? ''));
      if (event.local === 'cellXfs' && !event.selfClosing) {
        inCellXfs = true;
        depth = 0;
      } else if (inCellXfs) {
        if (depth === 0 && event.local === 'xf') {
          const id = Number(event.attrs.numFmtId ?? 0);
          styles.push(custom.get(id) ?? BUILTIN_DATE_FORMATS.has(id));
```

### Edit 4: `apps/api/src/imports/bank-statements.spec.ts` (NIT-A)

Find:

```ts
    // One mask character, fewer than four digits, or a word ending in x is no masked number.
    expect(preambleAccountLabel(rows(['x1234'], ['xx-123'], ['Fax 0212345678'], ['Taxx 1234']))).toBeNull();
```

Replace with:

```ts
    // One mask character, fewer than four digits, a word ending in x, or a mask right after a digit is no masked number.
    expect(preambleAccountLabel(rows(['x1234'], ['xx-123'], ['Fax 0212345678'], ['Taxx 1234'], ['1234xx5678']))).toBeNull();
```

### Edit 5a: `apps/api/src/imports/fixtures/synthetic-parse.ts`

Find:

```ts
  /** Raw XML for a shared string item, instead of escaping `rows`' strings (rich text, phonetic runs). */
  sharedStringItems?: string[];
};
```

Replace with:

```ts
  /** Raw XML for a shared string item, instead of escaping `rows`' strings (rich text, phonetic runs). */
  sharedStringItems?: string[];
  /** Raw xl/styles.xml instead of the default one (custom number formats). */
  stylesXml?: string;
};
```

### Edit 5b: the same file

Find (the start of one line; the rest of the line stays as it is):

```ts
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet
```

Replace with:

```ts
  const styles = options.stylesXml ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet
```

### Edit 6: new file `apps/api/src/imports/parser-linear.spec.ts`

Exactly this text (`PL/verified/apps/api/src/imports/parser-linear.spec.ts`):

```ts
import { parsingRunner } from './fixtures/parsing-runner';
import { buildXlsx, csv } from './fixtures/synthetic-parse';
import { detectAmountConvention, parseAmountText } from './parsers/amount';
import type { ParseFormat, ParseSuccess, SourceTable } from './parsers/protocol';
import { buildRows } from './parsers/table';
import { readXlsx } from './parsers/xlsx';

// The parser's text matching stays linear in its input (fix-parser-regex,
// ruling R89). Three regexes took time quadratic in a run's length:
//   - amount.ts's THB suffix, on a long run of spaces inside an amount;
//   - table.ts's explicit-plus check, on "(" and a long run of spaces;
//   - xlsx.ts's bracketed-section strip, on a number format of "[" with no "]".
// And xlsx.ts judged a custom number format again for every cell style using
// it, so one long format code and many styles cost their product.
// A few megabytes of CSV, or a workbook of a few kilobytes, held the shared parser child
// until its 30 s deadline. Each bound is CPU time, not wall time, so a busy
// runner does not inflate it. The rewritten matching must read every value
// exactly as before (the second block).

const TODAY = '2026-10-25';
const runner = parsingRunner();
// Before the fix, the child cases ran to the 30 s deadline.
jest.setTimeout(60_000);

async function parsed(format: ParseFormat, bytes: Uint8Array): Promise<ParseSuccess> {
  const outcome = await runner.run({ format, bytes, today: TODAY });
  expect(outcome).toMatchObject({ kind: 'result', result: { ok: true } });
  if (outcome.kind !== 'result' || !outcome.result.ok) throw new Error('unreachable: the assertion above failed');
  return outcome.result;
}

/** CPU milliseconds `run` takes in this process. */
function cpuMs(run: () => void): number {
  const before = process.cpuUsage();
  run();
  const used = process.cpuUsage(before);
  return (used.user + used.system) / 1_000;
}

/** "(", 9,980 spaces, "5": not an amount (invalid_amount); the THB suffix reads the whole run. */
const SPACED_AMOUNT = `(${' '.repeat(9_980)}5`;
/** "(", 9,980 spaces, "1.00)": the amount 1.00, negative; the explicit-plus check reads the whole run. */
const SPACED_PARENTHESIZED = `(${' '.repeat(9_980)}1.00)`;

const table = (lines: string[][]): SourceTable => ({ rows: lines.map((cells, index) => ({ n: index + 1, cells })), encoding: 'utf-8' });

/** A workbook whose date-styled cell (the serial of 2025-01-01) uses the custom number format `code`, as do `styles` cell styles. */
function workbookWithFormat(code: string, styles = 1): Buffer {
  const attribute = code.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return buildXlsx({
    sheets: [{ rows: [['date', 'amount'], [{ date: '45658' }, 5]] }],
    stylesXml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="${attribute}"/></numFmts><cellXfs count="${styles + 1}"><xf numFmtId="0"/>${'<xf numFmtId="164" applyNumberFormat="1"/>'.repeat(styles)}</cellXfs></styleSheet>`,
  });
}

describe('the parser reads long runs in linear time', () => {
  it('an amount with a long run of spaces inside', () => {
    const cells = Array<string>(40).fill(SPACED_AMOUNT);
    let codes: string[] = [];
    let convention: string | null = 'unset';
    const used = cpuMs(() => {
      codes = cells.map((cell) => {
        const parsedAmount = parseAmountText(cell);
        return parsedAmount.ok ? 'ok' : parsedAmount.code;
      });
      convention = detectAmountConvention(cells);
    });
    expect(new Set(codes)).toEqual(new Set(['invalid_amount']));
    expect(convention).toBeNull();
    // 80 reads of 10,000 characters: the backtracking suffix took seconds, one pass takes milliseconds.
    expect(used).toBeLessThan(1_000);
  });

  it('a parenthesized amount with a long run of spaces, checked for an explicit plus', () => {
    const rows = Array.from({ length: 100 }, () => ['24/10/2026', SPACED_PARENTHESIZED, 'expense']);
    let body: ReturnType<typeof buildRows> | null = null;
    const used = cpuMs(() => {
      body = buildRows(table([['Date', 'Amount', 'Type'], ...rows]), TODAY);
    });
    expect(body!.rows).toHaveLength(100);
    expect(body!.rows[0]).toMatchObject({ type: 'expense', amount_minor: '100' });
    expect(used).toBeLessThan(1_000);
  });

  it('a custom number format of a long run of "["', () => {
    const workbook = workbookWithFormat('['.repeat(150_000));
    let first: string[] = [];
    const used = cpuMs(() => {
      first = readXlsx(workbook).rows[1].cells;
    });
    // No y or d shows, so the cell is no date: its serial stays as written.
    expect(first[0]).toBe('45658');
    expect(used).toBeLessThan(1_000);
  });

  it('a long number format shared by many cell styles is judged once', () => {
    const workbook = workbookWithFormat('a'.repeat(1_000_000), 3_500);
    let first: string[] = [];
    const used = cpuMs(() => {
      first = readXlsx(workbook).rows[1].cells;
    });
    expect(first[0]).toBe('45658');
    // Judged again for each of 3,500 styles, the 1,000,000-character code took seconds.
    expect(used).toBeLessThan(1_000);
  });

  it('a CSV of such amounts parses in the child well inside the deadline', async () => {
    const lines = ['Date,Amount,Type'];
    for (let index = 0; index < 300; index += 1) lines.push(`24/10/2026,${SPACED_AMOUNT},expense`, `24/10/2026,${SPACED_PARENTHESIZED},expense`);
    const result = await parsed('csv', csv(lines));
    expect(result.rows).toHaveLength(600);
    expect(result.rows[0].issues).toContainEqual({ field: 'amount_minor', code: 'invalid_amount' });
    expect(result.rows[1]).toMatchObject({ type: 'expense', amount_minor: '100' });
    // The CPU time the child measured itself: the backtracking regexes ran this 6 MB file past the deadline.
    expect(result.usage.cpu_ms).toBeLessThan(5_000);
  });

  it('a workbook with such a number format parses in the child well inside the deadline', async () => {
    const result = await parsed('xlsx', workbookWithFormat('['.repeat(400_000)));
    expect(result.rows).toEqual([expect.objectContaining({ source_row_id: 'row:2', amount_minor: '500' })]);
    expect(result.rows[0].issues).toContainEqual({ field: 'occurred_on', code: 'invalid_date' });
    // A workbook under 3 KB: the backtracking strip ran it past the deadline.
    expect(result.usage.cpu_ms).toBeLessThan(5_000);
  });

  it('a workbook whose cell styles share one long number format parses in the child well inside the deadline', async () => {
    const result = await parsed('xlsx', workbookWithFormat('a'.repeat(1_000_000), 25_000));
    expect(result.rows).toEqual([expect.objectContaining({ source_row_id: 'row:2', amount_minor: '500' })]);
    // A workbook under 7 KB: judging the code once per style ran it past the deadline.
    expect(result.usage.cpu_ms).toBeLessThan(5_000);
  });
});

describe('the rewritten matching reads exactly as before', () => {
  it('a currency marker after the number, and only at the end', () => {
    const read = (text: string) => {
      const result = parseAmountText(text);
      return result.ok ? `${result.negative ? '-' : ''}${result.minor}` : result.code;
    };
    expect(read('120 thb')).toBe('12000');
    expect(read('120THB')).toBe('12000');
    expect(read('1000 บาท')).toBe('100000');
    expect(read('1000 \tบาท')).toBe('100000');
    expect(read('(5 ฿)')).toBe('-500');
    expect(read('-120 บาท')).toBe('-12000');
    expect(read('฿ 12 ฿')).toBe('1200');
    // A marker inside the number is no marker.
    expect(read('1 thb 2')).toBe('invalid_amount');
    expect(read('12บาท3')).toBe('invalid_amount');
    expect(read('thb')).toBe('invalid_amount');
  });

  it('an explicit plus, with or without a currency marker before it, contradicts an expense', () => {
    const body = buildRows(
      table([['date', 'type', 'amount'], ['2026-10-24', 'expense', '+5'], ['2026-10-24', 'expense', 'thb +5'], ['2026-10-24', 'expense', '฿ + 5'], ['2026-10-24', 'expense', '5 +'], ['2026-10-24', 'expense', '5'], ['2026-10-24', 'expense', '(5)']]),
      TODAY,
    );
    // (No wallet column, so every row also has missing_wallet.)
    expect(body.rows.map((row) => [row.type, row.amount_minor, row.issues.map((issue) => issue.code).join(',')])).toEqual([
      [null, '500', 'type_conflict,missing_wallet'],
      [null, '500', 'type_conflict,missing_wallet'],
      [null, '500', 'type_conflict,missing_wallet'],
      ['expense', null, 'invalid_amount,missing_wallet'],
      ['expense', '500', 'missing_wallet'],
      ['expense', '500', 'missing_wallet'],
    ]);
  });

  it('a custom number format is a date only when y or d shows outside quotes and brackets', () => {
    const cell = (code: string) => readXlsx(workbookWithFormat(code)).rows[1].cells[0];
    // Dates: the serial reads as 2025-01-01.
    expect(cell('d/m/yyyy')).toBe('2025-01-01');
    expect(cell('[$-th-TH]d mmm yyyy')).toBe('2025-01-01');
    expect(cell('[Red]0;[Blue]dd')).toBe('2025-01-01');
    // An unclosed "[" hides nothing after it.
    expect(cell('[d')).toBe('2025-01-01');
    expect(cell('[h]:mm[d')).toBe('2025-01-01');
    // Not dates: the serial stays as written.
    expect(cell('[Red]#,##0.00')).toBe('45658');
    expect(cell('[Red][Blue]0.00')).toBe('45658');
    expect(cell('"day "0')).toBe('45658');
    expect(cell('[[d]0')).toBe('45658');
    expect(cell('0.00')).toBe('45658');
  });
});
```

## Appendix B: the receipt, filled in for the planner's run (`HEAD_SHA` `3ab5d42`)

Yours comes from `receipt.py`, with your own RED figures and suite counts.

````markdown
# fix-parser-regex: linear amount and sign matching

- **Status:** built and verified locally on `fix/parser-regex` (`.claude/worktrees/fix-parser-regex`), cut from `origin/claude/p1a-vault-core` at `3ab5d42`, after P4-T10 (#345) merged. Not pushed. The independent review is the controller's.
- **Why:** the P4-T10 confirming review (`.claude/controller/reviews/P4-T10-confirm.md`, MIN-A) found regexes in the parser child whose time grows with the square of a run's length. A few megabytes of CSV, or a workbook of a few kilobytes, held the shared parser child until its 30 s deadline.
- **Ruling R89** (controller, 8 November 2026) allows this fix in the frozen `apps/api`, limited to:
  - the parser's regexes: `THB_SUFFIX` in `amount.ts`, `explicitPlus` in `table.ts`, and any other regex in `apps/api/src/imports/parsers/` proven slow;
  - the review's NIT-A test;
  - as extended the same day, `readDateStyles` in `xlsx.ts`, which judged a custom number format again for every cell style that used it.
- **Files:**
  - `apps/api/src/imports/parsers/amount.ts`: `THB_SUFFIX` is `/(?:฿|thb|บาท)$/i`. The leading `\s*` is gone: `numberText` already trims the spaces before the marker.
  - `apps/api/src/imports/parsers/table.ts`: `explicitPlus` is `/^\s*(?:\(\s*)?(?:(?:฿|thb)\s*)?\+/i`. It reads the same strings, with no two `\s*` side by side.
  - `apps/api/src/imports/parsers/xlsx.ts`:
    - `isDateFormat` strips bracketed sections only up to the last `]`, then keeps the rest as it is. This is the sweep's third find: `/\[[^\]]*\]/g` scanned from every `[` to the end of a format code with no `]`.
    - `readDateStyles` judges each custom number format once, when it reads the `<numFmt>`. A cell style now only looks the verdict up.
  - `apps/api/src/imports/parser-linear.spec.ts` (new, 10 tests):
    - seven CPU-time cases: four in process, under 1,000 ms; three through the real sandboxed child, `cpu_ms` under 5,000;
    - three equivalence cases: currency markers, the explicit plus, custom number formats.
  - `apps/api/src/imports/fixtures/synthetic-parse.ts`: `buildXlsx` takes an optional `stylesXml` (custom number formats).
  - `apps/api/src/imports/bank-statements.spec.ts`: the masked-account case adds `1234xx5678` (a mask right after a digit) to its null cases (review NIT-A).
- **The sweep** (`files/sweep.mjs` in the planner's folder):
  - Every regex in `apps/api/src/imports/parsers/` (55, including `date.ts`'s built ones) was pumped with long runs: 20 by 4 surroundings, 54 run units, 1,000 and 10,000 repeats.
  - Only `THB_SUFFIX`, `explicitPlus` and the bracket strip grew faster than linearly. With the three rewritten forms, none does.
  - The XML tokenizer, the date patterns (after their whitespace collapse), the ZIP and part-name patterns and the remaining amount patterns are linear.
  - The repeated check per cell style in `readDateStyles` is no regex shape; the sweep cannot see it. It was found while probing the styles part, and R89 was extended to it.
- **Same reading as before** (`files/differential.mjs`, old parsers against new): 0 differences. It compared:
  - the THB strip and `parseAmountText` on 31 hand-picked, 300,000 random and 177,156 exhaustive inputs, and `detectAmountConvention` on 50,000 random sets;
  - `explicitPlus` on 21 hand-picked, 300,000 random and 299,593 exhaustive inputs, and `buildRows` on 20,000 random generic tables;
  - `isDateFormat`'s visible text and its answer on 29 hand-picked, 300,000 random and 960,800 exhaustive codes;
  - `readDateStyles`, every cell style's date decision, on 7 hand-picked and 50,000 random `styles.xml` parts. Of the random parts, 19,834 have a date style and 38,541 a style that is no date.
- **RED to GREEN:**
  - RED, the tests on the code at `3ab5d42`: `npm run test:api -- parser-linear bank-statements` gave `Tests: 7 failed, 21 passed, 28 total`. All seven failures are assertions:
    - the four in-process cases took 4,468, 5,100, 8,553 and 5,578 ms of CPU (amount, explicit plus, number format, shared format) against the 1,000 ms bound;
    - the three child cases ended in `"kind": "timeout"`.
  - GREEN: 28 passed. `npm run test:api -- parser-linear bank-statements parse-server parser-runner parse-worker`: 281 passed.
- **Mutation check** (`files/mutate.py`): 11 mutants, 11 killed, every file restored byte for byte.
  - F1, F2 and F3 restore each old pattern, and each fails two CPU cases.
  - F4 (the THB marker anywhere) and F5 (no `บาท`) fail the currency-marker case.
  - F6 (no marker before the plus) fails the explicit-plus case.
  - F7 (the last `]` left out) fails the number-format case and both bracket CPU cases.
  - F8 (the text after the last `]` dropped) fails the number-format case.
  - F10 restores the check per cell style, and fails both shared-format CPU cases.
  - F11 (custom formats ignored) fails the number-format case.
  - N1 (a digit allowed before the mask) fails the masked-account case.
  - One mutant is equivalent and not run: dropping `(?:\(\s*)?` from `explicitPlus`. A `(` before a `+` never parses as an amount (`numberText` refuses a sign inside parentheses), so the check is never consulted. The differential's regex-level comparison still tells the two apart.
- **Gate** (worktree root):
  - `npm run typecheck`: passed.
  - `npm run test:api`: `Test Suites: 46 passed, 46 total`, `Tests: 990 passed, 990 total` (before: 45 suites, 980 tests).
  - `npm run build -w gogospend-api`: `Successfully compiled: 296 files with swc`.
  - `node apps/api/scripts/release-graph.mjs check`: `"files": 150`, `"closure_packages": 123`, `"problems": []`.
  - `node apps/api/scripts/parser-sandbox-check.cjs`: `"sandbox":{"supported":true}`, `"ok":true`.
  - `git diff --check origin/claude/p1a-vault-core...HEAD`: no output.
- **Deviations:** none.
- **SKIPPED:** `npm run test:db -w gogospend-api`. Docker is not running on this machine; CI runs it. This change has no database code. Nothing deployed; no cloud resource.
- **Notes for later:**
  - Fixed here, under R89 as extended: `readDateStyles` (`xlsx.ts`) ran `isDateFormat` once per cell style `<xf>`, not once per number format. With a format code of 1,000,000 characters and 25,000 styles that use it, a workbook of 6,790 bytes (the new child case) reached the 30 s deadline. It now parses in 140 to 170 ms of child CPU.
  - A test named `parser-regex...` would collide with this worktree's own path in a jest path pattern: jest matches the absolute path. That is why the new spec is `parser-linear.spec.ts`.
````

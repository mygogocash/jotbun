# Brief fix-parser-regex-followup: six tests that pin the rewritten parser matching (R89)

You are the implementer (Haiku) for a small, **test-only** follow-up to `fix-parser-regex` (PR #350, merged as `52632f2`).

The review of that fix found six mutants of the lines it changed in `apps/api/src/imports/parsers/xlsx.ts` that pass every committed test. The code is right: the review's differential check found no difference from the old parsers. But nothing in CI stops a later edit from bringing one of them back. You add one test for each, prove each test kills its mutant, correct a few counts in the first receipt, write this round's receipt and commit.

**Controller ruling (R89, as applied to this follow-up, 8 November 2026):**
- Only the spec `apps/api/src/imports/parser-linear.spec.ts` and the receipts may change.
- No source file changes. Not `xlsx.ts`, not the fixture `apps/api/src/imports/fixtures/synthetic-parse.ts`, nothing else.
- The spec sits in `apps/api/src/imports/`, not in `parsers/`.

Read first:
1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`.
   - R87: your receipt is its own new file, `docs/implementation/receipts/fix-parser-regex-followup.md`. You do not edit `premium-progress.md`.
   - This is maintenance with no plan task: this brief is the spec.
2. The review: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/fix-parser-regex.md`, MIN-1 and NIT-1.

## Paths and rules

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex-tests`.
  - Its branch is `fix/parser-regex-tests`, which the orchestrator made from `origin/claude/p1a-vault-core` at `52632f2`.
  - Work only here. If WT does not exist, stop: BLOCKED.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-followup-impl`, your scratch folder.
  - Create it with `mkdir -p`. Logs go there.
  - Never put logs under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-followup-planner`, the planner's folder. Read it and run its scripts, but never write into it. It holds:
  - `verified/apps/api/src/imports/parser-linear.spec.ts`: the final spec, which you copy;
  - `verified/docs/implementation/receipts/fix-parser-regex.md`: the first receipt with NIT-1's counts corrected, which you copy;
  - `verified/docs/implementation/receipts/fix-parser-regex-followup.md`: this round's receipt, filled with the planner's figures, which you copy and then check against your own;
  - `files/mutate.py`: the mutant runner;
  - `files/commit-message.txt`: the commit message;
  - `files/make_spec.py`: how the planner built the spec, which you do not run;
  - `SHA256SUMS`: covers the files above and the next two;
  - `SHA256SUMS.start`: four files at `52632f2`;
  - `SHA256SUMS.final`: five files after your change;
  - `logs/`: the planner's own runs.
- **Git:** `/usr/bin/git -C WT ...`, one plain command per call. Type the full path every time: zsh variables do not survive between calls.
- **npm:** `cd WT && npm run ...`.
- **Jest path patterns:** never use one that contains `parser-regex`. Jest matches the absolute path, and WT's own path contains `fix-parser-regex-tests`, so such a pattern would match every spec. Use `parser-linear` and the other names exactly as written below.
- **Heavy lock:** none of these commands needs it. `test:db` is SKIPPED: Docker is stopped and stays stopped.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass.

## Step 0: Start

1. `ls -d /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex-tests`. If it is missing: BLOCKED.
2. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex-tests status --short`. Expected: no output.
3. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex-tests branch --show-current`. Expected: `fix/parser-regex-tests`.
4. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex-tests rev-parse --short HEAD`. Expected: `52632f2`.
   - If it is later, that is fine as long as check 5 passes. Record it as `HEAD_SHA` either way.
5. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex-tests && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-followup-planner/SHA256SUMS.start`. Expected: 4 `OK`. Any `FAILED` means the base moved under these files: BLOCKED, and name the files.
6. `cd /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-followup-planner && shasum -a 256 -c SHA256SUMS`. Expected: 8 `OK`.
7. `mkdir -p /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-followup-impl`
8. `node --version`, and record it.
9. If `WT/node_modules` is missing: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex-tests && npm ci --ignore-scripts --no-audit --no-fund > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-followup-impl/npm-ci.log 2>&1`

## Step 1: The committed tests, before the change

`cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex-tests && npm run test:api -- parser-linear bank-statements > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-followup-impl/before.log 2>&1`

Expected: `Test Suites: 2 passed, 2 total` and `Tests: 28 passed, 28 total`.

## Step 2: The new spec, then GREEN

1. `cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-followup-planner/verified/apps/api/src/imports/parser-linear.spec.ts /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex-tests/apps/api/src/imports/parser-linear.spec.ts`
   - Appendix A shows exactly what this adds.
   - If you prefer your own Edit tool, the result must be byte-identical. Step 4 checks it.
2. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex-tests && npm run typecheck > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-followup-impl/typecheck.log 2>&1`. Expected: exit 0.
3. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex-tests && npm run test:api -- parser-linear bank-statements > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-followup-impl/green.log 2>&1`.
   - Expected: `Test Suites: 2 passed, 2 total` and `Tests: 34 passed, 34 total`. That is 28 + 6.
4. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex-tests status --short`. Expected: exactly ` M apps/api/src/imports/parser-linear.spec.ts`.

## Step 3: RED, by mutant

The new tests pin code that is already right, so they pass at once. Their RED is that each one fails on its mutant.

`cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex-tests && python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-followup-planner/files/mutate.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex-tests /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-followup-impl/mutants > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-followup-impl/mutants.log 2>&1`

- How it works: each mutant replaces one exact string in `apps/api/src/imports/parsers/xlsx.ts`, runs `npm run test -w gogospend-api -- parser-linear`, and restores the file from its own copy.
- It takes about a minute. X10 alone runs about 9 s.
- A line says `KILLED` only when the run fails and the mutant's named new test is among the failures.

Expected, as in the planner's run (`PL/logs/mutants.log`):

| Mutant | Change in `xlsx.ts` | Tests | Fails (each `the rewritten matching reads exactly as before ›` unless marked) |
|---|---|---|---|
| X1 | `styles.push(custom.get(id) ?? ...)` becomes `\|\|` | 1 failed, 15 passed, 16 total | `a custom number format replaces a built-in one with the same id` |
| X2 | the first `<numFmt>` with an id wins (`&& !custom.has(...)`) | 1 failed, 15 passed | `of two number formats with one id, the last one counts` |
| X3 | `lastIndexOf(']')` becomes `indexOf(']')` | 1 failed, 15 passed | `a second bracketed section hides its letters too` |
| X4 | `unquoted.slice(end)` becomes `unquoted.slice(end + 1)` | 2 failed, 14 passed | `a date letter counts right after the last "]", and in a code with no "]"`, and `of two number formats with one id, the last one counts` |
| X9 | `formatCode ?? ''` becomes `formatCode ?? 'd'` | 1 failed, 15 passed | `a number format without a code is no date` |
| X10 | `end` becomes `unquoted.includes(']') ? unquoted.length : 0` (quadratic again) | 1 failed, 15 passed | `the parser reads long runs in linear time › a custom number format of "]" and then a long run of "["` |

- The last line must be `restored byte for byte: True`.
- A `SURVIVED` or `NOT APPLIED` line: BLOCKED, with the log. Do not weaken a test.
- Then `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex-tests status --short`. Expected: still only the spec modified.

## Step 4: The receipts, then the final checksums

1. The first receipt, with NIT-1's counts corrected. It now gives 18 prefixes by 4 suffixes and 52 run units, and 58 regexes, which is 54 literals plus `date.ts`'s 4 built ones, of which the sweep pumped 55:

   `cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-followup-planner/verified/docs/implementation/receipts/fix-parser-regex.md /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex-tests/docs/implementation/receipts/fix-parser-regex.md`

   Appendix B shows the change: one bullet becomes two. The review said "54 run units" too, but the planner's `sweep.mjs` has 52, so 52 it is.
2. This round's receipt (new file):

   `cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-followup-planner/verified/docs/implementation/receipts/fix-parser-regex-followup.md /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex-tests/docs/implementation/receipts/fix-parser-regex-followup.md`
3. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex-tests && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-followup-planner/SHA256SUMS.final`.
   - Expected: 5 `OK`: the spec, both receipts, and `xlsx.ts` and `synthetic-parse.ts` unchanged.

## Step 5: Gate (from WT)

Log each command to S.

1. `npm run typecheck`. Expected: exit 0.
2. `npm run test:api -- parser-linear bank-statements parse-server parser-runner parse-worker > S/focused.log 2>&1` (type the full S path). Expected: `Test Suites: 5 passed, 5 total` and `Tests: 287 passed, 287 total` (281 before).
3. `npm run test:api > S/api.log 2>&1`. Expected: `Test Suites: 47 passed, 47 total` and `Tests: 1000 passed, 1000 total`. At `52632f2` the planner saw 47 suites and 994 tests.
   - If only a real-child case times out under the suite's load, run the suite once more and keep the passing log. Say so in your final message.
4. `npm run build -w gogospend-api > S/build.log 2>&1`. Expected: `Successfully compiled: 298 files with swc`. The count is the same as at `52632f2`, because no file is added.
5. `node apps/api/scripts/release-graph.mjs check > S/release-graph.log 2>&1`. Expected: `"files": 150`, `"closure_packages": 123`, `"problems": []`.
6. `node apps/api/scripts/parser-sandbox-check.cjs > S/sandbox.log 2>&1` (after the build). Expected: `"sandbox":{"supported":true}` and `"ok":true`.
7. SKIPPED: `npm run test:db -w gogospend-api`. Record "Docker is not running on this machine; CI runs it".
8. After the commit (Step 7): `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex-tests diff --check origin/claude/p1a-vault-core...HEAD`. Expected: no output.

## Step 6: Check the receipt against your own logs

The receipt you copied states the planner's figures:
- 28 before and 34 after;
- the six mutant lines;
- 287 focused;
- 47 suites and 1000 tests, against 994 at `52632f2`;
- 298 files;
- the release graph and the sandbox check.

Compare each figure with your own logs. If one differs:
- change only that figure in `WT/docs/implementation/receipts/fix-parser-regex-followup.md`, with your Edit tool;
- replace `- **Deviations:** none.` with a bullet that names the figure and the reason;
- note that `SHA256SUMS.final` will then fail for that one file, which is expected only in this case.

If `HEAD_SHA` is not `52632f2`, also correct the Status line's `52632f2` and say so under Deviations.

The CPU margin bullet is the planner's measurement; leave it as written:
- the new case took 1.3 to 4.6 ms idle and 1.6 to 2.1 ms with 36 busy processes on 18 cores;
- the bound is 1,000 ms;
- under X10 it took 8,520 ms.

## Step 7: Commit

1. `cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-followup-planner/files/commit-message.txt /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-followup-impl/commit-message.txt`. The text is below.
2. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-parser-regex-tests add apps/api/src/imports/parser-linear.spec.ts docs/implementation/receipts/fix-parser-regex.md docs/implementation/receipts/fix-parser-regex-followup.md`
3. `/usr/bin/git -C ... status --short` (full path). Expected: exactly those three paths, staged. The new receipt shows as `A`. Nothing is unstaged or untracked.
4. `/usr/bin/git -C ... commit -F /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-followup-impl/commit-message.txt`
5. `/usr/bin/git -C ... log --oneline -2`, then Step 5.8, then `/usr/bin/git -C ... status --short`. Expected: no output.

Do not push.

```text
Pin the parser's number-format reading with six more tests

The review of the linear-matching fix found six mutants of its new
lines that no test caught: a custom format over a built-in id, a
repeated format id, a format without a code, a second bracketed
section, a date letter right after the last "]", and a strip over the
whole code once it holds a "]". Each now fails a new test, and the
first receipt's sweep counts are corrected (ruling R89).

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
```

## Your final message

As the protocol says:
- `STATUS: DONE` or `STATUS: BLOCKED` (with the exact blocker) on the first line.
- The commit SHA, the branch, and `HEAD_SHA`.
- The three files.
- Before: 28. GREEN: 34, and 287 focused.
- Mutants: 6 of 6 killed, each by what, and `restored byte for byte: True`.
- Each gate command with its counts, and `test:db` SKIPPED with the reason.
- Any figure that differed from this brief, and why.

## Appendix A: what the spec adds (the copied file is the authority)

Three insertions into `apps/api/src/imports/parser-linear.spec.ts`. Nothing else in the file changes.

### A1: two helpers, right after the closing `}` of `workbookWithFormat`

```ts

/** The date-styled cell (the serial of 2025-01-01) as read when its number format is the custom `code`. */
const formatCell = (code: string): string => readXlsx(workbookWithFormat(code)).rows[1].cells[0];

/** The date-styled cell (the serial of 2025-01-01) of a workbook whose cell style uses number format `id`, with the raw `<numFmt>` elements `numFmts`. */
function cellWithNumFmts(numFmts: string, id: number): string {
  const workbook = buildXlsx({
    sheets: [{ rows: [['date', 'amount'], [{ date: '45658' }, 5]] }],
    stylesXml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts>${numFmts}</numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="${id}" applyNumberFormat="1"/></cellXfs></styleSheet>`,
  });
  return readXlsx(workbook).rows[1].cells[0];
}
```

The fixture puts the date cell on style 1 (`s="1"`), which is the second `<xf>`.

### A2: the CPU case, right after `it('a custom number format of a long run of "["', ...)`

It uses the same measure (`cpuMs`, which is `process.cpuUsage`) and the same bound (`toBeLessThan(1_000)`) as the four in-process cases.

```ts

  it('a custom number format of "]" and then a long run of "["', () => {
    const workbook = workbookWithFormat(`]${'['.repeat(150_000)}`);
    let first: string[] = [];
    const used = cpuMs(() => {
      first = readXlsx(workbook).rows[1].cells;
    });
    expect(first[0]).toBe('45658');
    // Only the text up to the last "]" is stripped. A strip over the whole code once it holds
    // a "]" scanned from every "[" after it to the end again: seconds, not milliseconds.
    expect(used).toBeLessThan(1_000);
  });
```

### A3: five cases at the end of `describe('the rewritten matching reads exactly as before', ...)`, after the `a custom number format is a date only when ...` case

```ts

  it('a second bracketed section hides its letters too', () => {
    // "yellow" and "systime" sit inside the second brackets, so neither code shows a y or a d.
    expect(formatCell('[Red][Yellow]0.00')).toBe('45658');
    expect(formatCell('[Color10][$-x-systime]h:mm:ss')).toBe('45658');
  });

  it('a date letter counts right after the last "]", and in a code with no "]"', () => {
    expect(formatCell('[Red]d')).toBe('2025-01-01');
    expect(formatCell('d')).toBe('2025-01-01');
  });

  it('a custom number format replaces a built-in one with the same id', () => {
    // 14 is a built-in date format; redefined as "0.00", it is no date.
    expect(cellWithNumFmts('<numFmt numFmtId="14" formatCode="0.00"/>', 14)).toBe('45658');
    expect(cellWithNumFmts('', 14)).toBe('2025-01-01');
  });

  it('of two number formats with one id, the last one counts', () => {
    expect(cellWithNumFmts('<numFmt numFmtId="164" formatCode="d"/><numFmt numFmtId="164" formatCode="0.00"/>', 164)).toBe('45658');
    expect(cellWithNumFmts('<numFmt numFmtId="164" formatCode="0.00"/><numFmt numFmtId="164" formatCode="d"/>', 164)).toBe('2025-01-01');
  });

  it('a number format without a code is no date', () => {
    expect(cellWithNumFmts('<numFmt numFmtId="164"/>', 164)).toBe('45658');
  });
```

## Appendix B: the first receipt's change (NIT-1)

In `docs/implementation/receipts/fix-parser-regex.md`, this line:

```text
  - Every regex in `apps/api/src/imports/parsers/` (55, including `date.ts`'s built ones) was pumped with long runs: 20 by 4 surroundings, 54 run units, 1,000 and 10,000 repeats.
```

becomes these two:

```text
  - The parsers hold 58 regexes: 54 literals plus `date.ts`'s 4 built ones. The sweep pumped 55 of them with long runs: 18 prefixes by 4 suffixes, 52 run units, 1,000 and 10,000 repeats.
  - The three it left out are linear: `bank.ts`'s `/\s/` and `/[A-Za-z0-9]/` each test one character, and `date.ts`'s `/\./g` runs on the constant month names. The review's own sweep pumped all 58 (corrected in `fix-parser-regex-followup`).
```

## Appendix C: the planner's proof (`PL/logs/`)

- **Copies:** `base/` is `git archive 52632f2` (from a shared bare clone in PL, so nothing ran in the main checkout), with a real `npm ci --ignore-scripts`. `work/` is `base/` with the three files above.
- **Before** (`base-focused.log`): 28 passed.
- **GREEN** (`green.log`): 34 passed. `typecheck.log`: passed.
- **Mutants** (`mutants.log`): the table in Step 3, `restored byte for byte: True`.
- **Focused five** (`focused.log`): 287 passed.
- **Full suite:** `api-base.log` has 47 suites and 994 tests; `api.log` has 47 suites and 1000 tests.
- **Build and checks:** `build.log` compiled 298 files; `release-graph.log` gives 150, 123 and `[]`; `sandbox.log` is OK.
- **The new CPU case's CPU time,** from a scratch copy of the spec that logged each bounded value and was deleted afterwards:
  - `margins-idle-1..3.log`: 1.27, 4.60, 1.68 ms;
  - `margins-loaded-1..3.log`, with 36 busy processes on 18 cores and a load average of 75: 2.07, 1.63, 1.95 ms;
  - `margins-x10.log`, under X10: 8,519.5 ms;
  - so there is over 200x headroom against the 1,000 ms bound, and X10 misses the bound by 8.5x.
- **The other bounded cases in the same runs:** in process 2.3 to 21.3 ms; in the child 227 to 323 ms against 5,000.

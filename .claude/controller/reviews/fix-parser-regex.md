# Review: fix-parser-regex "linear amount and sign matching" (apps/api, ruling R89)

- Branch `fix/parser-regex` (worktree `.claude/worktrees/fix-parser-regex`), PR #350. Commit `16bf264`, directly on `020c391`; there is no merge commit on top. Range reviewed: `origin/claude/p1a-vault-core...16bf264`, merge base `020c391`, 7 files.
- Reviewer: Opus, read-only. Nothing in any worktree was edited, committed or merged. This review was taken over from a reviewer that died with the controller at 18:41. Its scratch copies were checked against `git archive` before reuse. Every check whose result its transcript did not show was rerun here (its own mutant run).
- Integration head now: `c2d6d9d`. Between `020c391` and `c2d6d9d`, nothing under `apps/api/src/imports/` changed, and neither did the receipt. Only five `apps/api` test files and test helpers changed. A trial merge (`git merge-tree --write-tree origin/claude/p1a-vault-core HEAD`) is clean. PR #350 is `MERGEABLE`, and all three checks pass on `16bf264`.
- Spec: the brief `briefs/fix-parser-regex.md` (ruling R89 and its extension to `readDateStyles`), protocol rules R87 and "Reviewers (Opus)", and the P4-T10 confirming review's MIN-A and NIT-A.
- Scratch: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/fix-parser-regex-review/`
  - `head/` is `git archive 16bf264`, with the worktree's `node_modules` cloned in (`cp -Rc`, real files, not symlinks). It is built.
  - `base/` is `git archive 020c391`.
  - `red/` is `head/` with `base/`'s parsers.
  - `mutrun/` is a clone of `head/` for mutant runs. It is restored and equal to `head/` (checked with `diff -r`).
  - `mut/` holds per-mutant parser copies for the differential.
  - `probes/` holds the scripts named below. `logs/` holds their output.

## Findings

### Blocker

None.

### Major

None.

### Minor

**MIN-1. The committed tests leave six mutants of the changed lines alive. The behaviour they would break is pinned only by the uncommitted differential.**

- I ran 13 mutants of my own on `mutrun/` (`probes/mymutants2.py`, `logs/mymutants2.log`), using the same focused command as the brief: `npm run test:api -- parser-linear bank-statements`. Six survive, each with `28 passed`. The last line is `restored byte for byte: True`.

  | Mutant | Changed line | Survives because | Differential (`probes/mutdiff.py`, `mutdiff2.py`) |
  |---|---|---|---|
  | X1: `custom.get(id) ?? BUILTIN...` becomes `\|\|` | `xlsx.ts:193` | No test has a custom format that is no date under a built-in date id (for example `<numFmt numFmtId="14" formatCode="0.00"/>`). | 1,104 differences (`styles-or`) |
  | X2: the first `<numFmt>` with an id wins, not the last | `xlsx.ts:186` | No test has a duplicated id. | 852 differences |
  | X3: `indexOf(']')`, not `lastIndexOf` | `xlsx.ts:51` | No case has a second bracketed section that hides a `y` or a `d`. `[Red][Blue]0.00` shows none either way. | 105,937 differences |
  | X4: one character after the last `]` dropped (`slice(end + 1)`) | `xlsx.ts:52` | Every date case still shows a date letter after the dropped character (`[d` keeps `d`, `d/m/yyyy` keeps `yyyy`). | 5,474,298 differences (`d/m/yyyy` reads as `/m/yyyy`, `[]d` turns from date to no date) |
  | X9: a `<numFmt>` without `formatCode` judged as `'d'` | `xlsx.ts:186` | No test has a `<numFmt>` without a code. | 893 differences |
  | X10: the strip runs over the whole code whenever any `]` exists | `xlsx.ts:51` | The CPU cases use only `[` runs with no `]`. | 0 differences, so the behaviour is the same, but the strip is quadratic again on `]` + `[` × N. The old code took 0.71 ms at N 1,000 and 40.15 ms at N 10,000 (`logs/linear.log`). |

- Why this matters: protocol step 5 says "add a test for every survivor, or explain why it is equivalent". The implementer ran only the planner's 11 mutants, which never touch these lines in these ways, so nobody saw these survivors.
  - The shipped code is right. My differential finds 0 differences (below).
  - What is missing is regression protection. A later edit that "simplifies" `??` to `||`, or swaps `lastIndexOf` for `indexOf`, would pass CI.
- Suggested fix, in `parser-linear.spec.ts` only. That spec is new in this PR, and the change adds test lines only. Whether it goes in this PR or a follow-up is the controller's call under R89:
  - Kill X3: `cell('[Red][Yellow]0.00')` stays `'45658'`.
  - Kill X4: `cell('d')` and `cell('[Red]d')` read as `'2025-01-01'`.
  - Kill X1, X2 and X9: give the workbook helper a `stylesXml` with three cases:
    - the cell's style uses `numFmtId="14"`, and `<numFmt numFmtId="14" formatCode="0.00"/>` is defined: stays `'45658'`;
    - two `<numFmt numFmtId="164">`, first `d` then `0.00`: stays `'45658'`;
    - `<numFmt numFmtId="164"/>`: stays `'45658'`.
  - Kill X10: a CPU case on `]` + `[` × 150,000.

### Nit

**NIT-1. Two counts in the receipt's sweep bullet do not match the planner's sweep.**

- `docs/implementation/receipts/fix-parser-regex.md:21` says the regexes were pumped with "20 by 4 surroundings". `files/sweep.mjs` has 18 prefixes and 4 suffixes, and the brief says 18 too.
- The same line says "Every regex ... (55 ...)". The parsers hold 54 regex literals, which I found with the TypeScript scanner (`probes/listre.mjs`, `logs/regex-list.txt`), plus `date.ts`'s 4 built patterns: 58 in all.
  - The planner's hand-made table leaves out three, all trivially linear: `bank.ts:57` `/\s/` and `bank.ts:58` `/[A-Za-z0-9]/` (each tests one character), and `date.ts:38` `/\./g` (runs on the constant month names).
  - My sweep covers all 58, so the conclusion stands.
- Neither changes the verdict. Fix them if the receipt is touched again.

## What was checked and holds

### The three rewritten patterns read exactly what the old ones read

**`THB_SUFFIX` (`amount.ts:30`).** It is used once, at `amount.ts:55`: `text.replace(THB_PREFIX, '').replace(THB_SUFFIX, '').trim()`.
- The old `\s*` before the marker removed exactly what `.trim()` now removes. JS `\s` and `String.prototype.trim` agree on all 65,536 BMP code units (differential check 0, 0 mismatches). Every Unicode whitespace character is in the BMP.
- `text` is trimmed before the replace, and `THB_PREFIX` eats its own trailing spaces. So nothing that the old `\s*` could reach is left outside the trim.

**`explicitPlus` (`table.ts:240`).**
- Old: `\s* \(? \s* M? \s* \+`. New: `\s* (\( \s*)? (M \s*)? \+`.
- Take each of the four cases (with or without `(`, with or without a marker). Joining the adjacent `\s*` of the old form gives the new form term for term, so the two languages are equal.
- Both forms are anchored and used only with `.test`.

**`isDateFormat`'s strip (`xlsx.ts:51-52`).** Every match of `/\[[^\]]*\]/g` ends at a `]`, so it lies in `[0, lastIndexOf(']') + 1)`.
- For a `[` at `i` in that prefix, the first `]` after `i` is inside the prefix, so the scan there is the same as on the whole string.
- After the last `]`, no `[` can match.
- So `prefix.replace(...) + suffix` equals `whole.replace(...)`.

**Differential.** `probes/differential.mjs` is the reviewer's own; it is not the planner's script. It takes the regex literals and the bodies of `isDateFormat` and `readDateStyles` from each side's source text, and runs each side's own `xmlEvents`. I reran it here: exit 0, `differential: 0 differences`, 38 checks and 20,625,571 compared inputs (`logs/differential-rerun.log`, byte-identical to the predecessor's run). It covers:
- the THB strip alone and in `numberText`'s context, plus `parseAmountText` under all four conventions:
  - 42 hand-picked inputs (the baht sign, `บาท`, `thb` in mixed case, Thai digits, U+FEFF, U+3000, `ſ`, `İ`, unbalanced parentheses);
  - 5,408 whitespace-by-marker pairs;
  - 300,000 random inputs;
  - 271,453 exhaustive inputs (length 5 or less);
- `detectAmountConvention` on 50,000 random sets;
- the `explicitPlus` regex on 26 hand-picked, 300,000 random and 5,380,840 exhaustive inputs (length 7 or less, over space, `(`, `฿`, `thb`, `t`, `+`, `-`, `5` and nbsp);
- `buildRows` on 20,000 random generic tables;
- `isDateFormat`'s visible text and its answer on:
  - 41 hand-picked codes (nested, unbalanced and escaped brackets, quotes inside brackets, `_[`, `*[`, Thai `วดป`);
  - 300,000 random codes;
  - 5,380,840 exhaustive codes (length 7 or less, over `[`, `]`, `"`, `\`, `_`, `*`, `d`, `a` and a line feed).

**The differential detects real changes.** Eight behaviour mutants all give differences (`logs/mutdiff.log`), and so do X4 and X9 (`logs/mutdiff2.log`).

### `readDateStyles`: once per format, same decision for every style

- The decisions are unchanged. Each side's own `readDateStyles` decides the same for every cell style:
  - on 14 hand-picked `styles.xml` parts:
    - built-in ids 0, 14 and 22, and a style with no `numFmtId`;
    - a custom format redefining 14 or 2;
    - duplicated id 164;
    - a style pointing at unknown 165 and 999;
    - a `<numFmt>` with no id or no code;
    - ids `-0`, `abc` and the empty string;
    - numFmts after `cellXfs`;
    - a nested `<xf>` inside an `<xf>`;
    - an unclosed `<xf>` (refused by both);
    - entity-encoded codes and an unknown entity;
  - and on 50,000 random parts. Over the hand-picked and random parts together, 13,572 have a date style and 26,021 a style that is no date; 2 are refused by both sides.
- End to end, `readXlsx` through the real ZIP and sheet reader gives the same result on 1,511 workbooks, each style used by one cell.
- Why it holds:
  - `isDateFormat` is pure and cannot throw on a string. It returns at 50 MiB without error (`logs/big.log`).
  - The map still holds the last `<numFmt>` for an id that was read before the style.
  - `custom.get(id) ?? builtin` equals `custom.has(id) ? verdict : builtin`, because the map holds only booleans.
  - `Number()` gives the same keys on both sides, `NaN` and `-0` included (Map uses SameValueZero).
- The work is now bounded (`logs/linear.log`). This is `readXlsx`, CPU ms, best of 3:

  | Input | New | Old |
  |---|---|---|
  | One N-character format, N/40 styles | 0.62 / 1.58 / 16.77 at N 10k / 100k / 1M | 3.72 → 261.65 from 10k to 100k (70×) |
  | N/1,000 formats of 1,000 `[` each | 0.16 / 0.47 / 4.14 | (not a slow case for the old code) |

  - One 1,000,000-`[` format shared by 100,000 styles: an 8,529-byte workbook takes 29 ms. The cell stays `45658`.

### Linear up to 1,000,000 characters (`probes/linear.mjs`, `logs/linear.log`)

The new code was timed at N 10,000, 100,000 and 1,000,000, and the old code at 1,000 and 10,000. All figures are CPU ms, best of 3.

- **THB suffix.** Eight families:
  - `(`+spaces+`5`, `5`+spaces+`x`, spaces alone, nbsp/tab+`q`;
  - `thb`×N+`x`, `บา`×N, `th`×N, spaces+`บาท`+spaces+`x`.
- **The new suffix regex itself.** It is too fast to measure at every size (under 0.01 ms at 1M).
- **`parseAmountText` end to end.** Up to 2.17 ms at 1M, with 8.2× to 10.1× per 10× step from 100k to 1M.
- **The old suffix regex.** Up to 142× per 10× step. For example, `(`+spaces+`5` goes 0.56 → 55.19 ms.
- **`explicitPlus`.** Seven families:
  - New: at most 1.31 ms at 1M, 4.9× to 10.1× per step.
  - Old: `(`+spaces+`1` goes 0.63 → 54.32 ms. Spaces alone is cubic: 0.42 ms at 100, 204 ms at 1,000.
- **`isDateFormat`.** Fifteen families:
  - `[` run, `]`+`[` run, `[` run+`]`, `[`…`]`…`[`;
  - `[]`, `][`, `[a`, `[`+`a` run;
  - `"` run, `"[`, `\[`, `_[`, `"`+`[` run, `[`+`"` run, `[[]`.
  - New: at most 5 ms at 1M, 6.9× to 10.5× per step.
  - Old: the `[` run goes 0.40 → 39.89 ms. `]`+`[` run goes 0.71 → 40.15 ms. `"`+`[` run goes 0.39 → 41.38 ms.
- **`isDateFormat` at 50 MiB** (`logs/big.log`). It takes 50 to 258 ms on five shapes, and none throws.

### No other quadratic or exponential pattern in `apps/api/src/imports/parsers/`

**Every regex, pumped raw** (`probes/sweep2.mjs`, `logs/sweep-head.log`).
- The regexes: the TypeScript scanner found all 54 literals, and I exported `date.ts`'s 4 built `RegExp`s from a copy.
- The inputs: 39 prefixes × 55 run units × 12 suffixes, at N 1,000 and 10,000. That is 2,985,840 pumps, timed in CPU time. A regex was flagged at over 30× for 10× the input. Each flag was re-timed at 10,000 and 100,000.
- Two are superlinear in isolation, and both are safe where the parser uses them:
  - `xlsx.ts:52` `/\[[^\]]*\]/g` (39 ms at N 10,000, 3,740 ms at N 100,000 on a `[` run). The literal is unchanged; the fix bounds where it runs.
  - `date.ts` `DAY_NAMED` (`1 jan`+spaces: 48 ms → 4,977 ms). It runs only after `normalize` collapses every `\s+` run to one space, and all its callers normalize first.
- Validation: the same sweep on `base/` (`logs/sweep-base.log`) flags `THB_SUFFIX`, `explicitPlus`, the bracket strip and `DAY_NAMED`, and nothing else. The figures are `explicitPlus` 211 ms at N 1,000 on a space run, `THB_SUFFIX` 48.8 → 4,780 ms, and the strip 39.8 → 3,828 ms. So the sweep finds what it should.

**The same input families, as the parser applies them** (`probes/context.mjs`, `logs/context-head.log`).
- Through `isDateFormat`, `parseDateText`, `twoDigitYear` and `numericParts`: 31,668 combinations, 253,344 pumps.
- 0 superlinear. Two first-pass flags were noise on re-timing. On `base/` (`logs/context-base.log`), it confirms `isDateFormat` (a `[` run: 39.4 ms at N 10,000, 3,871 ms at N 100,000) and nothing else.

**The loops and scans around the regexes** (`probes/e2e.mjs`, `logs/e2e.log`, `logs/e2e-recheck.log`). Twenty-nine entry-point cases at N 10,000, 100,000 and 1,000,000:
- `parseAmountText`, `detectAmountConvention`, `normalizeHeader`;
- `preambleAccountLabel` (`maskedDigits`) on mask, separator and letter runs;
- `parseDateText`, `twoDigitYear`, `detectDateOrder`;
- `xmlEvents`: attributes, unique attributes, an attribute name without `=`, a value without its closing quote, entity runs, `<?` unclosed, comments, CDATA `]` runs, many or nested elements;
- `readCsv` with escaped quotes and many records;
- `buildRows`.

All grow at most 19× per 10× step. The four highest were re-timed at 1M, 4M and 16M and grow 3.6× to 5.6× per 4× step: linear plus allocation, not quadratic.

**Read by hand, each bounded:**
- `maskedDigits`: each character is read a bounded number of times;
- `readCsv`: `indexOf` from a moving start, and every cell is capped at 10,000;
- `xmlEvents`: a moving cursor and a sticky attribute regex;
- `readSheet`: the column fill is capped at 100;
- `readSharedStrings`;
- `checkPackage`: 1,000 names or fewer, three passes;
- the ZIP directory: 1,000 entries or fewer, one sort;
- `buildRows`: `findHeaderRow` reads 30 rows or fewer, `firstNamed` compares constant lists × headers, and each row does constant work over capped columns.

### The CPU-time tests

**RED on the old code** (predecessor's run, `logs/red.log`, on `red/`): `Tests: 7 failed, 21 passed, 28 total`.
- The four in-process cases took 4,314, 5,125, 8,741 and 5,420 ms against the 1,000 ms bound.
- The three child cases ended in `"kind": "timeout"`.

**GREEN:** `Tests: 28 passed, 28 total` (`logs/green.log`).

**Margins.** I measured them with my own copy of the spec. It logs each bounded value and was deleted after the run.

| Run | In-process cases (bound 1,000 ms) | Child cases, `cpu_ms` (bound 5,000) |
|---|---|---|
| With two sweeps running | 2.5, 8.1, 10.8, 17.5 ms | 343, 259, 292 |
| 36 busy processes on 18 cores, load average 39 | 2.4, 7.3, 8.5, 16.8 ms | 285, 214, 248 |

- So the tests keep 57× or more headroom in process and 14× or more in the child, and the old code misses its bound by 4.3× or more.

**Why load does not move these figures:**
- The bounds are CPU time:
  - in process, `process.cpuUsage`, with the workbook built before the measured block;
  - in the child, `process.resourceUsage` (`child-io.ts:28-34`).
- Jest workers are separate processes.
- The child's 30 s wall deadline is roughly 100× its CPU need. `jest.setTimeout(60_000)` lets a RED child reach its deadline and fail on the assertion.

**NIT-A (`bank-statements.spec.ts:250-251`).** It adds `['1234xx5678']` to the null rows, which is the review's recommended case.
- On the real code, both `x`s follow a word character, so the result is null.
- Under N1 (digits dropped from `isWordChar`), `1234xx5678` gives `xxx-5678`, and the test fails.

**The planner's 11 mutant claims.** I reran `files/mutate.py` on `mutrun/` (`logs/planner-mutants.log`).
- F1 to F8, F10, F11 and N1 are all `KILLED`, each with exactly the failing tests the brief and receipt name:
  - F1, F2, F3 and F10: two CPU cases each;
  - F7: three cases;
  - F4, F5, F6, F8, F11 and N1: one case each.
- `restored byte for byte: True`.
- The one equivalent mutant the receipt names holds at the `buildRows` level: dropping `(?:\(\s*)?` from `explicitPlus` changes no row (my differential: `plus-no-paren` differs only at the regex level). A `(` before a `+` never parses as an amount.
- My other killed mutants, besides MIN-1's six survivors, are:
  - X5: no `\s*` after the marker;
  - X6: an extra `\s*` before `+`, which is quadratic and fails both CPU cases;
  - X7: no `/i`;
  - X8: no `฿`;
  - X11: built-in date ids ignored;
  - X12: no `thb`;
  - X13: brackets not hidden.

### Scope, gate and paperwork

**Files.** Exactly R89's list:
- the three parsers;
- `bank-statements.spec.ts` (NIT-A only);
- the new `parser-linear.spec.ts`;
- the fixture's optional `stylesXml`;
- the receipt.

There is no other `apps/api` production file, no package or lockfile change, and no `premium-progress.md` edit. The six code and test files match the planner's `SHA256SUMS.final` (6 OK).

**Gate in `head/`:**
- `npm run build -w gogospend-api`: `Successfully compiled: 296 files with swc`.
- `node apps/api/scripts/release-graph.mjs check`: `"files": 150`, `"closure_packages": 123`, `"problems": []`.
- `node apps/api/scripts/parser-sandbox-check.cjs`: `{"node":"26.13.0","sandbox":{"supported":true},"ok":true}`.
- CI on `16bf264` is green: typecheck, unit and render; SQL integration and ops; release image.

**`git diff --check origin/claude/p1a-vault-core...HEAD`:** no output.

**Commit.**
- Summary: `Match amounts, plus signs and number formats in linear time` (59 characters, imperative, no prefix).
- The message is byte-identical to the brief's `commit-message.txt`.
- The trailer is `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`, as the protocol says.

**Receipt.** `docs/implementation/receipts/fix-parser-regex.md` is its own file (R87). It starts with `# fix-parser-regex: linear amount and sign matching` and cites R89 and its extension. Every figure I checked matches the implementer's logs in `scratch/fix-parser-regex-impl/`:
- RED `7 failed, 21 passed, 28 total`, and 4,520 / 4,946 / 8,450 / 5,671 ms;
- GREEN 28, focused 281;
- `test:api` 46 suites, 991 tests;
- build 296, the release graph, the sandbox check;
- the differential's inputs (31 / 300,000 / 177,156; 21 / 300,000 / 299,593; 29 / 300,000 / 960,800; 7 / 50,000);
- 11 of 11 mutants.

The deviation (base `020c391`, 991 tests, not 990) is explained correctly. The only inaccuracies are NIT-1's.

VERDICT: Approved

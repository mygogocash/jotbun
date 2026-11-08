# Confirming review: P4-T10 round 2 "The parser learns Thai bank exports" (apps/api)

- Branch `p4/t10-thai-bank-exports` (worktree `.claude/worktrees/p4-t10`): task commit `e3cf0e4`, merge `7d1a259` (of integration head `f33cdf0`), fix commit `8c06e1a`. Range reviewed: `origin/claude/p1a-vault-core...8c06e1a`, merge base `f33cdf0`, 15 files. Focus: the fix round (`7d1a259`, `8c06e1a`).
- Reviewer: Opus, read-only. Nothing in any worktree was edited, committed or merged.
- Integration head during this review: `5650669` (P2-T6, #335) at the start, then `239c3a1` (P3-T1, #336) after another session fetched. Both were checked.
- Scratch: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-confirm/`
  - `head/`: `git archive 8c06e1a`, built.
  - `base/`: `git archive 239c3a1`, the integration head without this task, built.
  - `old/`: `bank.ts`, `date.ts` and `protocol.ts` as of `e3cf0e4` (the old regex).
  - `probes/`: the scripts named below. The logs sit next to them.
- Spec: plan `### Task P4-T10` (line 584), owner defaults Q10 and Q11, the boundaries doc, the first review `reviews/P4-T10.md`, the round-2 brief `briefs/P4-T10-round2.md`, ruling R84.

## Findings

### Blocker

None.

### Major

None.

### Minor

**MIN-A. A pre-existing quadratic regex in `amount.ts` still lets a 2 to 3 MB CSV hold the shared parser until its deadline. The bank path calls it once more per row. This task did not cause it and cannot fix it within its files, so it needs its own fix.**

- Where:
  - `apps/api/src/imports/parsers/amount.ts:28`: `const THB_SUFFIX = /\s*(?:฿|thb|บาท)$/i;`. The start is not anchored, so every position in a long whitespace run in the middle of a cell starts a `\s*` that runs to the end of the run and then fails.
  - It is reached through `numberText` from both `parseAmountText` and `detectAmountConvention`.
  - The code is from P2b (`36205aa`, `fdf92ce`). This task does not touch `amount.ts`.
- Evidence (`probes/amount.mjs`, in process): the cell `(` + N spaces + `5` costs, for each of `parseAmountText` and `detectAmountConvention`:

  | N | CPU |
  |---|---|
  | 2,500 | 4 to 7 ms |
  | 5,000 | 14 ms |
  | 10,000 | 55 ms |

- Evidence (`probes/paren.cjs`, the real sandboxed child, 10,000-character cells):

  | Build | File | Size | Result |
  |---|---|---|---|
  | `base/` (`239c3a1`, no P4-T10) | generic `Date,Amount,Type`, 100 rows | 1 MB | 9,848 ms CPU |
  | `base/` | generic, 320 rows | 3.2 MB | `{"kind":"timeout"}` |
  | `head/` | generic, 100 rows | 1 MB | 9,663 ms CPU (unchanged) |
  | `head/` | bank `Date,Withdrawal,Deposit`, 100 rows | 1 MB | 14,887 ms CPU |
  | `head/` | bank, 210 rows | 2.1 MB | `{"kind":"timeout"}` |

  Why the bank path costs more: a generic row calls the quadratic scan twice (convention, parse). A bank row calls it three times:
  - `detectAmountConvention` over both money columns;
  - `holdsAmount(out)` (`table.ts`, new);
  - the `parseAmountText(out)` that follows (`table.ts`, new).

  So a bank file reaches the deadline at about 2 MB, against 3 MB for a generic file.
- A second pre-existing case, generic path only: `table.ts`'s `explicitPlus` (`/^\s*\(?\s*(?:฿|thb)?\s*\+/i`, also from `36205aa`). This task moved it into the `else` branch unchanged.
  - After the cell is trimmed, it is quadratic on `(` + spaces + `1.00)`: 43 ms per 10,000-character cell.
  - The base child spends 16,071 ms CPU on a 3 MB generic file of such rows.
  - The bank path never runs it.
- Why minor here and not major:
  - It is not code this task added.
  - The plan and protocol limit P4-T10 to the files Q11 names, and `amount.ts` is not one of them. The first review handled `csv.ts` (NIT-2) the same way.
  - The generic path already reached the deadline at about 3 MB before this branch.
- What it means: MAJ-1's goal, that no small upload holds the shared parser, is met for mask runs only. It is not met for the parser as a whole until this is fixed.
- Recommendation: a separate fix task (P2b code) before real statement traffic.
  - The likely fix: `THB_SUFFIX` becomes `/(?:฿|thb|บาท)$/i`. The `.trim()` that follows already removes the spaces before the marker, because `text` is trimmed before the replace.
  - Anchor or rewrite `explicitPlus` the same way.
  - Optionally, let `holdsAmount` return its parse so the bank path does not parse the same cell twice.
  - Add a long-cell CPU test like this round's.

### Nit

**NIT-A. One finer mutant of the new word-character guard survives. A digit right before the mask is not tested.**

- Mutant: `isWordChar = (char) => /[A-Za-z]/.test(char)` (digits dropped). `npm run test -w gogospend-api -- bank-statements` gives `Tests: 18 passed, 18 total`, so it survives. The file was restored and its hash checked (`2a14...6624`).
- Effect of the mutant: `1234xx5678` would give `xxx-5678`; the old regex and the new scan both give null.
- The gap is as old as round 1: the regex's lookbehind had the same untested `0-9`.
- One line would pin it, for example `expect(preambleAccountLabel(rows(['1234xx5678']))).toBeNull()`.
- The rule "not right after a letter or digit" is the implementer's own addition, not in the plan, and real exports rarely glue a digit to the mask. So this is a nit.

**NIT-B. A typo in the brief, not in the commit.** The brief says the summary line is 64 characters. It is 63. Nothing to change.

## What was checked and holds

### MAJ-1 fix: the scan accepts exactly what the old regex accepted

`apps/api/src/imports/parsers/bank.ts:53-92` (`maskedDigits`), used at `:102-104`.

**Reasoning.** At a start that satisfies the lookbehind, the old regex can only succeed if its mask part ends at the last mask character of the maximal mask-or-separator run. If it ended at an earlier mask, only separators and then another mask follow, and that mask cannot begin the digit part. The digit part is greedy, so it captures every digit of the following digit-or-separator run. That is exactly `masks >= 2 && digits.length >= 4` over those runs.

Skipping to `end` after a failed run is safe:

- a later mask in the same run has the same last mask and the same digits after it, and no more masks before it;
- a later separator is no start.

`isSeparator` uses JS `\s`, the same class as the old regex's `[\s-]` (NBSP, BOM, U+3000, U+2028 and the rest). Both work on UTF-16 code units: no `u` flag before, `cell[i]` now.

**Edge cases** (`probes/equiv.mjs`, the full digit string compared, not only the last four): 84 hand-picked cells, 45 of them matches, 0 differences. They include:

- the plan's `xxx-x-x1234-x` and upper-case `XXX-X-X1234-X`;
- `**** **** 1234 5678` and `**** **** **** 1234`;
- mixed `x*1234`, `*x1234` and `X*x-1234`;
- digits on both sides: `1234xx5678`, `xx1234xx5678`, `0xx1234`, `9**1234`, `xx123 xx4567`;
- separators: tab, NBSP, U+3000, BOM, newline, U+2028, U+000B, U+0085, U+180E, `_`, `.` and `/`;
- Thai around and glued: `บัญชีxxx-x-x1234-x`, `เลขที่บัญชี: xxx-x-x1234-x สาขา`, `กxx1234`;
- Thai, Arabic and full-width digits (no match on either side);
- emoji and lone surrogates;
- near-misses: `x1234`, `xx-123`, `Fax 0212345678`, `Taxx 1234`, `Xx1234`, `yxx1234`, `ab*cd**1234`, `*-*-*-*-1`;
- the round's own guard cells.

**Random cells**, all with 0 differences:

| Probe | Set | Cells | Matches |
|---|---|---|---|
| `probes/equiv.mjs` | character-random (26 symbols incl. Unicode spaces, Thai, surrogates) | 400,000 | 141 |
| `probes/equiv.mjs` | token-random (mask, separator and digit tokens, words, Thai, emoji) | 400,000 | 46,586 |
| `probes/equiv.mjs` | whole `preambleAccountLabel` on multi-row, multi-cell inputs, against the `e3cf0e4` module | 100,000 | 20,006 |
| `probes/equiv-dense.mjs` | dense alphabets, cells up to 80 and 400 characters | 700,000 | 56,116 |

### MAJ-1 fix: it is linear

In process (`probes/linear.mjs`, CPU time of one `maskedDigits` call):

| Pattern | 10,000 | 100,000 | 1,000,000 characters |
|---|---|---|---|
| `*` run | 3.2 ms | 1.7 ms | 13.5 ms |
| `x-` run | 0.7 ms | 1.5 ms | 7.3 ms |
| `x ` run | 0.7 ms | 2.6 ms | 11.5 ms |
| `*` then 999,999 spaces | | | 25.0 ms |
| `xx` then a digit-or-separator run with three digits | | | 17.4 ms |
| `xx` then 999,998 digits | | | 23.1 ms |

Twelve other patterns (`x `, `a*`, `x1`, `*1-`, `xx123 `, mixed and others) stay under 16 ms at 1,000,000 characters. Every one grows linearly; the old regex took 368 ms for 10,000 `*`. A whole 10 MB preamble through `preambleAccountLabel` takes 50.7 ms.

Through the real sandboxed child (`probes/runner.cjs`, `probes/xlsx.cjs`, built `head/apps/api/dist`, default 30 s deadline, machine load average about 31 on 18 cores):

| File | Size | Child CPU | Result |
|---|---|---|---|
| 1 MB preamble (3 rows of 33 cells of 10,000 `*`, `x-`, `x `) | 990,376 B | 160 to 172 ms | label `บัญชีออมทรัพย์ xxx-1234` |
| 10 MB preamble (10 rows of 100 cells, within the reader's caps) | 10,001,277 B | 267 ms | same label |
| 12 MB preamble (12 rows of 100 cells, just under the 12 MiB upload cap) | 12,001,477 B | 301 ms | same label (181 MB peak, budget 352 MiB) |
| 10 MB of `*`×9,997 + `123` (no four digits) | 10,001,277 B | 241 ms | label from the account row |
| XLSX, 28 rows of 100 cells (28 million mask characters) | 8,647 B | 370 ms | `row:31`, `Savings Account xxx-1234` |

At the first review's measured rate of about 0.37 s per 10,000-character cell, the 8.6 KB XLSX alone would need about 17 minutes under the old regex.

Cells longer than 10,000 characters never reach the scan: the readers refuse them (`cell_too_long`, `LIMITS.cellChars`; probes `giant1MB`, `giant10MB`, `giant12MBstars`). So "no cell-length cap" in `bank.ts` is correct and costs nothing.

### No other quadratic or exponential pattern in code this task added

- **`bank.ts`.**
  - `normalizeHeader` uses an anchored `/^﻿/` and `/\s+/g` (linear).
  - `findHeaderRow`: at most 30 rows × cells × a fixed name list.
  - `firstNamed` and `bankRoles`: fixed lists × headers.
  - `preambleAccountLabel`: at most 29 rows, with one `find` on success.
  - `twoDigitYearEra`: one pass over the dates.
  - `headerFingerprint`: one hash.
- **`table.ts`.** The new code is `holdsAmount`, the bank branch, `dates`, the `flatMap` for the convention and `slice(0, at)`, each one pass. The only regexes on this path are the pre-existing `amount.ts` ones (MIN-A).
- **`date.ts`.**
  - `twoDigitYear` reuses `NUMERIC`, `DAY_NAMED` and `NAMED_DAY`. All three are anchored, after `normalize` has collapsed whitespace.
  - `gregorianYear` adds no regex.
- **Probes** (`probes/runner2.cjs`):

  | File | Size | Child CPU |
  |---|---|---|
  | 7 preamble rows of 100 cells of 10,000 characters to NFC-normalize and collapse (header search) | 12.2 MB | 228 ms |
  | 1,000 rows with 10,000-character date cells (spaces, a `T` run, digit runs, repeated Thai months) | 11.6 MB | 215 ms |
  | 4,998 rows of two-digit-year bank rows | 10.8 MB | 204 ms |
  | Long money cells | 11.2 MB | 25,659 ms |

  The long money cells are the one exception, all of it `amount.ts`: see MIN-A.

### The two CPU-time tests cannot flake, and they fail on the old regex

- **Both measure CPU time, not wall time.**
  - The child test uses `result.usage.cpu_ms`, which the child computes from `process.resourceUsage()` user + system microseconds, divided by 1,000 (`child-io.ts:29-34`).
  - The helper test uses `process.cpuUsage()`, divided by 1,000. That is the jest worker's own process: jest uses child processes here, and `RUSAGE_SELF` leaves out the parser child.
  - The helper test is synchronous between its two readings.
- **Measured** (`probes/testcases.cjs`, five runs each):

  | Condition | Child CPU (bound 5,000 ms) | Child wall | Helper CPU (bound 1,000 ms) |
  |---|---|---|---|
  | Unloaded | 200 to 213 ms | 189 to 351 ms | 2.3 to 23.4 ms (first call includes JIT) |
  | 36 busy-loop processes on 18 cores (2× oversubscribed) | 181 to 191 ms | 300 to 539 ms | 2.2 to 16.9 ms |

  CPU time does not grow under load; only wall time does. The margins are about 25× (child) and 40× or more (helper).
- **The child's own deadline is wall time** (30 s). The test file takes 0.3 to 0.5 s even under that load. Under the same load, `npm run test -w gogospend-api -- bank-statements` gave `Tests: 18 passed, 18 total` (17.3 s, against 5.4 s unloaded).
- **CI** runs `npm run test:api` without coverage (`.github/workflows/backend.yml:44`). The child runs its `.ts` directly and is never instrumented.
- **On the old regex:**
  - The implementer's `red.log`: `Tests: 2 failed, 16 passed, 18 total`, `"kind": "timeout"`, `Received: 10783.852`.
  - My R1 mutant run: `"kind": "timeout"` and `Received: 11638.109`.
  - The child test fails on the old regex either way. A machine twice as fast would finish the 3 MB file (about 55 s of CPU at the measured rates) in under 30 s, and the 5,000 ms bound would still fail it.

### Mutants

`mutate2.py` (the round's verified script, hash-checked in R2) was run against my scratch copy: `mutants.log`. Every line is `KILLED`, and the counts and failing tests equal the implementer's log and the brief's table:

| Mutant | Tests | Fails |
|---|---|---|
| R1, the old regex | 2 failed | both CPU tests |
| R2, quadratic restart | 2 failed | both CPU tests |
| R3, give up after the first run | 1 failed | the guard |
| R4, no word check | 1 failed | the first-cell helper |
| R5, one mask | 1 failed | the first-cell helper |
| R6, three digits | 1 failed | the first-cell helper |
| R7, no separators in the mask run | 8 failed | |
| R8, a space is not a separator | 2 failed | |

The last line was `restored byte for byte: True`, and the file hash afterwards was `2a149270...6624`, the verified copy. One finer survivor is NIT-A.

### Gates on `8c06e1a` (scratch)

- `npm run typecheck`: exit 0, no `error TS` (contracts and API).
- `npm run test:api -- bank-statements parse-server parser-runner parse-worker`: `Test Suites: 4 passed, 4 total`, `Tests: 271 passed, 271 total`.
  - This needs cloned `node_modules` (`cp -cR`). With symlinked `node_modules`, the same 22 image-child and sandbox cases fail on `head/` and on `base/` alike (`focused.log` and `focused-base.log`, the same failing set), so that failure is environmental.
- `npm run test:api` (the single full run): `Test Suites: 45 passed, 45 total`, `Tests: 980 passed, 980 total`. This equals the receipt.
- `npm run build -w gogospend-api`: `Successfully compiled: 295 files with swc`.
- `node apps/api/scripts/release-graph.mjs check`: `"files": 150`, `"closure_packages": 123`, `"problems": []`.
- `node apps/api/scripts/parser-sandbox-check.cjs`: `{"node":"26.13.0","sandbox":{"supported":true},"ok":true}`.
- Built `bank.js` requires only `node:crypto` and `./date.js`.
- `git diff --check` gives no output on all three ranges: `origin/claude/p1a-vault-core...8c06e1a`, `e3cf0e4 8c06e1a` and `5650669...8c06e1a`.

### The round touched only what it should

- `8c06e1a` changes exactly `bank.ts`, `bank-statements.spec.ts` and `premium-progress.md`.
- `bank.ts` and the spec equal `R2/SHA256SUMS.final` (`2a149270...`, `221a50af...`).
- The merge `7d1a259` carries exactly the task's code: the `git patch-id` of `apps packages` for `d193a68..e3cf0e4` equals that of `f33cdf0..7d1a259` (`987b55a9...`).
- `git diff e3cf0e4 7d1a259 -- apps/api` is only `sync-api.integration.spec.ts` (from #332).

### R84 still holds

Over the whole range, the three test-only files change only by adding `header_fingerprint: null` to six literals:

- `ballast-probe.ts`: 1;
- `import-preview.integration.spec.ts`: 4;
- `attachments.integration.spec.ts`: 1.

Round 2 does not touch them.

### Receipt (round-2 bullet, MIN-2 and nit notes)

- The section's hash at `8c06e1a` is `56ac2a47...7968`, the brief's verified file.
- The round-2 bullet is accurate against the logs and my reruns:
  - the MAJ-1 description;
  - the three tests and their CPU bounds;
  - RED 2 failed, 16 passed, 18 total, then GREEN 18 and 271;
  - eight of eight mutants;
  - the gate, 45 suites and 980 tests;
  - MIN-1.
- "600,000 random cells" is credited to the brief's check. My own 1.6 million agree.
- NIT-1 is fixed: "(the gate's sandboxed-child parse)".
- The SKIPPED bullet records round 2's `test:db` skip.
- The three new notes match the first review:
  - MIN-2: no day-first fallback; left to the owner and P4-T11.
  - NIT-2: the 5,001-record cap counts preamble rows. "Above 5,000 minus p" is right, since p + 1 + T > 5,001 when T > 5,000 − p.
  - NIT-3: a `channel`-only details column becomes the merchant.

### Ledger placement at `8c06e1a`

- One `## P4: Slips and statements` (line 1009).
- P4-T1's intro paragraph is unchanged.
- `### P4 Task 1` is at 1013, and `### P4 Task 10` at 1074. Task 10 sits right after P4-T1's last bullet ("P4-T6's `retry_after_seconds` ..."), with one blank line, and before `## P6B: The beta's in-app extras` (1116).
- The status line names the merged head `f33cdf0`.
- `ledger.py check ledger-8c06e1a.md ledger-f33cdf0.md f33cdf0`: `ledger placement OK (status names `f33cdf0`)`.
- At `7d1a259`, `ledger.py check` against `f33cdf0`: `ledger placement OK`.
- `diff ledger-f33cdf0.md ledger-8c06e1a.md` shows a single insertion, `1072a1073,1114`.

### The next merge: no ledger resolution is needed

| Command | Result |
|---|---|
| `git merge-tree --write-tree 5650669 8c06e1a` | exit 0, tree `84168fd`, no conflicts |
| `git merge-tree --write-tree 239c3a1 8c06e1a` (the current head) | exit 0, tree `ed9c274`, no conflicts |

In both merged trees, `diff <head ledger> <merged ledger>` is exactly one insertion, `1072a1073,1114`: the blank line plus the 41-line Task 10 section, byte-identical to the branch's. Everything else, including P2-T6's and P3-T1's receipts, is the integration head's, untouched.

In the merged file the order is:

1. `## P4` (1009);
2. P4 Task 1 (1013);
3. P4 Task 10 (1074);
4. `## P6B` (1116);
5. P6B Task 0 (1120);
6. P2 Task 6 (1160);
7. `## P3` (1211);
8. P3 Task 1 (1215).

How the integrator should handle it:

- Merge as is. Git resolves the ledger cleanly. Do not run `ledger_union.py` or `ledger.py place`.
- To verify, run `ledger.py check <merged ledger> <integration head's ledger> f33cdf0`, or the same without the SHA. Both print `ledger placement OK`; checked on both heads above.
- Do not pass the new head's SHA. `ledger.py check ... 5650669` fails only with "the Task 10 status line does not name the integration head", because the status correctly records `f33cdf0`, the head round 2 merged. That failure is expected; do not edit the status line to satisfy it.
- If another receipt lands right after P4 Task 1 before this merges, there will be a conflict at that one spot. Keep both sections under the single P4 heading, before `## P6B`. Under the new R87 this is unlikely.
- R87 (receipts in `docs/implementation/receipts/`) appeared in the protocol during this review. This round's brief predates it and placed the receipt in `premium-progress.md`. That is consistent with "Briefs written before this date keep their own instructions". A later round, if any, would use `receipts/P4-T10.md`.
- Aside, not this task: in the integration head, P2-T6's receipt (`### P2 Task 6`, #335) sits under `## P6B`, after P6B Task 0, with no `## P2` heading of its own.

### Merge commit `7d1a259` message: acceptable

- The message is the `--no-edit` default, then `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`, then git's `# Conflicts:` / `#\tdocs/implementation/premium-progress.md` lines.
- `git interpret-trailers --parse` and `%(trailers)` both find the Haiku trailer; git ignores the comment lines when it looks for trailers.
- Protocol step 1 and the brief prescribe `--no-edit`.
- Five merges already in the integration history carry the same `# Conflicts:` lines (`214c58e`, `ae51975`, `af4849a`, `e000400`, `8e71776`).
- Cosmetic only.

### Fix commit `8c06e1a`

- Summary: "Read the masked account in one pass and record the review notes". It is imperative, has no type prefix and is 63 characters.
- The body is plain and accurate.
- After a blank line, the only trailer is `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`, as protocol step 8 says.
- `git diff --check` is clean.

VERDICT: Approved

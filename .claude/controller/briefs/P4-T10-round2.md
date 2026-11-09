# P4-T10 round 2 brief: a one-pass masked-account reader, and the receipt under P4 Task 1's heading

For the Haiku implementer. Read `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md` first: it is binding.

The review of round 1 is `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P4-T10.md`. This brief is the orchestrator's ruled scope for round 2, and nothing more.

Names used below:
- `WT` = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p4-t10`. This is your worktree, on branch `p4/t10-thai-bank-exports`, HEAD `e3cf0e4`. Work and run git only there.
- `R2` = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2`. These are the reviewer's prepared and verified files. **Read only for you.** Never edit anything under it.
- `RUN` = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2-run`. This is your own scratch folder for logs, ledger inputs and mutant logs. Create it with `mkdir -p`.

Run `npm` with `WT` as the working directory. Run git as `/usr/bin/git`, one plain command per call, from `WT`.

## 0. What round 2 does, and why

1. **MAJ-1 (the fix).**
   - The problem: `parsers/bank.ts` finds the preamble's masked account with this backtracking regex:
     `/(?<![A-Za-z0-9])[xX*](?:[\s-]*[xX*])+((?:[\s-]*[0-9]){4,})/`
     Its cost grows with the square of a cell's length. A cell of 10,000 `*` takes about 370 ms. A 1 MB preamble ran the sandboxed parser child to its 30 s deadline (outcome `timeout`), and the parser runs one parse at a time for every account.
   - The fix: replace the regex with a small left-to-right scan, `maskedDigits`, that applies exactly the plan's rule: two or more of `x`, `X` or `*`, then four or more digits, with dashes or spaces between any of them, not right after a letter or digit. A mask run that has no four digits after it is skipped whole. That skip is safe because a start later in the same run is followed by the same digits. Every character is read a bounded number of times, so the work is linear in the cell's length.
   - Why a scan and no cell-length cap: the plan's rule has only a lower bound and no longest form. Its example `xxx-x-x1234-x` is 13 characters. The longest realistic masked numbers are about 16 to 19 characters (a 12-digit account with dashes, or `**** **** **** 1234`), and a label can share the cell. A cap would add a rule the plan does not have: a masked number inside a long preamble sentence would be missed. And a cap on top of the old regex would still cost the square of the cap for every cell. The scan keeps the plan's rule exactly, for any cell length.
   - The reviewer checked that the scan gives the old regex's answer on 600,000 random cells: 300,000 over a mixed alphabet of masks, separators, Unicode spaces, BOM, digits, ASCII and Thai letters, and 300,000 dense ones. There were 26,933 matches and 0 differences.
2. **MIN-1 (the ledger).**
   - P4 Task 1 (#332) has merged. It added `## P4: Slips and statements` to `docs/implementation/premium-progress.md`.
   - You merge the integration head (protocol step 1) and place this task's `### P4 Task 10` section under that existing heading. Do it with the prepared script, not by keeping both sides blindly.
   - `.claude/controller/ledger_union.py` would put the section under `## P6B`. Do not use it for this file.
3. **MIN-2, NIT-1, NIT-2, NIT-3: receipt edits only.**
   - The day-first ambiguity goes to the owner and to P4-T11.
   - The reader's 5,001-record cap counts preamble rows.
   - A `channel` column becomes the merchant (for P4-T11).
   - Drop "(gate item 6)".

## 1. Files

- Change: `apps/api/src/imports/parsers/bank.ts` (Edits 1 and 2), `apps/api/src/imports/bank-statements.spec.ts` (Edits 3 and 4, three new tests) and `docs/implementation/premium-progress.md` (merge placement, then the round-2 receipt edits).
- Nothing else. Not `table.ts`, `csv.ts`, `date.ts`, any other spec, any `package.json` or lockfile, `apps/api/scripts/*`, `release-graph.json` or `apps/edge`.
- The integration merge brings other teams' files into your branch. That is expected, and you do not edit them.
- The prepared, verified copies are `R2/verified/apps/api/src/imports/parsers/bank.ts` and `R2/verified/apps/api/src/imports/bank-statements.spec.ts`. Their hashes are in `R2/SHA256SUMS.final`.
- The scripts are `R2/files/edit_bank.py`, `edit_spec.py`, `ledger.py` and `mutate2.py`. All hashes are in `R2/SHA256SUMS`.

## 2. Step 0: start

1. `/usr/bin/git status --short` must print nothing. `/usr/bin/git log --oneline -1` must show `e3cf0e4`.
2. `mkdir -p /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2-run`
3. `shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2/SHA256SUMS.start`, run from `WT`: 2 `OK` (`bank.ts` and `bank-statements.spec.ts` as of `e3cf0e4`).
4. `cd /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2 && shasum -a 256 -c SHA256SUMS`: 8 `OK`.
5. `node --version` (record it). `docker info > /dev/null 2>&1; echo $?` should be non-zero: Docker is stopped, so `test:db` is SKIPPED. Do not start Docker.

Any mismatch: stop and report BLOCKED with the names.

## 3. Step 1: sync (protocol step 1) and place the ledger section

1. `/usr/bin/git fetch origin claude/p1a-vault-core`
2. `/usr/bin/git rev-parse --short origin/claude/p1a-vault-core`. Call the answer `HEAD_SHA`: `f33cdf0` when this brief was written, or later.
3. `/usr/bin/git merge --no-edit origin/claude/p1a-vault-core`
   - Expect `CONFLICT (content): Merge conflict in docs/implementation/premium-progress.md` and "Automatic merge failed".
4. `/usr/bin/git status --short`
   - The only unmerged entry (`UU`, `AA` or any `U`) must be `docs/implementation/premium-progress.md`.
   - Any other conflict: run `/usr/bin/git merge --abort` and report BLOCKED with the names.
5. Write the two clean inputs (do not hand-edit the conflicted file):
   - `/usr/bin/git show origin/claude/p1a-vault-core:docs/implementation/premium-progress.md > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2-run/ledger-integration.md`
   - `/usr/bin/git show e3cf0e4:docs/implementation/premium-progress.md > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2-run/ledger-e3cf0e4.md`
6. Place the section. Run:

   `python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2/files/ledger.py place /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2-run/ledger-integration.md /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2-run/ledger-e3cf0e4.md /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p4-t10/docs/implementation/premium-progress.md`

   It must print `placed the Task 10 section (31 lines) at line ..., before "## P6B: The beta's in-app extras"`. At `f33cdf0` the line is 1074. Exactly what it does:
   - It writes the integration head's file unchanged.
   - It keeps one `## P4: Slips and statements` heading, with P4 Task 1's intro paragraph unchanged.
   - It drops this branch's own copy of the heading and its intro paragraph ("Phase P4 reads ... Task 10 teaches the statement parser ...").
   - It inserts the `### P4 Task 10: The parser learns Thai bank exports` section, from its heading through its last notes bullet, as it was at `e3cf0e4`. The section goes at the end of the P4 section: right after P4 Task 1's last bullet ("  - P4-T6's `retry_after_seconds` is a whole number of seconds; ..."), with one blank line on each side, and before `## P6B: The beta's in-app extras`.
7. Check the placement. Run:

   `python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2/files/ledger.py check /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p4-t10/docs/implementation/premium-progress.md /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2-run/ledger-integration.md`

   It must print `ledger placement OK`. It proves all of the following:
   - no conflict markers;
   - exactly one `## P4` heading, one `### P4 Task 1` and one `### P4 Task 10`;
   - the dropped intro sentence is gone;
   - the order is P4 heading, then Task 1, then Task 10, with no `## ` heading between the P4 heading and Task 10;
   - Task 10 is the last section of the P4 section;
   - removing the Task 10 section leaves the integration head's file byte for byte.

   The reviewer checked that it **fails** on the raw conflicted file and on `ledger_union.py`'s output.
8. `/usr/bin/git add docs/implementation/premium-progress.md`, then `/usr/bin/git status --short`: no `U` entries left.
9. `/usr/bin/git commit --no-edit`. This is the merge commit, with git's default message.
10. Confirm that the merge left this task's code alone:
    - `shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2/SHA256SUMS.start`, run from `WT`: 2 `OK`.
    - `/usr/bin/git diff --stat e3cf0e4 HEAD -- apps/api`: only `apps/api/src/sync/sync-api.integration.spec.ts` (from #332) at `f33cdf0`.
    - No `package.json` or lockfile changed between `d193a68` and `f33cdf0`, so no `npm ci` is needed. If `/usr/bin/git diff --stat e3cf0e4 HEAD -- package-lock.json package.json apps/api/package.json` shows a change, run `npm ci --ignore-scripts --no-audit --no-fund` before Step 2.

## 4. Step 2: the tests, then RED

Add the three tests: Edit 3 and Edit 4 below. Either run the prepared script, which applies exactly these two edits and refuses if a find text is not there exactly once:

`python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2/files/edit_spec.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p4-t10/apps/api/src/imports/bank-statements.spec.ts`

It prints `bank-statements.spec.ts: 2 edits applied`. Or make the same edits with your Edit tool.

**Edit 3**, in `apps/api/src/imports/bank-statements.spec.ts`. Find (the end of the first `describe`):

```ts
    } finally {
      await server.close();
      log.mockRestore();
    }
  });
});
```

Replace with:

```ts
    } finally {
      await server.close();
      log.mockRestore();
    }
  });

  it('a preamble of long mask runs parses well inside the deadline', async () => {
    // Three preamble rows of 100 cells each: 10,000 `*`, 5,000 `x-` and 5,000 `x ` (the review's probe, 3 MB), then the account.
    const runs = ['*'.repeat(10_000), 'x-'.repeat(5_000), 'x '.repeat(5_000)].map((cell) => Array(100).fill(cell).join(','));
    const bytes = csv([...runs, 'บัญชีออมทรัพย์,xxx-x-x1234-x', THAI_HEADER.join(','), '24/10/69,10:05,POS PURCHASE,100.00,,"1,000.00",EDC,ร้านเครื่องเขียน']);
    const result = await parsed('csv', bytes);
    expect(result.rows).toEqual([
      row({ source_row_id: 'row:6', occurred_on: '2026-10-24', type: 'expense', amount_minor: '10000', wallet_label: ACCOUNT, category_label: 'POS PURCHASE', merchant: 'ร้านเครื่องเขียน' }),
    ]);
    // The CPU time the child measured itself, so a busy runner does not inflate it: a backtracking scan
    // runs these cells past the 30 s deadline (the outcome is then a timeout), one pass takes well under a second.
    expect(result.usage.cpu_ms).toBeLessThan(5_000);
  }, 60_000);
});
```

**Edit 4**, same file. Find (the end of the masked-account helper test):

```ts
    expect(preambleAccountLabel([])).toBeNull();
  });
```

Replace with:

```ts
    expect(preambleAccountLabel([])).toBeNull();
  });

  it('reads the masked account after long mask runs in one pass', () => {
    const hostile = ['*'.repeat(10_000), 'x-'.repeat(5_000), 'x '.repeat(5_000)].flatMap((cell) => Array<string>(20).fill(cell));
    const before = process.cpuUsage();
    expect(preambleAccountLabel(rows(hostile, ['บัญชีออมทรัพย์', 'xxx-x-x1234-x']))).toBe('บัญชีออมทรัพย์ xxx-1234');
    const used = process.cpuUsage(before);
    // CPU time, not wall time, so a busy runner does not inflate it: a backtracking scan spends seconds on these 60 cells, one pass a few milliseconds.
    expect((used.user + used.system) / 1_000).toBeLessThan(1_000);
  });

  it('a mask run without four digits does not hide a later masked number in the same cell', () => {
    expect(preambleAccountLabel(rows(['ref xx-12, account xxx-x-x4321-x']))).toBe('xxx-4321');
    expect(preambleAccountLabel(rows(['** ** 12 ** 5678']))).toBe('xxx-5678');
  });
```

What the three tests prove:

| Test | What it runs | Why |
|---|---|---|
| `Thai bank exports › a preamble of long mask runs parses well inside the deadline` | The real sandboxed child (`parsingRunner()`, the default 30 s deadline), the same path production takes. The file is the review's probe sizes: 100 cells of each run kind, 3 MB. | It asserts the row and the child's own CPU time under 5,000 ms. |
| `the bank helpers › reads the masked account after long mask runs in one pass` | The helper in process: 60 hostile cells, then the account. | It asserts CPU time under 1,000 ms. |
| `the bank helpers › a mask run without four digits does not hide a later masked number in the same cell` | A guard. It passes before the fix too. | It pins the skip rule. |

About the bounds:
- Both are CPU time, not wall time. `usage.cpu_ms` comes from the child's `process.resourceUsage()`; the helper uses `process.cpuUsage()`. A loaded runner delays wall time but barely changes CPU time.
- Measured margins:

  | Test | GREEN | Bound | Old regex | The R2 mutant (quadratic restart) |
  |---|---|---|---|---|
  | Child test | 169 to 222 ms CPU | 5,000 | a `timeout` at 30 s | 29,116 ms |
  | Helper test | about 18 ms (first call, JIT included) | 1,000 | 10,929 ms | 6,309 ms |

Now RED:
1. `npm run typecheck` passes.
2. `npm run test:api -- bank-statements > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2-run/red.log 2>&1`. It takes about 45 s.
3. Expect `Tests: 2 failed, 16 passed, 18 total`. Both failures are assertions:
   - `Thai bank exports › a preamble of long mask runs parses well inside the deadline`: `toMatchObject` received `"kind": "timeout"` where it expected `"kind": "result"`.
   - `the bank helpers › reads the masked account after long mask runs in one pass`: `toBeLessThan`, `Expected: < 1000`, `Received:` about 10,900 (seconds of CPU; the exact figure varies by machine).
4. The reviewer's recorded RED, on a scratch copy of `e3cf0e4` plus these tests: `Tests: 2 failed, 16 passed, 18 total`, the timeout outcome and `Received: 10928.772`, `Time: 45.058 s`.
5. Anything else failing: stop and report it.

## 5. Step 3: the fix, then GREEN

Apply Edits 1 and 2. Either run:

`python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2/files/edit_bank.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p4-t10/apps/api/src/imports/parsers/bank.ts`

It prints `bank.ts: 2 edits applied`. Or use your Edit tool.

**Edit 1**, in `apps/api/src/imports/parsers/bank.ts`. Find:

```ts
// Two or more of x, X or *, then four or more digits, with dashes or spaces between any of them.
const MASKED_NUMBER = /(?<![A-Za-z0-9])[xX*](?:[\s-]*[xX*])+((?:[\s-]*[0-9]){4,})/;
```

Replace with:

```ts
// A masked number: two or more of x, X or *, then four or more digits, with
// dashes or spaces between any of them, not right after a letter or digit.
const isMask = (char: string) => char === 'x' || char === 'X' || char === '*';
const isDigit = (char: string) => char >= '0' && char <= '9';
const isSeparator = (char: string) => char === '-' || /\s/.test(char);
const isWordChar = (char: string) => /[A-Za-z0-9]/.test(char);

/**
 * The digits of the first masked number in a cell, or null. One pass from left
 * to right: a mask run without four digits after it is skipped whole, since a
 * start later in the same run has the same digits after it. Each character is
 * read a bounded number of times, so a cell of 10,000 `*` costs microseconds
 * (a backtracking regex took a third of a second per cell: P4-T10 review, MAJ-1).
 */
function maskedDigits(cell: string): string | null {
  let start = 0;
  while (start < cell.length) {
    if (!isMask(cell[start]) || (start > 0 && isWordChar(cell[start - 1]))) {
      start += 1;
      continue;
    }
    // The mask run: mask characters with only separators between them.
    let masks = 1;
    let end = start + 1;
    for (let at = end; at < cell.length && (isMask(cell[at]) || isSeparator(cell[at])); at += 1) {
      if (isMask(cell[at])) {
        masks += 1;
        end = at + 1;
      }
    }
    // Then the digits, with only separators between them.
    let digits = '';
    for (let at = end; at < cell.length && (isDigit(cell[at]) || isSeparator(cell[at])); at += 1) {
      if (isDigit(cell[at])) digits += cell[at];
    }
    if (masks >= 2 && digits.length >= 4) return digits;
    start = end;
  }
  return null;
}
```

**Edit 2**, same file, in `preambleAccountLabel`. Find:

```ts
      const masked = MASKED_NUMBER.exec(row.cells[index]);
      if (!masked) continue;
      const account = `xxx-${masked[1].replace(/[^0-9]/g, '').slice(-4)}`;
```

Replace with:

```ts
      const digits = maskedDigits(row.cells[index]);
      if (digits === null) continue;
      const account = `xxx-${digits.slice(-4)}`;
```

The file keeps the child's rules: Node built-ins only (`node:crypto`), erasable TypeScript, no new import.

Then GREEN:
1. `shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2/SHA256SUMS.final`, run from `WT`: 2 `OK`. Both files now equal the reviewer's verified copies byte for byte. If not, copy them from `R2/verified/...` with `cp` and check again.
2. `npm run typecheck`: passes.
3. `npm run test:api -- bank-statements`: `Tests: 18 passed, 18 total`.
4. `npm run test:api -- bank-statements parse-server parser-runner parse-worker`: `Test Suites: 4 passed, 4 total`, `Tests: 271 passed, 271 total`.

## 6. Step 4: mutation check

Run:

`python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2/files/mutate2.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p4-t10 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2-run/mutants > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2-run/mutants.log 2>&1`

It takes about 3 minutes, because R1 and R2 wait for the slow scans. Each mutant changes one exact string in `parsers/bank.ts`, runs `npm run test -w gogospend-api -- bank-statements` and restores the file from its own copy.

The reviewer's run (every line `KILLED`):

| Mutant | Tests | Failed |
|---|---|---|
| R1, the old backtracking regex restored | 2 failed, 16 passed, 18 total | both CPU tests |
| R2, a failed run restarts one character later (quadratic) | 2 failed, 16 passed | both CPU tests |
| R3, the scan gives up after the first failed run | 1 failed | `a mask run without four digits does not hide a later masked number in the same cell` |
| R4, no word-character check before the mask | 1 failed | `reads the masked account from the first preamble cell holding one` |
| R5, one mask character is enough | 1 failed | the same |
| R6, three digits are enough | 1 failed | the same |
| R7, no separators inside the mask run | 8 failed, 10 passed | |
| R8, a space is not a separator | 2 failed | the guard and `reads the masked account from the first preamble cell holding one` |

The last line must be `restored byte for byte: True`. A `SURVIVED` or `NOT APPLIED` line: stop and report it. Do not weaken a test.

Then run `shasum -a 256 -c .../SHA256SUMS.final` again from `WT`: 2 `OK`.

## 7. Step 5: gate (from `WT`)

1. `npm run typecheck`: passes.
2. `npm run test:api > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2-run/api.log 2>&1`: `Test Suites: 45 passed, 45 total`, `Tests: 980 passed, 980 total`. The reviewer's run, on the merge with `f33cdf0`, gave exactly that.
   - A real-child parse case may time out under the full suite's load. If that is the only failure, run the suite once more and record both runs.
   - If `HEAD_SHA` is later than `f33cdf0` and the count differs only because the integration head added API tests (check `/usr/bin/git diff --stat f33cdf0 origin/claude/p1a-vault-core -- apps/api`), record the count you saw. Step 8 says how to put it in the receipt.
3. `npm run build -w gogospend-api`: `Successfully compiled: 295 files with swc`.
4. `node apps/api/scripts/release-graph.mjs check`: `"files": 150`, `"closure_packages": 123`, `"problems": []`.
5. `node apps/api/scripts/parser-sandbox-check.cjs` (after the build): `"sandbox":{"supported":true}` and `"ok":true`. The reviewer saw Node `26.13.0`.
6. SKIPPED, because Docker is stopped (do not start it): `npm run test:db -w gogospend-api -- import-preview`. Record "Docker is not running on this machine; CI runs it".
7. After the commit (Step 9): `/usr/bin/git diff --check origin/claude/p1a-vault-core...HEAD` prints nothing.

## 8. Step 6: the receipt

Run:

`python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2/files/ledger.py round2 /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p4-t10/docs/implementation/premium-progress.md <HEAD_SHA>`

It prints `round-2 receipt edits applied: 4`. Then run:

`python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2/files/ledger.py check /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p4-t10/docs/implementation/premium-progress.md /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2-run/ledger-integration.md <HEAD_SHA>`

It must print ``ledger placement OK (status names `<HEAD_SHA>`)``.

If `HEAD_SHA` is `f33cdf0`, `shasum -a 256 docs/implementation/premium-progress.md` must give `56ac2a4742c7b2e426099cfb8987a8ea08e11fe27d328a82864f2ce488cf7968`. That is the verified `R2/verified/premium-progress-at-f33cdf0.md`, and its Task 10 section alone is `R2/verified/ledger-task10-section-at-f33cdf0.md`.

The four edits the script makes inside the `### P4 Task 10` section only (the exact text is in `ledger.py`'s `ROUND2` list):

1. **Status line** becomes:
   "- **Status:** built and verified locally on `p4/t10-thai-bank-exports`: round 1 on top of `d193a68`; round 2 (the review's fixes) after merging the integration head `<HEAD_SHA>` into the branch. Not pushed. The independent review is the controller's."
2. **Files line:** `(new, 15 tests);` becomes `(new; 15 tests, 18 after round 2);`.
3. **Before the SKIPPED bullet,** a new bullet `- **Round 2 (the review's fixes):**` with six sub-bullets:
   - MAJ-1, the one-pass reader and why there is no cap;
   - the three tests and their CPU bounds;
   - RED 2 failed, 16 passed, 18 total, then GREEN 18 and 271;
   - eight of eight mutants;
   - the gate: typecheck, 45 suites and 980 tests, 295 files, 150 files and no problems, the sandbox check, `git diff --check`;
   - MIN-1, the placement.

   The SKIPPED bullet itself:
   - says "(the gate's sandboxed-child parse)" where it said "(gate item 6)" (NIT-1);
   - adds "Round 2 skipped `npm run test:db -w gogospend-api -- import-preview` again, for the same reason."
4. **Notes,** three new bullets after "The owner's own export (Q10) ...":
   - for the owner and P4-T11, a bank export has no day-first fallback, so a statement whose days are all 12 or less is `ambiguous_date` throughout (MIN-2);
   - the CSV reader's 5,001-record cap counts preamble rows (NIT-2);
   - a `channel` or `ช่องทาง`-only details column becomes the merchant, for P4-T11 (NIT-3).

If a count you saw differs from the receipt text:
- If it is only the total test count, for the reason in Step 5 item 2: change `980 passed, 980 total` in that one bullet to what you saw, with your Edit tool, and say so in your final message.
- Any other difference: stop and report BLOCKED. Do not edit the receipt's numbers.

No amount, label, merchant or account number beyond what the prepared text holds goes into the receipt.

## 9. Step 7: commit

1. Write the message to `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2-run/commit-message.txt`:

   ```text
   Read the masked account in one pass and record the review notes

   The preamble's masked account was found with a backtracking regex
   that took a third of a second on a cell of 10,000 asterisks, so a
   1 MB preamble ran the parser child to its deadline. One left-to-right
   pass now applies the same rule. The receipt moves under P4 Task 1's
   heading and records the review's notes for the owner and P4-T11.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```

   The summary line is 64 characters.
2. `/usr/bin/git add apps/api/src/imports/parsers/bank.ts apps/api/src/imports/bank-statements.spec.ts docs/implementation/premium-progress.md`
3. `/usr/bin/git status --short`: only those three, staged; nothing unstaged or untracked.
4. `/usr/bin/git commit -F /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t10-round2-run/commit-message.txt`
5. `/usr/bin/git log --oneline -3`: your commit, the merge commit, `e3cf0e4` (or the integration's commits after it).
6. `/usr/bin/git diff --check origin/claude/p1a-vault-core...HEAD`: no output.
7. Run `ledger.py check ... <HEAD_SHA>` once more: `ledger placement OK`.

Do not push.

## 10. Your final message

As the protocol says:
- `STATUS: DONE` or `STATUS: BLOCKED` on the first line.
- The merge commit and fix commit SHAs, and `HEAD_SHA`.
- The three files.
- RED (2 failed, 16 passed, 18 total, with the two failure kinds) and GREEN (18; 271).
- Mutants (8 of 8 killed, restored).
- Each gate command with its counts, and `test:db` SKIPPED with the reason.
- The ledger check lines, and the ledger hash if `HEAD_SHA` is `f33cdf0`.
- Any count that differed and why.

# fix-parser-regex-followup: pin the rewritten parser matching with tests

- **Status:** built and verified locally on `fix/parser-regex-tests` (`.claude/worktrees/fix-parser-regex-tests`), cut from `origin/claude/p1a-vault-core` at `ad1fe18`, after `fix-parser-regex` (#350) merged. Not pushed. The independent review is the controller's. The planner's base was `52632f2`. `git diff --stat 52632f2 ad1fe18 -- apps/api docs/implementation/receipts` lists only `docs/implementation/receipts/1A-T9.md`, so the files this round reads or changes (the spec as committed, `xlsx.ts`, `synthetic-parse.ts`, the `fix-parser-regex` receipt) are unchanged at `ad1fe18`.
- **Why:** the review of `fix-parser-regex` (`.claude/controller/reviews/fix-parser-regex.md`) found two things.
  - MIN-1: six mutants of the lines that fix changed passed every committed test. The code was right, since the review's differential check found no difference from the old parsers. But nothing in CI would stop a later edit that brought one of them back.
  - NIT-1: wrong counts in that fix's receipt.
- **Ruling R89** (controller, 8 November 2026), as applied to this follow-up: test lines in `apps/api/src/imports/parser-linear.spec.ts` and the receipts only. No source file changes.
- **Files:**
  - `apps/api/src/imports/parser-linear.spec.ts` gains two helpers (`formatCell`, `cellWithNumFmts`) and six tests.
    - In `the parser reads long runs in linear time`:
      - `a custom number format of "]" and then a long run of "["`: in-process CPU time under 1,000 ms, measured like the four cases before it.
    - In `the rewritten matching reads exactly as before`:
      - `a second bracketed section hides its letters too`;
      - `a date letter counts right after the last "]", and in a code with no "]"`;
      - `a custom number format replaces a built-in one with the same id`;
      - `of two number formats with one id, the last one counts`;
      - `a number format without a code is no date`.
  - `docs/implementation/receipts/fix-parser-regex.md`: the sweep bullet's counts are corrected (NIT-1).
    - It said "20 by 4 surroundings, 54 run units". The planner's `sweep.mjs` has 18 prefixes by 4 suffixes and 52 run units.
    - It said every regex, 55. The parsers hold 58: 54 literals plus `date.ts`'s 4 built ones. The sweep pumped 55, and the three it left out are linear.
  - This file.
- **RED, by mutant** (`files/mutate.py` in the planner's folder):
  - Each mutant changes one line of `apps/api/src/imports/parsers/xlsx.ts`, runs `npm run test -w gogospend-api -- parser-linear`, then restores the file.
  - Before this change, all six passed every test (the review's MIN-1). Now each fails its new test:

    | Mutant | Change in `xlsx.ts` | Tests | Fails |
    |---|---|---|---|
    | X1 | `custom.get(id) ?? ...` becomes `\|\|` | 1 failed, 15 passed, 16 total | `a custom number format replaces a built-in one with the same id` |
    | X2 | the first `<numFmt>` with an id wins | 1 failed, 15 passed | `of two number formats with one id, the last one counts` |
    | X3 | the strip ends at the first `]`, not the last | 1 failed, 15 passed | `a second bracketed section hides its letters too` |
    | X4 | one character after the last `]` dropped | 2 failed, 14 passed | `a date letter counts right after the last "]", and in a code with no "]"`, and `of two number formats with one id, the last one counts` |
    | X9 | a `<numFmt>` without a code judged as `d` | 1 failed, 15 passed | `a number format without a code is no date` |
    | X10 | the strip runs over the whole code once it holds a `]` (quadratic again) | 1 failed, 15 passed | `a custom number format of "]" and then a long run of "["` |

  - `restored byte for byte: True`.
- **GREEN:**
  - `npm run test:api -- parser-linear bank-statements`: 28 passed before the change, 34 after.
  - `npm run test:api -- parser-linear bank-statements parse-server parser-runner parse-worker`: 287 passed (281 before).
- **The new CPU case's margin** (the planner's measurements, three runs each):
  - Idle: 1.3 to 4.6 ms of CPU.
  - With 36 busy processes on 18 cores: 1.6 to 2.1 ms.
  - The bound is 1,000 ms. Under X10 the case took 8,520 ms.
- **Gate** (worktree root):
  - `npm run typecheck`: passed.
  - `npm run test:api`: `Test Suites: 47 passed, 47 total`, `Tests: 1000 passed, 1000 total` (before, at `52632f2`, unchanged at `ad1fe18`: 47 suites, 994 tests).
  - `npm run build -w gogospend-api`: `Successfully compiled: 298 files with swc` (as at `52632f2`, unchanged at `ad1fe18`: no file is added).
  - `node apps/api/scripts/release-graph.mjs check`: `"files": 150`, `"closure_packages": 123`, `"problems": []`.
  - `node apps/api/scripts/parser-sandbox-check.cjs`: `"sandbox":{"supported":true}`, `"ok":true`.
  - `git diff --check origin/claude/p1a-vault-core...HEAD`: no output.
- **Deviations:**
  - The base is `ad1fe18`, not `52632f2`: the branch was cut from the newer integration head. Nothing under `apps/api` and no `fix-parser-regex` receipt changed between the two, so every count and start checksum in the plan holds.
  - The planner's checksum for this file no longer matches, because of the Status, gate and notes edits above. No figure changed.
- **SKIPPED:** `npm run test:db -w gogospend-api`. Docker is not running on this machine; CI runs it. This change has no database code. Nothing deployed; no cloud resource.
- **Notes for later:** no source file changed. `xlsx.ts` and `synthetic-parse.ts` are byte for byte as at `52632f2`, and unchanged at `ad1fe18`.

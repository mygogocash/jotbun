## Summary
- Follow-up to #350 (the parser regex DoS fix, R89). Test-only: six more cases in `apps/api/src/imports/parser-linear.spec.ts` pin how the statement parser reads XLSX number formats. They close the six mutants of #350's changed lines that its review found surviving (MIN-1):

  | Mutant | What it would break |
  | --- | --- |
  | X1 | `??` replaced by `\|\|` for a custom format reusing a built-in id |
  | X2 | the first `<numFmt>` with a given id wins instead of the last |
  | X3 | the bracket strip stops at the first `]` |
  | X4 | the character after the last `]` is dropped |
  | X9 | a `<numFmt>` without a code is read as a date |
  | X10 | the strip goes quadratic again on `]` followed by a long run of `[` (new CPU-time case, over 200x headroom under load) |

- No source file changes. The review's NIT-1 counts in `receipts/fix-parser-regex.md` are corrected: 18 prefixes by 4 suffixes, 52 run units, 58 regexes. The new receipt is `docs/implementation/receipts/fix-parser-regex-followup.md` (R87).
- The tests were written and proven by #350's reviewer. The committed spec is byte-identical to that verified copy, so the controller checked it rather than running a second full review.

## Test plan
- [x] `parser-linear` and `bank-statements`: 28 passed before, 34 after. The focused five suites: 287 passed (281 before).
- [x] Each of X1, X2, X3, X4, X9 and X10 is killed by its named new test, and every file was restored byte for byte.
- [x] `typecheck`; full `test:api` 47 suites, 1000 tests; API build 298 files; release graph with no problems; parser sandbox check; `git diff --check`.
- [ ] SKIPPED locally: `test:db` (Docker stopped); CI runs it.
- [ ] CI on this pull request is green.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## Summary
Closes three denial-of-service paths in the shared statement parser. Each is a pattern that let a small upload hold the one parser process (shared by all accounts) for its whole 30 s deadline. Ruling R89 and its extension (controller, 8 November) allow these changes in the frozen `apps/api`.
- `THB_SUFFIX` in `parsers/amount.ts` was quadratic. Amount cells of `(` followed by about 10,000 spaces and `5` made a 2 to 3 MB file time out. It loses its leading `\s*`; the `.trim()` that follows already removes those spaces.
- `explicitPlus` in `parsers/table.ts` had two adjacent `\s*`. It is rewritten so they no longer sit side by side.
- `isDateFormat`'s bracket strip in `parsers/xlsx.ts` was quadratic. A 2.4 KB XLSX ran to the deadline. It now strips only up to the last `]`.
- `readDateStyles` ran `isDateFormat` once per cell style, so a 6.8 KB workbook with one 1 MB format code and 25,000 styles timed out. It now judges each custom number format once, when the format is read.
- The new and old forms accept exactly the same input. A differential check found 0 differences over about 4.7 million comparisons, including 960,800 format codes checked exhaustively and 50,000 random `styles.xml` parts.
- The new `parser-linear.spec.ts` holds the speed bounds, measured in CPU time so a loaded runner cannot flake them: three cases in process (1,000 ms bound) and three through the real sandboxed child (5,000 ms bound). It also adds the P4-T10 review's missing case: `1234xx5678` gives null.
- The receipt is its own file under R87, `docs/implementation/receipts/fix-parser-regex.md`.

## Test plan
- [x] RED: 7 of 28 fail on today's code. The in-process cases took 4.5 to 8.5 s of CPU, and the child cases timed out. GREEN: 28 of 28.
- [x] Focused parser suites: 281 passed. Differential: 0 differences. Mutants: 11 of 11 killed.
- [x] `typecheck`, `test:api` (991), API build, release graph (150 files, no problems), parser sandbox check.
- [ ] CI on this pull request is green. `test:db` was skipped locally because Docker is stopped.
- [ ] Independent review.

Follow-up from P4-T10 (#345).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

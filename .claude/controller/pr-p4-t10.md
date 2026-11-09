## Summary
- The statement parser now reads real Thai bank exports (P4-T10). It handles:
  - a synthetic Thai CSV with a preamble, a masked account, Thai column headers, two-digit Buddhist-era years, quoted thousands and `0.00` in the column a row does not use;
  - an English XLSX with Excel date serials;
  - a `header_fingerprint` that hashes only the normalized header (no account number, amounts or rows).

  Fixtures are synthetic, per the owner's Q10 default. The sandbox check and `release-graph.json` are unchanged.
- First Opus review: Needs fixes. The masked-account regex in `bank.ts` was quadratic, so a 1 MB upload held the shared parser for its whole 30 s deadline. Every other finding was clean, including 68 differential inputs and 50,000 random files with 0 unexplained changes, and correct Buddhist-era leap days and Excel serials.
- Fix round (`8c06e1a`): a one-pass scan with no length cap.
  - It gives the same answer as the old regex on 1.6 million random cells and 84 hand-picked ones.
  - A 1,000,000-character cell takes 25 ms or less; a 12 MB preamble takes 301 ms of child CPU.
  - Two CPU-time tests (not wall clock) fail on the old regex and do not flake under load.
  - Confirming review: Approved.
- R84 (controller): three test-only API fixtures gained only `header_fingerprint: null`.
- Follow-up, outside this task: an older quadratic regex in `amount.ts` (`THB_SUFFIX`, from P2b) can still hold the parser through amount cells. It gets its own fix task.
- The branch: task commit, a merge of `f33cdf0`, the fix commit, and a merge of the integration head `01a5114`. That last merge had no conflicts; the ledger section sits under the single `## P4` heading, after P4 Task 1.

## Test plan
- [x] Round 1: RED 16 + 6 on typed stubs, GREEN, 25 of 25 mutants killed. Round 2: RED 2 of 18, GREEN 18 of 18, 8 of 8 mutants killed.
- [x] Typecheck; `test:api` 980; API build; release graph (150 files, no problems); parser sandbox check. Typecheck again after the merge.
- [ ] CI on this pull request is green (`test:db` was skipped locally because Docker is stopped)

Closes #218 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## Summary
- **P4-T4: the slip reader's import mode** for P4's slip import (A26, S4). `readSlipImage(input, deps, { fields: 'import' })` reads the slip's exact amount, day and time, and both sides: bank key, last four digits and name.
- **Two models, at most one re-read (P4, P5):**
  - Haiku 5.5 reads first.
  - Opus 5.5 reads once more, in the same request, when Haiku declines, gives an unusable answer, calls it a receipt or unreadable, or misses the amount, the day, the sender's bank or the receiver's name.
  - Opus's slip read wins, even when it misses a field too; there is never a third call.
  - When neither reads a slip, the read is `kind: 'unreadable'` with no `import` key.
- **What the models are sent (P10, privacy):** only the image, today and the locale, never the caller's wallets, categories or ids. The whole request is pinned with `toEqual`, and the module writes no log line, also pinned.
- **One call for both modes (P2):** P3-T8's model call moves unchanged into `callSlip`, so the import mode does not copy it. P3's five AI workers files pass on the new code, and three mutants on the moved code are killed by P3's own `slip-read.test.ts`.
- **`SlipNotRead.retryAfterSeconds` in both modes (P3, B27):** the failed call's wait, read from the slip's own trace.
- **What a read keeps (P6, P7, P8):**
  - A day from 1970-01-01 to today plus one, else null with `date_guessed`. An old genuine slip keeps its day (followups line 906).
  - Names by `normalizeMerchant`; a run of seven digits drops a name, Thai digits included.
  - Banks only by `THAI_BANK_KEYS` exactly.
- **The deadline (followups, P3-T8's notes):** P4's per-slip deadline leaves Opus at least 2 s after Haiku's 20 s cap. The deadline rows pin it, and the receipt notes it for P4-T6.
- **The controller accepted the planner's calls P1 to P15.**
  - Planned on Claude Opus, built on Claude Haiku 5.5.
  - The controller checked the commit: the four code and test files are byte-identical to the planner's `real/`. The receipt adds the controller's acceptance and the CI lines.
  - No package, lockfile, route, app or database change.

## Test plan
- [x] RED: 47 of 48 failing, every one an `AssertionError`. The passing case is "the single mode is unchanged".
- [x] GREEN: 48 of 48.
- [x] 58 of 58 mutants killed, in three batches, each output byte-identical to the planner's.
- [x] Local gate (R127): `typecheck:edge` at base, RED and GREEN; the focused Node file; `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs, including `test:edge`, `build:edge` and the workers suite with P3's five AI files.
- [ ] Independent review (Opus), and a second review (Sonnet): what each model is sent, when a second billed call happens, the refund rule (R116), and what a slip read keeps.

Closes #212 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

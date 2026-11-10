## Summary
- **Files on the vault's alarm (1B-T11).** The alarm now runs the file jobs as well as 1A's retention jobs:
  - prune exports, imports, attachments and snapshots;
  - delete due objects from R2;
  - start pending work.

  They run for an active vault only (P4) and one run at a time (P6), and the bucket is read inside the delete's own `try`, so an unbound bucket is a failed delete, retried a minute later (P7).
- **Every write arms the alarm (P8).** `call()` rearms when its context was touched, because `runCommand` touches it on commit. The background methods rearm with their own context. The writers (`writeExport`, `buildSnapshot`, `startPendingWork`) rearm even when they throw, so a reserved key left past its deadline is deleted then. Uploads now arm the alarm too (1B-T5's note).
- **R104 (P2, the controller's ruling):** a write never arms the alarm sooner than a minute ahead and never postpones an alarm already set sooner. The alarm's own rearm is exact, or a minute out after a failed job (P3).
  - Without the floor, workerd refuses the alarm that every release asks for (`delete_after = 0`), and alarms due at once fire themselves, racing about 40 existing tests.
  - A person never sees the minute, and a burst of writes becomes one alarm.
- **1B-T8's review m-1 is fixed (P1).** A stale snapshot keeps its row while its chunks are released at once, so a resent request reads `expired`, as the API answers, instead of stalling for a day. The residual case, a resend more than a week later, is accepted (the app takes a fresh key per resync).
- **More:**
  - `runFileJobs` returns the jobs that threw, so a failing prune brings the alarm back a minute later rather than in a loop (P5, R37);
  - `alarmAt` mirrors the alarm slot (P9);
  - migration `0003_alarm_indexes.sql` adds the two indexes the 1A-T8b review asked for (P11).
- The controller accepted the planner's calls P1 to P19, with P2 as R104 (receipt, Deviations). No package, lockfile, app, API or database change. The receipt is its own file under R87: `docs/implementation/receipts/1B-T11.md`.

## Test plan
- [x] RED on typed stubs: 25 of 72 failing, every one an assertion. GREEN: 72 of 72 in 3 files.
- [x] 32 of 32 mutants killed, each file restored; the 9 files match the planner's verified copies.
- [x] R100's fast gate:
  - `typecheck:edge`;
  - the focused run, 72 of 72;
  - AFFECTED: the 14 workers files the alarm now touches, 414 passed and 1 todo, under the heavy lock, for the reason the brief's P16 names;
  - `test:edge`, 15 files and 176 tests;
  - `build:edge` (722 kB, every driver marker at 0, no circular-dependency warning);
  - `git diff --check`.
- [ ] CI on this pull request is green, in the nine-job layout: the workers suite (+1 file, +23 passed) and the database suites.
- [ ] Independent review.
- [ ] SKIPPED: `test:edge:db` locally (Docker stopped; CI runs it) and hosted checks (nothing is deployed).

Closes #115 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## Summary
- **The download-pins follow-up: the test-only half of followups.md's fix-download-aborts entry.** It pins guards that the reviews of 1B-T6 to 1B-T11 found right but unpinned. Each review proved a mutant of its guard survived the committed cases. No source file changes; the R97 fix itself is #396, which shares no file with this PR.
- **What it pins, by file (19 new cases, 4 in-place edits; brief P9: new cases go at each file's end in their own blocks):**
  - **`exports.test.ts`:** the HEAD case counts bytes per download body, as the chunk HEAD case does (1B-T6 confirming review n-2; P4).
  - **`attachments.test.ts`:**
    - the receipt HEAD case counts bytes per body (1B-T9 m-2);
    - `prepare` checks the session, the policy and the account before it reserves or copies (m-1, AC-1 to AC-3);
    - `attachmentsDueAt` keeps both of its guards (m-3, DU-1 and DU-2, R37);
    - the copy path: the poll deadline, unknown body fields, a preview no longer ready, and two requests for one held image (n-1 to n-4);
    - the header's counts (n-5).
  - **`snapshots.test.ts`:**
    - `watchedSql` hands each row out as a revocable proxy, so the memory proof's spy cannot be bypassed with a spread (1B-T8 m-2; P3);
    - a build of a snapshot no longer pending reads nothing (m-3);
    - a chunk whose digest no longer matches fails as it streams (n-1);
    - a snapshot read at the purge revision is reused (n-2);
    - `snapshotsDueAt`'s stale term (1B-T11 m3);
    - `pruneSnapshots`' tombstone guard (n6). The planner wrote this case, since the review had no probe for it (P6).
  - **`imports-review.test.ts`:**
    - a correction of 500 rows binds its row ids as one parameter (R57; 1B-T10 m-1);
    - a never-accepted upload's preview answers 404, as the API does (m-2);
    - two comments (n-2).
  - **`ai.test.ts`:** what each AI route checks, and in what order: the `ai.consume` session pin (1B-T7 m-2, W7) and the P2 input probes (n-1).
- **The home of every item** in the followups entry is the table in `briefs/fix-download-aborts.md`. 1B-T10's n-3 was ruled by 1B-T11's P14; 1B-T9's n-6 needs no change; 1B-T9's n-5 labels in the merged receipt are controller housekeeping.
- The controller accepted the planner's calls P1 to P11 (receipt, Deviations). No source, route, package, lockfile, app, API or database change. The receipt is its own file under R87: `docs/implementation/receipts/download-pins.md`.

## Test plan
- [x] RED (P1): the 17 surviving review mutants applied together fail exactly the 20 expected cases. Those are the 18 new pins plus the two 1B-T8 spy cases that the revocable proxy now arms; nothing else fails, and every file is restored byte for byte.
- [x] GREEN: the five files, 242 of 242.
- [x] 20 of 20 mutants killed one at a time; V7 to V9 are also killed by existing cases (P5). The five files match the planner's verified copies.
- [x] R100's fast gate:
  - `typecheck:edge`;
  - the five files, 242 of 242, under the heavy lock;
  - `test:edge`, 15 files and 176 tests;
  - `build:edge`, with every driver marker at 0;
  - `git diff --check`.
- [x] With #396's files: the planner ran both briefs together (12 workers files, 392 passed and 1 todo), and each task's mutants apply on the combined tree.
- [ ] CI on this pull request is green (the nine jobs: workers +0 files and +19 passed). GitHub Actions is paused for billing; CI runs once that is fixed.
- [ ] Independent review (Opus: size L, test-only).
- [ ] SKIPPED: `test:edge:db` locally (Docker stopped; CI runs it).

No task issue: a follow-up from the reviews of 1B-T6 to 1B-T11.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## Summary
- **The alarm-hardening follow-up: the fixes and pins that 1B-T11's review asked for on the vault alarm** (m1, m2, m4; n1 to n5 and n9). The other findings are carried elsewhere: m3 and n6 by #397, n8 by #394, n10 by 1B-T13 and n7 by 1C-T11.
- **m1, the prune order (P1, P2):** `pruneSnapshots` now runs last in `FILE_PRUNES`, with `PRUNE_DUE_TIMES` in the same order. An import purge in the same alarm can no longer leave a stale snapshot that rearms the alarm at once (R37).
  - A dedicated case pins the order.
  - The R37 case now seeds a ready snapshot and a due import record. Its snapshot is read one revision ahead, because a plain seed passes on the base.
- **n1, a held run (P4):** a held one-run guard reports `delete_objects` as failed and logs `file_run_held`, so the alarm comes back a minute later instead of rearming at once.
- **n2, `rearm`'s rejections (P5):** one `.catch` on the settled `setAlarm` or `deleteAlarm`. It logs `vault_alarm_unset`, and clears `alarmAt` only while it still names that alarm. A refused alarm is then set again at the next `rearm`, and a later one is left alone.
- **m4, bounded due-time reads after every write (P6 to P9; ruling R105):**
  - **Migration `0004_alarm_bounds.sql` adds `attachment_checks`,** filled by four triggers on the events that can leave a retained receipt without a holder:
    - a receipt inserted before any record holds it;
    - a receipt set back to retained;
    - a last holder deleted;
    - a last holder moved.

    A backfill covers an upgraded vault. `attachmentsDueAt` reads its safety net from that table first. `pruneAttachments` keeps its full pass once per alarm and empties the table in the same block, so a statement that went around the triggers is still found.
  - **0004 also adds `entity_heads_imports_idx`,** the live import heads only. `importsDueAt` reads it first, through `LIVE_IMPORT_HEADS`, whose WHERE names the index's terms literally.
  - **At the review's sizes,** `reschedule`'s per-write block drops from 1.7 ms to 0.04 ms (rows read 10,001 to 2, and 6,006 to 6). At four times the receipts and ten times the imports, it drops from 13.55 ms to 0.365 ms.
  - The pins read the storage's own `rowsRead` (declared in `cloudflare-workers.d.ts`), not plan text or timings.
- **m2, n3 and n4, pins of code that is right:**
  - a delete throwing out of `runFileJobs` is reported to the alarm (PA);
  - `rearm`'s catch (PH);
  - the write floor through `background()` and `rearming()` (PE, PF).
- **n5, the import cycle (P10):** each prune-list entry now calls its function when it runs. The comment says why: the base worked only because the names are hoisted declarations, and Vite drops circular-dependency warnings. A what-if run of the review's R4 confirms it.
- **n9 (P11):** the correction to 1B-T11's P14 bound is in this receipt. The bound holds for import reviews, not selections; the purge loop still ends.
- **Where it meets download-pins (#397):** `attachments.ts` changes at lines 346, 354, 365 and 369. DU-1's guard at line 370 is untouched, and both DU-1 and DU-2 pass on this code. `previews.ts` line 188 is untouched.
- The controller accepted the planner's calls P1 to P14 (receipt, Deviations), with P6 recorded as ruling R105. No route, package, lockfile, app or API change. The receipt is its own file under R87: `docs/implementation/receipts/alarm-hardening.md`.

## Test plan
- [x] RED, on a table-only 0004 stub: 9 of 49 failing, every one an assertion. GREEN: 49 of 49.
- [x] 28 of 28 mutants killed, with verdicts matching the planner's line for line; the 10 files match the planner's verified copies.
- [x] R100's fast gate:
  - `typecheck:edge`;
  - the two focused files (49), under the heavy lock;
  - AFFECTED, the nine named workers files: 261 passed and 1 todo, under the heavy lock;
  - `test:edge`, 15 files and 176 tests;
  - `build:edge`: the vault bundle grows by about 5.5 kB, and every driver marker is at 0;
  - `git diff --check`.
- [ ] CI on this pull request is green (the nine jobs: workers +0 files and the new `files-alarm` cases). GitHub Actions is paused for billing; CI runs once that is fixed.
- [ ] Independent review (Opus: size M).
- [ ] SKIPPED: `test:edge:db` locally (Docker stopped; CI runs it), and hosted checks (nothing is deployed).

No task issue: a follow-up from 1B-T11's review.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

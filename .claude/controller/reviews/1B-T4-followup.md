# Review 1B-T4-followup: close the publish and delete race

Reviewer: Opus, read-only. Reviewed: commit `f922968` on `fix/1b-t4-object-races` (worktree `.claude/worktrees/fix-1b-t4-object-races`), plus the merge `288d395`, which brings in the integration head `47665f0` (PR #346). Range: `origin/claude/p1a-vault-core...HEAD` (base `c37ae6d`). Sources:
- the brief `.claude/controller/briefs/1B-T4-followup.md`, with its proof in `scratch/1b-t4-followup/`;
- the implementer's logs in `scratch/1b-t4-followup-impl/`;
- the 1B-T4 review (`reviews/1B-T4.md`: minors 1 to 3 and nit 1);
- plan `docs/superpowers/plans/2026-10-25-jotbun-p1b-vault-files.md`, `### Task 1B-T4` (line 376), 1B-T5, T6, T8, T9 and T11 for the callers;
- the protocol, including R87.

Scratch: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t4-followup-review/`
- `tree/`: `git archive HEAD` (the merge). `node_modules`, `apps/edge/node_modules` and `apps/api/node_modules` are symlinked from the worktree.
- `red/`: the same tree, with `objects.ts` from `c37ae6d` (SHA-256 `df51673c…`, the brief's pre-fix value).
- `probes/zz-review-probes.test.ts`: 12 probes (P1 to P6, U1 to U4). They ran in `tree/` and were then moved out, so the gate ran without them.
- `review_mutants.py` with `mutants/`: the brief's 13 mutants run again, plus 6 of my own.
- Logs: `probes-*.log`, `red.log`, `mutants-brief.txt`, `mutants-review.txt`, `gate-*.log`, and `lock.log`. Every workers run held `/private/tmp/claude-501/jotbun-heavy.lock`.

## What I ran

| Check | Result |
| --- | --- |
| Committed `objects.ts` and `files-objects.test.ts` against the proof's `final/` | SHA-256 identical (`b1ed59c4…`, `ef418dfc…`); `handler.ts` and `work.ts` unchanged in the range |
| RED: the 8 new cases on `c37ae6d`'s `objects.ts` | `Tests  4 failed \| 24 passed (28)`; the same four assertion messages the receipt quotes |
| The brief's mutant runner on `tree/` (`mutants-brief.txt`) | identical to the receipt: 12 killed, F3 survives (28 passed) |
| My extra mutants (`mutants-review.txt`) | R1 and R2 (`<` for `<=` in the success `DELETE` and `UPDATE`): killed (3 and 4 cases). R4 (`>` for `!==` in the total check): killed. R3 (`handOffWork` catches without logging): **survives**. R5 (the prefix guard without its trailing `/`): survives, equivalent. F3 with probe P3: see minor 1 and nit 2 |
| `npm run typecheck:edge` on the merged tree | passes |
| `npm run test:edge` on the merged tree | 13 files, 162 passed |
| `npm run test:edge:workers` on the merged tree | 21 files, 371 passed, 3 todo. #346 turned one todo on, so this is not the receipt's 369 + 4, which was measured on `f922968` before the merge |
| Implementer's `gate-*.log` | match the receipt: typecheck exit 0; node 162 (13 files); workers 369 + 4 todo (21 files); build writes `dist/jotbun_vault/index.js` |
| `git diff --check origin/claude/p1a-vault-core...HEAD` | clean |
| Merge `288d395` | brings only #346: `history`, `retention` and `transactions` tests, `receipts/1A-T8b-followup.md`, and one plan line at 1127 (outside Task 1B-T4). It touches no file of this task |

`test:edge:db` was not run (Docker is stopped; this change touches no PostgreSQL code). `build:edge` was not re-run; the implementer's log shows it.

## The questions in the brief

### Is the race closed?

Each row below is a probe or a case on the committed code. "Lost" means a published row whose object is gone, or a key whose late object is never deleted.

| Interleaving | Outcome |
| --- | --- |
| The writer's PUT and publish land during the delete, before R2 deletes (case 2, part 1; review probe 2a) | publish refused; the row becomes a tombstone; the object is gone. Nothing lost; the writer knows |
| R2 deletes, then the writer's PUT and publish land (case 2, part 2; probe 2b) | publish refused; the late object is deleted by the day-later run |
| A tombstone forgotten again during its second delete (case 2, part 3) | keeps its new deadline (F2 kills it) |
| Forgotten during a delete that fails (case 8) | keeps its new deadline (G4 kills it) |
| `releaseObject` during the delete | it only moves a deadline earlier, and a tombstone keeps its own (case 7). Not lost |
| `erase()` during the delete, awaited (P4a) or racing the success block (P4b) | `deleteDueObjects` does not throw; `vault_objects` is empty afterwards |
| A fresh-clock publish after a delete that failed cleanly (P2a) | **published** an hour past the original deadline. The object is still in R2, so nothing is lost, but the rule "given up at its deadline" no longer holds (minor 1) |
| A publish after a delete that removed the object and then threw (an ambiguous R2 failure, P2b) | **published, and R2 has no object** (minor 1) |
| Two overlapping runs, where A succeeds and B fails inside A's window, then a publish (P3) | **published, and R2 has no object.** Under mutant F3 the row is a tombstone and the publish is refused (minor 1, nit 2) |
| A writer that read its `FileContext` before its PUT and publishes with it during the delete (P1) | **published, `delete_after` null, and R2 has no object** (minor 2) |

So the fix closes the race the 1B-T4 review found (one run, a fresh clock, the delete in flight). Three paths remain, and each needs a writer that publishes past its deadline:
- a failed delete gives a given-up reservation another minute in which it can be published;
- overlapping runs, which the alarm alone cannot produce;
- a writer that publishes with a clock it read before its PUT.

### Is F3 equivalent?

Only under two conditions: one `deleteDueObjects` run at a time, and writers whose clocks are fresh.
- The receipt says "no registry function can move a due row that is not a tombstone to a later deadline while R2 deletes it". It leaves out `deleteDueObjects`' own failure path (`objects.ts:122`) in an overlapping run.
- P3 shows the difference: with the guard, run A's success leaves the row `reserved`, due a minute later, so it can still be published after A deleted its object. Without the guard (F3), A tombstones it and the publish is refused.
- So the guard is not defence in depth here; it is the step that keeps the stale reservation open.
- In production this needs two overlapping runs. Cloudflare's alarms page says "Only one instance of `alarm()` will ever run at a given time per Durable Object instance", and the plan gives `deleteDueObjects` only one caller, the alarm. So F3 is equivalent today, as long as 1B-T11 keeps it that way.

### The prefix guard (`objects.ts:40`)

P5 tried these keys:
- Refused with `invalid_key`: another vault's key; this vault's key under another purpose; this vault's id in upper case; `export/<id>x/...` (no `/` after the id).
- Accepted: legitimate export and receipt keys; also `<prefix>../<other vault>/x/export.csv` and the bare prefix `export/<id>/`.

Neither accepted key can reach another vault. R2 keys are literal: after the alarm deleted the `..` key, the other vault's `export/<other>/x/export.csv` was still present (`r2:present`). See nit 4.

No legitimate key is refused. Every key the plan builds is `vaultObjectKey(purpose, c.vaultId, ...)`, and `c.vaultId` is `ctx.id.toString()` in both `call()` and `fileContext()`. That covers 1B-T5 parts and images, 1B-T6 exports, 1B-T8 chunks and 1B-T9 receipt copies. R5 (no trailing `/`) is equivalent, because a vault id is always 64 hex characters.

### `putConcatenated` (`objects.ts:151-152`)

Both checks run before the copy, before `parts.length = 0` and before the PUT. Being inside an `async` function, they reject rather than throw. P6 results:
- Accepted: `[]` with total 0 (a zero-byte object); `[empty, [1,2]]` with total 2; a `subarray` view with its own `byteLength`.
- `RangeError`: `[]` with total 1; a total that is 1 too large; `NaN`; `-1`; `2.5`; a view's backing buffer length given as the total.

Overflow is not reachable: the sum is a JS number, exact up to 2^53, and the parts are capped far below that. `assertObjectKey` is the store's own rule.

### Tests and mutant claims

- RED is reproduced: 4 failed, 24 passed, with the same messages.
- The 13 claims are reproduced, case for case.
- Cases 5 to 8 pass on the old code and each fails under its G mutant, so each pins its rule.
- R3 survives: no case checks that the hand-off logs (nit 1).

### The `uncaught exception; source = Uncaught (in promise)` line (case 5, `files-objects.test.ts:637-660`)

This is a test-visible runtime report, not an unhandled rejection in production code.
- **U1:** the test calls `vaultOf(user).startPendingWork()` over RPC, with a starter whose `unstarted` throws, and handles the rejection at once with `.then(ok, err)`. The line is printed, the caller sees `caught:Error: probe-unreadable`, and the run exits 0. `handOffWork` is not involved.
- **U2:** the same call made inside the vault (`runInDurableObject`, no RPC), handled the same way. No line.
- **U3:** a real unhandled rejection inside the vault (`void Promise.reject(...)`). Vitest reports it as an unhandled error and the run exits **1**. Case 5's runs exit 0 with 28 passed.

So workerd prints the line on the callee's side when an exception leaves a Durable Object RPC method, even though the caller handles it.
- `handOffWork` (`handler.ts:45-47`) catches the rejection and logs `pending_work_unstarted` (the green log shows that line once).
- `startPendingWork` (`work.ts:85`) leaves no promise dangling: U2 shows it.
- A deployed vault would most likely record the same exception against its RPC invocation (inferred; I did not check a deployment). That is the expected cost of `startPendingWork` rejecting, which only a broken starter or a failed SQL read causes. It is not a leak.

The case's construction is right. A starter whose `start` rejects is caught inside `startPendingWork` and never reaches `handOffWork`, so `unstarted` (or `context`, `active`, `gates`) has to throw. The name could be clearer (nit 1).

### Receipt, commit, style

- The receipt is in its own file (R87), opens with `# 1B-T4-followup: the publish and delete race`, uses the house bullets, and leaves `premium-progress.md` alone.
- Its counts match the logs.
- Its deviations are accurate. The seven extra workers files and `test/contracts/currency.test.ts` are exactly what `d04a4f3..c37ae6d` adds. The base files' SHA-256 values match. The proof's logs (`scratch/1b-t4-followup/logs/green.log`, `gate-workers.log`) do print the uncaught line too.
- The F3 rationale is incomplete (nit 2). There are no notes for 1B-T11 and no fresh-clock rule for writers (minor 2, nit 3).
- The commit: summary `Close the vault registry's publish and delete race` (50 characters), the brief's body, a blank line, and `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`, as the protocol says. No line is over 72 characters.

## Findings

### Blocker

None.

### Major

None.

### Minor

**1. A failed R2 delete makes a given-up reservation publishable again for a minute.**

The failure path (`objects.ts:119-125`) moves a due `reserved` row to `now + DELETE_RETRY_MS` and keeps it `reserved`. `publishObject` (`objects.ts:56`) checks only `status = 'reserved' AND delete_after > now`, so for that minute the reservation counts as live again.

Evidence:
- **P2a:** reserved at `t0`, PUT, alarm at the deadline, clean R2 failure. The row is `reserved` until `deadline + 60 s`, and a fresh-clock publish at `deadline + 1` succeeds. The object is present, so nothing is lost, but the documented rule (`objects.ts:48-51`) is broken.
- **P2b:** the bucket deletes the object, then throws (a timeout after the commit). The publish at `deadline + 1` succeeds: `[{"status":"published","delete_after":null}] r2:absent`. That is a held receipt pointing at nothing, the exact outcome this task closes.
- **P3:** two overlapping runs give the same result. Run A deletes; run B fails inside A's window and moves the row; A's guarded `UPDATE` (line 131) skips it.

Why minor: it needs a writer that publishes after its own deadline, and either an R2 delete that fails after deleting, or two overlapping runs. The alarm, the only planned caller, never overlaps itself. The brief asked for the failing case explicitly, and the commit message's claim holds only while the delete is in flight.

Fix: the owner chooses one.
- (a) Accept and document it. In the receipt and in `publishObject`'s comment, say that after a failed delete a writer past its original deadline must still treat the key as given up.
- (b) Code. On the failure path, turn due `reserved` rows into `tombstone` rows due at `now + DELETE_RETRY_MS`, so a given-up key can never be published. The cost: that key's retry becomes its last delete, so a PUT that lands after the retry is not caught. Keeping B19's day-later second delete in that case needs a way to tell a first delete from a second, such as a status or a column, which means a migration.

Either way, the receipt's F3 sentence should change (nit 2).

**2. `publishObject`'s deadline check trusts `c.now`, and nothing tells writers to read it after the PUT.**

The fence compares against the caller's clock (`objects.ts:61`). `UserVault#fileContext()` reads the clock once, and `startPendingWork` already shows the pattern of reading a context once and using it after awaits (`work.ts:79-88`).

- **P1:** a writer reserves with `at(t0)`, PUTs, and publishes with that same context while the alarm (at the deadline) deletes. The publish succeeds and the row is `published` with a null deadline, but R2 has no object (`PROBE P1 published [{"status":"published","delete_after":null}] r2:absent`).
- 1B-T6's `writeExport` and 1B-T8's `buildSnapshot` are vault methods that reserve, await `putConcatenated`, then publish "in one block" (plan lines 684-685 and 817-818). Reusing the first context there is a natural way to write them.
- The receipt's note "Writers: publish before the reservation's deadline" does not cover this.

Fix: add one sentence to `publishObject`'s comment and to the receipt's notes for 1B-T6 and 1B-T8 (and any vault-side writer): "publish with a context built after the PUT (`this.fileContext()` again, or the command's own), never with one read before it." It costs nothing now, and it is the condition the fence depends on.

### Nit

1. **Case 5's name.**
   - "A start that rejects" reads like `WorkStarter.start`, but what rejects is the hand-off's `startWork(stub)`, the vault's `startPendingWork` over RPC.
   - "Is logged" is not asserted: R3, a catch that does not log, survives with 28 passed.
   - Suggestion: rename it, e.g. `a pending-work run that rejects is logged and never fails the reply`, and either spy on `console.error` for the `pending_work_unstarted` event or drop "is logged".
   - Add one comment line that workerd prints `uncaught exception; source = Uncaught (in promise)` for the rejected RPC, and that this is expected.
   - Neither the case nor the code needs to change for the line itself.
2. **The F3 rationale.** The receipt's sentence omits `deleteDueObjects`' own failure path in an overlapping run, and "defence in depth" is not accurate (P3: the mutant gives the better result there). Reword it: "Equivalent while one `deleteDueObjects` runs at a time (the alarm is its only caller, and Cloudflare runs one `alarm()` per object at a time) and writers publish with a fresh clock."
3. **No notes for 1B-T11** (and one for 1B-T9).
   - 1B-T11 should keep `deleteDueObjects` inside the alarm only, or guard it so runs never overlap (P3).
   - An `erase()` can land during the R2 await. P4 shows the run finishes on empty tables, but `touch(c)` still marks the context, so the alarm must check `erased` again after its awaits before it re-arms.
   - 1B-T9: a retain whose receipt copy is past its 180-second deadline now makes `publishObject` throw a plain `Error`, which `toProblemReply` turns into 500 `INTERNAL_ERROR` (`replies.ts:24-25`). The ported ready step should check `delete_after > now` first and answer 422 `expired`, as the API does.
4. **`reserveObject` does not call `assertObjectKey`.** It accepts `<prefix>../<other>/...` and the bare prefix (P5). This is harmless, since R2 keys are literal and P5 shows the other vault's object untouched. One `assertObjectKey(key)` before the prefix check would keep the registry to keys the store accepts, as `putConcatenated` now does.

## Verdict

The four edits do what the 1B-T4 review asked:
- `publishObject` refuses at the deadline;
- the success path changes only rows still due;
- `reserveObject` keeps to the vault's prefix;
- `putConcatenated` checks the key and the total.

Cases 5 to 8 pin the three deviations and the failure guard. The RED counts, the 13 mutant claims and the gate are reproduced, and the merged head typechecks and passes (node 162, workers 371 plus 3 todo).

The uncaught-exception line is workerd's report of a rejected Durable Object RPC call that the caller handles. It is not a defect.

What remains are paths where a writer publishes past its deadline:
- after a failed delete (minor 1);
- with a stale clock (minor 2);
- through overlapping runs, which the alarm does not produce.

Minor 2 should be settled before 1B-T6 and 1B-T8; minor 1 before 1B-T11 wires the alarm. Both are documentation, or a small change on the failure path.

VERDICT: Approved

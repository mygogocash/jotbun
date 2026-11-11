# Brief 1B-T4-followup: close the publish and delete race

You are the implementer (Haiku) for a small follow-up to plan 1B, Task 4. The 1B-T4 review (`/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/1B-T4.md`) approved Task 4 with three minors and a nit. The orchestrator ruled that this task fixes them. The reviewer wrote every edit below and proved it in a scratch copy of the reviewed commit `d04a4f3`:
- RED: 4 of 8 new cases fail on assertions, and the other 4 fail under their mutants.
- GREEN: 28 of 28.
- Mutants: 13 run, 12 killed, 1 equivalent and explained.
- The edge gate passes.

Do exactly what this brief says.

Read first:

1. The protocol, which is binding, including ruling **R87** in its opening notes (receipts go in their own file): `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`.
2. The review, sections "Minor" 1 to 3 and "Nit" 1: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/1B-T4.md`.
3. The plan task, for context only: `docs/superpowers/plans/2026-10-25-jotbun-p1b-vault-files.md`, `### Task 1B-T4` (line 376), and the plan's B4, B19 and R57 (Global Constraints, "SQL parameters").

## Paths and rules used below

- **WT** = the worktree the orchestrator made for you on branch `fix/1b-t4-object-races`, cut from `origin/claude/p1a-vault-core` after PR #341 (1B Task 4) merged. If the orchestrator named no path, it is `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/fix-1b-t4-object-races`. Work only there.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t4-followup-impl`, your scratch folder (`mkdir -p` it). Logs and backups go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t4-followup`, the reviewer's proof. Read and `cp` from it; never write into it. It holds:
  - `orig/`: the three files at `d04a4f3`.
  - `final/`: the verified results, `objects.ts`, `files-objects.test.ts`, `new-tests.block.ts` and the receipt template `1B-T4-followup.receipt.md`.
  - `tools/`: `edits.py` (this brief's objects.ts edits, each applied exactly once) and `mutants.py` (the mutant runner).
  - `logs/`, `mutants/` and `mutants-rerun/`: the runs.
  - `SHA256SUMS`, checked with `cd PL && shasum -a 256 -c SHA256SUMS`.
  - Every edit is also quoted in full below.
- Each shell call starts fresh, so type full paths. Git: `/usr/bin/git -C WT <command>`, one git command per call. Below, WT, S and PL stand for those full paths.
- **The heavy lock** wraps every workers run: the focused file, the mutant runner and `npm run test:edge:workers`.
  - Take it: `until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done`.
  - Release it: `rmdir /private/tmp/claude-501/jotbun-heavy.lock`, after a failure too.
  - Never remove a lock you did not take.
- **FOCUSED** (from `WT/apps/edge`, under the lock): `npx vitest run --config vitest.workers.config.ts --reporter=verbose test/workers/files-objects.test.ts`
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass.

## Scope (the orchestrator's ruling)

| File | Change |
| --- | --- |
| `apps/edge/src/vault/files/objects.ts` | Edits E1 to E7. `publishObject` refuses a reservation at or past its deadline. `deleteDueObjects`' success-path `DELETE` and `UPDATE` touch only rows still due, and its doc comment is corrected. `reserveObject` refuses a key outside `vaultPrefix(purpose, c.vaultId)`. `putConcatenated` asserts the key and checks that the parts add up to `totalBytes`. |
| `apps/edge/test/workers/files-objects.test.ts` | T1: add `WORK_STARTERS` to one import. T2: append 8 cases at the end of the file. |
| `docs/implementation/receipts/1B-T4-followup.md` | **new** (R87): your receipt. Create the `receipts/` folder if it is missing. |

Not in this task:
- `docs/implementation/premium-progress.md`. Do not edit it at all (R87). The note for 1B-T5 about overlapping starts goes in your receipt's "Notes for later tasks".
- The import grouping in `apps/edge/src/vault/user-vault.ts`. Leave it as it is.
- `apps/edge/src/v1/handler.ts` and every other file. The G1 to G4 tests pin behaviour the code already has, so only the tests are new.

## Step 0: sync, install and check the base

1. `/usr/bin/git -C WT status --short` is empty. `/usr/bin/git -C WT log --oneline -1` shows the integration head that contains PR #341.
2. Install if `WT/node_modules` is missing: `cd WT && npm ci --ignore-scripts --no-audit --no-fund`. If `WT/apps/edge/node_modules` is missing: `cd WT && npm run install:edge`.
3. Check that the three files are still those the reviewer proved against:
   `cd WT && shasum -a 256 apps/edge/src/vault/files/objects.ts apps/edge/test/workers/files-objects.test.ts apps/edge/src/v1/handler.ts`
   Expected (the values at `d04a4f3`, unchanged in PR #341's head `026caa8`):
   ```
   df51673cf6318576598e30dce44b7fe5e2b95d284f4d9a2c5450657f93ba772f  apps/edge/src/vault/files/objects.ts
   4623f15d5e3fdf143ff950416d3b988b7b6038d0fd89e41639d0be8baf469401  apps/edge/test/workers/files-objects.test.ts
   17f0bd9126b4b33c5a4e10146028689826d7342b08dd24a067eef6e1704deb81  apps/edge/src/v1/handler.ts
   ```
   If one differs, a later merge changed it.
   - Show what changed: `/usr/bin/git -C WT log --oneline d04a4f3..HEAD -- <that file>` and `/usr/bin/git -C WT diff d04a4f3 HEAD -- <that file>`.
   - For `objects.ts`, run `python3 -I PL/tools/edits.py WT/apps/edge/src/vault/files/objects.ts S/objects.check.ts`. It applies E1 to E7 to a copy in S and exits with `edit N: Find occurs K times` if any Find string is not found exactly once.
   - If every Find occurs once and the other change does not touch the lines these edits or tests use, go on. In that case the final SHA-256 values below will not match: record the differing commit in your receipt.
   - Otherwise stop and report BLOCKED with that output.
4. `cd PL && shasum -a 256 -c SHA256SUMS` reports every line `OK`.

## Step 1: the tests, then RED

Make both edits to `WT/apps/edge/test/workers/files-objects.test.ts`.

#### T1: the work import

Find:

```ts
import { START_RETRY_MS, createOnce, startDueAt, startPendingWork } from '../../src/vault/files/work'
```

Replace with:

```ts
import { START_RETRY_MS, WORK_STARTERS, createOnce, startDueAt, startPendingWork } from '../../src/vault/files/work'
```

#### T2: the eight cases

Append the whole of `PL/final/new-tests.block.ts`, quoted in full in Appendix A, to the end of the file, after the last case (`the download slots keep the API limits: ...`): `cat PL/final/new-tests.block.ts >> WT/apps/edge/test/workers/files-objects.test.ts`. The block begins with an empty line.

Check: `shasum -a 256 WT/apps/edge/test/workers/files-objects.test.ts`. Expected: `ef418dfcd6ea14ccfbf2e55d87f3104f1eb52d569e9b77d0cf06b454f94382a1` (the same as `PL/final/files-objects.test.ts`). It is expected to differ only if Step 0 found that file changed.

The eight cases (names exact):

| # | Case | Covers |
| --- | --- | --- |
| 1 | `a reservation is published only before its deadline` | Minor 1: a publish 1 ms before the deadline succeeds, and one at the deadline throws and writes nothing |
| 2 | `a write or a forget that lands while a delete is in flight is never lost` | Minor 1 and nit 2, through interleaving buckets: the PUT and publish land before the delete (review probe 2a); the delete lands before the PUT and publish (probe 2b), and the late object goes a day later; a tombstone forgotten again during its second delete keeps its new deadline (probe 8) |
| 3 | `a vault reserves only keys under its own prefix` | Minor 2: another vault's key, and this vault's key under another purpose, are `ObjectStoreError('invalid_key')` and write nothing |
| 4 | `putConcatenated refuses a bad key, or parts that do not add up to totalBytes, before it stores anything` | Nit 1: a bad key; totals too large, too small and for a single part; no `put` call, and the parts are left as they were |
| 5 | `a start that rejects is logged and never fails the reply` | Minor 3, G1 (deviation 3) |
| 6 | `a failed batch does not stop the next one` | Minor 3, G2 (deviation 4) |
| 7 | `releasing a tombstone keeps its second delete a day later` | Minor 3, G3 (deviation 6) |
| 8 | `a failed delete leaves a deadline a writer moved during it` | Minor 3, G4 (the failure path's guard) |

Typecheck: `cd WT && npm run typecheck:edge`. Expected: exit 0. The tests use only existing exports.

RED (under the lock): `cd WT/apps/edge && npx vitest run --config vitest.workers.config.ts --reporter=verbose test/workers/files-objects.test.ts > S/red.log 2>&1`. Expected:
- `Tests  4 failed | 24 passed (28)`, and every failure is an assertion:
  - case 1: `expected [Function] to throw an error`
  - case 2: `expected 'published' to be 'refused' // Object.is equality`
  - case 3: `expected null to be an instance of ObjectStoreError`
  - case 4: `promise resolved "{ bytes: 2, …(1) }" instead of rejecting`
- Cases 5 to 8 pass here: they pin behaviour Task 4 already has. Their RED is their mutant: in the reviewer's proof, G1 to G4 applied to the `d04a4f3` code each failed its case (`PL/mutants/mutant-orig-G*.log`, `PL/logs/mutants-orig.txt`). You run G1 to G4 again on your GREEN code in Step 3.

## Step 2: the code, then GREEN

Make edits E1 to E7 to `WT/apps/edge/src/vault/files/objects.ts`, in order, with the Edit tool and the exact strings below. Each Find occurs exactly once. `PL/tools/edits.py` applies the same seven edits, so `python3 -I PL/tools/edits.py <in> <out>` checks them.

#### E1: the store import

Find:

```ts
import { ObjectStoreError } from '@api/storage/object-store'
```

Replace with:

```ts
import { ObjectStoreError, assertObjectKey } from '@api/storage/object-store'
```

#### E2: the keys import

Find:

```ts
import type { FileContext } from './context'
import type { VaultBucket, VaultObjectPurpose } from './keys'
```

Replace with:

```ts
import type { FileContext } from './context'
import { vaultPrefix } from './keys'
import type { VaultBucket, VaultObjectPurpose } from './keys'
```

#### E3: `reserveObject` refuses a key outside this vault's prefix

Find:

```ts
/** Registers a key before anyone writes it. It is due at now plus `graceMs` unless it is published first. A key already registered throws. */
export function reserveObject(c: FileContext, key: string, purpose: VaultObjectPurpose, graceMs: number = RESERVATION_GRACE_MS): void {
  const now = c.now.getTime()
```

Replace with:

```ts
/**
 * Registers a key before anyone writes it. It is due at now plus `graceMs`
 * unless it is published first. A key already registered throws, and so does
 * a key outside this vault's prefix for its purpose (`<purpose>/<vaultId>/`,
 * ObjectStoreError('invalid_key')), so the alarm never deletes another vault's object.
 */
export function reserveObject(c: FileContext, key: string, purpose: VaultObjectPurpose, graceMs: number = RESERVATION_GRACE_MS): void {
  if (!key.startsWith(vaultPrefix(purpose, c.vaultId))) throw new ObjectStoreError('invalid_key')
  const now = c.now.getTime()
```

#### E4: `publishObject` publishes a reservation only before its deadline

Find:

```ts
 * never for a held receipt (null). Only a reserved key can be published: any
 * other key throws and nothing is written.
 */
export function publishObject(c: FileContext, key: string, file: { bytes: number; sha256: string }, deleteAfter: number | null): void {
  const published = c.sql
    .exec("UPDATE vault_objects SET status = 'published', bytes = ?, sha256 = ?, delete_after = ? WHERE key = ? AND status = 'reserved' RETURNING key", file.bytes, file.sha256, deleteAfter, key)
    .toArray()
  if (published.length === 0) throw new Error('only a reserved key can be published')
```

Replace with:

```ts
 * never for a held receipt (null). Only a key still reserved, before its
 * deadline, can be published. At its deadline a reservation is due and given
 * up (the alarm may be deleting it from R2 at that moment), so publishing it
 * then, or any key that is not reserved, throws and nothing is written.
 */
export function publishObject(c: FileContext, key: string, file: { bytes: number; sha256: string }, deleteAfter: number | null): void {
  const published = c.sql
    .exec(
      "UPDATE vault_objects SET status = 'published', bytes = ?, sha256 = ?, delete_after = ? WHERE key = ? AND status = 'reserved' AND delete_after > ? RETURNING key",
      file.bytes,
      file.sha256,
      deleteAfter,
      key,
      c.now.getTime(),
    )
    .toArray()
  if (published.length === 0) throw new Error('only a key still reserved can be published')
```

#### E5: `deleteDueObjects`' doc comment

Find:

```ts
 * fire again at once. Each batch reads the vault clock afresh. Stops when
 * nothing is due, or after `maxBatches`. Returns how many keys R2 deleted.
```

Replace with:

```ts
 * fire again at once. A row a writer changed while R2 was deleting (a key
 * forgotten again) keeps that change: only rows still due are tombstoned or
 * dropped. Each batch reads the vault clock afresh. Stops when nothing is
 * due, or after `maxBatches`. Returns how many keys it asked R2 to delete
 * (R2 does not say which of them existed).
```

#### E6: the success path tombstones or drops only rows still due

Find:

```ts
      c.sql.exec("DELETE FROM vault_objects WHERE key IN (SELECT value FROM json_each(?)) AND status = 'tombstone'", JSON.stringify(forgotten))
      c.sql.exec("UPDATE vault_objects SET status = 'tombstone', delete_after = ? WHERE key IN (SELECT value FROM json_each(?)) AND status <> 'tombstone'", now + TOMBSTONE_MS, JSON.stringify(given))
```

Replace with:

```ts
      c.sql.exec("DELETE FROM vault_objects WHERE key IN (SELECT value FROM json_each(?)) AND status = 'tombstone' AND delete_after <= ?", JSON.stringify(forgotten), now)
      c.sql.exec("UPDATE vault_objects SET status = 'tombstone', delete_after = ? WHERE key IN (SELECT value FROM json_each(?)) AND status <> 'tombstone' AND delete_after <= ?", now + TOMBSTONE_MS, JSON.stringify(given), now)
```

#### E7: `putConcatenated` checks the key and the total first

Find:

```ts
 * R2ObjectStore.putStream keeps it. A key already in R2 is
 * ObjectStoreError('exists'); any other failure is 'unavailable'.
 */
export async function putConcatenated(bucket: VaultBucket, key: string, parts: Uint8Array[], totalBytes: number, contentType: string): Promise<{ bytes: number; sha256: string }> {
  const data = parts.length === 1 ? parts[0] : Buffer.concat(parts, totalBytes)
```

Replace with:

```ts
 * R2ObjectStore.putStream keeps it. A key already in R2 is
 * ObjectStoreError('exists'); any other failure is 'unavailable'. Before
 * anything is copied or stored, a key that fails the store's key rule is
 * ObjectStoreError('invalid_key'), and parts that do not add up to
 * `totalBytes` are a RangeError, so the caller's parts are left as they were.
 */
export async function putConcatenated(bucket: VaultBucket, key: string, parts: Uint8Array[], totalBytes: number, contentType: string): Promise<{ bytes: number; sha256: string }> {
  assertObjectKey(key)
  if (parts.reduce((sum, part) => sum + part.byteLength, 0) !== totalBytes) throw new RangeError('the parts do not add up to totalBytes')
  const data = parts.length === 1 ? parts[0] : Buffer.concat(parts, totalBytes)
```

Check: `shasum -a 256 WT/apps/edge/src/vault/files/objects.ts`. Expected: `b1ed59c4bd96e3f81cb2cf99cc4ef0ac2dec1a598d1f97349d5c792db0108fe6` (the same as `PL/final/objects.ts`). It is expected to differ only if Step 0 found that file changed.

Typecheck: `cd WT && npm run typecheck:edge`. Expected: exit 0.

GREEN (under the lock): FOCUSED `> S/green.log 2>&1`. Expected:
- `Tests  28 passed (28)`.
- Exactly 9 event lines on stderr: `object_delete_failed` 4, `work_start_failed` 2, `pending_work_unstarted` 1, `config_unreadable` 1, `config_malformed` 1. Count them with `grep -o 'event":"[a-z_]*' S/green.log | sort | uniq -c`. The default reporter prints none of them, as Task 4's receipt (deviation 14) says.

## Step 3: mutants

Run the reviewer's runner on your GREEN tree (under the lock):
`python3 -I PL/tools/mutants.py WT/apps/edge S final > S/mutants.txt 2>&1`

It applies each mutant alone (the exact Find and Replace are in `PL/tools/mutants.py`), runs FOCUSED, restores the file and asserts its SHA-256 is back. It writes `S/mutant-final-<id>.log` and `S/mutants-final.json`. Expected, with the same lines as `PL/logs/mutants-final-rerun.txt`:

| Id | Mutant (file) | Expected | Failing case |
| --- | --- | --- | --- |
| F1 | `publishObject` ignores the deadline: `AND delete_after > ?` becomes `AND ? > 0` (objects.ts) | 2 failed, 26 passed | 1; 2 |
| F1b | `>=` for `>` in `publishObject` (objects.ts) | 1 failed, 27 passed | 1 |
| F2 | the success `DELETE` without its guard: `AND delete_after <= ?` becomes `AND ? > 0` (objects.ts) | 1 failed, 27 passed | 2 |
| F3 | the success `UPDATE` without its guard (objects.ts) | **28 passed: equivalent** | none |
| F4 | `reserveObject` without the prefix guard (objects.ts) | 1 failed, 27 passed | 3 |
| F4b | the guard checks only the vault id, ``key.includes(`/${c.vaultId}/`)`` (objects.ts) | 1 failed, 27 passed | 3 |
| F5 | `putConcatenated` without `assertObjectKey` (objects.ts) | 1 failed, 27 passed | 4 |
| F6 | `putConcatenated` without the total check (objects.ts) | 1 failed, 27 passed | 4 |
| F7 | the total checked only when there are several parts (objects.ts) | 1 failed, 27 passed | 4 |
| G1 | `handOffWork` without its `.catch(...)` (handler.ts) | 1 failed, 27 passed | 5 |
| G2 | `break` for `continue` after a failed batch (objects.ts) | 1 failed, 27 passed | 6 |
| G3 | `releaseObject` also moves a tombstone's deadline (objects.ts) | 1 failed, 27 passed | 7 |
| G4 | the failure update without its `delete_after <= ?` guard (objects.ts) | 1 failed, 27 passed | 8 |

F3 is equivalent, and the receipt says why:
- Once `publishObject` refuses a due reservation, no registry function can move a due row that is not a tombstone to a later deadline while R2 is deleting it.
- `tombstoneObjects` makes the row a tombstone, which the `UPDATE` skips.
- `releaseObject` only makes the row due sooner.
- The guard stays as defence in depth, matching the failure path.

Afterwards:
- `/usr/bin/git -C WT diff --stat` shows only your three files. `handler.ts` is unchanged.
- `shasum -a 256 WT/apps/edge/src/vault/files/objects.ts WT/apps/edge/src/v1/handler.ts` gives the Step 2 value and the Step 0 value.

## Step 4: the edge gate

From WT:
- `npm run typecheck:edge`. Expected: exit 0.
- `npm run test:edge`. Expected: `Test Files  12 passed (12)`, `Tests  156 passed (156)`, unless the integration head added node tests.
- `npm run test:edge:workers`, under the lock. Expected: every file passes. The reviewer's count on `d04a4f3` was `Test Files  14 passed (14)` and `Tests  276 passed (276)`: Task 4's 268 plus the 8 new cases. A later integration head may add tests; report what you see.
- `npm run build:edge`. Expected: exit 0, and `dist/jotbun_vault/index.js` is built.
- `npm run test:edge:db`: **SKIPPED**. Docker is stopped on this machine. Do not start it. Record it as SKIPPED with that reason; this change touches no PostgreSQL code, and CI's database job runs it.
- `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD` after your commit, or `/usr/bin/git -C WT diff --check` before it. Expected: no output.

## Step 5: the receipt (R87)

Create `WT/docs/implementation/receipts/1B-T4-followup.md` from `PL/final/1B-T4-followup.receipt.md`, quoted in Appendix B.
- Replace every `<...>` with what you observed: the integration head's SHA, and the counts from Steps 1 to 4.
- If a count differs from the template, write your own count and say why in "Deviations".
- If Step 0 found a changed file, name its commit there too.
- Keep the first line exactly `# 1B-T4-followup: the publish and delete race`.
- Do not edit `docs/implementation/premium-progress.md`.

## Step 6: commit

Stage only the three files:

```
/usr/bin/git -C WT add apps/edge/src/vault/files/objects.ts
/usr/bin/git -C WT add apps/edge/test/workers/files-objects.test.ts
/usr/bin/git -C WT add docs/implementation/receipts/1B-T4-followup.md
```

Commit message (summary line 51 characters, no type prefix):

```
Close the vault registry's publish and delete race

publishObject refuses a reservation at or past its deadline, and
deleteDueObjects tombstones or drops only rows still due, so a write
or forget that lands during the alarm's R2 delete is never lost.
reserveObject keeps keys under the vault's own prefix, putConcatenated
checks the key and the total, and the 1B-T4 deviations get tests.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
```

Write it to `S/commit-message.txt` and run `/usr/bin/git -C WT commit -F S/commit-message.txt`. Do not push.

## Your final message

Follow the protocol's format:
- `STATUS: DONE` or `STATUS: BLOCKED` on the first line.
- The commit SHA and branch, and the three files.
- RED (4 failed, 24 passed; cases 5 to 8 through G1 to G4), GREEN (28).
- The mutants: 12 killed, F3 equivalent.
- Each gate command with its result, and `test:edge:db` SKIPPED.
- Any deviation.

## Appendix A: the eight cases (`PL/final/new-tests.block.ts`, appended as is)

```ts
// 1B-T4 follow-up: the publish and delete race, the vault's own prefix, putConcatenated's checks, and the deviations' tests.

it('a reservation is published only before its deadline', async () => {
  await runInDurableObject(freshVault(), (_v, state) => {
    const early = keyOf(state)
    const late = keyOf(state)
    reserveObject(at(state, t0), early, 'export')
    reserveObject(at(state, t0), late, 'export')
    const deadline = t0 + RESERVATION_GRACE_MS
    publishObject(at(state, deadline - 1), early, { bytes: 3, sha256: SHA }, t0 + DAY)
    expect(rowOf(state, early)).toEqual([{ status: 'published', delete_after: t0 + DAY }])
    // At its deadline the reservation is due and given up: publishing it throws and writes nothing.
    const c = at(state, deadline)
    expect(() => publishObject(c, late, { bytes: 3, sha256: SHA }, t0 + DAY)).toThrow()
    expect(rowOf(state, late)).toEqual([{ status: 'reserved', delete_after: deadline }])
    expect(c.touched).toBeUndefined()
  })
})

it('a write or a forget that lands while a delete is in flight is never lost', async () => {
  await runInDurableObject(freshVault(), async (_v, state) => {
    const now = t0 + RESERVATION_GRACE_MS
    const tryPublish = (key: string): 'published' | 'refused' => {
      try {
        publishObject(at(state, now + 1), key, { bytes: 3, sha256: SHA }, null)
        return 'published'
      } catch {
        return 'refused'
      }
    }

    // The writer's PUT and publish land before the delete reaches R2: the publish is refused, so the writer knows.
    const putFirst = keyOf(state, 'receipt')
    reserveObject(at(state, t0), putFirst, 'receipt')
    let first = ''
    const putThenDelete = {
      delete: async (keys: string | string[]) => {
        await env.OBJECTS.put(putFirst, new Uint8Array([1, 2, 3]))
        first = tryPublish(putFirst)
        await env.OBJECTS.delete(keys)
      },
    } as unknown as VaultBucket
    expect(await deleteDueObjects({ context: () => at(state, now), bucket: putThenDelete })).toBe(1)
    expect(first).toBe('refused')
    expect(rowOf(state, putFirst)).toEqual([{ status: 'tombstone', delete_after: now + TOMBSTONE_MS }])
    expect(await env.OBJECTS.head(putFirst)).toBeNull()

    // The delete reaches R2 first, then the PUT and the publish: the publish is refused and the late object is deleted a day later.
    const deleteFirst = keyOf(state, 'receipt')
    reserveObject(at(state, t0), deleteFirst, 'receipt')
    let second = ''
    const deleteThenPut = {
      delete: async (keys: string | string[]) => {
        await env.OBJECTS.delete(keys)
        await env.OBJECTS.put(deleteFirst, new Uint8Array([1, 2, 3]))
        second = tryPublish(deleteFirst)
      },
    } as unknown as VaultBucket
    expect(await deleteDueObjects({ context: () => at(state, now), bucket: deleteThenPut })).toBe(1)
    expect(second).toBe('refused')
    expect(rowOf(state, deleteFirst)).toEqual([{ status: 'tombstone', delete_after: now + TOMBSTONE_MS }])
    expect(await env.OBJECTS.head(deleteFirst)).not.toBeNull()
    await deleteDueObjects({ context: () => at(state, now + TOMBSTONE_MS), bucket: env.OBJECTS })
    expect(await env.OBJECTS.head(deleteFirst)).toBeNull()
    expect(rowOf(state, deleteFirst)).toEqual([])

    // A tombstone its writer forgets again while its second delete is in flight keeps the new deadline.
    const forgotten = keyOf(state)
    reserveObject(at(state, t0), forgotten, 'export')
    tombstoneObjects(at(state, t0), [forgotten])
    const later = t0 + TOMBSTONE_MS
    const forgetDuring = {
      delete: async (keys: string | string[]) => {
        await env.OBJECTS.delete(keys)
        tombstoneObjects(at(state, later + 1), [forgotten])
      },
    } as unknown as VaultBucket
    expect(await deleteDueObjects({ context: () => at(state, later), bucket: forgetDuring })).toBe(1)
    expect(rowOf(state, forgotten)).toEqual([{ status: 'tombstone', delete_after: later + 1 + TOMBSTONE_MS }])
  })
})

it('a vault reserves only keys under its own prefix', async () => {
  await runInDurableObject(freshVault(), (_v, state) => {
    const refusal = (run: () => void): unknown => {
      try {
        run()
        return null
      } catch (error) {
        return error
      }
    }
    const c = at(state, t0)
    const others = vaultObjectKey('export', env.VAULT.idFromName(randomUUID()).toString(), randomUUID(), randomUUID(), 'export.csv')
    const otherVault = refusal(() => reserveObject(c, others, 'export'))
    expect(otherVault).toBeInstanceOf(ObjectStoreError)
    expect(otherVault).toMatchObject({ code: 'invalid_key' })
    // This vault's own key, named under another purpose, is refused the same way.
    const otherPurpose = refusal(() => reserveObject(c, keyOf(state, 'receipt'), 'export'))
    expect(otherPurpose).toBeInstanceOf(ObjectStoreError)
    expect(otherPurpose).toMatchObject({ code: 'invalid_key' })
    expect(state.storage.sql.exec('SELECT count(*) AS n FROM vault_objects').one()).toEqual({ n: 0 })
    expect(c.touched).toBeUndefined()
    reserveObject(c, keyOf(state), 'export')
    expect(state.storage.sql.exec('SELECT count(*) AS n FROM vault_objects').one()).toEqual({ n: 1 })
  })
})

it('putConcatenated refuses a bad key, or parts that do not add up to totalBytes, before it stores anything', async () => {
  const key = vaultObjectKey('export', env.VAULT.idFromName(randomUUID()).toString(), randomUUID(), randomUUID(), 'export.csv')
  let puts = 0
  const counting = {
    put: (...args: Parameters<VaultBucket['put']>) => {
      puts += 1
      return env.OBJECTS.put(...args)
    },
  } as unknown as VaultBucket
  const bad = 'Not A Vault Key'
  const parts = [new Uint8Array([1]), new Uint8Array([2])]
  await expect(putConcatenated(counting, bad, parts, 2, 'text/csv')).rejects.toMatchObject({ code: 'invalid_key' })
  await expect(putConcatenated(counting, key, parts, 5, 'text/csv')).rejects.toThrow(RangeError)
  await expect(putConcatenated(counting, key, parts, 1, 'text/csv')).rejects.toThrow(RangeError)
  await expect(putConcatenated(counting, key, [new Uint8Array([1, 2, 3])], 2, 'text/csv')).rejects.toThrow(RangeError)
  // A refused call stores nothing and leaves the caller's parts as they were.
  expect(puts).toBe(0)
  expect(parts.length).toBe(2)
  expect(await env.OBJECTS.head(bad)).toBeNull()
  expect(await env.OBJECTS.head(key)).toBeNull()
  expect(await putConcatenated(counting, key, parts, 2, 'text/csv')).toMatchObject({ bytes: 2 })
  expect(puts).toBe(1)
})

it('a start that rejects is logged and never fails the reply', async () => {
  const me = VAULT_V1_ROUTES.find((route) => route.vault === 'me.get')!
  const broken: WorkStarter = {
    kind: 'export',
    unstarted: () => {
      throw new Error('unreadable')
    },
    dueAt: () => null,
    start: async () => 'started',
    markStarted: () => undefined,
  }
  me.starts = true
  WORK_STARTERS.push(broken)
  try {
    const client = await startV1()
    const user = await member(client)
    expect((await client.as(user).get('/v1/me')).status).toBe(200)
    await expect(client.settle()).resolves.toBeUndefined()
    expect(await lastStart(user)).toEqual(expect.any(Number))
  } finally {
    delete me.starts
    WORK_STARTERS.splice(WORK_STARTERS.indexOf(broken), 1)
  }
})

it('a failed batch does not stop the next one', async () => {
  await runInDurableObject(freshVault(), async (_v, state) => {
    for (let n = 0; n < 1001; n += 1) reserveObject(at(state, t0), keyOf(state), 'export')
    const batches: number[] = []
    const failing = {
      delete: async (keys: string | string[]) => {
        batches.push(Array.isArray(keys) ? keys.length : 1)
        throw new Error('R2 is down')
      },
    } as unknown as VaultBucket
    const now = t0 + RESERVATION_GRACE_MS
    expect(await deleteDueObjects({ context: () => at(state, now), bucket: failing })).toBe(0)
    expect(batches).toEqual([1000, 1])
    expect(state.storage.sql.exec("SELECT count(*) AS n FROM vault_objects WHERE status = 'reserved' AND delete_after = ?", now + DELETE_RETRY_MS).one()).toEqual({ n: 1001 })
  })
}, 60_000)

it('releasing a tombstone keeps its second delete a day later', async () => {
  await runInDurableObject(freshVault(), (_v, state) => {
    const key = keyOf(state, 'receipt')
    reserveObject(at(state, t0), key, 'receipt')
    publishObject(at(state, t0), key, { bytes: 3, sha256: SHA }, null)
    tombstoneObjects(at(state, t0), [key])
    releaseObject(at(state, t0 + 1), key)
    expect(rowOf(state, key)).toEqual([{ status: 'tombstone', delete_after: t0 + TOMBSTONE_MS }])
    expect(dueObjectKeys(at(state, t0 + 1))).toEqual([])
  })
})

it('a failed delete leaves a deadline a writer moved during it', async () => {
  await runInDurableObject(freshVault(), async (_v, state) => {
    const key = keyOf(state)
    reserveObject(at(state, t0), key, 'export')
    const now = t0 + RESERVATION_GRACE_MS
    const forgetThenFail = {
      delete: async () => {
        // The writer deletes the key itself and forgets it while the alarm's delete is in flight; then R2 fails.
        tombstoneObjects(at(state, now + 1), [key])
        throw new Error('R2 is down')
      },
    } as unknown as VaultBucket
    expect(await deleteDueObjects({ context: () => at(state, now), bucket: forgetThenFail })).toBe(0)
    expect(rowOf(state, key)).toEqual([{ status: 'tombstone', delete_after: now + 1 + TOMBSTONE_MS }])
  })
})
```

## Appendix B: the receipt template (`PL/final/1B-T4-followup.receipt.md`)

````markdown
# 1B-T4-followup: the publish and delete race

- **Status:** built and verified locally on `fix/1b-t4-object-races`, cut from `<integration head SHA>` after PR #341 (1B Task 4) merged. Not pushed. It closes the 1B-T4 review's minors 1 to 3 and its `putConcatenated` nit (`.claude/controller/reviews/1B-T4.md`). Under ruling R87 this receipt is its own file; `premium-progress.md` is not edited.
- **Files:** `apps/edge/src/vault/files/objects.ts`; `apps/edge/test/workers/files-objects.test.ts` (8 new cases, and `WORK_STARTERS` added to one import); this receipt.
- **What changed:**
  - `publishObject` publishes a reservation only before its deadline (`AND delete_after > ?`, the vault clock). At its deadline the key is due and given up, so a writer that publishes then gets a throw, not a published row whose object the alarm is deleting from R2 at that moment.
  - `deleteDueObjects` tombstones or drops only rows still due (`AND delete_after <= ?` on the success path's `DELETE` and `UPDATE`, as the failure path already had), so a key its writer forgets again during the delete keeps its new deadline. Its doc comment now says it returns how many keys it asked R2 to delete.
  - `reserveObject` refuses a key outside `vaultPrefix(purpose, c.vaultId)` with `ObjectStoreError('invalid_key')` before it writes anything, so the alarm never deletes another vault's object.
  - `putConcatenated` calls `assertObjectKey` and refuses parts that do not add up to `totalBytes` (`RangeError`), both before it copies, empties the parts or stores anything.
- **RED to GREEN** (`npx vitest run --config vitest.workers.config.ts --reporter=verbose test/workers/files-objects.test.ts` in `apps/edge`, under the heavy lock):
  - RED, the 8 cases on 1B-T4's code: `Tests  <4> failed | <24> passed (28)`. The four cases for the new guards fail on assertions: `a reservation is published only before its deadline` (`expected [Function] to throw an error`), `a write or a forget that lands while a delete is in flight is never lost` (`expected 'published' to be 'refused'`), `a vault reserves only keys under its own prefix` (`expected null to be an instance of ObjectStoreError`), `putConcatenated refuses a bad key, or parts that do not add up to totalBytes, before it stores anything` (`promise resolved … instead of rejecting`).
  - The other four pin behaviour 1B-T4 already has (its deviations 3, 4 and 6, and the failure path's guard), so they pass on 1B-T4's code; each fails under its mutant (G1 to G4 below).
  - GREEN: `Tests  <28> passed (28)`. Verbose stderr shows 9 event lines: `object_delete_failed` 4, `work_start_failed` 2, `pending_work_unstarted` 1, `config_unreadable` 1, `config_malformed` 1.
- **Mutation check:** <13> mutants, <12> killed, 1 equivalent. Each was applied alone, the focused file was run, and the file was restored and its SHA-256 checked.
  - F1, `publishObject` ignores the deadline: `a reservation is published only before its deadline`; `a write or a forget that lands while a delete is in flight is never lost`.
  - F1b, `>=` for `>` in `publishObject`: `a reservation is published only before its deadline`.
  - F2, the success `DELETE` without its guard: `a write or a forget that lands while a delete is in flight is never lost`.
  - F3, the success `UPDATE` without its guard: survives, equivalent. Once `publishObject` refuses a due reservation, no registry function can move a due row that is not a tombstone to a later deadline while R2 deletes it (`tombstoneObjects` makes it a tombstone, which the `UPDATE` skips; `releaseObject` only makes it due sooner). The guard stays as defence in depth, matching the failure path.
  - F4, `reserveObject` without the prefix guard, and F4b, the guard checks only the vault id: `a vault reserves only keys under its own prefix`.
  - F5, no `assertObjectKey`; F6, no total check; F7, the total checked only for several parts: `putConcatenated refuses a bad key, or parts that do not add up to totalBytes, before it stores anything`.
  - G1, `handOffWork` without its `.catch`: `a start that rejects is logged and never fails the reply`.
  - G2, `break` for `continue` after a failed batch: `a failed batch does not stop the next one`.
  - G3, `releaseObject` also moves a tombstone: `releasing a tombstone keeps its second delete a day later`.
  - G4, the failure update without its guard: `a failed delete leaves a deadline a writer moved during it`.
- **Gate** (from the worktree root):
  - `npm run typecheck:edge`: passes.
  - `npm run test:edge`: <156> passed (<12> files).
  - `npm run test:edge:workers`: <276> passed (<14> files), the 8 new cases included.
  - `npm run build:edge`: passes.
  - `npm run test:edge:db`: **SKIPPED.** Docker is stopped on this machine; this change touches no PostgreSQL code, and CI's database job runs the suite.
  - `git diff --check origin/claude/p1a-vault-core...HEAD`: clean.
- **Deviations:** none.
- **Notes for later tasks:**
  - 1B-T5: two `startPendingWork` runs that overlap (a hand-off and the alarm, or two quick `starts` routes) can start the same item twice, because `markStarted` is not an at-most-once guard. A starter must make a second start harmless: `createOnce` does this for Workflows, and the parse message relies on `parseSource` treating a duplicate as harmless (B6).
  - Writers: publish before the reservation's deadline. A writer that may take longer than `RESERVATION_GRACE_MS` passes its own `graceMs` to `reserveObject`, as 1B-T5's upload parts do (the receive deadline plus the grace).
  - 1B-T5: `finishUpload` publishes its parts in its own set-based statement, not through `publishObject`. Give that statement the same rule (`status = 'reserved' AND delete_after > ?` with the vault clock), or a part given up at its deadline could be published while the alarm deletes it.
  - Build every key with `vaultObjectKey(purpose, c.vaultId, ...)`: `reserveObject` refuses any other.
````

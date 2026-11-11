# Brief 1A-T9 fix round: serve sync snapshots in the API's key order (R92)

You are the implementer for the 1A-T9 fix round. PR #352 (branch `p1/1a-t9-parity`) proves the vault answers the 49-step money session exactly like NestJS. CI's first real comparison failed at steps 44 and 45 (sync) because of **key order only**: NestJS keeps each change snapshot in a PostgreSQL `jsonb` column, which stores an object's keys shortest first (in UTF-8 bytes), then bytewise, while the vault serves them in the order it built the object. The reviewer reproduced it, wrote the fix as a patch and proved it against a real NestJS run. You apply that patch, pin one more ordering in a test, prove both with mutants, update the receipt and commit.

**Controller ruling R92 (8 November 2026):** the vault serves every sync snapshot with its keys in PostgreSQL `jsonb` order (shorter keys first in UTF-8 bytes, equal lengths bytewise, nested objects the same, arrays kept in order), so the parity comparison stays byte for byte. The normalizer and the money session do not change.

Read first: the protocol `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md` (binding; R87: your receipt is `docs/implementation/receipts/1A-T9.md`, which already exists, and you do not edit `premium-progress.md`), then the review `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/1A-T9.md` (the blocker and minor 1).

## Paths

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1a-t9` (branch `p1/1a-t9-parity`, head `6ed0ed6`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1a-t9-fix`. Create it with `mkdir -p`. Logs go there.
- **PATCH** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1a-t9-review/jsonb-order-fix.patch` (read only).
- Git: `/usr/bin/git -C WT <command>`, one git command per call. Type full paths in every call.
- Heavy lock for `test:edge:workers` and each mutant run: `until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done` before, `rmdir /private/tmp/claude-501/jotbun-heavy.lock` after (also after a failure). Never remove a lock you did not create. Docker is stopped and stays stopped: `test:edge:db` is SKIPPED (CI runs it).
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass.

## Step 1: Sync and install

1. `/usr/bin/git -C WT status --short` must print nothing.
2. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: a clean merge bringing #351 (P5-T3: `packages/contracts`, `apps/edge/test/contracts/trips.test.ts`, one `apps/api` spec, `receipts/P5-T3.md`). Any conflict: BLOCKED.
3. Install: `cd WT && npm ci --ignore-scripts --no-audit --no-fund`, then `cd WT && npm run install:edge`.

## Step 2: Apply the patch

1. `/usr/bin/git -C WT apply --check PATCH` (type the full path). Expected: no output, exit 0.
2. `/usr/bin/git -C WT apply PATCH`. It changes two files:
   - `apps/edge/src/vault/reads/sync.ts`: `changeOf` wraps the parsed snapshot as `jsonbOrder(JSON.parse(row.snapshot))`, and a new exported `jsonbOrder(value)` helper with its doc comment.
   - `apps/edge/test/workers/sync.test.ts`: imports `jsonbOrder`, and two new cases after the `?cursor=nonsense` / `RESYNC_REQUIRED` case: `orders keys as jsonb does: ...` (pure) and `serves each snapshot with its keys in the API's order: ...` (route).
3. `/usr/bin/git -C WT diff --stat` must list exactly those two files.

## Step 3: Pin the summary's category order (review minor 1)

`apps/edge/src/vault/reads/summary.ts` orders the month's categories `ORDER BY t.type, t.category_id`, exactly as NestJS's `summary-query.ts` does, but no test pins it: the golden-month case uses `expect.arrayContaining`. Make that case exact. In `WT/apps/edge/test/workers/summary.test.ts`, in the case `reports the golden month: transfers and opening balances are not income or spending`, replace exactly this text:

```ts
      categories: expect.arrayContaining([
        { category_id: builtinId(g.user, 'salary'), type: 'income', total_minor: '2800000' },
        { category_id: builtinId(g.user, 'food'), type: 'expense', total_minor: '18200' },
        { category_id: builtinId(g.user, 'bills'), type: 'expense', total_minor: '1226800' },
      ]),
```

with:

```ts
      // The API's order: type ('expense' before 'income'), then category id. Ids are lowercase UUIDs, so string order is byte order.
      categories: [
        ...[
          { category_id: builtinId(g.user, 'food'), type: 'expense', total_minor: '18200' },
          { category_id: builtinId(g.user, 'bills'), type: 'expense', total_minor: '1226800' },
        ].sort((a, b) => (a.category_id < b.category_id ? -1 : 1)),
        { category_id: builtinId(g.user, 'salary'), type: 'income', total_minor: '2800000' },
      ],
```

Keep the line `expect(body.categories).toHaveLength(3)` below it. Change nothing else in the file.

## Step 4: Typecheck and the focused tests

1. `cd WT && npm run typecheck:edge`. Expected: exit 0.
2. Under the heavy lock, run the two focused files with the workers pool: `cd WT/apps/edge && npx vitest run --config vitest.workers.config.ts test/workers/sync.test.ts test/workers/summary.test.ts > S/focused.log 2>&1` (full paths). This is the command `npm run test:edge:workers` runs, limited to two files; Step 5 runs it with one file. Expected: both files pass, including the two new sync cases.

## Step 5: Mutants (each under the heavy lock, one at a time)

For each mutant: edit the file, run the focused workers command from Step 4 on the named test file, log to `S/mutant-<n>.log`, see it **fail**, then restore the file exactly (re-apply your own edit by hand or copy back a saved copy you made in S before mutating) and confirm with `/usr/bin/git -C WT diff --stat` that only your intended changes remain.

1. **M1** `sync.ts` `changeOf`: `jsonbOrder(JSON.parse(row.snapshot))` becomes `JSON.parse(row.snapshot)`. Run `sync.test.ts`. Expected: the route case fails.
2. **M2** `sync.ts` `jsonbOrder`: the last line's `jsonbOrder((value as Record<string, unknown>)[key])` becomes `(value as Record<string, unknown>)[key]` (no nested ordering). Run `sync.test.ts`. Expected: the pure case fails.
3. **M3** `sync.ts` `jsonbOrder`: the sort comparator becomes `(a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))` (no length rule). Run `sync.test.ts`. Expected: both new cases fail.
4. **M4** `summary.ts`: `ORDER BY t.type, t.category_id` becomes `ORDER BY t.type, t.category_id DESC`. Run `summary.test.ts`. Expected: the golden-month case fails.
5. **M5** `summary.ts`: `ORDER BY t.type, t.category_id` becomes `ORDER BY t.type DESC, t.category_id`. Run `summary.test.ts`. Expected: the golden-month case fails.

Any survivor: BLOCKED with its log.

## Step 6: Gate

Run each, log to S, and record counts:

1. `cd WT && npm run typecheck:edge`: exit 0.
2. `cd WT && npm run test:edge`: all pass (CI's count on 6ed0ed6 was 163; the P5-T3 merge adds its contract tests, so expect more; record the number).
3. Under the heavy lock: `cd WT && npm run test:edge:workers`. Expected: 373 passed and 3 todo (371 before plus the two new sync cases), all files passing. Release the lock.
4. `cd WT && npm run build:edge`: exit 0.
5. `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD` after the commit: no output.
6. `test:edge:db`: SKIPPED (Docker stopped; CI runs `vault-parity.db.test.ts` against NestJS, and the reviewer saw it pass with this patch against a local PostgreSQL 16).

## Step 7: Receipt

Edit `WT/docs/implementation/receipts/1A-T9.md` (keep its style; do not touch `premium-progress.md`):

- Fix the stale line that says the branch needed no merge: it was merged with the integration head at `6ed0ed6`, and again in this round (name the merge commit you made in Step 1).
- Add a section `## Fix round (R92): snapshots in the API's key order` with bold-labelled bullets:
  - **CI result:** run 42476668840 on `6ed0ed6`: `test:edge:db` failed only in `vault-parity.db.test.ts`, steps 44 (sync, two groups) and 45 (sync, everything); every other step was green (`test:db` 694, `test:ops` 107, `test:edge` 163, workers 371 + 3 todo).
  - **Cause:** key order only. NestJS keeps snapshots in `entity_changes.snapshot` (`jsonb`), which orders keys shortest first, then bytewise; the vault served them in build order. Values and statuses matched on all 49 steps.
  - **Fix (controller ruling R92):** `jsonbOrder` in `src/vault/reads/sync.ts`, applied in `changeOf`. The normalizer and session are unchanged. The two new sync cases, and the summary golden-month case is now exact (review minor 1).
  - **Mutants:** M1 to M5 with what each killed.
  - **Gate:** each command and its count; `test:edge:db` SKIPPED (Docker stopped; CI).
  - **Notes for later tasks:** 1B: any vault read that NestJS answers from a `jsonb` column (the full-resync snapshot, an import's `issues`) must pass through `jsonbOrder` for parity.
- If the receipt's intro or Files line says nothing under `apps/edge/src` changed, correct it: this round changes `apps/edge/src/vault/reads/sync.ts`.

## Step 8: Commit

`/usr/bin/git -C WT add apps/edge/src/vault/reads/sync.ts apps/edge/test/workers/sync.test.ts apps/edge/test/workers/summary.test.ts docs/implementation/receipts/1A-T9.md`, then commit with a message file in S:

```
Serve sync snapshots in the API's key order

NestJS keeps change snapshots in a jsonb column, which orders keys
shortest first, then bytewise, so the vault parity session differed at
the two sync steps. The vault now serves each snapshot in that order
(R92). The summary's category order is pinned too.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
```

`/usr/bin/git -C WT commit -F S/commit-msg.txt` (full path). Then `/usr/bin/git -C WT status --short` must print nothing. Do not push.

## Your final message

As the protocol says: `STATUS: DONE` or `STATUS: BLOCKED` first; the merge and fix commit SHAs; files changed; the focused results; M1 to M5 (each killed by what); each gate command with its counts; SKIPPED items; anything the reviewer should look at first.

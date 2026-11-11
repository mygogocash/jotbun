# Brief 1B-T6 fix round: a HEAD gives its download slot back (R96), and the write and download guards pinned

You are the implementer (Haiku) for the 1B-T6 fix round. PR #362 (branch `p1/1b-t6-exports`, head `34798c8`) adds exports on ExportWorkflow. Its review (`/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/1B-T6.md`) found:

- **One major (M-1).** A HEAD on `GET /v1/export-files/:grant` takes a download slot and never gives it back.
  - The front door answers a HEAD with an empty response and drops the download's body unfinished, so the slot that body holds is never returned.
  - There are four slots per isolate, shared by every account. Four HEADs turn every later export download in that isolate into 503 `SERVICE_UNAVAILABLE`.
- **Two minors.**
  - m-1: the "vault is active" check at the start of the write has no test.
  - m-2: returning the slot after a refused download has no test.

The controller's ruling, **R96 (9 November 2026)**, quoted:

> **R96 (M-1):** fix it at the front door. `headOf` in apps/edge/src/v1/handler.ts cancels the response body it drops, so every HEAD-able route returns what its body holds. That covers 1B-T8's and 1B-T9's downloads too, and it matches the PostgreSQL edge (src/server/app/dispatch.ts:82-84). handler.ts is added to this round's files. Add the case you proposed: four HEADs on a multi-chunk export, then the next GET answers 200. Your probes H2 and H3 are the model.
>
> **In this round as well:**
> - m-1: the "vault is active" check at the start of the write, from your probe X2;
> - m-2: returning the slot after a failed download, from probe X3.
>
> Each gets a test that its mutant fails. The nits (X4 to X6) are not in this round; the controller records them in followups.md.

**R96's mechanism, amended by the fix planner's proof.** The controller confirms the amendment by dispatching this brief. `headOf` still fixes M-1 at the front door, for every HEAD-able route. But it **reads the dropped body to its end** instead of cancelling it, because a cancel does not give the slot back in the real Workers runtime. "Why the fix reads as it does" below has the proof.

The reviewer, as fix planner, wrote every file below and proved it in a scratch copy of `34798c8`:

- **RED:** the HEAD case fails on `34798c8`.
- **GREEN:** with the fix.
- **Mutants:** 4 of 4 killed.
- **Gate:** test:edge 176, workers 524 passed and 3 todo.
- **Real runtime:** the built vault Worker under `wrangler dev`. A cancel leaves the slot taken; the fix gives it back.

Do exactly what this brief says.

Read first:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. Its opening notes apply: durable files live under `/Users/kunanonjarat/Developer/jotbun/.claude/controller/`, and only the heavy lock is under `/private/tmp`. Under **R87**, your receipt is the existing `docs/implementation/receipts/1B-T6.md`; you add a section to it and do not edit `premium-progress.md`.
2. The review, sections "Major" (M-1), "Minor" m-1 and m-2.

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1b-t6` (branch `p1/1b-t6-exports`, head `34798c8`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t6-fix`, your scratch folder. Create it with `mkdir -p`. Logs and your commit message go only there.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t6-fix-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the verified final copy of the two code files this round changes (paths relative to `apps/edge`);
  - `orig/`: the same two files as they are at `34798c8`;
  - `diffs/`: one unified diff per file (`orig` to `real`), quoted in Appendix A;
  - `mutants.py`: the mutant runner;
  - `receipt-section.md` and `commit-msg.txt`: the receipt section you append and your commit message;
  - `assemble.py` and `fragments/`: how `real/` was made (reference only);
  - `SHA256SUMS`: the checksums of all of the above (12 lines);
  - the planner's proof: `*.log` files and `mutants.out`, with their checksums in `SHA256SUMS.logs`. They are reference only. Logs are gitignored and may be missing; never check `SHA256SUMS.logs`.

  If PL is missing, or a line of `PL/SHA256SUMS` does not match, stop: BLOCKED.
- Every shell call starts in a fresh directory, so type full paths. Git: `/usr/bin/git -C <WT> <command>`, one git command per call. Below, WT, S and PL stand for the full paths above: type them out.
- **The heavy lock** wraps every `npm run test:edge:workers`, every focused workers run and the mutant runner:
  - Before: `until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done`.
  - After, and after a failure too: `rmdir /private/tmp/claude-501/jotbun-heavy.lock`.
  - Never remove a lock you did not take.
- **FOCUSED** (run from `WT/apps/edge`, under the lock):
  `cd WT/apps/edge && npx vitest run --config vitest.workers.config.ts --reporter=verbose test/workers/exports.test.ts`
- **Docker is stopped and must stay stopped.** `npm run test:edge:db` is recorded **SKIPPED** (CI runs it).
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass.

## Scope

| File | Change |
| --- | --- |
| `apps/edge/src/v1/handler.ts` | `headOf` becomes `async`. For a HEAD it reads the dropped GET body to its end, then answers with no body. Its doc comment is rewritten. Nothing else changes; its three callers already `return headOf(...)` from async functions. |
| `apps/edge/test/workers/exports.test.ts` | One new `describe` with 3 cases, appended at the end of the file. No import changes: every helper it uses is already in the file. |
| `docs/implementation/receipts/1B-T6.md` | A new section at its end (Step 7). |

Nothing else: no other file, no package, no lockfile, no merge.

## Why the fix reads as it does

`serveExportFile` takes a slot (`EXPORT_SLOTS.take()`) and returns it only when its body stream ends or is cancelled (`bodyStream(chunks, release)`). `fileResponse` pipes that stream through a `FixedLengthStream`, so the response's body is the `FixedLengthStream`'s readable side, not the stream that holds the slot.

The planner tried the obvious fix, `response.body?.cancel()` in `headOf`.

- **In the Workers test runtime** it works: probes H1 to H3 pass. A test's request context lives on, so the cancel travels through the pipe to the slot's stream.
- **In the real Workers runtime** it does not. The test was `wrangler dev` on the built vault Worker, one stateless HTTP request per HEAD (`PL/proof-wrangler-cancel.log`).
  - An instrumented build (`PL/proof-wrangler-cancel-instrumented.log`) shows each HEAD go: method `HEAD`, slot taken, body cancelled, cancel resolved.
  - The slot is never released: the request ends before the cancel reaches the stream behind the `FixedLengthStream`.
  - Four HEADs, then the GET answered 503; still 503 ten seconds later. Another member's ready export in the same Worker also answered 503.

Reading the dropped body to its end does give the slot back.

- `await response.body?.pipeTo(new WritableStream())` runs before the HEAD is answered, so the request is still alive. The stream reaches its end, closes and returns its slot.
- Under `wrangler dev` (`PL/proof-wrangler-drain.log`): four HEADs, then the GET answered 200 with the whole file (233,886 bytes). It was still 200 ten seconds later, and another member's download answered 200.
- A HEAD now costs what its GET costs: the file is read, and its digest is checked as it streams.
- `.catch(() => undefined)` swallows a body that fails mid-read (a changed object), so `headOf` never rejects.

So the new HEAD case counts the bytes each HEAD reads. Each must read the whole file, because only a read to the end returns the slot in the real runtime. A regression to the cancel would still pass a test that only checks the GET in the test runtime. Mutant F2 is that regression, and the case kills it.

The PostgreSQL edge's dispatcher (`src/server/app/dispatch.ts:82-84`) cancels too, so it has the same gap. It is reference code and retires at 1B-T13, so it is not changed here (a note for the controller's followups).

## The new cases

All three go in `describe('1B-T6 fix round: a HEAD gives its download slot back (R96), and the write and download guards of review m-1 and m-2')`, at the end of `test/workers/exports.test.ts`, in this order.

1. **`an export whose write starts after the vault stopped being active reads nothing and stores nothing`** (m-1, from probe X2).
   - Setup: an export is requested, then the vault's `account_state` is set to `deleting` (§6.12, deletion step 2), then `writeExport` runs with a bucket that counts its `put`s.
   - Expected: no `put`, the outcome is exactly `{ outcome: 'skipped' }`, no export key is registered, no object is stored, and the export is still `pending`.
   - It pins the check at `exports.ts:233`. The publish's check (line 259) would also answer `skipped`, but only after the ledger had been read and a fresh copy PUT to R2.
2. **`a download refused after it took its slot gives the slot back`** (m-2, from probe X3).
   - Setup: two ready exports. The second's stored object is swapped for other bytes.
   - Expected: five downloads of the swapped one answer 404 (one more than `EXPORT_SLOTS`), and then the first one still downloads, with its SHA-256.
   - It pins the `release()` in `serveExportFile`'s `catch` (`downloads.ts:63-66`).
3. **`a HEAD on a download answers its headers, reads its file to the end and gives its slot back`** (R96, from probes H2 and H3).
   - Setup: the Worker's bucket counts the bytes it streams. The export has 2,000 records, over 200 KB: a one-chunk body drains by itself and would pass even on the old front door.
   - Each of four HEADs must answer status 200, the recorded `content-length`, no body, and the whole file read. Then the GET must answer 200 with the file's SHA-256.
   - It is the file's last case on purpose: on the old front door it keeps all four slots of the isolate, and any later download in the file would answer 503.

Cases 1 and 2 pass on `34798c8`, because the code they pin is right there. Their RED is the mutation check (Step 5). Case 3 is this round's RED.

---

## Step 0: Check the folders

1. `cd PL && shasum -a 256 -c SHA256SUMS`. Expected: 12 lines, every one `OK`. Anything else: BLOCKED.
2. `mkdir -p S`.
3. `/usr/bin/git -C WT status --short`. Expected: no output.
4. `/usr/bin/git -C WT rev-parse --short HEAD`. Expected: `34798c8`.
5. `test -d WT/node_modules || (cd WT && npm ci --ignore-scripts --no-audit --no-fund)`, then `test -d WT/apps/edge/node_modules || (cd WT && npm run install:edge)`. Neither may change a lockfile.
6. Check the files are as the planner found them: `cd WT && shasum -a 256 apps/edge/src/v1/handler.ts apps/edge/test/workers/exports.test.ts apps/edge/src/vault/files/exports.ts apps/edge/src/v1/files/downloads.ts docs/implementation/receipts/1B-T6.md`. Expected:
   - `61d1659b…` for `handler.ts` (its `orig/` line);
   - `bfb810f6…` for `exports.test.ts` (its `orig/` line);
   - `b1dfd20c…` for `exports.ts` and `7b4682dc…` for `downloads.ts` (the mutants edit these two and restore them);
   - `4cecf72f…` for the receipt.

   Any difference: BLOCKED.

## Step 1: The base (no merge)

This round stays on `34798c8` and does not merge the integration head.

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`.
2. `/usr/bin/git -C WT diff --stat 34798c8...origin/claude/p1a-vault-core -- apps/edge packages`. Expected: no output.
   - At planning, the head had gained only app and `.claude/` changes since `34798c8` (#354, #361 and housekeeping), and `git merge-tree` against it was clean; CI tests the merge.
   - If it lists any file: BLOCKED, with the list (the counts below assume none).
3. Do not run `git merge`.

## Step 2: The new tests (RED)

1. `cp PL/real/test/workers/exports.test.ts WT/apps/edge/test/workers/exports.test.ts`.
2. `cd WT && npm run typecheck:edge`. Expected: exit 0. Typecheck covers `test/`.
3. Under the lock: FOCUSED, saving the output to `S/red.log`. Expected:
   - `Test Files  1 failed (1)` and `Tests  1 failed | 35 passed (36)`.
   - The one failure is case 3 (`grep -E "^ *×" S/red.log`).
   - It is one `AssertionError`: `expected { Object (heads, file) } to deeply equal { Object (heads, file) }`. In its diff, `file` is received as `503, null`, and the last number of each `heads` entry (the bytes read) is below the file's size. The planner saw 0 and 8192 of 369116.
   - `grep -c "^AssertionError" S/red.log` prints `1`, and `grep -cE "^(TypeError|ReferenceError|RangeError|SyntaxError|ObjectStoreError|Error):" S/red.log` prints `0`.
   - Cases 1 and 2 pass.

## Step 3: The fix (GREEN)

1. `cp PL/real/src/v1/handler.ts WT/apps/edge/src/v1/handler.ts`.
2. `cd WT && npm run typecheck:edge`. Expected: exit 0.
3. Under the lock: FOCUSED, saving to `S/green.log`. Expected:
   - `Test Files  1 passed (1)`, `Tests  36 passed (36)`.
   - The stderr is unchanged from `34798c8`: `grep -o '{"level"[^}]*}' S/green.log | sort | uniq -c` prints exactly two lines, `1 {"level":"error","event":"export_write_failed","failure":"Error"}` and `1 {"level":"error","event":"object_delete_failed","failure":"Error"}`.
   - `grep -c "uncaught exception" S/green.log` prints `2` (the mocked Workflow step's error and `createOnce`'s caught `instance.already_exists`, as in the 1B-T6 receipt).
4. `cd WT/apps/edge && shasum -a 256 src/v1/handler.ts test/workers/exports.test.ts > S/green-sums.txt`. Each line must equal its `real/` line in `PL/SHA256SUMS`:
   - `f2e6afa3…` for `handler.ts`;
   - `aa63244b…` for `exports.test.ts`.

## Step 4: Before the mutants

`cd WT/apps/edge && shasum -a 256 src/v1/handler.ts src/vault/files/exports.ts src/v1/files/downloads.ts test/workers/exports.test.ts > S/before-mutants.txt`.

## Step 5: Mutation check

Under the lock: `python3 -I PL/mutants.py WT/apps/edge S > S/mutants.out 2>&1` (full paths). The runner:

- applies each mutant (one exact edit);
- runs FOCUSED;
- restores the file byte for byte;
- prints `KILLED` or `SURVIVED` with the failing cases;
- exits 1 if a required case still passes, a mutant does not apply, or a restore differs.

Expected: exit 0, and 4 lines `KILLED ... restored=True`. Then:

- `cd WT/apps/edge && shasum -a 256 -c S/before-mutants.txt`: all `OK`.
- `/usr/bin/git -C WT status --short`: only `apps/edge/src/v1/handler.ts` and `apps/edge/test/workers/exports.test.ts` modified.

| Mutant | File | Change | Must fail (and the planner's run) |
| --- | --- | --- | --- |
| F1 | `handler.ts` | the old `headOf`: the read-to-the-end line removed, so the body is dropped as it is | case 3 (1 failed): each HEAD read only part of the file, and the GET answered 503 |
| F2 | `handler.ts` | `headOf` cancels the body instead of reading it (R96's first wording) | case 3 (1 failed): each HEAD read only part of the file. The GET passes here, because the test runtime carries the cancel through; the byte count is what catches it. |
| F3 | `exports.ts` | `prepareExport` without its active check (line 233) | case 1 (1 failed): `expected 1 to be +0`, one `put` |
| F4 | `downloads.ts` | `serveExportFile`'s `catch` without `release()` (lines 63-66) | case 2 (2 failed): `[404, 404, 404, 503, 503]`, since the earlier tampered-file case already keeps one slot under F4. Case 3 also fails, because its HEADs find no slot. |

Any `SURVIVED` or `NOT APPLIED`: BLOCKED, with its log (`S/mutant-logs/<label>.log`).

## Step 6: The gate

From `WT`, in order, saving each output under `S/`:

1. `npm run typecheck:edge`. Expected: exit 0.
2. `npm run test:edge`. Expected: exit 0; `Test Files  15 passed (15)`, `Tests  176 passed (176)`. That is `34798c8`'s count; this round adds no Node case.
3. Under the lock: `npm run test:edge:workers`. Expected: exit 0; `Test Files  25 passed (25)`, `Tests  524 passed | 3 todo (527)`.
   - The arithmetic: `34798c8` has 521 passed and 3 todo in 25 files; this round adds 3 cases to an existing file.
   - If `sync.test.ts` times out under load, rerun that file alone and record both runs.
4. `npm run build:edge`. Expected: exit 0, and all three of:
   - `python3 -I -c "import json; c = json.load(open('WT/apps/edge/dist/jotbun_vault/wrangler.json')); print(c['workflows'][0]['class_name'], c['limits'])"` (full path) prints `ExportWorkflow {'cpu_ms': 120000}`;
   - the R95 driver check, `grep -cE 'pg-protocol|pg-pool|pg-types|pgpass|pg-connection-string|drizzle-orm/node-postgres|from "pg"|require\("pg"\)|postgres-array' WT/apps/edge/dist/jotbun_vault/index.js`, prints `0`;
   - `grep -c 'pipeTo(new WritableStream())' WT/apps/edge/dist/jotbun_vault/index.js` prints `1` (the fix is in the vault bundle).
5. `npm run test:edge:db`: **SKIPPED**. Docker is stopped by the controller's order; CI's database job runs it.
6. `/usr/bin/git -C WT diff --check` before the commit, and `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD` after it. Expected: no output.

## Step 7: Receipt

1. `cat PL/receipt-section.md >> WT/docs/implementation/receipts/1B-T6.md` (full paths). The section starts with a blank line, so it sits one blank line below the existing text. Its counts are this brief's Expected lines; you only got here if your results matched them.
2. `shasum -a 256 WT/docs/implementation/receipts/1B-T6.md`. Expected: `47033b7d622a5d07e4486ebc42a3fc58144351953c1d47004e74ad5de7a8ccd6`. Anything else: BLOCKED.
3. Do not touch `premium-progress.md`.

The section is quoted in Appendix C.

## Step 8: Commit

1. `/usr/bin/git -C WT add apps/edge/src/v1/handler.ts apps/edge/test/workers/exports.test.ts docs/implementation/receipts/1B-T6.md`.
2. `/usr/bin/git -C WT status --short`. Expected: those three files staged, nothing unstaged or untracked.
3. `cp PL/commit-msg.txt S/commit-msg.txt` (full paths). Its text is in Appendix D, and its last line is the Haiku trailer.
4. `/usr/bin/git -C WT commit -F S/commit-msg.txt` (full path).
5. `/usr/bin/git -C WT status --short` must print nothing. Do not push.

## Your final message

As the protocol says:

- `STATUS: DONE`, or `STATUS: BLOCKED` with the blocker, on the first line;
- the fix commit SHA (on `p1/1b-t6-exports`, on top of `34798c8`);
- the files changed;
- the RED and GREEN counts;
- the 4 mutants, each killed by what;
- each gate command with its result and counts;
- SKIPPED items;
- what the reviewer should look at first:
  - `headOf` reads the dropped body to its end instead of cancelling it (and why);
  - case 3's byte count, which is what kills F2.

---

## Appendix A: the edits (unified diffs, `orig/` at `34798c8` to `real/`)

For reading only; Steps 2 and 3 copy the verified files. The full diffs are in `PL/diffs/`.

### `src/v1/handler.ts`

```diff
@@ -198,9 +198,18 @@
   return new Response(response.body, { status: response.status, headers })
 }

-/** A HEAD request gets the status and headers of its GET, and no body. */
-function headOf(response: Response, method: string): Response {
-  return method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response
+/**
+ * A HEAD request gets the status and headers of its GET, and no body. The
+ * GET's body is read to its end and discarded, not just dropped, so what it
+ * holds is given back before the HEAD is answered: a download returns its slot
+ * and finishes its R2 read (R96). Cancelling the body is not enough: the
+ * Workers runtime ends the request before a cancel reaches the stream behind
+ * a download's FixedLengthStream, and the slot would stay taken. Never rejects.
+ */
+async function headOf(response: Response, method: string): Promise<Response> {
+  if (method !== 'HEAD') return response
+  await response.body?.pipeTo(new WritableStream()).catch(() => undefined)
+  return new Response(null, { status: response.status, headers: response.headers })
 }

 /** The latest published version of each kind, ordered by kind: what GET /v1/policies answers. */
```

The three callers (`return headOf(jsonResponse(...), method)`, `return headOf(replyResponse(reply, requestId), method)` and `return headOf(response, method)`) are in async functions and stay as they are.

### `test/workers/exports.test.ts`

Appended after the file's last line (the closing `})` of `describe('exports on the vault (1B-T6)', ...)`), with one blank line between. It is `PL/fragments/exports-tests.ts`, verbatim:

```ts
describe('1B-T6 fix round: a HEAD gives its download slot back (R96), and the write and download guards of review m-1 and m-2', () => {
  it('an export whose write starts after the vault stopped being active reads nothing and stores nothing', async () => {
    // Review m-1: writeExport checks the vault when it reads as well as when it publishes (P5). Here the vault is
    // deleting (§6.12, deletion step 2) before the write starts: nothing is read, reserved or stored.
    const { v1, money } = await setup()
    const { user } = await marchDiary(v1, money)
    const exportId = (await requestExport(v1, user)).body.entity_id as string
    await vaultExec(user, "UPDATE account_state SET status = 'deleting' WHERE id = 1")
    let puts = 0
    const counting = spyBucket({ beforePut: () => void (puts += 1) })
    const outcome = await runInDurableObject(vaultOf(user), (vault: UserVault, state) => writeExport(writerOf(vault, state, { bucket: counting }), exportId))
    expect(puts).toBe(0)
    expect(outcome).toEqual({ outcome: 'skipped' })
    expect(await registryOf(user)).toEqual([])
    expect(await exportKeys(user)).toEqual([])
    expect(await exportsOf(user)).toEqual([{ id: exportId, status: 'pending', object_key: null, started_at: null }])
  })

  it('a download refused after it took its slot gives the slot back', async () => {
    // Review m-2: serveExportFile returns its slot when the stored object no longer matches the vault's record (404
    // before anything streams). Five refused downloads, one more than EXPORT_SLOTS, then a good one is still served.
    const { v1, money } = await setup()
    const { user } = await marchDiary(v1, money)
    const good = await readyExport(v1, user)
    const changed = await readyExport(v1, user, { from: '2026-02-01', through: '2026-03-31' })
    const [{ object_key: key }] = await vaultRows<{ object_key: string }>(user, 'SELECT object_key FROM exports WHERE id = ?', changed.export_id)
    await env.OBJECTS.delete(key)
    await env.OBJECTS.put(key, new TextEncoder().encode('changed'))
    const grant = (await json(await v1.as(user).get(`/v1/exports/${changed.export_id}/grant`))) as ExportGrant
    const refused: number[] = []
    for (let i = 0; i < 5; i += 1) refused.push((await v1.as(user).get(grant.url)).status)
    expect(refused).toEqual([404, 404, 404, 404, 404])
    const { bytes } = await download(v1, user, good.export_id)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(good.sha256)
  })

  it('a HEAD on a download answers its headers, reads its file to the end and gives its slot back', async () => {
    // R96: the front door serves HEAD from the GET route and finishes the body it drops, so the download returns
    // its slot. It reads that body to its end rather than cancelling it: in the Workers runtime a cancel does not
    // reach the stream behind a download's FixedLengthStream before the request ends, and the slot would stay
    // taken (the review's wrangler dev probe). The file has many chunks, since a one-chunk body drains into its
    // response by itself. Four HEADs (EXPORT_SLOTS), then the GET is still served. This case is the file's last:
    // on the old front door it keeps all four slots of the isolate.
    let read = 0
    const counting: VaultBucket = {
      ...spyBucket({}),
      get: async (key) => {
        const found = await env.OBJECTS.get(key)
        if (!found) return found
        const body = found.body as unknown as AsyncIterable<Uint8Array>
        return streamedOnly(
          found,
          (async function* () {
            for await (const chunk of body) {
              read += chunk.byteLength
              yield chunk
            }
          })(),
        )
      },
    }
    const { v1, money } = await setup({ env: { OBJECTS: counting } })
    const user = await money.member()
    const wallet = await money.wallet(user)
    await money.bulkRecords(user, Array.from({ length: 2000 }, (_, i) => ({ type: 'expense' as const, amount_minor: String(1000 + i), occurred_on: '2026-03-15', wallet_id: wallet, category_id: builtinId(user, 'food'), note: `bulk record ${i}` })))
    const dto = await readyExport(v1, user)
    expect(dto.bytes).toBeGreaterThan(200_000)
    const grant = (await json(await v1.as(user).get(`/v1/exports/${dto.export_id}/grant`))) as ExportGrant
    const heads: unknown[] = []
    for (let i = 0; i < 4; i += 1) {
      read = 0
      const head = await v1.as(user).request('HEAD', grant.url)
      heads.push([head.status, head.headers.get('content-length'), (await head.arrayBuffer()).byteLength, read])
    }
    const file = await v1.as(user).get(grant.url)
    const body = file.status === 200 ? new Uint8Array(await file.arrayBuffer()) : null
    expect({ heads, file: [file.status, body && createHash('sha256').update(body).digest('hex')] }).toEqual({
      heads: Array.from({ length: 4 }, () => [200, String(dto.bytes), 0, dto.bytes]),
      file: [200, dto.sha256],
    })
  })
})
```

Every helper here is already defined or imported in the file:

- defined in the file: `setup`, `marchDiary`, `requestExport`, `readyExport`, `download`, `json`, `writerOf`, `registryOf`, `exportKeys`, `exportsOf`, `streamedOnly`;
- imported into it: `vaultExec`, `vaultRows`, `spyBucket`, `builtinId`, `vaultOf`, `writeExport`, `env`, `runInDurableObject`, `createHash`, and the types `ExportGrant`, `UserVault` and `VaultBucket`.

## Appendix B: the planner's proof (in PL)

On a `git archive` of `34798c8` with the worktree's `node_modules` linked, every focused and workers run under the heavy lock:

- `red.log`: the new tests on the old `headOf`, `Tests 1 failed | 35 passed (36)`, case 3, one `AssertionError` (the HEADs read 0 and 8192 of 369116 bytes; the GET answered `[503, null]`). The error-prefix grep prints 0.
- `green.log`: with the fix, `Tests 36 passed (36)`. The events are `export_write_failed` 1 and `object_delete_failed` 1, plus two `uncaught exception` lines. The focused file then passed three more times in a row.
- `mutants.out`: F1 to F4 all `KILLED`, `restored=True`, exit 0.
- `gate-typecheck.log`, `gate-node.log` (15 files, 176), `gate-workers.log` (25 files, `524 passed | 3 todo (527)`) and `gate-build.log`. On the built bundle, the R95 driver count is 0 and the drain is present once.
- `red-typecheck.log` and `green-typecheck.log`: exit 0 on both trees.
- The real runtime, `wrangler dev` on the built vault Worker (the repo's `test/support/vault-worker.ts` harness), one stateless request per HEAD, on a 233,886-byte export:
  - `proof-wrangler-cancel.log`, with `headOf` cancelling the body (R96's first wording): four HEADs answer 200, then the GET 503. It is still 503 ten seconds later, and another member's download is 503.
  - `proof-wrangler-cancel-instrumented.log`: the same, from a build that logs each step. Each HEAD logs `slot-taken`, `head-cancel` and `cancel-resolved`, and never `slot-released`.
  - `proof-wrangler-drain.log`, with this round's `headOf`: four HEADs, then the GET answers 200 with all 233,886 bytes; 200 again ten seconds later, and another member's download answers 200.
- `proof-head-cancel.log` and `proof-head-drain.log`: the review's probes H1 to H3, in the Workers test runtime, pass with either `headOf`. That is why case 3 counts the bytes each HEAD reads.

## Appendix C: the receipt section (`PL/receipt-section.md`)

```markdown
## Fix round (9 November 2026): a HEAD gives its download slot back (R96); the write's read-time check and a refused download's slot pinned

- **Review:** `controller/reviews/1B-T6.md`. Its major M-1 is fixed here under the controller's ruling R96, and minors m-1 and m-2 get their tests. The nits n-1 to n-3 are in `controller/followups.md`.
- **Base:** `34798c8`, not merged with the integration head. Since `34798c8` the head has gained only app and `.claude/` changes (#354, #361 and housekeeping), none under `apps/edge` or `packages`.
- **M-1, the fix (R96):** for a HEAD, `headOf` in `src/v1/handler.ts` now reads the dropped GET body to its end (`pipeTo` a discarding `WritableStream`) before it answers. ...
- **Why it reads the body instead of cancelling it:** ...
- **Tests:** 3 new cases at the end of `test/workers/exports.test.ts` (33 to 36): ...
- **RED to GREEN** ...
- **Mutants:** 4 of 4 killed ...
- **Gate:** ...
- **Notes for later tasks:** ...
```

(Shortened here; append the file itself, which is the full text, as Step 7 says.)

## Appendix D: the commit message (`PL/commit-msg.txt`)

```
Read a HEAD's dropped body to its end so a download gives its slot back

A HEAD on an export download kept its download slot: the front door
dropped the GET's body without finishing it, so four HEADs closed export
downloads in the isolate for every account. headOf now reads that body
to its end before it answers (R96); a cancel did not reach the stream
holding the slot in the Workers runtime. New tests pin the HEAD, the
write's check that the vault is active before it reads, and the slot a
refused download gives back.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
```

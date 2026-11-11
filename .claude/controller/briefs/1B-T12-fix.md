# Brief 1B-T12 fix round: the review's m1, n4, n5 and n6, and P3's wording

You are the fixer (Haiku) for the 1B-T12 fix round. PR #394 (branch `p1/1b-t12-files-parity`, head `ef37c41`) proves the vault Worker answers the 42-step parity files session like NestJS. Its two-lens review approved it with one minor and eight nits (`/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/1B-T12.md`). CI cannot run yet (GitHub Actions is paused for billing), so the NestJS comparison has never run, and the controller folds four findings into this PR before it merges:

- **m1:** the files comparison has no sanity assertions, so it passes when both sides fail the same way (the review's probe V1: uploads off on both sides, 3 of 3 pass). Add the six status assertions `parity-files.db.test.ts:46-52` has.
- **n4:** the R92 message is attached to every failure, and vitest prints sorted keys. Word it as a condition, and give each listed step both answers as `JSON.stringify` text.
- **n5:** no test pins `startVaultWorker`'s default `background: 'on'` (the review's mutant O1 survives). Add one assertion on `vault.config` in `vault-parity.db.test.ts`.
- **n6:** `startVaultWorker` leaks its temporary store if `configFor` throws. Call `configFor` before `mkdtempSync`.
- **P3's wording** (the review's n2): the receipt's known-difference bullet names what starts day 8 on the NestJS side (the manifest sweep) and closes the open question: a resend after day 8 starts a fresh build on the vault, not a stuck one.

It stays test-only: four files change, nothing under `apps/edge/src`. The planner proved every step in a scratch copy of `ef37c41`: RED for the two pinned guards (m1 under V1, n5 under O1) and for n6, GREEN, 19 mutants killed, and R100's fast gate, with every workerd run under the heavy lock. Do exactly what this brief says.

Read first: the protocol `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md` (binding; R87: your receipt is `docs/implementation/receipts/1B-T12.md`, which exists; you do not edit `premium-progress.md`), then the review (m1, n2, n4, n5, n6).

## Paths and rules

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1b-t12` (branch `p1/1b-t12-files-parity`, head `ef37c41`). Work only here. If it is missing or not at `ef37c41`, stop: BLOCKED.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t12-fix`. Create it with `mkdir -p`. Logs and runs go there.
- **KIT** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t12-fix-planner` (read, `cp` from it and run its scripts; never write into it). It holds:
  - `real/` (the four final files, repo paths), `orig/` (the same four at `ef37c41`), `diffs/` (one per file, quoted in Appendix A);
  - `twin/`: the local harness, **never committed**: `vitest.twin.config.ts` and `twin-mocks.ts` (adapted from the review's lens B: they replace only the PostgreSQL and NestJS side, so the committed tests run unchanged against the real built vault Worker; NestJS's answers are replayed from `smoke/expected-nest.json`, which the review's lens A re-derived byte for byte), `n6-leak.probe.db.test.ts` (the n6 probe), `expected-uploads-off.json` (V1's replay: the vault's own answers with uploads off) and `expected-key-order.json` (step 13's acknowledgement with two keys swapped, for n4);
  - `smoke/`: the first round's files smoke (default expected answers now in KIT), money smoke and `expected-nest.json`;
  - `run-twin.sh`, `run-smoke.sh` (each takes and gives back the heavy lock; `TREE=WT` points them at your worktree), `mutants.py` (the 19 mutants; `--tree WT --out <folder>`), `make-sums.sh`;
  - `proof/` (the planner's runs and logs), `base/` (`git archive ef37c41`), `tree/` (the planner's copy);
  - `SHA256SUMS` (64 lines) and `SHA256SUMS.logs` (46). Check only `SHA256SUMS`: logs are gitignored and may be missing elsewhere.
- Every shell call starts in a fresh directory, so type full paths. Git: `/usr/bin/git -C WT <command>`, one git command per call. The shell is zsh: keep an exit code in `rc` (`cmd; rc=$?`).
- **The heavy lock** wraps every run that starts workerd: `until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done` before, `rmdir /private/tmp/claude-501/jotbun-heavy.lock` after, after a failure too. `run-twin.sh` and `run-smoke.sh` take and give back the lock themselves (also when the run fails): never take it around them, or around `mutants.py`, which calls them. Never remove a lock you did not take.
- **TWIN** `<file>` `<name>` [arguments]: `TREE=WT KIT/run-twin.sh <file> S/<name>.log [arguments]; rc=$?`, where `<file>` is a test file under `apps/edge/test`. It prints `locked`, then `twin exit <n>; unlocked`; a line `child setpgid ... Operation not permitted` is harmless.
- **SMOKE** `<name>`: `TREE=WT SMOKE_OUT=S/<name>-run.json KIT/run-smoke.sh S/<name>.log; rc=$?`.
- **Never run** `npm run test:edge:db`, `npm run test:db`, `npm run db:v1:up` or `node scripts/dev-v1.mjs` (each starts Docker, which is stopped and stays stopped), nor `npm run test:edge:workers` (R100: CI's).
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change a test, the harness, the session or the expected answers to make it pass. If a run fails on a timeout or `wrangler dev did not start`, rerun it once and record both runs.

## Planner rulings

- **F1. m1 reads `nestRun[i]?.status`, not `!`.** The run is typed `(Seen | null)[]`. In CI's nest mode no entry is null, so `?.` changes nothing there; the twin replays the two uncompared sign-in steps as `null`, and with `!` the new line threw a `TypeError` at baseline (the planner's first GREEN run). The review's verified remedy (lens B's V2a and V2b) used `?.` too. The six assertions come after the comparison, as in `parity-files.db.test.ts`, so a listed difference still headlines a failure.
- **F2. n4 as worded:** the message is a condition ("a listed step whose nest and vault answers print alike differs in key order (R92): compare its nestText and vaultText"), and each listed step carries `nestText` and `vaultText`. It improves the failure output, not the verdict, so no mutant can fail on it; Step 5.6 shows both kinds of output instead (a key-order difference, and a status difference in the M3t run of Step 6).
- **F3. n5 is a case of its own** (`the vault Worker starts the built config when no background is named`), so it runs without a database (the twin), and CI's count for `vault-parity.db.test.ts` becomes 3. Its pattern names the built config's path, which 1B-T13 moves together with `VAULT_CONFIG`.
- **F4. n6 only moves `configFor`.** A failing KV put or `startDevWorker` still leaves the store, as before (the review's n6 says so); the probe proves the new order. No committed test: it needs a build output the probe breaks on purpose.
- **F5. P3's wording.** The receipt's bullet is replaced, and the header of `vault-parity-files.db.test.ts`, which this round edits anyway, says the same, so the two never disagree. The fresh build rests on the Workflows rule the planner checked in the Workflows docs: `create` throws only while an id's old instance is within its retention, and with no `retention` given the binding's `default_retention` applies (`wrangler.vault.jsonc:35-36`: 1 day on success).
- **F6. Mutants.** The first round's 12 run through the files smoke again (the edited `vault-worker.ts` still holds their lines), plus V1 and O1 (the review's, now killed), O2 to O4 (the review's lens B mutants, killed through the committed test as before), M3t (M3 through the committed test: n4's output for a status difference) and N6 (`configFor` back after the store).

## Step 1: Sync and check

1. `/usr/bin/git -C WT status --short` prints nothing, and `/usr/bin/git -C WT rev-parse --short HEAD` prints `ef37c41`.
2. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: a clean merge commit. The integration head moved only in controller files (`5b29eef` at planning). Check: `/usr/bin/git -C WT diff --stat ef37c41 HEAD -- apps packages docs/implementation` prints nothing. If it lists files (for example #396 or #397 merged first), record them as a deviation and go on only if none of this task's four files is among them; Step 5 then proves the vault on the newer base. Record the merge commit's SHA and `origin/claude/p1a-vault-core`'s SHA.
3. If `WT/node_modules` or `WT/apps/edge/node_modules` is missing: `cd WT && npm ci --ignore-scripts --no-audit --no-fund`, then `cd WT && npm run install:edge`.
4. `cd KIT && shasum -a 256 -c SHA256SUMS`. Expected: 64 lines, each `OK`.
5. `shasum -a 256 WT/apps/edge/test/vault-parity-files.db.test.ts WT/apps/edge/test/vault-parity.db.test.ts WT/apps/edge/test/support/vault-worker.ts WT/docs/implementation/receipts/1B-T12.md`. Expected, in that order (the same as `KIT/orig/`):
   ```
   ab86db0ad48a8852a139be914cf579c8823a1c186de7bdc154fb52023b1c3918
   49e99e7045aa2f3cc92cf904596fb3bd2868dbf71a9e14cf618412a1287d19bb
   8bb04135295c75589f68b9535f0f7eb84ed9d4dd212d4397ca23b8945fe090e2
   e6f3b75ada1e8f89eb8a1c93b11d4b3fa21b7bc898102127b043be31dfa1c99b
   ```
6. `cd WT && npm run build:edge > S/build.log 2>&1; rc=$?`. Expected: `rc` 0.

## Step 2: Install the local harness (never committed)

1. `cp KIT/twin/vitest.twin.config.ts WT/apps/edge/vitest.twin.config.ts`
2. `cp KIT/twin/twin-mocks.ts KIT/twin/n6-leak.probe.db.test.ts KIT/smoke/vault-files.smoke.db.test.ts KIT/smoke/vault-money.smoke.db.test.ts WT/apps/edge/test/`
3. `cd WT && npm run typecheck:edge > S/typecheck-2.log 2>&1; rc=$?`. Expected: `rc` 0.

## Step 3: RED on `ef37c41`'s files (the guards absent)

1. TWIN `vault-parity-files.db.test.ts` `red-baseline`. Expected: `twin exit 0` and `Tests  3 passed (3)`: the twin runs the committed test.
2. `python3 -I KIT/mutants.py --tree WT --out S/red V1 O1 > S/red.out 2>&1; rc=$?`. Expected: `rc` 1 and the last line of `S/red.out`: `0 of 2 killed; survivors ['V1', 'O1']; not restored []`. These are the review's two gaps: under V1 (uploads off on both sides) the files test still passes 3 of 3 (m1), and under O1 (the default `background` flipped to `off`) `vault-parity.db.test.ts`'s database-free cases pass (`Tests  1 passed | 1 skipped (2)`), with nothing on `vault.config` (n5).
3. TWIN `n6-leak.probe.db.test.ts` `red-n6`. Expected: `twin exit 1`, `Tests  1 failed (1)` and `expected [ 'jotbun-vault-…' ] to deeply equal []` (the name varies): the store is made and seeded, then left behind when `configFor` throws (the probe removes it).
4. `/usr/bin/git -C WT status --short` shows only the five harness files as untracked (`??`).

## Step 4: Apply the fix

1. `cp KIT/real/apps/edge/test/vault-parity-files.db.test.ts WT/apps/edge/test/vault-parity-files.db.test.ts`
2. `cp KIT/real/apps/edge/test/vault-parity.db.test.ts WT/apps/edge/test/vault-parity.db.test.ts`
3. `cp KIT/real/apps/edge/test/support/vault-worker.ts WT/apps/edge/test/support/vault-worker.ts`
4. `cp KIT/real/docs/implementation/receipts/1B-T12.md WT/docs/implementation/receipts/1B-T12.md` (Step 8 fills its one marker).
5. `cd WT && npm run typecheck:edge > S/typecheck-4.log 2>&1; rc=$?`. Expected: `rc` 0.

## Step 5: GREEN

1. TWIN `vault-parity-files.db.test.ts` `green-files`. Expected: `twin exit 0`, `Tests  3 passed (3)`.
2. TWIN `vault-parity.db.test.ts` `green-money` `-t "starts the built config|isolates people"`. Expected: `twin exit 0`, `Tests  2 passed | 1 skipped (3)` (the money comparison needs NestJS's real answers and is skipped by the filter; CI runs it).
3. TWIN `n6-leak.probe.db.test.ts` `green-n6`. Expected: `twin exit 0`, `Tests  1 passed (1)`.
4. SMOKE `green-smoke`. Expected: `smoke exit 0`, `Tests  4 passed (4)`, and `cmp S/green-smoke-run.json KIT/smoke/expected-nest.json` prints nothing.
5. The money smoke, under the lock, in one shell call: `until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done; cd WT/apps/edge && npx vitest run --config vitest.db.config.ts --reporter=verbose test/vault-money.smoke.db.test.ts > S/green-money-smoke.log 2>&1; rc=$?; rmdir /private/tmp/claude-501/jotbun-heavy.lock; echo "money exit $rc"`. Expected: `money exit 0`, `Tests  1 passed (1)`.
6. n4's output for a key-order difference (NestJS replayed with step 13's acknowledgement keys swapped): `TREE=WT TWIN_EXPECTED=KIT/twin/expected-key-order.json KIT/run-twin.sh vault-parity-files.db.test.ts S/green-n4.log; rc=$?` (KIT typed out in full, as everywhere). Expected: `twin exit 1`, `Tests  1 failed | 2 passed (3)`; `S/green-n4.log` has the headline `AssertionError: a listed step whose nest and vault answers print alike differs in key order (R92): compare its nestText and vaultText`, one listed step (`13. export`), and `grep -c '"nestText"' S/green-n4.log` and `grep -c '"vaultText"' S/green-n4.log` each print at least 1: its `nestText` body starts `{\"entity_id\"`, its `vaultText` body `{\"command_id\"`. This failure is the expected output, not a RED.

## Step 6: Mutants

1. `python3 -I KIT/mutants.py --tree WT --out S/mutants > S/mutants.out 2>&1; rc=$?`. It applies each mutant as exact replacements, rebuilds the edge before and after each `src` mutant, runs it, restores the file from its saved copy and compares it byte for byte. About four minutes.
2. Expected: `rc` 0 and the last line `19 of 19 killed; survivors []; not restored []`. Per mutant (`S/mutants/results.json`; the planner's runs are in `KIT/proof/mutants/`):

   | Id | Mutant | Runner | Killed by |
   | --- | --- | --- | --- |
   | M1 to M12 | the first round's twelve | files smoke | as in the first round: M1 lists steps 2 and 3, M2 24 to 26, M3 four steps and B13, M4 and M5 B13, M6 17 steps and the probe, M7 a `TypeError`, M8 12 steps, M9 11, M10 14, M11 and M12 the never-accepted-upload probe |
   | V1 | uploads off on both sides | twin, files test | m1: `expected 404 to be 202`, `Tests  1 failed | 2 passed (3)` |
   | O1 | the default `background` is `off` | twin, money file | n5: `expected '…' to match /\/dist\/jotbun_vault\/wrangler\.json$/`, `Tests  1 failed | 1 passed | 1 skipped (3)` |
   | O2 | the parity config drops the whole `queues` key | twin, files test | B13: `Cannot read properties of undefined (reading 'consumers')` |
   | O3 | the returned config names the built file | twin, files test | B13 |
   | O4 | wrangler starts the built file, the returned config names the parity copy | twin, files test | the comparison (four steps) |
   | M3t | Workflows kept, through the committed test | twin, files test | the comparison and B13, `2 failed`; its listed steps show `pending` against `ready` in `nestText` and `vaultText` (n4) |
   | N6 | `configFor` back after the store and the KV seeding | n6 probe | `expected [ 'jotbun-vault-…' ] to deeply equal []` |

3. `/usr/bin/git -C WT diff --stat -- apps/edge/src` prints nothing.

## Step 7: Remove the harness, then the gate

1. `rm WT/apps/edge/vitest.twin.config.ts WT/apps/edge/test/twin-mocks.ts WT/apps/edge/test/n6-leak.probe.db.test.ts WT/apps/edge/test/vault-files.smoke.db.test.ts WT/apps/edge/test/vault-money.smoke.db.test.ts`
2. `/usr/bin/git -C WT status --short`. Expected, exactly:
   ```
    M apps/edge/test/support/vault-worker.ts
    M apps/edge/test/vault-parity-files.db.test.ts
    M apps/edge/test/vault-parity.db.test.ts
    M docs/implementation/receipts/1B-T12.md
   ```
3. `cmp KIT/real/apps/edge/test/<path> WT/apps/edge/test/<path>` for the three test files. Expected: no output.
4. The gate (R100), from WT, each output saved in S:
   - `npm run typecheck:edge`: exit 0.
   - `npm run test:edge`, **under the heavy lock** (its `r2-object-store.test.ts` starts Miniflare): exit 0, no failed test; record the counts it prints (this round changes no Node test).
   - `npm run build:edge`: exit 0, and `for m in pg-protocol pg-pool pg-types drizzle-orm/node-postgres 'from "pg"'; do printf '%s %s\n' "$m" "$(grep -c -- "$m" WT/apps/edge/dist/jotbun_vault/index.js)"; done` prints `0` for each.
   - `npm run test:edge:workers`: **CI** (R100). `npm run test:edge:db`: **SKIPPED** (Docker stopped; CI's edge job runs it: `vault-parity-files.db.test.ts` 3, `parity-files.db.test.ts` 1, `vault-parity.db.test.ts` 3).
   - `/usr/bin/git -C WT diff --check`: no output.

## Step 8: The receipt

`WT/docs/implementation/receipts/1B-T12.md` (copied in Step 4) has the corrected known-difference bullet (P3), the corrected integrator note and a new section `## Fix round (the 1B-T12 review: m1, n4, n5, n6)`. In that section's Status line, replace the one word `MERGE_LINE` with: ``merged with the integration head (`<origin/claude/p1a-vault-core's short SHA>`) in `<your merge commit's short SHA>`, which brought only `.claude/` files``; if Step 1.2 listed other files, name them there instead. Then:
- `grep -c MERGE_LINE WT/docs/implementation/receipts/1B-T12.md` prints `0`;
- `/usr/bin/git -C WT diff --stat -- docs/implementation/receipts/1B-T12.md` shows that one file;
- if any result you saw differs from what the section says, stop: BLOCKED (do not edit its numbers to fit).

## Step 9: Commit

1. `/usr/bin/git -C WT add apps/edge/test/support/vault-worker.ts apps/edge/test/vault-parity-files.db.test.ts apps/edge/test/vault-parity.db.test.ts docs/implementation/receipts/1B-T12.md`, then `/usr/bin/git -C WT status --short`: those four, staged, and nothing else.
2. Write this message to `S/commit-msg.txt`, then `/usr/bin/git -C WT commit -F S/commit-msg.txt` (full path):
   ```
   Pin the files session's success paths and the vault Worker's defaults

   The vault files comparison now also asserts the six statuses its NestJS
   sibling checks, so a session that fails alike on both sides cannot pass,
   and each listed step carries both answers as text, so a key-order
   difference shows. The money session pins that startVaultWorker starts the
   built config by default, and the parity config is written before the
   temporary store is made. The receipt corrects P3's account of the
   snapshot difference.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
3. `/usr/bin/git -C WT status --short` prints nothing; `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD` prints nothing. Do not push.

## Your final message

As the protocol says: `STATUS: DONE` or `STATUS: BLOCKED: <reason>` first, and right under it: **"The NestJS comparison has still not run: CI's edge job runs it once GitHub Actions resumes."** Then the merge and fix commit SHAs; the four files; the RED (Step 3: the baseline, the two survivors, the n6 leak); the GREEN (Step 5, each run); the n4 output; the mutants (19 killed); each gate command with its result, `test:edge:workers` as CI and `test:edge:db` as SKIPPED; deviations; and what the reviewer should look at first (F1, F3, the corrected P3).

## For the reviewer and the orchestrator

- The confirming review is small (S): the four diffs (Appendix A), the RED and GREEN logs and the mutant results in S, and the corrected P3 against the review's n2.
- The merge condition is unchanged: the edge job green, with `test:edge:db` listing `vault-parity-files.db.test.ts` (3 tests), `parity-files.db.test.ts` (1) and `vault-parity.db.test.ts` (now 3).
- 1B-T13 inherits: n1, n7 and n8 as the review lists them, and n5's pattern (`/dist/jotbun_vault/wrangler.json`), which moves with `VAULT_CONFIG`. snapshot-parity-window keeps the rest of n2 and n3.

---

## Appendix A: the edits (`KIT/diffs/`, `orig/` to `real/`)

### A.1 `apps/edge/test/vault-parity-files.db.test.ts`

```diff
@@ -10,11 +10,13 @@
 // `npm run build -w gogospend-api` and `npm run build` in apps/edge first.
 //
 // A known difference the session cannot reach, since it runs in seconds
-// (1B-T11 review n8; 1B-T12 brief, P3): from about day 8 to day 30 after a
-// snapshot is built, NestJS still answers its status and a resend of its key
-// with `expired` (it keeps a finished job 30 days), while the vault, which
-// deletes a ready row a week past its 24-hour expiry, answers the status 404
-// and a resend with a new pending row under the same id.
+// (1B-T11 review n8; 1B-T12 brief, P3, as the 1B-T12 review's n2 corrects
+// it): from about day 8 to day 30 after a snapshot is built, NestJS still
+// answers its status and a resend of its key with `expired`, from the
+// succeeded job it keeps 30 days once its manifest sweep has dropped the
+// expired manifest (a week past expiry). The vault keeps one row and deletes
+// it a week past its 24-hour expiry: the status is 404, and a resend opens a
+// new pending row under the same id, whose build starts afresh.
 import { readFileSync } from 'node:fs'
 
 import { afterAll, beforeAll, expect, it } from 'vitest'
@@ -55,10 +57,19 @@
     if (step.signIn) return []
     const n = { ...nestRun[i]!, body: a(nestRun[i]!.body) }
     const v = { ...vaultRun[i]!, body: b(vaultRun[i]!.body) }
-    return JSON.stringify(n) === JSON.stringify(v) ? [] : [{ step: `${i + 1}. ${step.name}`, nest: n, vault: v }]
+    const [nestText, vaultText] = [JSON.stringify(n), JSON.stringify(v)]
+    return nestText === vaultText ? [] : [{ step: `${i + 1}. ${step.name}`, nest: n, vault: v, nestText, vaultText }]
   })
-  // vitest prints objects with sorted keys: a listed step whose two answers print alike differs in key order (R92).
-  expect(differences, 'answers that print alike differ in key order (R92)').toEqual([])
+  // vitest prints objects with their keys sorted, so each listed step also carries both answers as text, in their own key order.
+  expect(differences, 'a listed step whose nest and vault answers print alike differs in key order (R92): compare its nestText and vaultText').toEqual([])
+  // The session reached its success paths, as parity-files.db.test.ts checks: a session that fails alike on both sides cannot pass.
+  const byName = new Map(STEPS.map((step, i) => [step.name, nestRun[i]?.status]))
+  expect(byName.get('snapshot')).toBe(202)
+  expect(byName.get('export')).toBe(202)
+  expect(byName.get('upload')).toBe(202)
+  expect(byName.get('import preview')).toBe(200)
+  expect(byName.get('snapshot status')).toBe(200)
+  expect(byName.get('transaction')).toBe(201)
   expect(STEPS.length).toBe(42)
   expect(STEPS.filter((s) => s.signIn).map((s) => s.name)).toEqual(['export: challenge', 'export: proof'])
 })
```

### A.2 `apps/edge/test/vault-parity.db.test.ts`

```diff
@@ -70,3 +70,9 @@
   expect(peek.status).toBe(404)
   expect((await peek.json()).code).toBe('NOT_FOUND')
 })
+
+// startVaultWorker's default (the 1B-T12 review's n5): with no `background` named it starts the built config
+// itself, so this session runs with the Worker's background work, as it did before `background` existed.
+it('the vault Worker starts the built config when no background is named', () => {
+  expect(vault.config).toMatch(/\/dist\/jotbun_vault\/wrangler\.json$/)
+})
```

### A.3 `apps/edge/test/support/vault-worker.ts`

```diff
@@ -51,6 +51,8 @@
  */
 export async function startVaultWorker(o: { issuer: JwksFixture; policies: unknown; vars?: Record<string, string>; background?: 'on' | 'off' }): Promise<VaultWorker> {
   if (!existsSync(join(EDGE_DIR, VAULT_CONFIG))) throw new Error('Build the edge first: npm run build (in apps/edge)')
+  // Before the store is made: a config that cannot be read or written throws with no directory left behind.
+  const config = configFor(o.background ?? 'on')
   const persistTo = mkdtempSync(join(tmpdir(), 'jotbun-vault-'))
   const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' }
   await promisify(execFile)(
@@ -58,7 +60,6 @@
     ['wrangler', 'kv', 'key', 'put', '--local', '--persist-to', persistTo, '-c', VAULT_CONFIG, '--binding', 'CONFIG', 'config:v1', JSON.stringify({ policies: o.policies })],
     { cwd: EDGE_DIR, env },
   )
-  const config = configFor(o.background ?? 'on')
   const worker = await startDevWorker({
     config,
     vars: {
```

### A.4 `docs/implementation/receipts/1B-T12.md`

`KIT/diffs/docs_implementation_receipts_1B-T12.md.diff`: the known-difference bullet replaced (P3, with the manifest sweep, the job retention and the fresh build, each cited), the integrator note's counts and text (`vault-parity.db.test.ts` 3; `nestText` and `vaultText`), and the new fix-round section appended.

## Appendix B: `KIT/SHA256SUMS`, the inputs (the proof outputs follow in the file)

```
a277aafd50dd13e604bb29130ce390f33590d2ace3bdf1b58f2bdb3f83a49a2c  diffs/apps_edge_test_support_vault-worker.ts.diff
198ee08089a4f2af91ee52f4c41727f05c0c5010743ddecd9d3d69ce207a0522  diffs/apps_edge_test_vault-parity-files.db.test.ts.diff
66575f92b91d5d12e65483bec7eb482f6d37c76f242fb6168c5cb0ffd09fafbd  diffs/apps_edge_test_vault-parity.db.test.ts.diff
48289c5f3430da5564d667b3b11fc4068dc8cd02a8a7e6ddb24fd07208a6a3e8  diffs/docs_implementation_receipts_1B-T12.md.diff
e1892377493051e5167449493352d4534f54ea9cb998d6fa472aa887e48bc0bc  make-sums.sh
55acca9d9f7d635b881227fa91183b788738684788912b6f6629bcd572970d22  mutants.py
8bb04135295c75589f68b9535f0f7eb84ed9d4dd212d4397ca23b8945fe090e2  orig/apps/edge/test/support/vault-worker.ts
ab86db0ad48a8852a139be914cf579c8823a1c186de7bdc154fb52023b1c3918  orig/apps/edge/test/vault-parity-files.db.test.ts
49e99e7045aa2f3cc92cf904596fb3bd2868dbf71a9e14cf618412a1287d19bb  orig/apps/edge/test/vault-parity.db.test.ts
e6f3b75ada1e8f89eb8a1c93b11d4b3fa21b7bc898102127b043be31dfa1c99b  orig/docs/implementation/receipts/1B-T12.md
262a77ffecc9999b805a6af322276fe5c5106efd99e44561796406d1e459a6c0  real/apps/edge/test/support/vault-worker.ts
f5851dcfe232c2216900331bf078c65bab0367ffee7d08e314c29a31f570f523  real/apps/edge/test/vault-parity-files.db.test.ts
539b50578a3d646300384e36aa9a59d15444f450baa86bae61b225a442251e91  real/apps/edge/test/vault-parity.db.test.ts
73fd7a8a2bfc49fdfec224bcbc7303c8152db12bad53aaddfe5482344809689f  real/docs/implementation/receipts/1B-T12.md
270bf81d414f6f486ae9ba466003bd2a8701e3b59df2c10d2082476e2462078e  run-smoke.sh
0d3446db5619c52204ae60514170f021dffd434643afaa174a9d72e941a6d2ae  run-twin.sh
56857b4dfb076633859988b4dfd8bddd3f7e2004e1def4ff9c988e3981a71c8f  smoke/expected-nest.json
eaebc2b8fde583f85f01e725296740757bd906ff2d8fb213debb6e5289317089  smoke/vault-files.smoke.db.test.ts
395327efc84dd52ecf0fd53997eeab991f90db9374b4fbecbaef8711add9647a  smoke/vault-money.smoke.db.test.ts
a7a8372a1900a4e8495514d767d539c65e6ee44180835bada7d2e1ca9d46edd7  twin/expected-key-order.json
fbabab3a125038f20b23b5c8f9615905a13a0262094dd9bde57c97963e336705  twin/expected-uploads-off.json
b65c018465f693845d17423c4ad89ae59b65a3c7b4cada31617d3033140d1e6a  twin/n6-leak.probe.db.test.ts
07e97f158c29b1e65fbfd7f96f947e3069931cd024474e97036aff94fa28fb10  twin/twin-mocks.ts
cdec9eeb5975b41700e5d3b092dbef31575499e057dee74a9dfa40369988eba6  twin/vitest.twin.config.ts
```

# P4-T7 second review (Claude Sonnet 5.5): Slip drafts, the list, confirm, dismiss, slip refs and the 30-day expiry

- **Reviewed:** `ac0066a6` on `p4/t7-slip-drafts` (PR #481, base `claude/p1a-vault-core`), one commit on `98f1355d` (#468's merge). Range `origin/claude/p1a-vault-core...ac0066a6`, 16 files, 1185 insertions. `git diff --check 98f1355d ac0066a6` is clean.
- **Independence:** I read the plan task, the brief, the receipt and the code first. I opened no other review of this task. Everything I ran is in a `git archive` copy of the commit (`/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t7-second/tree`, `.claude` removed, `node_modules` symlinked from the worktree) and a base copy of `98f1355d` beside it. The task worktree is clean after my runs.

## Verdict in short

No blocker and no major. The code does what the plan and the brief say, and my probes found no defect in it. What I found are guards the code holds that no focused test holds: ten of my 14 own mutants survive the 49 focused tests (minor m1 to m3, nit n1), and one more is dead code (n5). Each has a ready test that passes on `ac0066a6` and fails on its mutant, so the controller can fold them into this PR or carry them as pins.

## CI (R100, R127)

- Run `43551313443`, event `pull_request`, head `ac0066a677c5df2dd68878cfb6df7ccc301d2f44` (the reviewed SHA), started 14 Nov 03:22 Z, last job done 03:27 Z. All nine jobs passed: Render (every file but the per-section suites), Edge Worker (types, unit, workerd, build, PostgreSQL container), Typecheck unit API build, Exports (web and iOS bundles), Render per-section suites (three), SQL integration and ops, Release image and smoke.
- From the edge job's log: `test:edge` 22 files, 230 passed; `test:edge:workers` 41 files, 951 passed and 1 todo (952); `test:edge:db` 3 files, 12 passed; `typecheck:edge` and `build:edge` ran and passed. The focused files in CI: `route-coverage` 14, `slips-vault` 18, `slip-drafts` 19, `transaction-source` 12 (the planner's 14 and 49).
- The base moved after that run (`06b9c5fe`: #465, #469 and controller docs; nothing under `apps/edge`), so the edge result stands without a close and reopen.
- Locally, in my scratch copy: the three workers files 49 passed (49), `route-coverage` 14 passed (14). No load flake, so no second run. Whole suites and the database suites were not run (R100; Docker stopped).

## The incident check

`accounts.ts`, the file O3's cut run left a mutant in, is not in the commit's diff, and all 10 files of `SHA256SUMS.base` match their hashes read from `ac0066a6` (I hashed each blob with `git show ac0066a6:<path>`; `accounts.ts` is `922d59db...`). The implementer's `accounts-cut-mutant.diff` shows the O3 swap (`id` read before `expected`); it is gone. The 15 code and test files of the commit are byte-identical to `scratch/p4-t7-planner/real/`.

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. The slip ref's one `UPDATE transactions` has no row-scope pin** (`apps/edge/src/vault/slips/refs.ts:35`).
- Evidence: my mutant M43 rewrites it to `WHERE (id = ? AND slip_ref_id IS NULL) OR slip_ref_id IS NULL`, which stamps every record that has no slip reference with the new reference. All 49 focused tests pass. The H9 case holds version, source, change log and "a reference a record has is not replaced" (R3, R5, R6 die), but no case holds two records without a reference and posts one ref. Nothing reads `transactions.slip_ref_id` yet (grep: only `refs.ts` and the create's insert write it, and no query selects it), so nothing would show it today; the ruling P7 and the controller's focus both name this statement.
- Fix: add the pin "M43" in `probes/pins-probe.test.ts` (three records, two refs; the second record stays NULL, each record keeps its own ref, each ref's `transaction_id` is its record). It fails on M43.

**m2. The idempotency digests are not pinned to their content** (`apps/edge/src/vault/slips/drafts.ts:116` confirm, `:142` dismiss).
- Evidence: MD digests only the draft ids of a confirm (`drafts.map((d) => ({ draft_id: d.draft_id }))`) and MF drops `draft_id` from the dismiss payload; both survive. The brief's P3 says "the digest covers the drafts as sent" and the plan gives dismiss's payload as `{ id, draft_id }`. The existing resend case sends two drafts, then one, which any digest of the ids catches.
- Failure if either regressed: a resend under the same Idempotency-Key with an edited record (or another draft) replays the old acknowledgement; the edit is never saved and the phone is told it was. The digest is the only guard against that.
- Fix: pins "MD" (same key and draft: reordered keys replay the ack; another amount, another note and another record id are each 409 `IDEMPOTENCY_MISMATCH`) and "MF" (same key for another draft's dismiss: 409, and that draft stays open). Both fail on their mutants.

**m3. Two rules the plan states have no case: `If-Match` forbidden on confirm and dismiss, and the source of a photo-origin draft.**
- `If-Match` (`drafts.ts:114`, `:139`, the plan's `'forbidden'`): M1 and M2 (`'optional'`) survive. Today a stray `If-Match` is 422 on `if_match` (probe B3: confirm and dismiss both), and no case sends one.
- `slipSourceOf('photo')` (`drafts.ts:30`; A1 says every other origin is `slip_import`): M16 (photo gives `photo`) survives. The cases seed `share` and `album` only, while a live batch may carry `photo` (`parseSlipBatchRequest`), so a stored draft can have that origin.
- Fix: pins "M1 and M2" and "M16".

### Nit

**n1. The refs' timestamps are unpinned** (M3 to M6 survive): `updated_at` written by confirm (`drafts.ts:124`), dismiss (`:146`) and the expiry (`prune.ts:34`), and `first_seen_at` and `updated_at` of a recorded ref (`refs.ts:26-31`). Junk values pass. No reader exists yet. The pin "M3 to M6" fixes the vault clock and holds all four.

**n2. `slipsDueAt` returns NaN for an unparseable `expires_at`** (`prune.ts:55-58`): `Math.min(NaN, ...)` is NaN, and `fileJobsDue` would hand NaN to `prune_files`. Probe E2 shows it. `slip_drafts.expires_at` has no CHECK (0006 is never edited) and P4-T6 is its only writer, so nothing reaches it today. A `Number.isNaN` filter in `slipsDueAt`, or P4-T6's own validation, closes it (see the notes).

**n3. A draft past its `expires_at` stays listed, counted and confirmable until the alarm's prune runs** (`drafts.ts:70-86`, `:118`). Probe A3: a draft read 40 days ago is in the list, in `total`, and confirms 200. The window is the alarm's lag (a failed prune comes back a minute later), so C11 holds in practice; recorded because "open" here means "has a row".

**n4. In a record with two faults, confirm names the record id first.** The contract's `parseSlipConfirmRequest` checks `transaction.id` before the vault checks the rest, so a bad id plus an unknown key, a bad type or a bad amount is named `drafts[0].transaction.id`, where `transactions.create` names the other field (probe `idorder-probe`). Single faults match create exactly (35 of 35). A phone never sends a bad id; the P4-T16a author should not assume create's order for the id.

**n5. `touch(c)` inside `pruneSlips` is dead** (`prune.ts:38`, `:42`; M25 survives): `runFileJobs` passes a spread copy (`jobs.ts:124`) and `alarm()` rearms unconditionally (`user-vault.ts:149`); `touched` is read only by `call()`, `background()` and `rearming()`. It matches the sibling prunes and the plan; harmless.

**n6. The receipt's Status line still says "Not pushed."** while PR #481 is open and CI has run. Only that sentence is stale; the controller's P1 to P17 and R127 lines are in.

## What I checked, and what held

**One create path (P2).**
- Diff of `transactions.ts`: `parseCreate` keeps the old body line for line up to `sameWallet` (the hunk shows only the `call.body` to `body` and the `source` lines changing), `insertCreated` is the old closure, `createTransaction` still checks, then runs the command with `source === null ? draft : { ...draft, source }`.
- My differential battery (`probes/diff-probe.test.ts`) ran the same 48 `POST /v1/transactions` requests on the base copy and the head copy with fixed ids: 35 bodies (12 of them two-fault pairs, to pin R41's order), 7 id and replay requests (a replay, a reordered-key replay, a changed body, a body gaining `source`, "id used" with two bodies), and 6 header requests (3 of them two-fault). The dump (every answer, the 15 receipts with their request digests, the 24 change rows, the 10 record rows, the 23 entity heads) is byte for byte identical: `cmp` says equal, 28251 bytes each. So answers, digest and R41 order are unchanged.
- Parity (`probes/parity-probe.test.ts`, head only): 35 refusals sent to `transactions.create` and to `drafts/confirm` on a fresh draft each: the same status and code, and every field named `drafts[0].transaction.<field>` (`source` and `slip_ref_id` are `UNKNOWN_FIELD` in confirm; `slip_ref_id` also in create). Six acceptances (expense, income, transfer, 11 digits, today, the tracking-start day) store the same row but for `source` (`slip_import`) and the slip reference (set only through confirm).

**The confirm (P3, P4).**
- Order is headers (`commandInput`), body (`parseSlipConfirmRequest`), then `runCommand` (`drafts.ts:114-116`). Probe B3: `If-Match`, no key or a bad key are 422 on their header, a schema of 2 or none is 422 `COMMAND_SCHEMA_UNSUPPORTED`.
- Atomicity (probe B1): a three-draft batch whose third record is refused leaves `slip_refs` (state, `transaction_id`, `updated_at`), the drafts, `transactions`, `entity_heads`, `command_receipts`, `audit_events`, `entity_changes` and the revision exactly as before, and the same Idempotency-Key then confirms the corrected batch.
- A gone draft is 409 `VERSION_CONFLICT` with no `current`; a record id already in use is 409 `VERSION_CONFLICT` with `current` = that record (probe B2). The two are told apart by `current`, and the second names no draft index.
- A number outside the safe range in a record (1e21, 9007199254740993) is 422 `INVALID_COMMAND` on `payload`, unindexed, because the digest runs first (the brief's P3); a number amount inside the range is `INVALID_MINOR`, indexed. A 12-digit amount is `MINOR_OUT_OF_RANGE`; 11 digits is accepted, as create accepts it. The canonical JSON caps depth at 32, so a deep body is 422, not a stack error.
- The change group is each record's change then the inbox's (D10 killed); `record_saved` is not sent (A1 killed, and probe D1 with consent on).
- A 50-record group is far under `MAX_CHANGE_GROUP_BYTES` (1 MiB) even with 500-character notes.

**The list (P5).**
- Order: `ORDER_BY` is date, time and id, all descending, `coalesce(..., '')` so a missing date or time sorts last; the keyset is one row comparison. Probe A1: nine drafts with ties and missing dates and times, traversed at limits 1, 2, 3 and 7, equal the computed order with no repeat and no gap.
- Hostile cursors (probe A2): 19 malformed cursors (empty, `null`, `[]`, a number, a string, `{}`, a `__proto__` key, a duplicate key, invalid UTF-8, padding, `+`, `/`, a space, over 512, a numeric date, an array time, an upper-case id, a string version, a missing date key) are all 422 on `cursor`. Repeated and structured parameters (`cursor=a&cursor=b`, `limit[]`, `%00`, `+5`, ` 5`, `0x10`, `1e2`, `007`) are all 4xx, never 5xx. Well-formed cursors that name no draft answer 200 with the right page (a date after everything gives all, one before everything gives none); an id from another vault grants nothing. Exactly 512 base64url characters (384 bytes of JSON) is accepted and 514 is 422. A real `next_cursor` decodes to `{ v, k, d, t, i }` only. Every value is a bound parameter; the SQL text is constants.
- The page never carries a slip reference hash (probe A3). `total` is the row count. The list, confirm, dismiss and a slip ref's 404 all answer `cache-control: no-store` (probe `headers-probe`), as the older routes do.

**Dismiss (P6).** Headers, the id (404 when not a UUID), an empty body, then the command; an unknown or closed draft is 404 inside it (the planner's case, D26 to D31 not rerun). With a body of `{}` or none it is 200 (probe B3, B4); with a key for another draft it should be 409 (m2).

**The slip ref (P7, H9, S13).** No version, source or change log moves; a known hash in any state (confirmed, dismissed, expired, draft) posted for any live record leaves both the ref and the record unchanged (probe F1: 8 posts, states, links, versions and revision identical). It answers before the release and under the imports gate. Row scope is m1.

**The prune (P8, R37).**
- Set-based statements, no id list (the 101-draft case). `BACKFILL_KEEP_DAYS` is 31, the cutoff is Bangkok's date minus 31 (a row 32 days old goes), and `slipsDueAt` is the Bangkok midnight of day 32. `pruneSlips` and `slipsDueAt` sit before the snapshots' prune in both lists (`jobs.ts:50`, `:60`); it purges nothing, and the snapshot staleness rule is the purge watermark, not the revision, so the extra revision from the inbox change does not touch it.
- My own boundary mutants M7 (`<` in the delete) and M8 (`<` in the ref update) are killed, by three expiry cases each. Probe E1: confirming the earliest-expiring draft leaves the alarm to fire harmlessly and move on.

**Privacy.**
- `drafts.ts`, `refs.ts`, `prune.ts` make no logging call. Probe D1: with analytics consent on and spies on all five `console` methods (and a `logFailure` control line the spies do see), the list, a confirm (ok, refused 422, gone 409), a dismiss (ok, 404), three slip refs (known hash, new hash, unknown record 404) and the alarm's prune log no payee string, no amount, no reference hash, and send no analytics event.
- Probe D2: after a confirm, a dismiss and an expiry, no TEXT or BLOB column of any vault table (every table from `sqlite_master`) holds either payee name; neither the sync feed, the record nor the list holds a name or a hash.
- No SQL selects every `transactions` column (`COLUMNS` is explicit), so `slip_ref_id` is in no DTO or export.

**The P4-T3 reviews' pins (followups line 868, P12).** All are in the diff: whole-response comparison with a missing path (four near-miss values for the var, `PUT` signed in), the five R41 two-fault answers, one account per mapping, a draft counted once for an account whose two sides are equal, the inbox's own head after two wallet edits, the salt never logged or sent, and the neutral exact added-routes case. The old `released.map(keyOf)` equality becomes `released.length > 0` plus the wrangler-var loop and a per-task check; nothing the old case held is lost for this task's routes.

## Mutants

- **The planner's, 12 of 83 rerun** (T1, T3, D2, D4, D14, R6, P1, P2, P5, A1, N5, O11, across the four batches): 12 of 12 killed, each on an `AssertionError`, files restored (`scratch/p4-t7-second/mutants-sample.out`).
- **My own, 14** (`scratch/p4-t7-second/my_mutants.py`, run on the three focused files whole): killed M7, M8, M37 (a confirm that also confirms other open drafts' refs, killed by the poke case); survived M1, M2 (m3), M3 to M6 (n1), M16 (m3), M25 (n5, dead code), M43 (m1), MD and MF (m2). The proposed pins (`probes/pins-probe.test.ts`, six cases) pass on `ac0066a6` and kill ten of the survivors, all but M25.

## Notes for later tasks

- **P4-T6 (`writeSlip`):** write `expires_at` as the read's time plus 30 days with `toISOString()` (the prune compares text), and `touch(c)` after the write so the call rearms. An unparseable value makes `slipsDueAt` NaN (n2): validate it, or add the `Number.isNaN` filter when P4-T6 next edits `vault/slips/*`. Pin a `photo` draft's confirmed source (m3) with the first test that seeds one.
- **P4-T16a:** a confirm's 409 without `current` means reload the list; a 409 with `current` means that record id is already used (no draft index, `current.id` names it); a 422 `INVALID_COMMAND` on `payload` is an unsafe number and carries no index; never send `If-Match`. Only the first refused record is named per request, so drop every draft dated before its wallet's start before sending (Review Focus 1).
- **P4-T16b:** a 404 from `POST /v1/slips/refs` means the record is not live.
- **P4-T5:** the README's added-routes list (the receipt already says so).
- **P4-T11:** `createTransactionRow(c, row, { source: 'statement', slipRefId: null })` inside the confirmation's command; the brief's note stands. `parseCreate(..., false)` refuses a `source` key, so a statement row must carry none.
- **The pins:** `scratch/p4-t7-second/probes/pins-probe.test.ts` holds six ready cases for m1 to m3 and n1 (they import only the test supports); the other probes (`second-probe`, `parity-probe`, `diff-probe`, `headers-probe`, `idorder-probe`) are in the same folder, `diff-probe` runs on both a base and a head copy.

## Evidence index

All under `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t7-second/`: `probes/` (the six probe files), `my_mutants.py`, `my-mutants.out`, `my-mutants-2.out`, `my-mutants-pins.out`, `mutants-sample.out`, `baseline-workers.log`, `baseline-node.log`, `diff-head.json` and `diff-base.json` (equal), `parity.json`, `ci-edge.log`.

VERDICT: Approved

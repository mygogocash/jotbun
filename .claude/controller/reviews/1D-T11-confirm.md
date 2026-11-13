# Review 1D-T11 fix round (confirming): server events and the analytics id

Reviewer: Opus 5.5, independent confirming reviewer, read-only. Reviewed: PR #445 (`mygogocash/jotbun`, base `claude/p1a-vault-core`), branch `p1/1d-t11-server-events` (worktree `.claude/worktrees/p1-1d-t11`), the fix round after the reviewed head `6390b20a`:
- `e25af43f`, the fix: 7 files, +217 -2;
- `1f306864`, the controller's merge of the integration branch. It changes nothing under `apps/edge` or `packages`: `git diff --stat e25af43f 1f306864 -- apps/edge packages` is empty.

Sources: plan 1D `### Task 11` (line 971) with L4 to L6, the Global Constraints and Review Focus 2 and 4; the brief `controller/briefs/1D-T11-fix.md` (R121, P14 to P24) and its kit `scratch/1d-t11-fix-planner/` (PL); the implementer's logs `scratch/1d-t11-fix/`; the receipts `docs/implementation/receipts/1D-T11.md` and `1D-T11-fix.md`; both reviews (`reviews/1D-T11.md`, `reviews/1D-T11-second.md`); CI run 43331455583 on `1f306864`.

Scratch: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t11-confirm/`
- `tree/`: `git archive 1f306864` with `.claude/` removed. Its `node_modules` are linked entry by entry from the worktree, with the workspace links pointed back into the tree and no caches linked (`tools/linkfarm.py`, the first review's script with the tree path changed).
- Nothing was written in the worktree: its `.vite` caches hold nothing newer than my runs, and `git status` is empty.
- `probes/`: my two probe files (also in `tree/apps/edge/test/workers/`). `tools/my_mutants.py`: my mutants. `logs/`: every run, and CI's job logs.
- Every Workers run went through the planner's `locked.sh`, which takes the heavy lock and gives it back per run. Every mutated file was restored and compared with `git show 1f306864:<path>`: identical.

## CI on #445 (R100: the gate)

Green: 9 of 9 jobs pass on `1f306864` (run 43331455583).

**Edge Worker** (job 131576967734): every step passed.

| Step | Result |
| --- | --- |
| `typecheck:edge` | passed |
| `test:edge` | 20 files, 206 passed |
| **`test:edge:workers`** | **35 files passed, `Tests 831 passed \| 1 todo (832)`**. The log has no `Unhandled` line and no `does not implement the method` line. |
| **`build:edge`** | **passed** |
| **`test:edge:db`** | **3 files, 12 passed** |

- On `6390b20a` the workers step was `3 failed | 821 passed | 1 todo (825)`, and CI skipped the last two steps. Now 832 is 825 plus the round's 7 cases.
- The five focused files in CI: `server-events` 26, `live` 22, `ai` 43, `attachments` 61, `download-aborts` 7. These match the receipt's GREEN.

**The other eight jobs:**

| Job | Result |
| --- | --- |
| Typecheck, unit, API, build | Node runs of 36, 1087 and 7, all passed |
| Render (every file but the per-section suites) | 130 files, 1680 passed |
| The three per-section suites | 252, 190 and 232 passed: 674 in all, each shard skipping the others |
| SQL integration and ops | 111 passed |
| Exports (web and iOS), Release image | passed |

Logs: `logs/ci-edge-job.log` and `logs/ci-job-<id>.log`.

## What I ran

| Check | Result |
| --- | --- |
| The five focused Workers files in my tree, under the lock | 5 files, 159 passed (159) (`logs/focused-baseline.log`) |
| 11 of the planner's 51 mutants: F1 to F10, and H2 re-pointed (`PL/mutants.py --only`) | 11 of 11 killed, each by its intended case. `killcheck.sh`: ok (11 logs). Not restored: none (`logs/planner-mutants.out`) |
| `killcheck.sh` over the implementer's 51 mutant logs | ok (51 logs) |
| My mutants MY1 to MY4 (`tools/my_mutants.py`) | MY1, MY2 and MY3 survive `server-events.test.ts` (26 of 26). My probes K1, K2 and K3 kill them, by assertions only (`killcheck.sh` ok). MY4 survives `ai.test.ts` (43 of 43), as a test double's change should (`logs/my-mutants.out`) |
| My probes on the unmodified head (`zz-confirm-probes.test.ts`) | 5 passed (5): OS, K1, K2, K3 and TB (`logs/probes-head.log`) |
| The remaining trap, end to end (`zz-confirm-trap-e2e.test.ts`, run alone) | The case passes, then `Errors 1 error`: `Unhandled Rejection TypeError: The RPC receiver does not implement the method "bind"`, exit 1 (`logs/trap-e2e.log`) |
| The seven committed files against the kit's `real/` | The five code and test files and `1D-T11.md` are byte-identical. `1D-T11-fix.md` differs by one added line (nit 3). |
| The implementer's logs against the receipt | All as the receipt says (see below) |
| `git diff --check` on `6390b20a..1f306864` and on `origin/claude/p1a-vault-core...1f306864` | clean |

The implementer's logs:
- before: 3 failed of 111, with 3 `bind` errors;
- RED: 1 failed of 159, the off-list case, on an `AssertionError`;
- GREEN: 159 of 159;
- mutants: 51 of 51 killed;
- kit sums: 35 OK;
- `test:edge`: 206 passed.

## The controller's questions

### The blocker: the three doubles

**The fix.** All three doubles take `callWithAnalytics` before the `.bind` fall-through:
- `recordingVault` (`ai.test.ts:916-924`) records it as it records `call`: `log.push(structuredClone(call))`, then `await s.callWithAnalytics(call)`, then `after`, then the answer.
- Both `preparesSeen` doubles forward it unbound (`attachments.test.ts:1695`, `download-aborts.test.ts:263`).

CI's workers suite is green with no unhandled error, so the blocker is gone.

**No other double over `env.VAULT`.**
- The grep finds only the three doubles (`ai.test.ts:900`, `attachments.test.ts:1680`, `download-aborts.test.ts:248`) and the tests that use them (`ai.test.ts:960, 982, 1007`, `attachments.test.ts:1865`, `download-aborts.test.ts:443`).
- The other two `new Proxy(` calls in `apps/edge/test` wrap `env` itself: `support/v1-client.ts:162` (`envWith`) and `imports-parse.test.ts:80` (`consumerEnv`). They return each binding as it is, so they never bind a stub member.
- Every test reaches `handleVaultV1` through `startV1`; none calls it directly.

**Inside the three doubles, the trap remains for every other RPC method.**
- Every member except `call` and `callWithAnalytics` still goes to `value.bind(s)` (`ai.test.ts:925`, `attachments.test.ts:1697`, `download-aborts.test.ts:265`).
- The Worker reads two other members of a route's stub:
  - `fetch` (`handler.ts:74`, the live socket);
  - `startPendingWork` (`handler.ts:61`), after a `starts` route answers 2xx (`handler.ts:162` and `:275`).
- Probe TB, through the committed `preparesSeen`:
  - `fetch` is a real method of the stub and comes back as a bound function, so it is safe;
  - `startPendingWork` is an RPC method. Its `.bind` is itself a remote call, which rejects with `does not implement the method "bind"`.
- Probe TE sends `POST /v1/sync/snapshots` through `download-aborts.test.ts`'s double, with `startV1`'s default `startWork: 'auto'`:
  - it answers 202 and logs `pending_work_unstarted` (`TypeError`);
  - vitest then fails the file with the same unhandled rejection CI showed.
- No committed test does this today (CI has no unhandled error), so nothing is broken. The trap catches either of these:
  - a test that sends a `starts` route (`POST /v1/imports`, `/v1/exports` or `/v1/sync/snapshots`) through one of the doubles without `startWork: 'manual'`;
  - any new Worker-to-vault RPC.
- See nit 2 and note 1.

### The privacy pins

Each new case pins its guard, and in my sample each of the six mutants is killed by its own case, on an assertion:

| Guard | Case (`server-events.test.ts`) | Mutant |
| --- | --- | --- |
| `sendServerEvents` never throws (`handler.ts:223, 234-236`) | :549, a port that throws while sending: the create answers 201, with one `server_events_failed` line naming `TypeError` | F1 killed |
| `countWorkerFailure` never throws (`handler.ts:241-245`) | :569, a client that cannot be built while the Worker handles its own exception: the 500 `INTERNAL_ERROR` problem, with one line naming `RangeError`. A rejection is read as `'rejected'` and fails an assertion. | F2 killed |
| the 410's code (`handler.ts:201`) | :362, a create of a purged id (410 `ENTITY_PURGED`) sends nothing; then a stale cursor's 410 sends `resync_required` | F3 killed |
| the off header on what a reply says (`handler.ts:225`) | :302, a stale cursor and a failing `sync.changes`, both carrying the header, send only the anonymous count; without the header, `resync_required` | F4 killed |
| a failed consent read fails closed (`vault/analytics.ts:76-79`) | :629, with consents dropped, the create's own policy check fails (`policies.ts:50`: `accepted` reads `consents`). Only `$exception` is sent, with one `vault_analytics_failed` line. | F5 killed |
| P8 (`handler.ts:226`) | :595, the `analytics` dep is called 0 times for the setup, a wallet list and the analytics answer, then once for a create | F6 killed |

My own mutants show that each never-throws case pins only one of the two places its function can throw (minor 1).

### `analyticsOff` (`handler.ts:211-214`)

- **The change only turns requests off.** Every value the first round read as off still reads as off, and a list with any `off` value now reads as off too.
- **Probe OS** sends one create per header shape through the front door, for a person who said yes:

  | Reads as | Shapes |
  | --- | --- |
  | off | `off`; `OFF`; `off,off` (no space); two lines, `off` and `off` (`off, off`); two lines, `on` and `OFF`; `Off ,ON`; `,off`; `\toff\t` (workerd trims it to `off`) |
  | on | `off;q=1`; `"off"` (quoted); `off off`; an empty value; `no`; `false`; `offline` |

- **No header the phone sends reads as on.**
  - The app sends exactly `off`, once (`apps/app/src/api/client.ts:347`).
  - Both entries hand the Worker the original request (`src/routes/v1/$.ts:10`, `src/vault-worker.ts:33`).
  - A proxy that joins repeated lines, with or without a space, still gives a list that reads as off.
  - Every shape that reads as on lacks a bare `off` value: a quoted string, a parameter, two words in one value, or another word. The app sends none of them.
- The join without a space is not pinned (nit 1).

### Both reviews, answered

| Review finding | The round |
| --- | --- |
| Opus blocker 1, Sonnet B1 (the doubles) | fixed in the three doubles (P16); CI green |
| Opus minor 1, Sonnet M-C and M-D (never throws) | the F1 and F2 cases; only partly pinned (minor 1) |
| Opus minor 2, Sonnet M-E (the 410's code) | the F3 case |
| Opus nit 1 (the off header as a list) | `analyticsOff` reads a list; F7 to F10 and H2 |
| Opus nit 2 (P8) | the F6 case |
| Sonnet M-A (the off header on what a reply says) | the F4 case |
| Sonnet M-B (a failed consent read) | the F5 case |
| Sonnet n1 and notes 2 to 5, Opus notes 3 and 4 | carried as R121.5's followups, listed under the receipt's "Not in this round" |
| Opus note 2 (`build:edge` and `test:edge:db` on CI) | both ran and passed on `1f306864` |

### Receipts and commit

- `1D-T11.md` gains one line after Status, as P23 says.
- `1D-T11-fix.md` is its own file (R87). Every number in it matches the implementer's logs, and its GREEN per-file counts match CI's.
- The commit has the brief's summary line and body, and the `Co-Authored-By: Claude Haiku 5.5` trailer.
- The receipt's text differs from the kit's (nit 3), and one of its reasons is broader than the line it explains (nit 2).

## Findings

### Blocker

None.

### Major

None.

### Minor

1. **Each never-throws case pins only one of the two places its function can throw.**

   `sendServerEvents` can throw where it builds the client (`analyticsOf`, `handler.ts:227`) or where it uses it (`:229-233`). `countWorkerFailure` can throw in the same two places, on one line (`:242`). The round's cases cover one place each:
   - `sendServerEvents`: a port that throws while sending (:549);
   - `countWorkerFailure`: a client that cannot be built (:569).

   Two mutants show the other places are unpinned:
   - **MY2** survives all 26 cases. It builds `sendServerEvents`'s client just outside its `try`, still after the "nothing to send" check, so the P8 case still passes.
     - With MY2, an `analytics` dep that throws turns a committed create into a 500. K2 kills it: `expected 500 to be 201`.
     - The first review's minor 1 asked for this shape (its RP5: "an analytics dep that throws ... Expect 201 on a create").
     - It is the likelier throw in production. `createServerAnalytics` runs `new PostHog(...)` synchronously, while `captureImmediate` is `async` in `posthog-node` 5.56.2, so a failed send is a rejection inside `waitUntil`, never a throw.
     - A later refactor could plausibly build the client outside the `try`. The plan's own text builds the client once in `handleVaultV1`: "with `const analytics = (deps.analytics ?? defaultAnalytics)(env)` non-null".
   - **MY3** survives too. In it, `countWorkerFailure` guards only the build.
     - With MY3, a port that throws while the Worker counts its own exception makes `handleVaultV1` reject, and the v1 500 problem is lost. K3 kills it: `expected { status: 'rejected' } to deeply equal { status: 500, code: 'INTERNAL_ERROR' }`.
     - This is less likely in production, but the guard is meant to cover everything.

   Fix, in tests only: add K2 and K3 from `probes/zz-confirm-probes.test.ts` to `server-events.test.ts`, in the shape of :549 and :569 (about 45 lines). Both pass on `1f306864`, and each kills its mutant on an assertion.

### Nit

1. **A list joined without a space is not pinned.** MY1 (`header.split(', ')`) survives the 26 cases, because every list the off-list case sends is joined with `, ` (:288-293). Under MY1, `off,off` reads as on; probe OS and K1 kill it. One more create in the off-list case, with `{ 'x-gogospend-analytics': 'off,off' }`, would pin it.
2. **The receipt's reason for the `download-aborts.test.ts` line is broader than what the line does.** `1D-T11-fix.md` (and P16) says the line is there "so the next vault route through it cannot fail the same way". A `starts` vault route through that double still can. Probe TE (`POST /v1/sync/snapshots` through that double, with the default start) gives the same unhandled `bind` rejection, through `startPendingWork`. This round needs no change, since R121.1 kept the three small branches. The shared double recorded as a followup would remove the trap, and note 1 records what triggers it.
3. **The committed `1D-T11-fix.md` is not the kit's file.** The brief said to copy the receipts and not edit them, but the committed file has one bullet more than `PL/real/docs/implementation/receipts/1D-T11-fix.md`, at line 32: "**Deviations:** none from the plan. The controller accepted the planner's calls P14 to P24 as written under R121: ...".
   - The kit's file still matches `PL/SHA256SUMS` (`32088b80...`); the committed file hashes to `894e92bd...`.
   - The bullet is true, and the controller has accepted the same kind of added Deviations bullet before (`handover.md:561` and `:1534`). No change needed. I record it because the controller's note says it checked six files, and this is the seventh.

## Notes for later tasks

1. **The `.bind` trap in the three doubles is not only about changing which vault method the Worker calls.** Until one shared double forwards every member as a call (the receipt's followup):
   - A test that sends a `starts` route (`POST /v1/imports`, `/v1/exports`, `/v1/sync/snapshots`) through `recordingVault` or either `preparesSeen` needs `startWork: 'manual'`.
   - Any task that adds a Worker-to-vault RPC must run all three files, focused. 1D-T12's `serveV1` is the next task on this path.
   - Probe TE reproduces it.
2. **`recordingVault` now logs vault routes too, but no case in `ai.test.ts` reads those entries.** Each case either clears the log after its setup or makes its vault calls through an unwrapped front door, so MY4 (not logging them) passes 43 of 43. A later case that counts the log must expect vault routes in it.
3. **The off header turns events off only with the bare value `off`.** That value can be in any case and anywhere in a comma-separated list (probe OS). `no`, `false`, `"off"` and `off;...` read as on. If a client ever sends another form, the Worker must change in the same task. Today the app sends `off` once (`client.ts:347`).
4. **R121.5's carry-overs stand as the receipt lists them:**
   - the anonymous counts go out whatever the consent and the off header; the Worker needs a consent-only switch if counsel rules so (Q4);
   - a vault step's failure under a Worker route is counted as the Worker's (dashboards);
   - later person-level events must go through the shared transport;
   - the SDK's wire format is the target for a future "never sent" test.

VERDICT: Approved

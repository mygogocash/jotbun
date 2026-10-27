# Jotbun v1: execution plan

Generated on 2026-10-26 from the eleven plans in `docs/superpowers/plans/` (the specification of every task) and the approved spec. The GitHub backlog mirrors it: the project board "Jotbun v1 build" (https://github.com/orgs/mygogocash/projects/16), the six phase milestones (https://github.com/mygogocash/jotbun/milestones) and one epic issue per plan (label `type:epic`). `docs/implementation/backlog-map.json` maps every task id to its issue number.

## How the backlog is organised

- **Milestones** are the six build phases (spec section 8). **Epics** are the eleven plans, one issue each, labelled `type:epic`. **Tasks** are one issue per plan task, a sub-issue of its epic, titled with its task id (for example `P3-T8: ...`).
- A task's **blocked by** links are its plan's `Starts after` line. A task is ready when every blocker is closed and it does not wait on the owner (label `owner-gated`).
- Labels: `phase:N`, `epic:<plan>`, `lane:<lane>`, `owner-gated`, `plan-task`. Project fields: Phase, Epic, Lane, Task ID, Wave, Readiness, Status.
- **Wave** is the earliest round a task can start once everything it waits on is done. Wave 1 is startable as soon as the tasks in review and in progress merge. Tasks in the same wave and different lanes run in parallel.

## How to take a task

1. Pick a task with Readiness "Ready now" in your lane, lowest wave first, critical-path tasks before others.
2. Assign it to yourself and set Status to In Progress.
3. Branch from the integration head in its own worktree: `/usr/bin/git worktree add .claude/worktrees/<plan>-<task> -b <plan>/<task>-<short-name> origin/claude/p1a-vault-core` (for example `p3/t8-slip-read`).
4. Do the task exactly as its plan says, following handover section 4: a failing test seen failing (RED), the code (GREEN), the mutation check, the full gate, the receipt in `docs/implementation/premium-progress.md`, a local commit, then an independent review and its fix rounds.
5. Open a pull request into `claude/p1a-vault-core`. Merge it with a merge commit once all three CI jobs are green (one rerun for a known flake), then close the task's issue with a comment naming the pull request: a pull request into a branch other than `main` does not close issues by itself.
6. Remove the worktree and branch, and look at the tasks this one unblocked.

## Where things stand

**In review:**
- 1A-T5: Transactions, balances and the golden diary (pull request #81)
- 1A-T6: Budgets (pull request #80)
- 1B-T2: The files schema, object keys, the prefix purge and a durable erase (pull request #75)
- 1B-T3: The files front door: step-only calls, Worker routes, streamed bodies, auth_time and the bridge; commit f95ba85 approved; pull request waits for #75
- 1D-T3: Server analytics as a module: the analytics id, server events, anonymous counts and person deletion (pull request #77)
- 1D-T4: Pending choices kept in the diary (C16, storage and model) (pull request #73)
- 1D-T5: The app's live channel, the live flush, screens that follow the revision, and LAN development (pull request #76)
- P2-T3: Draft copy and the wallet stores: device settings and account-kept looks (pull request #79)
- P2-T4: Logged days from the device diary (pull request #78)
- P2-T7: The Thai everyday pack per C3, pack keys and analytics category keys (pull request #82)

**In progress:**
- 1C-T1: Better Auth on D1: its tables, email-code sign-in and the JWT
- 1C-T5: The app's Better Auth port, replacing Auth0 (tested against a fake server)
- 1D-T1: The app's analytics core: the allow-list, the typed emitters, consent, the held events and the outgoing gate; commit b3b1c11, fix round
- P2-T1: The Bun Wallet palette, materials, type roles and WalletText
- P2-T5: Quick add's references and save rules move into hooks
- P2-T6: The record screen's rules move into a hook

Merge the open pull requests first, in the order the phase 1 ledger gives (shared route tables and the command registry keep their order), then take ready tasks.

## Lanes and parallel work

- **App** (117 open): 1C 4, 1D 9, P2 37, P3 12, P4 11, P5 17, P6A 14, P6B 13
- **Server** (62 open): 1A 5, 1B 12, 1C 6, 1D 5, P3 5, P4 12, P5 14, P6C 3
- **Full stack** (23 open): 1C 3, P3 5, P4 1, P5 3, P6B 8, P6C 3
- **Ops** (12 open): 1A 1, P6C 11
- **Native** (8 open): 1C 1, P2 1, P3 2, P4 1, P6A 1, P6C 2
- **Docs** (2 open): P6A 1, P6B 1

Today: 7 done, 10 in review, 6 in progress, 7 ready now, 231 in all.

Phases overlap by design: a phase 3, 4 or 5 server task starts as soon as the phase 1 tasks it names have merged, and its screens wait only for the phase 2 design-system tasks they name. Keep at most one task per lane editing the same shared file at a time (see below), and merge them one by one.

## Shared files and merge rules

These files are edited by many tasks. Every edit to them is additive and named in its task.

| File | Tasks |
| --- | --- |
| `apps/edge/src/v1/routes.ts` | 30: 1A-T2, 1A-T3, 1A-T4, 1A-T5, 1A-T6, 1A-T7, 1A-T8a, 1A-T8b, 1B-T3, 1B-T4, 1B-T5, 1B-T6 and more |
| `apps/edge/src/vault/routes.ts` | 24: 1A-T2, 1A-T3, 1A-T4, 1A-T5, 1A-T6, 1A-T7, 1A-T8a, 1A-T8b, 1B-T5, 1B-T6, 1B-T7, 1B-T8 and more |
| `apps/edge/src/v1/protocol.ts` | 22: 1A-T2, 1B-T3, 1B-T5, 1B-T6, 1B-T7, 1B-T8, 1B-T9, 1B-T10, 1C-T11, 1D-T11, P3-T7, P4-T2 and more |
| `apps/edge/src/vault/user-vault.ts` | 19: 1A-T1, 1A-T2, 1A-T3, 1A-T8a, 1A-T8b, 1B-T2, 1B-T3, 1B-T4, 1B-T5, 1B-T6, 1B-T8, 1B-T11 and more |
| `apps/edge/src/v1/worker-routes.ts` | 14: 1B-T3, 1B-T5, 1B-T6, 1B-T7, 1B-T8, 1B-T9, 1B-T10, P3-T3, P3-T4, P3-T10, P4-T2, P4-T6 and more |
| `apps/app/package.json` | 14: 1C-T5, 1C-T7, 1D-T6, P2-T2, P2-T34, P3-T12, P6A-T7, P6A-T8, P6A-T9, P6A-T10, P6A-T11, P6A-T12 and more |
| `apps/edge/test/route-coverage.test.ts` | 13: 1B-T13, 1D-T10, 1D-T11, P3-T3, P4-T2, P4-T3, P4-T5, P4-T6, P4-T7, P4-T11, P5-T6, P5-T12 and more |
| `apps/edge/src/v1/env.ts` | 12: 1A-T2, 1B-T3, 1B-T5, 1B-T7, 1D-T11, P3-T4, P3-T11, P4-T2, P4-T3, P4-T5, P5-T7, P5-T15 |
| `apps/edge/src/v1/handler.ts` | 12: 1A-T2, 1B-T3, 1B-T4, 1B-T7, 1C-T10a, 1D-T10, 1D-T11, P3-T3, P3-T4, P3-T10, P4-T3, P5-T8 |
| `docs/implementation/premium-progress.md` | 12: 1A-T10, 1C-T12, 1D-T15, P2-T38, P3-T23, P4-T23, P4-T24, P5-T29, P6A-T14, P6B-T20, P6B-T21, P6C-T15 |
| `apps/app/src/config/featureFlags.ts` | 12: 1C-T8, 1C-T9, P2-T2, P2-T38, P3-T14, P3-T24, P4-T18, P4-T24, P5-T21, P5-T29, P6A-T3a, P6A-T13 |
| `apps/edge/src/vault/commands/registry.ts` | 11: 1A-T3, 1A-T4, 1A-T5, 1A-T6, 1B-T6, 1B-T9, 1B-T10, P4-T3, P4-T7, P5-T9, P5-T13 |
| `apps/edge/test/workers/support/v1-client.ts` | 10: 1A-T2, 1A-T8a, 1A-T8b, 1B-T3, 1B-T4, 1B-T5, 1B-T7, 1D-T10, 1D-T11, P3-T4 |
| `apps/edge/README.md` | 10: 1A-T10, 1C-T12, 1D-T11, 1D-T12, P3-T4, P4-T5, P5-T7, P5-T15, P6C-T1, P6C-T9 |
| `apps/edge/src/cloudflare-workers.d.ts` | 9: 1A-T1, 1B-T2, 1B-T4, 1B-T5, 1B-T6, 1C-T1, 1D-T10, P4-T5, P6C-T3 |
| `apps/edge/package.json` | 8: 1A-T1, 1C-T1, 1C-T2, 1D-T3, 1D-T12, P6C-T1, P6C-T6, P6C-T7 |
| `apps/app/app.json` | 8: P2-T34, P3-T2, P3-T12, P3-T15, P3-T24, P4-T17, P5-T2, P6B-T10 |
| `packages/contracts/src/index.ts` | 8: P3-T8, P3-T9, P4-T1, P5-T1, P5-T2, P5-T3, P6B-T0, P6B-T10 |
| `apps/edge/test/workers/vault-schema.test.ts` | 7: 1A-T1, 1B-T2, P4-T3, P4-T5, P4-T11, P5-T4, P6B-T10 |
| `apps/edge/src/vault/schema.ts` | 7: 1A-T1, 1B-T2, P4-T3, P4-T5, P4-T11, P5-T4, P6B-T10 |
| `apps/edge/src/v1/ai/service.ts` | 7: 1B-T7, P3-T4, P3-T6, P3-T7, P3-T9, P3-T10, P3-T11 |
| `apps/edge/src/vault/retention.ts` | 6: 1A-T8a, 1A-T8b, 1B-T6, 1B-T10, 1B-T11, P5-T9 |
| `apps/edge/wrangler.jsonc` | 6: 1C-T1, 1C-T2, 1C-T3, 1C-T10b, P6C-T1, P6C-T14b |
| `apps/edge/src/server.ts` | 6: 1C-T1, 1C-T10b, 1D-T2, 1D-T12, P5-T7, P6C-T2 |
| `apps/app/app/_layout.tsx` | 6: 1C-T5, 1D-T6, P2-T2, P3-T12, P4-T17, P6A-T3b |

- Migrations (vault, D1 and the phone's diary) take the next free number when they are integrated; the integrator renames the file and updates the journal.
- The root lockfile is regenerated once per merge from the merged manifests, followed by `npm run test:ops`.
- Route tables and the command registry keep their documented order; `en.json`, `th.json` and `premium-progress.md` take both sides of a conflict.
- Once P6C-T1 lands, a task that adds a Worker binding, var, queue, Workflow or Cron trigger also adds it to the staging and production blocks (boundaries amendment A20).

## What waits on the owner

| Task | Waits on |
| --- | --- |
| P2-T38 | P2-T37, and the owner's approval of E2-A, E2-B, E2-C and E2-D |
| P3-T24 | P3-T23, P2-T38, and the owner's approval of E2-P3-A and E2-P3-B |
| P4-T24 | P4-T16b, P4-T18, P4-T19, P4-T20, P4-T21, P4-T22, P4-T23, P2-T38, and the owner's approval at the E2 checkpoint |
| P5-T29 | P5-T22, P5-T24, P5-T25, P5-T26, P2-T38, and the owner's approval of E2-P5A and E2-P5B |
| P6A-T8 | P6A-T2, P6A-T3a, P6A-T7, and the owner's answer to Q1 |
| P6A-T9 | P2-T18, P6A-T4, P6A-T7, and the owner's answer to Q4 |
| P6A-T10 | 1C-T5, 1D-T6, P3-T1 (P3:slip-qr), P3-T12 (P3:qr-native), P4-T6 (P4:slips-route), P4-T14 (P4:slip-client), P4-T18 (P4:slips-area), P6A-T6a, P6A-T6b, P6A-T7, and the owner's answers to Q3 and Q6 (the team id keychain sharing needs). |
| P6A-T11 | P3-T12 (P3:qr-native), P6A-T3b, P6A-T4, P6A-T6a, P6A-T7, and the owner's answer to Q3. |
| P6A-T12 | P6A-T5, P6A-T7, and the owner's answer to Q2 |
| P6A-T13 | P2-T38, P4-T21 (P4:inbox), P4-T19 (P4:scan-route), P4-T18 (P4:slips-area), P6A-T3a, P6A-T3b, P6A-T4, P6A-T6b, and the owner's approval of the E2 checkpoint below |
| P6B-T18 | P6B-T17, P6C-T2 (P6C:association-files). Waits on owner Q1 and the D33 domain; nothing else here needs it. |
| P6B-T20 | P6B-T1 to P6B-T9, P6B-T11 to P6B-T13, P6B-T16, P6B-T17, P2-T38, and the owner's approval of E2-X1, E2-X2 and E2-X3 |
| P6C-T14b | P6C-T7, P6C-T14; Step 6 also waits on the owner's yes per switch and environment. |

## Ready now

| Task | Lane | Title |
| --- | --- | --- |
| P2-T2 | App | Packages, the gesture root, the wallet area and one reduced-motion answer |
| P3-T1 | App | The phone's slip QR module |
| P6A-T1 | App | Outside ids, the app group store and the account file |
| P6B-T0 | Full stack | The deletion short code |
| P4-T1 | Server | Slip and push contracts, and the shared slip reference |
| P4-T10 | Server | The parser learns Thai bank exports (`apps/api`) |
| P5-T1 | Server | The currency table and exact rate arithmetic |

## Waves

- **Wave 1** (22): 1A-T5, 1A-T6, 1B-T2, 1C-T1, 1C-T5, 1D-T1, 1D-T3, 1D-T4, 1D-T5, P2-T1, P2-T2, P2-T3, P2-T4, P2-T5, P2-T6, P2-T7, P3-T1, P4-T1, P4-T10, P5-T1, P6A-T1, P6B-T0
- **Wave 2** (19): 1A-T7, 1A-T8b, 1B-T3, 1C-T2, 1C-T6, 1C-T7, 1D-T6, 1D-T7, 1D-T8, 1D-T9, 1D-T14, P2-T8, P2-T19, P3-T5, P3-T12, P4-T12, P4-T13, P5-T3, P5-T4
- **Wave 3** (11): 1A-T9, 1B-T4, 1B-T7, 1C-T3, 1C-T8, 1D-T10, P2-T9, P2-T10, P3-T2, P6A-T7, P6B-T14
- **Wave 4** (13): 1A-T10, 1B-T5, 1B-T6, 1B-T9, 1C-T4, 1C-T9, 1D-T11, P2-T11, P2-T13, P2-T25, P5-T2, P5-T9, P6A-T2
- **Wave 5** (12): 1B-T8, 1B-T10, 1C-T10a, P2-T12, P2-T14, P2-T20, P2-T29, P2-T31, P2-T32, P2-T33, P3-T14, P5-T17
- **Wave 6** (8): 1B-T11, 1B-T12, P2-T15, P2-T21, P2-T23, P2-T34, P4-T17, P6B-T10
- **Wave 7** (3): 1B-T13, P2-T16, P5-T19
- **Wave 8** (9): 1C-T10b, 1C-T11, P2-T17, P2-T26, P3-T3, P3-T4, P3-T13, P4-T2, P4-T3
- **Wave 9** (15): 1C-T12, 1C-T13, 1D-T12, 1D-T13, P2-T18, P2-T27, P3-T6, P3-T15, P3-T19, P4-T5, P4-T7, P5-T6, P6C-T1, P6C-T8, P6C-T10a
- **Wave 10** (18): 1D-T15, P2-T22, P2-T28, P2-T30, P3-T7, P3-T16, P3-T18, P4-T8, P4-T9, P4-T11, P4-T14, P5-T7, P5-T8, P6C-T1b, P6C-T2, P6C-T4, P6C-T5, P6C-T12
- **Wave 11** (8): P2-T24, P3-T8, P3-T9, P3-T11, P4-T15, P4-T16a, P5-T15, P6C-T3
- **Wave 12** (11): P2-T35, P3-T10, P3-T17, P3-T20, P3-T21, P3-T22, P4-T4, P4-T18, P6A-T3a, P6C-T6, P6C-T13
- **Wave 13** (11): P2-T36, P2-T37, P3-T23, P4-T6, P4-T16b, P4-T19, P4-T22, P6A-T3b, P6A-T8, P6C-T7, P6C-T14
- **Wave 14** (10): P2-T38, P4-T20, P5-T5, P5-T16, P6A-T4, P6A-T5, P6A-T6a, P6B-T1, P6C-T9, P6C-T14b
- **Wave 15** (15): P3-T24, P4-T21, P5-T10, P5-T18a, P6A-T9, P6A-T11, P6A-T12, P6B-T2, P6B-T3, P6B-T9, P6B-T11, P6B-T12, P6B-T19, P6C-T9b, P6C-T10b
- **Wave 16** (7): P4-T23, P5-T11, P5-T18b, P5-T20, P6A-T6b, P6B-T4, P6B-T5
- **Wave 17** (12): P4-T24, P5-T12, P5-T13, P5-T14, P5-T18c, P5-T18d, P5-T27a, P6A-T10, P6A-T13, P6B-T6, P6B-T7, P6B-T16
- **Wave 18** (5): P5-T18e, P5-T21, P6A-T14, P6B-T8, P6B-T13
- **Wave 19** (7): P5-T22, P5-T23, P5-T25, P5-T26, P5-T27b, P6B-T17, P6C-T11
- **Wave 20** (5): P5-T24, P6B-T15, P6B-T18, P6B-T20, P6C-T15
- **Wave 21** (3): P5-T28, P5-T29, P6B-T21

## Critical path

The longest chain of unfinished work, weighted by each task's size in its plan:

1B-T2 -> 1B-T3 -> 1B-T4 -> 1B-T5 -> 1B-T10 -> 1B-T11 -> 1B-T13 -> 1C-T11 -> P6C-T1 -> P6C-T2 -> P6C-T3 -> P6C-T6 -> P6C-T7 -> P6C-T9 -> P6C-T10b -> P6C-T15

## Phase proofs and E2 approvals

- 1B-T8: Resync snapshots on SnapshotWorkflow, and the ten-times memory proof
- 1C-T9: Route the approved screens and move their copy into the catalogs
- 1C-T12: The 1C proof against the local Worker, and the docs
- 1D-T15: The phase 1 proof on two phones
- P2-T38: After E2: route the wallet area, move the copy into the catalogs and switch the routed pack
- P3-T23: The phase 3 proof: drafts kept without edits
- P3-T24: After E2: route the bunai area, move the copy into the catalogs and bump the AI notice
- P4-T23: The phase 4 proof
- P4-T24: After E2: route the slip and statement screens
- P5-T28: The phase 5 proof: a golden trip that adds up to the satang
- P5-T29: After E2: route the travel screens and move their copy into the catalogs
- P6A-T13: After E2: route outside the app
- P6A-T14: The proof on real phones (recorded SKIPPED until D33)
- P6B-T20: After E2: approve the extras area, move the copy into the catalogs and route
- P6B-T21: The phase 6B proof on real phones (recorded SKIPPED until D33)
- P6C-T14: E2: approve the pages, the emails and the listing text, then serve the pages
- P6C-T15: The closed beta: its runbook, its gate and the release proof

# Jotbun v1: execution plan

Generated on 2026-11-08 from the eleven plans in `docs/superpowers/plans/` (the specification of every task) and the approved spec. The GitHub backlog mirrors it: {board}

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
- 1C-T5: The app's Better Auth port, replacing Auth0 (tested against a fake server) (pull request #347)

Merge the open pull requests first, in the order the phase 1 ledger gives (shared route tables and the command registry keep their order), then take ready tasks.

## Lanes and parallel work

- **App** (106 open): 1C 4, 1D 6, P2 31, P3 11, P4 11, P5 17, P6A 13, P6B 13
- **Server** (49 open): 1A 1, 1B 9, 1C 5, 1D 4, P3 5, P4 10, P5 12, P6C 3
- **Full stack** (22 open): 1C 3, P3 5, P4 1, P5 3, P6B 7, P6C 3
- **Ops** (12 open): 1A 1, P6C 11
- **Native** (8 open): 1C 1, P2 1, P3 2, P4 1, P6A 1, P6C 2
- **Docs** (2 open): P6A 1, P6B 1

Today: 32 done, 1 in review, 0 in progress, 19 ready now, 231 in all.

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
| `apps/edge/src/v1/handler.ts` | 12: 1A-T2, 1B-T3, 1B-T4, 1B-T7, 1C-T10a, 1D-T10, 1D-T11, P3-T3, P3-T4, P3-T10, P4-T3, P5-T8 |
| `apps/edge/src/v1/env.ts` | 12: 1A-T2, 1B-T3, 1B-T5, 1B-T7, 1D-T11, P3-T4, P3-T11, P4-T2, P4-T3, P4-T5, P5-T7, P5-T15 |
| `docs/implementation/premium-progress.md` | 12: 1A-T10, 1C-T12, 1D-T15, P2-T38, P3-T23, P4-T23, P4-T24, P5-T29, P6A-T14, P6B-T20, P6B-T21, P6C-T15 |
| `apps/app/src/config/featureFlags.ts` | 12: 1C-T8, 1C-T9, P2-T2, P2-T38, P3-T14, P3-T24, P4-T18, P4-T24, P5-T21, P5-T29, P6A-T3a, P6A-T13 |
| `apps/edge/src/vault/commands/registry.ts` | 11: 1A-T3, 1A-T4, 1A-T5, 1A-T6, 1B-T6, 1B-T9, 1B-T10, P4-T3, P4-T7, P5-T9, P5-T13 |
| `apps/edge/test/workers/support/v1-client.ts` | 10: 1A-T2, 1A-T8a, 1A-T8b, 1B-T3, 1B-T4, 1B-T5, 1B-T7, 1D-T10, 1D-T11, P3-T4 |
| `apps/edge/README.md` | 10: 1A-T10, 1C-T12, 1D-T11, 1D-T12, P3-T4, P4-T5, P5-T7, P5-T15, P6C-T1, P6C-T9 |
| `apps/edge/src/cloudflare-workers.d.ts` | 9: 1A-T1, 1B-T2, 1B-T4, 1B-T5, 1B-T6, 1C-T1, 1D-T10, P4-T5, P6C-T3 |
| `apps/edge/package.json` | 8: 1A-T1, 1C-T1, 1C-T2, 1D-T3, 1D-T12, P6C-T1, P6C-T6, P6C-T7 |
| `apps/app/app.json` | 8: P2-T34, P3-T2, P3-T12, P3-T15, P3-T24, P4-T17, P5-T2, P6B-T10 |
| `packages/contracts/src/index.ts` | 8: P3-T8, P3-T9, P4-T1, P5-T1, P5-T2, P5-T3, P6B-T0, P6B-T10 |
| `apps/edge/src/vault/schema.ts` | 7: 1A-T1, 1B-T2, P4-T3, P4-T5, P4-T11, P5-T4, P6B-T10 |
| `apps/edge/test/workers/vault-schema.test.ts` | 7: 1A-T1, 1B-T2, P4-T3, P4-T5, P4-T11, P5-T4, P6B-T10 |
| `apps/edge/src/v1/ai/service.ts` | 7: 1B-T7, P3-T4, P3-T6, P3-T7, P3-T9, P3-T10, P3-T11 |
| `apps/edge/src/vault/retention.ts` | 6: 1A-T8a, 1A-T8b, 1B-T6, 1B-T10, 1B-T11, P5-T9 |
| `apps/edge/src/server.ts` | 6: 1C-T1, 1C-T10b, 1D-T2, 1D-T12, P5-T7, P6C-T2 |
| `apps/edge/wrangler.jsonc` | 6: 1C-T1, 1C-T2, 1C-T3, 1C-T10b, P6C-T1, P6C-T14b |
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
| 1D-T6 | App | PostHog on the phone: the client, identity, screens and the consent calls |
| 1D-T7 | App | The phase 1 app events, from the rules that perform each action |
| 1D-T8 | App | The consent question and the Privacy switch (D34) |
| 1D-T9 | App | The conflict choice: 1D's `ChoicePanel`, the record's choice flow and its mark in History (C16, `rh-conflict`) |
| P2-T2 | App | Packages, the gesture root, the wallet area and one reduced-motion answer |
| P2-T19 | App | Wallet commands move into one hook |
| P3-T5 | App | The Bun AI emitters and the draft review |
| P4-T12 | App | The phone's slip core: clients, routes, the salted hash and the salt store |
| P4-T13 | App | Photos, shrinking and batches on the phone |
| P3-T2 | Full stack | Record source in the contract, the vault and the phone's outbox |
| P3-T12 | Native | The native QR decoder |
| 1A-T9 | Server | The vault Worker in workerd answers the parity money session like NestJS |
| 1B-T5 | Server | Statement uploads and the parse pipeline (Queue, consumer, parser Container) |
| 1B-T6 | Server | Exports on ExportWorkflow |
| 1B-T7 | Server | The AI routes on vault reads |
| 1B-T9 | Server | Receipt attachments |
| 1C-T2 | Server | Sign-in email delivery (D30), the local code log and the per-address cap |
| 1D-T10 | Server | Live pokes from the vault: `GET /v1/sync/live` on the Hibernation API |
| P5-T3 | Server | The trip, settings and rates contracts |

## Waves

- **Wave 1** (20): 1A-T9, 1B-T5, 1B-T6, 1B-T7, 1B-T9, 1C-T2, 1C-T5, 1D-T6, 1D-T7, 1D-T8, 1D-T9, 1D-T10, P2-T2, P2-T19, P3-T2, P3-T5, P3-T12, P4-T12, P4-T13, P5-T3
- **Wave 2** (11): 1A-T10, 1B-T8, 1B-T10, 1C-T3, 1C-T6, 1C-T7, 1D-T11, 1D-T14, P2-T8, P5-T2, P5-T9
- **Wave 3** (10): 1B-T11, 1B-T12, 1C-T4, 1C-T8, P2-T9, P2-T10, P5-T17, P6A-T7, P6B-T10, P6B-T14
- **Wave 4** (7): 1B-T13, 1C-T9, 1C-T10a, P2-T11, P2-T13, P2-T25, P6A-T2
- **Wave 5** (14): 1C-T10b, 1C-T11, P2-T12, P2-T14, P2-T20, P2-T29, P2-T31, P2-T32, P2-T33, P3-T3, P3-T4, P3-T14, P4-T2, P4-T3
- **Wave 6** (16): 1C-T12, 1C-T13, 1D-T12, 1D-T13, P2-T15, P2-T21, P2-T23, P2-T34, P3-T6, P4-T5, P4-T7, P4-T17, P5-T6, P6C-T1, P6C-T8, P6C-T10a
- **Wave 7** (14): 1D-T15, P2-T16, P3-T7, P4-T8, P4-T9, P4-T11, P5-T7, P5-T8, P5-T19, P6C-T1b, P6C-T2, P6C-T4, P6C-T5, P6C-T12
- **Wave 8** (8): P2-T17, P2-T26, P3-T8, P3-T9, P3-T11, P3-T13, P5-T15, P6C-T3
- **Wave 9** (9): P2-T18, P2-T27, P3-T10, P3-T15, P3-T18, P3-T19, P4-T4, P6C-T6, P6C-T13
- **Wave 10** (9): P2-T22, P2-T28, P2-T30, P3-T16, P3-T22, P4-T6, P4-T14, P6C-T7, P6C-T14
- **Wave 11** (8): P2-T24, P3-T17, P3-T20, P4-T15, P4-T16a, P5-T5, P6C-T9, P6C-T14b
- **Wave 12** (8): P2-T35, P3-T21, P4-T16b, P4-T18, P5-T10, P6A-T3a, P6C-T9b, P6C-T10b
- **Wave 13** (8): P2-T36, P2-T37, P3-T23, P4-T19, P4-T22, P5-T11, P6A-T3b, P6A-T8
- **Wave 14** (11): P2-T38, P4-T20, P5-T12, P5-T13, P5-T14, P5-T16, P5-T27a, P6A-T4, P6A-T5, P6A-T6a, P6B-T1
- **Wave 15** (12): P3-T24, P4-T21, P5-T18a, P6A-T9, P6A-T11, P6A-T12, P6B-T2, P6B-T3, P6B-T9, P6B-T11, P6B-T12, P6B-T19
- **Wave 16** (6): P4-T23, P5-T18b, P5-T20, P6A-T6b, P6B-T4, P6B-T5
- **Wave 17** (8): P4-T24, P5-T18c, P5-T18d, P6A-T10, P6A-T13, P6B-T6, P6B-T7, P6B-T16
- **Wave 18** (5): P5-T18e, P5-T21, P6A-T14, P6B-T8, P6B-T13
- **Wave 19** (7): P5-T22, P5-T23, P5-T25, P5-T26, P5-T27b, P6B-T17, P6C-T11
- **Wave 20** (5): P5-T24, P6B-T15, P6B-T18, P6B-T20, P6C-T15
- **Wave 21** (3): P5-T28, P5-T29, P6B-T21

## Critical path

The longest chain of unfinished work, weighted by each task's size in its plan:

1B-T5 -> 1B-T10 -> 1B-T11 -> 1B-T13 -> 1C-T11 -> P6C-T1 -> P6C-T2 -> P6C-T3 -> P6C-T6 -> P6C-T7 -> P6C-T9 -> P6C-T10b -> P6C-T15

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

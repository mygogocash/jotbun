# Controller handover (28 Oct 2026, about 09:40 Bangkok, usage limit)

Untracked; not committed. Integration branch `claude/p1a-vault-core` in `.claude/worktrees/p1a-vault-core`.

Agent protocol, briefs and reviews: `/private/tmp/claude-501/-Users-kunanonjarat-Developer-jotbun/b2786ab4-e3df-4aa5-8d37-dec01682df63/scratchpad/agents/` (`protocol.md`, `briefs/`, `reviews/`). Controller scratch (follow-ups list, CI wait script, ledger union script, PR bodies): `/private/tmp/claude-501/-Users-kunanonjarat-Developer-jotbun/d32ab8e7-412d-4ba0-af54-490104acdd42/scratchpad/` (`followups.md`, `wait_ci.sh`, `ledger_union.py`, `agent_tail.py`).

## Merged this session
#327 (1B-T3), #329 (P2-T1), #332 (P4-T1), #328 (P6B-T0). Issues closed, worktrees and branches removed.

## Open PRs (all reviewed and approved; merge on green CI, then close the issue by hand and remove the worktree and branch)
| PR | Task | Issue | Worktree | Last CI |
| --- | --- | --- | --- | --- |
| #330 | iOS keyboard fix | none | fix-ios-sheet-keyboard | rerun of run 40620215604 pending (flakes) |
| #331 | P5-T1 currency | #234 | p5-t1 | check |
| #333 | P2-T5 Quick add hooks | #151 | p2-t5 | finished, check |
| #334 | 1C-T1 Better Auth on D1 | #118 | p1-1c-t1 | finished, check |
| #335 | P2-T6 record hook | #152 | p2-t6 | check |
| #336 | P3-T1 slip QR | #185 | p3-t1 | check |
| #337 | 1D-T1 analytics core (branch p1/1d-t1-analytics-core) | #132 | agent-abe4ba17803d852d1 | check |

Each merge makes the others conflict in `docs/implementation/premium-progress.md` (end-of-file appends): merge the integration head into each branch and resolve with `python3 -I <scratch>/ledger_union.py docs/implementation/premium-progress.md` (keeps both sides), typecheck, push.

## CI flakes (not caused by any PR; one rerun each)
RemindersScreen and RecentlyDeletedScreen render timeouts near 4 s; HistoryScreen "toolbar" fast failure; apps/api request-context.spec.ts `/6500/` matching random UUIDs; retention.integration.spec.ts `import_uploads_check3` (likely JS vs DB clock skew); upload-intake.spec.ts under load. An Opus planner was writing `briefs/fix-flaky-tests.md` (systemic render timeout diagnosis included); apps/api changes need a controller ruling.

## In flight when the limit hit (check worktree state; restart from the brief plus the predecessor's transcript tail if cut off)
- Reviews: 1C-T5 (worktree p1-1c-t5, commit 7bc2fe1; key question: root lockfile moves hoisted zod 3.25.76 to 4.6.7), P4-T10 (p4-t10, e3cf0e4).
- P6A-T1: approved; reviewer writing `briefs/P6A-T1-round2.md` (folder delete, iOS copyIn onto a folder, lazy expo-constants, marker guard). Then a Haiku fixer, then a confirming review.
- Implementers: 1A-T7 (p1a-t7, brief 1A-T7.md), 1B-T4 (p1-1b-t4; was BLOCKED on a reporter-output expectation, ruled: accept default reporter and continue at Step 4), P5-T4 (p5-t4; in its mutation run).
- Planners: 1A-T8b (`briefs/1A-T8b.md`), flaky tests.

## Rulings this session
R84: P4-T10 may add only `header_fingerprint: null` to three test-only API files. 1A-T7: SQLite LIKE case folding is ASCII-only, accepted as a deviation. 1D-T1: a queued no after an account switch still writes (safe direction).

## Owner decisions waiting
- 1C sign-in: no per-email lockout, only per code. With Task 2's 5 codes per 15 minutes, about 1,440 guesses a day against one address (about 41% in a year). Options: per-address lockout or backoff, a lower daily cap, or accept for the beta. Needed before 1C-T2 sends real mail.
- The old controller tab (session b2786ab4) must not auto-continue.

## Next
Merge the green PRs; ship 1C-T5 and P4-T10 once approved; 1C-T2's brief must first pin the six untested Better Auth security options (see followups.md); P2-T2 can start once 1C-T5 merges; recompute ready tasks with `scripts/backlog/backlog.py` (see followups.md for the minors batch).

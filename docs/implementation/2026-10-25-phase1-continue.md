# Continue phase 1 (25 Oct 2026, 15:10 Bangkok)

The integration branch is `claude/p1a-vault-core` at `60e2026` in `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1a-vault-core`. It is pushed and matches origin. Do not work in `/Users/kunanonjarat/Developer/jotbun`: that checkout is `claude/premium-ai-edge` and has unrelated uncommitted reminder edits.

Ledgers (gitignored, the recovery map):

- `.claude/worktrees/p1a-vault-core/.superpowers/sdd/2026-10-25-jotbun-p1a-vault-core/progress.md`
- `.claude/worktrees/p1a-vault-core/.superpowers/sdd/2026-10-25-jotbun-p1b-vault-files/progress.md`
- `.claude/worktrees/p1a-vault-core/.superpowers/sdd/2026-10-25-jotbun-p1d-pokes-posthog/progress.md`

Plans: `docs/superpowers/plans/2026-10-25-jotbun-p1a-vault-core.md`, `2026-10-25-jotbun-p1b-vault-files.md`, `2026-10-25-jotbun-p1d-pokes-posthog.md`. Plans 1C and P2 are only in the scratchpad: `/private/tmp/claude-501/-Users-kunanonjarat-Developer-jotbun/0216f2a9-2d77-48ea-b5e9-d1baeb092909/scratchpad/phase1-plans/`. 1C's confirming re-review is Approved. P2's confirming re-review is Needs fixes (see below).

Git: use `/usr/bin/git`, one plain command, from inside the task worktree. Never `git stash`. Never `git reset --hard` a worktree that has uncommitted files. Task pull requests target `claude/p1a-vault-core`. Merge with `gh pr merge --merge` only when all three CI jobs are green, then fast-forward the integration worktree. Several branches only conflict in `docs/implementation/premium-progress.md`. Keep both receipts.

## Merge these first

| PR | What | Review | CI at handover |
| --- | --- | --- | --- |
| [#72](https://github.com/mygogocash/jotbun/pull/72) | Parse server, plus the keep-alive shutdown fix `584879f` | Approved after the fix re-review | All three jobs green. Merge first. |
| [#74](https://github.com/mygogocash/jotbun/pull/74) | PostHog proxy at `/ingest` | Approved | All three jobs green. Merge second. The receipt will conflict with #72; keep both. |

Then, in this order, because they share the vault route table and the command registry:

1. [#81](https://github.com/mygogocash/jotbun/pull/81) transactions (`d4d82f5`). Approved. One minor: the exactness case does not project every receipt and audit column. CI was still running.
2. [#80](https://github.com/mygogocash/jotbun/pull/80) budgets (`c283b4f`). Approved. One minor: the receipt says 20 ported and 9 pending; the table is 21 and 8. Merge only after #81. Resolve the registry so the order stays category, transaction, budget.

## Approved, CI red on one render timeout

These failed `Typecheck, unit, render, build, export`. The sampled failure ([run 40172722700](https://github.com/mygogocash/jotbun/actions/runs/40172722700), PR #73) is `HistoryReturn.render.test.tsx` timing out at 5 seconds. Database and release jobs passed. Rerun the failed job once before changing a test. Do not raise that timeout inside an unrelated pull request.

| PR | Commit | Review |
| --- | --- | --- |
| [#73](https://github.com/mygogocash/jotbun/pull/73) | pending choices `35001ce` / merge `77d2278` | Approved. Five minors in the 1D ledger. |
| [#75](https://github.com/mygogocash/jotbun/pull/75) | files schema `018b2dc` / merge `3e00a07` | Approved. One minor: two new triggers are not fired by tests. |
| [#76](https://github.com/mygogocash/jotbun/pull/76) | live channel `5aa1213` / merge `d748ccd` | Approved. Six minors in the 1D ledger. |
| [#77](https://github.com/mygogocash/jotbun/pull/77) | server analytics `c57be1f` / merge `9b7f966` | Approved. Six minors in the 1D ledger. |
| [#78](https://github.com/mygogocash/jotbun/pull/78) | logged days `b92000b` | Approved. Two minors. |
| [#79](https://github.com/mygogocash/jotbun/pull/79) | wallet stores `2ba3b85` | Approved. Three minors. One matters: if `eraseLegacyImportDraft` rejects, sign-out skips `eraseDeviceSettings`. |
| [#82](https://github.com/mygogocash/jotbun/pull/82) | Thai pack `44adc76` | Approved. One minor: `packKeyOf` is not asserted on an alias. |

#78 and #79 both edit `spendDiary.ts` and `fakeDiary.ts`. Merge one, then combine the diary hunks on the other. #73, #76, and #79 also touch the diary. Combine, do not drop `pendingChoices`, `loggedDays`, or `accountId`.

## In review, not a pull request yet

1B-T3, files front door, commit `f95ba85` on `p1/1b-t3-files-door` in `.claude/worktrees/p1-1b-t3`. Review is Approved (two minors: the charge flag is set after the first RPC returns, and the `auth_time` test can false-fail near a second boundary). `sync.test.ts` was not edited. Do not open the pull request until #75 has merged, then retarget `f95ba85` onto that schema so the pull request is only the front door.

## Still being written — do not reset

| Worktree | Branch | State |
| --- | --- | --- |
| `agent-abe4ba17803d852d1` | `worktree-agent-abe4ba17803d852d1` | 1D-T1 commit `b3b1c11`. Review Needs fixes. A fixer was running: stop capture before a fallible consent write; serialize `setAccount`, `answer`, and `refresh` so a stale yes cannot replace a pending no; rename the receipt to `## 1D: live pokes, the pending choice, PostHog and the proof`. Minors deferred. Report: scratchpad `review-1d-t1.txt`. |
| `p1-1c-t1` | `p1/1c-t1-better-auth` | Uncommitted Better Auth on D1 (`package.json`, `wrangler.jsonc`, `server.ts`, workers config). Plan 1C is approved. Finish, then review. |
| `p1-1c-t5` | `p1/1c-t5-app-auth` | Uncommitted app auth port (`client.ts`, `credentialProvider.ts`, `package.json`). Owns `app/_layout.tsx` and the lockfile. Do not start P2-T2 until this commits. |
| `p2-t1` | `p2/t1-palette` | Uncommitted palette: `walletPalette.ts`, `walletType.ts`, `WalletText` under `apps/app/src/wallet/`, `ThemeProvider.tsx`. |
| `p2-t5` | `p2/t5-quick-add` | Uncommitted. `QuickAddScreen.tsx` and new `apps/app/src/screens/redesign/entry/`. Render gate of Quick Add plus catalogue passed 343. |
| `p2-t6` | `p2/t6-record-hook` | Uncommitted. `RecordScreen.tsx` and new `apps/app/src/screens/redesign/record/`. Catalogue render passed 262. |

## Do not start yet

- P2-T2. It installs packages and wraps `app/_layout.tsx`, which 1C-T5 is already editing.
- P2-T33, P2-T34, P2-T18, and 1D-T7. The P2 confirming re-review is Needs fixes (`scratchpad/phase1-plans/rereview-p2.txt`). Owner questions Q1–Q3 are only in the questions list, not inside the tasks. 1D still cites the old P2 task numbers: `analyticsCategoryKey` is P2-T7, not P2-T5. 1D-T1's `wallet_type` must stay the four types (the commit `b3b1c11` already drops `ewallet`).
- 1B-T4 until 1B-T3 is reviewed and merged.
- Anything in `agent-a4e4cbbb8ea6b2a9c`. Its dirty `backend.yml`, README, and wrangler files are not this plan.

## Rules the next session keeps

- Amounts leave SQLite as `CAST(... AS TEXT)`. Id lists bind as one JSON parameter via `json_each` (R57). Command headers are checked before the body (R41).
- A budget put deletes the month's limits, writes the overall, then inserts the limits.
- The live socket sends no `x-gogospend-session` header (R78). The vault reads `sid` from the token.
- 1B-T2's erase is not atomic; that is accepted (R77).
- Parse-server shutdown uses `trackHttpDrain` before `listen`. Do not revert `584879f`.
- No new packages unless the task brief names them. Nothing under `vendor/`. Do not push to `main`. PR #71 (`claude/premium-ai-edge` into `main`) stays the owner's decision.

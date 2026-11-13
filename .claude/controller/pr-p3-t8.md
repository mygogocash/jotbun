## Summary
- **P3-T8: reading one slip with D25's escalation.** The slip route reads with Haiku. When D25 says the read is not good enough, the same request re-reads the slip with Opus, and nothing is kept.
  - **`v1/ai/slip-read.ts` (new):** `slipNeedsOpus` (D25's triggers) and `readSlipImage`.
  - **What triggers a re-read:** no kind, a cut-short answer, a fourth kind, an unreadable answer, a refusal, or a missing amount, date or receiver.
  - **Time limits (P8):** Haiku's call is capped at `HAIKU_SLIP_CAP_MS`, Opus gets what is left, and a cap under 2 s makes no call.
- **What the read says:**
  - **The bank (P4)** comes from the same read as the drafts shown: Haiku's with Haiku's read, Opus's with Opus's.
  - **`escalated` (P5)** is true whenever D25 sent the slip to Opus.
  - **`declined` and `tokens` (P6):** `declined` is set by a refusal on either call. `tokens` counts this read's own calls.
- **Refunds (P11, P3-T7's carry):** a slip no model could read gives the use back before the 503, but only when the last call failed for a refundable reason (a rate limit, a 5xx, a timeout or no connection). A rejected request (400) spends the use. The receipt's risk note says a Haiku read past its cap can be billed and still refunded.
- **Logging (P12):** a slip no model read logs one `ai_fallback` line naming only the class, `SlipNotRead`.
- **Privacy (P14):** the read is sent wallet and category ids with names, never balances.
- **Carried followups:**
  - P3-T6's m1: `ai-routing.test.ts`'s fake-clock slip rows are complete reads, and `receipts/P3-T6.md:37` is corrected.
  - P3-T6's n2: each call sends its base's own effort.
  - P3-T4's m3: the cap reaches Haiku's call.
  - P3-T7's "one request refunds once", `giveBack` on `SlipNotRead`, and n1, a failed refund logged before the 503.
- **Files beyond the plan's list (P2):** `ai-routing.test.ts`, `ai-uses.test.ts` and `ai.test.ts`, whose third scripted slip case now gives complete reads (P3). Two type-only fixtures, `companionSections.tsx` and `TellBunSheet.render.test.tsx`, follow `AiSlipResult`'s new required keys. The fakes' default slip result is now the server's "unreadable" answer (P13).
- **The controller accepted the planner's calls P1 to P18.**
  - Planned on Claude Opus (re-proved on `437743e2` after #449), built on Claude Haiku 5.5.
  - The controller checked the commit: all 16 `real/` files are byte-identical.
  - The receipt is its own file under R87: `docs/implementation/receipts/P3-T8.md`.
  - No package, lockfile, Cloudflare resource or route change. The installs were skipped because the worktree was installed; the receipt does not mention it.
- **Release (P18):** an older app refuses the new slip result (exact keys), so any release carrying this needs the client minimum `AI_MIN_CLIENT_VERSION` 0.2.0. The receipt says so for P6C.

## Test plan
- [x] RED: Node 3 of 3 and Workers 27 of 94 failing, every one an `AssertionError`, under the heavy lock. The root, app and edge typechecks pass at RED.
- [x] GREEN: Node 3, Workers 94 (four files, `ai.test.ts` among them).
- [x] 64 of 64 mutants killed by assertions in five batches. Every batch output is byte-identical to the planner's.
- [x] R100's fast gate:
  - the root, app and edge typechecks;
  - the 12 render files that use the AI fakes, 130;
  - the four routes tests 17;
  - `test:edge` (20 files, 206), `test:app` 37 and `test:unit` 1102;
  - `build:edge`;
  - `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs, with the whole workers suite.
- [ ] Independent review (Opus), and a second review (Sonnet): refunds and billing (P11), what each model is sent (P14), logging (P12) and the escalation rules (D25).
- [ ] SKIPPED: a live read against Anthropic (no keys locally); the hosted check of a dropped request is P6C's.

Closes #192 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

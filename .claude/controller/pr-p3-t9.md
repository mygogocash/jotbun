## Summary
- **P3-T9: Ask Bun asks Opus again in a fresh conversation.**
  - **`v1/ai/ask.ts` (new):** Ask Bun runs Haiku within 25 s. When Haiku's answer is ungrounded, declined or cut short, it starts Opus in a fresh conversation (the same first message, system and tools, and the rest of the deadline) (D28).
  - An outage never goes to Opus (P2, H7). A failed vault step never escalates (P3).
  - A turn the deadline never let start is `no_answer` and escalates. When no model can be asked in time, the answer is Bun's could-not-find line, with the use given back (P4, a receipt risk).
  - `escalated` is true whenever the question went to Opus (P7). Each failed or never-started call writes one `ai_fallback` line by class name only (P5).
- **Refunds (P2, P6, R116):**
  - The service calls `giveBack` once after every answer, including after an outage and on `{ paused: true }` (P3-T7's must-carry).
  - **R116 now lives in `shouldRefund` for every route:** a request whose last call was never sent gives the use back only when no call before it answered.
  - Parse and the note are unchanged. For the slip, "Haiku answered, then Opus never started" is now spent. The controller accepted that reach.
- **The figures (P8, P9):** each gains a `count` and a `scope`, and the phone checks them exactly. **Client minimum `AI_MIN_CLIENT_VERSION` 0.2.0**, since an older app refuses the new keys.
- **Carried from P3-T8's reviews (P14):**
  - an impossible model date (`2026-10-32`, `0000-00-00`) no longer crashes a slip read: `isRealDate` gets a NaN guard, `readOnce` reads a throw as unusable, and Opus re-reads;
  - the refund after an unusable Haiku answer and an Opus outage;
  - one shared `draftChoices`, with the archived filters pinned;
  - the pins MC, MJ, MO3 and MA, and the NaN-token clamp;
  - `service.ts`'s header, and the second refund-after-billing path in `receipts/P3-T8.md`.
- **Also carried:** P3-T7's PR3, PK and R116 (PR4, rebuilt from the review's words and logs; P15), and P3-T6's X1 and X2 (`model: 'rules'` on every plain-figures answer).
- **The controller accepted the planner's calls P1 to P16.**
  - Planned on Claude Opus (on `b1ca3bfb`, after #454 and #457), built on Claude Haiku 5.5.
  - The controller checked the commit: all 20 `real/` files are byte-identical.
  - The receipt is its own file under R87: `docs/implementation/receipts/P3-T9.md`.
  - No package, lockfile, route, Cloudflare resource or database change.

## Test plan
- [x] RED: phone 3 of 4, edge Node 6 of 46, Workers 26 of 126, every one an `AssertionError`, under the heavy lock. The root, app and edge typechecks pass at RED.
- [x] GREEN: phone 4, edge Node 46, Workers 126.
- [x] 79 of 79 mutants killed by assertions in six batches, each byte-identical to the planner's.
- [x] R100's fast gate:
  - the root, app and edge typechecks;
  - the 12 render files that use the AI fakes, and the four routes tests;
  - `ai-gate.test.ts`;
  - `test:edge`, `test:app` and `test:unit`;
  - `build:edge`;
  - `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs, with the whole workers suite.
- [ ] Independent review (Opus), and a second review (Sonnet): refunds (R116's reach, P6), what each model is sent, the escalation rules (D28), the figures' new keys, and the P3-T8 carries.
- [ ] SKIPPED: live calls to Anthropic (no keys locally).

Closes #193 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## Summary
- **P3-T6: Haiku first, and AI results that name their model.**
  - Bun's calls go to Claude Haiku 5.5 first (`apps/edge/src/v1/ai/models.ts`), and every AI result names the model whose words are shown (H4) and whether it escalated.
  - The contract (`packages/contracts/src/v1/ai.ts`) orders the models and pins both request bases. It also sets the phone's waits, which outlast each route's deadline.
- **Deadlines** (P4): each route's deadline starts first thing in its service method, before its first vault step, on the service's own clock. Ask Bun's turns are capped by `HAIKU_ASK_CAP_MS`, and the slip's Haiku call is not capped in this task (P7, as the plan's routing line says).
- **The phone** (`aiResources.ts`, P12) checks that a result names a known model and carries a boolean `escalated`, and refuses any other.
- **Carried from the P3-T4 review** (P5): three fake-clock cases in `ai-routing.test.ts` hold its survivors R1, R3, R4 and n2. They are written to stay true after P3-T7, P3-T8 and P3-T9.
- **Outside the plan's file list** (P2): `companionSections.tsx` and the `AskBunScreen`, `BunNote` and `TellBunSheet` render tests take type-only fixture edits for the new required fields. `ai.test.ts`'s env case loses `AI_MODEL`, which leaves `V1Env` (P3).
- **Left alone:** `analytics/events.ts` (P3-T18 owns `AiModelName = AiModel`, P11) and `src/server/env.ts`'s `AI_MODEL` (for a clean-up task, P10).
- **It started after #420 (P3-T2) merged**, whose `ai.ts` and `index.ts` it builds on (P1).
- **The controller accepted the planner's calls P1 to P13.**
  - Planned on Claude Opus, built on Claude Haiku 5.5.
  - The controller checked the commit: 20 of 21 `real/` files are byte-identical. The receipt adds only "as accepted by the controller".
  - The receipt is its own file under R87: `docs/implementation/receipts/P3-T6.md`.
  - No package, lockfile, route or database change.

## Test plan
- [x] RED, every failure an `AssertionError`:
  - contracts 3 of 3;
  - phone 2 of 2;
  - workers 7 of 50 (the hang case failed at 6,042 ms against its 4,000 ms bound).
- [x] GREEN: contracts 3, phone 2, workers 50.
- [x] 30 of 30 mutants killed, all by assertion. Every workers run and the mutant run took the heavy lock.
- [x] R100's fast gate:
  - `typecheck`, `typecheck:app` and `typecheck:edge`;
  - `test:edge` (19 files, 195), `test:app` 35 and `test:unit`;
  - `build:edge`;
  - the AI render suites 21, the five fake-resources files 37, the routes tests 12;
  - `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs, including the full workers suite and the database suites.
- [ ] Independent review (Opus), and a second review: model routing and its deadlines.
- [ ] SKIPPED: none beyond R100's whole suites, which CI runs.

Closes #190 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

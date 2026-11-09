## Summary
- Adds the trip, settings and rates contracts (P5-T3): `packages/contracts/src/v1/trips.ts`, `settings.ts` and `rates.ts`, with strict validators in the style of P4-T1's contracts. It also adds `trip` and `settings` as sync entities after `slip_inbox`. The shapes match P5-T4's merged vault tables, and the arithmetic uses P5-T1's currency module.
- R83 (controller): the API's sync parity assertion now also leaves out `trip` and `settings`. The plan anticipated this when P4-T1 left out `slip_inbox`. It is the only `apps/api` change.
- The receipt is its own file under R87 (`docs/implementation/receipts/P5-T3.md`). It lists the planner's 14 calls, chiefly:
  - the 1970 date floor;
  - the trip length counted back from `ends_on`, so the check never asks `addDays` for a date past 9999;
  - phone readers become strict about `trip` and `settings` changes. P5-T9's trip snapshot must therefore have exactly the eight `TripDto` keys, and P5-T13's settings snapshot exactly its three.
- No owner decision is needed. It follows the plan's defaults (Q6, Q11, X5, X17).

## Test plan
- [x] RED 9 of 9 on typed stubs. GREEN 9 of 9. 48 of 49 mutants killed; M46 is equivalent.
- [x] Typechecks for contracts, API, edge and app. `test:edge` 171, `test:api` 981, `contracts.spec` 95, API build, release graph, `test:app` 29, `test:unit` 832, workers 371 plus 3 todo, `build:edge`.
- [ ] CI on this pull request is green. The parity assertion runs only in CI's `test:db`, because Docker is stopped locally.
- [ ] Independent review.

Closes #236 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

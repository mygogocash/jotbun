## Summary
- Proves that the vault Worker, running in workerd, answers the plan's parity money session the way NestJS does (1A-T9). It adds a shared 49-step money session (`test/support/money-session.ts`), a harness that starts the built vault Worker (`test/support/vault-worker.ts`, which 1B-T12 extends later) and `test/vault-parity.db.test.ts`. That test runs the same session against NestJS and against the vault and compares normalized answers byte for byte, including whole summary bodies.
- `parity.db.test.ts` now uses the shared session. `vault-route-coverage.test.ts` gains a guard that no route is left pending.
- **Fix round (ruling R92).** CI's first real NestJS comparison differed at steps 44 and 45 (sync) in key order only: NestJS keeps change snapshots in a PostgreSQL `jsonb` column, which stores keys shortest first, then bytewise, while the vault served them in build order. Statuses and values matched on all 49 steps. The vault now serves each snapshot in jsonb order through a new `jsonbOrder` in `apps/edge/src/vault/reads/sync.ts`. That is the one source change; the normalizer and the session are unchanged, as the plan requires. Two new sync cases pin the order, and the summary's golden-month case now pins the category order (`ORDER BY t.type, t.category_id`).
- The receipt is its own file under R87, `docs/implementation/receipts/1A-T9.md`.

## Test plan
- [x] Local smoke against the built vault Worker in workerd, without a database and never committed. RED with KV seeding stubbed: 2 failed, 28 of 49 statuses differ. GREEN: 2 passed in 5 runs.
- [x] First round: 5 of 5 mutants killed (wallet create answers 200, missing `x-content-type-options`, no KV seeding, the forwarder drops the query, a route left pending).
- [x] Fix round: 5 of 5 mutants killed (no `jsonbOrder` in `changeOf`, no nested ordering, no length rule, `category_id DESC`, `type DESC`).
- [x] `typecheck:edge`, `test:edge` 172, `test:edge:workers` 373 passed plus 3 todo, `build:edge`.
- [x] The reviewer reproduced the CI difference and saw the full comparison pass with the fix against a local PostgreSQL 16.
- [ ] CI's database job (`test:edge:db`) is green, including `vault-parity.db.test.ts`.
- [ ] Confirming review of the fix round.

Closes #103 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

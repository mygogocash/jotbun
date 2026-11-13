## Summary
- **P4-T2: the catalog database, holding bank albums and merchant patterns, and the bank-album route.**
  - **The `jotbun-catalog` D1 database (D33):**
    - migrations `migrations/catalog/0001_catalog.sql` (the plan's tables, character for character) and `0002_catalog_seed.sql` (the plan's draft seed, Q8);
    - bound as `CATALOG_DB`, declared once in `wrangler.jsonc` (P3) with a local placeholder id, as `AUTH_DB` and `ERASURE_DB` are.
  - **`src/catalog/catalog.ts`:**
    - the bank albums, ordered in SQL and filtered by `isThaiBankKey`;
    - `merchantKey`: NFC first, then `\p{Nd}` digits and ASCII lower case, the same as SQLite's `lower()` (P7);
    - `matchMerchant`: the longest key wins, the first listed wins a tie, and a Latin pattern matches whole words (P8);
    - `merchantPatterns`: one list per isolate and per binding. A failed read is tried again on the next call (P9).
  - **The route (P6):** public, a Worker route, added, with no gate and no release.
    - Its ETag is the hex SHA-256 of the body it sends.
    - `If-None-Match` matches weak tags and lists, so a proxy-weakened tag still gets a 304. This follows P5-T17's review note for P5-T6.
- **Beyond the plan's file list (P4):** `src/cloudflare-workers.d.ts` declares `CATALOG_DB` and the test migrations; without it `typecheck:edge` fails with 11 errors. `c1-shape.test.ts` pins the bindings and the catalog's folder (P12). The coverage case's exact list of added routes moves to the new case, now six (P11).
- **The controller accepted the planner's calls P1 to P15.**
  - Planned on Claude Opus (on `ab350e48`, #457's merge), built on Claude Haiku 5.5.
  - The controller checked the commit: 14 of 15 `real/` files are byte-identical. The receipt adds one line, the skipped installs.
  - The receipt is its own file under R87: `docs/implementation/receipts/P4-T2.md`.
  - No package, lockfile or app change.
- **Owner's call before any deploy (D33):** create the D1 database `jotbun-catalog` with the `apac` hint, and apply `migrations/catalog`. Nothing waits on it; the code runs under Miniflare and `wrangler dev`.

## Test plan
- [x] RED: Node 2 of 14 and Workers 10 of 10 failing, every one an `AssertionError`, under the heavy lock. RED leaves out the route and the binding (P5).
- [x] GREEN: Node 14, Workers 10, and the neighbour files 168: the `Proxy`-double files, `files-front-door`, `front-door`, `server-events` and `auth/schema`.
- [x] 70 of 70 mutants killed by assertions (SQL 8, code 42, Node 20), the plan's five among them. Every batch's output is identical to the planner's.
- [x] R100's fast gate:
  - `typecheck:edge`;
  - `test:edge` (215);
  - `build:edge` (the built `wrangler.json` binds `CATALOG_DB`);
  - `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs, with the whole workers suite. Note: GitHub Actions is queued org-wide.
- [x] Independent review (Opus): **approved** on `4e95b987` (`.claude/controller/reviews/P4-T2.md`), with no blocker or major. Its m1: the whole-word rule was unheld at a word's start and beside Thai (MY1 and MY2 survived).
- [x] **The controller added m1's three rows, `19ef67fb` (test-only):** `SUPERMAKRO` and `ร้าน Makrobiotic` match nothing, and `ร้าน MAKRO บางนา` is shopping. `catalog.test.ts` passes 10 of 10 under the heavy lock, and MY1 and MY2 are each killed on an assertion (`.claude/controller/scratch/p4-t2-m1/`). Nits n1 to n3 are carried in `followups.md`.
- [ ] The reviewer's confirmation of `19ef67fb`.
- [ ] SKIPPED: the hosted D1 database (the owner's resource).

Closes #210 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

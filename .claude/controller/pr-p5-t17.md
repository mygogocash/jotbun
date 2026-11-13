## Summary
- **P5-T17: the app's client for trips, today's rates and the home currency.**
  - **`api/client.ts`:** conditional reads, where a 304 counts as `NOT_MODIFIED` only for a read that sent `ifNoneMatch`, and `etag` reports only the ETag of a 200 whose body passed its check.
  - **`spend/v1/resources.ts`:** trips, today's rates and the home currency. `setHomeCurrency` matches its acknowledgement by command only, because the server makes the settings id, and sends If-Match only when a version is known.
  - **`ratesCache.ts` (new):** `refreshRates` never rejects, and never overwrites the cache when a request fails or answers unchanged.
  - **The fake (`fakeResources.ts`):** copies P5-T9's overlap rule and P5-T12's summary rules, and answers 503 until a test calls `setRates`. It has its own `fakeResources.test.ts`, beyond the plan's file list. It now imports `client.ts` with its extension, so Node's test runner can load it.
- **Built on P5-T2** (#436): its validators and money keys. The server routes (P5-T6, T9, T12, T13) are not built yet, so the client follows the plan's route rules and is tested against `resources.test.ts`'s local server.
- **Carried:** followups line 726, P5-T2's second review m3, as four refusal tests in `diaryRepository.test.ts`. A pending choice or draft holding a money key is still refused; P5-T18a turns the draft ones into positive cases.
- **Exact money only:** BigInt minor units, in each currency's own minor units.
- **The controller accepted the planner's calls P1 to P15.**
  - Planned on Claude Opus, built on Claude Haiku 5.5.
  - The controller checked the commit: 9 of 10 `real/` files are byte-identical. The receipt differs only in its base SHA (`87a37080`, a controller-state sync).
  - The receipt is its own file under R87: `docs/implementation/receipts/P5-T17.md`.
  - No package, lockfile, route, edge or database change.

## Test plan
- [x] RED: 13 of 71 failing, every one an `ERR_ASSERTION`, with no module errors. `typecheck:app` passes at RED.
- [x] GREEN: 71 of 71.
- [x] 96 of 96 mutants killed, each by the case it names and only by assertions. The plan's two and the P5-T2 review's O18 and O19 are among them.
- [x] R100's fast gate:
  - `typecheck:app`;
  - `test:app` 37 and `test:unit` 1101;
  - the four routes tests 17;
  - the two render files built on the fake, 41;
  - `git diff --check`.
- [x] CI at `3f5670a9`: 9 of 9.
- [x] Independent review (Opus) and second review (Sonnet): **both approved** on `3f5670a9` (`.claude/controller/reviews/P5-T17.md`, `reviews/P5-T17-second.md`), with no blocker or major. Their minors (a 304 after a session change unpinned, the fake's `updateTrip` merging an `undefined` key, two fake rules unpinned, the draft refusals pinned for two of seven money keys, an ETag that is not a header value) are carried in `followups.md` to the tasks that next edit these files.
- [ ] SKIPPED: the phone's conditional read against a deployed Worker (until P5-T6 exists).

Closes #250 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## Summary
- **P3-T5: the Bun AI emitters and the draft review.** Six emitters in `analytics/events.ts`, one per event:
  - `trackAiConsentChanged`;
  - `trackTellBunSent`;
  - `trackAiDraftReviewed`;
  - `trackAskBunAsked`;
  - `trackAskBunRated` (helpful is `kept`, not helpful is `dropped`, H16 and A18);
  - `trackAiUnavailable`.
  - Also: `trackRecordSaved` gains `hasPhoto` (`has_photo`), and `AiModelName` and `DraftOutcome` are exported.
- **Privacy (§7, R23 to R25, B6, H8):** no event carries an amount, a note, a merchant, a draft id, prompt text or model words.
  - `fields_edited` is a whole number clamped to 0..20.
  - `ai_unavailable` takes only a reason class and a route pattern; the catalog's allow-list drops anything else.
- **The draft review** (`spend/v1/ai/draftReview.ts`, pure):
  - `fieldsEdited` counts the changed fields, with empty and null treated as the same;
  - `savedOutcome` gives kept or edited;
  - `reviewDraft` sends the event first, then the tally. A tally failure never fails a review.
- **`useDraftReview()`** returns a stable callback.
  - In a development build it also counts each outcome in a dev-only tally (`dev/draftTally.ts`, key `jotbun.dev.draft-tally`), through a guarded dynamic `import()`.
  - A release build folds `__DEV__` to false and drops the tally entirely; the planner proved this with a Metro release transform (P6). P3-T22 checks the bundles for the key.
- **The tally** keeps counts per model only. Its reads and writes run through one queue, so parallel saves (P3-T18's batch) cannot race. A corrupt store is reset.
- **`events.ts` is shared with P3-T2** (`RecordSource`, one line). The controller proved the 3-way merge clean in either order, with the same result.
- **The controller accepted the planner's calls P1 to P8.**
  - Planned on Claude Opus (finished on Gemini 3.8 Flash after Claude's weekly limit), built on Gemini 3.8 Flash.
  - The controller checked the commit: all 8 `real/` files are byte-identical.
  - The receipt is its own file under R87: `docs/implementation/receipts/P3-T5.md`.
  - No package, lockfile, route, screen, edge or database change.

## Test plan
- [x] RED: 15 Node cases and 1 render case failing, every one an `AssertionError`, with no load or type errors.
- [x] GREEN: `events.test.ts` 6, `draftReview.test.ts` 5, `draftTally.test.ts` 5, `useDraftReview.render.test.tsx` 1.
- [x] The four routes tests: 11 of 11.
- [x] 44 of 44 mutants killed:
  - every emitter's allow-list and clamp (E1 to E15);
  - the review rules (R1 to R10);
  - the hook (U1 to U5);
  - the release folding (F1, F2);
  - the tally (D1 to D12).
- [x] R100's fast gate: `typecheck:app`, `test:app` 34, `test:unit` and `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs, including the full render suite, `export:web` and the iOS export.
- [ ] Independent review (Opus), and a second review: every event's properties against the allow-list, and the tally's absence from release bundles.
- [ ] SKIPPED: the release-bundle check for the key (P3-T22 adds it).

Closes #189 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

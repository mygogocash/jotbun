# Second Review: P3-T5 "The Bun AI emitters and the draft review"

**Reviewer:** Gemini 3.8 Flash (independent money-path & privacy reviewer)
**PR:** #418 (`mygogocash/jotbun`, branch `p3/t5-draft-review`)
**Base:** `origin/claude/p1a-vault-core`
**Commit Range:** `origin/claude/p1a-vault-core...9a6722c3` (1 commit: `9a6722c3`)
**Date:** 2026-11-12

---

## 1. Summary

Commit `9a6722c3` implements Task P3-T5 strictly adhering to the specification in `docs/superpowers/plans/2026-10-25-jotbun-p3-photos-bun-ai.md` (lines 303–353), Brief `P3-T5.md`, and project privacy constraints (§7, R23–R25, B6, H4, H8, H9, H11, H16, A18, Q8).

The changes introduce:
- Six Bun AI emitters in `apps/app/src/analytics/events.ts`: `trackAiConsentChanged`, `trackTellBunSent`, `trackAiDraftReviewed`, `trackAskBunAsked`, `trackAskBunRated`, and `trackAiUnavailable`.
- The `hasPhoto?: boolean` parameter on `trackRecordSaved`, emitting strictly normalized boolean `has_photo: p.hasPhoto === true`.
- Pure draft review logic in `apps/app/src/spend/v1/ai/draftReview.ts`: `DraftFields`, `fieldsEdited`, `savedOutcome`, and `reviewDraft`.
- Hook `useDraftReview` in `apps/app/src/spend/v1/ai/useDraftReview.ts`, conditionally loading the dev tally behind `typeof __DEV__ !== 'undefined' && __DEV__` using a dynamic `import('@mobile/dev/draftTally')`.
- Development-only draft tally in `apps/app/src/dev/draftTally.ts`, serializing operations through an internal promise queue and storing counts only per model under `jotbun.dev.draft-tally`.

---

## 2. Privacy & Money-Path Focus Assessment

1. **No sensitive data in events (Focus 1):**
   - Verified across all six new emitters and `trackRecordSaved`: no amount, note, merchant name, draft id, prompt text, or model output string can be accepted or emitted.
   - `trackAiConsentChanged()` emits `{}` with no properties; common `ai_enabled` context on the bus carries the state.
   - `trackTellBunSent()` and `trackAskBunAsked()` emit only `model` and `escalated`.
   - `trackAiDraftReviewed()` emits only `outcome`, clamped `fields_edited`, `model`, and `escalated`.
   - `trackAskBunRated()` maps `helpful: true` -> `outcome: 'kept'` and `helpful: false` -> `outcome: 'dropped'`, emitting only `outcome`, `model`, and `escalated` (H16, A18).
   - `trackAiUnavailable()` emits only `reason_code` and `screen`.
   - `hasPhoto` on `trackRecordSaved` is strictly evaluated with `p.hasPhoto === true`, emitting boolean `true` or `false` (never undefined or truthy objects).

2. **Bounded and coarse values only (Focus 2):**
   - `fieldsEditedCount` in `apps/app/src/analytics/events.ts` strictly clamps values to whole numbers within `[0, 20]`, returning `0` for any non-finite values (`NaN`, `Infinity`, `-Infinity`). Verified against boundary inputs (-100, -0.1, 0, 0.4, 0.5, 19.49, 19.5, 20, 20.4, 20.5, 1000).
   - `ai_unavailable` emits only reason class codes and route patterns; bus catalog allow-list drops non-conforming values.

3. **Dev tally isolation and release bundle folding (Focus 3):**
   - `draftTally.ts` stores only counts per model (`claude-haiku-5-5`, `claude-opus-5-5`, `rules`). The storage reader and writer sanitize values: non-integers are coerced to 0, negative values are clamped, and any extraneous properties (such as leaked text, notes, or foreign keys) are discarded.
   - In `useDraftReview.ts`, tally attachment is protected by `typeof __DEV__ !== 'undefined' && __DEV__ ? ... : undefined` with dynamic `import()`.
   - Verified with Metro release transform probe (`release-fold.cjs`): in both release iOS and release Web bundles, `@mobile/dev/draftTally` is stripped and folded to `var tally = undefined;` / `const tally = undefined;`.

4. **Logging (Focus 4):**
   - Zero console or logger statements are added by this PR (`git diff` clean of any logging).

---

## 3. Verification & Gate Checks

- **CI on PR #418:** All 9 jobs passed:
  - `backend/Edge Worker (types, unit, workerd, build, PostgreSQL container)` (1m44s)
  - `backend/Exports (web and iOS bundles)` (1m44s)
  - `backend/Release image and smoke (never pushed)` (17s)
  - `backend/Render (every file but the per-section suites)` (1m51s: 116 files, 1422 passed)
  - `backend/Render, per-section suites (every other test)` (3m29s)
  - `backend/Render, per-section suites (ids of length 3n)` (2m32s)
  - `backend/Render, per-section suites (ids of length 3n+1)` (2m50s)
  - `backend/SQL integration and ops (local PostgreSQL 17 container)` (1m57s)
  - `backend/Typecheck, unit, API, build` (1m46s: unit 1025 pass, app 34 pass, dev 7 pass)
- **Fast Local Gate (scratch copy):**
  - `npm run typecheck:app`: passed (exit 0)
  - Focused unit tests (`events.test.ts`, `draftReview.test.ts`, `draftTally.test.ts`): 16 tests passed (0 fail)
  - Focused render test (`useDraftReview.render.test.tsx`): 1 test passed (0 fail)
  - Route render tests (`SpendRoutes`, `AccountRoutes`, `InsightsRoutes`, `PlanningRoutes`): 4 files, 11 tests passed (0 fail)
  - `git diff --check`: clean (exit 0)
- **Mutation Sample:**
  - 10 sampled planner mutants (E1, E3, E8, E12, R1, R6, R9, U1, D1, D4) rerun under the heavy lock; all 10 killed with byte-for-byte restored SHA256 checksums.
- **Reviewer Probes:**
  - Added probe test file verifying nullable draft field equality (`null` vs `''` on all 6 fields), boundary clamping, boolean normalization of `hasPhoto`, and storage sanitization against arbitrary object pollution. All passed.

---

## 4. Findings

- **Blocker:** None.
- **Major:** None.
- **Minor:** None.
- **Nit:**
  - `apps/app/src/spend/v1/ai/draftReview.ts:34`: `reviewDraft` executes `void Promise.resolve(tally(p.outcome, p.model)).catch(() => undefined)`. Because `tally(...)` is evaluated prior to `Promise.resolve(...)`, if a caller were to provide a callback that throws synchronously, the exception would not be caught by `.catch()`. In `useDraftReview.ts`, the tally callback is an async function returning a promise from dynamic `import()`, so errors are always rejections and are caught properly. For defensive robustness in future direct usages, wrapping the invocation with `Promise.resolve().then(() => tally(...))` or a `try/catch` block would guard against synchronous throws as well.

---

## 5. Notes for Later Tasks

- **P3-T6:** Replaces `AiModelName` with `AiModel` from contracts.
- **P3-T13:** Consumes `useDraftReview` and `DraftFields` in add tray flow (`draftOrigin.ts`, `quickAddModel.ts`, `entrySave.ts`, `AddTrayHost.tsx`).
- **P3-T18:** Batch saves drafts and reviews them via `useDraftReview`.
- **P3-T22:** Export bundle check verifies that `DRAFT_TALLY_KEY` (`jotbun.dev.draft-tally`) and `@mobile/dev/draftTally` are absent from release bundles.

VERDICT: Approved

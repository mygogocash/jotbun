## Summary
- **P3-T13: the add tray records how each record was made, and reviews every AI draft once.**
  - **`wallet/add/draftOrigin.ts` (new):** the entry's origin, either `typed`, `tell_bun` (P2's sheet) or the AI draft's own source, and `draftFieldsOf`, the review's original (P6).
  - **`AddTrayHost.tsx`:** `applyAiDraft` reaches the open entry through a ref the entry rewrites after every draw (P4). It fills through the sheet's own `fill`, so R117's private-mode rules apply to an AI draft too, and it never moves the step.
  - **Each AI draft gets one review (P7):** `kept` or `edited` when saved, after the device commit or the acknowledgement; `dropped` when the tray closes unsaved or a new draft replaces it.
    - The pending review is cleared before it is sent, so a double `onSaved` sends nothing more.
    - A host that goes away with its tray open sends nothing (R119's lesson).
  - **No AI draft lands on a save in flight (P8):** while saving, unconfirmed or in conflict, `applyAiDraft` takes nothing.
- **The record's `source` (P5, H9):** the save passes the origin's source on the create, on the device entry and on `record_saved`. `buildQuickAdd` puts `source` last and only when given, so the legacy Quick add and every existing parity row send the JSON they always did, and a resend's command key is unchanged. Followups line 785's "`tell_bun` only while a Bun guess stands" rule is gone.
- **Privacy (P11):** no new text is drawn. `record_saved` and `ai_draft_reviewed` carry only the allow-list's properties (`source`, `has_photo`; `outcome`, `fields_edited`, `model`, `escalated`), and a case checks that no amount, place, note or wallet name reaches analytics.
- **Carried:**
  - followups line 607 m1: the tally call in `draftReview.ts` is wrapped in try/catch and stays synchronous;
  - m2: the host reaches the tally only through `useDraftReview`;
  - line 785.
  - Line 637's edge pins are a separate task, source-pins (P9).
- **The controller accepted the planner's calls P1 to P16.**
  - Planned on Claude Opus, built on Claude Haiku 5.5.
  - The controller checked the commit: all 10 `real/` files are byte-identical.
  - The receipt is its own file under R87: `docs/implementation/receipts/P3-T13.md`.
  - No package, lockfile, route, edge or database change.
- **Release (P10), the owner's call:** this is the first build whose add tray sends a `source`. A 0.1.0 build refuses a synced record carrying one, so the server's client minimum must be at least `0.2.0` before this ships. `app.json` already reads 0.3.0.

## Test plan
- [x] RED: Node 3 of 17 and render 7 of 38 failing, every one an assertion, matching the planner's lists.
- [x] GREEN: Node 77 (nine files), render 38.
- [x] 48 of 48 mutants killed, every failing case an `AssertionError`. The output is identical to the planner's. The plan's H1 and H2 are among them.
- [x] R100's fast gate:
  - `typecheck:app`, `test:app` 37 and `test:unit` 1112;
  - the eight kit files 142;
  - the four routes tests 17;
  - the other neighbours 123;
  - the catalogue's `bw-` sections 110;
  - `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs.
- [ ] Independent review (Opus), and a second review (Sonnet): the review sent once, the source on the wire (P5), what reaches analytics (P11), and a draft during a save (P8).
- [ ] SKIPPED: none new on a device (no new screen or gesture).

Closes #197 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

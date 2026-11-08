## Summary
- Each weekday's reminder now has its own words from Bun, approved by the owner on 24 October, in English and Thai (`notifications/reminderWording.ts`). A daily trigger repeats one text, so the reminder service schedules one weekly reminder per chosen day. `scheduleDaily` is gone from the port, and the old daily reminder's id is still cancelled, so an earlier install keeps no duplicate.
- The Reminders screen's preview shows the next reminder the person gets (`previewDay` in `remindersModel.ts`): today's when today is a chosen day, otherwise the next chosen day, wrapping past Sunday. **Owner, please check this rule.** The earlier session left this one function as `TODO(owner)`, and the tests pinned only "every day chosen on a Tuesday shows Tuesday's". The controller filled in the "next reminder" rule and a unit test; change it if you want another rule.
- This work was uncommitted in the main checkout (`claude/premium-ai-edge`) and moved onto a fresh branch from the integration head, where it applied cleanly. Two Thai expectations had not been updated for the new wording (the Reminders screen test and the catalogue's `reminders-thai` section); they now expect Tuesday's Thai title.

## Test plan
- [x] `typecheck:app`.
- [x] `test:unit` 879 passed, including the new wording test and the `previewDay` test; `test:app` 32 passed.
- [x] `RemindersScreen.render.test.tsx` and the catalogue render tests: 532 passed in 5 files.
- [x] `git diff --check`.
- [ ] CI on this pull request is green, including the full render suite.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

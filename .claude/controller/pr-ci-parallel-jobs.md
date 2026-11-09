## Summary
- CI runs in nine parallel jobs, the owner's ask of 9 Nov to speed development up: `checks`, `exports`, `render`, `sections-1` to `sections-3`, `database`, `edge` and `image`. Every suite CI ran before still runs. The expected median wall time is about 4.4 minutes, against 10.4 measured on 8 recent runs.
- **The render suite:** one job runs every render file except the two per-section catalogue suites (`CatalogueScreen` and `screenReader`, one test per section, 386 to 393 s alone). Three jobs split those two by test name, using the section id's length modulo 3. The third pattern is the other two negated, so no test can run nowhere or twice. The workflow test pins that construction, and `vitest list` confirms it on the real names (162 + 196 + 218 = 576 at `857b9f2`).
- **The controller's amendment (1D-T8 review n5):** CI now runs `typecheck:routes` (in `checks`) and the iOS export (in `exports`, through a new `export:ios` script). R100 assumed CI already ran both. Both also join the handover's Full gate.
- No job or step can be switched off: the workflow test bans `if:` and `continue-on-error:` (1A-T10's minor 1). Each npm job stops after 20 minutes (45 before).
- **Cost (P11):** about 31 billable Actions minutes a run instead of 18, and 9 of the Free plan's 20 concurrent jobs a run. **The merge waits on the owner's answer about Actions minutes.**
- No app, edge, API or database code changes. README's CI paragraph lists the nine jobs. The receipt is `docs/implementation/receipts/ci-parallel-jobs.md`; its "After, measured" line comes from this PR's own CI.

## Test plan
- [x] RED: 9 tests, 4 pass, 5 fail (the five new or changed cases). GREEN: 9 of 9.
- [x] Each of the 19 workflow mutants fails exactly the expected cases. The control passes. A correct two-way split, which is not a mutant, fails only the exact-layout case.
- [x] The split on the real test names: `SPLIT OK` (108 render files; parts 162, 196 and 218 of 576; none missing, none run twice).
- [x] The fast gate: the workflow test, `typecheck:app`, `typecheck:routes`, `test:app` 34, `test:unit` 927, a YAML parse (actionlint is not installed), and `git diff --check`.
- [ ] This PR's CI: nine jobs green. The iOS export passes its first Linux run, and the render total adds up (the `render` job plus the three `sections-*` jobs equal the full suite).
- [ ] The measured wall time added to the receipt.
- [ ] Independent review.
- [ ] The owner's go-ahead on Actions minutes.

No task issue: a follow-up task the owner asked for on 9 Nov.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

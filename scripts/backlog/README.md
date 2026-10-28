# Backlog scripts

These scripts turn the implementation plans in `docs/superpowers/plans/` into the task graph, the execution plan in `docs/implementation/2026-10-25-execution-plan.md`, and the GitHub backlog (milestones, epics, task issues, sub-issues, blocked-by links and the "Jotbun v1 build" project). They need Python 3.9 or later and the GitHub CLI signed in with the `repo` and `project` scopes; they use no packages.

| Script | What it does |
| --- | --- |
| `resolve_caps.py OUT_DIR PLAN...` | Replaces each cross-plan capability id (for example `P3:slip-read`) with the task that delivers it (`**Delivers:**`), and reports a capability delivered by no task or by two. Writes copies; edits nothing in place. |
| `backlog.py parse PLAN_DIR TASKS.json` | Reads every `### Task` heading with its `Starts after`, `Delivers` and `Files` lines. Plan 1A's order comes from ruling R7, which splits its Task 8 into T8a and T8b. |
| `backlog.py plan TASKS.json STATUS.json OUT.md [TASKS_OUT.json]` | Adds each task's state from `STATUS.json` (Done, In review, In progress), then computes waves, the tasks ready now, the critical path, the hot shared files and the owner gates, and writes the execution plan. |
| `epics.py PLAN_DIR TASKS.json EPICS.json` | One epic per plan, from its Goal line and its phase's proof. |
| `gh_backlog.py TASKS.json STATUS.json EPICS.json STATE.json STEP [--apply]` | Creates or updates the GitHub backlog. STEP is `setup`, `issues`, `links`, `project`, `finish` or `all`. Without `--apply` it only prints what it would do. Every issue carries a hidden marker, so a second run updates instead of duplicating; `STATE.json` (committed as `docs/implementation/backlog-map.json`) records each issue's number and id. |

To refresh the board after merges, update `STATUS.json` (each merged task becomes `{"state": "Done", "pr": N}`), then run `plan` and `gh_backlog.py ... project --apply` and `finish --apply`.

## Summary
- The owner is moving to another machine. Until now the build controller's state lived only in the main checkout's untracked `.claude/` folder. It now travels with the integration branch so the next controller can carry on:
  - `.claude/controller/`: `handover.md` (it opens with a migration section listing every open PR and what it needs), `followups.md`, `protocol.md`, `held.txt`, briefs, reviews, PR texts, the helper scripts and the backlog data.
  - `.claude/skills/jotbun-controller/`: the controller loop, prompt templates, lessons and scripts (`ready_tasks.py`, `merge_task_pr.sh`, `open_task_pr.sh`, `ci_failures.sh`, `inflight_agents.py` and others).
  - `.claude/controller/scratch/1d-t6-planner/`: the verified kit 1D-T6's ready brief copies from (its SHA256SUMS all pass). The other 25 GB of scratch proof trees stay out.
- `.gitattributes` turns off whitespace checks for `.claude/controller/briefs/*.md`, because the briefs quote unified diffs whose blank context lines are a single space.
- Two older controller handovers that were untracked in the integration worktree are added under `docs/implementation/`.
- No app, edge, API or package code changes.

## Test plan
- [x] `git diff --check` on the staged change: clean with the new attribute.
- [x] No secrets: scanned for GitHub, Anthropic and AWS tokens, private keys and Slack tokens.
- [ ] CI on this pull request is green.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

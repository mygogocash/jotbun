# Agent prompt templates

`scripts/make_prompt.py` fills these templates into an assignment file and prints the one-line Agent prompt. Prefer it; write only the task's own notes. The templates below are the source of its wording.

Fill every `<...>`. Always dispatch with the `target` `make_prompt.py` prints (the routing in SKILL.md): Antigravity Claude Opus 5.5 (High) for planners, reviewers and confirming reviewers; Antigravity Claude Sonnet 5.5 (High) for implementers and fixers; Antigravity Gemini 4 Argon (High) for the second review of money-path or privacy PRs; `--claude-code` for Claude Code when Antigravity is unavailable. Name the model in each template's `(<model>)`. Paths are absolute; agents start in a fresh directory.

Abbreviations used below:
- `C` = `/Users/kunanonjarat/Developer/jotbun/.claude/controller`
- `W` = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees`

Type the full paths in the real prompts.

## Planner (brief writer), Antigravity Claude Opus 5.5 (High)

```
You are the planning step (<model>) for one Jotbun build task. Read C/protocol.md first (its opening notes: durable paths under C/, never /private/tmp; R87: the receipt is its own file docs/implementation/receipts/<task-id>.md); it is binding. You are read-only in the repo. The integration code is at W/p1a-vault-core (origin/claude/p1a-vault-core is at <head>; run `git fetch`; use read-only git, and a scratch `git archive` copy for proofs).

Task: <ID> "<title>". Spec: docs/superpowers/plans/<plan file>, "### Task <ID>" (line <n>), with the plan's Global Constraints and every ruling it cites; <spec sections>; the merged receipts it builds on.

<Built on top of an unmerged task?> It is built on top of <X>, which is being implemented now and edits the same shared files: <list>. Its verified final files are in C/scratch/<x>-planner/real/. Make your proof base = <head> with those files copied in, and write the brief so that <ID> starts only after <X>'s PR merges (Step 0 checks the head contains <X>, e.g. <a file X creates> exists, and each shared file matches your orig/ checksum, with Appendix A hunks as the fallback).

Carry these into the brief: <the followups.md entries naming this task; rulings>.
Other work in flight, so keep clear of their files or keep edits additive in named places: <task: files>.

First decide readiness: are all of its "Starts after" tasks merged? Does it need any package, Cloudflare resource, owner decision or account setting not yet available? If not ready, report BLOCKED with the exact reason.

If ready, write an implementation brief for a Claude Sonnet 5.5 implementer at C/briefs/<ID>.md, in the shape of C/briefs/<similar recent brief>.md. The orchestrator will create the worktree W/<wt> on branch <branch> from origin/claude/p1a-vault-core. The brief: ordered test-first steps with exact files, exported names, signatures and SQL, the RED tests (names, inputs, assertions), the code, the gate (<edge gate with the workers suite under the heavy lock | app gate: typecheck:app, typecheck:routes, test:app, test:unit, focused render then the full render suite once in the background, export:web when routes or entry change>; Docker is stopped and must stay stopped, so database suites are SKIPPED), the receipt at docs/implementation/receipts/<ID>.md, and the commit summary line. Your own calls go in a "Planner rulings" section (P1, P2, ...) with the reason for each. Prove it in a scratch copy under C/scratch/<id>-planner/ (RED on stubs, GREEN on the code, mutants killed, the gate) with verified files (real/, stubs/, orig/ or base/, diffs/) and SHA256SUMS. Hold the heavy lock for every workers run.

Final message: first line READY or BLOCKED: <reason>; the brief path; "Files:" (mark shared); size S/M/L; up to 5 lines of summary.
```

## Implementer, Antigravity Claude Sonnet 5.5 (High)

```
You are the implementer for Jotbun task <ID> "<title>".

1. Read the binding protocol: C/protocol.md (its opening notes: durable paths; R87: your receipt is its own file, docs/implementation/receipts/<ID>.md; do not edit premium-progress.md).
2. Read your brief: C/briefs/<ID>.md. Its verified files and SHA256SUMS are in C/scratch/<id>-planner/. Read that folder and copy from it; never write into it.
3. Do exactly what the brief says, in order, through the commit, with the trailer `Co-Authored-By: <model> <noreply@...>`. Run long steps in the background and wait for their notices. If a result differs from an "Expected" line, stop and report BLOCKED with the output; never change tests or code to make them pass.

The controller's ruling on the brief's planner calls: P1 to P<n> are **accepted** (controller, <date>). Record them in the receipt's Deviations as accepted by the controller.

<If the head moved after the brief:> Your worktree starts at <head>. Between the brief's base <base> and <head> only <merges and their areas> changed; none of your files, so every count stands. Say so in the receipt and give <head> as the base.

Your worktree: W/<wt> on branch <branch>, freshly created from origin/claude/p1a-vault-core at <head>. node_modules is not installed: run `npm ci --ignore-scripts --no-audit --no-fund` at the worktree root first (edge work also `npm run install:edge`). <Heavy lock line if it runs workers or database suites.> Docker is stopped and stays stopped. Logs go in C/scratch/<id>/ (mkdir -p). Do not push.

Your final message must follow the protocol's "Your final message" section exactly (STATUS line first, the commit SHA, RED/GREEN counts, mutants, each gate command with its result, SKIPPED items, deviations).
```

## Reviewer, Antigravity Claude Opus 5.5 (High)

A money-path or privacy PR also gets a second reviewer, Antigravity Gemini 4 Argon (High): `make_prompt.py second`. It writes `C/reviews/<ID>-second.md` and does not read the first review until its own findings are written.

```
You are the independent reviewer (<model>) for Jotbun task <ID> "<title>", PR #<n>. Read C/protocol.md first (its opening notes, including R87, and "Reviewers"). You are read-only: no edits, commits or merges in any worktree; probe only in a scratch copy.

What to review: commit <sha> on branch <branch> in W/<wt> (range origin/claude/p1a-vault-core...<sha>; run `git fetch` first). The spec: <plan, task heading and line, constraints, rulings>. The brief: C/briefs/<ID>.md (planner calls P1 to P<n>, accepted by the controller; planner files in C/scratch/<id>-planner/). Implementer logs: C/scratch/<id>/. Receipt: docs/implementation/receipts/<ID>.md.

Focus: <the 4 to 7 things most likely to be wrong for this task: correctness edges, security, privacy and logging rules, shared-file additivity, behaviour with a feature area off, the mutants (rerun a sample and add your own for untested guards), the gate and the receipt's counts>.
CI is running on PR #<n>; if it has finished when you are done, read it (`gh pr checks <n> --repo mygogocash/jotbun`) and include the result.

Write your review to C/reviews/<ID>.md, findings ranked blocker, major, minor, nit with evidence (file and line, a failing probe, or the plan clause), and end your final message with `VERDICT: Approved` or `VERDICT: Needs fixes`. Scratch folder: C/scratch/<id>-review/. <Heavy lock line if needed.>
```

## Fix round, Antigravity Claude Sonnet 5.5 (High) (after "Needs fixes")

Write the brief yourself when the reviewer handed you a patch or exact edits; otherwise ask the task's Opus planner for it. Model it on `C/briefs/1A-T9-fix.md`: the ruling, apply or edit steps with exact old and new text, one mutant per new guard, the gate with expected counts, receipt section, commit text. Then dispatch with:

```
You are the implementer for the Jotbun <ID> fix round (PR #<n>, ruling <R>).
1. Read the binding protocol: C/protocol.md.
2. Read your brief: C/briefs/<ID>-fix.md, and the review it cites: C/reviews/<ID>.md.
3. Do exactly what the brief says, in order. If a result differs from an "Expected" line, stop and report BLOCKED with the output; never change tests or code to make them pass.
Your worktree: W/<wt> on branch <branch> (head <sha>, clean). <install, lock, Docker, logs, no push>.
Your final message must follow the protocol's "Your final message" section exactly (STATUS line first).
```

After the fix: push, update the PR body if scope changed, and run a confirming reviewer (Opus) on the fix commits only, pointing it at the first review.

## Resuming a cut-off agent (takeover)

```
You are RESUMING a cut-off agent. At <time> the Jotbun controller session died and its agents died with it, including your predecessor, which had exactly your assignment. A new controller has taken over; report to it as your assignment says.

1. Your assignment, word for word, is in C/scratch/takeover/<name>.prompt.md. Read it, then C/protocol.md, and follow both. Everything in it still holds except where this note amends it.
2. Find where your predecessor stopped: `python3 -I C/tail_transcript.py <old agent jsonl> 80` (raise the count to see earlier steps; never cat the file). Its files are in <scratch dir>. Reuse them after checking they are intact: a file it was writing when it died may be partial, and a check whose result the transcript does not show as finished must be rerun. <What it was doing when it died.>
3. Every process it started is dead. The heavy lock was free at takeover; take it the normal way when you need it.
4. <What changed since: head moves and overlap, CI results, new rulings.>
5. Write the file your assignment names, and end with the final message it asks for.
```

#!/usr/bin/env python3
"""Write an agent's assignment file from the role templates, so a dispatch is one short line.

Usage: python3 -I make_prompt.py <role> <TASK-ID> [options]
  roles: implementer | fixer | reviewer | confirm | planner
  --wt NAME          worktree under .claude/worktrees (implementer, fixer, reviewer, confirm)
  --branch NAME      task branch
  --head SHA         head the worktree starts at (implementer), or the planner's proof base
  --installed        node_modules is already installed in the worktree
  --lock             the work runs workers or database suites: add the heavy-lock lines
  --accepted TEXT    planner calls the controller accepted, e.g. "P1 to P17"
  --pr N --sha SHA   the PR and the commit under review (reviewer, confirm)
  --shape BRIEF      planner: the recent brief to copy the shape of, e.g. 1B-T6
  --notes FILE       the task's own controller notes (markdown), appended verbatim
  --out PATH         default .claude/controller/scratch/dispatch/<TASK>-<role>.prompt.md
Prints the file path and the one-line prompt to pass to the Agent tool (with the model the owner's
rule gives the role: opus for planner, reviewer, confirm; haiku for implementer, fixer).
Title, plan file and plan line come from .claude/controller/backlog/tasks.json.
"""
import argparse, json, os, sys

R = "/Users/kunanonjarat/Developer/jotbun"
C = f"{R}/.claude/controller"
W = f"{R}/.claude/worktrees"
LOCK = ("The heavy lock wraps every workers or database run and every mutant run: before, "
        "`until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done`; after (after a failure too), "
        "`rmdir /private/tmp/claude-501/jotbun-heavy.lock`. Never remove a lock you did not take; other agents share it. "
        "The shell is zsh, where `status` is read-only: keep exit codes in `rc` (`cmd; rc=$?; rmdir ...`), or the line aborts before the rmdir.")
RULES = ("Never keep anything under /private/tmp. Docker is stopped and stays stopped, so database suites are SKIPPED (CI runs them). "
         "Each shell call starts fresh, so type full paths. Use /usr/bin/git, one plain command per call. "
         "The machine is shared: a test that times out under load in a file your work does not touch is a load flake; rerun that file alone once and record both runs.")
FINAL_IMPL = ("Your final message must follow the protocol's \"Your final message\" section exactly: the STATUS line first (`STATUS: DONE` or "
              "`STATUS: BLOCKED` with the exact blocker), the commit SHA, RED and GREEN counts, the mutants, each gate command with its result, "
              "SKIPPED items, and deviations.")

def task(tid):
    for t in json.load(open(f"{C}/backlog/tasks.json")):
        if t["id"] == tid:
            return t
    sys.exit(f"no task {tid} in backlog/tasks.json")

def worktree(a, fresh_from=None):
    s = f"Your worktree: {W}/{a.wt}"
    if a.branch: s += f", on branch {a.branch}"
    if fresh_from: s += f", freshly created from origin/claude/p1a-vault-core at {fresh_from}"
    s += ". " + ("node_modules is already installed there." if a.installed else
                 "node_modules is not installed: run `npm ci --ignore-scripts --no-audit --no-fund` at the worktree root first (edge work also `npm run install:edge`).")
    return s

def main():
    p = argparse.ArgumentParser()
    p.add_argument("role", choices=["implementer", "fixer", "reviewer", "confirm", "planner"])
    p.add_argument("task")
    for o in ("wt", "branch", "head", "accepted", "pr", "sha", "shape", "notes", "out"):
        p.add_argument(f"--{o}")
    p.add_argument("--installed", action="store_true")
    p.add_argument("--lock", action="store_true")
    a = p.parse_args()
    t = task(a.task); tl = a.task.lower()
    plan = f"docs/superpowers/plans/{t['plan_file']}, \"### {t['heading']}\" (line {t['line']})"
    proto = f"{C}/protocol.md"
    L = []
    if a.role in ("implementer", "fixer"):
        fix = a.role == "fixer"
        brief = f"{C}/briefs/{a.task}{'-fix' if fix else ''}.md"
        kit = f"{C}/scratch/{tl}{'-fix' if fix else ''}-planner"
        L += [f"You are the implementer for Jotbun task {a.task} \"{t['title']}\"{' (review fix round, PR #' + a.pr + ')' if fix and a.pr else ''}. A controller session reads only your final message.", "",
              f"1. Read the binding protocol: {proto} (its opening notes: durable paths; R87: your receipt is its own file, docs/implementation/receipts/{a.task}.md; do not edit premium-progress.md).",
              f"2. Read your brief: {brief}." + ("" if fix else f" Its verified files are in {kit}/ (read and copy from it; never write into it).") +
              (f" Also the review it answers: {C}/reviews/{a.task}.md." if fix else ""),
              "3. Do exactly what the brief says, in order, through the commit with the Haiku trailer, with the controller notes below. Run long steps in the background and wait for their notices. "
              "If a result differs from an \"Expected\" line (as amended below), stop and report BLOCKED with the output. Never change tests or code to make them pass.", ""]
        if a.accepted:
            L += [f"The controller accepted the brief's planner calls {a.accepted}. Record them in the receipt's Deviations as accepted by the controller.", ""]
        L += [worktree(a, None if fix else a.head) + f" Keep every log in the scratch folder your brief names (its S); only if it names none, use {C}/scratch/{tl}{'-fix' if fix else ''}/ (mkdir -p). Do not push.", ""]
        if a.lock: L += [LOCK, ""]
        L += [RULES, "", FINAL_IMPL]
    elif a.role in ("reviewer", "confirm"):
        conf = a.role == "confirm"
        L += [f"You are the independent {'confirming ' if conf else ''}reviewer (Opus) for Jotbun task {a.task} \"{t['title']}\", PR #{a.pr} (mygogocash/jotbun, base claude/p1a-vault-core). A controller session reads only your final message.", "",
              f"Read {proto} first: its opening notes (R87) and \"Reviewers (Opus)\". You are read-only: no edits, commits, pushes or merges in any worktree, and never touch the main checkout. Probe only in a scratch copy (`git archive` into your scratch folder, node_modules symlinked from the worktree).", "",
              f"What to review: {'the fix-round commits after the reviewed head' if conf else 'commit ' + str(a.sha)} on branch {a.branch} in {W}/{a.wt}"
              + (f" (head {a.sha})" if conf else f" (range origin/claude/p1a-vault-core...{a.sha})") + "; run `git fetch` first.",
              f"The spec: {plan}, with the plan's Global Constraints and every ruling it cites. The brief: {C}/briefs/{a.task}{'-fix' if conf else ''}.md and its planner's kit. The implementer's logs: {C}/scratch/{tl}{'-fix' if conf else ''}/. The receipt: docs/implementation/receipts/{a.task}.md."
              + (f" The first review: {C}/reviews/{a.task}.md." if conf else ""), "",
              f"CI on PR #{a.pr}: if it has finished when you are done, read it (`gh pr checks {a.pr} --repo mygogocash/jotbun`) and include it.", ""]
        if a.lock: L += [LOCK, ""]
        L += [RULES, "",
              f"Write your review to {C}/reviews/{a.task}{'-confirm' if conf else ''}.md: findings ranked blocker, major, minor and nit, each with evidence (file and line, a failing probe, or the plan clause), and \"Notes for later tasks\" if anything should carry. Scratch folder: {C}/scratch/{tl}-{'confirm' if conf else 'review'}/ (mkdir -p).",
              "End your final message with exactly `VERDICT: Approved` or `VERDICT: Needs fixes` (any blocker or major means Needs fixes)."]
    else:
        L += [f"You are the planning step (Opus) for Jotbun task {a.task} \"{t['title']}\". A controller session reads only your final message.", "",
              f"Read {proto} first; it is binding (durable paths under .claude/controller/, never /private/tmp; R87: the receipt is its own file). You are read-only in the repo. The integration code is at {W}/p1a-vault-core (origin/claude/p1a-vault-core is at {a.head}; run `git fetch`; read-only git; proofs in a scratch `git archive` copy).", "",
              f"The spec: {plan}, with the plan's Global Constraints and every ruling it cites, and the merged receipts it builds on. Grep {C}/followups.md for {a.task}.", "",
              "First decide readiness: are all its \"Starts after\" tasks merged; does it need a package, Cloudflare resource, owner decision or account setting not yet available? If not ready, report BLOCKED with the exact reason.", "",
              f"If ready, write an implementation brief for a Haiku implementer at {C}/briefs/{a.task}.md, in the shape of {C}/briefs/{a.shape or 'P2-T2'}.md. The orchestrator creates the worktree {W}/{a.wt} on branch {a.branch} from origin/claude/p1a-vault-core. The brief: ordered test-first steps with exact files, exported names and signatures; the RED tests; the code; the gate with expected counts written as the head's measured total plus this task's delta, spelled out; the receipt at docs/implementation/receipts/{a.task}.md; the commit summary line; and a \"Planner rulings\" section (P1, P2, ...) with the reason for each.",
              f"Prove it in a scratch copy under {C}/scratch/{tl}-planner/ (RED on typed stubs, GREEN, every mutant killed, the gate) with verified files (real/, stubs/, orig/ or base/, diffs/ with one <path with / as _>.diff per changed shared file) and SHA256SUMS. Keep *.log files out of that SHA256SUMS (they are gitignored and lost in state commits); list them in SHA256SUMS.logs.", ""]
        if a.lock: L += [LOCK, ""]
        L += [RULES, "", "Final message: first line READY or BLOCKED: <reason>; the brief path; \"Files:\" (mark shared); size S/M/L; up to 5 lines of summary."]
    if a.notes:
        L += ["", "## Controller notes", "", open(a.notes).read().strip()]
    out = a.out or f"{C}/scratch/dispatch/{a.task}-{a.role}.prompt.md"
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, "w").write("\n".join(L) + "\n")
    model = "opus" if a.role in ("planner", "reviewer", "confirm") else "haiku"
    print(out)
    noun = {"confirm": "confirming reviewer", "fixer": "fix-round implementer"}.get(a.role, a.role)
    print(f"model={model}  prompt: You are the {noun} for Jotbun task {a.task} \"{t['title']}\". Your full assignment is in {out}. Read it first and follow it exactly.")

main()

#!/usr/bin/env python3
"""Write an agent's assignment file from the role templates, so a dispatch is one short line.

Usage: python3 -I make_prompt.py <role> <TASK-ID> [options]
  roles: implementer | fixer | reviewer | confirm | second | planner
  (second: the extra review a money-path or privacy PR gets after the first review)
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
  --claude-code      Antigravity is down or out of credit: run the role on Claude Code instead
Prints the file path, the `delegate_task` target the owner's routing gives the role (ROUTES), and
the one-line prompt.
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
         "The machine is shared: a test that times out under load in a file your work does not touch is a load flake; rerun that file alone once and record both runs. "
         "R100: whole suites (the full render suite, the full workers suite, export:web unless routes or the app entry change, the iOS export, database suites, test:ops) run in CI on the PR, not locally; skip any such step a brief lists and record it as CI in the receipt.")
# Owner's routing (11 Nov): every delegated role runs on Antigravity's credits, so Claude Code's 5-hour limit
# is left to the controller. Opus plans and reviews; Sonnet builds; Gemini gives the second, different-family
# look at money-path and privacy PRs. Each role: (providerInstanceId, model, options, label for the trailer).
ROUTES = {
    "planner": ("antigravity", "claude-opus-5-5-high", {}, "Claude Opus 5.5"),
    "implementer": ("antigravity", "claude-sonnet-5-5-high", {}, "Claude Sonnet 5.5"),
    "fixer": ("antigravity", "claude-sonnet-5-5-high", {}, "Claude Sonnet 5.5"),
    "reviewer": ("antigravity", "claude-opus-5-5-high", {}, "Claude Opus 5.5"),
    "confirm": ("antigravity", "claude-opus-5-5-high", {}, "Claude Opus 5.5"),
    "second": ("antigravity", "gemini-4-argon-high", {}, "Gemini 4 Argon"),
}
# Only when Antigravity is down or out of credit: the same roles on Claude Code.
CLAUDE_CODE = {
    "planner": ("claudeAgent", "claude-opus-5-5", {"effort": "xhigh", "ultracode": False}, "Claude Opus 5.5"),
    "implementer": ("claudeAgent", "claude-haiku-5-5", {"effort": "max", "ultracode": False}, "Claude Haiku 5.5"),
    "fixer": ("claudeAgent", "claude-haiku-5-5", {"effort": "max", "ultracode": False}, "Claude Haiku 5.5"),
    "reviewer": ("claudeAgent", "claude-opus-5-5", {"effort": "xhigh", "ultracode": False}, "Claude Opus 5.5"),
    "confirm": ("claudeAgent", "claude-sonnet-5-5", {"effort": "high", "ultracode": False}, "Claude Sonnet 5.5"),
    "second": ("claudeAgent", "claude-opus-5-5", {"effort": "high", "ultracode": False}, "Claude Opus 5.5"),
}
# --spread: while Antigravity is out (11 Nov to about 18 Nov), spread the roles over the providers that have credit,
# so Claude Code's 5-hour limit is left mostly to the controller, the reviews and the cheap Haiku builders (owner,
# 11 Nov: "find the way to speed up development without my approval"). Cursor's included usage covers Grok but not
# Claude Opus 5.5 ("not included in your weekly usage"; buying credits is the owner's call), so planners and the
# second review run on Grok 4.7 through Cursor. Grok is also the different model family the second review wants.
# Planners on Grok are a trial (11 Nov): check_kit and the first review catch a weak kit before a build runs on it.
SPREAD = {
    "planner": ("cursor", "grok-4.7", {"reasoning_effort": "xhigh", "fastMode": False}, "Grok 4.7"),
    "implementer": ("claudeAgent", "claude-haiku-5-5", {"effort": "max", "ultracode": False}, "Claude Haiku 5.5"),
    "fixer": ("claudeAgent", "claude-haiku-5-5", {"effort": "max", "ultracode": False}, "Claude Haiku 5.5"),
    "reviewer": ("claudeAgent", "claude-opus-5-5", {"effort": "xhigh", "ultracode": False}, "Claude Opus 5.5"),
    "confirm": ("claudeAgent", "claude-sonnet-5-5", {"effort": "high", "ultracode": False}, "Claude Sonnet 5.5"),
    "second": ("cursor", "grok-4.7", {"reasoning_effort": "xhigh", "fastMode": False}, "Grok 4.7"),
}
FINAL_IMPL = ("Your final message must follow the protocol's \"Your final message\" section exactly: the STATUS line first (`STATUS: DONE` or "
              "`STATUS: BLOCKED` with the exact blocker), the commit SHA, RED and GREEN counts, the mutants, each gate command with its result, "
              "SKIPPED items, and deviations.")

def task(tid, a):
    for t in json.load(open(f"{C}/backlog/tasks.json")):
        if t["id"] == tid:
            return t
    if a.title and a.spec:   # a follow-up task the backlog does not list (e.g. fix-download-aborts)
        return {"title": a.title, "heading": None, "spec": a.spec}
    sys.exit(f"no task {tid} in backlog/tasks.json (for a follow-up task, pass --title and --spec)")

def worktree(a, fresh_from=None):
    s = f"Your worktree: {W}/{a.wt}"
    if a.branch: s += f", on branch {a.branch}"
    if fresh_from: s += f", freshly created from origin/claude/p1a-vault-core at {fresh_from}"
    s += ". " + ("node_modules is already installed there." if a.installed else
                 "node_modules is not installed: run `npm ci --ignore-scripts --no-audit --no-fund` at the worktree root first (edge work also `npm run install:edge`).")
    return s

def main():
    p = argparse.ArgumentParser()
    p.add_argument("role", choices=["implementer", "fixer", "reviewer", "confirm", "second", "planner"])
    p.add_argument("task")
    for o in ("wt", "branch", "head", "accepted", "pr", "sha", "shape", "notes", "out", "title", "spec"):
        p.add_argument(f"--{o}")
    p.add_argument("--installed", action="store_true")
    p.add_argument("--lock", action="store_true")
    p.add_argument("--claude-code", action="store_true")
    p.add_argument("--spread", action="store_true")
    a = p.parse_args()
    provider, model, options, label = (SPREAD if a.spread else CLAUDE_CODE if a.claude_code else ROUTES)[a.role]
    trailer = f"Co-Authored-By: {label} <noreply@{'google.com' if label.startswith('Gemini') else 'anthropic.com'}>"
    t = task(a.task, a); tl = a.task.lower()
    plan = t["spec"] if t.get("spec") else f"docs/superpowers/plans/{t['plan_file']}, \"### {t['heading']}\" (line {t['line']})"
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
              f"3. Do exactly what the brief says, in order, through the commit, with the controller notes below. The commit's trailer is `{trailer}`, in place of any other model's trailer the brief names. Run long steps in the background and wait for their notices. "
              "If a result differs from an \"Expected\" line (as amended below), stop and report BLOCKED with the output. Never change tests or code to make them pass.", ""]
        if a.accepted:
            L += [f"The controller accepted the brief's planner calls {a.accepted}. Record them in the receipt's Deviations as accepted by the controller.", ""]
        L += [worktree(a, None if fix else a.head) + f" Keep every log in the scratch folder your brief names (its S); only if it names none, use {C}/scratch/{tl}{'-fix' if fix else ''}/ (mkdir -p). Do not push.", ""]
        if a.lock: L += [LOCK, ""]
        L += [RULES, "", FINAL_IMPL]
    elif a.role in ("reviewer", "confirm", "second"):
        conf = a.role == "confirm"
        second = a.role == "second"
        kind = {"confirm": "confirming ", "second": "second (money-path or privacy) "}.get(a.role, "")
        suffix = {"confirm": "-confirm", "second": "-second"}.get(a.role, "")
        L += [f"You are the independent {kind}reviewer ({label}) for Jotbun task {a.task} \"{t['title']}\", PR #{a.pr} (mygogocash/jotbun, base claude/p1a-vault-core). A controller session reads only your final message.", "",
              f"Read {proto} first: its opening notes (R87) and \"Reviewers\". You are read-only: no edits, commits, pushes or merges in any worktree, and never touch the main checkout. Probe only in a scratch copy (`git archive` into your scratch folder, node_modules symlinked from the worktree).", "",
              f"What to review: {'the fix-round commits after the reviewed head' if conf else 'commit ' + str(a.sha)} on branch {a.branch} in {W}/{a.wt}"
              + (f" (head {a.sha})" if conf else f" (range origin/claude/p1a-vault-core...{a.sha})") + "; run `git fetch` first.",
              f"The spec: {plan}, with the plan's Global Constraints and every ruling it cites. The brief: {C}/briefs/{a.task}{'-fix' if conf else ''}.md and its planner's kit. The implementer's logs: {C}/scratch/{tl}{'-fix' if conf else ''}/. The receipt: docs/implementation/receipts/{a.task}.md."
              + (f" The first review: {C}/reviews/{a.task}.md." if conf else "")
              + (" Do not read the other reviews of this task until your own findings are written: your value is an independent second look, from a different model family, at money, wallet, points, payment, auth and privacy behaviour." if second else ""), "",
              f"R100: do not re-run whole suites; CI on PR #{a.pr} is the gate for them. Read it (`gh pr checks {a.pr} --repo mygogocash/jotbun`, and job logs for counts) and include it. Spend the time on the focused files, probes and your own mutants; rerun at most about 10 of the planner's mutants.", ""]
        if a.lock: L += [LOCK, ""]
        L += [RULES, "",
              f"Write your review to {C}/reviews/{a.task}{suffix}.md: findings ranked blocker, major, minor and nit, each with evidence (file and line, a failing probe, or the plan clause), and \"Notes for later tasks\" if anything should carry. Scratch folder: {C}/scratch/{tl}-{suffix[1:] or 'review'}/ (mkdir -p).",
              "End the review file and your final message, each with a last line that is exactly `VERDICT: Approved` or `VERDICT: Needs fixes` (any blocker or major means Needs fixes). The controller watches the file for that line, so a heading such as `## Verdict` is not enough."]
    else:
        L += [f"You are the planning step ({label}) for Jotbun task {a.task} \"{t['title']}\". A controller session reads only your final message.", "",
              f"Read {proto} first; it is binding (durable paths under .claude/controller/, never /private/tmp; R87: the receipt is its own file). You are read-only in the repo. The integration code is at {W}/p1a-vault-core (origin/claude/p1a-vault-core is at {a.head}; run `git fetch`; read-only git; proofs in a scratch `git archive` copy).", "",
              f"The spec: {plan}, with the plan's Global Constraints and every ruling it cites, and the merged receipts it builds on. Grep {C}/followups.md for {a.task}.", "",
              "First decide readiness: are all its \"Starts after\" tasks merged; does it need a package, Cloudflare resource, owner decision or account setting not yet available? If not ready, report BLOCKED with the exact reason.", "",
              f"If ready, write an implementation brief for a {(SPREAD if a.spread else CLAUDE_CODE if a.claude_code else ROUTES)['implementer'][3]} implementer at {C}/briefs/{a.task}.md, in the shape of {C}/briefs/{a.shape or 'P2-T2'}.md. The orchestrator creates the worktree {W}/{a.wt} on branch {a.branch} from origin/claude/p1a-vault-core. The brief: ordered test-first steps with exact files, exported names and signatures; the RED tests; the code; the fast local gate of R100 (typecheck, the focused files RED to GREEN, test:app and test:unit or test:edge, build:edge, and export:web only when routes or the app entry change; whole suites run in CI, so prove no whole-suite totals and write none into the brief); the receipt at docs/implementation/receipts/{a.task}.md; the commit summary line; and a \"Planner rulings\" section (P1, P2, ...) with the reason for each.",
              f"Prove it in a scratch copy under {C}/scratch/{tl}-planner/ (RED on typed stubs, GREEN, every mutant killed, the fast local gate) with verified files (real/, stubs/, orig/ or base/, diffs/ with one <path with / as _>.diff per changed shared file) and SHA256SUMS. Keep *.log files out of that SHA256SUMS (they are gitignored and lost in state commits); list them in SHA256SUMS.logs.", ""]
        if a.lock: L += [LOCK, ""]
        L += [RULES, "", "Final message: first line READY or BLOCKED: <reason>; the brief path; \"Files:\" (mark shared); size S/M/L; up to 5 lines of summary."]
    if a.notes:
        L += ["", "## Controller notes", "", open(a.notes).read().strip()]
    out = a.out or f"{C}/scratch/dispatch/{a.task}-{a.role}.prompt.md"
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, "w").write("\n".join(L) + "\n")
    print(out)
    noun = {"confirm": "confirming reviewer", "second": "second reviewer", "fixer": "fix-round implementer"}.get(a.role, a.role)
    print("target: " + json.dumps({"providerInstanceId": provider, "model": model, "options": options}))
    print(f"prompt: You are the {noun} for Jotbun task {a.task} \"{t['title']}\". Your full assignment is in {out}. Read it first and follow it exactly.")

main()

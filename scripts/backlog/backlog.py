"""Parse every Jotbun plan into one task graph, and plan its execution.

Usage:
  python3 -I backlog.py parse PLAN_DIR OUT.json
  python3 -I backlog.py plan TASKS.json STATUS.json OUT.md

`parse` reads the eleven plan files (1A to 1D, P2, P3, P4, P5, P6A, P6B, P6C),
one task per "### Task" heading, and records each task's id, plan, phase,
title, dependencies (from its "Starts after" line), the capabilities it
delivers, the files it touches, its lane and whether it waits on the owner.
Plan 1A has no "Starts after" lines; its order is controller ruling R7, which
also splits Task 8 into T8a (sync changes) and T8b (retention).

`plan` adds each task's status (Done, In review, In progress) from STATUS.json,
then computes waves (the earliest round a task can start once everything it
waits on is done), the tasks ready now, each lane's queue and the critical
path, and writes the execution plan as Markdown.
"""
from __future__ import annotations

import json
import os
import re
import sys

PLANS = [
    ("1A", 1, "2026-10-25-jotbun-p1a-vault-core.md", "Phase 1A: the vault core"),
    ("1B", 1, "2026-10-25-jotbun-p1b-vault-files.md", "Phase 1B: files and background work on the vault"),
    ("1C", 1, "2026-10-25-jotbun-p1c-better-auth.md", "Phase 1C: Better Auth and the app's sign-in"),
    ("1D", 1, "2026-10-25-jotbun-p1d-pokes-posthog.md", "Phase 1D: live pokes, the pending choice, PostHog and the proof"),
    ("P2", 2, "2026-10-25-jotbun-p2-bun-wallet-core.md", "Phase 2: Bun Wallet core"),
    ("P3", 3, "2026-10-25-jotbun-p3-photos-bun-ai.md", "Phase 3: Photos and Bun AI"),
    ("P4", 4, "2026-10-25-jotbun-p4-slips-statements.md", "Phase 4: Slips and statements"),
    ("P5", 5, "2026-10-25-jotbun-p5-travel.md", "Phase 5: Travel and currencies"),
    ("P6A", 6, "2026-10-25-jotbun-p6a-outside-the-app.md", "Phase 6A: Outside the app"),
    ("P6B", 6, "2026-10-25-jotbun-p6b-beta-extras.md", "Phase 6B: The beta's in-app extras"),
    ("P6C", 6, "2026-10-25-jotbun-p6c-release-beta.md", "Phase 6C: Release, operations and the closed beta"),
]
PHASES = {
    1: "Phase 1: Foundations",
    2: "Phase 2: Bun Wallet core",
    3: "Phase 3: Photos and Bun AI",
    4: "Phase 4: Slips and statements",
    5: "Phase 5: Travel",
    6: "Phase 6: Outside the app, then beta",
}
# Controller ruling R7: 1A's lanes T1 -> T2 -> T3 -> {T4 | T8a} -> {T5 | T6} -> {T7 | T8b} -> T9 -> T10.
R7 = {
    "1A-T1": [], "1A-T2": ["1A-T1"], "1A-T3": ["1A-T2"],
    "1A-T4": ["1A-T3"], "1A-T8a": ["1A-T3"],
    "1A-T5": ["1A-T4", "1A-T8a"], "1A-T6": ["1A-T4", "1A-T8a"],
    "1A-T7": ["1A-T5", "1A-T6"], "1A-T8b": ["1A-T5", "1A-T6"],
    "1A-T9": ["1A-T7", "1A-T8b"], "1A-T10": ["1A-T9"],
}
HEADING = re.compile(r"^### Task (?:(1[A-D]|P[2-6][A-C]?)-)?T?(\d+[a-z]?):\s*(.+?)\s*$")
TASK_ID = re.compile(r"\b(1[A-D]-T\d+[ab]?|P[2-6][A-C]?-T\d+[a-z]?)\b")
CAP_ID = re.compile(r"\b(?:P3|P4|P5|P6A|P6B|P6C):[a-z][a-z0-9-]*[a-z0-9]\b")
FILE_LINE = re.compile(r"^-\s*(Create|Modify|Test|Delete|Move)[^:]*:\s*(.+)$")
PATH = re.compile(r"`([^`]+)`")
# A repository path: no spaces or quotes, at least one slash, and a file extension or a trailing slash.
FILE_TOKEN = re.compile(r"^(?!@)[A-Za-z0-9_.\-\[\]$+]+(?:/[A-Za-z0-9_.\-\[\]$+]+)+(?:\.[A-Za-z0-9]+|/)$")
OWNER_WAIT = re.compile(r"waits on (?:the )?owner|owner's (?:answer|approval|yes)|waits on D3[13]|waits on owner", re.I)


def slug(text: str) -> str:
    """GitHub's heading anchor: lowercase, drop punctuation except hyphens and spaces, spaces to hyphens."""
    s = text.strip().lower()
    s = re.sub(r"[^\w\- ]", "", s, flags=re.UNICODE)
    return s.replace(" ", "-")


def lane_of(files: list[str], plan: str = "", text: str = "") -> str:
    kinds = set()
    edge_hint = text.count("apps/edge") + (5 if plan in ("1A", "1B") else 0)
    app_hint = text.count("apps/app")
    bare_root = "apps/edge/" if edge_hint >= app_hint else "apps/app/"
    APP_BARE = ("src/wallet/", "src/screens/", "src/spend/", "src/ui/", "src/i18n/", "src/storage/", "src/sync/", "src/auth/", "src/notifications/", "src/slips/", "src/outside/", "src/messages/", "src/theme/", "src/dev/", "src/config/", "src/mascot/", "src/rollout/", "app/")
    SERVER_BARE = ("src/vault/", "src/v1/", "src/server/", "src/deletion/", "src/auth-worker", "src/roles/", "test/workers/", "migrations/")
    for f in files:
        if f.startswith(APP_BARE):
            f = "apps/app/" + f
        elif f.startswith(SERVER_BARE):
            f = "apps/edge/" + f
        elif f.startswith(("src/", "test/")):
            f = bare_root + f
        if f.startswith((".github/", "docs/operations", "scripts/release")) or "wrangler" in f and "env" in f:
            kinds.add("Ops")
        elif f.startswith(("apps/app/app.config", "apps/app/app.json", "apps/app/targets", "apps/app/ios", "apps/app/android", "apps/app/plugins", "apps/app/eas.json")):
            kinds.add("Native")
        elif f.startswith(("apps/edge", "apps/api", "packages/contracts", "migrations")):
            kinds.add("Server")
        elif f.startswith("apps/app"):
            kinds.add("App")
        elif f.startswith("docs/"):
            kinds.add("Docs")
    kinds.discard("Docs") if len(kinds) > 1 else None
    if {"Server", "App"} <= kinds:
        return "Full stack"
    for k in ("Native", "Ops", "Server", "App", "Docs"):
        if k in kinds:
            return k
    return "Unknown"


def parse(plan_dir: str) -> list[dict]:
    tasks = []
    for plan, phase, name, title in PLANS:
        path = os.path.join(plan_dir, name)
        if not os.path.exists(path):
            print(f"missing plan {plan}: {path}", file=sys.stderr)
            continue
        lines = open(path, encoding="utf-8").read().splitlines()
        current = None
        for i, line in enumerate(lines, 1):
            m = HEADING.match(line)
            if m:
                if current:
                    tasks.append(current)
                local = m.group(2)
                tid = f"{plan}-T{local}"
                current = {
                    "id": tid, "plan": plan, "phase": phase, "plan_file": name, "plan_title": title,
                    "title": m.group(3), "heading": line[4:], "anchor": slug(line[4:]), "line": i,
                    "starts_after_text": "", "deps": [], "delivers": [], "files": [], "owner_wait": False,
                    "bytes": 0,
                }
                continue
            if not current:
                continue
            if line.startswith("## ") or line.startswith("### "):
                tasks.append(current)
                current = None
                continue
            current["bytes"] += len(line.encode()) + 1
            current.setdefault("text_lines", []).append(line)
            if line.startswith("**Starts after:**"):
                text = line[len("**Starts after:**"):].strip()
                current["starts_after_text"] = text
                ids = [x for x in TASK_ID.findall(text) if x != current["id"]]
                current["deps"] = sorted(set(ids), key=ids.index)
                current["unresolved_caps"] = sorted(set(CAP_ID.findall(text)) - set(re.findall(r"\(((?:P3|P4|P5|P6[ABC]):[a-z0-9-]+)\)", text)))
                current["owner_wait"] = bool(OWNER_WAIT.search(text))
            elif line.startswith("**Delivers:**"):
                current["delivers"] = CAP_ID.findall(line)
            fm = FILE_LINE.match(line.strip())
            if fm:
                current["files"].extend(p for p in PATH.findall(fm.group(2)) if FILE_TOKEN.match(p))
            if OWNER_WAIT.search(current["heading"]):
                current["owner_wait"] = True
        if current:
            tasks.append(current)
    # 1A: deps from R7, and Task 8 split into 8a and 8b.
    out = []
    for t in tasks:
        if t["plan"] == "1A":
            if t["id"] == "1A-T8":
                for half, label in (("1A-T8a", "sync changes (sync.test.ts, reads/sync.ts, the sync route)"), ("1A-T8b", "retention (retention.test.ts, retention.ts, the alarm)")):
                    u = dict(t, id=half, title=f"{t['title']}: {label}", deps=list(R7[half]), files=list(t["files"]))
                    out.append(u)
                continue
            t["deps"] = list(R7.get(t["id"], []))
        out.append(t)
    known = {t["id"] for t in out}
    for t in out:
        # 1A-T8 means both halves when a later plan cites it.
        deps = []
        for d in t["deps"]:
            deps.extend(["1A-T8a", "1A-T8b"] if d == "1A-T8" else [d])
        t["deps"] = [d for d in dict.fromkeys(deps) if d != t["id"]]
        t["unknown_deps"] = [d for d in t["deps"] if d not in known]
        text = "\n".join(t.get("text_lines", []))
        t["lane"] = lane_of(t["files"], t["plan"], text)
        t["text"] = text
        t.pop("text_lines", None)
    return out


def plan(tasks: list[dict], status: dict) -> str:
    by_id = {t["id"]: t for t in tasks}
    state = {t["id"]: status.get(t["id"], {}).get("state", "Todo") for t in tasks}
    done = {k for k, v in state.items() if v == "Done"}
    # Waves: a task not done starts in wave 1 + the latest wave among its unfinished dependencies.
    wave: dict[str, int] = {}

    def w(tid: str, stack=()) -> int:
        if tid in wave:
            return wave[tid]
        if tid in stack:
            raise ValueError(f"cycle: {' -> '.join(stack + (tid,))}")
        if state.get(tid) == "Done":
            wave[tid] = 0
            return 0
        deps = [d for d in by_id[tid]["deps"] if d in by_id]
        wave[tid] = 1 + max((w(d, stack + (tid,)) for d in deps), default=0)
        return wave[tid]

    for t in tasks:
        w(t["id"])
    # Critical path by effort, using each task's plan section size as its weight.
    best: dict[str, tuple[int, list[str]]] = {}

    def cp(tid: str) -> tuple[int, list[str]]:
        if tid in best:
            return best[tid]
        if state.get(tid) == "Done":
            best[tid] = (0, [])
            return best[tid]
        deps = [d for d in by_id[tid]["deps"] if d in by_id]
        prev = max((cp(d) for d in deps), default=(0, []))
        best[tid] = (prev[0] + max(by_id[tid]["bytes"], 1), prev[1] + [tid])
        return best[tid]

    crit = max((cp(t["id"]) for t in tasks), default=(0, []))
    ready = [t for t in tasks if state[t["id"]] == "Todo" and all(state.get(d) == "Done" for d in t["deps"] if d in by_id) and not t["owner_wait"]]
    for t in tasks:
        t["wave"] = wave[t["id"]]
        t["state"] = state[t["id"]]
    return render(tasks, status, state, wave, crit, ready)


GUIDE = """# Jotbun v1: execution plan

Generated on {date} from the eleven plans in `docs/superpowers/plans/` (the specification of every task) and the approved spec. The GitHub backlog mirrors it: {board}

## How the backlog is organised

- **Milestones** are the six build phases (spec section 8). **Epics** are the eleven plans, one issue each, labelled `type:epic`. **Tasks** are one issue per plan task, a sub-issue of its epic, titled with its task id (for example `P3-T8: ...`).
- A task's **blocked by** links are its plan's `Starts after` line. A task is ready when every blocker is closed and it does not wait on the owner (label `owner-gated`).
- Labels: `phase:N`, `epic:<plan>`, `lane:<lane>`, `owner-gated`, `plan-task`. Project fields: Phase, Epic, Lane, Task ID, Wave, Readiness, Status.
- **Wave** is the earliest round a task can start once everything it waits on is done. Wave 1 is startable as soon as the tasks in review and in progress merge. Tasks in the same wave and different lanes run in parallel.

## How to take a task

1. Pick a task with Readiness "Ready now" in your lane, lowest wave first, critical-path tasks before others.
2. Assign it to yourself and set Status to In Progress.
3. Branch from the integration head in its own worktree: `/usr/bin/git worktree add .claude/worktrees/<plan>-<task> -b <plan>/<task>-<short-name> origin/claude/p1a-vault-core` (for example `p3/t8-slip-read`).
4. Do the task exactly as its plan says, following handover section 4: a failing test seen failing (RED), the code (GREEN), the mutation check, the full gate, the receipt in `docs/implementation/premium-progress.md`, a local commit, then an independent review and its fix rounds.
5. Open a pull request into `claude/p1a-vault-core`. Merge it with a merge commit once all three CI jobs are green (one rerun for a known flake), then close the task's issue with a comment naming the pull request: a pull request into a branch other than `main` does not close issues by itself.
6. Remove the worktree and branch, and look at the tasks this one unblocked.

## Where things stand

{state}

## Lanes and parallel work

{lanes}

Phases overlap by design: a phase 3, 4 or 5 server task starts as soon as the phase 1 tasks it names have merged, and its screens wait only for the phase 2 design-system tasks they name. Keep at most one task per lane editing the same shared file at a time (see below), and merge them one by one.

## Shared files and merge rules

These files are edited by many tasks. Every edit to them is additive and named in its task.

{hotfiles}

- Migrations (vault, D1 and the phone's diary) take the next free number when they are integrated; the integrator renames the file and updates the journal.
- The root lockfile is regenerated once per merge from the merged manifests, followed by `npm run test:ops`.
- Route tables and the command registry keep their documented order; `en.json`, `th.json` and `premium-progress.md` take both sides of a conflict.
- Once P6C-T1 lands, a task that adds a Worker binding, var, queue, Workflow or Cron trigger also adds it to the staging and production blocks (boundaries amendment A20).

## What waits on the owner

{owner}

## Ready now

{ready}

## Waves

{waves}

## Critical path

The longest chain of unfinished work, weighted by each task's size in its plan:

{critical}

## Phase proofs and E2 approvals

{proofs}
"""


def render(tasks, status, state, wave, crit, ready) -> str:
    import collections
    import datetime
    by_id = {t["id"]: t for t in tasks}
    counts = collections.Counter(state.values())
    lanes = collections.defaultdict(lambda: collections.Counter())
    for t in tasks:
        if state[t["id"]] != "Done":
            lanes[t["lane"]][t["plan"]] += 1
    lane_lines = [f"- **{lane}** ({sum(c.values())} open): " + ", ".join(f"{p} {n}" for p, n in sorted(c.items())) for lane, c in sorted(lanes.items(), key=lambda x: -sum(x[1].values()))]
    lane_lines.append("")
    lane_lines.append(f"Today: {counts.get('Done', 0)} done, {counts.get('In review', 0)} in review, {counts.get('In progress', 0)} in progress, {len(ready)} ready now, {len(tasks)} in all.")
    files = collections.defaultdict(list)
    for t in tasks:
        for f in set(t["files"]):
            root = "apps/edge/" if t["lane"] in ("Server",) and f.startswith(("src/", "test/")) else ""
            files[root + f].append(t["id"])
    hot = sorted(((f, ids) for f, ids in files.items() if len(ids) >= 5), key=lambda x: -len(x[1]))[:25]
    hot_lines = ["| File | Tasks |", "| --- | --- |"] + [f"| `{f}` | {len(ids)}: {', '.join(ids[:12])}{' and more' if len(ids) > 12 else ''} |" for f, ids in hot]
    gated = [t for t in tasks if t["owner_wait"] and state[t["id"]] != "Done"]
    owner_lines = ["| Task | Waits on |", "| --- | --- |"] + [f"| {t['id']} | {(t.get('starts_after_text') or t['heading']).replace('|', '/')[:240]} |" for t in gated]
    ready_lines = ["| Task | Lane | Title |", "| --- | --- | --- |"] + [f"| {t['id']} | {t['lane']} | {t['title']} |" for t in sorted(ready, key=lambda t: (t['lane'], t['phase'], t['plan'], t['line']))]
    wave_lines = []
    for n in sorted({v for v in wave.values() if v > 0}):
        ids = [t["id"] for t in tasks if wave[t["id"]] == n]
        wave_lines.append(f"- **Wave {n}** ({len(ids)}): {', '.join(ids)}")
    proof_lines = []
    for t in tasks:
        title = t["title"].lower()
        if "proof" in title or "after e2" in title or title.startswith("e2") or "route the approved" in title:
            proof_lines.append(f"- {t['id']}: {t['title']}")
    state_lines = []
    for label in ("In review", "In progress"):
        rows = [t for t in tasks if state[t["id"]] == label]
        if rows:
            state_lines.append(f"**{label}:**")
            for t in rows:
                st = status.get(t["id"], {})
                extra = f" (pull request #{st['pr']})" if st.get("pr") else ""
                note = f"; {st['note']}" if st.get("note") else ""
                state_lines.append(f"- {t['id']}: {t['title']}{extra}{note}")
            state_lines.append("")
    state_lines.append("Merge the open pull requests first, in the order the phase 1 ledger gives (shared route tables and the command registry keep their order), then take ready tasks.")
    return GUIDE.format(
        date=datetime.date.today().isoformat(), board="{board}", state="\n".join(state_lines),
        lanes="\n".join(lane_lines), hotfiles="\n".join(hot_lines), owner="\n".join(owner_lines),
        ready="\n".join(ready_lines) if ready else "Nothing is ready until a task in review merges.",
        waves="\n".join(wave_lines), critical=" -> ".join(crit[1]) or "(none)", proofs="\n".join(proof_lines),
    )


def main() -> int:
    cmd = sys.argv[1]
    if cmd == "parse":
        tasks = parse(sys.argv[2])
        json.dump(tasks, open(sys.argv[3], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"{len(tasks)} tasks")
        for t in tasks:
            if t.get("unknown_deps") or t.get("unresolved_caps"):
                print(f"  {t['id']}: unknown deps {t.get('unknown_deps')}, unresolved capabilities {t.get('unresolved_caps')}")
        return 0
    if cmd == "plan":
        tasks = json.load(open(sys.argv[2], encoding="utf-8"))
        status = json.load(open(sys.argv[3], encoding="utf-8")) if os.path.exists(sys.argv[3]) else {}
        open(sys.argv[4], "w", encoding="utf-8").write(plan(tasks, status))
        print(f"wrote {sys.argv[4]}")
        if len(sys.argv) > 5:
            json.dump(tasks, open(sys.argv[5], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            print(f"wrote {sys.argv[5]} (tasks with waves)")
        return 0
    raise SystemExit(f"unknown command {cmd}")


if __name__ == "__main__":
    sys.exit(main())

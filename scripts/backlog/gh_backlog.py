"""Create the Jotbun build backlog on GitHub from the parsed plans.

Usage:
  python3 -I gh_backlog.py TASKS.json STATUS.json EPICS.json STATE.json STEP [--apply]

STEP is one of: setup, issues, links, project, finish, all.
Without --apply nothing is written to GitHub; the script prints what it would do.

What it builds, in mygogocash/jotbun:
- one milestone per build phase (6), labels phase:N, epic:<plan>, lane:<lane>,
  owner-gated and plan-task (the existing type:epic label marks epics);
- one epic issue per plan (type Feature, label type:epic) and one issue per task
  (type Task), each carrying a hidden marker so a re-run finds it again;
- each task as a sub-issue of its epic, and a "blocked by" link to every task
  in its Starts after line;
- an organisation project "Jotbun v1 build" with the fields Phase, Epic, Lane,
  Task ID, Wave and Readiness, every issue added and its fields set;
- finished tasks closed as completed, with their pull request named.

STATE.json records every number and id it has created, so each step can resume.
"""
from __future__ import annotations

import json
import subprocess
import sys
import time

OWNER, REPO = "mygogocash", "jotbun"
BRANCH = "claude/p1a-vault-core"
PROJECT_TITLE = "Jotbun v1 build"
PHASE_NAMES = {
    1: "Phase 1: Foundations",
    2: "Phase 2: Bun Wallet core",
    3: "Phase 3: Photos and Bun AI",
    4: "Phase 4: Slips and statements",
    5: "Phase 5: Travel",
    6: "Phase 6: Outside the app and beta",
}
PHASE_COLORS = {1: "1d76db", 2: "6a4bd4", 3: "b60205", 4: "0e8a16", 5: "fbca04", 6: "5319e7"}
LANES = ["Server", "App", "Full stack", "Native", "Ops", "Docs", "Unknown"]
READINESS = ["Done", "In review", "In progress", "Ready now", "Waiting on tasks", "Waiting on owner"]
APPLY = "--apply" in sys.argv
MARK_TASK = "<!-- jotbun-task:{} -->"
MARK_EPIC = "<!-- jotbun-epic:{} -->"


def gh(args: list[str], payload=None, retries: int = 6):
    """Run gh, retrying secondary rate limits with backoff; returns parsed JSON or text."""
    for attempt in range(retries):
        proc = subprocess.run(["gh"] + args, input=json.dumps(payload) if payload is not None else None,
                              capture_output=True, text=True)
        if proc.returncode == 0:
            out = proc.stdout.strip()
            try:
                return json.loads(out) if out else None
            except json.JSONDecodeError:
                return out
        err = proc.stderr + proc.stdout
        if any(s in err for s in ("secondary rate limit", "rate limit", "abuse", "502", "503", "Something went wrong")):
            wait = 30 * (attempt + 1)
            print(f"  rate limited or transient error, waiting {wait}s: {err.strip()[:160]}", flush=True)
            time.sleep(wait)
            continue
        raise RuntimeError(f"gh {' '.join(args[:4])} failed: {err.strip()[:400]}")
    raise RuntimeError(f"gh {' '.join(args[:4])} kept failing")


def api(method: str, path: str, payload=None):
    args = ["api", "--method", method, "-H", "Accept: application/vnd.github+json", path]
    if payload is not None:
        args += ["--input", "-"]
    return gh(args, payload)


def graphql(query: str, variables: dict | None = None):
    payload = {"query": query, "variables": variables or {}}
    return gh(["api", "graphql", "--input", "-"], payload)


def pace(seconds: float = 1.1):
    if APPLY:
        time.sleep(seconds)


def save(state: dict, path: str):
    json.dump(state, open(path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)


def plan_url(task_or_epic: dict, anchor: str | None = None) -> str:
    url = f"https://github.com/{OWNER}/{REPO}/blob/{BRANCH}/docs/superpowers/plans/{task_or_epic['plan_file']}"
    return f"{url}#{anchor}" if anchor else url


def readiness(task: dict, status: dict, by_id: dict) -> str:
    s = status.get(task["id"], {}).get("state", "Todo")
    if s in ("Done", "In review", "In progress"):
        return s
    if task.get("owner_wait"):
        return "Waiting on owner"
    if all(status.get(d, {}).get("state") == "Done" for d in task["deps"] if d in by_id):
        return "Ready now"
    return "Waiting on tasks"


def task_body(t: dict, status: dict, state: dict, epics: dict, by_id: dict) -> str:
    issues = state.get("issues", {})
    def ref(tid: str) -> str:
        n = issues.get(tid, {}).get("number")
        return f"{tid} (#{n})" if n else tid
    s = status.get(t["id"], {})
    deps = ", ".join(ref(d) for d in t["deps"]) or "nothing (base)"
    files = ", ".join(f"`{f}`" for f in t["files"][:12]) + (" and more" if len(t["files"]) > 12 else "")
    epic_no = issues.get(f"epic:{t['plan']}", {}).get("number")
    lines = [
        MARK_TASK.format(t["id"]),
        f"**Plan:** [{t['plan_title']}, {t['heading']}]({plan_url(t, t['anchor'])}) (the plan is the specification; read the task there before starting)",
        "",
        f"**Epic:** {'#' + str(epic_no) if epic_no else t['plan']} · **Phase:** {PHASE_NAMES[t['phase']]} · **Lane:** {t['lane']} · **Wave:** {t.get('wave', '?')}",
        f"**Starts after:** {deps}",
    ]
    if t.get("starts_after_text") and (t.get("owner_wait") or not t["deps"]):
        lines.append(f"> {t['starts_after_text']}")
    if t.get("delivers"):
        lines.append(f"**Delivers:** {', '.join(t['delivers'])}")
    if files:
        lines.append(f"**Files:** {files}")
    if s.get("pr"):
        lines.append(f"**Pull request:** #{s['pr']}")
    if s.get("note"):
        lines.append(f"**Note:** {s['note']}")
    lines += [
        "",
        "### Done when",
        "- [ ] The task's failing tests are written and seen failing for the stated reason (RED)",
        "- [ ] The code makes them pass (GREEN), and the task's mutation check fails a reasonable mutant",
        "- [ ] The full gate is green and the receipt is in `docs/implementation/premium-progress.md`",
        "- [ ] An independent review approved the change",
        f"- [ ] The pull request into `{BRANCH}` merged on green CI",
    ]
    return "\n".join(lines)


def epic_body(e: dict, state: dict) -> str:
    return "\n".join([
        MARK_EPIC.format(e["plan"]),
        f"**Plan:** [{e['plan_file']}]({plan_url(e)})",
        f"**Phase:** {PHASE_NAMES[e['phase']]}",
        "",
        f"**Goal:** {e.get('goal', '')}",
        "",
        f"**Phase proof:** {e.get('proof', '')}",
        "",
        f"**Tasks:** {e.get('task_count', '?')}, listed below as sub-issues, each blocked by the tasks in its Starts after line.",
        f"**Owner questions:** the plan's \"Owner questions\" section; tasks that wait on an answer carry the owner-gated label.",
        "**How to pick up work:** see the execution plan, `docs/implementation/2026-10-25-execution-plan.md`.",
    ])


def step_setup(tasks, epics, state):
    print("== setup: labels, milestones, project, fields")
    existing = {l["name"] for l in gh(["label", "list", "-R", f"{OWNER}/{REPO}", "--limit", "300", "--json", "name"])}
    wanted = [(f"phase:{n}", PHASE_COLORS[n], PHASE_NAMES[n]) for n in PHASE_NAMES]
    wanted += [(f"epic:{e['plan']}", "c5def5", e["plan_title"]) for e in epics]
    used_lanes = sorted({t["lane"] for t in tasks})
    wanted += [(f"lane:{l.lower().replace(' ', '-')}", "d4c5f9", f"{l} work lane") for l in used_lanes]
    wanted += [("owner-gated", "e99695", "Waits on an owner answer, an E2 approval or a D31/D33 item"),
               ("plan-task", "ededed", "A task generated from a docs/superpowers/plans plan")]
    for name, color, desc in wanted:
        if name in existing:
            continue
        print(f"  label {name}")
        if APPLY:
            gh(["label", "create", name, "-R", f"{OWNER}/{REPO}", "--color", color, "--description", desc[:100]])
            pace(0.5)
    ms = {m["title"]: m["number"] for m in (api("GET", f"/repos/{OWNER}/{REPO}/milestones?state=all&per_page=100") or [])}
    state.setdefault("milestones", {})
    for n, title in PHASE_NAMES.items():
        if title in ms:
            state["milestones"][str(n)] = ms[title]
            continue
        print(f"  milestone {title}")
        if APPLY:
            m = api("POST", f"/repos/{OWNER}/{REPO}/milestones", {"title": title, "description": f"Build-order phase {n} of the approved spec (section 8)."})
            state["milestones"][str(n)] = m["number"]
            pace()
    projects = gh(["project", "list", "--owner", OWNER, "--format", "json", "--limit", "100"])["projects"]
    proj = next((p for p in projects if p["title"] == PROJECT_TITLE), None)
    if not proj:
        print(f"  project {PROJECT_TITLE}")
        if APPLY:
            proj = gh(["project", "create", "--owner", OWNER, "--title", PROJECT_TITLE, "--format", "json"])
    if proj:
        state["project"] = {"number": proj["number"], "id": proj["id"]}
        fields = {f["name"]: f for f in gh(["project", "field-list", str(proj["number"]), "--owner", OWNER, "--format", "json", "--limit", "100"])["fields"]}
        specs = [
            ("Phase", "SINGLE_SELECT", [PHASE_NAMES[n] for n in PHASE_NAMES]),
            ("Epic", "SINGLE_SELECT", [e["plan"] for e in epics]),
            ("Lane", "SINGLE_SELECT", LANES),
            ("Readiness", "SINGLE_SELECT", READINESS),
            ("Task ID", "TEXT", None),
            ("Wave", "NUMBER", None),
        ]
        for name, kind, options in specs:
            if name in fields:
                continue
            print(f"  field {name}")
            if APPLY:
                args = ["project", "field-create", str(proj["number"]), "--owner", OWNER, "--name", name, "--data-type", kind, "--format", "json"]
                if options:
                    args += ["--single-select-options", ",".join(options)]
                gh(args)
                pace()
        if APPLY:
            fields = {f["name"]: f for f in gh(["project", "field-list", str(proj["number"]), "--owner", OWNER, "--format", "json", "--limit", "100"])["fields"]}
        state["fields"] = {name: {"id": f["id"], "options": {o["name"]: o["id"] for o in f.get("options", [])}} for name, f in fields.items()}


def existing_markers() -> dict:
    found = {}
    for it in gh(["issue", "list", "-R", f"{OWNER}/{REPO}", "--state", "all", "--limit", "1000", "--json", "number,id,body,title,state"]):
        body = it.get("body") or ""
        for prefix in ("<!-- jotbun-task:", "<!-- jotbun-epic:"):
            if prefix in body:
                key = body.split(prefix, 1)[1].split(" -->", 1)[0]
                found[("epic:" + key) if "epic" in prefix else key] = it
    return found


def create_or_update(key, title, body, labels, milestone, kind, state, found):
    issues = state.setdefault("issues", {})
    if key in issues:
        if APPLY:
            api("PATCH", f"/repos/{OWNER}/{REPO}/issues/{issues[key]['number']}", {"title": title, "body": body})
            pace(0.8)
        return
    if key in found:
        it = found[key]
        rest = api("GET", f"/repos/{OWNER}/{REPO}/issues/{it['number']}") if APPLY else {"id": None, "node_id": it["id"]}
        issues[key] = {"number": it["number"], "id": rest["id"], "node_id": rest.get("node_id", it["id"])}
        return
    print(f"  create {key}: {title[:80]}")
    if APPLY:
        r = api("POST", f"/repos/{OWNER}/{REPO}/issues", {"title": title, "body": body, "labels": labels, "milestone": milestone, "type": kind})
        issues[key] = {"number": r["number"], "id": r["id"], "node_id": r["node_id"]}
        pace(1.2)


def step_issues(tasks, epics, status, state, state_path):
    print("== issues: epics, then tasks")
    by_id = {t["id"]: t for t in tasks}
    found = existing_markers()
    for e in epics:
        create_or_update(f"epic:{e['plan']}", f"Epic {e['plan']}: {(lambda t: t[:1].upper() + t[1:])(e['plan_title'].split(': ', 1)[-1])}", epic_body(e, state),
                         ["type:epic", f"phase:{e['phase']}", f"epic:{e['plan']}"], state.get("milestones", {}).get(str(e["phase"])), "Feature", state, found)
        save(state, state_path)
    for t in tasks:
        labels = ["plan-task", f"phase:{t['phase']}", f"epic:{t['plan']}", f"lane:{t['lane'].lower().replace(' ', '-')}"]
        if t.get("owner_wait"):
            labels.append("owner-gated")
        create_or_update(t["id"], f"{t['id']}: {t['title']}"[:250], task_body(t, status, state, epics, by_id), labels,
                         state.get("milestones", {}).get(str(t["phase"])), "Task", state, found)
        save(state, state_path)


def step_links(tasks, state, state_path):
    print("== links: sub-issues and blocked-by")
    issues = state.get("issues", {})
    done = state.setdefault("links_done", [])
    for t in tasks:
        if t["id"] not in issues or f"epic:{t['plan']}" not in issues:
            print(f"  (dry run) would link {t['id']} under epic {t['plan']} and to {len(t['deps'])} dependencies")
            continue
        key = f"sub:{t['id']}"
        if key not in done:
            parent = issues[f"epic:{t['plan']}"]["number"]
            print(f"  sub-issue {t['id']} -> epic {t['plan']}")
            if APPLY:
                try:
                    api("POST", f"/repos/{OWNER}/{REPO}/issues/{parent}/sub_issues", {"sub_issue_id": issues[t["id"]]["id"]})
                except RuntimeError as e:
                    if "already" not in str(e).lower():
                        raise
                pace(0.8)
                done.append(key); save(state, state_path)
        for d in t["deps"]:
            key = f"dep:{t['id']}<-{d}"
            if key in done or d not in issues:
                continue
            print(f"  blocked-by {t['id']} <- {d}")
            if APPLY:
                try:
                    api("POST", f"/repos/{OWNER}/{REPO}/issues/{issues[t['id']]['number']}/dependencies/blocked_by", {"issue_id": issues[d]["id"]})
                except RuntimeError as e:
                    if "already" not in str(e).lower() and "exists" not in str(e).lower():
                        raise
                pace(0.8)
                done.append(key); save(state, state_path)


def step_project(tasks, epics, status, state, state_path):
    print("== project: items and fields")
    if not APPLY and ("project" not in state or "fields" not in state):
        print(f"  (dry run) would add {len(epics) + len(tasks)} items and set up to 6 fields on each")
        return
    proj = state["project"]; fields = state["fields"]; issues = state["issues"]
    items = state.setdefault("items", {})
    by_id = {t["id"]: t for t in tasks}
    rows = [(f"epic:{e['plan']}", e, None) for e in epics] + [(t["id"], by_id[t["id"]], t) for t in tasks]
    for key, obj, t in rows:
        if key not in items:
            print(f"  add {key}")
            if APPLY:
                r = graphql("mutation($p:ID!,$c:ID!){addProjectV2ItemById(input:{projectId:$p,contentId:$c}){item{id}}}", {"p": proj["id"], "c": issues[key]["node_id"]})
                items[key] = r["data"]["addProjectV2ItemById"]["item"]["id"]
                pace(0.8); save(state, state_path)
        values = {
            "Phase": ("single", PHASE_NAMES[obj["phase"]]),
            "Epic": ("single", obj["plan"]),
        }
        if t:
            ready = readiness(t, status, by_id)
            values.update({"Lane": ("single", t["lane"]), "Readiness": ("single", ready),
                           "Task ID": ("text", t["id"]), "Wave": ("number", t.get("wave", 0))})
            board = {"Done": "Done", "In review": "In Progress", "In progress": "In Progress"}.get(ready, "Todo")
            if "Status" in fields and board in fields["Status"]["options"]:
                values["Status"] = ("single", board)
        muts = []
        for i, (field, (kind, val)) in enumerate(values.items()):
            f = fields[field]
            if kind == "single":
                v = f'{{singleSelectOptionId:"{f["options"][val]}"}}'
            elif kind == "text":
                v = f'{{text:"{val}"}}'
            else:
                v = f"{{number:{float(val)}}}"
            muts.append(f'm{i}: updateProjectV2ItemFieldValue(input:{{projectId:"{proj["id"]}",itemId:"{items.get(key, "ITEM")}",fieldId:"{f["id"]}",value:{v}}}){{clientMutationId}}')
        if APPLY:
            graphql("mutation{" + " ".join(muts) + "}")
            pace(1.0)


def step_finish(tasks, status, state):
    print("== finish: close done tasks")
    issues = state.get("issues", {})
    for t in tasks:
        s = status.get(t["id"], {})
        if s.get("state") == "Done" and t["id"] in issues:
            n = issues[t["id"]]["number"]
            print(f"  close {t['id']} (#{n})")
            if APPLY:
                api("PATCH", f"/repos/{OWNER}/{REPO}/issues/{n}", {"state": "closed", "state_reason": "completed"})
                pace(0.8)


def main() -> int:
    tasks = json.load(open(sys.argv[1], encoding="utf-8"))
    status = json.load(open(sys.argv[2], encoding="utf-8"))
    epics = json.load(open(sys.argv[3], encoding="utf-8"))
    state_path = sys.argv[4]
    try:
        state = json.load(open(state_path, encoding="utf-8"))
    except FileNotFoundError:
        state = {}
    step = sys.argv[5]
    by_id = {t["id"]: t for t in tasks}
    if step in ("setup", "all"):
        step_setup(tasks, epics, state); save(state, state_path)
    if step in ("issues", "all"):
        step_issues(tasks, epics, status, state, state_path)
        # second pass: bodies now carry every dependency's issue number
        if APPLY:
            for t in tasks:
                api("PATCH", f"/repos/{OWNER}/{REPO}/issues/{state['issues'][t['id']]['number']}", {"body": task_body(t, status, state, epics, by_id)})
                pace(0.8)
    if step in ("links", "all"):
        step_links(tasks, state, state_path)
    if step in ("project", "all"):
        step_project(tasks, epics, status, state, state_path)
    if step in ("finish", "all"):
        step_finish(tasks, status, state)
    save(state, state_path)
    if not APPLY:
        sample = tasks[0]
        print("\n--- sample task body (dry run) ---\n" + task_body(sample, status, state, epics, by_id))
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""List Jotbun backlog tasks that can start now, ranked by critical-path depth.

A task is ready when its issue is open, every task in its plan's "Starts after" line
has a closed issue, and its issue is not labelled owner-gated. Depth is the length of
the longest chain of tasks that wait on it (higher = more urgent).

Usage:
  python3 -I ready_tasks.py [--inflight 1B-T5,P2-T2] [--files]

--inflight  task ids already being briefed, built or reviewed (left out of the list)
--files     also print each task's files, to spot shared-file overlap
Data: .claude/controller/backlog/tasks.json (from scripts/backlog/backlog.py), GitHub issues, and
.claude/controller/held.txt (tasks held for an owner answer that GitHub does not label).
"""
import functools
import json
import subprocess
import sys

REPO = "mygogocash/jotbun"
TASKS = "/Users/kunanonjarat/Developer/jotbun/.claude/controller/backlog/tasks.json"
HELD = "/Users/kunanonjarat/Developer/jotbun/.claude/controller/held.txt"


def issue_ids(state, label):
    out = subprocess.run(
        ["gh", "issue", "list", "--repo", REPO, "--label", label, "--state", state,
         "--limit", "400", "--json", "title", "--jq", ".[].title"],
        check=True, capture_output=True, text=True).stdout
    return {line.split(":", 1)[0].strip() for line in out.splitlines() if ":" in line}


def main(argv):
    inflight = set()
    show_files = "--files" in argv
    if "--inflight" in argv:
        inflight = {x.strip() for x in argv[argv.index("--inflight") + 1].split(",") if x.strip()}
    tasks = json.load(open(TASKS))
    closed = issue_ids("closed", "plan-task")
    gated = issue_ids("open", "owner-gated")
    held = {}
    try:
        for line in open(HELD):
            if line.strip() and not line.startswith("#"):
                k, _, why = line.strip().partition(" ")
                held[k] = why
    except FileNotFoundError:
        pass
    dependents = {}
    for t in tasks:
        for d in t["deps"]:
            dependents.setdefault(d, []).append(t["id"])

    @functools.lru_cache(None)
    def depth(i):
        return 1 + max([depth(j) for j in dependents.get(i, [])] or [0])

    rows = []
    for t in tasks:
        i = t["id"]
        if i in closed or i in inflight or not all(d in closed for d in t["deps"]):
            continue
        rows.append((i in gated or i in held or bool(t.get("owner_wait")), -depth(i), i, t))
    rows.sort()
    print(f"closed {len(closed)} of {len(tasks)}; in flight (excluded): {', '.join(sorted(inflight)) or 'none'}")
    for owner, negdepth, i, t in rows:
        tag = "HELD" if i in held else "OWNER-GATED" if owner else "ready"
        print(f"{tag:11} depth {-negdepth:2}  {i:8} {t['lane']:10} {t['title'][:72]}  ({t['plan_file']}:{t['line']})")
        if i in held:
            print("            held: " + held[i])
        if show_files:
            print("            files: " + ", ".join(t["files"]))


if __name__ == "__main__":
    main(sys.argv[1:])

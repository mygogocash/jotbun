#!/usr/bin/env python3
"""For a controller session that died: list the subagents it launched that never finished,
save each one's original prompt, and print where its transcript is.

Usage: python3 -I inflight_agents.py <controller-session.jsonl> [save-dir]
  save-dir defaults to /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/takeover
An agent counts as finished when its LAST task notification says it finished (or failed,
was killed or stopped). "is waiting on its own background work" is not finished.
Read a dead agent's last steps with:
  python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/tail_transcript.py <agent.jsonl> 80
"""
import json
import os
import re
import sys

path = sys.argv[1]
save = sys.argv[2] if len(sys.argv) > 2 else "/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/takeover"
launched = {}   # tool_use_id -> (description, model, effort, prompt)
agent_of = {}   # tool_use_id -> agentId
last = {}       # agentId or tool_use_id -> (status, summary)

for line in open(path):
    try:
        d = json.loads(line)
    except Exception:
        continue
    m = d.get("message") if isinstance(d.get("message"), dict) else {}
    content = m.get("content")
    if isinstance(content, list):
        for x in content:
            if x.get("type") == "tool_use" and x.get("name") in ("Agent", "Task"):
                i = x["input"]
                launched[x["id"]] = (i.get("description", ""), i.get("model"), i.get("effort"), i.get("prompt", ""))
            if x.get("type") == "tool_result" and x.get("tool_use_id") in launched:
                a = re.search(r"agentId: ?([0-9a-f]+)", json.dumps(x.get("content")))
                if a:
                    agent_of[x["tool_use_id"]] = a.group(1)
    for block in re.findall(r"<task-notification>.*?</task-notification>", line, re.S):
        tid = re.search(r"<task-id>(.*?)</task-id>", block)
        tu = re.search(r"<tool-use-id>(.*?)</tool-use-id>", block)
        st = re.search(r"<status>(.*?)</status>", block)
        sm = re.search(r"<summary>(.*?)</summary>", block, re.S)
        rec = (st.group(1) if st else "", sm.group(1) if sm else "")
        for key in (tid and tid.group(1), tu and tu.group(1)):
            if key:
                last[key] = rec

os.makedirs(save, exist_ok=True)
subdir = os.path.join(os.path.dirname(path), os.path.basename(path)[:-len(".jsonl")], "subagents")
for tu, (desc, model, effort, prompt) in launched.items():
    aid = agent_of.get(tu)
    status, summary = last.get(aid) or last.get(tu) or ("", "")
    finished = status in ("failed", "killed", "stopped") or (status == "completed" and "waiting on its own background work" not in summary)
    if finished:
        continue
    name = re.sub(r"[^a-z0-9]+", "-", desc.lower()).strip("-")[:50] or tu
    with open(os.path.join(save, name + ".prompt.md"), "w") as f:
        f.write(prompt)
    print(f"{desc} | {model} {effort} | agent {aid}\n  prompt: {save}/{name}.prompt.md\n  transcript: {subdir}/agent-{aid}.jsonl\n  last notice: {status or 'none'} {summary.strip()[:90]}")

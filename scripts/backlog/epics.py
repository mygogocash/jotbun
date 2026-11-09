"""Build EPICS.json (one entry per plan) from the plan headers. Usage: python3 -I epics.py PLAN_DIR TASKS.json OUT.json"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from backlog import PLANS
PROOF = {
    1: "Save offline on phone A and see it on phone B seconds after reconnecting; edit one record on both phones and see the conflict screen (local wrangler dev, email-code sign-in).",
    2: "The daily loop feels premium on a real phone.",
    3: "Drafts kept without edits.",
    4: "100 real Thai slips read correctly, and a real bank statement imported.",
    5: "A trip adds up to the satang.",
    6: "Outside-the-app features on real phones, staging and production with the owner, then a closed beta.",
}
plan_dir, tasks_path, out = sys.argv[1:4]
tasks = json.load(open(tasks_path, encoding="utf-8"))
epics = []
for plan, phase, name, title in PLANS:
    path = os.path.join(plan_dir, name)
    if not os.path.exists(path):
        continue
    text = open(path, encoding="utf-8").read()
    m = re.search(r"^\*\*Goal:\*\*\s*(.+)$", text, re.M)
    epics.append({"plan": plan, "phase": phase, "plan_file": name, "plan_title": title,
                  "goal": m.group(1).strip() if m else "", "proof": PROOF[phase],
                  "task_count": sum(1 for t in tasks if t["plan"] == plan)})
json.dump(epics, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(epics), "epics")

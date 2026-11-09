# Parse a workflow with PyYAML (a real YAML parser, unlike the test's line reader) and print each
# job's name, runner, timeout, steps and any if:, continue-on-error:, needs: or strategy: keys.
# Usage: python3 -I yaml-check.py <backend.yml>
import sys

import yaml

workflow = yaml.safe_load(open(sys.argv[1]))
print("top-level keys:", list(workflow.keys()))
print("triggers:", workflow[True] if True in workflow else workflow.get("on"))
print("concurrency:", workflow["concurrency"])
print("permissions:", workflow["permissions"])
for key, job in workflow["jobs"].items():
    steps = job["steps"]
    runs = [step["run"] for step in steps if "run" in step]
    forbidden = [k for k in job if k in ("if", "continue-on-error", "needs", "strategy")]
    forbidden += [k for step in steps for k in step if k in ("if", "continue-on-error")]
    print("%-11s name=%r runs-on=%s timeout=%s steps=%d runs=%d forbidden=%s" % (
        key, job["name"], job["runs-on"], job["timeout-minutes"], len(steps), len(runs), forbidden))
for key in ("sections-1", "sections-2", "sections-3"):
    if key in workflow["jobs"]:
        print(key, "pattern:", workflow["jobs"][key]["steps"][-1]["run"].split(" -t ", 1)[1])

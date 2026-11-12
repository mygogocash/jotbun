"""Runs the brief's own shell commands, in order, against a sim tree (P5-T2 planner kit).

Every ```bash block of the brief is run as written, with the worktree path and the
implementer's scratch path swapped for sim/wt and sim/s. Git commands are skipped
(the sim tree is no repository); the "same with typecheck:app/edge" lines are
spelled out. Prints each command's first line and its output's last lines.
Run: python3 -I tools/dryrun_brief.py <brief> <kit>
"""
import pathlib
import re
import subprocess
import sys

brief = pathlib.Path(sys.argv[1]).read_text()
kit = pathlib.Path(sys.argv[2]).resolve()
WT = "/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p5-t2"
S = "/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p5-t2"
PL = "/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p5-t2-planner"
sim_wt = str(kit / "sim" / "wt")
sim_s = str(kit / "sim" / "s")

blocks = re.findall(r"```bash\n(.*?)```", brief, flags=re.S)
commands = []
for block in blocks:
    for line in block.strip().splitlines():
        line = line.strip()
        if not line or line.startswith("/usr/bin/git"):
            continue
        commands.append(line)
        # The brief says "run the same with typecheck:app and typecheck:edge" after each root typecheck.
        if "npm run typecheck >" in line:
            for name in ("app", "edge"):
                commands.append(line.replace("npm run typecheck >", f"npm run typecheck:{name} >").replace("-typecheck-root.log", f"-typecheck-{name}.log"))

for command in commands:
    # The scratch path is a prefix of the kit path, so swap through placeholders.
    real = command.replace(PL, "@@PL@@").replace(WT, "@@WT@@").replace(S, "@@S@@")
    real = real.replace("@@WT@@", sim_wt).replace("@@S@@", sim_s).replace("@@PL@@", PL)
    if "BASE_SHA" in real and real.startswith("grep -c"):
        # Step 6.2 is an Edit in the brief; the dry run swaps the placeholder with sed first.
        subprocess.run(["sed", "-i", "", "s/BASE_SHA/c7aec126/", f"{sim_wt}/docs/implementation/receipts/P5-T2.md"], check=True)
    done = subprocess.run(["/bin/zsh", "-c", real], capture_output=True, text=True, timeout=1200)
    tail = (done.stdout + done.stderr).strip().splitlines()[-3:]
    print(f"$ {command[:140]}")
    for out in tail:
        print(f"    {out}")
    print(f"    [exit {done.returncode}]", flush=True)

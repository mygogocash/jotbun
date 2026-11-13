"""Runs the brief's own shell commands, in order, against a sim tree (P5-T17 planner kit).

Every ```bash block of the brief is run as written, with the worktree path and the
implementer's scratch path swapped for sim/wt and sim/s (through placeholders: the
scratch path is a prefix of the kit's). Git commands are skipped (the sim tree is
no repository); Step 6's Edit is done with sed. Prints each command's first line
and its output's last lines, for comparing with the brief's Expected lines.
Run: python3 -I tools/dryrun_brief.py <brief> <kit>
"""
import pathlib
import re
import subprocess
import sys

brief = pathlib.Path(sys.argv[1]).read_text()
kit = pathlib.Path(sys.argv[2]).resolve()
WT = "/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p5-t17"
S = "/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p5-t17"
PL = "/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p5-t17-planner"
sim_wt = str(kit / "sim" / "wt")
sim_s = str(kit / "sim" / "s")

commands = []
for block in re.findall(r"```bash\n(.*?)```", brief, flags=re.S):
    for line in block.strip().splitlines():
        line = line.strip()
        if line and not line.startswith("/usr/bin/git"):
            commands.append(line)

for command in commands:
    real = command.replace(PL, "@@PL@@").replace(WT, "@@WT@@").replace(S, "@@S@@")
    real = real.replace("@@WT@@", sim_wt).replace("@@S@@", sim_s).replace("@@PL@@", PL)
    if "BASE_SHA" in real and real.startswith("grep -c"):
        subprocess.run(["sed", "-i", "", "s/BASE_SHA/aea5efbd/", f"{sim_wt}/docs/implementation/receipts/P5-T17.md"], check=True)
    done = subprocess.run(["/bin/zsh", "-c", real], capture_output=True, text=True, timeout=1200)
    lines = (done.stdout + done.stderr).strip().splitlines()
    # The RED failing-case list and the counts need every line; other outputs their last three.
    tail = lines if ("sort -u" in command or "^ℹ" in command) else lines[-3:]
    print(f"$ {command[:150]}")
    for out in tail:
        print(f"    {out}")
    print(f"    [exit {done.returncode}]", flush=True)

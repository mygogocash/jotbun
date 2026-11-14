#!/usr/bin/env python3
"""Dry run of briefs/P3-T9.md: runs the brief's own ```bash lines for the steps asked, on sim/wt, with S as
sim/dryrun-s and PL as the kit. WT, PL and S are swapped in one pass, so the kit's path (which S's is a prefix of in
the real layout) is never mangled. Git commands are skipped (the sim has no repository; the install is borrowed), and so
is Step 0's base typecheck (the borrowed install holds the final contracts). Usage: python3 -I dryrun.py <brief> <step>..."""
import re
import subprocess
import sys

KIT = '/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p3-t9-planner'
WT = f'{KIT}/sim/wt'
S = f'{KIT}/sim/dryrun-s'
brief, steps = sys.argv[1], sys.argv[2:]
text = open(brief, encoding='utf-8').read()
sections = re.split(r'^## Step (\d+):.*$', text, flags=re.M)
bodies = {sections[i]: sections[i + 1] for i in range(1, len(sections) - 1, 2)}


def commands(body):
    found = []
    for block in re.finditer(r'```bash\n(.*?)```', body, re.S):
        found.extend(line.strip() for line in block.group(1).splitlines() if line.strip())
    return found


def swap(command):
    def repl(match):
        return {'WT': WT, 'PL': KIT}.get(match.group(1)) if match.group(1) else S
    return re.sub(r'\b(WT|PL)\b|(?<![\w.-])S(?=[/\s]|$)', repl, command)


for step in steps:
    for command in commands(bodies[step]):
        if command.startswith('/usr/bin/git') or 'typecheck-0' in command:
            print(f'## step {step} SKIP: {command}', flush=True)
            continue
        done = subprocess.run(['/bin/zsh', '-c', swap(command)], capture_output=True, text=True, timeout=900)
        print(f'## step {step} RUN: {command}\n## exit {done.returncode}', flush=True)
        output = (done.stdout + done.stderr).rstrip('\n')
        if output:
            print(output, flush=True)

#!/usr/bin/env python3
"""Dry run of briefs/P4-T7.md: runs the brief's own ```bash lines for the steps asked, on sim/wt, with S as
proof/dryrun-s and PL as the kit. WT, PL and S are swapped in one regex pass, so the kit's path (which S's is a
prefix of in the real layout) is never mangled. Git commands, npm ci and npm run install:edge are skipped (the sim
has no repository, and its installs are symlinks to tree/'s). Usage:
  python3 -I dryrun.py <brief> <step>[:<from>[-<to>]] ...   (a step, or its commands from..to, 1-based)"""
import re
import subprocess
import sys

KIT = '/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p4-t7-planner'
WT = f'{KIT}/sim/wt'
S = f'{KIT}/proof/dryrun-s'
brief, steps = sys.argv[1], sys.argv[2:]
text = open(brief, encoding='utf-8').read()
sections = re.split(r'^## Step (\d+):.*$', text.split('## Your final message')[0], flags=re.M)
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


for asked in steps:
    step, _, picks = asked.partition(':')
    chosen = commands(bodies[step])
    if picks:
        first, _, last = picks.partition('-')
        chosen = chosen[int(first) - 1:int(last or first)]
    for command in chosen:
        if command.startswith('/usr/bin/git') or 'npm ci' in command or 'install:edge' in command:
            print(f'## step {step} SKIP: {command}', flush=True)
            continue
        done = subprocess.run(['/bin/zsh', '-c', swap(command)], capture_output=True, text=True, timeout=590)
        print(f'## step {step} RUN: {command}\n## exit {done.returncode}', flush=True)
        output = (done.stdout + done.stderr).rstrip('\n')
        if output:
            print(output, flush=True)

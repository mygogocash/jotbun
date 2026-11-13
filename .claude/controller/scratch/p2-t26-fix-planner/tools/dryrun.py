#!/usr/bin/env python3
"""Dry run of the fix brief: runs the brief's own commands for the steps asked, with WT as the planner's proof tree
(tree/, a copy of 52110318, put in its base form first) and S as logs/fixer-dryrun. Commands are the lines of the
brief's ```bash blocks and its inline code spans that start with a shell command, in order, up to Step 7. WT's and
S's paths are swapped by pattern, so the kit's own path (which S's is a prefix of) is never touched. Git commands and
npm ci are skipped (the proof tree has no repository, and its install is its own). Prints each command, its exit
code and its output. Usage: python3 -I dryrun.py <brief> <step>[:<from>[-<to>]] ...   (1-based, inclusive)"""
import re
import subprocess
import sys

KIT = '/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner'
WT_REAL = '/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26'
S_REAL = '/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix'
WT = f'{KIT}/tree'
S = f'{KIT}/logs/fixer-dryrun'
STARTS = ('cd /', 'ls /', 'mkdir -p /', 'python3 -I /', 'diff /', 'grep ', 'cp /', '/usr/bin/git ')
brief, steps = sys.argv[1], sys.argv[2:]
with open(brief, encoding='utf-8') as handle:
    text = handle.read()
sections = re.split(r'^## Step (\d+):.*$', text.split('## Step 7:')[0], flags=re.M)
bodies = {sections[i]: sections[i + 1] for i in range(1, len(sections) - 1, 2)}


def commands(body):
    found = []
    for block in re.finditer(r'```bash\n(.*?)```|`([^`\n]+)`', body, re.S):
        if block.group(1) is not None:
            found.extend(line.strip() for line in block.group(1).splitlines() if line.strip())
        elif block.group(2).startswith(STARTS):
            found.append(block.group(2))
    return found


def swap(command):
    command = re.sub(re.escape(WT_REAL) + r'(?![\w.-])', WT, command)
    return re.sub(re.escape(S_REAL) + r'(?![\w.-])', S, command)


for asked in steps:
    step, _, picks = asked.partition(':')
    chosen = commands(bodies[step])
    first = 1
    if picks:
        start, _, end = picks.partition('-')
        first = int(start)
        chosen = chosen[int(start) - 1:int(end or start)]
    for number, command in enumerate(chosen, first):
        if command.startswith('/usr/bin/git') or 'npm ci' in command:
            print(f'## step {step}.{number} SKIP: {command}', flush=True)
            continue
        done = subprocess.run(['/bin/zsh', '-c', swap(command)], capture_output=True, text=True, timeout=590)
        print(f'## step {step}.{number} RUN: {command}\n## exit {done.returncode}', flush=True)
        output = (done.stdout + done.stderr).rstrip('\n')
        if output:
            print(output, flush=True)

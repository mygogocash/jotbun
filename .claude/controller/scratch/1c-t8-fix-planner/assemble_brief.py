#!/usr/bin/env python3
"""Builds the 1C-T8 fix brief from brief-template.md: each {{DIFF:<path>}} becomes
that file's diff from diffs/, {{COMMIT}} the commit message, and each count
placeholder its value. Usage: python3 -I assemble_brief.py <planner dir> <out path> KEY=VALUE..."""
import os
import re
import sys

pl, out = sys.argv[1], sys.argv[2]
values = dict(arg.split('=', 1) for arg in sys.argv[3:])
text = open(os.path.join(pl, 'brief-template.md'), encoding='utf-8').read()


def diff_for(match):
    path = match.group(1)
    name = path.replace('/', '_') + '.diff'
    body = open(os.path.join(pl, 'diffs', name), encoding='utf-8').read()
    return body.rstrip('\n')


text = re.sub(r'\{\{DIFF:([^}]+)\}\}', diff_for, text)
text = text.replace('{{COMMIT}}', open(os.path.join(pl, 'commit-msg.txt'), encoding='utf-8').read().rstrip('\n'))
for key, value in values.items():
    text = text.replace('{{' + key + '}}', value)
left = re.findall(r'\{\{[A-Z_]+(?::[^}]*)?\}\}', text)
if left:
    sys.exit(f'unfilled placeholders: {sorted(set(left))}')
with open(out, 'w', encoding='utf-8') as handle:
    handle.write(text)
print(f'wrote {out}: {len(text.splitlines())} lines')

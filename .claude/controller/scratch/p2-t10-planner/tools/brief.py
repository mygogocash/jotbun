#!/usr/bin/env python3
"""Builds the P2-T10 brief from tools/brief.template.md.

Usage: python3 -I brief.py <kit> <out>

A line `{{file:<path>}}` becomes a fenced block holding real/<path> byte for
byte; `{{stub:<path>}}` the same from stubs/; `{{diff:<name>}}` the same
from diffs/<name>. So the code in the brief is the code in the kit.
"""
import os
import re
import sys

MARK = re.compile(r'^\{\{(file|stub|diff):([^}]+)\}\}$')
FENCE = {'.ts': 'ts', '.tsx': 'tsx', '.diff': 'diff', '.py': 'python'}


def block(kit, kind, name):
    folder = {'file': 'real', 'stub': 'stubs', 'diff': 'diffs'}[kind]
    path = os.path.join(kit, folder, name)
    with open(path, encoding='utf-8') as handle:
        text = handle.read()
    if '```' in text:
        raise SystemExit(f'{path} holds a fence')
    language = FENCE.get(os.path.splitext(name)[1], '')
    return f'```{language}\n{text}```\n'


def main():
    kit, out = sys.argv[1], sys.argv[2]
    with open(os.path.join(kit, 'tools/brief.template.md'), encoding='utf-8') as handle:
        lines = handle.read().split('\n')
    built = []
    for line in lines:
        match = MARK.match(line.strip())
        if match:
            indent = line[: len(line) - len(line.lstrip())]
            for row in block(kit, match.group(1), match.group(2)).rstrip('\n').split('\n'):
                built.append(indent + row if row else row)
        else:
            built.append(line)
    with open(out, 'w', encoding='utf-8') as handle:
        handle.write('\n'.join(built))


if __name__ == '__main__':
    main()

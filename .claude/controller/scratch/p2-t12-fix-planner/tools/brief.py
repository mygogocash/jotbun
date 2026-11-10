#!/usr/bin/env python3
"""Builds the P2-T12 fix brief from tools/brief.template.md.

Usage: python3 -I brief.py <kit> <out>

A line `{{diff:<name>}}` becomes a fenced block holding diffs/<name> byte for
byte. A line `{{lines:<log>}}` becomes logs/<log>, indented three spaces, inside
the fence the template opens around it (the mutant runs' own output). So the
diffs and the mutant lines in the brief are the kit's own.
"""
import os
import re
import sys

MARK = re.compile(r'^\{\{(diff|lines):([^}]+)\}\}$')


def main():
    kit, out = sys.argv[1], sys.argv[2]
    with open(os.path.join(kit, 'tools/brief.template.md'), encoding='utf-8') as handle:
        lines = handle.read().split('\n')
    built = []
    for line in lines:
        match = MARK.match(line.strip())
        if not match:
            built.append(line)
            continue
        kind, name = match.groups()
        if kind == 'diff':
            with open(os.path.join(kit, 'diffs', name), encoding='utf-8') as handle:
                text = handle.read()
            if '```' in text:
                raise SystemExit(f'{name} holds a fence')
            built.extend(['```diff', *text.rstrip('\n').split('\n'), '```'])
        else:
            with open(os.path.join(kit, 'logs', name), encoding='utf-8') as handle:
                built.extend('   ' + row for row in handle.read().rstrip('\n').split('\n'))
    if any(re.search(r'\{\{(diff|lines):', line) for line in built):
        raise SystemExit('a placeholder is left in the brief')
    with open(out, 'w', encoding='utf-8') as handle:
        handle.write('\n'.join(built))


if __name__ == '__main__':
    main()

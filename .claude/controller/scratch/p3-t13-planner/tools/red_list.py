#!/usr/bin/env python3
"""The RED list: one line per failing case, '<case> :: <first error line>', in the order vitest's "Failed Tests"
section prints them (render), or the Node runner's "failing tests:" section (unit). Usage:
python3 -I red_list.py render|unit <log>"""
import re
import sys

kind, log = sys.argv[1], sys.argv[2]
text = open(log, encoding='utf-8').read()
out = []
if kind == 'render':
    tail = text.split('Failed Tests', 1)[1]
    for match in re.finditer(r'^ FAIL  \S+ > (.+?)\n(?:.*\n)*?(\w*Error\b.*)$', tail, re.M):
        out.append(f'{match.group(1).strip()} :: {match.group(2).strip()}')
else:
    tail = text.split('failing tests:', 1)[1]
    for match in re.finditer(r'^✖ (.+?) \([\d.]+ms\)\n\s+(\w*Error\b.*)$', tail, re.M):
        out.append(f'{match.group(1).strip()} :: {match.group(2).strip()}')
print('\n'.join(out))

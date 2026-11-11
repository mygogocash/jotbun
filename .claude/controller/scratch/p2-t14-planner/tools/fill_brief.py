#!/usr/bin/env python3
"""Fills the brief's RED render lines and mutant lines from the planner's logs.

Usage: python3 -I fill_brief.py <template> <logs dir> <out>
"""
import re
import sys

template, logs, out = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(template, encoding='utf-8').read()

# The RED render failures: each failing case and its first AssertionError line, in the file's order.
red = open(f'{logs}/red-render.log', encoding='utf-8').read()
failed = red[red.index('Failed Tests'):]
pairs = re.findall(r'^ FAIL  src/wallet/add/AmountStep\.render\.test\.tsx > (.+?)\n(?:.*\n)*?^(AssertionError: .+)$', failed, re.M)
assert len(pairs) == 12, len(pairs)
red_lines = '\n'.join(f'   - `{name}`: `{message[len("AssertionError: "):]}`' for name, message in pairs)

# The mutant lines, without the per-run counts (those differ by machine), as P2-T13's brief lists them.
lines = []
for line in open(f'{logs}/mutants.out', encoding='utf-8'):
    line = line.rstrip('\n')
    match = re.match(r'^(\S+) (KILLED|SURVIVED(?: \(equivalent\))?): (.+?) \[[^\]]+\] -> Tests .+?; first failing: "(.+?)"; AssertionError', line)
    if match:
        ident, mark, description, first = match.groups()
        lines.append(f'   {ident} {mark}: {description} -> {first}')
    elif re.match(r'^\d+ killed, \d+ survived, \d+ not as expected$', line):
        lines.append(f'   {line}')
assert len(lines) == 93, len(lines)

text = text.replace('{{RED_RENDER_LINES}}', red_lines).replace('{{MUTANT_LINES}}', '\n'.join(lines))
assert '{{' not in text
open(out, 'w', encoding='utf-8').write(text)
print(f'filled: {len(pairs)} RED lines, {len(lines)} mutant lines')

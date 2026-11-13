#!/usr/bin/env python3
"""For each mutant log (<log dir>/<id>.log), the error kind of every failing case, in order: from vitest's "Failed
Tests" section for the render suite, or from the Node test runner's "failing tests:" section for the Node file. A kill
counts as an assertion only when every failing case fails on an AssertionError. Prints the logs that break that rule,
then a count. Usage: python3 -I first_errors.py <log dir> [ids...]"""
import os
import re
import sys

folder = sys.argv[1]
wanted = sys.argv[2:]
names = sorted(name[:-4] for name in os.listdir(folder) if name.endswith('.log'))
bad = 0
for ident in (wanted or names):
    text = open(os.path.join(folder, f'{ident}.log'), encoding='utf-8').read()
    if 'Failed Tests' in text:
        tail = text.split('Failed Tests', 1)[1]
        kinds = re.findall(r'^ FAIL  .+?\n(?:.*\n)*?(\w*Error)\b', tail, re.M)
    elif 'failing tests:' in text:
        tail = text.split('failing tests:', 1)[1]
        kinds = re.findall(r'^✖ .+?\n\s+(\w*Error)\b', tail, re.M)
    else:
        kinds = []
    other = [kind for kind in kinds if kind != 'AssertionError']
    if other or not kinds:
        bad += 1
        print(ident, kinds)
print(f'{len(wanted or names)} logs, {bad} with a failing case that is not an AssertionError')

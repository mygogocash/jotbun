#!/usr/bin/env python3
"""For each mutant log (logs/mutant-logs/<id>.log), the error kind of every failing case, in file order, as vitest
reports them in its "Failed Tests" section: a kill counts as an assertion only when each failing case fails on an
AssertionError. Usage: python3 -I first_errors.py <log dir> [ids...]"""
import os
import re
import sys

folder = sys.argv[1]
wanted = sys.argv[2:]
names = sorted(name[:-4] for name in os.listdir(folder) if name.endswith('.log'))
bad = 0
for ident in (wanted or names):
    text = open(os.path.join(folder, f'{ident}.log'), encoding='utf-8').read()
    tail = text.split('Failed Tests', 1)[1] if 'Failed Tests' in text else ''
    kinds = re.findall(r'^ FAIL  .+?\n(?:.*\n)*?(\w*Error)\b', tail, re.M)
    other = [kind for kind in kinds if kind != 'AssertionError']
    if other or not kinds:
        bad += 1
        print(ident, kinds)
print(f'{len(wanted or names)} logs, {bad} with a failing case that is not an AssertionError')

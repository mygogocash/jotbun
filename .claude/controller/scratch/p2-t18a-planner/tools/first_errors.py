#!/usr/bin/env python3
"""The error kind of every failing case in a vitest log or a Node test log. A RED, or a kill, counts as an assertion
only when each failing case fails on an AssertionError.

- vitest: its "Failed Tests" section is a list of blocks split by ⎯⎯[n/N]⎯ lines; a block names one or more
  failing cases (` FAIL  file > case`, several when their errors are the same) and then one error (`XxxError: ...`).
- node --test: the "failing tests:" section lists each failing case (`✖ name`) with its error (`XxxError ...`).

Usage: python3 -I first_errors.py <log file or folder> [ids...]
With a folder, it reads <folder>/<id>.log for each id (every .log in it when none is named)."""
import os
import re
import sys


def kinds_of(text):
    kinds = []
    if 'Failed Tests' in text:
        tail = text.split('Failed Tests', 1)[1]
        for block in re.split(r'^⎯+\[\d+/\d+\]⎯*$', tail, flags=re.M):
            cases = re.findall(r'^ FAIL  .+$', block, re.M)
            error = re.search(r'^(\w*Error)\b', block, re.M)
            kinds += [error.group(1) if error else 'unknown'] * len(cases)
        return kinds
    if 'failing tests:' in text:
        tail = text.split('failing tests:', 1)[1]
        for block in re.split(r'^✖ ', tail, flags=re.M)[1:]:
            error = re.search(r'^\s+(\w*Error)\b', block, re.M)
            kinds.append(error.group(1) if error else 'unknown')
    return kinds


target = sys.argv[1]
if os.path.isdir(target):
    wanted = sys.argv[2:] or sorted(name[:-4] for name in os.listdir(target) if name.endswith('.log'))
    paths = [(ident, os.path.join(target, f'{ident}.log')) for ident in wanted]
else:
    paths = [(os.path.basename(target), target)]
bad = 0
for ident, path in paths:
    with open(path, encoding='utf-8') as handle:
        kinds = kinds_of(handle.read())
    other = [kind for kind in kinds if kind != 'AssertionError']
    if other or not kinds:
        bad += 1
    print(f"{ident}: {len(kinds)} failing case(s): {', '.join(sorted(set(kinds))) or 'none'}")
print(f'{len(paths)} logs, {bad} with a failing case that is not an AssertionError (or with none)')
sys.exit(1 if bad else 0)

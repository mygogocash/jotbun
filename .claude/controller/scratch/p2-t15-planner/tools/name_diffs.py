#!/usr/bin/env python3
"""Turns diffs/raw-*.diff (git diff --no-index --full-index orig/<path> real/<path>)
into diffs/<path with / as _>.diff with repo paths (a/<path>, b/<path>), so
git apply --3way can merge them, then removes the raw files.

Usage: python3 -I name_diffs.py <planner folder>
"""
import os
import re
import sys

planner = sys.argv[1]
folder = os.path.join(planner, 'diffs')
for name in sorted(os.listdir(folder)):
    if not name.startswith('raw-'):
        continue
    with open(os.path.join(folder, name), encoding='utf-8') as handle:
        text = handle.read()
    path = re.search(r'^diff --git a/orig/(\S+) b/real/\S+$', text, re.M).group(1)
    fixed = []
    for line in text.splitlines(keepends=True):
        if line.startswith(('diff --git ', '--- ', '+++ ')):
            line = line.replace('a/orig/', 'a/').replace('b/real/', 'b/')
        fixed.append(line)
    target = os.path.join(folder, path.replace('/', '_') + '.diff')
    with open(target, 'w', encoding='utf-8') as handle:
        handle.write(''.join(fixed))
    os.remove(os.path.join(folder, name))
    print(target)

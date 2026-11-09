#!/usr/bin/env python3
"""Checks that every appendix block of the brief is its kit file, byte for byte. Usage: python3 -I check_appendix.py <brief> <kit dir>"""
import hashlib, re, sys
brief, kit = sys.argv[1], sys.argv[2]
lines = open(brief, encoding='utf-8').read().split('\n')
ok = bad = 0
i = 0
while i < len(lines):
    m = re.match(r'^`PL/(\S+)` \(SHA-256 `([0-9a-f]{12})\.\.\.`\):$', lines[i])
    if not m:
        i += 1
        continue
    rel, prefix = m.groups()
    fence_line = lines[i + 2]
    fence = re.match(r'^(`{3,})', fence_line).group(1)
    j = i + 3
    while lines[j] != fence:
        j += 1
    body = '\n'.join(lines[i + 3:j]) + '\n'
    data = open(f'{kit}/{rel}', 'rb').read()
    same = body.encode('utf-8') == data and hashlib.sha256(data).hexdigest().startswith(prefix)
    ok += same
    bad += not same
    if not same:
        print('MISMATCH', rel)
    i = j + 1
print(f'blocks ok={ok} bad={bad}')

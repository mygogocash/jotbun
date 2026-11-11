#!/usr/bin/env python3
"""Writes the kit's SHA256SUMS and SHA256SUMS.logs. Usage: python3 -I sums.py <kit>

SHA256SUMS: real/, orig/, stubs/, diffs/, tools/, the lists and the logs' .out
files. SHA256SUMS.logs: every .log under logs/ (gitignored, so they are lost in
state commits). Paths are relative to the kit; check with
`cd <kit> && shasum -a 256 -c SHA256SUMS`.
"""
import hashlib
import os
import sys

kit = sys.argv[1]
KEPT = ['real', 'orig', 'stubs', 'diffs', 'tools']
LISTS = ['files.txt', 'shared.txt', 'SHA256SUMS.orig-in-wt', 'SHA256SUMS.red-in-wt', 'SHA256SUMS.real-in-wt', 'SHA256SUMS.datechip-in-wt']


def digest(rel):
    with open(os.path.join(kit, rel), 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def walk(top):
    for base, dirs, files in os.walk(os.path.join(kit, top)):
        dirs.sort()
        for name in sorted(files):
            if name == '__pycache__' or name.endswith('.pyc'):
                continue
            yield os.path.relpath(os.path.join(base, name), kit)


kept = [rel for top in KEPT for rel in walk(top)] + LISTS
outs = [rel for rel in walk('logs') if not rel.endswith('.log')]
logs = [rel for rel in walk('logs') if rel.endswith('.log')]
with open(os.path.join(kit, 'SHA256SUMS'), 'w', encoding='utf-8') as handle:
    for rel in kept + outs:
        handle.write(f'{digest(rel)}  {rel}\n')
with open(os.path.join(kit, 'SHA256SUMS.logs'), 'w', encoding='utf-8') as handle:
    for rel in logs:
        handle.write(f'{digest(rel)}  {rel}\n')
print(f'SHA256SUMS {len(kept) + len(outs)} lines, SHA256SUMS.logs {len(logs)} lines')

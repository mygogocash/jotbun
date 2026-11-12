#!/usr/bin/env python3
"""Writes the kit's SHA256SUMS, SHA256SUMS.logs and the three *-in-wt lists.

Usage: python3 -I sums.py <kit>

- SHA256SUMS.orig-in-wt: afc19276's files the round changes or reads (orig/), paths relative to WT.
- SHA256SUMS.red-in-wt: the two tests from real/ and the three stubs from stubs/, relative to WT.
- SHA256SUMS.real-in-wt: every file of the round (real/, files.txt), relative to WT.
- SHA256SUMS: everything kept (real/, orig/, stubs/, diffs/, tools/, the lists, and logs/ but its *.log files).
- SHA256SUMS.logs: the *.log files under logs/ (gitignored, so lost in state commits).
work/ (the scratch tree) is in neither. No nested git repository is in the kit.
"""
import hashlib
import os
import sys

kit = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def digest(rel):
    with open(os.path.join(kit, rel), 'rb') as fp:
        return hashlib.sha256(fp.read()).hexdigest()


def walk(top):
    for base, dirs, files in os.walk(os.path.join(kit, top)):
        dirs[:] = sorted(d for d in dirs if d not in ('.git', '__pycache__'))
        for name in sorted(files):
            if name.endswith('.pyc') or name == '.DS_Store':
                continue
            yield os.path.relpath(os.path.join(base, name), kit)


def write(name, lines):
    with open(os.path.join(kit, name), 'w', encoding='utf-8') as fp:
        fp.write(''.join(f'{line}\n' for line in lines))


with open(os.path.join(kit, 'files.txt'), encoding='utf-8') as fp:
    files = [line.strip() for line in fp if line.strip()]

orig = sorted(os.path.relpath(path, 'orig') for path in walk('orig'))
write('SHA256SUMS.orig-in-wt', [f"{digest(os.path.join('orig', rel))}  {rel}" for rel in orig])

tests = ['apps/app/src/ui/dateStep.test.ts', 'apps/app/src/wallet/insights/WalletInsights.render.test.tsx']
stubs = sorted(os.path.relpath(path, 'stubs') for path in walk('stubs'))
red = sorted([(rel, 'real') for rel in tests] + [(rel, 'stubs') for rel in stubs])
write('SHA256SUMS.red-in-wt', [f"{digest(os.path.join(kind, rel))}  {rel}" for rel, kind in red])

write('SHA256SUMS.real-in-wt', [f"{digest(os.path.join('real', rel))}  {rel}" for rel in sorted(files)])

LISTS = ['files.txt', 'SHA256SUMS.orig-in-wt', 'SHA256SUMS.red-in-wt', 'SHA256SUMS.real-in-wt']
kept = [rel for top in ('real', 'orig', 'stubs', 'diffs', 'tools') for rel in walk(top)] + LISTS
outs = [rel for rel in walk('logs') if not rel.endswith('.log')]
logs = [rel for rel in walk('logs') if rel.endswith('.log')]
write('SHA256SUMS', [f'{digest(rel)}  {rel}' for rel in sorted(kept + outs)])
write('SHA256SUMS.logs', [f'{digest(rel)}  {rel}' for rel in sorted(logs)])
print(f'SHA256SUMS: {len(kept) + len(outs)} lines, SHA256SUMS.logs: {len(logs)} lines, orig {len(orig)}, red {len(red)}, real {len(files)}')

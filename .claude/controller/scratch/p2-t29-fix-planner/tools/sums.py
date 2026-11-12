#!/usr/bin/env python3
"""Writes the P2-T29 fix kit's checksum lists. Usage: python3 -I sums.py <kit>

- SHA256SUMS: every kit file but work/ (the planner's scratch copy), the logs
  and the lists themselves, paths relative to the kit;
- SHA256SUMS.logs: every *.log under logs/ (gitignored, so kept apart);
- SHA256SUMS.orig-in-wt: cee7eff5's copies (orig/) at their repo paths, to
  check the fixer's worktree before the round;
- SHA256SUMS.red-in-wt: the three test files (real/) and the four stubs, at
  their repo paths, for RED;
- SHA256SUMS.real-in-wt: every real/ file at its repo path, for GREEN.
"""
import hashlib
import os
import sys

kit = sys.argv[1]
LISTS = {'SHA256SUMS', 'SHA256SUMS.logs', 'SHA256SUMS.orig-in-wt', 'SHA256SUMS.red-in-wt', 'SHA256SUMS.real-in-wt'}
TESTS = [
    'apps/app/src/wallet/categories/WalletCategories.render.test.tsx',
    'apps/app/src/screens/redesign/planning/categoryCommands.render.test.tsx',
    'apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx',
]


def digest(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def files_under(top):
    found = []
    for root, dirs, names in os.walk(os.path.join(kit, top)):
        dirs[:] = sorted(d for d in dirs if d != '__pycache__')
        for name in sorted(names):
            found.append(os.path.relpath(os.path.join(root, name), os.path.join(kit, top)))
    return sorted(found)


def write(name, entries):
    with open(os.path.join(kit, name), 'w', encoding='utf-8') as handle:
        for sha, rel in entries:
            handle.write(f'{sha}  {rel}\n')


everything = []
logs = []
for root, dirs, names in os.walk(kit):
    rel_root = os.path.relpath(root, kit)
    if rel_root == '.':
        dirs[:] = sorted(d for d in dirs if d != 'work')
    dirs[:] = sorted(d for d in dirs if d != '__pycache__')
    for name in sorted(names):
        rel = os.path.normpath(os.path.join(rel_root, name))
        if rel in LISTS:
            continue
        if name.endswith('.log'):
            logs.append((digest(os.path.join(kit, rel)), rel))
        else:
            everything.append((digest(os.path.join(kit, rel)), rel))

write('SHA256SUMS.orig-in-wt', [(digest(os.path.join(kit, 'orig', rel)), rel) for rel in files_under('orig')])
red = [(digest(os.path.join(kit, 'real', rel)), rel) for rel in TESTS]
red += [(digest(os.path.join(kit, 'stubs', rel)), rel) for rel in files_under('stubs')]
write('SHA256SUMS.red-in-wt', sorted(red, key=lambda entry: entry[1]))
write('SHA256SUMS.real-in-wt', [(digest(os.path.join(kit, 'real', rel)), rel) for rel in files_under('real')])
write('SHA256SUMS.logs', sorted(logs, key=lambda entry: entry[1]))
# The three *-in-wt lists are kit files too.
for name in ('SHA256SUMS.orig-in-wt', 'SHA256SUMS.red-in-wt', 'SHA256SUMS.real-in-wt'):
    everything.append((digest(os.path.join(kit, name)), name))
write('SHA256SUMS', sorted(everything, key=lambda entry: entry[1]))
print(f'SHA256SUMS {len(everything)}, logs {len(logs)}')

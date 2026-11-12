#!/usr/bin/env python3
"""Writes the kit's diffs/: one unified diff per file the round writes, against
cee7eff5 (orig/; /dev/null for a new file), paths a/<repo path> and b/<repo path>;
CategoriesScreen.tsx also against 2ff43b0e (base/), the move and nothing else; and
p2-t29-fix.patch, the whole round against cee7eff5.

Usage: python3 -I diffs.py <kit>
"""
import os
import subprocess
import sys

kit = sys.argv[1]
real = os.path.join(kit, 'real')
out = os.path.join(kit, 'diffs')
os.makedirs(out, exist_ok=True)
for name in os.listdir(out):
    os.remove(os.path.join(out, name))


def unified(old, new, rel):
    run = subprocess.run(
        ['/usr/bin/git', 'diff', '--no-index', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', old, new],
        capture_output=True, text=True,
    )
    if run.returncode not in (0, 1):
        raise SystemExit(run.stderr)
    text = run.stdout
    # git names the files by their disk paths; name them by their repo path.
    old_name = '/dev/null' if old == '/dev/null' else f'a/{rel}'
    lines = []
    for line in text.splitlines(keepends=True):
        if line.startswith('diff --git '):
            line = f'diff --git a/{rel} b/{rel}\n'
        elif line.startswith('--- '):
            line = f'--- {old_name}\n'
        elif line.startswith('+++ '):
            line = f'+++ b/{rel}\n'
        lines.append(line)
    return ''.join(lines)


files = []
for root, _, names in os.walk(real):
    for name in names:
        files.append(os.path.relpath(os.path.join(root, name), real))
patch = []
for rel in sorted(files):
    orig = os.path.join(kit, 'orig', rel)
    text = unified(orig if os.path.exists(orig) else '/dev/null', os.path.join(real, rel), rel)
    with open(os.path.join(out, rel.replace('/', '_') + '.diff'), 'w', encoding='utf-8') as handle:
        handle.write(text)
    patch.append(text)
    base = os.path.join(kit, 'base', rel)
    if rel.endswith('CategoriesScreen.tsx') and os.path.exists(base):
        with open(os.path.join(out, rel.replace('/', '_') + '.base.diff'), 'w', encoding='utf-8') as handle:
            handle.write(unified(base, os.path.join(real, rel), rel))
with open(os.path.join(out, 'p2-t29-fix.patch'), 'w', encoding='utf-8') as handle:
    handle.write(''.join(patch))
print(len(files), 'files;', len(os.listdir(out)), 'diffs')

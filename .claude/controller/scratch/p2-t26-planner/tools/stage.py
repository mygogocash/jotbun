#!/usr/bin/env python3
"""P2-T26 kit: puts a tree in one of three forms (or checks its base) and checks each file's sha256.

Usage: python3 -I stage.py <kit folder> <tree root> check-base|base|red|green

- check-base: writes nothing; checks the six shared files equal orig/ and the five new files are absent.
- base:  the six shared files as they are at the base (orig/); the five new files absent.
- red:   the three test files and the copy table final (real/); the three new screen files and dateStep.ts as
         typed stubs (stubs/); recordSections.tsx and the route as at the base; recordScreens.tsx absent.
- green: every file final (real/).
Prints one line per file and exits 0 only when every file matches its source byte for byte.
"""
import hashlib
import os
import shutil
import sys

kit, tree, form = sys.argv[1], sys.argv[2], sys.argv[3]
files = []
with open(os.path.join(kit, 'tools/files.txt'), encoding='utf-8') as handle:
    for line in handle:
        kind, path = line.split(maxsplit=1)
        files.append((kind, path.strip()))

STUBBED = {
    'apps/app/src/wallet/records/WalletRecordScreen.tsx',
    'apps/app/src/wallet/records/RecordActionsTray.tsx',
    'apps/app/src/wallet/records/WalletUndoBar.tsx',
    'apps/app/src/ui/dateStep.ts',
}
FINAL_AT_RED = {
    'apps/app/src/wallet/records/WalletRecord.render.test.tsx',
    'apps/app/src/screens/redesign/SpendRoutes.render.test.tsx',
    'apps/app/src/ui/dateStep.test.ts',
    'apps/app/src/wallet/records/copy.ts',
}


def source(kind, path):
    """The file this form takes for `path`, or None when the form leaves it absent."""
    if form == 'green':
        return os.path.join(kit, 'real', path)
    if form == 'red':
        if path in STUBBED:
            return os.path.join(kit, 'stubs', path)
        if path in FINAL_AT_RED:
            return os.path.join(kit, 'real', path)
    return os.path.join(kit, 'orig', path) if kind == 'shared' else None


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


if form not in ('check-base', 'base', 'red', 'green'):
    raise SystemExit('form: check-base, base, red or green')
bad = 0
for kind, path in files:
    target = os.path.join(tree, path)
    if form == 'check-base':
        if kind == 'shared':
            ok = os.path.exists(target) and sha(target) == sha(os.path.join(kit, 'orig', path))
            print(f"{'OK ' if ok else 'BAD'} base    {path}")
        else:
            ok = not os.path.exists(target)
            print(f"{'OK ' if ok else 'BAD'} absent  {path}")
        bad += 0 if ok else 1
        continue
    origin = source(kind, path)
    if origin is None:
        if os.path.exists(target):
            os.remove(target)
        ok = not os.path.exists(target)
        print(f"{'OK ' if ok else 'BAD'} absent  {path}")
    else:
        os.makedirs(os.path.dirname(target), exist_ok=True)
        shutil.copyfile(origin, target)
        ok = sha(origin) == sha(target)
        print(f"{'OK ' if ok else 'BAD'} {os.path.relpath(origin, kit).split('/')[0]:7} {path} {sha(target)[:12]}")
    bad += 0 if ok else 1
print(f'{form}: {len(files)} files, {bad} not as expected')
sys.exit(1 if bad else 0)

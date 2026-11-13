#!/usr/bin/env python3
"""P2-T18a kit: puts a tree in one of three forms (or checks its base) and checks each file's sha256.

Usage: python3 -I stage.py <kit folder> <tree root> check-base|base|red|green

- check-base: writes nothing; checks the ten changed files equal orig/.
- base:  the ten files as they are at the base (orig/).
- red:   the four test files final (real/); savedMoment.ts as its RED stub (stubs/: the base with todayOutMinor's
         new optional input, unused); SavedToastHost.tsx, NewWalletFlow.tsx, WalletEditScreen.tsx and the two
         P2-T21 receipts as at the base.
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
    'apps/app/src/wallet/saved/savedMoment.ts',
}
FINAL_AT_RED = {
    'apps/app/src/wallet/saved/savedMoment.test.ts',
    'apps/app/src/wallet/saved/SavedMoment.render.test.tsx',
    'apps/app/src/wallet/wallets/NewWallet.render.test.tsx',
    'apps/app/src/wallet/wallets/WalletEdit.render.test.tsx',
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

#!/usr/bin/env python3
"""P2-T26 fix kit: puts a tree in one of three forms (or checks its base) and checks each file's sha256.

Usage: python3 -I stage.py <kit folder> <tree root> check-base|base|red|green

- check-base: writes nothing; checks the five shared files equal orig/ and the two new files are absent.
- base:  the five shared files as 52110318 has them (orig/); the two new files absent.
- red:   the two render files final (real/); the three code files and P2-T26.md as at the base (orig/);
         P2-T26-fix.md absent. RED needs no stub: the suites compile against the base's code.
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
        kind, rel = line.split(maxsplit=1)
        files.append((kind, rel.strip()))

FINAL_AT_RED = {
    'apps/app/src/wallet/records/WalletRecord.render.test.tsx',
    'apps/app/src/wallet/records/WalletRecordReceipt.render.test.tsx',
}


def source(kind, rel):
    """The file this form takes for `rel`, or None when the form leaves it absent."""
    if form == 'green' or (form == 'red' and rel in FINAL_AT_RED):
        return os.path.join(kit, 'real', rel)
    return os.path.join(kit, 'orig', rel) if kind == 'shared' else None


def sha(name):
    with open(name, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


if form not in ('check-base', 'base', 'red', 'green'):
    raise SystemExit('form: check-base, base, red or green')
bad = 0
for kind, rel in files:
    target = os.path.join(tree, rel)
    if form == 'check-base':
        if kind == 'shared':
            ok = os.path.exists(target) and sha(target) == sha(os.path.join(kit, 'orig', rel))
            print(f"{'OK ' if ok else 'BAD'} base    {rel}")
        else:
            ok = not os.path.exists(target)
            print(f"{'OK ' if ok else 'BAD'} absent  {rel}")
        bad += 0 if ok else 1
        continue
    origin = source(kind, rel)
    if origin is None:
        if os.path.exists(target):
            os.remove(target)
        ok = not os.path.exists(target)
        print(f"{'OK ' if ok else 'BAD'} absent  {rel}")
    elif not os.path.exists(origin):
        ok = False
        print(f'BAD missing {os.path.relpath(origin, kit)}')
    else:
        os.makedirs(os.path.dirname(target), exist_ok=True)
        shutil.copyfile(origin, target)
        ok = sha(origin) == sha(target)
        print(f"{'OK ' if ok else 'BAD'} {os.path.relpath(origin, kit).split('/')[0]:7} {rel} {sha(target)[:12]}")
    bad += 0 if ok else 1
print(f'{form}: {len(files)} files, {bad} not as expected')
sys.exit(1 if bad else 0)

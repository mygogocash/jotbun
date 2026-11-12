#!/usr/bin/env python3
"""P6A-T2 kit: put a stage's files into a tree, or check that a tree holds them.

    python3 -I tools/stage.py <tree> base|red|green           copy the stage's files in
    python3 -I tools/stage.py <tree> verify base|red|green    check them, byte for byte

base:  the head's two shared files (orig/), and none of the new files.
red:   the three test files and useOutsideCopy.ts final (real/);
       widgetSnapshot.ts, outsideCopy.draft.ts and dateStep.ts as typed stubs (stubs/).
green: every source and test file final (real/). The receipt is copied by hand
       (the brief's Step 7), so no stage touches it.
Each line printed names the file; `verify` exits 1 on any mismatch.
"""
import hashlib
import os
import shutil
import sys

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = 'apps/app/src'
NEW = [f'{APP}/wallet/outside/widgetSnapshot.ts', f'{APP}/wallet/outside/outsideCopy.draft.ts', f'{APP}/wallet/outside/useOutsideCopy.ts',
       f'{APP}/wallet/outside/widgetSnapshot.test.ts', f'{APP}/wallet/outside/outsideCopy.test.ts']
SHARED = [f'{APP}/ui/dateStep.ts', f'{APP}/ui/dateStep.test.ts']
STUBBED = {f'{APP}/wallet/outside/widgetSnapshot.ts', f'{APP}/wallet/outside/outsideCopy.draft.ts', f'{APP}/ui/dateStep.ts'}


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def source(stage, rel):
    """Where a stage's copy of `rel` comes from, or None when the stage has no such file."""
    if stage == 'base':
        return os.path.join(KIT, 'orig', rel) if rel in SHARED else None
    folder = 'stubs' if stage == 'red' and rel in STUBBED else 'real'
    return os.path.join(KIT, folder, rel)


def put(tree, stage):
    for rel in NEW + SHARED:
        target = os.path.join(tree, rel)
        origin = source(stage, rel)
        if origin is None:
            if os.path.exists(target):
                os.remove(target)
                print(f'removed {rel}')
            continue
        os.makedirs(os.path.dirname(target), exist_ok=True)
        shutil.copyfile(origin, target)
        print(f'copied {os.path.relpath(origin, KIT)} -> {rel}')


def verify(tree, stage):
    bad = 0
    for rel in NEW + SHARED:
        target = os.path.join(tree, rel)
        origin = source(stage, rel)
        if origin is None:
            fine = not os.path.exists(target)
            print(f'{rel}: {"OK (absent)" if fine else "FAILED (should be absent)"}')
        else:
            fine = os.path.isfile(target) and sha(target) == sha(origin)
            print(f'{rel}: {"OK" if fine else "FAILED"} ({os.path.relpath(origin, KIT).split(os.sep)[0]}/)')
        bad += 0 if fine else 1
    print(f'{stage}: {len(NEW + SHARED) - bad} of {len(NEW + SHARED)} OK')
    return bad


def main():
    tree = os.path.abspath(sys.argv[1])
    if sys.argv[2] == 'verify':
        sys.exit(1 if verify(tree, sys.argv[3]) else 0)
    put(tree, sys.argv[2])


if __name__ == '__main__':
    main()

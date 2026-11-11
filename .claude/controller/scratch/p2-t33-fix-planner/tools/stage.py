#!/usr/bin/env python3
"""P2-T33 fix round: lays one stage of the kit over a copy of 5844e4c1.

Usage: python3 -I stage.py <kit> <root> orig|red|green

- orig:  every file of files.txt as 5844e4c1 has it (the two new tests removed);
- red:   the round's tests and copy.ts from real/, lockModel.ts from stubs/,
         the code from orig/;
- green: every file from real/.
Then prints each file's sha256 and where it came from.
"""
import hashlib
import os
import shutil
import sys

TESTS = {
    'apps/app/src/ui/lockCover.test.ts',
    'apps/app/src/wallet/lock/Lock.render.test.tsx',
    'apps/app/src/wallet/lock/LockRoute.render.test.tsx',
    'apps/app/src/wallet/lock/lockModel.test.ts',
}
DATA = {'apps/app/src/wallet/lock/copy.ts'}
STUBBED = {'apps/app/src/wallet/lock/lockModel.ts'}


def main():
    kit, root, stage = sys.argv[1], sys.argv[2], sys.argv[3]
    files = [line.strip() for line in open(os.path.join(kit, 'files.txt'), encoding='utf-8') if line.strip()]
    for rel in files:
        if stage == 'green':
            source = 'real'
        elif stage == 'red':
            source = 'real' if rel in TESTS or rel in DATA else 'stubs' if rel in STUBBED else 'orig'
        elif stage == 'orig':
            source = 'orig'
        else:
            raise SystemExit(f'unknown stage {stage}')
        target = os.path.join(root, rel)
        origin = os.path.join(kit, source, rel)
        if not os.path.exists(origin):
            if os.path.exists(target):
                os.remove(target)
            print(f'{rel}: absent ({source})')
            continue
        os.makedirs(os.path.dirname(target), exist_ok=True)
        shutil.copyfile(origin, target)
        digest = hashlib.sha256(open(target, 'rb').read()).hexdigest()
        print(f'{rel}: {source} {digest}')


if __name__ == '__main__':
    main()

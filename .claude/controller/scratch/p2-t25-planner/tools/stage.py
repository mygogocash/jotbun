"""Sets the planner's scratch tree to a stage of P2-T25 and checks every file it placed.

    python3 -I tools/stage.py <tree> base|red|green

base:  the head (orig/ for the shared files; none of the new files).
red:   the tests and the copy, real; typed stubs for deletedData.ts and WalletDeletedScreen.tsx;
       every shared code file as at the head.
green: every file as real/.
"""
import hashlib
import os
import shutil
import sys

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = open(os.path.join(KIT, 'files.txt')).read().split()
SHARED = set(open(os.path.join(KIT, 'shared.txt')).read().split())
STUBBED = {
    'apps/app/src/screens/redesign/deleted/deletedData.ts',
    'apps/app/src/wallet/records/WalletDeletedScreen.tsx',
}
REAL_AT_RED = {
    'apps/app/src/wallet/records/copy.ts',
    'apps/app/src/wallet/records/WalletDeleted.render.test.tsx',
}


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def place(tree, rel, source):
    target = os.path.join(tree, rel)
    if source is None:
        if os.path.exists(target):
            os.remove(target)
        return 'absent'
    os.makedirs(os.path.dirname(target), exist_ok=True)
    shutil.copyfile(source, target)
    if sha(target) != sha(source):
        raise SystemExit(f'checksum differs after copy: {rel}')
    return os.path.relpath(source, KIT).split(os.sep)[0]


def source_for(stage, rel):
    if stage == 'green':
        return os.path.join(KIT, 'real', rel)
    if stage == 'red':
        if rel in STUBBED:
            return os.path.join(KIT, 'stubs', rel)
        if rel in REAL_AT_RED:
            return os.path.join(KIT, 'real', rel)
    return os.path.join(KIT, 'orig', rel) if rel in SHARED else None


def main():
    tree, stage = sys.argv[1], sys.argv[2]
    if stage not in ('base', 'red', 'green'):
        raise SystemExit('stage: base, red or green')
    for rel in FILES:
        print(f'{place(tree, rel, source_for(stage, rel)):6} {rel}')
    # Clean up empty directories if needed
    for folder in [
        os.path.join(tree, 'apps/app/src/screens/redesign/deleted'),
        os.path.join(tree, 'apps/app/src/wallet/records'),
    ]:
        if os.path.isdir(folder) and not os.listdir(folder):
            os.rmdir(folder)


if __name__ == '__main__':
    main()

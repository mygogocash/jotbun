"""Give a scratch tree its own node_modules without copying or installing.

Usage: python3 -I linkfarm.py <donor tree> <target tree>

Each node_modules directory (root, apps/edge, apps/app, apps/api) becomes a real
directory in the target. Every package in it is a symlink to the donor's copy,
except the workspace links (gogospend-api, gogospend-app and
@gogospend/contracts), which are copied as the same relative symlinks, so they
resolve inside the target tree: the target's own packages/contracts is the one
its tests load. Cache folders (.vite, .vite-temp, .cache, .mf) are left out, so
tools write their caches into the target, never into the donor.
"""
import os
import sys

SKIP = {'.vite', '.vite-temp', '.cache', '.mf', '.package-lock.json'}
DIRS = ['node_modules', 'apps/edge/node_modules', 'apps/app/node_modules', 'apps/api/node_modules']


def farm(src: str, dst: str) -> None:
    os.makedirs(dst, exist_ok=True)
    for name in sorted(os.listdir(src)):
        if name in SKIP:
            continue
        s = os.path.join(src, name)
        d = os.path.join(dst, name)
        if os.path.lexists(d):
            continue
        if os.path.islink(s):
            # A workspace link: the same relative target, read from the target tree.
            os.symlink(os.readlink(s), d)
        elif name.startswith('@') and os.path.isdir(s) and any(os.path.islink(os.path.join(s, n)) for n in os.listdir(s)):
            farm(s, d)
        else:
            os.symlink(s, d)


def main() -> None:
    donor, target = (os.path.abspath(p) for p in sys.argv[1:3])
    for rel in DIRS:
        src = os.path.join(donor, rel)
        if os.path.isdir(src):
            farm(src, os.path.join(target, rel))
            print(f'farmed {rel}')


if __name__ == '__main__':
    main()

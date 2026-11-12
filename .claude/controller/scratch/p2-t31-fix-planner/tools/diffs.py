#!/usr/bin/env python3
"""P2-T31 fix round: one diff per changed file, and the whole round as one patch.

Usage: python3 -I diffs.py <planner dir>

Each file's base is afc19276's (orig/<path>), or nothing for a new file. Writes
diffs/<path with / as _>.diff with `a/` and `b/` paths, and diffs/p2-t31-fix.patch,
the round in files.txt's order.
"""
import difflib
import os
import sys


def lines_of(path):
    if path is None:
        return []
    with open(path, encoding='utf-8') as handle:
        return handle.read().splitlines(keepends=True)


def main():
    root = sys.argv[1]
    out = os.path.join(root, 'diffs')
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(root, 'files.txt'), encoding='utf-8') as handle:
        files = [line.strip() for line in handle if line.strip()]
    patch = []
    for rel in files:
        base = os.path.join(root, 'orig', rel)
        base = base if os.path.isfile(base) else None
        old, new = lines_of(base), lines_of(os.path.join(root, 'real', rel))
        if old == new:
            print(f'unchanged: {rel}')
            continue
        header = [f'diff --git a/{rel} b/{rel}\n']
        if base is None:
            header.append('new file mode 100644\n')
        body = list(difflib.unified_diff(old, new, fromfile='/dev/null' if base is None else f'a/{rel}', tofile=f'b/{rel}', n=3))
        text = ''.join(header + body)
        with open(os.path.join(out, rel.replace('/', '_') + '.diff'), 'w', encoding='utf-8') as handle:
            handle.write(text)
        patch.append(text)
        print(f'diff: {rel} ({"new" if base is None else "orig"}, {len(new)} lines, {len(old)} before)')
    with open(os.path.join(out, 'p2-t31-fix.patch'), 'w', encoding='utf-8') as handle:
        handle.write(''.join(patch))


if __name__ == '__main__':
    main()

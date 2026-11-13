"""The planner's probe for ruling P3: the guard that keeps a confirmation off an existing record is pinned today.

Usage: python3 -I taken-probe.py <tree> <log>

T1 drops confirmIn's `taken` filter (a record id already used is written again), runs 1B-T10's
case "a record id already used is never written again, even if its progress row were lost"
(imports-review.test.ts) under the heavy lock, then writes confirmation.ts back and checks its
SHA-256. Prints one line: whether the case failed, on what, and whether the file was restored.
"""
from __future__ import annotations

import hashlib
import os
import re
import subprocess
import sys

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REL = 'apps/edge/src/vault/files/confirmation.ts'
OLD = '  const saving = open.filter((row) => !taken.has(row.id))\n'
NEW = '  const saving = open\n'
CASE = 'a record id already used is never written again, even if its progress row were lost'


def main(tree: str, log: str) -> int:
    target = os.path.join(tree, REL)
    with open(target, 'rb') as f:
        data = f.read()
    digest = hashlib.sha256(data).hexdigest()
    if data.count(OLD.encode()) != 1:
        print(f'T1: expected its text once in {REL}')
        return 2
    with open(target, 'wb') as f:
        f.write(data.replace(OLD.encode(), NEW.encode()))
    try:
        argv = [os.path.join(KIT, 'locked.sh'), log, os.path.join(tree, 'apps/edge'), 'npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', '--reporter=verbose', 'test/workers/imports-review.test.ts', '-t', CASE]
        rc = subprocess.run(argv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode
    finally:
        with open(target, 'wb') as f:
            f.write(data)
    with open(target, 'rb') as f:
        restored = hashlib.sha256(f.read()).hexdigest() == digest
    with open(log, encoding='utf-8', errors='replace') as f:
        body = f.read()
    counts = re.search(r'^\s+Tests\s+(.+\(\d+\))', body, re.M)
    first = re.search(r'^(AssertionError|TypeError|Error|SqliteError)[^\n]*', body, re.M)
    print(f'T1 (no taken filter) {"killed" if rc else "SURVIVED"} by 1B-T10\'s case: {counts.group(1) if counts else "no counts"}; first error: {first.group(0)[:160] if first else "none"}; restored={restored}')
    return 0 if rc and restored else 1


if __name__ == '__main__':
    sys.exit(main(os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])))

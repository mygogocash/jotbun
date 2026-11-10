#!/usr/bin/env python3
"""Builds the brief from tools/brief.template.md and checks it.

Usage: python3 -I fill_brief.py <brief path>

Fills {{COMMIT_MESSAGE}} (tools/commit-message.txt) and each {{DIFF <name>}}
(diffs/<name>), then checks that every ```diff block in the brief is its kit
file, byte for byte, that the commit message is in it, that every kit path the
brief names under PL exists, and that no template marker is left. Exits 1 on
any difference.
"""
import os
import re
import sys

K = '/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/tray-hardening-fix2-planner'


def read(rel):
    with open(os.path.join(K, rel), encoding='utf-8') as handle:
        return handle.read()


def main():
    out = sys.argv[1]
    text = read('tools/brief.template.md')
    text = text.replace('{{COMMIT_MESSAGE}}', read('tools/commit-message.txt').rstrip('\n'))
    names = re.findall(r'\{\{DIFF (\S+)\}\}', text)
    for name in names:
        text = text.replace('{{DIFF ' + name + '}}', read(f'diffs/{name}').rstrip('\n'))
    with open(out, 'w', encoding='utf-8') as handle:
        handle.write(text)
    bad = 0
    blocks = re.findall(r'^```diff\n(.*?)\n```$', text, re.S | re.M)
    if len(blocks) != len(names):
        print(f'{len(blocks)} diff blocks for {len(names)} diffs')
        bad += 1
    for name, block in zip(names, blocks):
        same = block == read(f'diffs/{name}').rstrip('\n')
        print(f'{name}: {"byte for byte" if same else "DIFFERS"}')
        bad += 0 if same else 1
    message = read('tools/commit-message.txt').rstrip('\n')
    print(f'commit message: {"in the brief" if message in text else "MISSING"}')
    bad += 0 if message in text else 1
    # Every PL/<path> the brief names must exist in the kit (a trailing slash names a folder).
    missing = sorted({p for p in re.findall(r'PL/([A-Za-z0-9_./-]+[A-Za-z0-9_/-])', text)
                      if not os.path.exists(os.path.join(K, p.rstrip('/')))})
    print(f'kit paths named and missing: {missing}')
    bad += len(missing)
    left = re.findall(r'\{\{(?:COMMIT_MESSAGE|DIFF [^}]*)\}\}', text)
    print(f'placeholders left: {len(left)}')
    bad += len(left)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()

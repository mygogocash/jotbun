#!/usr/bin/env python3
"""Builds the brief from tools/brief.template.md and checks it.

Usage: python3 -I fill_brief.py <brief path>

Fills {{MUTANT_TABLE}} (tools/mutant-table.md), {{COMMIT_MESSAGE}}
(tools/commit-message.txt), {{RECEIPT_SECTION}} (tools/receipt-section.md) and
each {{DIFF <name>}} (diffs/<name>), then checks
that every ```diff block in the brief is its kit file, byte for byte, and that
no {{...}} is left. Exits 1 on any difference.
"""
import os
import re
import sys

K = '/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/tray-hardening-fix-planner'


def read(rel):
    with open(os.path.join(K, rel), encoding='utf-8') as handle:
        return handle.read()


def main():
    out = sys.argv[1]
    text = read('tools/brief.template.md')
    text = text.replace('{{MUTANT_TABLE}}', read('tools/mutant-table.md').rstrip('\n'))
    text = text.replace('{{COMMIT_MESSAGE}}', read('tools/commit-message.txt').rstrip('\n'))
    text = text.replace('{{RECEIPT_SECTION}}', read('tools/receipt-section.md').rstrip('\n'))
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
    section = read('tools/receipt-section.md').rstrip('\n')
    print(f'receipt section: {"in the brief" if section in text else "MISSING"}')
    bad += 0 if section in text else 1
    # Only the template's own markers: the diffs hold JSX such as value={{ hidden }}.
    left = re.findall(r'\{\{(?:MUTANT_TABLE|COMMIT_MESSAGE|RECEIPT_SECTION|DIFF [^}]*)\}\}', text)
    print(f'placeholders left: {len(left)}')
    bad += len(left)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()

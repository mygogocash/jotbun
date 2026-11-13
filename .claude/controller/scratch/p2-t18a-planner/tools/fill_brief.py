#!/usr/bin/env python3
"""Builds the brief from brief.body.md: @@RULINGS@@ becomes rulings.md, and @@APPENDIX@@ the diffs of the task's
changed source files (from diffs/), each byte for byte in its own code block. Then checks every block against its
file. Usage: python3 -I fill_brief.py <kit folder> <brief path>"""
import os
import re
import sys

kit, out = sys.argv[1], sys.argv[2]
read = lambda path: open(os.path.join(kit, path), encoding='utf-8').read()
DIFFS = ['apps/app/src/wallet/saved/savedMoment.ts', 'apps/app/src/wallet/saved/SavedToastHost.tsx', 'apps/app/src/wallet/wallets/NewWalletFlow.tsx', 'apps/app/src/wallet/wallets/WalletEditScreen.tsx']
parts = []
for path in DIFFS:
    name = path.replace('/', '_') + '.diff'
    parts.append(f'### `{path}` (`PL/diffs/{name}`)\n\n```diff\n{read("diffs/" + name)}```\n')
parts.append('The four test files and the two receipts are in `PL/real/` (Step 2 and Step 4 copy them; read the tests before the receipt, which names every case), with a diff of each in `PL/diffs/` and the whole task in `PL/diffs/p2-t18a.patch`.\n')
body = read('tools/brief.body.md').replace('@@RULINGS@@', read('tools/rulings.md').rstrip('\n')).replace('@@APPENDIX@@', '\n'.join(parts).rstrip('\n'))
with open(out, 'w', encoding='utf-8') as handle:
    handle.write(body if body.endswith('\n') else body + '\n')
text = open(out, encoding='utf-8').read()
bad = 0
for path in DIFFS:
    name = path.replace('/', '_') + '.diff'
    block = re.search(r'### `' + re.escape(path) + r'` \(`PL/diffs/' + re.escape(name) + r'`\)\n\n```diff\n(.*?)```\n', text, re.S)
    bad += 0 if block and block.group(1) == read('diffs/' + name) else 1
print(f'{out}: {len(text.splitlines())} lines; {len(DIFFS)} code blocks, {bad} differ from the kit')
sys.exit(1 if bad else 0)

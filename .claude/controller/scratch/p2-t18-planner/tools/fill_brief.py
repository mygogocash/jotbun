#!/usr/bin/env python3
"""Builds the brief from brief.body.md: @@RULINGS@@ becomes rulings.md, and @@APPENDIX@@ the kit's new source files
(from real/) and the diffs of its changed source files (from diffs/), each byte for byte in its own code block. Then
checks every block against its file. Usage: python3 -I fill_brief.py <kit folder> <brief path>"""
import os
import re
import sys

kit, out = sys.argv[1], sys.argv[2]
read = lambda path: open(os.path.join(kit, path), encoding='utf-8').read()
NEW = ['apps/app/src/wallet/home/shellRoutes.ts', 'apps/app/src/wallet/home/WalletTabBar.tsx', 'apps/app/src/wallet/home/AddButton.tsx', 'apps/app/src/wallet/home/WalletShell.tsx']
DIFFS = ['apps/app/src/wallet/home/copy.ts', 'apps/app/app/spend/_layout.tsx', 'apps/app/app/spend/add.tsx']
parts = []
for path in NEW:
    parts.append(f'### `{path}` (new; `PL/real/{path}`)\n\n```tsx\n{read("real/" + path)}```\n')
for path in DIFFS:
    name = path.replace('/', '_') + '.diff'
    parts.append(f'### `{path}` (`PL/diffs/{name}`)\n\n```diff\n{read("diffs/" + name)}```\n')
parts.append('The tests (`shellRoutes.test.ts`, `spendLayoutOrder.test.ts`, `WalletShell.render.test.tsx`) and the two changed test files are in `PL/real/` (Step 2 copies them; read them before the receipt, which names every case). `PL/diffs/` has the diff of each changed file, and `PL/diffs/p2-t18.patch` the whole task.\n')
body = read('tools/brief.body.md').replace('@@RULINGS@@', read('tools/rulings.md').rstrip('\n')).replace('@@APPENDIX@@', '\n'.join(parts).rstrip('\n'))
with open(out, 'w', encoding='utf-8') as handle:
    handle.write(body if body.endswith('\n') else body + '\n')
text = open(out, encoding='utf-8').read()
bad = 0
for path in NEW:
    block = re.search(r'### `' + re.escape(path) + r'` \(new[^\n]*\n\n```tsx\n(.*?)```\n', text, re.S)
    bad += 0 if block and block.group(1) == read('real/' + path) else 1
for path in DIFFS:
    name = path.replace('/', '_') + '.diff'
    block = re.search(r'### `' + re.escape(path) + r'` \(`PL/diffs/' + re.escape(name) + r'`\)\n\n```diff\n(.*?)```\n', text, re.S)
    bad += 0 if block and block.group(1) == read('diffs/' + name) else 1
print(f'{out}: {len(text.splitlines())} lines; {len(NEW) + len(DIFFS)} code blocks, {bad} differ from the kit')
sys.exit(1 if bad else 0)

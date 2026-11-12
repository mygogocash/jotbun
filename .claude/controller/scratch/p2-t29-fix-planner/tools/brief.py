#!/usr/bin/env python3
"""Writes the P2-T29 fix brief: the head (tools/brief.head.md) and an appendix with
every file the round writes, as the kit's real/ holds them, and each RED stub.

Usage: python3 -I brief.py <kit> <brief path>
"""
import os
import sys

kit, out = sys.argv[1], sys.argv[2]
ORDER = [
    'apps/app/src/screens/redesign/planning/categoryCommands.ts',
    'apps/app/src/screens/redesign/planning/CategoriesScreen.tsx',
    'apps/app/src/wallet/categories/WalletCategoriesScreen.tsx',
    'apps/app/src/wallet/categories/CategoryTray.tsx',
    'apps/app/src/wallet/categories/ThaiPackTray.tsx',
    'apps/app/src/wallet/categories/copy.ts',
    'apps/app/app/spend/categories.tsx',
    'apps/app/src/dev/catalogue/wallet/categorySections.tsx',
    'apps/app/src/wallet/categories/WalletCategories.render.test.tsx',
    'apps/app/src/screens/redesign/planning/categoryCommands.render.test.tsx',
    'apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx',
    'docs/implementation/receipts/P2-T29-fix.md',
    'docs/implementation/receipts/P2-T29.md',
]
FENCE = {'.ts': 'ts', '.tsx': 'tsx', '.md': 'markdown'}


def block(path, rel):
    with open(path, encoding='utf-8') as handle:
        text = handle.read()
    fence = '````' if '```' in text else '```'
    return f'{fence}{FENCE.get(os.path.splitext(rel)[1], "")}\n{text}{"" if text.endswith(chr(10)) else chr(10)}{fence}\n'


def read(rel):
    with open(os.path.join(kit, rel), encoding='utf-8') as handle:
        return handle.read().rstrip('\n')


head = read('tools/brief.head.md').replace('«RULINGS»', read('tools/rulings.md')).replace('«STEPS»', read('tools/steps.md'))
if '«' in head:
    raise SystemExit('a placeholder is left: ' + head[head.index('«'):head.index('«') + 40])
parts = [head + '\n']
parts.append('\n## Appendix A: the files (as `PL/real/` holds them; copy them, never retype them)\n')
for rel in ORDER:
    parts.append(f'\n### `{rel}`\n\n')
    parts.append(block(os.path.join(kit, 'real', rel), rel))
parts.append('\n## Appendix B: the RED stubs (as `PL/stubs/` holds them)\n')
for root, _, names in sorted(os.walk(os.path.join(kit, 'stubs'))):
    for name in sorted(names):
        path = os.path.join(root, name)
        rel = os.path.relpath(path, os.path.join(kit, 'stubs'))
        parts.append(f'\n### `{rel}`\n\n')
        parts.append(block(path, rel))
with open(out, 'w', encoding='utf-8') as handle:
    handle.write(''.join(parts))
print(out, sum(len(part) for part in parts))

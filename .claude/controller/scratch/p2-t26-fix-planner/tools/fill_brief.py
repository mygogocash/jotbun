#!/usr/bin/env python3
"""Builds the fix brief from tools/brief.template.md: the three folders' full paths, the kit's file count (the lines
of SHA256SUMS), the ten batch commands (tools/batches.txt) and the Appendix (each diffs/ file, byte for byte, in the
Scope's order). Checks that no placeholder is left and that every diff is in the brief as it is on disk.
Usage: python3 -I fill_brief.py <kit folder> <brief path>"""
import os
import sys

kit, out = sys.argv[1], sys.argv[2]
WT = '/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t26'
S = '/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix'
PL = '/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-fix-planner'
ORDER = [
    'apps/app/src/wallet/records/WalletRecordScreen.tsx',
    'apps/app/src/wallet/records/WalletUndoBar.tsx',
    'apps/app/src/dev/catalogue/wallet/recordScreens.tsx',
    'apps/app/src/wallet/records/WalletRecord.render.test.tsx',
    'apps/app/src/wallet/records/WalletRecordReceipt.render.test.tsx',
    'docs/implementation/receipts/P2-T26.md',
    'docs/implementation/receipts/P2-T26-fix.md',
]
with open(os.path.join(kit, 'tools/brief.template.md'), encoding='utf-8') as handle:
    text = handle.read()
with open(os.path.join(kit, 'SHA256SUMS'), encoding='utf-8') as handle:
    count = len(handle.read().splitlines())
with open(os.path.join(kit, 'tools/batches.txt'), encoding='utf-8') as handle:
    batches = [line.split() for line in handle if line.strip()]
commands = '\n'.join(
    f"python3 -I {PL}/tools/mutants.py {WT} {S}/mutant-logs {' '.join(ids)} > {S}/mutant-batches/b{n:02d}.out 2>&1; echo $?"
    for n, ids in enumerate(batches, 1)
)
text = text.replace('{{BATCH_COMMANDS}}', commands).replace('{{SUMS_COUNT}}', str(count))
text = text.replace('{WT}', WT).replace('{S}', S).replace('{PL}', PL)
for token in ('{WT}', '{S}', '{PL}', '{{BATCH_COMMANDS}}', '{{SUMS_COUNT}}'):
    if token in text:
        raise SystemExit(f'{token} is left in the brief')
blocks = []
bodies = []
for rel in ORDER:
    with open(os.path.join(kit, 'diffs', rel.replace('/', '_') + '.diff'), encoding='utf-8') as handle:
        body = handle.read()
    if '```' in body or not body.endswith('\n'):
        raise SystemExit(f'{rel}: the diff cannot sit in a fence as it is')
    bodies.append(body)
    blocks.append(f'`{rel}`:\n```diff\n{body}```')
if text.count('{{APPENDIX}}') != 1:
    raise SystemExit('one {{APPENDIX}} expected')
text = text.replace('{{APPENDIX}}', '\n\n'.join(blocks))
missing = [rel for rel, body in zip(ORDER, bodies) if body not in text]
if missing:
    raise SystemExit(f'not in the brief byte for byte: {missing}')
with open(out, 'w', encoding='utf-8') as handle:
    handle.write(text)
print(f'{out}: {len(text.splitlines())} lines, {len(ORDER)} diffs, SHA256SUMS {count} files, {len(batches)} batches')

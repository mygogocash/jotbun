#!/usr/bin/env python3
"""Fills the P2-T14 fix round's brief from the kit: the RED render failures and
the mutant lines from the planner's logs, and the code's diffs from diffs/.

Usage: python3 -I brief.py <kit> <out.md> <mutant minutes> <mutant load>
"""
import re
import sys
from pathlib import Path

kit, out, minutes, load = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3], sys.argv[4]
template = (kit / 'tools/brief.template.md').read_text()

# The RED render failures, in the log's order: each FAIL line's case and the first AssertionError under it.
red = (kit / 'logs/red-render.log').read_text().splitlines()
failures = []
for index, line in enumerate(red):
    found = re.match(r'^ FAIL  src/wallet/add/AmountStep\.render\.test\.tsx > (.+)$', line)
    if not found:
        continue
    message = next(each for each in red[index + 1:] if each.startswith('AssertionError'))
    failures.append(f"   - `{found.group(1)}`: `{message[len('AssertionError: '):]}`")
assert len(failures) == 10, len(failures)

mutants = [line for line in (kit / 'logs/mutants.out').read_text().splitlines() if not line.startswith('exit=')]
assert mutants[-1] == '138 killed, 0 survived, 0 not as expected', mutants[-1]
assert len(mutants) == 139, len(mutants)

CODE = [
    'apps/app/src/wallet/add/addFlow.ts',
    'apps/app/src/wallet/add/AmountStep.tsx',
    'apps/app/src/wallet/add/TypeSwitchHeader.tsx',
    'apps/app/src/wallet/add/WalletKeypad.tsx',
    'apps/app/src/wallet/add/QuickChips.tsx',
    'apps/app/src/dev/catalogue/wallet/addSections.tsx',
    'docs/implementation/receipts/P2-T14.md',
]
diffs = []
for path in CODE:
    text = (kit / 'diffs' / (path.replace('/', '_') + '.diff')).read_text()
    diffs.append(f'`{path}`:\n\n```diff\n{text.rstrip(chr(10))}\n```')

brief = (template
         .replace('{{RED_RENDER}}', '\n'.join(failures))
         .replace('{{MUTANTS}}', '\n'.join('   ' + line for line in mutants))
         .replace('{{MUTANT_MINUTES}}', minutes)
         .replace('{{MUTANT_LOAD}}', load)
         .replace('{{DIFFS}}', '\n\n'.join(diffs)))
assert not any(marker in brief for marker in ('{{RED_RENDER}}', '{{MUTANTS}}', '{{MUTANT_MINUTES}}', '{{MUTANT_LOAD}}', '{{DIFFS}}'))
out.write_text(brief)
print(f'wrote {out}: {len(brief)} characters, {len(failures)} RED failures, {len(mutants) - 1} mutants, {len(diffs)} diffs')

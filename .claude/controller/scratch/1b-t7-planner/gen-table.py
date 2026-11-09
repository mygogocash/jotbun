#!/usr/bin/env python3
"""Prints the brief's mutant table from mutants.py: label, file, change, the cases that must fail."""
import runpy
import sys

m = runpy.run_path(sys.argv[1])
short = {m['AI']: '`vault/ai.ts`', m['SV']: '`ai/service.ts`', m['RO']: '`ai/routes.ts`', m['RT']: '`v1/routes.ts`'}
print('| Mutant | File | Change | Must fail |')
print('| --- | --- | --- | --- |')
for label, description, rel, _edits, required in m['MUTANTS']:
    cases = '; '.join(f'`{name.split(": ", 1)[1]}`' for name in sorted(required))
    print(f'| {label} | {short[rel]} | {description} | {cases} |')

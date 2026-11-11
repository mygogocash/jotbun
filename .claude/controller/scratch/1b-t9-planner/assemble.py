#!/usr/bin/env python3
"""Assembles briefs/1B-T9.md from brief-body.md: the mutant table (from
mutants.py's MUTANTS), Appendix A (from diffs/) and Appendix D (SHA256SUMS)."""
import os
import runpy
import sys

PL = os.path.dirname(os.path.abspath(__file__))
OUT = '/Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/1B-T9.md'
PREFIX = 'attachments.test.ts: '

DIFF_ORDER = [
    'src/v1/protocol.ts',
    'src/v1/routes.ts',
    'src/v1/worker-routes.ts',
    'src/v1/files/downloads.ts',
    'src/vault/routes.ts',
    'src/vault/commands/registry.ts',
    'src/vault/domain/transactions.ts',
    'test/vault-route-coverage.test.ts',
    'test/workers/support/files.ts',
]


def mutant_table() -> str:
    mutants = runpy.run_path(os.path.join(PL, 'mutants.py'))['MUTANTS']
    rows = ['| Mutant | File | Change | Must fail |', '| --- | --- | --- | --- |']
    for label, description, rel, _old, _new, required in mutants:
        cases = '; '.join(f'`{name[len(PREFIX):]}`' for name in sorted(required))
        rows.append(f'| {label} | `{os.path.basename(rel)}` | {description} | {cases} |')
    return '\n'.join(rows)


def appendix_a() -> str:
    parts = []
    for rel in DIFF_ORDER:
        text = open(os.path.join(PL, 'diffs', rel.replace('/', '_') + '.diff')).read().rstrip('\n')
        parts.append(f'### `{rel}`\n\n```diff\n{text}\n```')
    return '\n\n'.join(parts)


def main() -> int:
    body = open(os.path.join(PL, 'brief-body.md')).read()
    sums = open(os.path.join(PL, 'SHA256SUMS')).read().rstrip('\n')
    for marker, value in (('{{MUTANT_TABLE}}', mutant_table()), ('{{APPENDIX_A}}', appendix_a()), ('{{SHA256SUMS}}', sums)):
        if body.count(marker) != 1:
            print(f'{marker} found {body.count(marker)} times')
            return 1
        body = body.replace(marker, value)
    if '{{' in body:
        print('an unfilled marker remains')
        return 1
    open(OUT, 'w').write(body)
    print(f'wrote {OUT}: {len(body.splitlines())} lines')
    return 0


if __name__ == '__main__':
    sys.exit(main())

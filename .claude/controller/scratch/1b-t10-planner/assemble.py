#!/usr/bin/env python3
"""Assembles briefs/1B-T10.md from brief-body.md: the mutant table (from
mutants.py's MUTANTS), Appendix A (from diffs/), Appendix B (the RED stub of
confirmRoute, from stubs/) and Appendix D (SHA256SUMS)."""
import os
import runpy
import sys

PL = os.path.dirname(os.path.abspath(__file__))
OUT = '/Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/1B-T10.md'
PREFIX = 'imports-review.test.ts: '

DIFF_ORDER = [
    'src/v1/protocol.ts',
    'src/v1/routes.ts',
    'src/v1/worker-routes.ts',
    'src/v1/files/receipts.ts',
    'src/vault/routes.ts',
    'src/vault/commands/registry.ts',
    'src/vault/files/attachments.ts',
    'test/vault-route-coverage.test.ts',
    'test/workers/support/files.ts',
    'test/workers/sync.test.ts',
    'test/workers/imports-intake.test.ts',
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
        text = open(os.path.join(PL, 'diffs', rel.replace('/', '_') + '.diff'), encoding='utf-8').read().rstrip('\n')
        parts.append(f'### `{rel}`\n\n```diff\n{text}\n```')
    return '\n\n'.join(parts)


def appendix_b() -> str:
    stub = open(os.path.join(PL, 'stubs', 'src', 'v1', 'files', 'receipts.ts'), encoding='utf-8').read()
    start = stub.index('export async function confirmRoute(')
    return '```ts\n' + stub[start:].rstrip('\n') + '\n```'


def main() -> int:
    body = open(os.path.join(PL, 'brief-body.md'), encoding='utf-8').read()
    sums = open(os.path.join(PL, 'SHA256SUMS'), encoding='utf-8').read().rstrip('\n')
    for marker, value in (('{{MUTANT_TABLE}}', mutant_table()), ('{{APPENDIX_A}}', appendix_a()), ('{{APPENDIX_B}}', appendix_b()), ('{{SHA256SUMS}}', sums)):
        if body.count(marker) != 1:
            print(f'{marker} found {body.count(marker)} times')
            return 1
        body = body.replace(marker, value)
    if '{{' in body:
        print('an unfilled marker remains')
        return 1
    open(OUT, 'w', encoding='utf-8').write(body)
    print(f'wrote {OUT}: {len(body.splitlines())} lines')
    return 0


if __name__ == '__main__':
    sys.exit(main())

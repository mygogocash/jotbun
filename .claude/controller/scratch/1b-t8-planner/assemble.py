#!/usr/bin/env python3
"""Assembles briefs/1B-T8.md from brief-body.md: the mutant table and count
(from mutants.py's MUTANTS), Appendix A (from diffs/), Appendix B (the RED
stubs of work.ts's and downloads.ts's 1B-T8 parts, from stubs/), the measured
numbers (measured.json) and Appendix D (SHA256SUMS)."""
import json
import os
import runpy
import sys

PL = os.path.dirname(os.path.abspath(__file__))
OUT = '/Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/1B-T8.md'
PREFIX = 'snapshots.test.ts: '

DIFF_ORDER = [
    'src/v1/protocol.ts',
    'src/v1/routes.ts',
    'src/v1/worker-routes.ts',
    'src/v1/files/downloads.ts',
    'src/vault/routes.ts',
    'src/vault/user-vault.ts',
    'src/vault/files/work.ts',
    'src/roles/vault.ts',
    'src/cloudflare-workers.d.ts',
    'wrangler.vault.jsonc',
    'test/vault-route-coverage.test.ts',
    'test/workers/support/files.ts',
    'test/workers/sync.test.ts',
]


def mutants():
    return runpy.run_path(os.path.join(PL, 'mutants.py'))['MUTANTS']


def mutant_table() -> str:
    rows = ['| Mutant | File | Change | Must fail |', '| --- | --- | --- | --- |']
    for label, description, rel, _edits, required in mutants():
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
    work = open(os.path.join(PL, 'stubs', 'src', 'vault', 'files', 'work.ts'), encoding='utf-8').read()
    starter = work[work.index('// 1B-T8 typed stub (RED)'):].rstrip('\n')
    downloads = open(os.path.join(PL, 'stubs', 'src', 'v1', 'files', 'downloads.ts'), encoding='utf-8').read()
    start = downloads.index('export async function serveSnapshotChunk(')
    serve = downloads[start:downloads.index('// 1B-T9: receipts.')].rstrip('\n')
    return (
        '`src/vault/files/work.ts`: replace everything from `// 1B-T8: the snapshot starter (B5).` to the end of the file with:\n\n'
        f'```ts\n{starter}\n```\n\n'
        '`src/v1/files/downloads.ts`: replace the whole `serveSnapshotChunk` function (from `export async function serveSnapshotChunk(w: WorkerContext)` to its closing `}`) with:\n\n'
        f'```ts\n{serve}\n```'
    )


def main() -> int:
    body = open(os.path.join(PL, 'brief-body.md'), encoding='utf-8').read()
    sums = open(os.path.join(PL, 'SHA256SUMS'), encoding='utf-8').read().rstrip('\n')
    measured = json.load(open(os.path.join(PL, 'measured.json'), encoding='utf-8'))
    values = {
        '{{MUTANT_TABLE}}': mutant_table(),
        '{{APPENDIX_A}}': appendix_a(),
        '{{APPENDIX_B}}': appendix_b(),
        '{{SHA256SUMS}}': sums,
    }
    for marker, value in values.items():
        if body.count(marker) != 1:
            print(f'{marker} found {body.count(marker)} times')
            return 1
        body = body.replace(marker, value)
    body = body.replace('{{MUTANT_COUNT}}', str(len(mutants())))
    for key, value in measured.items():
        body = body.replace('{{' + key + '}}', str(value))
    if '{{' in body:
        print('an unfilled marker remains:', body[body.index('{{'):body.index('{{') + 40])
        return 1
    open(OUT, 'w', encoding='utf-8').write(body)
    print(f'wrote {OUT}: {len(body.splitlines())} lines')
    return 0


if __name__ == '__main__':
    sys.exit(main())

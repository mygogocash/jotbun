#!/usr/bin/env python3
"""Assembles the 1B-T11 brief from the planner's parts and verified files.

Usage: python3 -I assemble.py <values.json> <output path>
The values file names the measured numbers the parts leave as placeholders.
"""
import importlib.util
import json
import os
import sys

P = '/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t11-planner'


def read(rel: str) -> str:
    return open(os.path.join(P, rel), encoding='utf-8').read()


def mutant_table() -> str:
    spec = importlib.util.spec_from_file_location('mutants_spec', os.path.join(P, 'mutants.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    files = {m.JB: '`jobs.ts`', m.RT: '`retention.ts`', m.UV: '`user-vault.ts`', m.EX: '`executor.ts`', m.SN: '`snapshots.ts`', m.MG: '`0003_alarm_indexes.sql`'}
    rows = ['| Mutant | File | Change | Must fail | Runs |', '| --- | --- | --- | --- | --- |']
    for label, description, rel, _edits, required, run in m.MUTANTS:
        names = []
        for name in sorted(required):
            file, case = name.split(': ', 1)
            names.append(f'`{case}`' if file == m.ALARM else f'`{case}` ({file})')
        rows.append(f"| {label} | {files[rel]} | {description} | {'; '.join(names)} | {', '.join(f'`{f}`' for f in run)} |")
    return '\n'.join(rows)


SHARED = [
    'src/vault/user-vault.ts',
    'src/vault/retention.ts',
    'src/vault/commands/executor.ts',
    'src/vault/files/snapshots.ts',
    'src/vault/migrations/index.ts',
    'test/workers/snapshots.test.ts',
]


def appendix_a() -> str:
    parts = [
        '## Appendix A: the shared-file edits (unified diffs, `orig/` to `real/`)',
        '',
        "Use these only for a shared file whose base checksum differed in Step 0.7. Each hunk becomes one Edit: `old_string` is the hunk's context and `-` lines, `new_string` its context and `+` lines (without the leading markers). The same diffs are in `PL/diffs/`. If another task added lines next to one of these hunks, keep its lines and put this task's beside them; in `migrations/index.ts`, this task's entry goes after every earlier entry (Step 0.6).",
    ]
    for rel in SHARED:
        diff = read(f"diffs/{rel.replace('/', '_')}.diff").rstrip('\n')
        parts += ['', f'### `{rel}`', '', '```diff', diff, '```']
    return '\n'.join(parts)


def appendix_b() -> str:
    stub = read('stubs/src/vault/files/jobs.ts').rstrip('\n')
    import subprocess

    out = subprocess.run(['diff', '-u', '--label', 'a/src/vault/user-vault.ts', '--label', 'b/src/vault/user-vault.ts', 'orig/src/vault/user-vault.ts', 'stubs/src/vault/user-vault.ts'], cwd=P, capture_output=True, text=True)
    return '\n'.join(
        [
            "## Appendix B: the RED's stubs",
            '',
            '`PL/stubs/` holds both files. `src/vault/files/jobs.ts` is new, so you always copy it. `src/vault/user-vault.ts` is the base with the hunks below; if its base checksum differed in Step 0.7, apply these hunks to it for the RED (Step 1), and in Step 4 replace the whole file\'s 1B-T11 part with Appendix A\'s hunks instead (first undo these, then apply those).',
            '',
            '### `src/vault/files/jobs.ts` (the stub, whole)',
            '',
            '```ts',
            stub,
            '```',
            '',
            '### `src/vault/user-vault.ts` (the stub\'s hunks against the base)',
            '',
            '```diff',
            out.stdout.rstrip('\n'),
            '```',
        ]
    )


def main() -> int:
    values = json.load(open(sys.argv[1], encoding='utf-8'))
    body = read('brief-body.md')
    rulings = read('brief-rulings.md').rstrip('\n')
    notes = read('brief-notes.md').rstrip('\n')
    other = read('brief-other.md').rstrip('\n')
    steps = read('brief-steps.md').rstrip('\n')
    receipt = read('brief-receipt.md').rstrip('\n')
    sums = read('SHA256SUMS').rstrip('\n')
    text = body.replace('«RULINGS»', rulings).replace('«NOTES_TABLE»', notes).replace('«OTHER_WORK»', other).replace('«STEPS»', steps)
    text = text.replace('«MUTANT_TABLE»', mutant_table())
    for key, value in values.items():
        text = text.replace(f'«{key}»', str(value))
    text = text.rstrip('\n') + '\n\n' + appendix_a() + '\n\n' + appendix_b() + '\n\n' + receipt + '\n\n'
    text += '\n'.join(
        [
            "## Appendix D: the planner's files and their checksums",
            '',
            "`PL/SHA256SUMS` (paths relative to PL) covers every file you copy or run from PL: `real/` (9 files, paths relative to `apps/edge`), `stubs/` (2), `orig/` (the 6 shared files at `712574d`), `diffs/` (6) and `mutants.py`, plus the planner's non-log proof outputs (`proof/*.out`, `proof/*.sha256`). Check it with `cd PL && shasum -a 256 -c SHA256SUMS` (Step 0.5). The planner's logs are in `proof/` and `logs/`, with their own `PL/SHA256SUMS.logs`; they are gitignored and may be missing on another machine, so they are not part of any check you run. The folder also holds the planner's working files (the proof tree `tree/`, the base copy `base/`, `brief-*.md`, `assemble.py`, `values.json` and `run-*.sh`); the checksums do not cover them.",
            '',
            '```',
            sums,
            '```',
            '',
        ]
    )
    leftover = [part for part in text.split('«')[1:]]
    if leftover:
        print('unfilled placeholders:', sorted({part.split('»')[0] for part in leftover}))
        return 1
    open(sys.argv[2], 'w', encoding='utf-8').write(text)
    print(f'wrote {sys.argv[2]} ({len(text)} characters)')
    return 0


if __name__ == '__main__':
    sys.exit(main())

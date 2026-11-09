#!/usr/bin/env python3
"""Builds briefs/1B-T7.md from its parts: brief-head.md, the mutant table (from mutants.py), brief-tail.md, and the
appendices made from the kit's own files (diffs/ and SHA256SUMS), so the brief and the kit cannot disagree."""
import os
import runpy
import subprocess
import sys

PL = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]

head = open(os.path.join(PL, 'brief-head.md'), encoding='utf-8').read()
table = subprocess.run([sys.executable, '-I', os.path.join(PL, 'gen-table.py'), os.path.join(PL, 'mutants.py')], capture_output=True, text=True, check=True).stdout
tail = open(os.path.join(PL, 'brief-tail.md'), encoding='utf-8').read()
marker = '\n---\n\n## Appendix B'
main_tail, appendix_b = tail.split(marker)

shared = [line.strip() for line in open(os.path.join(PL, 'shared.txt'), encoding='utf-8') if line.strip()]
appendix_a = [
    '\n---\n\n## Appendix A: the shared-file edits (unified diffs, `orig/` to `real/`)\n',
    'Use these only for a shared file whose base checksum differed in Step 0.7. Each hunk becomes one Edit: `old_string` is the hunk\'s context and `-` lines, `new_string` its context and `+` lines (without the leading markers). The same diffs are in `PL/diffs/`. If another task merged first and added its own lines at the same places, put this task\'s lines after them (the order is 1B-T10, 1B-T8, then 1B-T7); in `VAULT_DEFERRED_ROUTES`, remove only the six AI lines.\n',
]
for rel in shared:
    diff = open(os.path.join(PL, 'diffs', rel.replace('/', '_') + '.diff'), encoding='utf-8').read()
    appendix_a.append(f'### `{rel}`\n\n```diff\n{diff}```\n')

sums = open(os.path.join(PL, 'SHA256SUMS'), encoding='utf-8').read()
appendix_c = (
    '\n## Appendix C: the planner\'s files and their checksums\n\n'
    '`PL/SHA256SUMS` (paths relative to PL) covers every file you copy or run from PL: `real/` (13 files, paths relative to `apps/edge`), '
    '`stubs/` (3), `orig/` (the nine shared files at `712574d`), `diffs/` (9) and `mutants.py`, and the planner\'s proof outputs that are not logs '
    '(`proof/*.out`, `proof/gate-bundle.txt`, `proof/mutant-files.sha256`). Check it with `cd PL && shasum -a 256 -c SHA256SUMS` (Step 0.5). '
    'The planner\'s `*.log` files (`proof/*.log` and `proof/mutant-logs/`) are listed in `PL/SHA256SUMS.logs`; they are gitignored and may be missing '
    'on another machine, so they are not part of any check you run. `proof/mutants-3-cut-off.out` is the planner\'s first run of batch 3, cut off '
    'after S1 by a session stop (the mutated file was restored from `real/` and checked); `proof/mutants-3.out` is its full rerun. The folder also '
    'holds the planner\'s working files (the proof tree `tree/`, the base copies `base/` and `head-712574d/`, `logs/`, the brief\'s parts '
    '`brief-head.md` and `brief-tail.md`, `mutant-table.md`, `gen-table.py`, `assemble.py`, `files.txt`, `shared.txt` and the `run-*.sh` scripts); '
    'the checksums do not cover them.\n\n'
    f'```\n{sums}```\n'
)

brief = head + table + main_tail + ''.join('\n' + part for part in appendix_a) + '\n---\n\n## Appendix B' + appendix_b + appendix_c
open(OUT, 'w', encoding='utf-8').write(brief)
print(f'wrote {OUT}: {brief.count(chr(10))} lines, {len(brief.encode("utf-8"))} bytes')

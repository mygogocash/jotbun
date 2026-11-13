#!/usr/bin/env python3
"""Builds briefs/P3-T13.md: tools/brief.body.md, then the Appendix, where every block is the kit's file byte for
byte (real/, stubs/ or diffs/), and the three shared stubs as diffs from orig/ (for reading). The stub diffs are made
here with `git diff --no-index` and no repository (GIT_CEILING_DIRECTORIES is the folder above the kit).
Usage: python3 -I fill_brief.py <planner folder> <brief path>"""
import os
import subprocess
import sys

planner, out = sys.argv[1], sys.argv[2]
S = 'apps/app/src'
BLOCKS = [
    ('real', f'{S}/wallet/add/draftOrigin.ts', 'ts', 'The draft origin (new, pure).'),
    ('diffs', 'apps_app_src_spend_v1_redesign_quickAddModel.ts.diff', 'diff', "buildQuickAdd's source (shared)."),
    ('diffs', 'apps_app_src_screens_redesign_entry_entrySave.ts.diff', 'diff', "The save's source and record_saved's photo flag (shared)."),
    ('diffs', 'apps_app_src_wallet_add_AddTrayHost.tsx.diff', 'diff', 'The host: applyAiDraft, the origin, the reviews and the save (shared).'),
    ('diffs', 'apps_app_src_spend_v1_ai_draftReview.ts.diff', 'diff', "P3-T5's m1 (shared)."),
    ('real', f'{S}/wallet/add/draftOrigin.test.ts', 'ts', 'The Node test (new).'),
    ('diffs', 'apps_app_src_spend_v1_redesign_quickAddModel.test.ts.diff', 'diff', "The model's case (shared)."),
    ('diffs', 'apps_app_src_screens_redesign_entry_entrySave.render.test.tsx.diff', 'diff', "entrySave's case and the probe's source (shared)."),
    ('diffs', 'apps_app_src_wallet_add_AddTray.render.test.tsx.diff', 'diff', "The tray's six cases (shared; built on P2-T17's version)."),
    ('diffs', 'apps_app_src_spend_v1_ai_draftReview.test.ts.diff', 'diff', "m1's case (shared)."),
    ('stubs', f'{S}/wallet/add/draftOrigin.ts', 'ts', 'RED stub.'),
    ('stubdiff', f'{S}/spend/v1/redesign/quickAddModel.ts', 'diff', 'RED stub, as a diff from orig/ (Step 2 copies the stub itself).'),
    ('stubdiff', f'{S}/screens/redesign/entry/entrySave.ts', 'diff', 'RED stub, as a diff from orig/ (Step 2 copies the stub itself).'),
    ('stubdiff', f'{S}/wallet/add/AddTrayHost.tsx', 'diff', 'RED stub, as a diff from orig/ (Step 2 copies the stub itself).'),
]


def stub_diff(rel):
    env = dict(os.environ, GIT_CEILING_DIRECTORIES=os.path.dirname(planner))
    done = subprocess.run(['/usr/bin/git', 'diff', '--no-index', f'orig/{rel}', f'stubs/{rel}'], cwd=planner, env=env, capture_output=True, text=True)
    assert done.returncode == 1 and done.stdout, done.stderr
    return done.stdout.replace(f'a/orig/{rel}', f'a/{rel}').replace(f'b/stubs/{rel}', f'b/{rel}')


with open(os.path.join(planner, 'tools', 'brief.body.md'), encoding='utf-8') as handle:
    text = handle.read()
parts = [text.rstrip('\n') + '\n']
for folder, rel, lang, what in BLOCKS:
    if folder == 'stubdiff':
        body, title = stub_diff(rel), f'stubs/{rel} (diff from orig/)'
    else:
        with open(os.path.join(planner, folder, rel), encoding='utf-8') as handle:
            body = handle.read()
        title = f'{folder}/{rel}'
    assert '```' not in body, rel
    parts.append(f'\n### `{title}`\n\n{what}\n\n```{lang}\n{body}{"" if body.endswith(chr(10)) else chr(10)}```\n')
with open(out, 'w', encoding='utf-8') as handle:
    handle.write(''.join(parts))
print(out, sum(part.count('\n') for part in parts), 'lines')

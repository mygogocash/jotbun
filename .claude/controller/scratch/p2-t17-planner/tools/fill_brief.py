#!/usr/bin/env python3
"""Builds briefs/P2-T17.md: tools/brief.body.md, then the Appendix, where every block is the kit's file byte for
byte (real/, stubs/ or diffs/). Usage: python3 -I fill_brief.py <planner folder> <brief path>"""
import os
import sys

planner, out = sys.argv[1], sys.argv[2]
S = 'apps/app/src'
BLOCKS = [
    ('real', f'{S}/wallet/saved/savedMoment.ts', 'ts', 'The pure rules (new).'),
    ('real', f'{S}/wallet/saved/SavedToastHost.tsx', 'tsx', 'The toast and its host (new).'),
    ('real', f'{S}/wallet/saved/SaveFlight.tsx', 'tsx', 'The drop into the card (new).'),
    ('real', f'{S}/wallet/saved/copy.ts', 'ts', "The saved moment's lines (new)."),
    ('real', f'{S}/dev/catalogue/wallet/savedSections.tsx', 'tsx', 'The sections list (new, development only).'),
    ('real', f'{S}/dev/catalogue/wallet/savedScreens.tsx', 'tsx', "The sections' host, fakes and page, loaded lazily (new, development only)."),
    ('diffs', 'apps_app_src_dev_catalogue_wallet_index.ts.diff', 'diff', 'The catalogue index (shared).'),
    ('diffs', 'apps_app_src_wallet_tray_TextLink.tsx.diff', 'diff', "TextLink's toastLink tone (shared)."),
    ('diffs', 'apps_app_src_wallet_WalletText.tsx.diff', 'diff', "WalletText's tones (shared)."),
    ('diffs', 'apps_app_src_wallet_wallets_WalletsList.render.test.tsx.diff', 'diff', "P2-T20's sections case (shared)."),
    ('diffs', 'apps_app_src_wallet_add_AddTray.render.test.tsx.diff', 'diff', "P2-T16's sections case (shared)."),
    ('stubs', f'{S}/wallet/saved/savedMoment.ts', 'ts', 'RED stub.'),
    ('stubs', f'{S}/wallet/saved/SavedToastHost.tsx', 'tsx', 'RED stub.'),
    ('stubs', f'{S}/wallet/saved/SaveFlight.tsx', 'tsx', 'RED stub.'),
    ('real', f'{S}/wallet/saved/savedMoment.test.ts', 'ts', 'The Node test (new).'),
    ('real', f'{S}/wallet/saved/SavedMoment.render.test.tsx', 'tsx', 'The render test (new).'),
]
with open(os.path.join(planner, 'tools', 'brief.body.md'), encoding='utf-8') as handle:
    text = handle.read()
parts = [text.rstrip('\n') + '\n']
for folder, rel, lang, what in BLOCKS:
    path = os.path.join(planner, folder, rel)
    with open(path, encoding='utf-8') as handle:
        body = handle.read()
    assert '```' not in body, path
    parts.append(f'\n### `{folder}/{rel}`\n\n{what}\n\n```{lang}\n{body}{"" if body.endswith(chr(10)) else chr(10)}```\n')
with open(out, 'w', encoding='utf-8') as handle:
    handle.write(''.join(parts))
print(out, sum(part.count('\n') for part in parts), 'lines')

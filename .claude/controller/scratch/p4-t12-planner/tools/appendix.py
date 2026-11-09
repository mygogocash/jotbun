#!/usr/bin/env python3
"""Builds the brief's appendix from the kit, byte for byte.

Usage: python3 -I appendix.py <kit dir> > appendix.md

Every code block is one kit file (real/, stubs/ or diffs/), fenced with a
fence longer than any backtick run inside it, and headed by its kit path and
SHA-256, so the brief cannot drift from what was proven.
"""
import hashlib
import os
import re
import sys

KIT = os.path.abspath(sys.argv[1])

SECTIONS = [
    ('The slip calls', [
        'real/apps/app/src/slips/slipResources.ts',
        'real/apps/app/src/slips/slipResources.test.ts',
    ]),
    ('The salt store and the salted hash', [
        'real/apps/app/src/slips/slipRefs.ts',
        'real/apps/app/src/slips/slipRefs.test.ts',
    ]),
    ('The fake slip server', [
        'real/apps/app/src/slips/testing/fakeSlipResources.ts',
    ]),
    ('The typed links and the ten routes', [
        'real/apps/app/src/slips/slipRoutes.ts',
        'real/apps/app/app/spend/slips/index.tsx',
        'real/apps/app/app/spend/slips/permission.tsx',
        'real/apps/app/app/spend/slips/albums.tsx',
        'real/apps/app/app/spend/slips/scan.tsx',
        'real/apps/app/app/spend/slips/summary.tsx',
        'real/apps/app/app/spend/slips/accounts.tsx',
        'real/apps/app/app/spend/slips/review.tsx',
        'real/apps/app/app/spend/slips/done.tsx',
        'real/apps/app/app/spend/slips/settings.tsx',
        'real/apps/app/app/spend/slips/notifications.tsx',
    ]),
    ('The shared client and its header test (m4)', [
        'diffs/apps_app_src_api_sharedV1.ts.diff',
        'real/apps/app/src/slips/sharedSlipResources.render.test.tsx',
    ]),
    ('The sign-out erase', [
        'diffs/apps_app_src_spend_v1_DeviceDiaryProvider.tsx.diff',
        'diffs/apps_app_src_spend_v1_DeviceDiaryProvider.render.test.tsx.diff',
        'diffs/apps_app_src_mascot_bunSettingsErase.render.test.tsx.diff',
    ]),
    ('The typed stubs (RED)', [
        'stubs/apps/app/src/slips/slipResources.ts',
        'stubs/apps/app/src/slips/slipRefs.ts',
        'stubs/apps/app/src/slips/testing/fakeSlipResources.ts',
    ]),
]

LANG = {'.ts': 'ts', '.tsx': 'tsx', '.diff': 'diff'}


def fence_for(text):
    longest = max((len(run) for run in re.findall(r'`+', text)), default=0)
    return '`' * max(3, longest + 1)


def main():
    out = ['## Appendix: the code', '',
           "Every block below is the kit's file, byte for byte (its SHA-256 is in `PL/SHA256SUMS`). "
           "Copy the files from PL as Steps 2 and 4 say; never retype them. "
           "`stubs/apps/app/src/spend/v1/DeviceDiaryProvider.tsx` is not shown: it is the head's file as it is (`orig/`).", '']
    for title, paths in SECTIONS:
        out += [f'### {title}', '']
        for rel in paths:
            path = os.path.join(KIT, rel)
            with open(path, 'rb') as handle:
                data = handle.read()
            text = data.decode('utf-8')
            digest = hashlib.sha256(data).hexdigest()
            fence = fence_for(text)
            lang = LANG[os.path.splitext(rel)[1]]
            out += [f'`PL/{rel}` (SHA-256 `{digest[:12]}...`):', '', f'{fence}{lang}', text.rstrip('\n'), fence, '']
    sys.stdout.write('\n'.join(out))


if __name__ == '__main__':
    main()

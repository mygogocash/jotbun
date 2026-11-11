#!/usr/bin/env python3
"""tray-hardening second fix round: the planner's controls (not the fixer's).

Usage: python3 -I controls.py <proof tree root> [ids...]

Each control lays a Tray.tsx (fc78376's from orig/, or the final one from real/)
and the final test file over the tree, applies its edits to either file, runs the
render file, restores both files to real/ (sha256 checked) and prints which cases
failed. Unlike the mutants, a control may be meant to pass: its line says what
was expected and whether it held.
"""
import hashlib
import os
import re
import subprocess
import sys

K = '/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/tray-hardening-fix2-planner'
TRAY = 'apps/app/src/wallet/tray/Tray.tsx'
TEST = 'apps/app/src/wallet/tray/Tray.render.test.tsx'
RENDER = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', 'src/wallet/tray/Tray.render.test.tsx']

HIDE_END_ONE_ACT = (
    '  act(() => {\n'
    '    dismissals.end?.();\n'
    '    vi.advanceTimersByTime(1);\n'
    '  });\n'
)
HIDE_END_TWO_ACTS = '  act(() => { dismissals.end?.(); });\n  act(() => { vi.advanceTimersByTime(1); });\n'
REOPEN_ONE_ACT = (
    '  act(() => {\n'
    '    dismissals.end?.();\n'
    "    fireEvent.click(screen.getByTestId('add'));\n"
    '  });\n'
)
REOPEN_TWO_ACTS = "  act(() => { dismissals.end?.(); });\n  act(() => { fireEvent.click(screen.getByTestId('add')); });\n"
REACT = "import { useEffect, useRef, useState } from 'react';\n"
REFRESH = '    showing.current = shown;\n'
EFFECT_END = '    showing.current = shown;\n  });\n'
GUARD = '    if (!shown && !showing.current) closed.current?.();\n'

# (id, description, tray source, expected 'pass' or 'fail', [(file, old, new), ...])
CONTROLS = [
    ('SB2-orig', "HIDE-END with UIKit's end and the exit's last millisecond in two acts, over fc78376's Tray.tsx: the end commits alone, so the case no longer reaches c-m1's window", 'orig', 'pass',
     [(TEST, HIDE_END_ONE_ACT, HIDE_END_TWO_ACTS)]),
    ('SB2-real', 'the same two acts over the final Tray.tsx', 'real', 'pass',
     [(TEST, HIDE_END_ONE_ACT, HIDE_END_TWO_ACTS)]),
    ('SB-real', "m-1's case with the end and the tap in two acts, over the final Tray.tsx (the confirming review's SB): the end commits alone and rightly says closed, so the case fails on correct code", 'real', 'fail',
     [(TEST, REOPEN_ONE_ACT, REOPEN_TWO_ACTS)]),
    ('LE', '`showing` refreshed in a layout effect: the Modal is the tray\'s descendant, so its setState callback still runs before the tray\'s layout effects (equivalent)', 'real', 'pass',
     [(TRAY, REACT, "import { useEffect, useLayoutEffect, useRef, useState } from 'react';\n"),
      (TRAY, REFRESH, ''),
      (TRAY, '  const exitMs = trayExiting(reduced).getDuration();\n', '  useLayoutEffect(() => {\n    showing.current = shown;\n  });\n  const exitMs = trayExiting(reduced).getDuration();\n')]),
    ('M1', "dismissed calls the render's onClosed, not the ref (equivalent except in the commit that carries the end, where F1 keeps the commit before's on purpose)", 'real', 'pass',
     [(TRAY, GUARD, '    if (!shown && !showing.current) onClosed?.();\n')]),
]

SUMMARY = re.compile(r'^\s*Tests  (.+?)\s*$', re.M)
FAILED = re.compile(r'^\s*×\s+\S+\s+>\s+(.+?)\s+\d+ms\s*$', re.M)
ASSERT = re.compile(r'^(AssertionError: .+)$', re.M)


def read(path):
    with open(path, 'rb') as handle:
        return handle.read()


def main():
    args = sys.argv[1:]
    root, wanted = args[0], set(args[1:])
    app = os.path.join(root, 'apps/app')
    logs = os.path.join(K, 'logs', 'control-logs')
    os.makedirs(logs, exist_ok=True)
    finals = {rel: read(os.path.join(K, 'real', rel)) for rel in (TRAY, TEST)}
    unexpected = 0
    for ident, description, source, expected, edits in CONTROLS:
        if wanted and ident not in wanted:
            continue
        texts = {TRAY: read(os.path.join(K, source, TRAY)).decode('utf-8'), TEST: finals[TEST].decode('utf-8')}
        for rel, old, new in edits:
            count = texts[rel].count(old)
            if count != 1:
                print(f'{ident} SETUP ERROR: {count} matches in {rel} for {old!r}', flush=True)
                sys.exit(2)
            texts[rel] = texts[rel].replace(old, new)
        try:
            for rel, text in texts.items():
                with open(os.path.join(root, rel), 'wb') as handle:
                    handle.write(text.encode('utf-8'))
            run = subprocess.run(RENDER, cwd=app, capture_output=True, text=True, timeout=900)
            output = run.stdout + run.stderr
        finally:
            for rel, data in finals.items():
                with open(os.path.join(root, rel), 'wb') as handle:
                    handle.write(data)
        restored = all(hashlib.sha256(read(os.path.join(root, rel))).hexdigest() == hashlib.sha256(data).hexdigest() for rel, data in finals.items())
        with open(os.path.join(logs, f'{ident}.log'), 'w', encoding='utf-8') as handle:
            handle.write(output)
        outcome = 'pass' if run.returncode == 0 else 'fail'
        held = outcome == expected and restored
        unexpected += 0 if held else 1
        summary = SUMMARY.findall(output)
        print(f"{ident}: {outcome} (expected {expected}{'' if held else ', NOT AS EXPECTED'}): {description}", flush=True)
        print(f"   render {summary[-1] if summary else 'no summary'}; restored={restored}", flush=True)
        for name in FAILED.findall(output):
            print(f'   failing: {name}', flush=True)
        for message in ASSERT.findall(output)[:3]:
            print(f'   {message[:220]}', flush=True)
    sys.exit(1 if unexpected else 0)


if __name__ == '__main__':
    main()

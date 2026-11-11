#!/usr/bin/env python3
"""fix-download-aborts mutation check. Applies each mutant (one or more exact
text replacements in one file), runs the focused workers file
(test/workers/download-aborts.test.ts), restores the file byte for byte, and
reports the failing cases.

Usage (take the heavy lock first, release it after):
  python3 -I mutants.py <apps/edge directory> <scratch directory> [LABEL ...]
  python3 -I mutants.py --check <apps/edge directory>   (no lock needed: checks
      that each mutant's old text occurs exactly once in its file, and that
      every required case name is a case of the test file)

The scratch directory receives the backup (mutant.keep) and one log per mutant
under mutant-logs/. Exit status 1 if a mutant fails to apply, a restore differs
from the backup, or a mutant leaves any of its REQUIRED cases passing.
"""
import filecmp
import os
import re
import shutil
import subprocess
import sys

SL = 'src/v1/files/slots.ts'
DL = 'src/v1/files/downloads.ts'
RC = 'src/v1/files/receipts.ts'
UP = 'src/v1/files/uploads.ts'

F = 'download-aborts.test.ts'
T = f'test/workers/{F}'


def case(name: str) -> str:
    return f'{F}: {name}'


EXPORT = case('an export download hands waitUntil a promise that is pending while its body is unread and ends once the body is read, cancelled or answered to a HEAD')
SNAPSHOT = case('a snapshot chunk download hands waitUntil a promise that is pending while its body is unread and ends once the body is read, cancelled or answered to a HEAD')
RECEIPT = case('a receipt download hands waitUntil a promise that is pending while its body is unread and ends once the body is read, cancelled or answered to a HEAD')
COPY = case('a retain hands waitUntil a promise that is pending while it holds a copy slot and ends once the slot is back; a retain turned away for want of a slot hands over nothing')
UPLOAD = case("an upload hands waitUntil a promise that is pending while it holds its place among the isolate's uploads and ends once it gives the place back")
ALL = {EXPORT, SNAPSHOT, RECEIPT, COPY, UPLOAD}

EXPORT_STEP = """  const reply = await w.vault.call('exports.file', { params: { grant: w.params.grant ?? '' } })
  if (!reply.ok) return reply
  const file = reply.body as StoredExportFile
  const release = untilReturned(w, EXPORT_SLOTS.take())
"""

MUTANTS = [
    # Each call site without the wrapper (the slot is taken as before R97).
    ('A1', 'the export download takes its slot without untilReturned', DL,
     [('  const release = untilReturned(w, EXPORT_SLOTS.take())\n', '  const release = EXPORT_SLOTS.take()\n')], {EXPORT}),
    ('A2', 'the snapshot chunk download takes its slot without untilReturned', DL,
     [('  const release = untilReturned(w, SNAPSHOT_SLOTS.take())\n', '  const release = SNAPSHOT_SLOTS.take()\n')], {SNAPSHOT}),
    ('A3', 'the receipt download takes its slot without untilReturned', DL,
     [('  const release = untilReturned(w, RECEIPT_SLOTS.take(w.claims.accountId))\n', '  const release = RECEIPT_SLOTS.take(w.claims.accountId)\n')], {RECEIPT}),
    ('A4', 'the copy takes its slot without untilReturned', RC,
     [('    const slot = untilReturned(w, COPY_SLOTS.take())\n', '    const slot = COPY_SLOTS.take()\n')], {COPY}),
    ('A5', 'the upload holds its place without untilReturned', UP,
     [('  const done = untilReturned(w, () => {\n    uploading -= 1\n  })\n', '  const done = () => {\n    uploading -= 1\n  }\n')], {UPLOAD}),
    # The wrapper itself.
    ('A6', "untilReturned's promise never ends", SL, [('    release()\n    returned()\n', '    release()\n')], ALL),
    ('A7', "untilReturned's promise ends at once", SL,
     [('  w.waitUntil(\n    new Promise<void>((resolve) => {\n      returned = resolve\n    }),\n  )\n', '  w.waitUntil(Promise.resolve())\n')], ALL),
    ('A8', 'untilReturned ends its promise but never returns the slot', SL, [('    release()\n    returned()\n', '    returned()\n')], ALL),
    # A promise handed over before the slot is taken: a request the vault refuses, or one turned away for want
    # of a slot, would leave it pending.
    ('A9', 'the export download hands its promise over before its vault step', DL,
     [(EXPORT_STEP, """  const handed = untilReturned(w, () => undefined)
  const reply = await w.vault.call('exports.file', { params: { grant: w.params.grant ?? '' } })
  if (!reply.ok) return reply
  const file = reply.body as StoredExportFile
  const taken = EXPORT_SLOTS.take()
  const release = () => {
    taken()
    handed()
  }
""")], {EXPORT}),
]

FAILED = re.compile(r'^\s*×\s+test/(?:workers/)?(\S+)\s+>\s+(?:.+? > )?(.+?)(?:\s+\d+ms)?$')
IT_NAME = re.compile(r"""^\s*it\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")""")


def case_names(edge: str) -> set:
    names = set()
    for line in open(os.path.join(edge, T), encoding='utf-8'):
        match = IT_NAME.match(line)
        if match:
            raw = match.group(1) if match.group(1) is not None else match.group(2)
            names.add(case(raw.replace("\\'", "'").replace('\\"', '"')))
    return names


def run_focused(edge: str, log_path: str) -> tuple:
    out = subprocess.run(['npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', '--reporter=verbose', T], cwd=edge, capture_output=True, text=True, timeout=1200)
    text = out.stdout + out.stderr
    with open(log_path, 'w') as log:
        log.write(text)
    failed = set()
    for line in text.splitlines():
        match = FAILED.match(line)
        if match:
            failed.add(f'{match.group(1)}: {match.group(2).strip()}')
    totals = re.search(r'Tests\s+(.+)', text)
    return failed, f'workers {totals.group(1).strip() if totals else "no totals"}'


def check(edge: str) -> int:
    ok = True
    names = case_names(edge)
    labels = set()
    for label, _description, rel, edits, required in MUTANTS:
        if label in labels:
            print(f'{label} is used twice')
            ok = False
        labels.add(label)
        text = open(os.path.join(edge, rel), encoding='utf-8').read()
        for old, new in edits:
            if text.count(old) != 1:
                print(f'{label} old text found {text.count(old)} times in {rel}')
                ok = False
            if old == new:
                print(f'{label} changes nothing')
                ok = False
        for name in sorted(required - names):
            print(f'{label} requires a case the test file does not have: {name}')
            ok = False
    print(f'{len(MUTANTS)} mutants, {len(names)} cases; old text found exactly once and every required case exists: {ok}')
    return 0 if ok else 1


def main() -> int:
    if sys.argv[1] == '--check':
        return check(sys.argv[2])
    edge, scratch = sys.argv[1], sys.argv[2]
    only = set(sys.argv[3:])
    os.makedirs(os.path.join(scratch, 'mutant-logs'), exist_ok=True)
    ok = True
    for label, description, rel, edits, required in MUTANTS:
        if only and label not in only:
            continue
        path = os.path.join(edge, rel)
        keep = os.path.join(scratch, 'mutant.keep')
        shutil.copyfile(path, keep)
        text = open(path, encoding='utf-8').read()
        if any(text.count(old) != 1 for old, _new in edits):
            print(f'{label} NOT APPLIED: an old text is not found exactly once in {rel}')
            ok = False
            continue
        for old, new in edits:
            text = text.replace(old, new)
        open(path, 'w', encoding='utf-8').write(text)
        try:
            failed, totals = run_focused(edge, os.path.join(scratch, 'mutant-logs', f'{label}.log'))
        finally:
            shutil.copyfile(keep, path)
        restored = filecmp.cmp(keep, path, shallow=False)
        missing = sorted(required - failed)
        verdict = 'KILLED' if not missing else 'SURVIVED'
        if missing or not restored:
            ok = False
        print(f'{label} {verdict} ({description}) [{totals}] restored={restored}', flush=True)
        for name in sorted(failed):
            print(f'    failed: {name}', flush=True)
        for name in missing:
            print(f'    REQUIRED BUT PASSED: {name}', flush=True)
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())

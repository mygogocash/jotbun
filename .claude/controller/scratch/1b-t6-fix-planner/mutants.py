#!/usr/bin/env python3
"""1B-T6 fix round mutation check. Applies each mutant to one file, runs the
focused workers file (test/workers/exports.test.ts), restores the file byte for
byte, and reports the failing tests.

Usage (take the heavy lock first, release it after):
  python3 -I mutants.py <apps/edge directory> <scratch directory> [LABEL ...]

The scratch directory receives the backup (mutant.keep) and one log per mutant
(mutant-logs/<label>.log). Exit status 1 if a mutant fails to apply, a restore
differs from the backup, or a mutant leaves any of its REQUIRED tests passing.
"""
import filecmp
import os
import re
import shutil
import subprocess
import sys

HANDLER = 'src/v1/handler.ts'
EXPORTS = 'src/vault/files/exports.ts'
DOWNLOADS = 'src/v1/files/downloads.ts'

F = 'exports.test.ts'
ROUND = '1B-T6 fix round: a HEAD gives its download slot back (R96), and the write and download guards of review m-1 and m-2'
HEAD_CASE = f'{F}: a HEAD on a download answers its headers, reads its file to the end and gives its slot back'
ACTIVE_CASE = f'{F}: an export whose write starts after the vault stopped being active reads nothing and stores nothing'
SLOT_CASE = f'{F}: a download refused after it took its slot gives the slot back'

# (label, description, file, old text (must occur exactly once), new text, tests that must fail)
MUTANTS = [
    ('F1', 'the old headOf: the body of a HEAD is dropped as it is', HANDLER,
     '  await response.body?.pipeTo(new WritableStream()).catch(() => undefined)\n', '', {HEAD_CASE}),
    ('F2', 'headOf cancels the body instead of reading it to its end', HANDLER,
     '  await response.body?.pipeTo(new WritableStream()).catch(() => undefined)\n',
     '  await response.body?.cancel().catch(() => undefined)\n', {HEAD_CASE}),
    ('F3', 'prepareExport without its check that the vault is active (exports.ts:233)', EXPORTS,
     "  if (!row || row.status !== 'pending' || !v.active(c)) return { kind: 'skipped' }\n",
     "  if (!row || row.status !== 'pending') return { kind: 'skipped' }\n", {ACTIVE_CASE}),
    ('F4', "serveExportFile's catch without release() (downloads.ts:63-66)", DOWNLOADS,
     '  } catch (error) {\n    release()\n    throw error\n  }\n',
     '  } catch (error) {\n    throw error\n  }\n', {SLOT_CASE}),
]

FAILED = re.compile(r'^\s*×\s+test/(?:workers/)?(\S+)\s+>\s+(?:.+? > )?(.+?)(?:\s+\d+ms)?$')


def run_focused(edge: str, log_path: str) -> tuple:
    out = subprocess.run(['npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', '--reporter=verbose', f'test/workers/{F}'], cwd=edge, capture_output=True, text=True, timeout=900)
    text = out.stdout + out.stderr
    with open(log_path, 'w') as log:
        log.write(text)
    failed = set()
    for line in text.splitlines():
        match = FAILED.match(line)
        if match:
            failed.add(f'{match.group(1)}: {match.group(2).strip()}')
    totals = re.search(r'Tests\s+(.+)', text)
    return failed, (totals.group(1).strip() if totals else 'no totals')


def main() -> int:
    edge, scratch = sys.argv[1], sys.argv[2]
    only = set(sys.argv[3:])
    os.makedirs(os.path.join(scratch, 'mutant-logs'), exist_ok=True)
    ok = True
    for label, description, rel, old, new, required in MUTANTS:
        if only and label not in only:
            continue
        path = os.path.join(edge, rel)
        keep = os.path.join(scratch, 'mutant.keep')
        shutil.copyfile(path, keep)
        text = open(path).read()
        if text.count(old) != 1:
            print(f'{label} NOT APPLIED: old text found {text.count(old)} times in {rel}', flush=True)
            ok = False
            continue
        open(path, 'w').write(text.replace(old, new))
        try:
            failed, totals = run_focused(edge, os.path.join(scratch, 'mutant-logs', f'{label}.log'))
        finally:
            shutil.copyfile(keep, path)
        restored = filecmp.cmp(keep, path, shallow=False)
        missing = sorted(required - failed)
        verdict = 'KILLED' if not missing else 'SURVIVED'
        if missing or not restored:
            ok = False
        print(f'{label} {verdict} ({description}) [workers {totals}] restored={restored}', flush=True)
        for name in sorted(failed):
            print(f'    failed: {name}', flush=True)
        for name in missing:
            print(f'    REQUIRED BUT PASSED: {name}', flush=True)
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())

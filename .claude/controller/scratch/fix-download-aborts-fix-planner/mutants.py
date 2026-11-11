#!/usr/bin/env python3
"""fix-download-aborts fix round: the mutation check of test/workers/download-aborts.test.ts.

The round is test-only, so its RED is the review's surviving mutants: --red
applies each of R11, R13, R13b, R13c and R14 alone, runs the file, restores
the source byte for byte, and checks that exactly that mutant's cases fail,
each on an AssertionError. The default mode applies every mutant alone (the
planner's A1 to A9 and those five), runs the file, restores it, and checks
that every required case failed.

Usage (take the heavy lock first, release it after; run-mutants.sh does both):
  python3 -I mutants.py <apps/edge directory> <scratch directory> [LABEL ...]
  python3 -I mutants.py --red <apps/edge directory> <scratch directory>
  python3 -I mutants.py --check <apps/edge directory>   (no lock needed: checks
      that each mutant's old text occurs exactly once in its file, and that
      every required case name is a case of the test file)

The scratch directory receives the backup (mutant.keep) and one log per run
under mutant-logs/. Exit status 1 if a mutant fails to apply, a restore
differs from the backup, a mutant leaves a REQUIRED case passing, or a --red
mutant fails other cases than its own or fails one without an AssertionError.
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


DOWNLOAD_END = 'a promise that is pending while its body is unread and ends once the body is read, cancelled, answered to a HEAD or refused after it took its slot'
EXPORT = case(f'an export download hands waitUntil {DOWNLOAD_END}')
SNAPSHOT = case(f'a snapshot chunk download hands waitUntil {DOWNLOAD_END}')
RECEIPT = case(f'a receipt download hands waitUntil {DOWNLOAD_END}')
COPY = case('a retain hands waitUntil a promise that is pending while it holds a copy slot and ends once the slot is back; a retain turned away for want of a slot hands over nothing')
UPLOAD = case("an upload hands waitUntil a promise that is pending while it holds its place among the isolate's uploads and ends once it gives the place back")
LATER_ATTEMPT = case("a retain that waited on another request's copy hands waitUntil a promise on its later attempt too, pending while that attempt copies")
TURNED_AWAY = case("an upload turned away at the isolate's limit (503) hands waitUntil nothing")
ALL = {EXPORT, SNAPSHOT, RECEIPT, COPY, UPLOAD, LATER_ATTEMPT, TURNED_AWAY}
HOLDING = ALL - {TURNED_AWAY}

EXPORT_STEP = """  const reply = await w.vault.call('exports.file', { params: { grant: w.params.grant ?? '' } })
  if (!reply.ok) return reply
  const file = reply.body as StoredExportFile
  const release = untilReturned(w, EXPORT_SLOTS.take())
"""


def catch_unwrapped(take: str, body: str) -> tuple:
    """The download's slot taken through untilReturned, but its `catch` gives back the raw slot: the promise stays pending."""
    old = f'  const release = untilReturned(w, {take})\n{body}    release()\n'
    new = f'  const taken = {take}\n  const release = untilReturned(w, taken)\n{body}    taken()\n'
    return (old, new)


EXPORT_BODY = ('  try {\n'
               '    const body = await matchingObject(w.env, file)\n'
               '    const chunks = verifiedChunks(body, file.bytes, file.sha256)[Symbol.asyncIterator]()\n'
               '    return fileResponse(bodyStream(chunks, release), { contentType: EXPORT_CONTENT_TYPE, bytes: file.bytes, fileName: file.fileName })\n'
               '  } catch (error) {\n')
SNAPSHOT_BODY = ('  try {\n'
                 '    const body = await matchingObject(w.env, file)\n'
                 '    const chunks = verifiedChunks(body, file.bytes, file.sha256)[Symbol.asyncIterator]()\n'
                 '    return fileResponse(bodyStream(chunks, release), { contentType: SNAPSHOT_CONTENT_TYPE, bytes: file.bytes })\n'
                 '  } catch (error) {\n')
RECEIPT_BODY = ('  let chunks: AsyncIterator<Uint8Array> | undefined\n'
                '  try {\n'
                '    const body = await matchingObject(w.env, file)\n'
                '    chunks = verifiedChunks(body, file.bytes, file.sha256, true)[Symbol.asyncIterator]()\n'
                '    const limits = { idleMs: RECEIPT_LIMITS.downloadIdleMs, totalMs: RECEIPT_LIMITS.downloadTotalMs }\n'
                "    const first = await within(chunks.next(), limits.idleMs, 'receipt download')\n"
                '    return fileResponse(bodyStream(chunks, release, limits, first), { contentType: file.contentType, bytes: file.bytes, fileName: file.fileName })\n'
                '  } catch (error) {\n'
                '    void chunks?.return?.().catch(() => undefined)\n')

UPLOAD_CHECK = "  if (uploading >= MAX_UPLOADS_PER_ISOLATE) throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 })\n  uploading += 1\n"
UPLOAD_WRAP = '  const done = untilReturned(w, () => {\n    uploading -= 1\n  })\n'

# (label, description, file, [(old, new)], required cases)
MUTANTS = [
    # The planner's nine (brief fix-download-aborts, Step 4), with each case set widened to the round's new cases.
    ('A1', 'the export download takes its slot without untilReturned', DL,
     [('  const release = untilReturned(w, EXPORT_SLOTS.take())\n', '  const release = EXPORT_SLOTS.take()\n')], {EXPORT}),
    ('A2', 'the snapshot chunk download takes its slot without untilReturned', DL,
     [('  const release = untilReturned(w, SNAPSHOT_SLOTS.take())\n', '  const release = SNAPSHOT_SLOTS.take()\n')], {SNAPSHOT}),
    ('A3', 'the receipt download takes its slot without untilReturned', DL,
     [('  const release = untilReturned(w, RECEIPT_SLOTS.take(w.claims.accountId))\n', '  const release = RECEIPT_SLOTS.take(w.claims.accountId)\n')], {RECEIPT}),
    ('A4', 'the copy takes its slot without untilReturned', RC,
     [('    const slot = untilReturned(w, COPY_SLOTS.take())\n', '    const slot = COPY_SLOTS.take()\n')], {COPY, LATER_ATTEMPT}),
    ('A5', 'the upload holds its place without untilReturned', UP,
     [('  const done = untilReturned(w, () => {\n    uploading -= 1\n  })\n', '  const done = () => {\n    uploading -= 1\n  }\n')], {UPLOAD}),
    ('A6', "untilReturned's promise never ends", SL, [('    release()\n    returned()\n', '    release()\n')], HOLDING),
    ('A7', "untilReturned's promise ends at once", SL,
     [('  w.waitUntil(\n    new Promise<void>((resolve) => {\n      returned = resolve\n    }),\n  )\n', '  w.waitUntil(Promise.resolve())\n')], HOLDING),
    ('A8', 'untilReturned ends its promise but never returns the slot', SL, [('    release()\n    returned()\n', '    returned()\n')], ALL),
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
    # The review's (tests lens): m1 (R14), n2 (R11) and n3 (R13), and R13 on the other two downloads.
    ('R11', "the upload hands its promise over before the isolate's 503 check", UP, [(UPLOAD_CHECK + UPLOAD_WRAP, UPLOAD_WRAP + UPLOAD_CHECK)], {TURNED_AWAY}),
    ('R13', "the export download's catch gives back the slot without ending its promise", DL, [catch_unwrapped('EXPORT_SLOTS.take()', EXPORT_BODY)], {EXPORT}),
    ('R13b', "the snapshot chunk download's catch, the same", DL, [catch_unwrapped('SNAPSHOT_SLOTS.take()', SNAPSHOT_BODY)], {SNAPSHOT}),
    ('R13c', "the receipt download's catch, the same", DL, [catch_unwrapped('RECEIPT_SLOTS.take(w.claims.accountId)', RECEIPT_BODY)], {RECEIPT}),
    ('R14', "prepare's later attempts (after a `wait`) take their copy slot without untilReturned", RC,
     [('  for (;;) {\n    const slot = untilReturned(w, COPY_SLOTS.take())\n',
       '  let attempt = 0\n  for (;;) {\n    const slot = attempt++ === 0 ? untilReturned(w, COPY_SLOTS.take()) : COPY_SLOTS.take()\n')], {LATER_ATTEMPT}),
]

RED = ['R11', 'R13', 'R13b', 'R13c', 'R14']

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
    errors = len(re.findall(r'^(?:TypeError|ReferenceError|RangeError|SyntaxError|Error):', text, re.M))
    assertions = len(re.findall(r'^AssertionError', text, re.M))
    return failed, f'workers {totals.group(1).strip() if totals else "no totals"}', errors, assertions


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


def run_one(edge: str, scratch: str, mutant: tuple, log_name: str) -> tuple:
    label, _description, rel, edits, _required = mutant
    path = os.path.join(edge, rel)
    keep = os.path.join(scratch, 'mutant.keep')
    shutil.copyfile(path, keep)
    text = open(path, encoding='utf-8').read()
    if any(text.count(old) != 1 for old, _new in edits):
        return None
    for old, new in edits:
        text = text.replace(old, new)
    open(path, 'w', encoding='utf-8').write(text)
    try:
        result = run_focused(edge, os.path.join(scratch, 'mutant-logs', log_name))
    finally:
        shutil.copyfile(keep, path)
    return result + (filecmp.cmp(keep, path, shallow=False),)


def main() -> int:
    if sys.argv[1] == '--check':
        return check(sys.argv[2])
    red = sys.argv[1] == '--red'
    edge, scratch = (sys.argv[2], sys.argv[3]) if red else (sys.argv[1], sys.argv[2])
    only = set() if red else set(sys.argv[3:])
    os.makedirs(os.path.join(scratch, 'mutant-logs'), exist_ok=True)
    ok = True
    for mutant in MUTANTS:
        label, description, rel, _edits, required = mutant
        if red and label not in RED:
            continue
        if only and label not in only:
            continue
        result = run_one(edge, scratch, mutant, f'{"RED-" if red else ""}{label}.log')
        if result is None:
            print(f'{label} NOT APPLIED: an old text is not found exactly once in {rel}')
            ok = False
            continue
        failed, totals, errors, assertions, restored = result
        missing = sorted(required - failed)
        if red:
            extra = sorted(failed - required)
            good = not missing and not extra and errors == 0 and assertions == len(failed) and restored
            print(f'{label} RED {"as expected" if good else "NOT AS EXPECTED"} ({description}) [{totals}] assertion errors {assertions}, other errors {errors}, restored={restored}', flush=True)
            for name in sorted(failed):
                print(f'    failed: {name}', flush=True)
            for name in missing:
                print(f'    EXPECTED TO FAIL BUT PASSED: {name}', flush=True)
            for name in extra:
                print(f'    FAILED BUT NOT EXPECTED: {name}', flush=True)
        else:
            good = not missing and restored
            print(f'{label} {"KILLED" if not missing else "SURVIVED"} ({description}) [{totals}] restored={restored}', flush=True)
            for name in sorted(failed):
                print(f'    failed: {name}', flush=True)
            for name in missing:
                print(f'    REQUIRED BUT PASSED: {name}', flush=True)
        ok = ok and good
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())

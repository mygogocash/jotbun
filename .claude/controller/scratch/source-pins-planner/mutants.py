"""source-pins' mutants: one per write path, each a reviewer's mutant that survived P3-T2's own cases.

Usage (python3 -I, from any folder; paths may be relative to it):
  mutants.py --check <tree>            every anchor occurs exactly once, and every case the
                                       mutants must fail exists in the tree's test files
  mutants.py --red <tree> <out>        RED: R4, R5 and R9 applied at once; both typechecks run on
                                       that tree, then the two focused files; exactly the three new
                                       pins must fail, each on an AssertionError; every file is
                                       written back and its SHA-256 checked
  mutants.py <tree> <out>              each mutant alone, its focused file, then written back
  mutants.py --steps <tree> <out>      the planner's step mutants (the receipt case checks each of
                                       retain, replace and remove); not one of the brief's steps

A workers run takes the heavy lock through locked.sh, which sits next to this script; never
hold the lock around this script. Logs go to <out>/<id>.log (RED: red-*.log). The last line
reads "<k> of <n> killed; survivors [...]; not clean [...]; not restored [...]" (RED: "RED:
failed <n>, expected 3; ...").
"""
from __future__ import annotations

import hashlib
import os
import re
import subprocess
import sys

KIT = os.path.dirname(os.path.abspath(__file__))
LOCKED = os.path.join(KIT, 'locked.sh')

DOMAIN = 'apps/edge/src/vault/domain/transactions.ts'
ATTACH = 'apps/edge/src/vault/files/attachments.ts'
DIARY = 'apps/app/src/storage/diaryRepository.ts'
WORKERS_FILE = 'test/workers/transaction-source.test.ts'
UNIT_FILE = 'src/storage/diaryRepository.test.ts'
TEST_FILES = {'workers': 'apps/edge/' + WORKERS_FILE, 'unit': 'apps/app/' + UNIT_FILE}

RESTORE_CASE = 'a restore keeps the source, in the record and in the sync feed'
RECEIPT_CASE = 'a receipt kept, replaced and removed leaves the source as it was: a typed record stays typed'
OUTBOX_CASE = 'a pending entry may carry a source, and an unknown one is refused'

CLEAR = "    c.sql.exec('UPDATE transactions SET source = NULL WHERE id = ?', transactionId)\n"
RETAIN_RETURN = '    return nextVersion(c, transactionId, { consent: RECEIPT_RETENTION_CONSENT })\n'
REPLACE_RETURN = '    return nextVersion(c, transactionId, { consent: RECEIPT_RETENTION_CONSENT, previous: stateOf(c, previous) })\n'
REMOVE_RETURN = '    return nextVersion(c, transactionId, { previous: stateOf(c, gone.attachment_id) })\n'

# (id, what it breaks, file, old, new, runner, the one case it must fail)
MUTANTS = [
    ('R4', 'a restore clears the source (the first review\'s R4)', DOMAIN,
     'SET deleted_at = NULL, version = version + 1, updated_at = ?',
     'SET deleted_at = NULL, source = NULL, version = version + 1, updated_at = ?', 'workers', RESTORE_CASE),
    ('R5', 'the receipt commands\' version bump clears the source (the first review\'s R5)', ATTACH,
     'UPDATE transactions SET version = version + 1, updated_at = ? WHERE id = ?',
     'UPDATE transactions SET version = version + 1, source = NULL, updated_at = ? WHERE id = ?', 'workers', RECEIPT_CASE),
    ('R9', 'the outbox no longer checks a transfer draft\'s source (the first review\'s R9)', DIARY,
     '    parseTransactionSource(record.source);\n',
     '    if (!transfer) parseTransactionSource(record.source);\n', 'unit', OUTBOX_CASE),
]

STEPS = [
    ('S1', 'retain alone clears the source', ATTACH, RETAIN_RETURN, CLEAR + RETAIN_RETURN, 'workers', RECEIPT_CASE),
    ('S2', 'replace alone clears the source', ATTACH, REPLACE_RETURN, CLEAR + REPLACE_RETURN, 'workers', RECEIPT_CASE),
    ('S3', 'remove alone clears the source', ATTACH, REMOVE_RETURN, CLEAR + REMOVE_RETURN, 'workers', RECEIPT_CASE),
]


def sha(target: str) -> str:
    with open(target, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def run_tests(runner: str, tree: str, log: str) -> int:
    """Runs one focused file; a workers run holds the heavy lock (locked.sh writes the log)."""
    if runner == 'workers':
        argv = [LOCKED, log, os.path.join(tree, 'apps/edge'), 'npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', '--reporter=verbose', WORKERS_FILE]
        return subprocess.run(argv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode
    with open(log, 'w', encoding='utf-8') as f:
        return subprocess.run(['npm', 'run', 'test:unit', '--', UNIT_FILE], cwd=os.path.join(tree, 'apps/app'), stdout=f, stderr=subprocess.STDOUT).returncode


def read(log: str) -> str:
    with open(log, encoding='utf-8', errors='replace') as f:
        return f.read()


def outcome(runner: str, body: str) -> tuple[str, list[str], int, int]:
    """(the counts line, the failed case names, AssertionErrors, other errors) of one run's log."""
    if runner == 'workers':
        counts = re.search(r'^\s+Tests\s+(.+\(\d+\))', body, re.M)
        failed = sorted(set(m.split(' > ')[-1] for m in re.findall(r'^ FAIL  test/workers/\S+ > (.+)$', body, re.M)))
        assertions = len(re.findall(r'^AssertionError', body, re.M))
        others = len(re.findall(r'^(?:TypeError|ReferenceError|SyntaxError|RangeError|Error|SqliteError)\b[^\n]*:', body, re.M))
        return (counts.group(1) if counts else 'no counts', failed, assertions, others)
    tests = re.search(r'^ℹ tests (\d+)', body, re.M)
    passed = re.search(r'^ℹ pass (\d+)', body, re.M)
    fails = re.search(r'^ℹ fail (\d+)', body, re.M)
    counts = f'tests {tests.group(1)} pass {passed.group(1)} fail {fails.group(1)}' if tests and passed and fails else 'no counts'
    tail = body.split('failing tests:', 1)[1] if 'failing tests:' in body else ''
    failed = sorted(set(re.findall(r'^✖ (.+?) \(\d[\d.]*m?s\)$', tail, re.M)))
    assertions = len(re.findall(r'^\s+AssertionError \[ERR_ASSERTION\]', tail, re.M))
    others = len(re.findall(r'^\s+(?:TypeError|ReferenceError|SyntaxError|RangeError|Error)\b[^\n]*:', tail, re.M))
    return (counts, failed, assertions, others)


def apply(tree: str, mutants: list[tuple]) -> dict[str, tuple[bytes, str]]:
    """Writes every mutant into the tree; returns each touched file's original bytes and SHA-256."""
    saved: dict[str, tuple[bytes, str]] = {}
    for mid, _what, rel, old, new, _runner, _case in mutants:
        target = os.path.join(tree, rel)
        if rel not in saved:
            with open(target, 'rb') as f:
                saved[rel] = (f.read(), sha(target))
        with open(target, 'rb') as f:
            text = f.read()
        count = text.count(old.encode())
        if count != 1:
            restore(tree, saved)
            raise SystemExit(f'{mid}: expected its text once in {rel}, found {count}')
        with open(target, 'wb') as f:
            f.write(text.replace(old.encode(), new.encode()))
    return saved


def restore(tree: str, saved: dict[str, tuple[bytes, str]]) -> bool:
    ok = True
    for rel, (data, digest) in saved.items():
        target = os.path.join(tree, rel)
        with open(target, 'wb') as f:
            f.write(data)
        ok = ok and sha(target) == digest
    return ok


def check(tree: str) -> int:
    ok = True
    for mid, _what, rel, old, _new, runner, case in MUTANTS + STEPS:
        with open(os.path.join(tree, rel), 'rb') as f:
            count = f.read().count(old.encode())
        with open(os.path.join(tree, TEST_FILES[runner]), encoding='utf-8') as f:
            has_case = f"'{case}'" in f.read()
        print(f'{mid}: text found {count} time(s) in {rel}; case present: {has_case}')
        ok = ok and count == 1 and has_case
    print(f'{len(MUTANTS)} mutants and {len(STEPS)} step mutants; every text found exactly once and every case present: {ok}')
    return 0 if ok else 1


def red(tree: str, out: str) -> int:
    saved = apply(tree, MUTANTS)
    results = {}
    try:
        print(f'RED with {", ".join(m[0] for m in MUTANTS)}', flush=True)
        for script in ('typecheck:edge', 'typecheck:app'):
            log = os.path.join(out, f'red-{script.replace(":", "-")}.log')
            with open(log, 'w', encoding='utf-8') as f:
                rc = subprocess.run(['npm', 'run', script], cwd=tree, stdout=f, stderr=subprocess.STDOUT).returncode
            results[script] = rc
            print(f'{script} on the RED tree: rc={rc}', flush=True)
        for runner in ('workers', 'unit'):
            log = os.path.join(out, f'red-{runner}.log')
            rc = run_tests(runner, tree, log)
            results[runner] = (rc, outcome(runner, read(log)))
    finally:
        restored = restore(tree, saved)
    expected = {'workers': sorted([RESTORE_CASE, RECEIPT_CASE]), 'unit': [OUTBOX_CASE]}
    good = results['typecheck:edge'] == 0 and results['typecheck:app'] == 0 and restored
    failed_total = 0
    for runner in ('workers', 'unit'):
        rc, (counts, failed, assertions, others) = results[runner]
        failed_total += len(failed)
        clean = rc != 0 and assertions == len(failed) and others == 0
        print(f'{runner}: {counts}; rc={rc}; assertion failures {assertions} of {len(failed)}; other errors {others}', flush=True)
        for name in failed:
            print(f'  {"failed as expected" if name in expected[runner] else "FAILED BUT NOT EXPECTED"}: {name}', flush=True)
        for name in expected[runner]:
            if name not in failed:
                print(f'  EXPECTED TO FAIL BUT PASSED: {name}', flush=True)
        good = good and clean and failed == expected[runner]
    print(f'restored={restored}', flush=True)
    print(f'RED: failed {failed_total}, expected 3; {"as expected" if good else "NOT AS EXPECTED"}', flush=True)
    return 0 if good else 1


def each(tree: str, out: str, mutants: list[tuple]) -> int:
    killed, survivors, unclean, unrestored = [], [], [], []
    for mutant in mutants:
        mid, what, rel, _old, _new, runner, case = mutant
        saved = apply(tree, [mutant])
        log = os.path.join(out, f'{mid}.log')
        try:
            rc = run_tests(runner, tree, log)
        finally:
            restored = restore(tree, saved)
        if not restored:
            unrestored.append(mid)
        counts, failed, assertions, others = outcome(runner, read(log))
        clean = assertions == len(failed) and others == 0 and failed == [case]
        if rc != 0:
            killed.append(mid)
            if not clean:
                unclean.append(mid)
            print(f'{mid} killed ({"assertion" if clean else "NOT CLEAN"}; {counts}; failed: {"; ".join(failed)}): {what} [{os.path.basename(rel)}] restored={restored}', flush=True)
        else:
            survivors.append(mid)
            print(f'{mid} SURVIVED ({counts}): {what} [{os.path.basename(rel)}] restored={restored}', flush=True)
    print(f'{len(killed)} of {len(mutants)} killed; survivors {survivors}; not clean {unclean}; not restored {unrestored}', flush=True)
    return 0 if not survivors and not unclean and not unrestored else 1


def main(argv: list[str]) -> int:
    if len(argv) == 2 and argv[0] == '--check':
        return check(os.path.abspath(argv[1]))
    mode = argv[0] if argv and argv[0].startswith('--') else ''
    rest = argv[1:] if mode else argv
    if mode not in ('', '--red', '--steps') or len(rest) != 2:
        print(__doc__)
        return 2
    tree, out = os.path.abspath(rest[0]), os.path.abspath(rest[1])
    os.makedirs(out, exist_ok=True)
    if mode == '--red':
        return red(tree, out)
    return each(tree, out, STEPS if mode == '--steps' else MUTANTS)


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

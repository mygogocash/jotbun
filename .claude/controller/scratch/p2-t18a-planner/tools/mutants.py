#!/usr/bin/env python3
"""P2-T18a mutation check (before the wallet shell: today's total, the iOS announcement, the new-wallet flow's one
way out and the editor's ref). Usage: python3 -I mutants.py <tree root> <log dir> [ids...]
                                or: python3 -I mutants.py <tree root> --check

Applies each mutant alone to the tree, runs the test file that holds its guard (savedMoment.test.ts with Node's test
runner; SavedMoment.render.test.tsx, NewWallet.render.test.tsx and WalletEdit.render.test.tsx in the render suite),
restores the file byte for byte (sha256 checked) and prints one line per mutant: KILLED or SURVIVED, the test
summary, the error kind of each failing case, and whether the restore matched. A kill is clean only when every
failing case fails on an AssertionError. With ids, runs only those (merge_mutants.py joins batches). With --check,
applies nothing and checks that every mutant's text occurs exactly once. Exits 0 only when every mutant it ran is
killed cleanly and every file is restored.
"""
from __future__ import annotations

import hashlib
import os
import re
import subprocess
import sys

MOMENT = 'apps/app/src/wallet/saved/savedMoment.ts'
HOST = 'apps/app/src/wallet/saved/SavedToastHost.tsx'
FLOW = 'apps/app/src/wallet/wallets/NewWalletFlow.tsx'
EDIT = 'apps/app/src/wallet/wallets/WalletEditScreen.tsx'

UNIT = 'src/wallet/saved/savedMoment.test.ts'
SAVED = 'src/wallet/saved/SavedMoment.render.test.tsx'
NEW = 'src/wallet/wallets/NewWallet.render.test.tsx'
EDITING = 'src/wallet/wallets/WalletEdit.render.test.tsx'

GUARD = "    if (state === 'acknowledged' && ackedRevision !== null && input.readRevision !== undefined && BigInt(ackedRevision) <= BigInt(input.readRevision)) continue;\n"
MOVED = "        const moved = now.phase === 'ready' ? BigInt(now.appliedRevision) > BigInt(page.as_of_revision) : openAtStart.current;\n"

# (id, test file, description, file, [(old, new), ...][, 'equivalent']); each old occurs exactly once in its file.
MUTANTS = [
    # Race B: an acknowledged command committed by the read's revision (savedMoment.ts), on the Node test.
    ('M1', UNIT, 'an acknowledged command committed by the read is counted', MOMENT, [(GUARD, '')]),
    ('M2', UNIT, "one committed at the read's own revision is counted", MOMENT, [(GUARD, GUARD.replace(' <= ', ' < '))]),
    ('M3', UNIT, 'revisions compare as text', MOMENT, [(GUARD, GUARD.replace('BigInt(ackedRevision) <= BigInt(input.readRevision)', 'ackedRevision <= input.readRevision'))]),
    ('M4', UNIT, 'any state committed by the read is left out', MOMENT, [(GUARD, GUARD.replace("state === 'acknowledged' && ", ''))]),
    ('M5', UNIT, 'no committed revision is read as one', MOMENT, [(GUARD, GUARD.replace('ackedRevision !== null && ', ''))]),
    ('M6', UNIT, "no read revision reads as the command's own (committed by the read)", MOMENT, [(GUARD, GUARD.replace('input.readRevision !== undefined && BigInt(ackedRevision) <= BigInt(input.readRevision)', 'BigInt(ackedRevision) <= BigInt(input.readRevision ?? ackedRevision)'))]),
    # Race A and the closed diary (SavedToastHost.tsx), on the saved moment's render suite.
    ('H1', SAVED, 'a diary that moved still shows a figure', HOST, [('        if (page.next_cursor === null && !moved) {\n', '        if (page.next_cursor === null) {\n')]),
    ('H2', SAVED, "a diary at the read's own revision counts as moved", HOST, [(MOVED, MOVED.replace(' > BigInt(page.as_of_revision)', ' >= BigInt(page.as_of_revision)'))]),
    ('H3', SAVED, 'revisions compare as text', HOST, [(MOVED, MOVED.replace('BigInt(now.appliedRevision) > BigInt(page.as_of_revision)', 'now.appliedRevision > page.as_of_revision'))]),
    ('H4', SAVED, 'a diary that closed while the read was out still shows a figure', HOST, [(MOVED, MOVED.replace(': openAtStart.current;', ': false;'))]),
    ('H5', SAVED, 'no diary at all counts as moved', HOST, [(MOVED, MOVED.replace(': openAtStart.current;', ': true;'))]),
    ('H6', SAVED, "the read's revision is not handed on", HOST, [('            readRevision: page.as_of_revision,\n', '')]),
    ('H7', SAVED, "iOS hears the real total in private mode (the P2-T17 reviews' M1, O50a)", HOST, [('  useAnnouncement(appeared ? spoken : null);\n', '  useAnnouncement(appeared ? (said ?? toastWords(notice, total, false, t).spoken) : null);\n')]),
    # The new-wallet flow (NewWalletFlow.tsx), on its render suite.
    ('W1', NEW, 'the flow is left at every press', FLOW, [('    if (left.current) return;\n    left.current = true;\n    if (router.canGoBack()) router.back();\n', '    left.current = true;\n    if (router.canGoBack()) router.back();\n')]),
    ('W2', NEW, 'the flow never says it was left', FLOW, [('    if (left.current) return;\n    left.current = true;\n', '    if (left.current) return;\n')]),
    ('W3', NEW, "the card's place has no nativeID", FLOW, [(' nativeID="new-wallet-card-place"', '')]),
    ('W4', NEW, "a refusal's back leaves the flow (the confirming review's Z1)", FLOW, [('  const back = unconfirmed === null ? () => setStep(1) : leave;\n', "  const back = sending.phase === 'idle' ? () => setStep(1) : leave;\n")]),
    ('W5', NEW, "back is held after a refusal that blocks (the confirming review's Z2)", FLOW, [("onPress: back, disabled: sending.phase === 'saving' }}", "onPress: back, disabled: sending.phase === 'saving' || stuck }}")]),
    # The editor (WalletEditScreen.tsx), on its render suite.
    ('E1', EDITING, "the ref stays set after React's development double run", EDIT, [('    left.current = false;\n    return () => {\n', '    return () => {\n')]),
    ('E2', EDITING, 'the ref is never set when the editor goes', EDIT, [('    return () => {\n      left.current = true;\n    };\n', '    return undefined;\n')]),
]

VITEST_SUMMARY = re.compile(r'^\s*Tests  (.+?)\s*$', re.M)
NODE_COUNTS = re.compile(r'^ℹ (tests|pass|fail) (\d+)$', re.M)


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def kinds_of(text):
    """The error kind of each failing case (see first_errors.py)."""
    kinds = []
    if 'Failed Tests' in text:
        tail = text.split('Failed Tests', 1)[1]
        for block in re.split(r'^⎯+\[\d+/\d+\]⎯*$', tail, flags=re.M):
            cases = re.findall(r'^ FAIL  .+$', block, re.M)
            error = re.search(r'^(\w*Error)\b', block, re.M)
            kinds += [error.group(1) if error else 'unknown'] * len(cases)
    elif 'failing tests:' in text:
        for block in re.split(r'^✖ ', text.split('failing tests:', 1)[1], flags=re.M)[1:]:
            error = re.search(r'^\s+(\w*Error)\b', block, re.M)
            kinds.append(error.group(1) if error else 'unknown')
    return kinds


def run_tests(app, test_file):
    if test_file.endswith('.test.ts'):
        command = ['node', 'scripts/test-unit.mjs', test_file]
    else:
        command = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', test_file]
    run = subprocess.run(command, cwd=app, capture_output=True, text=True, timeout=900)
    return run.returncode, run.stdout + run.stderr


def summary_of(output, test_file):
    if test_file.endswith('.test.ts'):
        counts = dict(NODE_COUNTS.findall(output))
        return f"tests {counts.get('tests', '?')} pass {counts.get('pass', '?')} fail {counts.get('fail', '?')}"
    found = VITEST_SUMMARY.findall(output)
    if found:
        return found[-1]
    return 'no tests (the file failed to load)' if 'Test Files' in output else 'no summary'


def mutated(root, rel, edits):
    with open(os.path.join(root, rel), 'rb') as handle:
        original = handle.read()
    text = original.decode('utf-8')
    for old, new in edits:
        count = text.count(old)
        if count != 1:
            return original, None, f'{count} matches for {old!r} in {rel}'
        text = text.replace(old, new)
    return original, text, None


def main():
    root = sys.argv[1]
    if sys.argv[2:] == ['--check']:
        bad = 0
        for ident, _test, _description, rel, edits, *_expects in MUTANTS:
            _original, _text, problem = mutated(root, rel, edits)
            if problem:
                bad += 1
                print(f'{ident} SETUP ERROR: {problem}')
        print(f'{len(MUTANTS)} mutants, {bad} that do not apply')
        sys.exit(1 if bad else 0)
    logs = sys.argv[2]
    os.makedirs(logs, exist_ok=True)
    app = os.path.join(root, 'apps/app')
    wanted = sys.argv[3:]
    unknown = [ident for ident in wanted if ident not in {m[0] for m in MUTANTS}]
    if unknown:
        raise SystemExit(f'unknown mutants: {unknown}')
    unexpected = killed = survived = 0
    for ident, test_file, description, rel, edits, *expects in MUTANTS:
        if wanted and ident not in wanted:
            continue
        equivalent = expects == ['equivalent']
        path = os.path.join(root, rel)
        original, text, problem = mutated(root, rel, edits)
        if problem:
            print(f'{ident} SETUP ERROR: {problem}', flush=True)
            sys.exit(2)
        before = hashlib.sha256(original).hexdigest()
        try:
            with open(path, 'wb') as handle:
                handle.write(text.encode('utf-8'))
            code, output = run_tests(app, test_file)
        finally:
            with open(path, 'wb') as handle:
                handle.write(original)
        after = sha(path)
        with open(os.path.join(logs, f'{ident}.log'), 'w', encoding='utf-8') as handle:
            handle.write(output)
        kinds = kinds_of(output)
        if code == 0:
            outcome, clean = ('SURVIVED (equivalent)', True) if equivalent else ('SURVIVED', False)
            survived += 1
        else:
            killed += 1
            outcome = 'KILLED'
            clean = not equivalent and bool(kinds) and all(kind == 'AssertionError' for kind in kinds)
        restored = 'restored sha256 equal' if after == before else f'RESTORE MISMATCH {after}'
        kind_text = ', '.join(f'{kinds.count(kind)} {kind}' for kind in sorted(set(kinds))) or 'no failing case'
        print(f'{ident} {outcome}: {description} [{os.path.basename(rel)} / {os.path.basename(test_file)}] -> Tests {summary_of(output, test_file)}; {kind_text}; {restored}', flush=True)
        if not clean or after != before:
            unexpected += 1
    print(f'{killed} killed, {survived} survived, {unexpected} not as expected')
    sys.exit(1 if unexpected else 0)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""tray-hardening second fix round: the mutation check (45 mutants).

Usage: python3 -I mutants.py <worktree root> [--check] [ids...]
       (MUTANT_LOGS=<dir> keeps each mutant's test output there.)

The fix round's runner (tray-hardening-fix-planner/tools/mutants.py), with the
patterns that read iOS's late onDismiss guard written again for this round's
guard (`!shown && !showing.current`, the `showing` ref restored), and five
more mutants: the review's M3 (c-n1) and H13 to H16 on the new guard (c-m1).

Applies each mutant alone to its file (Tray.tsx, or the catalogue's wallet
index.ts for K1 and K2), runs both of the tray's test files (the Node file
reads Tray.tsx's source; the render file runs it), restores the file byte for
byte (sha256 checked) and prints one line per mutant. A mutant is killed when
either file fails. Exits 0 only when every mutant is killed and every file is
restored. With --check it only reports whether each mutant's text matches
exactly once, and runs nothing.
"""
import hashlib
import os
import re
import subprocess
import sys

TRAY = 'apps/app/src/wallet/tray/Tray.tsx'
INDEX = 'apps/app/src/dev/catalogue/wallet/index.ts'

NODE = ['npm', 'run', 'test:unit', '--', 'src/wallet/tray/trayGesture.test.ts']
RENDER = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', 'src/wallet/tray/Tray.render.test.tsx']

CLOSABLE = '  const closable = visible && !locked && !hidden;\n'
GUARD = '    if (!shown && !showing.current) closed.current?.();\n'
SHOWING_REF = '  const showing = useRef(shown);\n'
REFRESH = '    showing.current = shown;\n'
DISMISSED = '  const dismissed = () => {\n    if (!shown && !showing.current) closed.current?.();\n  };\n'
REACT = "import { useEffect, useRef, useState } from 'react';\n"
RESET = '    if (visible) drag.value = 0;\n'
TICK_DEPS = '  }, [step, visible, hidden, reduced]);\n'
RESET_DEPS = '  }, [visible, hidden, drag]);\n'
TICK = '    const tick = changed && open && wasOpen.current;\n'
OPEN = '    const open = visible && !hidden;\n'
WAS_OPEN = '    wasOpen.current = open;\n'
SWIPE_END = '      if (closable && !event.canceled && shouldDismiss('
CANCEL_NOTE = '      // A swipe the system cancels (a call, a system gesture) never closes: the finger did not let go.\n'
ON_DISMISS = "      onDismiss={Platform.OS === 'ios' ? dismissed : undefined}\n"
EXIT_HIDE = "      if (Platform.OS !== 'ios') closed.current?.();\n"
CARD_DIALOG = "  const cardDialog = web ? null : { role: 'dialog' as const, 'aria-modal': true, 'aria-label': title };\n"
UNSEEN_TITLE = '{header ? <View ref={titleRef} {...titleHeader} style={UNSEEN} /> : null}'
TITLE_HEADER = "const titleHeader = { accessible: true, accessibilityRole: 'header' as const, accessibilityLabel: title };"

# (id, description, file, [(old, new), ...]); each old must occur exactly once.
MUTANTS = [
    # This task's new lines.
    ('H1', 'under the lock cover the system back still asks to close (m1)', TRAY, [(CLOSABLE, '  const closable = visible && !locked;\n')]),
    ('H2', "iOS's late onDismiss always says it closed (m2)", TRAY, [(GUARD, '    closed.current?.();\n')]),
    ('H3', 'the late onDismiss is guarded by visible, not by the Modal being shown (m2)', TRAY, [(GUARD, '    if (!visible) closed.current?.();\n')]),
    ('H4', "the late onDismiss's guard keeps the first render's shown (a callback never renewed) (m2)", TRAY, [
        (REACT, "import { useCallback, useEffect, useRef, useState } from 'react';\n"),
        (DISMISSED, '  const dismissed = useCallback(() => {\n    if (!shown && !showing.current) closed.current?.();\n  }, []);\n')]),
    ('H5', "the cover's coming or going leaves a drag where it was (m3)", TRAY, [(RESET_DEPS, '  }, [visible, drag]);\n')]),
    ('H6', 'opening at another step in one render ticks (m4)', TRAY, [(TICK, '    const tick = changed && open;\n')]),
    ('H7', 'a step change under the cover ticks (m4)', TRAY, [(OPEN, '    const open = visible;\n')]),
    ('H8', 'the cover lifting on another step ticks (m4)', TRAY, [(WAS_OPEN, '    wasOpen.current = visible;\n')]),
    ('H9', 'a step change never ticks once the tray is open (m4)', TRAY, [(WAS_OPEN, '')]),
    ('H10', 'a cancelled swipe past the line closes (n1)', TRAY, [(SWIPE_END, '      if (closable && shouldDismiss(')]),
    ('H11', 'a cancelled swipe stays pulled down (n1)', TRAY, [(CANCEL_NOTE, '      if (event.canceled) return;\n')]),
    # The review's mutants that survived P2-T13's cases (B: behaviour lens, O: surface lens), and B2.
    ('B1', 'the onClosed ref is never refreshed (n3)', TRAY, [('    closed.current = onClosed;\n', '    void onClosed;\n')]),
    ('B2', 'the Modal is given onDismiss on every platform', TRAY, [(ON_DISMISS, '      onDismiss={dismissed}\n')]),
    ('B4', 'the hide calls the onClosed its effect captured, not the latest (n3)', TRAY, [(EXIT_HIDE, "      if (Platform.OS !== 'ios') onClosed?.();\n")]),
    ('O1', 'a phone: the card is no dialog (m5)', TRAY, [(CARD_DIALOG, '  const cardDialog = null;\n')]),
    ('O2', "a phone: the card's dialog has no name (m5)", TRAY, [("{ role: 'dialog' as const, 'aria-modal': true, 'aria-label': title }", "{ role: 'dialog' as const, 'aria-modal': true }")]),
    ('O5', "with a header, a phone's focus goes nowhere (m5)", TRAY, [(UNSEEN_TITLE, '{header ? <View {...titleHeader} style={UNSEEN} /> : null}')]),
    ('O6', 'with a header, a phone focuses the header, not the title (m5)', TRAY, [
        (UNSEEN_TITLE, '{header ? <View {...titleHeader} style={UNSEEN} /> : null}'),
        ('<View style={{ flex: 1 }}>{header}</View>', '<View ref={titleRef} style={{ flex: 1 }}>{header}</View>')]),
    ('O7', "the backdrop takes a phone's keyboard focus (focusable dropped) (m6)", TRAY, [('                focusable={false}\n', '')]),
    ('O11', 'a phone: the title is no accessibility element (accessible dropped) (m6)', TRAY, [(TITLE_HEADER, "const titleHeader = { accessibilityRole: 'header' as const, accessibilityLabel: title };")]),
    # P2-T13's mutants: the plan's three, and those on the lines this task changed.
    ('R1', "the backdrop closes a locked tray (the plan's mutant)", TRAY, [('                onPress={requestClose}\n', '                onPress={onClose}\n')]),
    ('R2', "the Modal hides at once on close (the plan's mutant)", TRAY, [('      visible={shown}\n', '      visible={visible}\n')]),
    ('R3', "the lock cover ignored (the plan's mutant)", TRAY, [('  const { hidden } = useLockCover();\n', '  const hidden = false;\n')]),
    ('R4', 'a locked tray still closes', TRAY, [(CLOSABLE, '  const closable = visible && !hidden;\n')]),
    ('R5', 'a leaving tray asks to close again', TRAY, [(CLOSABLE, '  const closable = !locked && !hidden;\n')]),
    ('R7', 'a locked swipe stays pulled down', TRAY, [(SWIPE_END, '      if (!event.canceled && shouldDismiss(')]),
    ('R13', 'a reopened tray keeps the last pull', TRAY, [(RESET, '')]),
    ('R14', 'no tick on a step change', TRAY, [('    if (haptic) playHaptic(haptic);\n', '')]),
    ('R15', 'opening ticks too', TRAY, [(TICK, '    const tick = open && (changed || !wasOpen.current);\n')]),
    ('R16', 'a closed tray ticks', TRAY, [(OPEN, '    const open = !hidden;\n')]),
    ('R25', 'on iOS onClosed fires before the Modal has gone', TRAY, [(EXIT_HIDE, '      closed.current?.();\n')]),
    ('R26', 'on iOS onClosed never fires', TRAY, [(ON_DISMISS, '      onDismiss={undefined}\n')]),
    # The catalogue case, now read where the tray's sections sit.
    ('K1', 'the tray sections not in the wallet list', INDEX, [('  ...WALLET_TRAY_SECTIONS,\n', '')]),
    ('K2', "the tray sections before the kit's", INDEX, [('  ...WALLET_KIT_SECTIONS,\n  ...WALLET_TRAY_SECTIONS,\n', '  ...WALLET_TRAY_SECTIONS,\n  ...WALLET_KIT_SECTIONS,\n')]),
    # The fix round: the review's m-1 (H12), and the survivors it found (X1, D2, X4), with D1 and X2 beside them.
    ('H12', "the late onDismiss's guard reads only the ref an effect refreshes, 784667b's (m-1)", TRAY, [
        (GUARD, '    if (!showing.current) closed.current?.();\n')]),
    ('X1', 'the drag is reset during the exit too, with no `if (visible)` (m-2)', TRAY, [(RESET, '    drag.value = 0;\n')]),
    ('D2', 'the tick effect without `hidden` in its dependencies (n-1)', TRAY, [(TICK_DEPS, '  }, [step, visible, reduced]);\n')]),
    ('X4', "iOS's onDismiss calls onClosed with no optional chaining, so a host with none throws (n-2)", TRAY, [(GUARD, '    if (!shown && !showing.current) closed.current!();\n')]),
    ('D1', 'the tick effect without `visible` in its dependencies', TRAY, [(TICK_DEPS, '  }, [step, hidden, reduced]);\n')]),
    ('X2', 'the drag reset without `visible` in its dependencies', TRAY, [(RESET_DEPS, '  }, [hidden, drag]);\n')]),
    # The second fix round: the confirming review's M3 (c-n1), and the new guard's own (c-m1).
    ('M3', 'dismissed is memoised on [shown] and calls the onClosed captured then, a stale host callback (c-n1)', TRAY, [
        (REACT, "import { useCallback, useEffect, useRef, useState } from 'react';\n"),
        (DISMISSED, '  const dismissed = useCallback(() => {\n    if (!shown && !showing.current) onClosed?.();\n  }, [shown]);\n')]),
    ('H13', "the late onDismiss's guard reads only this render's shown, fc78376's (c-m1)", TRAY, [(GUARD, '    if (!shown) closed.current?.();\n')]),
    ('H14', "the late onDismiss's guard says closed when either one is hidden, not both (c-m1)", TRAY, [(GUARD, '    if (!shown || !showing.current) closed.current?.();\n')]),
    ('H15', '`showing` is written during the render, not after the commit (c-m1)', TRAY, [
        (REFRESH, ''),
        (SHOWING_REF, '  const showing = useRef(shown);\n  showing.current = shown;\n')]),
    ('H16', '`showing` is never refreshed (c-m1)', TRAY, [(REFRESH, '')]),
]

SUMMARY = re.compile(r'^\s*Tests  (.+?)\s*$', re.M)
FAILED = re.compile(r'^\s*×\s+\S+\s+>\s+(.+?)\s+\d+ms\s*$', re.M)
NODE_TOTALS = re.compile(r'^ℹ (tests|pass|fail) (\d+)', re.M)
NODE_FAILED = re.compile(r'^✖ (.+?) \([\d.]+ms\)$', re.M)


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def mutated(text, ident, edits):
    for old, new in edits:
        count = text.count(old)
        if count != 1:
            return None, f'{ident} SETUP ERROR: {count} matches for {old!r}'
        text = text.replace(old, new)
    return text, None


def report(command, output):
    if command is NODE:
        totals = dict(NODE_TOTALS.findall(output))
        summary = f"node {totals.get('fail', '?')} failed | {totals.get('pass', '?')} passed ({totals.get('tests', '?')})"
        failed = NODE_FAILED.findall(output)
    else:
        found = SUMMARY.findall(output)
        summary = 'render ' + (found[-1] if found else 'no summary')
        failed = FAILED.findall(output)
    first = f' (first failing: "{failed[0].strip()}")' if failed else ''
    return summary + first


def main():
    args = sys.argv[1:]
    check = '--check' in args
    args = [arg for arg in args if arg != '--check']
    root, wanted = args[0], set(args[1:])
    logs = os.environ.get('MUTANT_LOGS')
    if logs:
        os.makedirs(logs, exist_ok=True)
    app = os.path.join(root, 'apps/app')
    unexpected = killed = survived = 0
    for ident, description, rel, edits in MUTANTS:
        if wanted and ident not in wanted:
            continue
        path = os.path.join(root, rel)
        with open(path, 'rb') as handle:
            original = handle.read()
        before = hashlib.sha256(original).hexdigest()
        text, error = mutated(original.decode('utf-8'), ident, edits)
        if error:
            print(error, flush=True)
            sys.exit(2)
        if check:
            print(f'{ident} APPLIES: {description} [{os.path.basename(rel)}]', flush=True)
            continue
        outputs = []
        failing = False
        try:
            with open(path, 'wb') as handle:
                handle.write(text.encode('utf-8'))
            for command in (NODE, RENDER):
                run = subprocess.run(command, cwd=app, capture_output=True, text=True, timeout=900)
                outputs.append((command, run.stdout + run.stderr))
                failing = failing or run.returncode != 0
        finally:
            with open(path, 'wb') as handle:
                handle.write(original)
        restored = sha(path) == before
        if logs:
            with open(os.path.join(logs, f'{ident}.log'), 'w', encoding='utf-8') as handle:
                handle.write('\n'.join(output for _, output in outputs))
        outcome = 'KILLED' if failing else 'SURVIVED'
        if failing:
            killed += 1
        else:
            survived += 1
        details = '; '.join(report(command, output) for command, output in outputs)
        assertions = sum(output.count('AssertionError') for _, output in outputs)
        print(f'{ident} {outcome}: {description} [{os.path.basename(rel)}] -> {details}; AssertionError x{assertions}; restored={restored}', flush=True)
        if not failing or not restored:
            unexpected += 1
    if check:
        return
    print(f'{killed} killed, {survived} survived, {unexpected} not as expected')
    sys.exit(1 if unexpected else 0)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""P2-T9 mutation check. Usage: python3 -I mutants.py <worktree root> <log dir> [ids...]

Applies each mutant alone to the worktree, runs its suite (the Node table test,
or the two motion render files), restores the file byte for byte (sha256
checked) and prints one line per mutant. Exits 0 only when every mutant ends
as expected (killed, or, for an equivalent one, surviving with every test
passing) and every file is restored.
"""
import hashlib
import os
import re
import subprocess
import sys

WM = 'apps/app/src/wallet/motion/walletMotion.ts'
MO = 'apps/app/src/theme/motion.ts'
UW = 'apps/app/src/wallet/motion/useWalletMotion.ts'
GB = 'apps/app/src/wallet/motion/GrowBar.tsx'
HA = 'apps/app/src/wallet/testing/walletHarness.tsx'

UNIT = ['node', 'scripts/test-unit.mjs', 'src/wallet/motion/walletMotion.test.ts']
RENDER = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose',
          'src/wallet/motion/GrowBar.render.test.tsx', 'src/wallet/motion/useWalletMotion.render.test.tsx']

NEVER = '.reduceMotion(ReduceMotion.Never)'
TRAY_IN = (
    '  return reduced\n'
    '    ? FadeIn.duration(FADE_MS).reduceMotion(ReduceMotion.Never)\n'
    "    : sprung(new SlideInDown(), 'gentle').reduceMotion(ReduceMotion.Never);\n"
)
TRAY_OUT = (
    '  return reduced\n'
    '    ? FadeOut.duration(FADE_MS).reduceMotion(ReduceMotion.Never)\n'
    '    : SlideOutDown.duration(TRAY_EXIT_MS).reduceMotion(ReduceMotion.Never);\n'
)
TOAST_IN = (
    '  return reduced\n'
    '    ? FadeIn.duration(FADE_MS).reduceMotion(ReduceMotion.Never)\n'
    "    : sprung(new SlideInUp(), 'snappy').reduceMotion(ReduceMotion.Never);\n"
)
ADDED_IN = (
    '  return reduced\n'
    '    ? FadeIn.duration(FADE_MS).reduceMotion(ReduceMotion.Never)\n'
    "    : sprung(new SlideInUp(), 'bouncy').reduceMotion(ReduceMotion.Never);\n"
)
STEP_IN = '  return FadeIn.duration(FADE_MS).reduceMotion(ReduceMotion.Never);\n'
STEP_LAYOUT = "  return reduced ? undefined : sprung(new LinearTransition(), 'gentle').reduceMotion(ReduceMotion.Never);\n"
TRAY_IN_DOC = '/** A tray opening (trayOpen): it springs up from below on the gentle spring, or fades in. */\n'
STEP_IN_DOC = "/** A tray step's new content (trayStep): it fades in, at full motion and under Reduce Motion. */\n"
DECIDE = "  const [plan] = useState(() => motionFor('budgetBar', reduced).motion);\n"
ASK = '  const reduced = useWalletReducedMotion();\n'
CLAMP = '  return fraction > 0 ? Math.min(fraction, 1) * 100 : 0;\n'

# (id, expectation, description, file, suite, [(old, new), ...]); each old must occur exactly once.
MUTANTS = [
    # The table (walletMotion.ts): the Node test.
    ('W1', 'killed', "reduced walletOpen as a fade (the plan's mutant)", WM, UNIT, [("reduced: { kind: 'instant' }, haptic: 'walletOpen' }", "reduced: { kind: 'fade', durationMs: 150 }, haptic: 'walletOpen' }")]),
    ('W2', 'killed', 'motionFor ignores Reduce Motion', WM, UNIT, [('motion: reducedMotion ? row.reduced : row.full,', 'motion: row.full,')]),
    ('W3', 'killed', 'motionFor reads the two columns the wrong way round', WM, UNIT, [('motion: reducedMotion ? row.reduced : row.full,', 'motion: reducedMotion ? row.full : row.reduced,')]),
    ('W4', 'killed', 'the haptic plays at full motion only', WM, UNIT, [('haptic: row.haptic };', 'haptic: reducedMotion ? null : row.haptic };')]),
    ('W5', 'killed', "the save's crossfade is 150 ms, not 200", WM, UNIT, [("reduced: { kind: 'fade', durationMs: 200 }", "reduced: { kind: 'fade', durationMs: 150 }")]),
    ('W6', 'killed', 'the saved toast rides the gentle spring', WM, UNIT, [("savedToast: { full: { kind: 'spring', spring: 'snappy' }", "savedToast: { full: { kind: 'spring', spring: 'gentle' }")]),
    ('W7', 'killed', 'the tray opens instantly under Reduce Motion', WM, UNIT, [("trayOpen: { full: { kind: 'spring', spring: 'gentle' }, reduced: { kind: 'fade', durationMs: 150 }", "trayOpen: { full: { kind: 'spring', spring: 'gentle' }, reduced: { kind: 'instant' }")]),
    ('W8', 'killed', 'the budget bar grows for 300 ms', WM, UNIT, [("{ kind: 'grow', durationMs: 320 }", "{ kind: 'grow', durationMs: 300 }")]),
    ('W9', 'killed', "the recap's confetti stays under Reduce Motion", WM, UNIT, [("recap: { full: { kind: 'confetti' }, reduced: { kind: 'instant' }", "recap: { full: { kind: 'confetti' }, reduced: { kind: 'confetti' }")]),
    ('W10', 'killed', 'pages cut instantly under Reduce Motion', WM, UNIT, [("page: { full: { kind: 'system' }, reduced: { kind: 'system' }", "page: { full: { kind: 'system' }, reduced: { kind: 'instant' }")]),
    ('W11', 'killed', 'the moment list leaves out page', WM, UNIT, [("  'page',\n];", '];')]),
    ('W12', 'killed', 'a new wallet plays no haptic', WM, UNIT, [("reduced: { kind: 'fade', durationMs: 150 }, haptic: 'walletAdded' }", "reduced: { kind: 'fade', durationMs: 150 }, haptic: null }")]),
    ('W13', 'killed', 'the save plays success as well as the save rule (W17)', WM, UNIT, [("reduced: { kind: 'fade', durationMs: 200 }, haptic: null }", "reduced: { kind: 'fade', durationMs: 200 }, haptic: 'saveLanded' }")]),
    ('W14', 'killed', 'amounts hide instantly at full motion', WM, UNIT, [("hideAmounts: { full: { kind: 'fade', durationMs: 150 }", "hideAmounts: { full: { kind: 'instant' }")]),
    ('W15', 'killed', 'a tray step plays no tick', WM, UNIT, [("reduced: { kind: 'fade', durationMs: 150 }, haptic: 'trayStep' }", "reduced: { kind: 'fade', durationMs: 150 }, haptic: null }")]),
    # The haptic table (motion.ts): the Node test.
    ('T1', 'killed', 'a tray step plays impact', MO, UNIT, [('    trayStep: "selection",\n', '    trayStep: "impact",\n')]),
    ('T2', 'killed', 'opening a wallet is silent', MO, UNIT, [('    walletOpen: "selection",\n', '    walletOpen: "none",\n')]),
    ('T3', 'killed', 'a new wallet celebrates', MO, UNIT, [('    walletAdded: "success",\n', '    walletAdded: "celebrate",\n')]),
    # The builders (useWalletMotion.ts): the render files.
    ('B1', 'killed', 'the tray ignores Reduce Motion', UW, RENDER, [(TRAY_IN, "  return sprung(new SlideInDown(), 'gentle').reduceMotion(ReduceMotion.Never);\n")]),
    ('B2', 'killed', "the tray's slide lets Reanimated cut it", UW, RENDER, [("sprung(new SlideInDown(), 'gentle').reduceMotion(ReduceMotion.Never)", "sprung(new SlideInDown(), 'gentle')")]),
    ('B3', 'killed', 'the tray rides the snappy spring', UW, RENDER, [("sprung(new SlideInDown(), 'gentle')", "sprung(new SlideInDown(), 'snappy')")]),
    ('B4', 'killed', 'the tray drops in from the top', UW, RENDER, [("sprung(new SlideInDown(), 'gentle')", "sprung(new SlideInUp(), 'gentle')")]),
    ('B5', 'killed', 'the springs time out instead (no springify)', UW, RENDER, [('return builder.springify().damping(damping)', 'return builder.damping(damping)')]),
    ('B6', 'killed', 'the springs lose their mass', UW, RENDER, [('.stiffness(stiffness).mass(mass);', '.stiffness(stiffness);')]),
    ('B7', 'killed', 'damping and stiffness swapped', UW, RENDER, [('.damping(damping).stiffness(stiffness)', '.damping(stiffness).stiffness(damping)')]),
    ('B8', 'killed', 'a tray fades out at full motion too', UW, RENDER, [(TRAY_OUT, '  return FadeOut.duration(FADE_MS).reduceMotion(ReduceMotion.Never);\n')]),
    ('B9', 'killed', 'TRAY_EXIT_MS is 300', UW, RENDER, [('export const TRAY_EXIT_MS = 220;', 'export const TRAY_EXIT_MS = 300;')]),
    ('B10', 'killed', 'a tray leaves on a spring, so its end time is unknown', UW, RENDER, [('SlideOutDown.duration(TRAY_EXIT_MS).reduceMotion(ReduceMotion.Never)', "sprung(new SlideOutDown(), 'gentle').reduceMotion(ReduceMotion.Never)")]),
    ('B11', 'killed', "the tray's fade-out lets Reanimated cut it", UW, RENDER, [('FadeOut.duration(FADE_MS).reduceMotion(ReduceMotion.Never)', 'FadeOut.duration(FADE_MS)')]),
    ('B12', 'killed', 'the toast rides the gentle spring', UW, RENDER, [("sprung(new SlideInUp(), 'snappy')", "sprung(new SlideInUp(), 'gentle')")]),
    ('B13', 'killed', 'the toast still slides under Reduce Motion', UW, RENDER, [(TOAST_IN, "  return sprung(new SlideInUp(), 'snappy').reduceMotion(ReduceMotion.Never);\n")]),
    ('B14', 'killed', "a step's fade lasts 200 ms", UW, RENDER, [(STEP_IN, '  return FadeIn.duration(200).reduceMotion(ReduceMotion.Never);\n')]),
    ('B15', 'killed', "a step's fade lets Reanimated cut it", UW, RENDER, [(STEP_IN, '  return FadeIn.duration(FADE_MS);\n')]),
    ('B16', 'killed', "a step's height morphs under Reduce Motion too", UW, RENDER, [(STEP_LAYOUT, "  return sprung(new LinearTransition(), 'gentle').reduceMotion(ReduceMotion.Never);\n")]),
    ('B17', 'killed', "a step's height never morphs", UW, RENDER, [(STEP_LAYOUT, '  return undefined;\n')]),
    ('B18', 'killed', 'a new wallet rides the gentle spring', UW, RENDER, [("sprung(new SlideInUp(), 'bouncy')", "sprung(new SlideInUp(), 'gentle')")]),
    ('B19', 'killed', 'a new wallet still slides under Reduce Motion', UW, RENDER, [(ADDED_IN, "  return sprung(new SlideInUp(), 'bouncy').reduceMotion(ReduceMotion.Never);\n")]),
    ('B20', 'killed', 'every fade lasts 200 ms', UW, RENDER, [('const FADE_MS = 150;', 'const FADE_MS = 200;')]),
    ('B21', 'killed', 'one tray animation shared by every call', UW, RENDER, [
        (TRAY_IN_DOC, "const SHARED_FADE = FadeIn.duration(FADE_MS).reduceMotion(ReduceMotion.Never);\nconst SHARED_SLIDE = sprung(new SlideInDown(), 'gentle').reduceMotion(ReduceMotion.Never);\n" + TRAY_IN_DOC),
        (TRAY_IN, '  return reduced ? SHARED_FADE : SHARED_SLIDE;\n'),
    ]),
    ('B22', 'killed', 'one step fade shared by every call', UW, RENDER, [
        (STEP_IN_DOC, 'const SHARED_STEP = FadeIn.duration(FADE_MS).reduceMotion(ReduceMotion.Never);\n' + STEP_IN_DOC),
        (STEP_IN, '  return SHARED_STEP;\n'),
    ]),
    # The grow bar (GrowBar.tsx): the render files.
    ('G1', 'killed', "the bar grows while the answer is pending (the plan's mutant)", GB, RENDER, [
        ("import { useWalletReducedMotion } from './reducedMotion';", "import { useReducedMotionKnown, useWalletReducedMotion } from './reducedMotion';"),
        (ASK, '  const known = useReducedMotionKnown();\n  const reduced = useWalletReducedMotion() && known;\n'),
    ]),
    ('G2', 'killed', 'the bar decides at every render, not at mount', GB, RENDER, [(DECIDE, "  const plan = motionFor('budgetBar', reduced).motion;\n")]),
    ('G3', 'killed', 'the bar never grows', GB, RENDER, [("motionFor('budgetBar', reduced)", "motionFor('budgetBar', true)")]),
    ('G4', 'killed', 'the bar always grows', GB, RENDER, [("motionFor('budgetBar', reduced)", "motionFor('budgetBar', false)")]),
    ('G5', 'killed', 'no clamp above 1', GB, RENDER, [(CLAMP, '  return fraction > 0 ? fraction * 100 : 0;\n')]),
    ('G6', 'killed', 'no clamp below 0', GB, RENDER, [(CLAMP, '  return Math.min(fraction, 1) * 100;\n')]),
    ('G7', 'killed', 'NaN passes the clamp', GB, RENDER, [(CLAMP, '  return Math.max(0, Math.min(fraction, 1)) * 100;\n')]),
    ('G8', 'killed', 'screen readers read the bar', GB, RENDER, [('<View testID="grow-bar" aria-hidden style=', '<View testID="grow-bar" style=')]),
    ('G9', 'killed', 'the bar is 4 pt high by default', GB, RENDER, [('height = 6 }', 'height = 4 }')]),
    ('G10', 'killed', 'the radius is 3 whatever the height', GB, RENDER, [('  const radius = height / 2;\n', '  const radius = 3;\n')]),
    ('G11', 'killed', "the still fill in the track's colour", GB, RENDER, [('backgroundColor: color }} />', 'backgroundColor: track }} />')]),
    ('G12', 'killed', 'the growing fill runs to the end of the track', GB, RENDER, [('withTiming(percent, ', 'withTiming(100, ')]),
    ('G13', 'killed', 'the growing fill stays at its first value', GB, RENDER, [('}, [grown, percent, durationMs]);', '}, [grown, durationMs]);')]),
    ('G14', 'killed', 'the growing fill starts at its value', GB, RENDER, [('useSharedValue(0)', 'useSharedValue(percent)')]),
    ('G15', 'killed', 'the growth is instant', GB, RENDER, [('duration: durationMs, ', 'duration: 0, ')]),
    ('G16', 'killed', 'the growth takes a second', GB, RENDER, [('duration: durationMs, ', 'duration: 1000, ')]),
    ('G17', 'killed', "the style's dependency array names grown.value (R72)", GB, RENDER, [('}), [grown]);', '}), [grown.value]);')]),
    ('G18', 'killed', "the growth lets Reanimated's own setting cut it (W6)", GB, RENDER, [('{ duration: durationMs, reduceMotion: ReduceMotion.Never }', '{ duration: durationMs }')]),
    ('G19', 'killed', 'the growing fill loses its rounded end', GB, RENDER, [("style={[{ height: '100%', borderRadius: radius, backgroundColor: color }, growth]}", "style={[{ height: '100%', backgroundColor: color }, growth]}")]),
    ('G20', 'killed', 'the growing fill has no colour', GB, RENDER, [('backgroundColor: color }, growth]}', "backgroundColor: 'transparent' }, growth]}")]),
    ('G21', 'killed', 'the bar asks the phone itself, full motion until it answers (R66)', GB, RENDER, [
        ("import { useWalletReducedMotion } from './reducedMotion';", "import { useReducedMotion } from '@mobile/hooks/useReducedMotion';"),
        (ASK, '  const reduced = useReducedMotion();\n'),
    ]),
    # Equivalent: each changes no drawn bar.
    ('E1', 'survived', 'the clamp lets 0 through as 0 (equivalent: 0 draws 0% either way)', GB, RENDER, [(CLAMP, '  return fraction >= 0 ? Math.min(fraction, 1) * 100 : 0;\n')]),
    ('E2', 'survived', 'the growth effect forgets durationMs (equivalent: it comes from the plan read once at mount, so it never changes)', GB, RENDER, [('}, [grown, percent, durationMs]);', '}, [grown, percent]);')]),
    ('E3', 'survived', 'the plan read eagerly at every render (equivalent: React keeps the first state)', GB, RENDER, [(DECIDE, "  const [plan] = useState(motionFor('budgetBar', reduced).motion);\n")]),
    # The harness (P2-T8's X2): the render files.
    ('H1', 'killed', 'the harness gives the answer to the first ask only (P2-T8 review X2)', HA, RENDER, [(
        "vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(answer);",
        "vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValueOnce(answer);",
    )]),
]

VITEST_TOTAL = re.compile(r'^\s*Tests  (.+?)\s*$', re.M)
VITEST_FAILED = re.compile(r'^\s*×\s+\S+\s+>\s+(.+?)\s+\d+ms\s*$', re.M)
NODE_COUNT = re.compile(r'^ℹ (tests|pass|fail) (\d+)', re.M)
NODE_FAILED = re.compile(r'^✖ (.+?) \(\d', re.M)


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def summarise(suite, output):
    if suite is UNIT:
        counts = dict((name, value) for name, value in NODE_COUNT.findall(output))
        summary = f"node: tests {counts.get('tests', '?')}, pass {counts.get('pass', '?')}, fail {counts.get('fail', '?')}"
        failed = [name for name in NODE_FAILED.findall(output) if name != 'failing tests:']
    else:
        found = VITEST_TOTAL.findall(output)
        summary = 'vitest: Tests ' + (found[-1] if found else 'no summary')
        failed = VITEST_FAILED.findall(output)
    return summary, failed


def main():
    root, logs = sys.argv[1], sys.argv[2]
    os.makedirs(logs, exist_ok=True)
    app = os.path.join(root, 'apps/app')
    wanted = set(sys.argv[3:])
    unexpected = killed = survived = 0
    for ident, expect, description, rel, suite, edits in MUTANTS:
        if wanted and ident not in wanted:
            continue
        path = os.path.join(root, rel)
        with open(path, 'rb') as handle:
            original = handle.read()
        before = hashlib.sha256(original).hexdigest()
        text = original.decode('utf-8')
        for old, new in edits:
            count = text.count(old)
            if count != 1:
                print(f'{ident} SETUP ERROR: {count} matches for {old!r} in {rel}')
                sys.exit(2)
            text = text.replace(old, new)
        try:
            with open(path, 'wb') as handle:
                handle.write(text.encode('utf-8'))
            run = subprocess.run(suite, cwd=app, capture_output=True, text=True, timeout=600)
            output = run.stdout + run.stderr
        finally:
            with open(path, 'wb') as handle:
                handle.write(original)
        after = sha(path)
        with open(os.path.join(logs, f'{ident}.log'), 'w', encoding='utf-8') as handle:
            handle.write(output)
        summary, failed = summarise(suite, output)
        outcome = 'killed' if run.returncode != 0 else 'survived'
        if outcome == 'killed':
            killed += 1
        else:
            survived += 1
        mark = 'KILLED' if outcome == 'killed' else 'SURVIVED' + (' (equivalent)' if expect == 'survived' else '')
        first = f'; first failing: "{failed[0]}"' if failed else ''
        restored = 'restored sha256 equal' if after == before else f'RESTORE MISMATCH {after}'
        print(f'{ident} {mark}: {description} [{os.path.basename(rel)}] -> {summary}{first}; {restored}', flush=True)
        if outcome != expect or after != before:
            unexpected += 1
    print(f'{killed} killed, {survived} survived, {unexpected} not as expected')
    sys.exit(1 if unexpected else 0)


if __name__ == '__main__':
    main()

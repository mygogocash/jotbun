#!/usr/bin/env python3
"""P2-T13 mutation check. Usage: python3 -I mutants.py <worktree root> <log dir> [ids...]

Applies each mutant alone to the worktree, runs its tests (the Node test for
trayGesture.ts and the source checks; Tray.render.test.tsx for the tray, the
buttons, the cover and the catalogue; useWalletMotion.render.test.tsx for
P2-T9's builders), restores the file byte for byte (sha256 checked) and prints
one line per mutant. Exits 0 only when every mutant ends as expected.
"""
import hashlib
import os
import re
import subprocess
import sys

GESTURE = 'apps/app/src/wallet/tray/trayGesture.ts'
TRAY = 'apps/app/src/wallet/tray/Tray.tsx'
BUTTON = 'apps/app/src/wallet/tray/PrimaryButton.tsx'
LINK = 'apps/app/src/wallet/tray/TextLink.tsx'
COVER = 'apps/app/src/ui/lockCover.tsx'
SECTIONS = 'apps/app/src/dev/catalogue/wallet/traySections.tsx'
INDEX = 'apps/app/src/dev/catalogue/wallet/index.ts'
BUILDERS = 'apps/app/src/wallet/motion/useWalletMotion.ts'

NODE = ['npm', 'run', 'test:unit', '--', 'src/wallet/tray/trayGesture.test.ts']
RENDER = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', 'src/wallet/tray/Tray.render.test.tsx']
MOTION = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', 'src/wallet/motion/useWalletMotion.render.test.tsx']

SPRING_BACK = '      drag.value = reduced ? 0 : withSpring(0, { ...motion.spring.gentle, reduceMotion: ReduceMotion.Never });\n'
TICK_GUARD = '    if (shownStep.current === step) return;\n'
EXIT_HIDE = "      if (Platform.OS !== 'ios') closed.current?.();\n"
FOOTER = "                    {footer ? <View testID=\"tray-footer\" style={{ gap: 4 }}>{footer}</View> : null}\n"
SCROLL_END = '                    </ScrollView>\n'
TRAY_EXIT = ("    : SlideOutDown.duration(TRAY_EXIT_MS).reduceMotion(ReduceMotion.Never);\n}\n\n/** The saved toast",
             "    : SHARED;\n}\nconst SHARED = SlideOutDown.duration(TRAY_EXIT_MS).reduceMotion(ReduceMotion.Never);\n\n/** The saved toast")

# (id, expectation, description, file, tests, [(old, new), ...]); each old must occur exactly once.
MUTANTS = [
    # trayGesture.ts: the Node test (G9 and G10 are drawn, so the render file)
    ('G1', 'killed', 'a pull of exactly 120 pt closes', GESTURE, NODE, [('translationY > 120', 'translationY >= 120')]),
    ('G2', 'killed', 'a flick from exactly 60 pt closes', GESTURE, NODE, [('translationY > 60', 'translationY >= 60')]),
    ('G3', 'killed', 'a flick at exactly 900 pt a second closes', GESTURE, NODE, [('velocityY > 900', 'velocityY >= 900')]),
    ('G4', 'killed', 'a slow pull past 60 pt closes (or, not and)', GESTURE, NODE, [('(translationY > 60 && velocityY > 900)', '(translationY > 60 || velocityY > 900)')]),
    ('G5', 'killed', 'the pull line at 150 pt', GESTURE, NODE, [('translationY > 120', 'translationY > 150')]),
    ('G6', 'killed', 'the flick needs 1200 pt a second', GESTURE, NODE, [('velocityY > 900', 'velocityY > 1200')]),
    ('G7', 'killed', 'a flick closes from any distance', GESTURE, NODE, [('(translationY > 60 && velocityY > 900)', '(velocityY > 900)')]),
    ('G8', 'killed', 'a pull up closes', GESTURE, NODE, [('return translationY > 120', 'return Math.abs(translationY) > 120')]),
    ('G9', 'killed', 'the tray floats 12 pt in', GESTURE, RENDER, [('export const TRAY_INSET = 8;', 'export const TRAY_INSET = 12;')]),
    ('G10', 'killed', 'radius 24', GESTURE, RENDER, [('export const TRAY_RADIUS = 34;', 'export const TRAY_RADIUS = 24;')]),
    # Tray.tsx, what the web drops: the Node source checks
    ('N1', 'killed', 'the swipe on the UI thread', TRAY, NODE, [('    runOnJS: true,\n', '    runOnJS: false,\n')]),
    ('N2', 'killed', "the screen reader's escape skips the lock", TRAY, NODE, [('onAccessibilityEscape={requestClose}', 'onAccessibilityEscape={onClose}')]),
    ('N3', 'killed', 'the card is not modal for VoiceOver', TRAY, NODE, [('                    accessibilityViewIsModal\n', '')]),
    ('N4', 'killed', 'an opaque Modal', TRAY, NODE, [('      transparent\n', '')]),
    ('N5', 'killed', 'the Modal stops under the status bar', TRAY, NODE, [('      statusBarTranslucent\n', '')]),
    ('N6', 'killed', 'the keyboard lifts the card by height on iOS', TRAY, NODE, [("behavior={Platform.OS === 'ios' ? 'padding' : undefined}", "behavior={Platform.OS === 'ios' ? 'height' : undefined}")]),
    ('N7', 'killed', 'covered, the card still plays its exit (R63)', TRAY, NODE, [('<LayoutAnimationConfig skipExiting>', '<LayoutAnimationConfig>')]),
    # Tray.tsx: the render file
    ('R1', 'killed', "the backdrop closes a locked tray (the plan's mutant)", TRAY, RENDER, [('                onPress={requestClose}\n', '                onPress={onClose}\n')]),
    ('R2', 'killed', "the Modal hides at once on close (the plan's mutant)", TRAY, RENDER, [('      visible={shown}\n', '      visible={visible}\n')]),
    ('R3', 'killed', "the lock cover ignored (the plan's mutant)", TRAY, RENDER, [('  const { hidden } = useLockCover();\n', '  const hidden = false;\n')]),
    ('R4', 'killed', 'a locked tray still closes', TRAY, RENDER, [('  const closable = visible && !locked;\n', '  const closable = visible;\n')]),
    ('R5', 'killed', 'a leaving tray asks to close again', TRAY, RENDER, [('  const closable = visible && !locked;\n', '  const closable = !locked;\n')]),
    ('R6', 'killed', 'close is not disabled while locked', TRAY, RENDER, [('onPress={requestClose} disabled={locked} />', 'onPress={requestClose} />')]),
    ('R7', 'killed', 'a locked swipe stays pulled down', TRAY, RENDER, [('      if (closable && shouldDismiss(', '      if (shouldDismiss(')]),
    ('R8', 'killed', 'the swipe never closes', TRAY, RENDER, [('shouldDismiss(event.translationY, event.velocityY)) {', 'shouldDismiss(event.translationY, event.velocityY) && false) {')]),
    ('R9', 'killed', 'the card follows the finger up too', TRAY, RENDER, [('      drag.value = Math.max(0, event.translationY);\n', '      drag.value = event.translationY;\n')]),
    ('R10', 'killed', 'short of the line the card stays where it was let go', TRAY, RENDER, [(SPRING_BACK, '')]),
    ('R11', 'killed', 'the spring back ignores Reduce Motion', TRAY, RENDER, [('drag.value = reduced ? 0 : withSpring(', 'drag.value = withSpring(')]),
    ('R12', 'killed', "Reanimated's own setting cuts the spring back (W6)", TRAY, RENDER, [('{ ...motion.spring.gentle, reduceMotion: ReduceMotion.Never }', '{ ...motion.spring.gentle }')]),
    ('R13', 'killed', 'a reopened tray keeps the last pull', TRAY, RENDER, [('    if (visible) drag.value = 0;\n', '')]),
    ('R14', 'killed', 'no tick on a step change', TRAY, RENDER, [('    if (haptic) playHaptic(haptic);\n', '')]),
    ('R15', 'killed', 'opening ticks too', TRAY, RENDER, [(TICK_GUARD, '    if (shownStep.current === step && !visible) return;\n')]),
    ('R16', 'killed', 'a closed tray ticks', TRAY, RENDER, [('    if (!visible) return;\n    const { haptic }', '    const { haptic }')]),
    ('R17', 'killed', 'a step plays impact', TRAY, RENDER, [('    if (haptic) playHaptic(haptic);\n', "    if (haptic) playHaptic('aiAccepted');\n")]),
    ('R18', 'killed', 'the height morphs under Reduce Motion', TRAY, RENDER, [('layout={stepLayout(reduced)}', 'layout={stepLayout(false)}')]),
    ('R19', 'killed', 'the height never morphs', TRAY, RENDER, [('layout={stepLayout(reduced)}', 'layout={stepLayout(true)}')]),
    ('R20', 'killed', 'the tray springs up under Reduce Motion', TRAY, RENDER, [('entering={trayEntering(reduced)}', 'entering={trayEntering(false)}')]),
    ('R21', 'killed', 'the card slides out under Reduce Motion', TRAY, RENDER, [('exiting={trayExiting(reduced)}', 'exiting={trayExiting(false)}')]),
    ('R22', 'killed', "the Modal waits for the slide's time under Reduce Motion", TRAY, RENDER, [('  const exitMs = trayExiting(reduced).getDuration();\n', '  const exitMs = trayExiting(false).getDuration();\n')]),
    ('R23', 'killed', 'the Modal hides after a fixed 220 ms', TRAY, RENDER, [('  const exitMs = trayExiting(reduced).getDuration();\n', '  const exitMs = 220;\n')]),
    ('R24', 'killed', 'onClosed never fires on the web', TRAY, RENDER, [(EXIT_HIDE, '')]),
    ('R25', 'killed', 'on iOS onClosed fires before the Modal has gone', TRAY, RENDER, [(EXIT_HIDE, '      closed.current?.();\n')]),
    ('R26', 'killed', 'on iOS onClosed never fires', TRAY, RENDER, [("onDismiss={Platform.OS === 'ios' ? () => closed.current?.() : undefined}", 'onDismiss={undefined}')]),
    ('R27', 'killed', 'the web focuses the title, not the dialog', TRAY, RENDER, [('moveAccessibilityFocus(web ? layer.current : titleRef.current)', 'moveAccessibilityFocus(titleRef.current)')]),
    ('R28', 'killed', 'a phone focuses the dialog, not the title', TRAY, RENDER, [('moveAccessibilityFocus(web ? layer.current : titleRef.current)', 'moveAccessibilityFocus(layer.current)')]),
    ('R29', 'killed', 'nothing moves focus when it opens', TRAY, RENDER, [('      onShow={focusTitle}\n', '')]),
    ('R30', 'killed', 'the dialog has no name on the web', TRAY, RENDER, [("{ 'aria-label': hidden ? undefined : title, tabIndex: -1 as const }", '{ tabIndex: -1 as const }')]),
    ('R31', 'killed', 'covered, the dialog still says the title', TRAY, RENDER, [("'aria-label': hidden ? undefined : title", "'aria-label': title")]),
    ('R32', 'killed', 'two dialogs on the web', TRAY, RENDER, [("const cardDialog = web ? null : { role: 'dialog'", "const cardDialog = { role: 'dialog'")]),
    ('R33', 'killed', 'the dialog cannot take focus on the web', TRAY, RENDER, [("{ 'aria-label': hidden ? undefined : title, tabIndex: -1 as const }", "{ 'aria-label': hidden ? undefined : title }")]),
    ('R34', 'killed', 'the backdrop is a tab stop', TRAY, RENDER, [('                tabIndex={-1}\n', '')]),
    ('R35', 'killed', 'screen readers meet the backdrop', TRAY, RENDER, [('                {...DECORATIVE}\n', '')]),
    ('R36', 'killed', "the night's backdrop is the day's", TRAY, RENDER, [('colors.isDark ? BACKDROP.dark : BACKDROP.light', 'BACKDROP.light')]),
    ('R37', 'killed', 'the card on the card colour, not the tray colour', TRAY, RENDER, [('                      backgroundColor: colors.sheet,\n', '                      backgroundColor: colors.card,\n')]),
    ('R38', 'killed', 'the card sits on the home indicator', TRAY, RENDER, [('marginBottom: TRAY_INSET + insets.bottom,', 'marginBottom: TRAY_INSET,')]),
    ('R39', 'killed', 'at AX5 the card is as tall as its content', TRAY, RENDER, [('                      flexGrow: large ? 1 : 0,\n', '                      flexGrow: 0,\n')]),
    ('R40', 'killed', 'at AX5 the frame does not fill the screen', TRAY, RENDER, [('style={[{ flexGrow: large ? 1 : 0, flexShrink: 1, paddingTop: insets.top }, follow]}', 'style={[{ flexGrow: 0, flexShrink: 1, paddingTop: insets.top }, follow]}')]),
    ('R41', 'killed', 'the tray runs under the status bar', TRAY, RENDER, [('paddingTop: insets.top }, follow]}', 'paddingTop: 0 }, follow]}')]),
    ('R42', 'killed', 'the title is no heading on the web', TRAY, RENDER, [("accessibilityRole={web ? 'header' : undefined}", 'accessibilityRole={undefined}')]),
    ('R43', 'killed', 'with a header, screen readers never meet the title', TRAY, RENDER, [('{header ? <View ref={titleRef} {...titleHeader} style={UNSEEN} /> : null}', '{null}')]),
    ('R44', 'killed', 'with a header, the title is drawn too', TRAY, RENDER, [('<View style={{ flex: 1 }}>{header}</View>', '<View style={{ flex: 1 }}><WalletText>{title}</WalletText>{header}</View>')]),
    ('R45', 'killed', "the title's unseen place takes room", TRAY, RENDER, [('width: 1, height: 1, overflow', 'width: 120, height: 24, overflow')]),
    ('R46', 'killed', 'no back button', TRAY, RENDER, [("{onBack ? <HeaderButton label={t('common.back')} glyph=\"chevron-left\" onPress={onBack} /> : null}", '{null}')]),
    ('R47', 'killed', '36 pt header buttons', TRAY, RENDER, [('const BUTTON = 44;', 'const BUTTON = 36;')]),
    ('R48', 'killed', 'header buttons on the card colour', TRAY, RENDER, [('        backgroundColor: colors.raised,\n', '        backgroundColor: colors.card,\n')]),
    ('R49', 'killed', 'a disabled close is not dimmed', TRAY, RENDER, [('        opacity: disabled ? 0.4 : 1,\n', '        opacity: 1,\n')]),
    ('R50', 'killed', 'the footer scrolls with the content', TRAY, RENDER, [(SCROLL_END + FOOTER, FOOTER + SCROLL_END)]),
    ('R51', 'killed', "a new step's words do not fade in (no key)", TRAY, RENDER, [('<Animated.View key={step} entering={stepEntering()}', '<Animated.View entering={stepEntering()}')]),
    ('R52', 'killed', 'the first step fades in again over the tray', TRAY, RENDER, [('<LayoutAnimationConfig skipEntering>', '<LayoutAnimationConfig>')]),
    ('R53', 'killed', 'a tray mounted closed never opens', TRAY, RENDER, [('  if (visible && !shown) setShown(true);\n', '')]),
    ('R54', 'killed', 'reopened while it leaves, it still hides', TRAY, RENDER, [('    return () => clearTimeout(timer);\n', '')]),
    ('R55', 'killed', 'the cover drawn over the card, which stays', TRAY, RENDER, [('        ) : (\n          // Covered,', '        ) : null}\n        {(\n          // Covered,')]),
    ('R56', 'killed', "the night's tray has the day's shadow", TRAY, RENDER, [('boxShadow: colors.isDark ? EDGE.dark : EDGE.light,', 'boxShadow: EDGE.light,')]),
    # PrimaryButton.tsx
    ('P1', 'killed', 'a 48 pt main button', BUTTON, RENDER, [('const HEIGHT = 54;', 'const HEIGHT = 48;')]),
    ('P2', 'killed', 'radius 18', BUTTON, RENDER, [('const RADIUS = 16;', 'const RADIUS = 18;')]),
    ('P3', 'killed', 'busy, it still presses', BUTTON, RENDER, [('      disabled={disabled || busy}\n', '      disabled={disabled}\n')]),
    ('P4', 'killed', 'busy, it keeps its label', BUTTON, RENDER, [('  const words = busy && busyLabel ? busyLabel : label;\n', '  const words = label;\n')]),
    ('P5', 'killed', 'busy, it is not marked busy', BUTTON, RENDER, [('      accessibilityState={{ disabled, busy }}\n', '      accessibilityState={{ disabled }}\n'), ('      aria-busy={busy}\n', '')]),
    ('P6', 'killed', 'disabled, it is not dimmed', BUTTON, RENDER, [('opacity: disabled ? 0.4 : pressed ? 0.85 : 1,', 'opacity: pressed ? 0.85 : 1,')]),
    ('P7', 'killed', 'disabled, it still presses', BUTTON, RENDER, [('      disabled={disabled || busy}\n', '      disabled={busy}\n')]),
    ('P8', 'killed', 'the main button in violet', BUTTON, RENDER, [('        backgroundColor: colors.primary,\n', '        backgroundColor: colors.violet,\n')]),
    ('P9', 'killed', 'ink words on the main button', BUTTON, RENDER, [('tone="onPrimary"', 'tone="ink"')]),
    ('P10', 'survived', "disabled without its own accessibility props (equivalent: React Native's and react-native-web's Pressable mark a disabled press target themselves)", BUTTON, RENDER, [('      accessibilityState={{ disabled, busy }}\n', '      accessibilityState={{ busy }}\n'), ('      aria-disabled={disabled}\n', '')]),
    # TextLink.tsx
    ('L1', 'killed', 'a 36 pt link', LINK, RENDER, [('const TOUCH = 44;', 'const TOUCH = 36;')]),
    ('L2', 'killed', 'ink by default', LINK, RENDER, [("tone = 'violet'", "tone = 'ink'")]),
    ('L3', 'killed', 'the tone ignored', LINK, RENDER, [('tone={tone}', 'tone="violet"')]),
    ('L4', 'killed', 'a filled link', LINK, RENDER, [('        opacity: pressed ? 0.6 : 1,\n', "        opacity: pressed ? 0.6 : 1,\n        backgroundColor: '#F4F3F9',\n")]),
    # lockCover.tsx
    ('C1', 'killed', 'the cover in the card colour', COVER, RENDER, [('backgroundColor: colors.ground', 'backgroundColor: colors.card')]),
    ('C2', 'killed', 'screen readers meet the cover', COVER, RENDER, [('      {...DECORATIVE}\n', '')]),
    ('C3', 'killed', 'the context is never read (nothing is ever covered)', COVER, RENDER, [('  return useContext(LockCoverContext);\n', '  return UNCOVERED;\n')]),
    ('C4', 'killed', 'the cover does not fill the screen', COVER, RENDER, [("position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, ", '')]),
    ('C5', 'killed', 'every tray starts covered', COVER, RENDER, [('createContext<LockCover>(UNCOVERED)', 'createContext<LockCover>({ hidden: true })')]),
    # The catalogue
    ('K1', 'killed', 'the tray sections not in the wallet list', INDEX, RENDER, [('  ...WALLET_TRAY_SECTIONS,\n', '')]),
    ('K2', 'killed', "the tray sections before the kit's", INDEX, RENDER, [('  ...WALLET_KIT_SECTIONS,\n  ...WALLET_TRAY_SECTIONS,\n', '  ...WALLET_TRAY_SECTIONS,\n  ...WALLET_KIT_SECTIONS,\n')]),
    ('K3', 'killed', 'a tray section opens closed', SECTIONS, RENDER, [('const [open, setOpen] = useState(true);', 'const [open, setOpen] = useState(false);')]),
    # useWalletMotion.ts (P2-T9's code): the extended own-animation case (P2-T9's review m-2, R5 to R8)
    ('M1', 'killed', 'one trayExiting animation shared by every call', BUILDERS, MOTION, [TRAY_EXIT]),
    ('M2', 'killed', 'one toastEntering animation shared by every call', BUILDERS, MOTION, [
        ("    : sprung(new SlideInUp(), 'snappy').reduceMotion(ReduceMotion.Never);\n", '    : SHARED_TOAST;\n'),
        ('/** A tray step\'s new content', "const SHARED_TOAST = sprung(new SlideInUp(), 'snappy').reduceMotion(ReduceMotion.Never);\n\n/** A tray step's new content")]),
    ('M3', 'killed', 'one walletAddedEntering animation shared by every call', BUILDERS, MOTION, [
        ("    : sprung(new SlideInUp(), 'bouncy').reduceMotion(ReduceMotion.Never);\n", '    : SHARED_CARD;\n'),
        ('/** A new wallet\'s card', "const SHARED_CARD = sprung(new SlideInUp(), 'bouncy').reduceMotion(ReduceMotion.Never);\n\n/** A new wallet's card")]),
    ('M4', 'killed', 'one stepLayout animation shared by every call', BUILDERS, MOTION, [
        ("  return reduced ? undefined : sprung(new LinearTransition(), 'gentle').reduceMotion(ReduceMotion.Never);\n", '  return reduced ? undefined : SHARED_LAYOUT;\n'),
        ('/** A new wallet\'s card', "const SHARED_LAYOUT = sprung(new LinearTransition(), 'gentle').reduceMotion(ReduceMotion.Never);\n\n/** A new wallet's card")]),
]

# vitest's totals line ("      Tests  1 failed | 15 passed (16)"); Node's "ℹ fail N" lines.
SUMMARY = re.compile(r'^\s*Tests  (.+?)\s*$', re.M)
FAILED = re.compile(r'^\s*×\s+\S+\s+>\s+(.+?)\s+\d+ms\s*$', re.M)
NODE_FAIL = re.compile(r'^ℹ (tests|pass|fail) (\d+)', re.M)
NODE_FAILED = re.compile(r'^✖ (.+?) \([\d.]+ms\)$', re.M)


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def main():
    root, logs = sys.argv[1], sys.argv[2]
    os.makedirs(logs, exist_ok=True)
    app = os.path.join(root, 'apps/app')
    wanted = set(sys.argv[3:])
    unexpected = 0
    killed = survived = 0
    for ident, expect, description, rel, command, edits in MUTANTS:
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
                print(f'{ident} SETUP ERROR: {count} matches for {old!r} in {rel}', flush=True)
                sys.exit(2)
            text = text.replace(old, new)
        try:
            with open(path, 'wb') as handle:
                handle.write(text.encode('utf-8'))
            run = subprocess.run(command, cwd=app, capture_output=True, text=True, timeout=900)
            output = run.stdout + run.stderr
        finally:
            with open(path, 'wb') as handle:
                handle.write(original)
        after = sha(path)
        with open(os.path.join(logs, f'{ident}.log'), 'w', encoding='utf-8') as handle:
            handle.write(output)
        if command is NODE:
            totals = dict(NODE_FAIL.findall(output))
            summary = f"{totals.get('fail', '?')} failed | {totals.get('pass', '?')} passed ({totals.get('tests', '?')})"
            failed = NODE_FAILED.findall(output)
        else:
            found = SUMMARY.findall(output)
            summary = found[-1] if found else 'no summary'
            failed = FAILED.findall(output)
        assertions = output.count('AssertionError')
        outcome = 'killed' if run.returncode != 0 else 'survived'
        if outcome == 'killed':
            killed += 1
        else:
            survived += 1
        mark = 'KILLED' if outcome == 'killed' else 'SURVIVED' + (' (equivalent)' if expect == 'survived' else '')
        first = f'; first failing: "{failed[0].strip()}"' if failed else ''
        restored = 'restored sha256 equal' if after == before else f'RESTORE MISMATCH {after}'
        print(f'{ident} {mark}: {description} [{os.path.basename(rel)}] -> Tests {summary}{first}; AssertionError x{assertions}; {restored}', flush=True)
        if outcome != expect or after != before:
            unexpected += 1
    print(f'{killed} killed, {survived} survived, {unexpected} not as expected')
    sys.exit(1 if unexpected else 0)


if __name__ == '__main__':
    main()

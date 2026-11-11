#!/usr/bin/env python3
"""P2-T12 fix round mutation check. Usage: python3 -I mutants.py <worktree root> <log dir> [ids...]

Applies each mutant alone to the worktree, runs its tests (CardStack.render.test.tsx
for the stack, the frames, the sections and WalletCard.tsx's lines; the Node source
checks cardStackNative.test.ts and cardNativeProps.test.ts for the native-only
props), restores the file byte for byte (sha256 checked) and prints one line per
mutant. Exits 0 only when every mutant ends as expected. The first 59 are the
first round's, re-aimed where cardFrames.tsx's lines moved; the last 14 are this
round's (the review's M1, m3, m4, n2, n3 and n4).
"""
import hashlib
import os
import re
import subprocess
import sys

STACK = 'apps/app/src/wallet/card/CardStack.tsx'
FRAMES = 'apps/app/src/wallet/card/cardFrames.tsx'
SECTIONS = 'apps/app/src/dev/catalogue/wallet/stackSections.tsx'
INDEX = 'apps/app/src/dev/catalogue/wallet/index.ts'
CARD = 'apps/app/src/wallet/card/WalletCard.tsx'

NODE = ['npm', 'run', 'test:unit', '--', 'src/wallet/card/cardStackNative.test.ts']
NODE_CARD = ['npm', 'run', 'test:unit', '--', 'src/wallet/card/cardNativeProps.test.ts']
RENDER = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', 'src/wallet/card/CardStack.render.test.tsx']
# RENDER_T: a test-name pattern for the render runs (prove.sh red-pins leaves out the two cases that are RED on 90b5079's code).
if os.environ.get('RENDER_T'):
    RENDER = RENDER + ['-t', os.environ['RENDER_T']]

LIFT = '      lift.value = withSequence(withSpring(-CARD_LIFT, spring), withSpring(0, spring));\n'
OPEN_AT_ONCE = LIFT + '    }\n    onOpen(wallet.id);\n'
PLACE = ("  const place: ViewStyle = index === last\n"
         "    ? { marginTop: STACK_PEEK * index }\n"
         "    : { position: 'absolute', top: STACK_PEEK * index, left: 0, right: 0 };\n")
LIST_CARD = '          <StackCard key={wallet.id} wallet={wallet} front={index === 0} variant="spine" frame={null} onOpen={onOpen} />\n'
STACK_CARD = '        <StackCard key={wallet.id} wallet={wallet} front={index === last} variant="stack" frame={stackFrame(index, last, isDark)} onOpen={onOpen} />\n'
FORGET = '      if (views.get(walletId) === view) views.delete(walletId);\n'
REGISTER = '      views.set(walletId, view);\n      measureView(walletId, view);\n'
MEASURE_ALL = '      for (const [walletId, view] of views) measureView(walletId, view);\n'
PRESSABLE = '<Pressable accessibilityRole="button" accessibilityLabel={words.spoken} onPress={onPress} onAccessibilityTap={onPress} style={style}>'

# (id, expectation, description, file, tests, [(old, new), ...]); each old must occur exactly once.
MUTANTS = [
    # CardStack.tsx: the plan's two
    ('CS1', 'killed', "the large-text list puts the front card last (the plan's mutant)", STACK, RENDER,
     [('{[...wallets].reverse().map((wallet, index) => (', '{wallets.map((wallet, index) => ('),
      ('front={index === 0} variant="spine"', 'front={index === last} variant="spine"')]),
    ('CS2', 'killed', "onOpen is called from the spring's end (the plan's mutant)", STACK, RENDER,
     [(OPEN_AT_ONCE, '      lift.value = withSequence(withSpring(-CARD_LIFT, spring, () => onOpen(wallet.id)), withSpring(0, spring));\n      return;\n    }\n    onOpen(wallet.id);\n')]),
    # CardStack.tsx: the stack's shape
    ('CS3', 'killed', 'each card 50 pt below the one before', STACK, RENDER, [('export const STACK_PEEK = 54;', 'export const STACK_PEEK = 50;')]),
    ('CS4', 'killed', 'the front card is placed over the stack too, out of its flow', STACK, RENDER, [(PLACE, "  const place: ViewStyle = { position: 'absolute', top: STACK_PEEK * index, left: 0, right: 0 };\n")]),
    ('CS5', 'killed', 'the cards behind are in the flow, each pushed down', STACK, RENDER, [(PLACE, '  const place: ViewStyle = { marginTop: STACK_PEEK * index };\n')]),
    ('CS6', 'killed', "the front card sits at the stack's top", STACK, RENDER, [('    ? { marginTop: STACK_PEEK * index }\n', '    ? { marginTop: 0 }\n')]),
    ('CS7', 'killed', 'the cards behind span only their content, not the stack', STACK, RENDER, [("top: STACK_PEEK * index, left: 0, right: 0 }", "top: STACK_PEEK * index }")]),
    ('CS8', 'killed', 'the stack draws its cards front card first', STACK, RENDER, [('      {wallets.map((wallet, index) => (\n', '      {[...wallets].reverse().map((wallet, index) => (\n')]),
    # CardStack.tsx: the press
    ('CS9', 'killed', 'no tick', STACK, RENDER, [('    if (plan.haptic !== null) playHaptic(plan.haptic);\n', '')]),
    ('CS10', 'killed', "the tick goes straight to the engine, past the person's setting", STACK, RENDER,
     [("import { playHaptic } from '@mobile/lib/hapticMoment';\n", "import { playHaptic } from '@mobile/lib/hapticMoment';\nimport { haptics } from '@mobile/lib/haptics';\n"),
      ('    if (plan.haptic !== null) playHaptic(plan.haptic);\n', '    if (plan.haptic !== null) void haptics.selection();\n')]),
    ('CS11', 'killed', 'the tick only at full motion', STACK, RENDER, [('    if (plan.haptic !== null) playHaptic(plan.haptic);\n', '    if (plan.haptic !== null && !reduced) playHaptic(plan.haptic);\n')]),
    ('CS12', 'killed', 'the lift ignores reduced motion', STACK, RENDER, [("    const plan = motionFor('walletOpen', reduced);\n", "    const plan = motionFor('walletOpen', false);\n")]),
    ('CS13', 'killed', 'the answer is read at mount, not at the press', STACK, RENDER,
     [("import { View } from 'react-native';\n", "import { useRef } from 'react';\nimport { View } from 'react-native';\n"),
      ('  const reduced = useWalletReducedMotion();\n', '  const reduced = useRef(useWalletReducedMotion()).current;\n')]),
    ('CS14', 'killed', 'no onOpen at all', STACK, RENDER, [('    onOpen(wallet.id);\n', '')]),
    # CardStack.tsx: the lift
    ('CS15', 'killed', 'a 10 pt lift', STACK, RENDER, [('export const CARD_LIFT = 12;', 'export const CARD_LIFT = 10;')]),
    ('CS16', 'killed', 'the bouncy spring', STACK, RENDER, [('motion.spring[plan.motion.spring]', 'motion.spring.bouncy')]),
    ('CS17', 'killed', "Reanimated's own setting can cut the lift (W6)", STACK, RENDER, [('reduceMotion: ReduceMotion.Never }', 'reduceMotion: ReduceMotion.System }')]),
    ('CS18', 'killed', 'the card stays lifted', STACK, RENDER, [(LIFT, '      lift.value = withSpring(-CARD_LIFT, spring);\n')]),
    ('CS19', 'killed', 'the card drops instead of lifting', STACK, RENDER, [('withSpring(-CARD_LIFT, spring)', 'withSpring(CARD_LIFT, spring)')]),
    ('CS20', 'killed', 'an empty dependency array: the style never hears the lift (R72)', STACK, RENDER, [('translateY: lift.value }] }), [lift]);', 'translateY: lift.value }] }), []);')]),
    ('CS20b', 'killed', "no dependency array (R72; Reanimated's web build throws)", STACK, RENDER, [('translateY: lift.value }] }), [lift]);', 'translateY: lift.value }] }));')]),
    ('CS21', 'killed', 'no lift at all', STACK, RENDER, [(LIFT, '')]),
    # CardStack.tsx: today's money out
    ('CS22', 'killed', "every card shows today's money out", STACK, RENDER, [('wallet={front ? wallet : { ...wallet, todayOutMinor: null }}', 'wallet={wallet}')]),
    ('CS23', 'killed', "no card shows today's money out", STACK, RENDER, [('wallet={front ? wallet : { ...wallet, todayOutMinor: null }}', 'wallet={{ ...wallet, todayOutMinor: null }}')]),
    ('CS24', 'killed', "the first card shows today's money out, not the front one", STACK, RENDER, [('front={index === last} variant="stack"', 'front={index === 0} variant="stack"')]),
    ('CS25', 'killed', "the list's front card loses today's money out", STACK, RENDER, [('front={index === 0} variant="spine"', 'front={false} variant="spine"')]),
    # CardStack.tsx: the variants and the list
    ('CS26', 'killed', 'the list draws stack cards', STACK, RENDER, [('variant="spine" frame={null}', 'variant="stack" frame={null}')]),
    ('CS27', 'killed', 'the stack draws spine cards', STACK, RENDER, [('variant="stack" frame={stackFrame', 'variant="spine" frame={stackFrame')]),
    ('CS28', 'killed', 'the list 10 pt apart', STACK, RENDER, [('const LIST_GAP = 14;', 'const LIST_GAP = 10;')]),
    ('CS29', 'killed', 'no list at the largest text sizes', STACK, RENDER, [('  const large = useLargeText();\n', '  const large = false;\n')]),
    ('CS30', 'killed', 'the list at every text size', STACK, RENDER, [('  const large = useLargeText();\n', '  const large = true;\n')]),
    # CardStack.tsx: the shadows
    ('CS31', 'killed', 'the first card casts a shadow', STACK, RENDER, [('isDark || index === 0 ? undefined', 'isDark ? undefined')]),
    ('CS32', 'killed', 'shadows at night', STACK, RENDER, [('isDark || index === 0 ? undefined', 'index === 0 ? undefined')]),
    ('CS33', 'killed', "the front card casts the cards' behind shadow", STACK, RENDER, [('index === last ? SHADOW.front : SHADOW.back', 'SHADOW.back')]),
    ('CS34', 'killed', "the frame has no corner for its shadow", STACK, RENDER, [('borderRadius: CARD_RADIUS, boxShadow', 'boxShadow')]),
    ('CS35', 'killed', 'the list casts shadows', STACK, RENDER, [(LIST_CARD, LIST_CARD.replace('frame={null}', 'frame={{ boxShadow: SHADOW.back }}'))]),
    # CardStack.tsx: the frames
    ('CS36', 'killed', 'the stack does not measure its cards after its layout', STACK, RENDER, [('    <View testID="card-stack" onLayout={measure}>\n', '    <View testID="card-stack">\n')]),
    ('CS37', 'killed', 'the list does not measure its cards after its layout', STACK, RENDER, [('<View testID="card-stack" onLayout={measure} style={{ gap: LIST_GAP }}>', '<View testID="card-stack" style={{ gap: LIST_GAP }}>')]),
    ('CS38', 'killed', 'the cards do not register', STACK, RENDER, [('<View ref={register} collapsable={false}>', '<View collapsable={false}>')]),
    ('CS39', 'killed', 'the measured view may be flattened away on a phone', STACK, NODE, [('<View ref={register} collapsable={false}>', '<View ref={register}>')]),
    # cardFrames.tsx
    ('CF1', 'killed', 'a view is not measured when it registers', FRAMES, RENDER, [(REGISTER, '      views.set(walletId, view);\n')]),
    ('CF2', 'killed', 'x and y swapped', FRAMES, RENDER, [('frames.set(view, { x, y, width, height });', 'frames.set(view, { x: y, y: x, width, height });')]),
    ('CF3', 'killed', 'width and height swapped', FRAMES, RENDER, [('frames.set(view, { x, y, width, height });', 'frames.set(view, { x, y, width: height, height: width });')]),
    ('CF4', 'killed', 'a view that leaves is never forgotten', FRAMES, RENDER, [(FORGET, '      void walletId;\n      void view;\n')]),
    ('CF5', 'killed', "a view that leaves forgets another view's frame", FRAMES, RENDER, [(FORGET, '      views.delete(walletId);\n')]),
    ('CF6', 'killed', 'frames kept by wallet id: a measurement that lands after its view left is given out', FRAMES, RENDER,
     [('  const frames = new WeakMap<HostInstance, CardFrame>();\n', '  const frames = new WeakMap<HostInstance, CardFrame>();\n  const latest = new Map<string, CardFrame>();\n'),
      (REGISTER, '      views.set(walletId, view);\n      view.measureInWindow((x, y, width, height) => { latest.set(walletId, { x, y, width, height }); });\n'),
      (FORGET, '      if (views.get(walletId) === view) { views.delete(walletId); latest.delete(walletId); }\n'),
      ('      const view = views.get(walletId);\n      return view === undefined ? null : (frames.get(view) ?? null);\n', '      return latest.get(walletId) ?? null;\n'),
      (MEASURE_ALL, '      for (const [walletId, view] of views) view.measureInWindow((x, y, width, height) => { latest.set(walletId, { x, y, width, height }); });\n')]),
    ('CF7', 'killed', 'measure() measures nothing', FRAMES, RENDER, [(MEASURE_ALL, '')]),
    ('CF8', 'killed', 'outside a provider the stack has no frames to ask', FRAMES, RENDER, [('  return useContext(CardFramesContext) ?? NO_FRAMES;\n', '  return useContext(CardFramesContext) as Registry;\n')]),
    ('CF9', 'killed', "the ref keeps its first wallet's id", FRAMES, RENDER, [('    [registry, walletId],\n', '    [registry],\n')]),
    ('CF10', 'killed', 'the ref never forgets the view it registered', FRAMES, RENDER, [('      if (registered.current !== null) registry.forget(walletId, registered.current);\n', '')]),
    ('CF11', 'killed', 'a new registry on every render of the provider', FRAMES, RENDER, [('  const [registry] = useState(createRegistry);\n', '  const registry = createRegistry();\n')]),
    ('CF12', 'killed', 'useCardFrames never reads the provider', FRAMES, RENDER, [('  return useContext(CardFramesContext) ?? NO_FRAMES;\n', '  return NO_FRAMES;\n')]),
    # The catalogue
    ('SC1', 'killed', "the stack's sections after the tray's", INDEX, RENDER, [('  ...WALLET_STACK_SECTIONS,\n  ...WALLET_TRAY_SECTIONS,\n', '  ...WALLET_TRAY_SECTIONS,\n  ...WALLET_STACK_SECTIONS,\n')]),
    ('SC2', 'killed', "the stack's sections are not listed", INDEX, RENDER, [('  ...WALLET_STACK_SECTIONS,\n', '')]),
    ('SC3', 'killed', 'another id for the largest-text section', SECTIONS, RENDER, [("id: 'bw-stack-large',", "id: 'bw-stack-big',")]),
    ('SC4', 'killed', "a title without 'Bun Wallet: '", SECTIONS, RENDER, [("title: 'Bun Wallet: card stack',", "title: 'Card stack',")]),
    ('SC5', 'killed', 'the largest-text section draws the home stack', SECTIONS, RENDER, [('<CardStack wallets={LARGE_STACK} onOpen={noop} />', '<CardStack wallets={HOME_STACK} onOpen={noop} />')]),
    ('SC6', 'killed', "the largest-text section's front card has a short name", SECTIONS, RENDER, [("{ id: 'bw-stack-long', name: LONG_NAME,", "{ id: 'bw-stack-long', name: 'บัญชียาว',")]),
    # WalletCard.tsx (P2-T11's, mutated here only): K5's mutant from P2-T11's review
    ('RM5', 'killed', "the spine card's balance loses its minus (P2-T11's review, n2)", CARD, RENDER, [('<WalletAmount minor={words.amountMinor} sign={sign} size={17} />', '<WalletAmount minor={words.amountMinor} sign="none" size={17} />')]),
    # This round (the review): M1 and P2-T11's review's ready case, in WalletCard.tsx
    ('M1', 'killed', "VoiceOver's double tap taps the card's middle again (M1)", CARD, RENDER, [(PRESSABLE, PRESSABLE.replace(' onAccessibilityTap={onPress}', ''))]),
    ('M1n', 'killed', "VoiceOver's double tap taps the card's middle again (M1), read from the source", CARD, NODE_CARD, [(PRESSABLE, PRESSABLE.replace(' onAccessibilityTap={onPress}', ''))]),
    ('M1b', 'killed', "VoiceOver's double tap runs the press twice", CARD, RENDER, [(PRESSABLE, PRESSABLE.replace('onAccessibilityTap={onPress}', 'onAccessibilityTap={() => { onPress(); onPress(); }}'))]),
    ('RM4', 'killed', "a card with no onPress is no accessibility element on a phone (P2-T11's review, n3)", CARD, NODE_CARD, [('<View accessible accessibilityLabel={words.spoken} style={style}>', '<View accessibilityLabel={words.spoken} style={style}>')]),
    # This round: m3, m4 and n3 in CardStack.tsx
    ('L1', 'killed', 'a card behind the front one drops its pending total (m3)', STACK, RENDER, [('{ ...wallet, todayOutMinor: null }', '{ ...wallet, todayOutMinor: null, pendingMinor: null }')]),
    ('L10', 'killed', 'the front card shows today only while there is more than one card (m3)', STACK, RENDER, [('front={index === last} variant="stack"', 'front={index === last && last > 0} variant="stack"')]),
    ('MF7', 'killed', "onOpen at once and again at the spring's end (m4)", STACK, RENDER, [(LIFT, '      lift.value = withSequence(withSpring(-CARD_LIFT, spring), withSpring(0, spring, (finished) => { if (finished) onOpen(wallet.id); }));\n')]),
    ('L3', 'killed', 'the list keys its cards by place, not by wallet (n3)', STACK, RENDER, [('<StackCard key={wallet.id} wallet={wallet} front={index === 0}', '<StackCard key={index} wallet={wallet} front={index === 0}')]),
    ('L4', 'killed', "the stack groups its cards into one accessibility element on a phone (n3)", STACK, NODE, [('    <View testID="card-stack" onLayout={measure}>\n', '    <View testID="card-stack" onLayout={measure} accessible>\n')]),
    ('MF9', 'killed', 'the stack measures its cards after its first layout only (n4)', STACK, RENDER,
     [("import { View } from 'react-native';\n", "import { useRef } from 'react';\nimport { View } from 'react-native';\n"),
      ('  const { measure } = useCardFrames();\n', '  const { measure: measureAll } = useCardFrames();\n  const laidOut = useRef(false);\n  const measure = () => { if (!laidOut.current) { laidOut.current = true; measureAll(); } };\n')]),
    # This round: n4 and n2 in cardFrames.tsx
    ('MF6', 'killed', 'frameOf answers undefined, not null, before a card is measured (n4)', FRAMES, RENDER, [('      return view === undefined ? null : (frames.get(view) ?? null);\n', '      return view === undefined ? null : (frames.get(view) as CardFrame);\n')]),
    ('MF4', 'killed', 'a new ref on every render: each render measures every card again (n4)', FRAMES, RENDER, [('    [registry, walletId],\n', '    [registry, walletId, {}],\n')]),
    ('N2a', 'killed', "a view that leaves keeps its frame, so it answers it again when it comes back (n2)", FRAMES, RENDER, [('      frames.delete(view);\n', '')]),
    ('N2b', 'killed', 'an answer that lands while its view is away is kept (n2)', FRAMES, RENDER, [('      if (views.get(walletId) === view) frames.set(view, { x, y, width, height });\n', '      frames.set(view, { x, y, width, height });\n')]),
]

# vitest's totals line ("      Tests  1 failed | 11 passed (12)"); Node's "ℹ fail N" lines.
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
    # --expect=survived: every mutant run is expected to survive (the review's survivors on 90b5079 as it is).
    override = next((arg.split('=', 1)[1] for arg in sys.argv[3:] if arg.startswith('--expect=')), None)
    wanted = {arg for arg in sys.argv[3:] if not arg.startswith('--expect=')}
    unexpected = 0
    killed = survived = 0
    for ident, expect, description, rel, command, edits in MUTANTS:
        if wanted and ident not in wanted:
            continue
        expect = override or expect
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
        if command is NODE or command is NODE_CARD:
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
        mark = 'KILLED' if outcome == 'killed' else 'SURVIVED' + (' (as expected)' if expect == 'survived' else '')
        first = f'; first failing: "{failed[0].strip()}"' if failed else ''
        restored = 'restored sha256 equal' if after == before else f'RESTORE MISMATCH {after}'
        print(f'{ident} {mark}: {description} [{os.path.basename(rel)}] -> Tests {summary}{first}; AssertionError x{assertions}; {restored}', flush=True)
        if outcome != expect or after != before:
            unexpected += 1
    print(f'{killed} killed, {survived} survived, {unexpected} not as expected')
    sys.exit(1 if unexpected else 0)


if __name__ == '__main__':
    main()

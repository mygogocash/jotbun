#!/usr/bin/env python3
"""P2-T10 mutation check. Usage: python3 -I mutants.py <worktree root> <log dir> [ids...]

Applies each mutant alone to the worktree, runs its tests (the Node test for
walletMoney.ts, the two new render files for everything else), restores the
file byte for byte (sha256 checked) and prints one line per mutant. Exits 0
only when every mutant ends as expected: killed, or, for the equivalent one,
surviving with every test passing.
"""
import hashlib
import os
import re
import subprocess
import sys

MONEY = 'apps/app/src/wallet/money/walletMoney.ts'
AMOUNT = 'apps/app/src/wallet/money/WalletAmount.tsx'
BUTTON = 'apps/app/src/wallet/controls/IconButton.tsx'
MODE = 'apps/app/src/wallet/privacy/PrivateModeProvider.tsx'
EYE = 'apps/app/src/wallet/privacy/PrivateEyeButton.tsx'
TIP = 'apps/app/src/wallet/privacy/PrivateTip.tsx'
ROOT = 'apps/app/src/wallet/WalletRoot.tsx'
KIT = 'apps/app/src/dev/catalogue/wallet/kitSections.tsx'
INDEX = 'apps/app/src/dev/catalogue/wallet/index.ts'

NODE = ['npm', 'run', 'test:unit', '--', 'src/wallet/money/walletMoney.test.ts']
# One file after the other: lighter on a shared machine.
RENDER = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', '--no-file-parallelism',
          'src/wallet/money/WalletAmount.render.test.tsx', 'src/wallet/privacy/PrivateMode.render.test.tsx']

SHOWN_TEXT = '      {hidden ? HIDDEN_AMOUNT : walletMoneyText(minor, { sign, exact })}\n'
TRACK = '    trackPrivateModeToggled();\n'
BUS_IMPORT = ("import { trackPrivateModeToggled } from '@mobile/analytics/events';\n",
              "import { trackClientEvent } from '@mobile/analytics/bus';\nimport { trackPrivateModeToggled } from '@mobile/analytics/events';\n")
AMOUNTS_OPEN = 'function AmountsSection() {\n  return (\n    <WalletGround>\n'
AMOUNTS_CLOSE = '    </WalletGround>\n  );\n}\n\nfunction PrivateSection() {\n'

# (id, expectation, description, file, tests, [(old, new), ...]); each old must occur exactly once.
MUTANTS = [
    # walletMoney.ts: the Node test
    ('N1', 'killed', 'the compact form keeps .00', MONEY, NODE, [("  const shown = !exact && size.endsWith('.00') ? size.slice(0, -3) : size;\n", '  const shown = size;\n')]),
    ('N2', 'killed', 'exact ignored (always compact)', MONEY, NODE, [("!exact && size.endsWith('.00')", "size.endsWith('.00')")]),
    ('N3', 'killed', 'zero is signed', MONEY, NODE, [("  if (minor === '0') return shown;\n", '')]),
    ('N4', 'killed', 'a hyphen for the minus', MONEY, NODE, [("const MINUS = '\\u2212';", "const MINUS = '-';")]),
    ('N5', 'killed', 'income without its plus', MONEY, NODE, [("  if (sign === 'income') return `+${shown}`;\n", "  if (sign === 'income') return shown;\n")]),
    ('N6', 'killed', 'a balance signs a positive amount', MONEY, NODE, [("if (sign === 'balance' && negative)", "if (sign === 'balance')")]),
    ('N7', 'killed', "'none' keeps a negative's minus", MONEY, NODE, [('  return shown;\n}\n\n/**\n * A per-day', '  return negative ? `${MINUS}${shown}` : shown;\n}\n\n/**\n * A per-day')]),
    ('N8', 'killed', 'an expense without its minus', MONEY, NODE, [("  if (sign === 'expense') return `${MINUS}${shown}`;\n", '')]),
    ('N9', 'killed', "the per-day hint rounded to the nearest baht (the plan's mutant)", MONEY, NODE, [('  return walletMoneyText(perDayMinor, { exact: true }).slice(0, -3);\n', '  return walletMoneyText((((BigInt(perDayMinor) + 50n) / 100n) * 100n).toString());\n')]),
    ('N10', 'killed', 'the per-day hint keeps its satang', MONEY, NODE, [('  return walletMoneyText(perDayMinor, { exact: true }).slice(0, -3);\n', '  return walletMoneyText(perDayMinor);\n')]),
    ('N11', 'killed', 'spoken money always says satang', MONEY, NODE, [("  const amount = satang === '00'\n", '  const amount = false\n')]),
    ('N12', 'killed', "spoken satang keep a leading zero", MONEY, NODE, [("satang: satang.replace(/^0/, '')", 'satang')]),
    ('N13', 'killed', 'spoken money never says minus', MONEY, NODE, [("  return negative ? t('common.minus', { amount }) : amount;\n", '  return amount;\n')]),
    ('N14', 'killed', 'the mask has three dots', MONEY, NODE, [("export const HIDDEN_AMOUNT = '฿••••';", "export const HIDDEN_AMOUNT = '฿•••';")]),
    # WalletAmount.tsx: the render tests
    ('A1', 'killed', "the real amount drawn under the mask (the plan's mutant)", AMOUNT, RENDER, [(SHOWN_TEXT, '      {hidden ? HIDDEN_AMOUNT : null}\n      <Text style={{ opacity: hidden ? 0 : 1 }}>{walletMoneyText(minor, { sign, exact })}</Text>\n')]),
    ('A2', 'killed', 'a hidden amount says its amount', AMOUNT, RENDER, [("  const spoken = hidden ? t('common.amountHidden') : spokenMoney(", '  const spoken = spokenMoney(')]),
    ('A3', 'killed', 'income in ink', AMOUNT, RENDER, [("colors[tone ?? (sign === 'income' ? 'violet' : 'ink')]", "colors[tone ?? 'ink']")]),
    ('A4', 'killed', 'the tone ignored', AMOUNT, RENDER, [("colors[tone ?? (sign === 'income' ? 'violet' : 'ink')]", "colors[sign === 'income' ? 'violet' : 'ink']")]),
    ('A5', 'killed', "the material's colour ignored", AMOUNT, RENDER, [('        color: color ?? colors[', '        color: colors[')]),
    ('A6', 'killed', 'amounts in Anuphan', AMOUNT, RENDER, [("import { LATIN_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';", "import { THAI_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';"), ('        fontFamily: LATIN_UI_FONT_FAMILY,\n', '        fontFamily: THAI_UI_FONT_FAMILY,\n')]),
    ('A7', 'killed', 'weight 500', AMOUNT, RENDER, [("        fontWeight: '700',\n", "        fontWeight: '500',\n")]),
    ('A8', 'killed', 'letter spacing at every size', AMOUNT, RENDER, [('size >= 28 ? (size * -2) / 100 : undefined', '(size * -2) / 100')]),
    ('A9', 'killed', 'letter spacing only above 28 pt', AMOUNT, RENDER, [('size >= 28 ?', 'size > 28 ?')]),
    ('A10', 'killed', 'the mask spaced as the amount', AMOUNT, RENDER, [('hidden ? (size * 12) / 100 : size >= 28', 'size >= 28')]),
    ('A11', 'killed', 'every amount grows as body text (no 64 pt cap)', AMOUNT, RENDER, [('      maxFontSizeMultiplier={amountMaxScale(size)}\n', '      maxFontSizeMultiplier={3.12}\n')]),
    ('A12', 'killed', 'an amount clamped to one line', AMOUNT, RENDER, [('      maxFontSizeMultiplier={amountMaxScale(size)}\n', '      maxFontSizeMultiplier={amountMaxScale(size)}\n      numberOfLines={1}\n')]),
    ('A13', 'killed', 'Thai leading for amounts', AMOUNT, RENDER, [("walletLineHeight(size, 'latin')", "walletLineHeight(size, 'thai')")]),
    ('A14', 'killed', 'the mask smaller than the amount', AMOUNT, RENDER, [('        fontSize: size,\n', '        fontSize: hidden ? size - 2 : size,\n')]),
    ('A15', 'killed', 'the words always from the signed amount', AMOUNT, RENDER, [("spokenMoney(sign === 'balance' ? minor : magnitude(minor), t)", 'spokenMoney(minor, t)')]),
    ('A16', 'killed', 'the words always from the size', AMOUNT, RENDER, [("spokenMoney(sign === 'balance' ? minor : magnitude(minor), t)", 'spokenMoney(magnitude(minor), t)')]),
    ('A17', 'killed', 'the label after the amount', AMOUNT, RENDER, [('label ? `${label} ${spoken}` : spoken', 'label ? `${spoken} ${label}` : spoken')]),
    ('A18', 'killed', 'the sign ignored', AMOUNT, RENDER, [(SHOWN_TEXT, '      {hidden ? HIDDEN_AMOUNT : walletMoneyText(minor, { exact })}\n')]),
    ('A19', 'killed', 'exact ignored', AMOUNT, RENDER, [(SHOWN_TEXT, '      {hidden ? HIDDEN_AMOUNT : walletMoneyText(minor, { sign })}\n')]),
    # IconButton.tsx
    ('I1', 'killed', 'a 36 pt button', BUTTON, RENDER, [('const SIZE = 44;', 'const SIZE = 36;')]),
    ('I2', 'killed', 'a disabled button still presses', BUTTON, RENDER, [('      disabled={disabled}\n', '')]),
    ('I3', 'killed', 'a disabled button is not dimmed', BUTTON, RENDER, [('        opacity: disabled ? 0.4 : 1,\n', '        opacity: 1,\n')]),
    ('I4', 'killed', 'no name for screen readers', BUTTON, RENDER, [('      accessibilityLabel={label}\n', '')]),
    ('I5', 'killed', 'the raised fill (invisible on the ground)', BUTTON, RENDER, [('        backgroundColor: colors.card,\n', '        backgroundColor: colors.raised,\n')]),
    ('I6', 'killed', 'an ink ring', BUTTON, RENDER, [('        borderColor: colors.hairline,\n', '        borderColor: colors.ink,\n')]),
    # PrivateModeProvider.tsx
    ('M1', 'killed', 'amounts show before the setting is read', MODE, RENDER, [('const UNREAD: Setting = { hidden: true, ready: false, tipSeen: true };', 'const UNREAD: Setting = { hidden: false, ready: false, tipSeen: true };')]),
    ('M2', 'killed', 'the eye works before the setting is read', MODE, RENDER, [('    if (!now.ready) return;\n', '')]),
    ('M3', 'killed', 'the stored setting is not read', MODE, RENDER, [("hidden: mode === '1'", 'hidden: false')]),
    ('M4', 'killed', 'hiding is not stored', MODE, RENDER, [("hidden ? to.set(PRIVATE_MODE_NAME, '1') :", 'hidden ? Promise.resolve() :')]),
    ('M5', 'killed', 'showing does not remove the setting', MODE, RENDER, [(': to.remove(PRIVATE_MODE_NAME))', ': Promise.resolve())')]),
    ('M6', 'killed', 'nothing is announced', MODE, RENDER, [("    announcePolitely(t(hidden ? 'privacy.hiddenAnnounce' : 'privacy.shownAnnounce'));\n", '')]),
    ('M7', 'killed', 'the announcements swapped', MODE, RENDER, [("hidden ? 'privacy.hiddenAnnounce' : 'privacy.shownAnnounce'", "hidden ? 'privacy.shownAnnounce' : 'privacy.hiddenAnnounce'")]),
    ('M8', 'killed', 'no event', MODE, RENDER, [(TRACK, '')]),
    ('M9', 'killed', 'two events per tap', MODE, RENDER, [(TRACK, TRACK + TRACK)]),
    ('M10', 'survived', "the event carries { on } (the plan's mutant; equivalent: cleanEvent drops a key private_mode_toggled does not allow)", MODE, RENDER, [BUS_IMPORT, (TRACK, "    trackClientEvent('private_mode_toggled', { on: hidden });\n")]),
    ('M11', 'killed', 'the event carries an allowed key, { period }', MODE, RENDER, [BUS_IMPORT, (TRACK, "    trackClientEvent('private_mode_toggled', { period: 'month' });\n")]),
    ('M12', 'killed', 'closing the tip is not stored', MODE, RENDER, [("    void target().set(PRIVATE_TIP_NAME, '1').catch(() => undefined);\n", '')]),
    ('M13', 'killed', 'the stored tip mark is not read', MODE, RENDER, [("tipSeen: tip === '1'", 'tipSeen: false')]),
    ('M14', 'killed', 'closing the tip leaves it showing', MODE, RENDER, [('    publish({ ...latest.current, tipSeen: true });\n', '')]),
    ('M15', 'killed', 'a store that cannot read is not caught', MODE, RENDER, [('store.get(name).catch(() => null)', 'store.get(name)')]),
    ('M16', 'killed', 'a store that cannot write is not caught', MODE, RENDER, [(": to.remove(PRIVATE_MODE_NAME)).catch(() => undefined);\n", ': to.remove(PRIVATE_MODE_NAME));\n')]),
    ('M17', 'killed', "a provider's own store ignored", MODE, RENDER, [('useCallback(() => store ?? walletDeviceStore(), [store])', 'useCallback(() => walletDeviceStore(), [store])')]),
    ('M18', 'killed', 'outside the wallet root amounts are hidden', MODE, RENDER, [('const OUTSIDE: PrivateMode = { hidden: false,', 'const OUTSIDE: PrivateMode = { hidden: true,')]),
    ('M19', 'killed', 'every announcement in English', MODE, RENDER, [("isSupportedLocale(appLocale) ? appLocale : 'en'", "'en'")]),
    ('M20', 'killed', 'WalletRoot without private mode', ROOT, RENDER, [('        <PrivateModeProvider>{children}</PrivateModeProvider>\n', '        {children}\n')]),
    # PrivateEyeButton.tsx
    ('E1', 'killed', 'the eye names its state, not what it will do', EYE, RENDER, [("hidden ? 'privacy.show' : 'privacy.hide'", "hidden ? 'privacy.hide' : 'privacy.show'")]),
    ('E2', 'killed', 'the eye is always drawn open', EYE, RENDER, [('<EyeGlyph shut={hidden}', '<EyeGlyph shut={false}')]),
    ('E3', 'killed', 'the eye does nothing', EYE, RENDER, [('onPress={toggle}', 'onPress={() => undefined}')]),
    # PrivateTip.tsx
    ('T1', 'killed', 'the tip shows while amounts show', TIP, RENDER, [('  if (!hidden || tipSeen) return null;\n', '  if (tipSeen) return null;\n')]),
    ('T2', 'killed', 'the tip shows after it was closed', TIP, RENDER, [('  if (!hidden || tipSeen) return null;\n', '  if (!hidden) return null;\n')]),
    ('T3', 'killed', 'the tip is no status region', TIP, RENDER, [('      {...POLITE_LIVE_REGION}\n', '')]),
    ('T4', 'killed', 'a 32 pt close', TIP, RENDER, [('const CLOSE = 44;', 'const CLOSE = 32;')]),
    ('T5', 'killed', 'the close does nothing', TIP, RENDER, [('        onPress={dismissTip}\n', '        onPress={() => undefined}\n')]),
    # the catalogue
    ('K1', 'killed', "bw-private on the phone's own store", KIT, RENDER, [('    <PrivateModeProvider store={store}>\n', '    <PrivateModeProvider>\n')]),
    ('K2', 'killed', 'bw-private not pinned hidden', KIT, RENDER, [('memoryStore({ [PRIVATE_MODE_NAME]: \'1\' })', 'memoryStore({})')]),
    ('K3', 'killed', 'bw-amounts pins amounts shown', KIT, RENDER, [(AMOUNTS_OPEN, 'const SHOWN_PREVIEW = memoryStore({});\n\n' + AMOUNTS_OPEN.replace('    <WalletGround>\n', '    <PrivateModeProvider store={SHOWN_PREVIEW}><WalletGround>\n')), (AMOUNTS_CLOSE, AMOUNTS_CLOSE.replace('    </WalletGround>\n', '    </WalletGround></PrivateModeProvider>\n'))]),
    ('K4', 'killed', 'the kit list not in the wallet list', INDEX, RENDER, [('  ...WALLET_KIT_SECTIONS,\n', '')]),
]

# vitest's totals line ("      Tests  1 failed | 13 passed (14)"); Node's "ℹ fail N" line.
SUMMARY = re.compile(r'^\s*Tests  (.+?)\s*$', re.M)
# A failing case: its file and its name. The one reported is the first that fails in the
# first file of RENDER, whichever file vitest ran first, so every run names the same case.
FAILED = re.compile(r'^\s*×\s+(\S+)\s+>\s+(.+?)\s+\d+ms\s*$', re.M)
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
            order = {path: index for index, path in enumerate(RENDER)}
            found_cases = FAILED.findall(output)
            failed = [name for _, name in sorted(found_cases, key=lambda case: order.get(case[0], len(order)))]
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

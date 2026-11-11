#!/usr/bin/env python3
"""P2-T14 fix round mutation check (ruling R106; the reviews' m1 to m5, n1 to n4).

Usage: python3 -I mutants.py <worktree root> <log dir> [--before] [ids...]

Applies each mutant alone to the worktree, runs its tests, restores the file
byte for byte (sha256 checked) and prints one line per mutant. Exits 0 only
when every mutant ends as expected.

- Default (the round's code and tests): each mutant runs the file named with
  it (the Node file addFlow.test.ts, the Node source pin
  amountStepNative.test.ts, or AmountStep.render.test.tsx) and must be killed.
- --before (18876253's code and its own tests): only the reviews' survivors
  (RM*, SR*); each runs both of 18876253's focused files (addFlow.test.ts and
  AmountStep.render.test.tsx) and must survive them, which is the gap the
  round's pins close.

The first 92 are the first round's (A5, A13 and K2 re-aimed where the round
moved their lines); the rest are this round's.
"""
import hashlib
import os
import re
import subprocess
import sys

FLOW = 'apps/app/src/wallet/add/addFlow.ts'
STEP = 'apps/app/src/wallet/add/AmountStep.tsx'
KEYPAD = 'apps/app/src/wallet/add/WalletKeypad.tsx'
SWITCH = 'apps/app/src/wallet/add/TypeSwitchHeader.tsx'
CHIPS = 'apps/app/src/wallet/add/QuickChips.tsx'
COPY = 'apps/app/src/wallet/add/copy.ts'
SECTIONS = 'apps/app/src/dev/catalogue/wallet/addSections.tsx'
INDEX = 'apps/app/src/dev/catalogue/wallet/index.ts'

NODE = ['npm', 'run', 'test:unit', '--', 'src/wallet/add/addFlow.test.ts']
NATIVE = ['npm', 'run', 'test:unit', '--', 'src/wallet/add/amountStepNative.test.ts']
RENDER = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', 'src/wallet/add/AmountStep.render.test.tsx']

PROBLEM = ("        {problem === null ? null : (\n"
           "          <WalletText testID=\"add-problem\" role=\"label\" accessibilityRole=\"alert\" aria-live=\"polite\" style={{ textAlign: 'center' }}>\n"
           "            {problem}\n"
           "          </WalletText>\n"
           "        )}\n")
CHIP_IN_GROUP = "        {typeSwitch ? null : wallet}\n"
NEXT = "<PrimaryButton testID=\"add-next\" label={t('common.next')} disabled={!evaluateKeypad(keypad).ok} onPress={() => onStep(stepAfterAmount(type))} />"
NAME_ROW = "      {type === 'income' ? <NameField value={draft.merchant} onChange={(merchant) => onDraft({ ...draft, merchant })} onNaming={onNaming} /> : null}\n"
TELL_BUN_ROW = "      {canTellBun && type !== 'transfer' ? <TellBunRow onPress={onTellBun} /> : null}\n"

# (id, expectation, description, file, tests, [(old, new), ...]); each old must occur exactly once.
MUTANTS = [
    # addFlow.ts: the Node test (the first round's)
    ('F1', 'killed', 'income titled as spending', FLOW, NODE, [("income: 'add.titleIncome'", "income: 'add.titleExpense'")]),
    ('F2', 'killed', "a transfer's Next goes to confirm", FLOW, NODE, [("return type === 'transfer' ? 'transfer' : 'confirm';", "return 'confirm';")]),
    ('F3', 'killed', 'a refused key says nothing', FLOW, NODE, [('  if (keypad.problem !== null) return keypad.problem;\n', '')]),
    ('F4', 'killed', 'a keypad with nothing typed nags', FLOW, NODE, [("outcome.ok || outcome.problem === 'empty' ? null", 'outcome.ok ? null')]),
    ('F5', 'killed', 'a zero amount says nothing', FLOW, NODE, [("outcome.ok || outcome.problem === 'empty' ? null : outcome.problem", 'null')]),
    ('F6', 'killed', "a transfer confirms as spending's rows", FLOW, NODE, [("  if (draft.type === 'transfer') return [row('from'", "  if (draft.type === 'never') return [row('from'")]),
    ('F7', 'killed', 'a built-in category named in English', FLOW, NODE, [('categoryName(category, tc)', 'categoryName(category, (english) => english)')]),
    ('F8', 'killed', 'the note untrimmed', FLOW, NODE, [("row('note', draft.note.trim())", "row('note', draft.note)")]),
    ('F9', 'killed', 'no row is ever guessed', FLOW, NODE, [('guessed: guessed.has(key)', 'guessed: false')]),
    ('F10', 'killed', 'every row guessed once Bun filled any', FLOW, NODE, [('guessed: guessed.has(key)', 'guessed: guessed.size > 0')]),
    ('F11', 'killed', 'the date shown as stored', FLOW, NODE, [('dayLabel(draft.occurredOn, today, dateLocale).text', 'draft.occurredOn')]),
    ('F12', 'killed', 'from and to swapped', FLOW, NODE, [("[row('from', walletName(draft.fromWalletId)), row('to', walletName(draft.toWalletId))", "[row('from', walletName(draft.toWalletId)), row('to', walletName(draft.fromWalletId))")]),
    ('F13', 'killed', 'the wallet row labelled as from', FLOW, NODE, [("  wallet: 'add.rowWallet',\n", "  wallet: 'add.rowFrom',\n")]),
    ('F14', 'killed', 'a changed field stays guessed', FLOW, NODE, [('    return field !== undefined && field(before) !== field(after);\n', '    return false;\n')]),
    ('F15', 'killed', 'any change drops every guess', FLOW, NODE, [('    return field !== undefined && field(before) !== field(after);\n', '    return field !== undefined;\n')]),
    ('F16', 'killed', "the category's guess ignores the type", FLOW, NODE, [("['category', (draft) => (draft.type === 'transfer' ? null : draft.categoryByType[draft.type])]", "['category', (draft) => draft.categoryByType.expense]")]),
    ('F17', 'killed', 'a key that is not a row is dropped', FLOW, NODE, [('[...guessed].filter((key) => !changed(key))', '[...guessed].filter((key) => ROW_FIELDS.has(key) && !changed(key))')]),
    ('F18', 'killed', "move all offered at a zero balance (the plan's mutant)", FLOW, NODE, [('BigInt(balance) > 0n ? balance : null', 'BigInt(balance) >= 0n ? balance : null')]),
    ('F19', 'killed', 'move all offered below zero', FLOW, NODE, [('BigInt(balance) > 0n ? balance : null', 'BigInt(balance) !== 0n ? balance : null')]),
    ('F20', 'killed', 'the amount reaches from as well as to', FLOW, NODE, [('from: after(fromId, -1n)', 'from: after(fromId, 1n)')]),
    ('F21', 'killed', 'one wallet on both sides moves the amount', FLOW, NODE, [('return fromId === toId ? balance : (', 'return (')]),
    ('F22', 'killed', 'the balance worked out in a JS number', FLOW, NODE, [('(BigInt(balance) + sign * BigInt(amountMinor)).toString()', 'String(Number(balance) + Number(sign) * Number(amountMinor))')]),
    ('F23', 'killed', 'a balance not known counted as zero', FLOW, NODE, [('    if (balance === undefined) return null;\n', '    if (balance === undefined) return (sign * BigInt(amountMinor)).toString();\n')]),
    # AmountStep.tsx: the step, the footer, the wallet chip, Tell Bun and the name field (the first round's)
    ('A1', 'killed', "Next on an empty keypad (the plan's mutant)", STEP, RENDER, [('disabled={!evaluateKeypad(keypad).ok}', 'disabled={false}')]),
    ('A2', 'killed', 'Next takes a zero amount', STEP, RENDER, [('disabled={!evaluateKeypad(keypad).ok}', 'disabled={!evaluateKeypad(keypad, { allowZero: true }).ok}')]),
    ('A3', 'killed', "a transfer's Next goes to confirm", STEP, RENDER, [('onPress={() => onStep(stepAfterAmount(type))}', "onPress={() => onStep('confirm')}")]),
    ('A4', 'killed', 'the problem never shows', STEP, RENDER, [('        {problem === null ? null : (\n', '        {true ? null : (\n')]),
    ('A5', 'killed', 'the problem under the wallet chip, not the amount (re-aimed: the problem left the footer)', STEP, RENDER, [(PROBLEM + CHIP_IN_GROUP, CHIP_IN_GROUP + PROBLEM)]),
    ('A6', 'killed', 'the problem is not an alert', STEP, RENDER, [('accessibilityRole="alert" aria-live="polite" ', '')]),
    ('A7', 'killed', 'the amount always said as 0 baht', STEP, RENDER, [("spokenMoney(typed.ok ? typed.minor : '0', t)", "spokenMoney('0', t)")]),
    ('A8', 'killed', 'the amount at 44 pt', STEP, RENDER, [('const AMOUNT = 58;', 'const AMOUNT = 44;')]),
    ('A9', 'killed', 'the amount grows like body text, past 64 pt', STEP, RENDER, [('maxFontSizeMultiplier={amountMaxScale(AMOUNT)}', 'maxFontSizeMultiplier={WALLET_TYPE.body.maxScale}')]),
    ('A10', 'killed', 'the amount clamped to one line', STEP, RENDER, [('            testID="add-amount"\n', '            testID="add-amount"\n            numberOfLines={1}\n')]),
    ('A11', 'killed', "income's chip says จาก", STEP, RENDER, [("type === 'income' ? 'add.intoWallet' : 'add.fromWallet'", "'add.fromWallet'")]),
    ('A12', 'killed', 'the wallet chip opens confirm', STEP, RENDER, [("onPress={() => onStep('wallet')}", "onPress={() => onStep('confirm')}")]),
    ('A13', 'killed', 'a transfer shows the wallet chip (re-aimed: the chip is built once)', STEP, RENDER, [("const wallet = type === 'transfer' ? null : <WalletChip", 'const wallet = false ? null : <WalletChip')]),
    ('A14', 'killed', 'Tell Bun on a transfer', STEP, RENDER, [("{canTellBun && type !== 'transfer' ? <TellBunRow", '{canTellBun ? <TellBunRow')]),
    ('A15', 'killed', 'Tell Bun whether or not Bun can help', STEP, RENDER, [("{canTellBun && type !== 'transfer' ? <TellBunRow", "{type !== 'transfer' ? <TellBunRow")]),
    ('A16', 'killed', 'useCanTellBun ignores the companion area', STEP, RENDER, [("return isRedesignEnabled('companion') && enabled;", 'return enabled;')]),
    ('A17', 'killed', "useCanTellBun ignores Bun's AI help", STEP, RENDER, [("return isRedesignEnabled('companion') && enabled;", "return isRedesignEnabled('companion');")]),
    ('A18', 'killed', 'the name field for spending too', STEP, RENDER, [("{type === 'income' ? <NameField", "{type !== 'transfer' ? <NameField")]),
    ('A19', 'killed', 'the name field drops what is typed', STEP, RENDER, [('onChange={(merchant) => onDraft({ ...draft, merchant })}', 'onChange={() => undefined}')]),
    ('A20', 'killed', 'the name has no length limit', STEP, RENDER, [('          maxLength={MERCHANT_MAX_CHARS}\n', '')]),
    ('A21', 'killed', 'the budget note left out', STEP, RENDER, [("      <WalletText role=\"caption\" tone=\"quiet\">{t('add.notInBudget')}</WalletText>\n", '')]),
    ('A22', 'killed', 'the wallet chip under 44 pt', STEP, RENDER, [('minHeight: large ? 64 : 44,', 'minHeight: large ? 64 : 36,')]),
    ('A23', 'killed', 'at AX5 the wallet chip stays a pill', STEP, RENDER, [("alignSelf: large ? 'stretch' : 'center',", "alignSelf: 'center',")]),
    ('A24', 'killed', 'the Tell Bun row under 44 pt', STEP, RENDER, [('        minHeight: 50,\n', '        minHeight: 40,\n')]),
    ('A25', 'killed', "a wallet not chosen says จาก and nothing", STEP, RENDER, [("? t('add.chooseWallet')", "? t('add.fromWallet', { wallet: '' })")]),
    ('A26', 'killed', "the wallet's material not drawn", STEP, RENDER, [('<MaterialFill material={lookOf(wallet.id).material} radius={large ? 6 : 5} />', '{null}')]),
    ('A27', 'killed', 'every wallet drawn in silk', STEP, RENDER, [('material={lookOf(wallet.id).material}', 'material="silk"')]),
    # WalletKeypad.tsx (the first round's)
    ('K1', 'killed', 'keys without a tick', KEYPAD, RENDER, [("    playHaptic('keyTap');\n", '')]),
    ('K2', 'killed', 'delete clears the whole amount (re-aimed: the keypad types through walletKey)', KEYPAD, RENDER, [('onKeypad(walletKey(keypad, key));', "onKeypad(key === 'backspace' ? { ...keypad, operands: [''], problem: null } : walletKey(keypad, key));")]),
    ('K3', 'killed', 'keys 44 pt, under the boards', KEYPAD, RENDER, [('const KEY = 46;', 'const KEY = 44;')]),
    ('K4', 'killed', 'at AX5 keys stay 46 pt', KEYPAD, RENDER, [('minHeight: large ? LARGE_KEY : KEY,', 'minHeight: KEY,')]),
    ('K5', 'killed', 'at AX5 keys on nothing', KEYPAD, RENDER, [("backgroundColor: large || pressed ? colors.raised : 'transparent',", "backgroundColor: pressed ? colors.raised : 'transparent',")]),
    ('K6', 'killed', 'keys always on raised', KEYPAD, RENDER, [("backgroundColor: large || pressed ? colors.raised : 'transparent',", 'backgroundColor: colors.raised,')]),
    ('K7', 'killed', 'a disabled keypad still types', KEYPAD, RENDER, [('                disabled={disabled}\n', '')]),
    ('K8', 'killed', 'a disabled key is not dimmed', KEYPAD, RENDER, [('opacity: disabled ? 0.4 : 1,', 'opacity: 1,')]),
    ('K9', 'killed', 'the digits grow past 34 pt', KEYPAD, RENDER, [('                    maxFontSizeMultiplier={DIGIT_CAP}\n', '')]),
    ('K10', 'killed', 'delete says its key name', KEYPAD, RENDER, [("key === 'backspace' ? t('add.deleteKey') : key", 'key')]),
    ('K11', 'killed', '0 before 000', KEYPAD, RENDER, [("['000', '0', 'backspace']", "['0', '000', 'backspace']")]),
    # TypeSwitchHeader.tsx (the first round's)
    ('T1', 'killed', 'choosing the chosen type asks again', SWITCH, RENDER, [('              if (checked) return;\n', '')]),
    ('T2', 'killed', 'no tick on a new type', SWITCH, RENDER, [("              playHaptic('segmentChange');\n", '')]),
    ('T3', 'killed', 'segments are buttons, not radios', SWITCH, RENDER, [('accessibilityRole="radio"', 'accessibilityRole="button"')]),
    ('T4', 'killed', 'the chosen type not marked', SWITCH, RENDER, [('accessibilityState={{ checked }}\n            aria-checked={checked}', 'accessibilityState={{ checked: false }}\n            aria-checked={false}')]),
    ('T5', 'killed', 'the group has no name', SWITCH, RENDER, [("      accessibilityLabel={t('add.typeGroup')}\n", '')]),
    ('T6', 'killed', 'the chosen type left on the track', SWITCH, RENDER, [("backgroundColor: checked ? colors.card : 'transparent',", "backgroundColor: 'transparent',")]),
    ('T7', 'killed', 'the chosen words not bold', SWITCH, RENDER, [("fontWeight: checked ? '700' : '500'", "fontWeight: '500'")]),
    ('T8', 'killed', 'the others in ink', SWITCH, RENDER, [("tone={checked ? 'ink' : 'quiet'}", 'tone="ink"')]),
    ('T9', 'killed', 'at AX5 the switch stays a row', SWITCH, RENDER, [("flexDirection: large ? 'column' : 'row'", "flexDirection: 'row'")]),
    ('T10', 'killed', 'segments 40 pt', SWITCH, RENDER, [('const SEGMENT = 44;', 'const SEGMENT = 40;')]),
    ('T11', 'killed', 'income before spending', SWITCH, RENDER, [("['expense', 'income', 'transfer'];", "['income', 'expense', 'transfer'];")]),
    # QuickChips.tsx (the first round's)
    ('Q1', 'killed', 'four chips shown', CHIPS, RENDER, [('chips.slice(0, MOST)', 'chips')]),
    ('Q2', 'killed', 'a chip that fills nothing', CHIPS, RENDER, [('            chip.apply();\n', '')]),
    ('Q3', 'killed', 'no tick on a chip', CHIPS, RENDER, [("            playHaptic('chipPick');\n", '')]),
    ('Q4', 'killed', "private mode says the chips' amounts", CHIPS, RENDER, [("hidden ? t('common.amountHidden') : spokenMoney(chip.amountMinor, t)", 'spokenMoney(chip.amountMinor, t)')]),
    ('Q5', 'killed', "the chip's amount as plain text, never masked", CHIPS, RENDER, [('<WalletAmount minor={chip.amountMinor} size={16} />', '<WalletText role="label">{`฿${Number(chip.amountMinor) / 100}`}</WalletText>')]),
    ('Q6', 'killed', 'at AX5 the chips stay a row of pills', CHIPS, RENDER, [('      style={large\n', '      style={false\n')]),
    ('Q7', 'killed', 'at AX5 rows under 64 pt', CHIPS, RENDER, [('? { minHeight: 64, alignContent', '? { minHeight: 44, alignContent')]),
    ('Q8', 'killed', 'pills under 44 pt', CHIPS, RENDER, [(': { minHeight: 44, flexShrink: 1', ': { minHeight: 36, flexShrink: 1')]),
    ('Q9', 'killed', 'no chips still draws the list', CHIPS, RENDER, [('  if (shown.length === 0) return null;\n', '')]),
    ('Q10', 'killed', 'a chip says only its name', CHIPS, RENDER, [("accessibilityLabel={t('add.chip', { label: chip.label, amount: hidden ? t('common.amountHidden') : spokenMoney(chip.amountMinor, t) })}", 'accessibilityLabel={chip.label}')]),
    # copy.ts (the first round's)
    ('C1', 'killed', 'income titled จดรายจ่าย', COPY, RENDER, [("'add.titleIncome': { th: 'จดรายรับ'", "'add.titleIncome': { th: 'จดรายจ่าย'")]),
    ('C2', 'killed', 'the delete key says ลบ', COPY, RENDER, [("th: 'ลบตัวเลข'", "th: 'ลบ'")]),
    ('C3', 'killed', 'จาก with a space', COPY, RENDER, [("th: 'จาก{wallet}'", "th: 'จาก {wallet}'")]),
    ('C4', 'killed', "the chip's Thai line loses its amount", COPY, RENDER, [("'add.chip': { th: '{label} {amount}'", "'add.chip': { th: '{label}'")]),
    # The catalogue (the first round's)
    ('S1', 'killed', 'the add sections not in the wallet list', INDEX, RENDER, [('  ...WALLET_ADD_SECTIONS,\n', '')]),
    ('S2', 'killed', "the add sections before the tray's", INDEX, RENDER, [('  ...WALLET_TRAY_SECTIONS,\n  ...WALLET_ADD_SECTIONS,\n', '  ...WALLET_ADD_SECTIONS,\n  ...WALLET_TRAY_SECTIONS,\n')]),
    ('S3', 'killed', 'a section opens closed', SECTIONS, RENDER, [('const [open, setOpen] = useState(true);', 'const [open, setOpen] = useState(false);')]),
    ('S4', 'killed', 'the income section starts as spending', SECTIONS, RENDER, [("start={{ type: 'income', amountMinor: '3500000'", "start={{ type: 'expense', amountMinor: '3500000'")]),
    ('S5', 'killed', 'the amount section without Tell Bun', SECTIONS, RENDER, [('named: false, chips: true, tellBun: true', 'named: false, chips: true, tellBun: false')]),
    ('S6', 'killed', 'the income section without its name', SECTIONS, RENDER, [('named: true, chips: false', 'named: false, chips: false')]),
    # This round. R106.1, M1: where the switch and the problem go, and the footer while naming.
    ('L1', 'killed', 'at AX5 the switch stays in the pinned header (useSwitchInHeader always true)', SWITCH, RENDER, [('  return !useLargeText();\n', '  return true;\n')]),
    ('L2', 'killed', 'the switch at the top of the middle, over the amount (R106 as written)', STEP, RENDER, [
        ("    <View style={{ gap: 12 }}>\n      <View style={{ alignItems: 'center', gap: 8 }}>\n", "    <View style={{ gap: 12 }}>\n      {typeSwitch}\n      <View style={{ alignItems: 'center', gap: 8 }}>\n"),
        ('          {typeSwitch}\n          {wallet}\n', '          {wallet}\n'),
    ]),
    ('L3', 'killed', 'the step never draws the switch it is given', STEP, RENDER, [('          {typeSwitch}\n', '')]),
    ('L4', 'killed', 'at AX5 the wallet chip is drawn twice, in the group and after the switch', STEP, RENDER, [('        {typeSwitch ? null : wallet}\n', '        {wallet}\n')]),
    ('N1', 'killed', 'the keys stay while the name field has focus', STEP, RENDER, [('{naming ? null : <WalletKeypad', '{false ? null : <WalletKeypad')]),
    ('N2', 'killed', 'Next leaves with the keys while naming', STEP, RENDER, [(NEXT, '{naming ? null : ' + NEXT + '}')]),
    ('N3', 'killed', 'the name field never says it has focus', STEP, RENDER, [('          onFocus={() => onNaming(true)}\n', '')]),
    ('N4', 'killed', 'the name field never says it let go', STEP, RENDER, [('          onBlur={() => onNaming(false)}\n', '')]),
    ('N5', 'killed', "Android's back hides the keyboard and the keys stay hidden", STEP, RENDER, [("Keyboard.addListener('keyboardDidHide', () => input.current?.blur())", "Keyboard.addListener('keyboardDidHide', () => undefined)")]),
    ('N6', 'killed', 'a name field that leaves with focus keeps the keys hidden', STEP, RENDER, [('      naming.current(false);\n', '')]),
    ('N7', 'killed', "the name field's own box under 44 pt (m1)", STEP, RENDER, [('minHeight: BUN_TOUCH, padding: 0', 'padding: 0')]),
    ('N8', 'killed', "the name field's caption read out beside the field's own name (n3)", STEP, RENDER, [("<WalletText role=\"caption\" tone=\"quiet\" {...DECORATIVE}>{t('add.merchantLabel')}", "<WalletText role=\"caption\" tone=\"quiet\">{t('add.merchantLabel')}")]),
    ('N9', 'killed', "Tell Bun before income's name (rh-income draws the name under the wallet chip)", STEP, RENDER, [(NAME_ROW + TELL_BUN_ROW, TELL_BUN_ROW + NAME_ROW)]),
    # R106.2: an amount the person did not type is masked in private mode until a key is pressed.
    ('P1', 'killed', 'a fill shows its stored amount in private mode', STEP, RENDER, [('  const masked = hidden && isFilled(keypad);\n', '  const masked = false;\n')]),
    ('P2', 'killed', 'private mode masks what is typed too', STEP, RENDER, [('  const masked = hidden && isFilled(keypad);\n', '  const masked = hidden;\n')]),
    ('P3', 'killed', 'a fill masked outside private mode', STEP, RENDER, [('  const masked = hidden && isFilled(keypad);\n', '  const masked = isFilled(keypad);\n')]),
    ('P4', 'killed', 'the masked amount still says its amount', STEP, RENDER, [("accessibilityLabel={masked ? t('common.amountHidden') : spokenMoney(typed.ok ? typed.minor : '0', t)}", "accessibilityLabel={spokenMoney(typed.ok ? typed.minor : '0', t)}")]),
    ('P5', 'killed', "the mask spaced as digits, not as WalletAmount's mask", STEP, RENDER, [('letterSpacing: masked ? (AMOUNT * 12) / 100 : (AMOUNT * -2) / 100,', 'letterSpacing: (AMOUNT * -2) / 100,')]),
    ('P6', 'killed', 'a fill is not marked as one (filledKeypad as keypadFromMinor)', FLOW, NODE, [('  return { ...keypadFromMinor(minor), fresh: true };\n', '  return keypadFromMinor(minor);\n')]),
    ('P7', 'killed', 'satang is not taken for a fill', FLOW, NODE, [("  return keypad.fresh || keypad.operands.some((operand) => operand.includes('.'));\n", '  return keypad.fresh;\n')]),
    ('P8', 'killed', 'a whole-baht fill is not taken for a fill', FLOW, NODE, [("  return keypad.fresh || keypad.operands.some((operand) => operand.includes('.'));\n", "  return keypad.operands.some((operand) => operand.includes('.'));\n")]),
    ('P9', 'killed', "the catalogue's chips fill as if typed", SECTIONS, RENDER, [('setKeypad(filledKeypad(minor))', 'setKeypad(keypadFromMinor(minor))')]),
    ('P10', 'killed', "the masked line draws the fill's digits, though it says they are hidden", STEP, RENDER, [('{masked ? HIDDEN_AMOUNT : `฿${keypadDisplay(keypad)}`}', '{`฿${keypadDisplay(keypad)}`}')]),
    # R106.4, m4: the first key on a fill starts it over.
    ('W1', 'killed', 'delete on a fill takes one digit (฿65.50 to ฿65.5)', FLOW, NODE, [("  return key === 'backspace' ? EMPTY_KEYPAD : applyKey(EMPTY_KEYPAD, key);\n", "  return key === 'backspace' ? applyKey(keypad, key) : applyKey(EMPTY_KEYPAD, key);\n")]),
    ('W2', 'killed', 'a digit on a fill goes on from it (too_precise after satang)', FLOW, NODE, [("  return key === 'backspace' ? EMPTY_KEYPAD : applyKey(EMPTY_KEYPAD, key);\n", "  return key === 'backspace' ? EMPTY_KEYPAD : applyKey(keypad, key);\n")]),
    ('W3', 'killed', "every key by today's rules, fills and all", FLOW, NODE, [('  if (!isFilled(keypad)) return applyKey(keypad, key);\n', '  if (keypad) return applyKey(keypad, key);\n')]),
    ('W4', 'killed', 'the keypad ignores that an amount was filled', KEYPAD, RENDER, [('onKeypad(walletKey(keypad, key));', 'onKeypad(walletKey({ ...keypad, fresh: false }, key));')]),
    # R106.4, m2 and m3.
    ('Q11', 'killed', "a transfer's amount shows the quick chips (m2)", STEP, RENDER, [("      {type === 'transfer' ? null : <QuickChips chips={chips} />}\n", '      <QuickChips chips={chips} />\n')]),
    ('T12', 'killed', 'a locked switch still changes the type (m3)', SWITCH, RENDER, [('            disabled={disabled}\n', '')]),
    ('T13', 'killed', 'a locked switch is not dimmed (m3)', SWITCH, RENDER, [('opacity: disabled ? 0.4 : 1,', 'opacity: 1,')]),
    # R106.5: n4 here, the second review's n1 and m3's branch, and the catalogue host's wiring.
    ('F24', 'killed', "the note's guess compares the raw note (n4)", FLOW, NODE, [("  ['note', (draft) => draft.note.trim()],\n", "  ['note', (draft) => draft.note],\n")]),
    ('S7', 'killed', 'at AX5 the section keeps the switch in its header too', SECTIONS, RENDER, [('header={inHeader ? typeSwitch : undefined}', 'header={typeSwitch}')]),
    ('S8', 'killed', 'the section never gives the switch to the step', SECTIONS, RENDER, [('typeSwitch={inHeader ? null : typeSwitch}', 'typeSwitch={null}')]),
    ('S9', 'killed', "the section's footer never hears the name field", SECTIONS, RENDER, [('naming={naming}', 'naming={false}')]),
    ('S10', 'killed', "the section's problem never shows", SECTIONS, RENDER, [('problem={problemWords === undefined ? null : tc(problemWords)}', 'problem={null}')]),
    # The reviews' survivors (the first review's own M1 to M10 but M4, which its sections case kills; the second review's R1 and R3,
    # with R4 the same as M2), each now killed by its pin. Under --before each must survive 18876253's own focused files.
    ('RM1', 'killed', 'the typed amount leaves its polite live region (first review M1)', STEP, RENDER, [("        <View {...POLITE_LIVE_REGION} style={{ alignSelf: 'stretch' }}>\n", "        <View style={{ alignSelf: 'stretch' }}>\n")]),
    ('RM2', 'killed', 'a new problem is never said on iOS (first review M2, second review R4)', STEP, NATIVE, [('  useAnnouncement(problem);\n', '')]),
    ('RM3', 'killed', "income's typed amount drawn violet (first review M3)", STEP, RENDER, [("              color: colors.ink,\n              textAlign: 'center',\n", "              color: type === 'income' ? colors.violet : colors.ink,\n              textAlign: 'center',\n")]),
    ('RM5', 'killed', "the name field grows past body text's cap (first review M5)", STEP, RENDER, [('          maxFontSizeMultiplier={WALLET_TYPE.body.maxScale}\n', '')]),
    ('RM6', 'killed', 'a wallet no longer listed is named by its id (first review M6)', STEP, RENDER, [('lookups.wallets.get(walletId);\n  const words', 'lookups.wallets.get(walletId) ?? { id: walletId, name: walletId };\n  const words')]),
    ('RM7', 'killed', 'the problem is not polite, role alert kept (first review M7, n2)', STEP, RENDER, [('accessibilityRole="alert" aria-live="polite" ', 'accessibilityRole="alert" ')]),
    ('RM8', 'killed', 'the chosen segment lifted by a shadow at night too (first review M8, n2)', SWITCH, RENDER, [('boxShadow: checked && !colors.isDark ? LIFT : undefined,', 'boxShadow: checked ? LIFT : undefined,')]),
    ('RM9', 'killed', 'closing a section and opening it again keeps what was typed (first review M9, n1)', SECTIONS, RENDER, [('        onClosed={() => {\n          setDraft(begin());\n          setKeypad(keypadFromMinor(start.amountMinor));\n        }}\n', '')]),
    ('RM10', 'killed', "a section's problem words drift from today's catalog line (first review M10, n1)", SECTIONS, RENDER, [("  zero: 'Enter an amount above zero',\n", "  zero: 'Enter an amount above 0',\n")]),
    ('SR1', 'killed', "the step drops a refused key's too_precise (second review R1, m3)", FLOW, NODE, [('  if (keypad.problem !== null) return keypad.problem;\n', "  if (keypad.problem === 'too_large') return keypad.problem;\n")]),
    ('SR3', 'killed', "move all withholds a balance above the keypad's cap (second review R3, n1)", FLOW, NODE, [('return balance !== undefined && BigInt(balance) > 0n ? balance : null;', 'return balance !== undefined && BigInt(balance) > 0n && BigInt(balance) <= 99999999999n ? balance : null;')]),
]

REVIEW_SURVIVORS = ['RM1', 'RM2', 'RM3', 'RM5', 'RM6', 'RM7', 'RM8', 'RM9', 'RM10', 'SR1', 'SR3']

# vitest's totals line ("      Tests  1 failed | 11 passed (12)"); Node's "ℹ fail N" lines.
SUMMARY = re.compile(r'^\s*Tests  (.+?)\s*$', re.M)
FAILED = re.compile(r'^\s*×\s+\S+\s+>\s+(.+?)\s+\d+ms\s*$', re.M)
NODE_FAIL = re.compile(r'^ℹ (tests|pass|fail) (\d+)', re.M)
NODE_FAILED = re.compile(r'^✖ (.+?) \([\d.]+ms\)$', re.M)


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def run(command, app):
    done = subprocess.run(command, cwd=app, capture_output=True, text=True, timeout=900)
    return done.returncode, done.stdout + done.stderr


def summarize(command, output):
    if command is RENDER:
        found = SUMMARY.findall(output)
        return (found[-1] if found else 'no summary'), FAILED.findall(output)
    totals = dict(NODE_FAIL.findall(output))
    return f"{totals.get('fail', '?')} failed | {totals.get('pass', '?')} passed ({totals.get('tests', '?')})", NODE_FAILED.findall(output)


def main():
    args = sys.argv[1:]
    before = '--before' in args
    args = [arg for arg in args if arg != '--before']
    root, logs = args[0], args[1]
    os.makedirs(logs, exist_ok=True)
    app = os.path.join(root, 'apps/app')
    wanted = set(args[2:]) or (set(REVIEW_SURVIVORS) if before else set())
    unexpected = 0
    killed = survived = 0
    for ident, expect, description, rel, command, edits in MUTANTS:
        if wanted and ident not in wanted:
            continue
        if before:
            expect = 'survived'
        path = os.path.join(root, rel)
        with open(path, 'rb') as handle:
            original = handle.read()
        before_sha = hashlib.sha256(original).hexdigest()
        text = original.decode('utf-8')
        for old, new in edits:
            count = text.count(old)
            if count != 1:
                print(f'{ident} SETUP ERROR: {count} matches for {old!r} in {rel}', flush=True)
                sys.exit(2)
            text = text.replace(old, new)
        outputs = []
        try:
            with open(path, 'wb') as handle:
                handle.write(text.encode('utf-8'))
            for each in ([NODE, RENDER] if before else [command]):
                code, output = run(each, app)
                outputs.append((each, code, output))
        finally:
            with open(path, 'wb') as handle:
                handle.write(original)
        after = sha(path)
        with open(os.path.join(logs, f'{ident}.log'), 'w', encoding='utf-8') as handle:
            handle.write('\n'.join(output for _, _, output in outputs))
        outcome = 'killed' if any(code != 0 for _, code, _ in outputs) else 'survived'
        if outcome == 'killed':
            killed += 1
        else:
            survived += 1
        parts = []
        for each, code, output in outputs:
            summary, failed = summarize(each, output)
            name = 'render' if each is RENDER else os.path.basename(each[-1])
            first = f'; first failing: "{failed[0].strip()}"' if failed else ''
            parts.append(f'{name}: Tests {summary}{first}; AssertionError x{output.count("AssertionError")}')
        restored = 'restored sha256 equal' if after == before_sha else f'RESTORE MISMATCH {after}'
        mark = 'KILLED' if outcome == 'killed' else 'SURVIVED'
        print(f'{ident} {mark}: {description} [{os.path.basename(rel)}] -> {" | ".join(parts)}; {restored}', flush=True)
        if outcome != expect or after != before_sha:
            unexpected += 1
    print(f'{killed} killed, {survived} survived, {unexpected} not as expected')
    sys.exit(1 if unexpected else 0)


if __name__ == '__main__':
    main()

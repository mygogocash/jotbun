#!/usr/bin/env python3
"""P2-T15 mutation check. Usage: python3 -I mutants.py <worktree root> <log dir> [ids...]

Applies each mutant alone to the worktree, runs AddSteps.render.test.tsx (every
mutant's suite: the steps, the copy and the sections), restores the file byte
for byte (sha256 checked) and prints one line per mutant. Exits 0 only when
every mutant ends as expected.
"""
import hashlib
import os
import re
import subprocess
import sys

TRANSFER = 'apps/app/src/wallet/add/TransferStep.tsx'
CONFIRM = 'apps/app/src/wallet/add/ConfirmStep.tsx'
PICKS = 'apps/app/src/wallet/add/PickSteps.tsx'
COPY = 'apps/app/src/wallet/add/copy.ts'
SECTIONS = 'apps/app/src/dev/catalogue/wallet/addSections.tsx'

RENDER = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', 'src/wallet/add/AddSteps.render.test.tsx']

FROM_CARD = "<TransferCard testID=\"transfer-from\" role={t('add.rowFrom')} wallet={from} balance={balanceOf(from)} after={from === null ? null : after.from} onPress={() => onStep('from')} />"
TITLE = "  return draft.merchant.trim() || draft.note.trim() || category || t(trayTitleKey(draft.type));\n"
NUMBER = 'const NUMBER = /(?:฿\\s?)?[0-9๐-๙]+(?:[.,][0-9๐-๙]+)*/g;'

# (id, expectation, description, file, [(old, new), ...]); each old must occur exactly once.
MUTANTS = [
    # TransferStep.tsx
    ('X1', 'killed', "the balances stay where they were when the step opened, so a swap moves only the names (the plan's mutant)", TRANSFER, [
        ("import { Pressable, View } from 'react-native';\n", "import { useState } from 'react';\nimport { Pressable, View } from 'react-native';\n"),
        ("  const after = balancesAfter(balances, draft.fromWalletId, draft.toWalletId, typed.ok ? typed.minor : '0');\n",
         "  const [first] = useState(() => [draft.fromWalletId, draft.toWalletId] as const);\n  const after = balancesAfter(balances, first[0], first[1], typed.ok ? typed.minor : '0');\n"),
        ("  const balanceOf = (wallet: WalletSnapshot | null) => (wallet === null || balances === null ? null : balances.get(wallet.id) ?? null);\n",
         "  const balanceOf = (wallet: WalletSnapshot | null) => (wallet === null || balances === null ? null : balances.get(wallet === from ? first[0] ?? '' : first[1] ?? '') ?? null);\n"),
    ]),
    ('X2', 'killed', 'swap does nothing', TRANSFER, [("onPress={() => onDraft({ ...draft, fromWalletId: draft.toWalletId, toWalletId: draft.fromWalletId })}", 'onPress={() => onDraft({ ...draft })}')]),
    ('X3', 'killed', 'move all offered above the amount cap', TRANSFER, [('  return all !== null && BigInt(all) <= MINOR_AMOUNT_MAX ? all : null;\n', '  return all;\n')]),
    ('X4', 'killed', 'move all offered at zero or below', TRANSFER, [('  const all = moveAllMinor(balances, fromId);\n', '  const all = fromId === null || balances === null ? null : balances.get(fromId) ?? null;\n')]),
    ('X5', 'killed', 'move all fills the amount as if typed', TRANSFER, [('onPress={() => onKeypad(filledKeypad(moveAll))}', 'onPress={() => onKeypad({ ...filledKeypad(moveAll), fresh: false })}')]),
    ('X6', 'killed', 'the amount line masks what was typed', TRANSFER, [('  const masked = hidden && isFilled(keypad);\n', '  const masked = hidden;\n')]),
    ('X7', 'killed', 'the amount line never masks a fill', TRANSFER, [('  const masked = hidden && isFilled(keypad);\n', '  const masked = false;\n')]),
    ('X8', 'killed', 'the after line is the balance before the move', TRANSFER, [('after={from === null ? null : after.from}', 'after={from === null ? null : balanceOf(from)}')]),
    ('X9', 'killed', 'the cards drawn without their materials', TRANSFER, [('      {material === null ? null : <MaterialFill material={material} radius={18} />}\n', '      {null}\n')]),
    ('X10', 'killed', 'an archived wallet shown on a card', TRANSFER, [('wallets.find((wallet) => wallet.id === id && !wallet.archived)', 'wallets.find((wallet) => wallet.id === id)')]),
    ('X11', 'killed', "a card's label leaves out the after line", TRANSFER, [(", after === null ? null : t('add.after', { amount: say(after) })]", ']')]),
    ('X12', 'killed', 'a card says its balance in private mode', TRANSFER, [("  const say = (minor: Minor) => (hidden ? t('common.amountHidden') : spokenMoney(minor, t));\n", '  const say = (minor: Minor) => spokenMoney(minor, t);\n')]),
    ('X13', 'killed', 'move all says its amount in private mode', TRANSFER, [("accessibilityLabel={t('add.moveAll', { amount: hidden ? t('common.amountHidden') : spokenMoney(moveAll, t) })}", "accessibilityLabel={t('add.moveAll', { amount: spokenMoney(moveAll, t) })}")]),
    ('X14', 'killed', 'the from card opens the to step', TRANSFER, [("onPress={() => onStep('from')}", "onPress={() => onStep('to')}")]),
    ('X15', 'killed', 'at AX5 a card does not stack', TRANSFER, [("        flexDirection: large ? 'column' : 'row',\n", "        flexDirection: 'row',\n")]),
    ('X16', 'killed', 'at AX5 the swap stays on the seam', TRANSFER, [("style={large ? { alignItems: 'center', paddingVertical: 8 } : { height: SEAM, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}", "style={{ height: SEAM, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}")]),
    ('X21', 'killed', "the swap on rh-transfer's 8 pt seam, over the cards' words", TRANSFER, [('const SEAM = 22;', 'const SEAM = 8;')]),
    ('X17', 'killed', 'a card under 84 pt', TRANSFER, [('const CARD = 84;', 'const CARD = 40;')]),
    ('X18', 'killed', 'move all under 44 pt', TRANSFER, [('              minHeight: 44,\n', '              minHeight: 36,\n')]),
    ('X19', 'killed', "the amount at the amount step's 58, not the board's 52", TRANSFER, [('const AMOUNT = 52;', 'const AMOUNT = 58;')]),
    ('X20', 'killed', "the after line's words not drawn", TRANSFER, [("              {beforeAfter === '' ? null : <WalletText role=\"caption\" style={{ color: quiet }}>{beforeAfter}</WalletText>}\n", '')]),
    # TransferFooter (TransferStep.tsx)
    ('F1', 'killed', 'Next takes one wallet on both sides', TRANSFER, [('disabled={from === null || to === null || from === to}', 'disabled={from === null || to === null}')]),
    ('F2', 'killed', 'Next takes a side with no wallet', TRANSFER, [('disabled={from === null || to === null || from === to}', 'disabled={from === to}')]),
    ('F3', 'killed', 'one wallet on both sides is never said', TRANSFER, [("  const problem = from !== null && from === to ? tc('Choose two different wallets') : null;\n", '  const problem = null;\n')]),
    ('F4', 'killed', 'two empty sides said to be the same wallet', TRANSFER, [('from !== null && from === to ?', 'from === to ?')]),
    ('F5', 'killed', 'Next goes back to the amount', TRANSFER, [("onPress={() => onStep('confirm')}", "onPress={() => onStep('amount')}")]),
    ('F6', 'killed', 'the problem is not an alert', TRANSFER, [('<WalletText testID="transfer-problem" role="label" accessibilityRole="alert" aria-live="polite"', '<WalletText testID="transfer-problem" role="label" aria-live="polite"')]),
    ('F7', 'killed', 'no note that a move is not spending', TRANSFER, [("<WalletText role=\"caption\" tone=\"quiet\" style={{ flexShrink: 1, textAlign: 'center' }}>{t('add.transferNote')}</WalletText>", '{null}')]),
    # ConfirmStep.tsx
    ('C1', 'killed', 'the title ignores the merchant', CONFIRM, [(TITLE, '  return draft.note.trim() || category || t(trayTitleKey(draft.type));\n')]),
    ('C2', 'killed', 'the title ignores the note', CONFIRM, [(TITLE, '  return draft.merchant.trim() || category || t(trayTitleKey(draft.type));\n')]),
    ('C3', 'killed', "the title ignores the category's name", CONFIRM, [(TITLE, '  return draft.merchant.trim() || draft.note.trim() || t(trayTitleKey(draft.type));\n')]),
    ('C4', 'killed', "no title falls back to the tray's", CONFIRM, [(TITLE, '  return draft.merchant.trim() || draft.note.trim() || category;\n')]),
    ('C5', 'killed', 'the amount masks what was typed', CONFIRM, [('  const masked = hidden && isFilled(keypad);\n', '  const masked = hidden;\n')]),
    ('C6', 'killed', 'the amount never masks a fill', CONFIRM, [('  const masked = hidden && isFilled(keypad);\n', '  const masked = false;\n')]),
    ('C7', 'killed', "Bun's sentence keeps its numbers in private mode", CONFIRM, [('const sentence = bunSentence === null ? null : hidden ? bunSentence.replace(NUMBER, HIDDEN_AMOUNT) : bunSentence;', 'const sentence = bunSentence;')]),
    ('C8', 'killed', "Bun's sentence masked outside private mode", CONFIRM, [('const sentence = bunSentence === null ? null : hidden ? bunSentence.replace(NUMBER, HIDDEN_AMOUNT) : bunSentence;', 'const sentence = bunSentence === null ? null : bunSentence.replace(NUMBER, HIDDEN_AMOUNT);')]),
    ('C9', 'killed', 'Thai digits in the sentence left unmasked', CONFIRM, [(NUMBER, 'const NUMBER = /(?:฿\\s?)?[0-9]+(?:[.,][0-9]+)*/g;')]),
    ('C10', 'killed', "a masked number keeps its own ฿", CONFIRM, [(NUMBER, 'const NUMBER = /[0-9๐-๙]+(?:[.,][0-9๐-๙]+)*/g;')]),
    ('C11', 'killed', '1,250.50 masked as three numbers', CONFIRM, [(NUMBER, 'const NUMBER = /(?:฿\\s?)?[0-9๐-๙]+/g;')]),
    ('C12', 'killed', "Bun's line drawn with no sentence", CONFIRM, [('{sentence === null ? null : (', '{false ? null : (')]),
    ('C13', 'killed', "income's amount in ink", CONFIRM, [("color: type === 'income' ? colors.violet : colors.ink,", 'color: colors.ink,')]),
    ('C14', 'killed', "income's amount without its plus", CONFIRM, [("walletMoneyText(minor, { sign: type === 'income' ? 'income' : 'none' })", "walletMoneyText(minor, { sign: 'none' })")]),
    ('C15', 'killed', "the tile ignores the category's own", CONFIRM, [('{category !== undefined ? (', '{false ? (')]),
    ('C16', 'killed', "a move's tile without its mark", CONFIRM, [("{type === 'transfer' ? <Glyph name=\"swap\" size={26} color={colors.ink} /> : null}", '{null}')]),
    ('C17', 'killed', 'every row opens the category pick', CONFIRM, [('onPress={() => onStep(row.key)}', "onPress={() => onStep('category')}")]),
    ('C18', 'killed', "Bun's mark on every row", CONFIRM, [('{row.guessed ? (', '{true ? (')]),
    ('C19', 'killed', "a guessed row's label leaves out Bun's mark", CONFIRM, [(", row.guessed ? t('add.bunGuess') : null]", ']')]),
    ('C20', 'killed', 'an empty note asks for a wallet', CONFIRM, [("row.key === 'note' ? t('add.addNote') : ", '')]),
    ('C21', 'killed', 'an empty category asks for a note', CONFIRM, [("row.key === 'category' ? tc('Choose a category') : ", '')]),
    ('C22', 'killed', 'what to add drawn in ink', CONFIRM, [("tone={empty ? 'quiet' : 'ink'}", 'tone="ink"')]),
    ('C23', 'killed', "a wallet row without the wallet's material", CONFIRM, [('{walletId === null || empty ? null : (', '{true ? null : (')]),
    ('C24', 'killed', 'rows under 44 pt', CONFIRM, [('        minHeight: 52,\n', '        minHeight: 40,\n')]),
    ('C25', 'killed', 'at AX5 a row does not stack', CONFIRM, [("        flexDirection: large ? 'column' : 'row',\n", "        flexDirection: 'row',\n")]),
    ('C26', 'killed', 'at AX5 the summary does not stack', CONFIRM, [("<View testID=\"confirm-summary\" style={{ flexDirection: large ? 'column' : 'row',", "<View testID=\"confirm-summary\" style={{ flexDirection: 'row',")]),
    ('C27', 'killed', "the amount at the board's 32, not the plan's 44", CONFIRM, [('const AMOUNT = 44;', 'const AMOUNT = 32;')]),
    ('C28', 'killed', "the to row draws the from wallet's material", CONFIRM, [("key === 'to' ? draft.toWalletId : null", "key === 'to' ? draft.fromWalletId : null")]),
    # PickSteps.tsx
    ('P1', 'killed', 'no step is a pick, so the host never learns where a pick goes back to', PICKS, [('  return PICKS.has(step);\n', '  return false;\n')]),
    ('P2', 'killed', 'the wallet pick always goes back to confirm', PICKS, [('              onDraft(picked(wallet.id));\n              onStep(back);\n', "              onDraft(picked(wallet.id));\n              onStep('confirm');\n")]),
    ('P3', 'killed', 'the category pick ignores the ranking', PICKS, [('[...ranking[type].top, ...ranking[type].rest]', '[]')]),
    ('P4', 'killed', 'archived categories offered', PICKS, [('categories.filter((category) => category.type === type && !category.archived)', 'categories.filter((category) => category.type === type)')]),
    ('P5', 'killed', "categories the ranking does not hold left out", PICKS, [(', ...open.filter((category) => !placed.has(category.id))]', ']')]),
    ('P6', 'killed', "another type's categories offered", PICKS, [('categories.filter((category) => category.type === type && !category.archived)', 'categories.filter((category) => !category.archived)')]),
    ('P7', 'killed', 'the chosen category not checked', PICKS, [('        const checked = category.id === chosen;\n', '        const checked = false;\n')]),
    ('P8', 'killed', "a pick sets spending's category whatever the type", PICKS, [('categoryByType: { ...draft.categoryByType, [type]: category.id }', 'categoryByType: { ...draft.categoryByType, expense: category.id }')]),
    ('P9', 'killed', 'a category pick does not tick', PICKS, [("              playHaptic('chipPick');\n", '')]),
    ('P10', 'killed', 'the category pick does not go back', PICKS, [("              onDraft({ ...draft, categoryByType: { ...draft.categoryByType, [type]: category.id } });\n              onStep('confirm');\n", '              onDraft({ ...draft, categoryByType: { ...draft.categoryByType, [type]: category.id } });\n')]),
    ('P11', 'killed', 'the chosen tile not ringed', PICKS, [("borderColor: checked ? colors.violet : 'transparent' }}>", "borderColor: 'transparent' }}>")]),
    ('P12', 'killed', "the chosen category's name not bold", PICKS, [("fontWeight: checked ? '700' : '400'", "fontWeight: '400'")]),
    ('P13', 'killed', 'at AX5 the grid stays four across', PICKS, [("width: large ? '50%' : '25%',", "width: '25%',")]),
    ('P14', 'killed', 'archived wallets offered', PICKS, [('{wallets.filter((wallet) => !wallet.archived).map((wallet) => {', '{wallets.map((wallet) => {')]),
    ('P15', 'killed', "picking the to wallet as from does not swap", PICKS, [("    if (role === 'from') return id === draft.toWalletId ? { ...draft, fromWalletId: id, toWalletId: draft.fromWalletId } : { ...draft, fromWalletId: id };\n", "    if (role === 'from') return { ...draft, fromWalletId: id };\n")]),
    ('P16', 'killed', "picking the from wallet as to does not swap", PICKS, [('    return id === draft.fromWalletId ? { ...draft, toWalletId: id, fromWalletId: draft.toWalletId } : { ...draft, toWalletId: id };\n', '    return { ...draft, toWalletId: id };\n')]),
    ('P17', 'killed', "the from and to picks check each other's wallet", PICKS, [("const chosen = role === 'wallet' ? draft.walletId : role === 'from' ? draft.fromWalletId : draft.toWalletId;", "const chosen = role === 'wallet' ? draft.walletId : role === 'from' ? draft.toWalletId : draft.fromWalletId;")]),
    ('P18', 'killed', 'the wallet pick says balances in private mode', PICKS, [("${hidden ? t('common.amountHidden') : spokenMoney(balance, t)}", '${spokenMoney(balance, t)}')]),
    ('P19', 'killed', 'every wallet pick named กระเป๋า', PICKS, [("const group = role === 'wallet' ? 'add.rowWallet' : role === 'from' ? 'add.rowFrom' : 'add.rowTo';", "const group = 'add.rowWallet';")]),
    ('P20', 'killed', 'at AX5 a wallet row does not stack', PICKS, [("              flexDirection: large ? 'column' : 'row',\n", "              flexDirection: 'row',\n")]),
    ('P21', 'killed', 'wallet rows under 44 pt', PICKS, [('              minHeight: 56,\n', '              minHeight: 40,\n')]),
    ('P22', 'killed', "the date passes today (the plan's mutant)", PICKS, [("disabled={!canStepForward(day, today)} onPress={() => change(stepDay(day, 1, { today, earliest }))}", "disabled={false} onPress={() => change(stepDay(day, 1, { today: '9999-12-31', earliest }))}")]),
    ('P23', 'killed', "the date goes before the wallet's start", PICKS, [("disabled={!canStepBack(day, earliest)} onPress={() => change(stepDay(day, -1, { today, earliest }))}", 'disabled={!canStepBack(day)} onPress={() => change(stepDay(day, -1, { today }))}')]),
    ('P24', 'killed', "a draft dated before the start opens before it", PICKS, [('useState(() => (earliest !== undefined && draft.occurredOn < earliest ? earliest : draft.occurredOn))', 'useState(() => draft.occurredOn)')]),
    ('P25', 'killed', 'a day change does not tick', PICKS, [("    playHaptic('dateStep');\n", '')]),
    ('P26', 'killed', 'วันนี้ offered on today', PICKS, [('{day === today ? null : <TextLink', '{false ? null : <TextLink')]),
    ('P27', 'killed', 'วันนี้ does nothing', PICKS, [('onPress={() => change(today)}', 'onPress={() => undefined}')]),
    ('P28', 'killed', 'Done does not keep the day', PICKS, [('          onDraft({ ...draft, occurredOn: day });\n', '          onDraft(draft);\n')]),
    ('P29', 'killed', 'a day change written at once, so back keeps it', PICKS, [('    setDay(next);\n', '    setDay(next);\n    onDraft({ ...draft, occurredOn: next });\n')]),
    ('P30', 'killed', 'the note written at once, so back keeps it', PICKS, [('onChangeText={setNote}', 'onChangeText={(next) => { setNote(next); onDraft({ ...draft, note: next }); }}')]),
    ('P31', 'killed', 'Done does not keep the note', PICKS, [('          onDraft({ ...draft, note });\n', '          onDraft(draft);\n')]),
    ('P32', 'killed', 'notes past 500 characters', PICKS, [('        maxLength={NOTE_MAX_CHARS}\n', '')]),
    ('P33', 'killed', 'day arrows under 44 pt', PICKS, [('style={{ width: 44, height: 44, borderRadius: 22,', 'style={{ width: 36, height: 36, borderRadius: 18,')]),
    ('P34', 'killed', "the date pick's Done does not go back", PICKS, [("          onDraft({ ...draft, occurredOn: day });\n          onStep('confirm');\n", '          onDraft({ ...draft, occurredOn: day });\n')]),
    ('P35', 'killed', "the note pick's Done does not go back", PICKS, [("          onDraft({ ...draft, note });\n          onStep('confirm');\n", '          onDraft({ ...draft, note });\n')]),
    # copy.ts
    ('K1', 'killed', 'the after line reads หลัง', COPY, [("'add.after': { th: 'หลังโอน {amount}'", "'add.after': { th: 'หลัง {amount}'")]),
    ('K2', 'killed', "Bun's mark reads เดา", COPY, [("'add.bunGuess': { th: 'บันเดา'", "'add.bunGuess': { th: 'เดา'")]),
    ('K3', 'killed', 'the empty note reads โน้ต', COPY, [("'add.addNote': { th: 'เพิ่มโน้ต'", "'add.addNote': { th: 'โน้ต'")]),
    ('K4', 'killed', 'swap reads สลับ', COPY, [("'add.swap': { th: 'สลับกระเป๋าเงิน'", "'add.swap': { th: 'สลับ'")]),
    ('K5', 'killed', "the to side reads the board's ไปยัง, not the plan's ไป", COPY, [("'add.rowTo': { th: 'ไป'", "'add.rowTo': { th: 'ไปยัง'")]),
    ('K6', 'killed', 'the transfer note loses its second half', COPY, [("'add.transferNote': { th: 'โอนระหว่างกระเป๋าของคุณเอง ไม่นับเป็นรายจ่าย'", "'add.transferNote': { th: 'โอนระหว่างกระเป๋าของคุณเอง'")]),
    # addSections.tsx
    ('S1', 'killed', 'the transfer section under another id', SECTIONS, [("    id: 'bw-tray-transfer',\n", "    id: 'bw-tray-move',\n")]),
    ('S2', 'killed', 'the transfer section with no balances', SECTIONS, [('    middle = <TransferStep {...props} wallets={wallets} balances={SAMPLE_BALANCES} />;\n', '    middle = <TransferStep {...props} wallets={wallets} balances={null} />;\n')]),
    ('S3', 'killed', "the Bun section without what Bun read", SECTIONS, [("merchant: 'sample.chickenRice', bunSaid: true,", "merchant: 'sample.chickenRice', bunSaid: false,")]),
    ('S4', 'killed', 'the confirm section draws no Save', SECTIONS, [("    footer = <PrimaryButton label={t('common.save')} onPress={() => undefined} />;\n", '    footer = undefined;\n')]),
    ('S5', 'killed', "the section keeps Bun's guess after a change", SECTIONS, [('      setGuessed((now) => stillGuessed(now, draft, next));\n', '')]),
    ('S6', 'killed', "cash on another material than rh-transfer's cream paper", SECTIONS, [("const CASH_ID = 'bw-add-cash-wallet';", "const CASH_ID = 'bw-add-cash';")]),
    ('S7', 'killed', 'the section forgets which step opened a pick', SECTIONS, [('      if (isPickStep(next)) setBack(step);\n', '')]),
]

SUMMARY = re.compile(r'^\s*Tests  (.+?)\s*$', re.M)
FAILED = re.compile(r'^\s*×\s+\S+\s+>\s+(.+?)\s+\d+ms\s*$', re.M)


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
    for ident, expect, description, rel, edits in MUTANTS:
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
            run = subprocess.run(RENDER, cwd=app, capture_output=True, text=True, timeout=900)
            output = run.stdout + run.stderr
        finally:
            with open(path, 'wb') as handle:
                handle.write(original)
        after = sha(path)
        with open(os.path.join(logs, f'{ident}.log'), 'w', encoding='utf-8') as handle:
            handle.write(output)
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

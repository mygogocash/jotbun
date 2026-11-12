#!/usr/bin/env python3
"""P2-T15 fix round's mutation check.

Usage: python3 -I mutants.py <worktree root> <log dir> [--check] [ids...]

Applies each mutant alone to the worktree, runs its suite (the render file
AddSteps.render.test.tsx, or the source pins in addStepsNative.test.ts),
restores the file byte for byte (sha256 checked) and prints one line per
mutant. --check only confirms that every mutant's text occurs exactly once.
Exits 0 only when every mutant ends as expected.

The round keeps the first round's ids. C7 to C11 are retired with the mask on
Bun's sentence, which this round removes (R114); new mutants take the next ids
in their group.
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
HOST = 'apps/app/src/dev/catalogue/wallet/addStepsSection.tsx'

RENDER = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', 'src/wallet/add/AddSteps.render.test.tsx']
NODE = ['npm', 'run', 'test:unit', '--', 'src/wallet/add/addStepsNative.test.ts']

TITLE = "  return draft.merchant.trim() || draft.note.trim() || category || t(trayTitleKey(draft.type));\n"
PICK_SET = "new Set<AddStep>(['category', 'wallet', 'from', 'to', 'date', 'note'])"
OPENS_ON = "useState(() => (earliest !== undefined && draft.occurredOn < earliest ? earliest : draft.occurredOn > today ? today : draft.occurredOn))"
BUN_LINE = "{hidden ? t('add.bunReadHidden') : t('add.bunReadFrom', { sentence: bunSentence })}"

# (id, expectation, description, file, suite, [(old, new), ...]); each old must occur exactly once.
MUTANTS = [
    # TransferStep.tsx
    ('X1', 'killed', "the balances stay where they were when the step opened, so a swap moves only the names (the plan's mutant)", TRANSFER, RENDER, [
        ("import { Pressable, View } from 'react-native';\n", "import { useState } from 'react';\nimport { Pressable, View } from 'react-native';\n"),
        ("  const after = balancesAfter(balances, draft.fromWalletId, draft.toWalletId, typed.ok ? typed.minor : '0');\n",
         "  const [first] = useState(() => [draft.fromWalletId, draft.toWalletId] as const);\n  const after = balancesAfter(balances, first[0], first[1], typed.ok ? typed.minor : '0');\n"),
        ("  const balanceOf = (wallet: WalletSnapshot | null) => (wallet === null || balances === null ? null : balances.get(wallet.id) ?? null);\n",
         "  const balanceOf = (wallet: WalletSnapshot | null) => (wallet === null || balances === null ? null : balances.get(wallet === from ? first[0] ?? '' : first[1] ?? '') ?? null);\n"),
    ]),
    ('X2', 'killed', 'swap does nothing', TRANSFER, RENDER, [("onPress={() => onDraft({ ...draft, fromWalletId: draft.toWalletId, toWalletId: draft.fromWalletId })}", 'onPress={() => onDraft({ ...draft })}')]),
    ('X3', 'killed', 'move all offered above the amount cap', TRANSFER, RENDER, [('  return all !== null && BigInt(all) <= MINOR_AMOUNT_MAX ? all : null;\n', '  return all;\n')]),
    ('X4', 'killed', 'move all offered at zero or below', TRANSFER, RENDER, [('  const all = moveAllMinor(balances, fromId);\n', '  const all = fromId === null || balances === null ? null : balances.get(fromId) ?? null;\n')]),
    ('X5', 'killed', 'move all fills the amount as if typed', TRANSFER, RENDER, [('onPress={() => onKeypad(filledKeypad(moveAll))}', 'onPress={() => onKeypad({ ...filledKeypad(moveAll), fresh: false })}')]),
    ('X6', 'killed', 'the amount line masks what was typed', TRANSFER, RENDER, [('  const masked = hidden && isFilled(keypad);\n', '  const masked = hidden;\n')]),
    ('X7', 'killed', 'the amount line never masks a fill', TRANSFER, RENDER, [('  const masked = hidden && isFilled(keypad);\n', '  const masked = false;\n')]),
    ('X8', 'killed', 'the after line is the balance before the move', TRANSFER, RENDER, [('after={from === null ? null : after.from}', 'after={from === null ? null : balanceOf(from)}')]),
    ('X9', 'killed', 'the cards drawn without their materials', TRANSFER, RENDER, [('      {material === null ? null : <MaterialFill material={material} radius={18} />}\n', '      {null}\n')]),
    ('X10', 'killed', 'an archived wallet counts as in use, on a card and for Next', TRANSFER, RENDER, [('wallets.find((wallet) => wallet.id === id && !wallet.archived)', 'wallets.find((wallet) => wallet.id === id)')]),
    ('X11', 'killed', "a card's label leaves out the after line", TRANSFER, RENDER, [(", after === null ? null : t('add.after', { amount: say(after) })]", ']')]),
    ('X12', 'killed', 'a card says its balance in private mode', TRANSFER, RENDER, [("  const say = (minor: Minor) => (hidden ? t('common.amountHidden') : spokenMoney(minor, t));\n", '  const say = (minor: Minor) => spokenMoney(minor, t);\n')]),
    ('X13', 'killed', 'move all says its amount in private mode', TRANSFER, RENDER, [("accessibilityLabel={t('add.moveAll', { amount: hidden ? t('common.amountHidden') : spokenMoney(moveAll, t) })}", "accessibilityLabel={t('add.moveAll', { amount: spokenMoney(moveAll, t) })}")]),
    ('X14', 'killed', 'the from card opens the to step', TRANSFER, RENDER, [("onPress={() => onStep('from')}", "onPress={() => onStep('to')}")]),
    ('X15', 'killed', 'at AX5 a card does not stack', TRANSFER, RENDER, [("        flexDirection: large ? 'column' : 'row',\n", "        flexDirection: 'row',\n")]),
    ('X16', 'killed', 'at AX5 the swap stays on the seam', TRANSFER, RENDER, [("style={large ? { alignItems: 'center', paddingVertical: 8 } : { height: SEAM, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}", "style={{ height: SEAM, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}")]),
    ('X17', 'killed', 'a card under 84 pt', TRANSFER, RENDER, [('const CARD = 84;', 'const CARD = 40;')]),
    ('X18', 'killed', 'move all under 44 pt', TRANSFER, RENDER, [('              minHeight: 44,\n', '              minHeight: 36,\n')]),
    ('X19', 'killed', "the amount at the amount step's 58, not the board's 52", TRANSFER, RENDER, [('const AMOUNT = 52;', 'const AMOUNT = 58;')]),
    ('X20', 'killed', "the after line's words not drawn", TRANSFER, RENDER, [("              {beforeAfter === '' ? null : <WalletText role=\"caption\" style={{ color: quiet }}>{beforeAfter}</WalletText>}\n", '')]),
    ('X21', 'killed', "the swap on rh-transfer's 8 pt seam, over the cards' words", TRANSFER, RENDER, [('const SEAM = 22;', 'const SEAM = 8;')]),
    ('X22', 'killed', "Next reads the draft's ids, so an archived or unknown side goes on (the reviews' m1)", TRANSFER, RENDER, [('const [from, to] = [inUse(wallets, draft.fromWalletId), inUse(wallets, draft.toWalletId)];', 'const [from, to] = [draft.fromWalletId, draft.toWalletId];')]),
    ('X23', 'killed', "the seam's zIndex dropped: the to card draws over the swap button (the first review's n2)", TRANSFER, NODE, [("{ height: SEAM, alignItems: 'center', justifyContent: 'center', zIndex: 1 }", "{ height: SEAM, alignItems: 'center', justifyContent: 'center' }")]),
    ('X24', 'killed', "an after line below zero loses its minus (the second review's M6)", TRANSFER, RENDER, [('minor={after} sign="balance" size={13}', 'minor={after} sign="none" size={13}')]),
    ('X25', 'killed', "a balance below zero loses its minus (the second review's M7)", TRANSFER, RENDER, [('minor={balance} sign="balance" size={17}', 'minor={balance} sign="none" size={17}')]),
    ('X26', 'killed', "the amount being moved is not a live region (the first review's R7)", TRANSFER, RENDER, [("        <View {...POLITE_LIVE_REGION} style={{ alignSelf: 'stretch' }}>\n", "        <View style={{ alignSelf: 'stretch' }}>\n")]),
    # TransferFooter (TransferStep.tsx)
    ('F1', 'killed', 'Next takes one wallet on both sides', TRANSFER, RENDER, [('disabled={from === null || to === null || from === to}', 'disabled={from === null || to === null}')]),
    ('F2', 'killed', 'Next takes a side with no wallet', TRANSFER, RENDER, [('disabled={from === null || to === null || from === to}', 'disabled={from === to}')]),
    ('F3', 'killed', 'one wallet on both sides is never said', TRANSFER, RENDER, [("  const problem = from !== null && from === to ? tc('Choose two different wallets') : null;\n", '  const problem = null;\n')]),
    ('F4', 'killed', 'two empty sides said to be the same wallet', TRANSFER, RENDER, [('from !== null && from === to ?', 'from === to ?')]),
    ('F5', 'killed', 'Next goes back to the amount', TRANSFER, RENDER, [("onPress={() => onStep('confirm')}", "onPress={() => onStep('amount')}")]),
    ('F6', 'killed', 'the problem is not an alert', TRANSFER, RENDER, [('<WalletText testID="transfer-problem" role="label" accessibilityRole="alert" aria-live="polite"', '<WalletText testID="transfer-problem" role="label" aria-live="polite"')]),
    ('F7', 'killed', 'no note that a move is not spending', TRANSFER, RENDER, [("<WalletText role=\"caption\" tone=\"quiet\" style={{ flexShrink: 1, textAlign: 'center' }}>{t('add.transferNote')}</WalletText>", '{null}')]),
    ('F8', 'killed', "the one-wallet problem is never said on iOS (the reviews' m3 and M14)", TRANSFER, NODE, [('  useAnnouncement(problem);\n', '')]),
    # ConfirmStep.tsx (C7 to C11, the sentence's mask, are retired: R114 removes the mask)
    ('C1', 'killed', 'the title ignores the merchant', CONFIRM, RENDER, [(TITLE, '  return draft.note.trim() || category || t(trayTitleKey(draft.type));\n')]),
    ('C2', 'killed', 'the title ignores the note', CONFIRM, RENDER, [(TITLE, '  return draft.merchant.trim() || category || t(trayTitleKey(draft.type));\n')]),
    ('C3', 'killed', "the title ignores the category's name", CONFIRM, RENDER, [(TITLE, '  return draft.merchant.trim() || draft.note.trim() || t(trayTitleKey(draft.type));\n')]),
    ('C4', 'killed', "no title falls back to the tray's", CONFIRM, RENDER, [(TITLE, '  return draft.merchant.trim() || draft.note.trim() || category;\n')]),
    ('C5', 'killed', 'the amount masks what was typed', CONFIRM, RENDER, [('  const masked = hidden && isFilled(keypad);\n', '  const masked = hidden;\n')]),
    ('C6', 'killed', 'the amount never masks a fill', CONFIRM, RENDER, [('  const masked = hidden && isFilled(keypad);\n', '  const masked = false;\n')]),
    ('C12', 'killed', "Bun's line drawn with no sentence", CONFIRM, RENDER, [('{bunSentence === null ? null : (', '{false ? null : (')]),
    ('C13', 'killed', "income's amount in ink", CONFIRM, RENDER, [("color: type === 'income' ? colors.violet : colors.ink,", 'color: colors.ink,')]),
    ('C14', 'killed', "income's amount without its plus", CONFIRM, RENDER, [("walletMoneyText(minor, { sign: type === 'income' ? 'income' : 'none' })", "walletMoneyText(minor, { sign: 'none' })")]),
    ('C15', 'killed', "the tile ignores the category's own", CONFIRM, RENDER, [('{category !== undefined ? (', '{false ? (')]),
    ('C16', 'killed', "a move's tile without its mark", CONFIRM, RENDER, [("{type === 'transfer' ? <Glyph name=\"swap\" size={26} color={colors.ink} /> : null}", '{null}')]),
    ('C17', 'killed', 'every row opens the category pick', CONFIRM, RENDER, [('onPress={() => onStep(row.key)}', "onPress={() => onStep('category')}")]),
    ('C18', 'killed', "Bun's mark on every row", CONFIRM, RENDER, [('{row.guessed ? (', '{true ? (')]),
    ('C19', 'killed', "a guessed row's label leaves out Bun's mark", CONFIRM, RENDER, [(", row.guessed ? t('add.bunGuess') : null]", ']')]),
    ('C20', 'killed', 'an empty note asks for a wallet', CONFIRM, RENDER, [("row.key === 'note' ? t('add.addNote') : ", '')]),
    ('C21', 'killed', 'an empty category asks for a note', CONFIRM, RENDER, [("row.key === 'category' ? tc('Choose a category') : ", '')]),
    ('C22', 'killed', 'what to add drawn in ink', CONFIRM, RENDER, [("tone={empty ? 'quiet' : 'ink'}", 'tone="ink"')]),
    ('C23', 'killed', "a wallet row without the wallet's material", CONFIRM, RENDER, [('{walletId === null || empty ? null : (', '{true ? null : (')]),
    ('C24', 'killed', 'rows under 44 pt', CONFIRM, RENDER, [('        minHeight: 52,\n', '        minHeight: 40,\n')]),
    ('C25', 'killed', 'at AX5 a row does not stack', CONFIRM, RENDER, [("        flexDirection: large ? 'column' : 'row',\n", "        flexDirection: 'row',\n")]),
    ('C26', 'killed', 'at AX5 the summary does not stack', CONFIRM, RENDER, [("<View testID=\"confirm-summary\" style={{ flexDirection: large ? 'column' : 'row',", "<View testID=\"confirm-summary\" style={{ flexDirection: 'row',")]),
    ('C27', 'killed', "the amount at the board's 32, not the plan's 44", CONFIRM, RENDER, [('const AMOUNT = 44;', 'const AMOUNT = 32;')]),
    ('C28', 'killed', "the to row draws the from wallet's material", CONFIRM, RENDER, [("key === 'to' ? draft.toWalletId : null", "key === 'to' ? draft.fromWalletId : null")]),
    ('C29', 'killed', "in private mode Bun's sentence is quoted (the reviews' M1, R114)", CONFIRM, RENDER, [(BUN_LINE, "{t('add.bunReadFrom', { sentence: bunSentence })}")]),
    ('C30', 'killed', "outside private mode Bun's sentence is not quoted", CONFIRM, RENDER, [(BUN_LINE, "{t('add.bunReadHidden')}")]),
    ('C31', 'killed', "the wallet row draws the from wallet's material (the second review's M18)", CONFIRM, RENDER, [("key === 'wallet' ? draft.walletId : key === 'from'", "key === 'wallet' ? draft.fromWalletId : key === 'from'")]),
    ('C32', 'killed', "a merchant of spaces is the title (the first review's n1)", CONFIRM, RENDER, [(TITLE, '  return draft.merchant || draft.note.trim() || category || t(trayTitleKey(draft.type));\n')]),
    ('C33', 'killed', 'a note of spaces is the title', CONFIRM, RENDER, [(TITLE, '  return draft.merchant.trim() || draft.note || category || t(trayTitleKey(draft.type));\n')]),
    # PickSteps.tsx
    ('P1', 'killed', 'no step is a pick, so the host never learns where a pick goes back to', PICKS, RENDER, [('  return PICKS.has(step);\n', '  return false;\n')]),
    ('P2', 'killed', 'the wallet pick always goes back to confirm', PICKS, RENDER, [('              onDraft(picked(wallet.id));\n              onStep(back);\n', "              onDraft(picked(wallet.id));\n              onStep('confirm');\n")]),
    ('P3', 'killed', 'the category pick ignores the ranking', PICKS, RENDER, [('[...ranking[type].top, ...ranking[type].rest]', '[]')]),
    ('P4', 'killed', 'archived categories offered', PICKS, RENDER, [('categories.filter((category) => category.type === type && !category.archived)', 'categories.filter((category) => category.type === type)')]),
    ('P5', 'killed', 'categories the ranking does not hold left out', PICKS, RENDER, [(', ...open.filter((category) => !placed.has(category.id))]', ']')]),
    ('P6', 'killed', "another type's categories offered", PICKS, RENDER, [('categories.filter((category) => category.type === type && !category.archived)', 'categories.filter((category) => !category.archived)')]),
    ('P7', 'killed', 'the chosen category not checked', PICKS, RENDER, [('        const checked = category.id === chosen;\n', '        const checked = false;\n')]),
    ('P8', 'killed', "a pick sets spending's category whatever the type", PICKS, RENDER, [('categoryByType: { ...draft.categoryByType, [type]: category.id }', 'categoryByType: { ...draft.categoryByType, expense: category.id }')]),
    ('P9', 'killed', 'a category pick does not tick', PICKS, RENDER, [("              playHaptic('chipPick');\n", '')]),
    ('P10', 'killed', 'the category pick does not go back', PICKS, RENDER, [("              onDraft({ ...draft, categoryByType: { ...draft.categoryByType, [type]: category.id } });\n              onStep('confirm');\n", '              onDraft({ ...draft, categoryByType: { ...draft.categoryByType, [type]: category.id } });\n')]),
    ('P11', 'killed', 'the chosen tile not ringed', PICKS, RENDER, [("borderColor: checked ? colors.violet : 'transparent' }}>", "borderColor: 'transparent' }}>")]),
    ('P12', 'killed', "the chosen category's name not bold", PICKS, RENDER, [("fontWeight: checked ? '700' : '400'", "fontWeight: '400'")]),
    ('P13', 'killed', 'at AX5 the grid stays four across', PICKS, RENDER, [("width: large ? '50%' : '25%',", "width: '25%',")]),
    ('P14', 'killed', 'archived wallets offered', PICKS, RENDER, [('{wallets.filter((wallet) => !wallet.archived).map((wallet) => {', '{wallets.map((wallet) => {')]),
    ('P15', 'killed', 'picking the to wallet as from does not swap', PICKS, RENDER, [("    if (role === 'from') return id === draft.toWalletId ? { ...draft, fromWalletId: id, toWalletId: draft.fromWalletId } : { ...draft, fromWalletId: id };\n", "    if (role === 'from') return { ...draft, fromWalletId: id };\n")]),
    ('P16', 'killed', 'picking the from wallet as to does not swap', PICKS, RENDER, [('    return id === draft.fromWalletId ? { ...draft, toWalletId: id, fromWalletId: draft.toWalletId } : { ...draft, toWalletId: id };\n', '    return { ...draft, toWalletId: id };\n')]),
    ('P17', 'killed', "the from and to picks check each other's wallet", PICKS, RENDER, [("const chosen = role === 'wallet' ? draft.walletId : role === 'from' ? draft.fromWalletId : draft.toWalletId;", "const chosen = role === 'wallet' ? draft.walletId : role === 'from' ? draft.toWalletId : draft.fromWalletId;")]),
    ('P18', 'killed', 'the wallet pick says balances in private mode', PICKS, RENDER, [("${hidden ? t('common.amountHidden') : spokenMoney(balance, t)}", '${spokenMoney(balance, t)}')]),
    ('P19', 'killed', 'every wallet pick named กระเป๋า', PICKS, RENDER, [("const group = role === 'wallet' ? 'add.rowWallet' : role === 'from' ? 'add.rowFrom' : 'add.rowTo';", "const group = 'add.rowWallet';")]),
    ('P20', 'killed', 'at AX5 a wallet row does not stack', PICKS, RENDER, [("              flexDirection: large ? 'column' : 'row',\n", "              flexDirection: 'row',\n")]),
    ('P21', 'killed', 'wallet rows under 44 pt', PICKS, RENDER, [('              minHeight: 56,\n', '              minHeight: 40,\n')]),
    ('P22', 'killed', "the date passes today (the plan's mutant)", PICKS, RENDER, [("disabled={!canStepForward(day, today)} onPress={() => change(stepDay(day, 1, { today, earliest }))}", "disabled={false} onPress={() => change(stepDay(day, 1, { today: '9999-12-31', earliest }))}")]),
    ('P23', 'killed', "the date goes before the wallet's start", PICKS, RENDER, [("disabled={!canStepBack(day, earliest)} onPress={() => change(stepDay(day, -1, { today, earliest }))}", 'disabled={!canStepBack(day)} onPress={() => change(stepDay(day, -1, { today }))}')]),
    ('P24', 'killed', 'a draft dated before the start opens before it', PICKS, RENDER, [(OPENS_ON, 'useState(() => (draft.occurredOn > today ? today : draft.occurredOn))')]),
    ('P25', 'killed', 'a day change does not tick', PICKS, RENDER, [("    playHaptic('dateStep');\n", '')]),
    ('P26', 'killed', 'วันนี้ offered on today', PICKS, RENDER, [('{day === today ? null : <TextLink', '{false ? null : <TextLink')]),
    ('P27', 'killed', 'วันนี้ does nothing', PICKS, RENDER, [('onPress={() => change(today)}', 'onPress={() => undefined}')]),
    ('P28', 'killed', 'Done does not keep the day', PICKS, RENDER, [('          onDraft({ ...draft, occurredOn: day });\n', '          onDraft(draft);\n')]),
    ('P29', 'killed', 'a day change written at once, so back keeps it', PICKS, RENDER, [('    setDay(next);\n', '    setDay(next);\n    onDraft({ ...draft, occurredOn: next });\n')]),
    ('P30', 'killed', 'the note written at once, so back keeps it', PICKS, RENDER, [('onChangeText={setNote}', 'onChangeText={(next) => { setNote(next); onDraft({ ...draft, note: next }); }}')]),
    ('P31', 'killed', 'Done does not keep the note', PICKS, RENDER, [('          onDraft({ ...draft, note });\n', '          onDraft(draft);\n')]),
    ('P32', 'killed', 'notes past 500 characters', PICKS, RENDER, [('        maxLength={NOTE_MAX_CHARS}\n', '')]),
    ('P33', 'killed', 'day arrows under 44 pt', PICKS, RENDER, [('style={{ width: 44, height: 44, borderRadius: 22,', 'style={{ width: 36, height: 36, borderRadius: 18,')]),
    ('P34', 'killed', "the date pick's Done does not go back", PICKS, RENDER, [("          onDraft({ ...draft, occurredOn: day });\n          onStep('confirm');\n", '          onDraft({ ...draft, occurredOn: day });\n')]),
    ('P35', 'killed', "the note pick's Done does not go back", PICKS, RENDER, [("          onDraft({ ...draft, note });\n          onStep('confirm');\n", '          onDraft({ ...draft, note });\n')]),
    ('P36', 'killed', "isPickStep leaves out the wallet pick, so the amount chip's pick goes back to a stale step (the first review's R1)", PICKS, RENDER, [(PICK_SET, "new Set<AddStep>(['category', 'from', 'to', 'date', 'note'])")]),
    ('P37', 'killed', "isPickStep leaves out the to pick (the first review's R2)", PICKS, RENDER, [(PICK_SET, "new Set<AddStep>(['category', 'wallet', 'from', 'date', 'note'])")]),
    ('P38', 'killed', "isPickStep counts confirm and the transfer step as picks (the first review's R3)", PICKS, RENDER, [(PICK_SET, "new Set<AddStep>(['category', 'wallet', 'from', 'to', 'date', 'note', 'confirm', 'transfer'])")]),
    ('P39', 'killed', "a draft dated after today opens after it (the second review's n1)", PICKS, RENDER, [(OPENS_ON, 'useState(() => (earliest !== undefined && draft.occurredOn < earliest ? earliest : draft.occurredOn))')]),
    ('P40', 'killed', "the chosen wallet's radio without its dot (the first review's n3)", PICKS, RENDER, [('{checked ? <View testID="pick-wallet-dot" style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ink }} /> : null}', '{null}')]),
    ('P41', 'killed', "the wallet pick reads balances with none known, offline (the second review's M8)", PICKS, RENDER, [('const balance = balances === null ? null : balances.get(wallet.id) ?? null;', 'const balance = balances!.get(wallet.id) ?? null;')]),
    ('P42', 'killed', "the day being picked is not a live region (the first review's R8)", PICKS, RENDER, [("        <View {...POLITE_LIVE_REGION} style={{ flex: 1, alignItems: 'center', gap: 2 }}>\n", "        <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>\n")]),
    # copy.ts
    ('K1', 'killed', 'the after line reads หลัง', COPY, RENDER, [("'add.after': { th: 'หลังโอน {amount}'", "'add.after': { th: 'หลัง {amount}'")]),
    ('K2', 'killed', "Bun's mark reads เดา", COPY, RENDER, [("'add.bunGuess': { th: 'บันเดา'", "'add.bunGuess': { th: 'เดา'")]),
    ('K3', 'killed', 'the empty note reads โน้ต', COPY, RENDER, [("'add.addNote': { th: 'เพิ่มโน้ต'", "'add.addNote': { th: 'โน้ต'")]),
    ('K4', 'killed', 'swap reads สลับ', COPY, RENDER, [("'add.swap': { th: 'สลับกระเป๋าเงิน'", "'add.swap': { th: 'สลับ'")]),
    ('K5', 'killed', "the to side reads the board's ไปยัง, not the plan's ไป", COPY, RENDER, [("'add.rowTo': { th: 'ไป'", "'add.rowTo': { th: 'ไปยัง'")]),
    ('K6', 'killed', 'the transfer note loses its second half', COPY, RENDER, [("'add.transferNote': { th: 'โอนระหว่างกระเป๋าของคุณเอง ไม่นับเป็นรายจ่าย'", "'add.transferNote': { th: 'โอนระหว่างกระเป๋าของคุณเอง'")]),
    ('K7', 'killed', "the private line says only บันอ่านจาก, as if a quote followed", COPY, RENDER, [("'add.bunReadHidden': { th: 'บันอ่านจากที่คุณบอก'", "'add.bunReadHidden': { th: 'บันอ่านจาก'")]),
    # addSections.tsx and addStepsSection.tsx
    ('S1', 'killed', 'the transfer section under another id', SECTIONS, RENDER, [("    id: 'bw-tray-transfer',\n", "    id: 'bw-tray-move',\n")]),
    ('S2', 'killed', 'the transfer section with no balances', HOST, RENDER, [('    middle = <TransferStep {...props} wallets={wallets} balances={SAMPLE_BALANCES} />;\n', '    middle = <TransferStep {...props} wallets={wallets} balances={null} />;\n')]),
    ('S3', 'killed', 'the Bun section without what Bun read', SECTIONS, RENDER, [("merchant: 'sample.chickenRice', bunSaid: true,", "merchant: 'sample.chickenRice', bunSaid: false,")]),
    ('S4', 'killed', 'the confirm section draws no Save', HOST, RENDER, [("    footer = <PrimaryButton label={t('common.save')} onPress={() => undefined} />;\n", '    footer = undefined;\n')]),
    ('S5', 'killed', "the section keeps Bun's guess after a change", HOST, RENDER, [('      setGuessed((now) => stillGuessed(now, draft, next));\n', '')]),
    ('S6', 'killed', "cash on another material than rh-transfer's cream paper", HOST, RENDER, [("const CASH_ID = 'bw-add-cash-wallet';", "const CASH_ID = 'bw-add-cash';")]),
    ('S7', 'killed', 'the section forgets which step opened a pick', HOST, RENDER, [('      if (isPickStep(next)) setBack(step);\n', '')]),
    ('S8', 'killed', "the steps loaded eagerly into the wallet's section list (the first review's n4)", SECTIONS, NODE, [("const StepsTray = lazy(() => import('./addStepsSection'));\n", "import StepsTray from './addStepsSection';\n")]),
    ('S9', 'killed', "the lazy section reads no running mark, so the catalogue's suites would not wait", SECTIONS, NODE, [('<Suspense fallback={<View testID="catalogue-screen-running" style={{ flex: 1 }} />}>', '<Suspense fallback={<View style={{ flex: 1 }} />}>')]),
]

SUMMARY = re.compile(r'^\s*Tests  (.+?)\s*$', re.M)
FAILED = re.compile(r'^\s*×\s+\S+\s+>\s+(.+?)\s+\d+ms\s*$', re.M)
NODE_COUNT = re.compile(r'^ℹ (tests|pass|fail) (\d+)', re.M)
NODE_FAILED = re.compile(r'^✖ (.+?) \([\d.]+ms\)$', re.M)


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def main():
    root, logs = sys.argv[1], sys.argv[2]
    rest = sys.argv[3:]
    check = '--check' in rest
    wanted = {arg for arg in rest if arg != '--check'}
    os.makedirs(logs, exist_ok=True)
    app = os.path.join(root, 'apps/app')
    unexpected = 0
    killed = survived = 0
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
                print(f'{ident} SETUP ERROR: {count} matches for {old!r} in {rel}', flush=True)
                sys.exit(2)
            text = text.replace(old, new)
        if check:
            print(f'{ident} ok [{os.path.basename(rel)}]', flush=True)
            continue
        try:
            with open(path, 'wb') as handle:
                handle.write(text.encode('utf-8'))
            run = subprocess.run(suite, cwd=app, capture_output=True, text=True, timeout=900)
            output = run.stdout + run.stderr
        finally:
            with open(path, 'wb') as handle:
                handle.write(original)
        after = sha(path)
        with open(os.path.join(logs, f'{ident}.log'), 'w', encoding='utf-8') as handle:
            handle.write(output)
        if suite is NODE:
            totals = dict(NODE_COUNT.findall(output))
            summary = f"{totals.get('fail', '?')} failed | {totals.get('pass', '?')} passed ({totals.get('tests', '?')})"
            failed = NODE_FAILED.findall(output)
            where = 'addStepsNative.test.ts'
        else:
            found = SUMMARY.findall(output)
            summary = found[-1] if found else 'no summary'
            failed = FAILED.findall(output)
            where = 'AddSteps.render.test.tsx'
        assertions = output.count('AssertionError')
        outcome = 'killed' if run.returncode != 0 else 'survived'
        if outcome == 'killed':
            killed += 1
        else:
            survived += 1
        mark = 'KILLED' if outcome == 'killed' else 'SURVIVED' + (' (equivalent)' if expect == 'survived' else '')
        first = f'; first failing: "{failed[0].strip()}"' if failed else ''
        restored = 'restored sha256 equal' if after == before else f'RESTORE MISMATCH {after}'
        print(f'{ident} {mark}: {description} [{os.path.basename(rel)}; {where}] -> Tests {summary}{first}; AssertionError x{assertions}; {restored}', flush=True)
        if outcome != expect or after != before:
            unexpected += 1
    if not check:
        print(f'{killed} killed, {survived} survived, {unexpected} not as expected')
    sys.exit(1 if unexpected else 0)


if __name__ == '__main__':
    main()

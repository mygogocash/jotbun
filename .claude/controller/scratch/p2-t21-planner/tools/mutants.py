#!/usr/bin/env python3
"""P2-T21 mutation check. Usage: python3 -I mutants.py <tree root> <log dir> [--check] [ids...]

Applies each mutant alone to the tree, runs its test file (NewWallet for the
flow, the fields and the new-wallet copy; WalletEdit for the edit screen, the
correction tray and the edit copy; NewWallet's sections case for the
catalogue; PlanningRoutes for the two routes; WalletsList for the list's add
tile; walletCommands for the hook; useWalletMotion for the drop), restores
the file byte for byte (sha256 checked) and prints one line per mutant. Exits
0 only when every mutant ends as expected. --check only confirms that each
mutant's text is in its file exactly once.
"""
import hashlib
import os
import re
import subprocess
import sys

W = 'apps/app/src/wallet/wallets/'
FLOW = W + 'NewWalletFlow.tsx'
FIELDS = W + 'WalletFields.tsx'
EDIT = W + 'WalletEditScreen.tsx'
TRAY = W + 'CorrectionTray.tsx'
COPY = W + 'copy.ts'
LIST = W + 'WalletsListScreen.tsx'
SECTIONS = 'apps/app/src/dev/catalogue/wallet/walletListSections.tsx'
NEW_ROUTE = 'apps/app/app/spend/wallet/new.tsx'
EDIT_ROUTE = 'apps/app/app/spend/wallet/[id]/edit.tsx'
HOOK = 'apps/app/src/screens/redesign/planning/walletCommands.ts'
MOTION = 'apps/app/src/wallet/motion/useWalletMotion.ts'


def render(path, name=None):
    command = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', path]
    return command + (['-t', name] if name else [])


NEWT = render('src/wallet/wallets/NewWallet.render.test.tsx')
EDITT = render('src/wallet/wallets/WalletEdit.render.test.tsx')
SECTIONST = render('src/wallet/wallets/NewWallet.render.test.tsx', "sections come right after")
ROUTES = render('src/screens/redesign/planning/PlanningRoutes.render.test.tsx')
LISTT = render('src/wallet/wallets/WalletsList.render.test.tsx')
HOOKT = render('src/screens/redesign/planning/walletCommands.render.test.tsx')
MOTIONT = render('src/wallet/motion/useWalletMotion.render.test.tsx')

KEEP_LOOK = "        void setLook(command.input.id, { kind: look.kind, material: look.material, face: look.face });\n"
SENT = "      const outcome = await commands.send(command, track);\n      if (outcome.kind === 'done') {\n        // Kept only now the wallet is saved, as a fresh object (wallet-looks-unstored's review, n3).\n"
LEAVE = "    if (router.canGoBack()) router.back();\n    else router.replace(destination);\n"
FACE_RING = "                      boxShadow: checked ? chosenRing(colors) : undefined,\n"
MATERIAL_STYLE = "style={{ width: 56, height: 44, borderRadius: 11, boxShadow: checked ? chosenRing(colors) : undefined, opacity: locked ? 0.4 : 1 }}"
ASK = "    if (reason === null && correctionNeedsReason(wallet, fields, hasRecords)) {\n"
CONFLICT = "        onNotice(tc('This wallet changed on another device.'));\n        onChanged();\n"
REFUSED_ARCHIVE = "        setArchiveRefused(true);\n        onChanged();\n"
UNCHANGED = "    if (built.unchanged) {\n      onBack();\n      return;\n    }\n"
LEGACY = '  if (isLegacySpendEnabled()) return <Redirect href="/spend" />;\n'
AREA = '  if (!isRedesignEnabled(\'wallet\')) return <Redirect href="/spend/wallets" />;\n'
EMIT = "    if (command.kind === 'create' && outcome.kind === 'done') {\n"
GUARDED = "      try {\n        trackWalletAdded(track ?? {});\n      } catch {\n        // The wallet is saved whatever the emitter does.\n      }\n"

# (id, expectation, description, file, test command, [(old, new), ...]); each old must occur exactly once.
MUTANTS = [
    # NewWalletFlow.tsx: NewWallet.render.test.tsx
    ('N1', 'killed', "the look kept before the acknowledgement (the plan's mutant)", FLOW, NEWT, [(SENT + KEEP_LOOK, KEEP_LOOK + SENT)]),
    ('N2', 'killed', 'the look never kept', FLOW, NEWT, [(KEEP_LOOK, '')]),
    ('N3', 'killed', 'two presses send two creates', FLOW, NEWT, [("  function add() {\n    if (held.current) return;\n", "  function add() {\n")]),
    ('N4', 'killed', 'presses held by React state, not a ref', FLOW, NEWT, [("  function add() {\n    if (held.current) return;\n", "  function add() {\n    if (locked) return;\n")]),
    ('N5', 'killed', 'a press held for good once answered', FLOW, NEWT, [("    } finally {\n      held.current = false;\n    }\n", "    } finally {\n      void 0;\n    }\n")]),
    ('N6', 'killed', 'Try again sends another command', FLOW, NEWT, [('    void send(pending.command, pending.track);\n', "    void send({ ...pending.command, slot: 'again' }, pending.track);\n")]),
    ('N7', 'killed', 'Try again offered while blocked', FLOW, NEWT, [('{unconfirmed !== null && !unconfirmed.blocked ? (', '{unconfirmed !== null ? (')]),
    ('N8', 'killed', 'an unconfirmed create not held', FLOW, NEWT, [("  const locked = sending.phase === 'saving' || sending.phase === 'unconfirmed';\n", "  const locked = sending.phase === 'saving';\n")]),
    ('N9', 'killed', 'a create waiting on an update not held', FLOW, NEWT, [('disabled={locked || stuck} onPress={add}', 'disabled={locked} onPress={add}')]),
    ('N10', 'killed', "a refusal's fields not on its fields", FLOW, NEWT, [('        setErrors(outcome.fields);\n', '')]),
    ('N11', 'killed', 'a refusal naming fields worded as the hook words it', FLOW, NEWT, [("message: named ? tc('Check the highlighted fields.') : outcome.message ?? tc('This entry could not be saved.')", "message: outcome.message ?? tc('This entry could not be saved.')")]),
    ('N12', 'killed', "a kind does not start on its tile's material", FLOW, NEWT, [("setChosenLook({ kind, material: KIND_MATERIAL[kind], face: 'smile' });", "setChosenLook({ kind, material: 'silk', face: 'smile' });")]),
    ('N13', 'killed', 'a kind does not start with Bun smiling', FLOW, NEWT, [("setChosenLook({ kind, material: KIND_MATERIAL[kind], face: 'smile' });", "setChosenLook({ kind, material: KIND_MATERIAL[kind], face: 'wow' });")]),
    ('N14', 'killed', "the kinds out of the board's order", FLOW, NEWT, [('        {WALLET_KINDS.map((kind, index) => {\n', '        {[...WALLET_KINDS].reverse().map((kind, index) => {\n')]),
    ('N15', 'killed', 'the travel card without BTS / MRT', FLOW, NEWT, [("const name = kind === 'transit' ? `${t(KIND_WORDS[kind].name)} ${t('card.kindTransit')}` : t(KIND_WORDS[kind].name);", 'const name = t(KIND_WORDS[kind].name);')]),
    ('N16', 'killed', 'with no account open, the chosen look shown though it cannot be kept', FLOW, NEWT, [('  const shown = accountId === null ? derivedLook(walletId) : look;\n', '  const shown = look;\n')]),
    ('N17', 'killed', 'wallet_added without the kind', FLOW, NEWT, [('{ walletType: look.kind, material: shown.material, bunFace: shown.face }', '{ walletType: null, material: shown.material, bunFace: shown.face }')]),
    ('N18', 'killed', 'the ceremony always goes home', FLOW, NEWT, [('onDone={() => router.dismissTo(destination)}', "onDone={() => router.dismissTo('/spend')}")]),
    ('N19', 'killed', 'the ceremony pushes its destination over the flow', FLOW, NEWT, [('onDone={() => router.dismissTo(destination)}', 'onDone={() => router.replace(destination)}')]),
    ('N20', 'killed', 'back on the kinds always replaces', FLOW, NEWT, [(LEAVE, '    router.replace(destination);\n')]),
    ('N21', 'killed', 'back on the fields leaves the flow', FLOW, NEWT, [('onPress: () => setStep(1), disabled: locked', 'onPress: leave, disabled: locked')]),
    ('N22', 'killed', 'walletAdded not played', FLOW, NEWT, [('    if (haptic !== null) playHaptic(haptic);\n', '')]),
    ('N23', 'killed', 'the card does not drop in', FLOW, NEWT, [('<Animated.View testID="new-wallet-card" entering={entering}>', '<Animated.View testID="new-wallet-card">')]),
    ('N24', 'killed', 'the drop ignores Reduce Motion', FLOW, NEWT, [('useState(() => walletAddedEntering(reduced))', 'useState(() => walletAddedEntering(false))')]),
    ('N25', 'killed', 'the ceremony is not announced', FLOW, NEWT, [('testID="new-wallet-added" {...POLITE_LIVE_REGION}', 'testID="new-wallet-added"')]),
    ('N26', 'killed', 'the new card says only its name', FLOW, NEWT, [('accessibilityLabel={walletCardWords(card, look, hidden, t).spoken}', 'accessibilityLabel={input.name}')]),
    ('N27', 'killed', 'the new card says its amount in private mode', FLOW, NEWT, [('walletCardWords(card, look, hidden, t)', 'walletCardWords(card, look, false, t)')]),
    ('N28', 'killed', 'the typed opening balance not sent', FLOW, NEWT, [("  const current: WalletForm = { ...form, openingMinor: typed.ok ? typed.minor : '' };\n", "  const current: WalletForm = { ...form, openingMinor: '' };\n")]),
    ('N29', 'killed', 'tracking not from today', FLOW, NEWT, [('useState<WalletForm>(() => newWalletForm(today))', "useState<WalletForm>(() => newWalletForm('2026-10-01'))")]),
    ('N30', 'killed', "typing the name keeps its problem", FLOW, NEWT, [("          setForm(next);\n          clear('name');\n", '          setForm(next);\n')]),
    ('N31', 'killed', "a key keeps the opening balance's problem", FLOW, NEWT, [("          setKeypad(next);\n          clear('opening_minor');\n", '          setKeypad(next);\n')]),
    ('N32', 'killed', 'every step says step 1', FLOW, NEWT, [("{t('wallets.newStep', { n: step })}", "{t('wallets.newStep', { n: 1 })}")]),
    # WalletFields.tsx: NewWallet.render.test.tsx (the edit file where it says so)
    ('F1', 'killed', 'the look offered with no account open', FIELDS, NEWT, [('      {accountId === null ? null : (\n', '      {false ? null : (\n')]),
    ('F2', 'killed', 'a face press changes nothing', FIELDS, NEWT, [('onPress={() => onLook({ ...look, face })}', 'onPress={() => onLook(look)}')]),
    ('F3', 'killed', 'a material press changes nothing', FIELDS, NEWT, [('onPress={() => onLook({ ...look, material })}', 'onPress={() => onLook(look)}')]),
    ('F4', 'killed', 'the chosen face not the one checked', FIELDS, NEWT, [('                const checked = face === look.face;\n', "                const checked = face === 'smile';\n")]),
    ('F5', 'killed', 'the chosen material not the one checked', FIELDS, NEWT, [('                const checked = material === look.material;\n', "                const checked = material === 'silk';\n")]),
    ('F6', 'killed', 'the chosen material not ringed', FIELDS, NEWT, [(MATERIAL_STYLE, 'style={{ width: 56, height: 44, borderRadius: 11, opacity: locked ? 0.4 : 1 }}')]),
    ('F7', 'killed', 'every face ringed', FIELDS, NEWT, [(FACE_RING, '                      boxShadow: chosenRing(colors),\n')]),
    ('F8', 'killed', 'faces at 44 pt, not 48', FIELDS, NEWT, [('                      width: 48,\n                      height: 48,\n', '                      width: 44,\n                      height: 44,\n')]),
    ('F9', 'killed', 'materials at 44 × 44, not 56 × 44', FIELDS, NEWT, [('style={{ width: 56, height: 44,', 'style={{ width: 44, height: 44,')]),
    ('F10', 'killed', 'the name editable while held', FIELDS, NEWT, [('            editable={!locked}\n', '')]),
    ('F11', 'killed', 'the keys pressable while held', FIELDS, EDITT, [('<WalletKeypad keypad={keypad} onKeypad={onKeypad} disabled={locked} />', '<WalletKeypad keypad={keypad} onKeypad={onKeypad} />')]),
    ('F12', 'killed', 'the preview says its amount in private mode', FIELDS, NEWT, [("  const said = hidden ? t('common.amountHidden') : spokenMoney(preview.balanceMinor, t);\n", '  const said = spokenMoney(preview.balanceMinor, t);\n')]),
    ('F13', 'killed', 'the preview not one image', FIELDS, NEWT, [('<View testID="wallet-preview" accessible accessibilityRole="image" accessibilityLabel={previewLabel}>', '<View testID="wallet-preview" accessible accessibilityLabel={previewLabel}>')]),
    ('F14', 'killed', 'what the person types masked in private mode', FIELDS, NEWT, [('  const masked = hidden && isFilled(keypad);\n', '  const masked = hidden;\n')]),
    ('F15', 'killed', "the stored opening balance shown in private mode", FIELDS, EDITT, [('  const masked = hidden && isFilled(keypad);\n', '  const masked = false;\n')]),
    ('F16', 'killed', "the keypad's refusal not said", FIELDS, NEWT, [("  const openingProblem = keypad.problem === 'too_large' ? tc(TOO_LARGE) : errors.opening_minor ?? null;\n", '  const openingProblem = errors.opening_minor ?? null;\n')]),
    ('F17', 'killed', 'the masked opening balance says its amount', FIELDS, EDITT, [("${masked ? t('common.amountHidden') : spokenMoney(typed.ok ? typed.minor : '0', t)}", "${spokenMoney(typed.ok ? typed.minor : '0', t)}")]),
    ('F18', 'killed', 'tracking always says today', FIELDS, EDITT, [('dayLabel(form.trackingStart, today, locale)', 'dayLabel(today, today, locale)')]),
    ('F19', 'killed', "the name's problem not shown", FIELDS, NEWT, [('        {errors.name ? <WalletText', '        {false ? <WalletText')]),
    ('F20', 'killed', "a missing name's gap kept in the preview's words", FIELDS, NEWT, [(".replace(/\\s+/g, ' ').trim();\n", ';\n')]),
    # WalletEditScreen.tsx: WalletEdit.render.test.tsx
    ('E1', 'killed', "archive offered at a non-zero balance (the plan's mutant)", EDIT, EDITT, [("      {advice.kind === 'can_archive' ? (\n", "      {advice.kind !== 'archived' ? (\n")]),
    ('E2', 'killed', 'a correction sent without asking why', EDIT, EDITT, [(ASK, '    if (false) {\n')]),
    ('E3', 'killed', 'a rename asks why too', EDIT, EDITT, [(ASK, '    if (reason === null && hasRecords !== false) {\n')]),
    ('E4', 'killed', 'entries not yet known counted as none', EDIT, EDITT, [("  const hasRecords: HasRecords = records.state === 'ready' ? records.data : null;\n", "  const hasRecords: HasRecords = records.state === 'ready' ? records.data : false;\n")]),
    ('E5', 'killed', 'the reason chosen not sent with the correction', EDIT, EDITT, [('    setForm((previous) => ({ ...previous, reason }));\n    save(reason);\n', '    setForm((previous) => ({ ...previous, reason }));\n    save();\n')]),
    ('E6', 'killed', 'closing the tray sends the correction', EDIT, EDITT, [("<CorrectionTray visible={asking} onClose={() => setAsking(false)} onReason={answer} />", "<CorrectionTray visible={asking} onClose={() => answer('entry_error')} onReason={answer} />")]),
    ('E7', 'killed', "Jotbun's own question for the reason ignored", EDIT, EDITT, [("        setSending({ phase: 'idle' });\n        setAsking(true);\n", "        setSending({ phase: 'idle' });\n")]),
    ('E8', 'killed', 'two presses on บันทึก send two updates', EDIT, EDITT, [('  function save(reason: WalletCorrectionReason | null = form.reason) {\n    if (held.current) return;\n', '  function save(reason: WalletCorrectionReason | null = form.reason) {\n')]),
    ('E9', 'killed', 'บันทึก held by React state, not a ref', EDIT, EDITT, [('  function save(reason: WalletCorrectionReason | null = form.reason) {\n    if (held.current) return;\n', '  function save(reason: WalletCorrectionReason | null = form.reason) {\n    if (locked) return;\n')]),
    ('E10', 'killed', 'nothing changed is still sent', EDIT, EDITT, [(UNCHANGED, '')]),
    ('E11', 'killed', 'a saved edit stays', EDIT, EDITT, [('        else onBack();\n', '')]),
    ('E12', 'killed', 'an archived wallet goes back, not to the list', EDIT, EDITT, [("        if (command.kind === 'archive') onArchived();\n        else onBack();\n", '        onBack();\n')]),
    ('E13', 'killed', 'a conflict not read again', EDIT, EDITT, [(CONFLICT, "        onNotice(tc('This wallet changed on another device.'));\n")]),
    ('E14', 'killed', 'a conflict not said', EDIT, EDITT, [(CONFLICT, '        onChanged();\n')]),
    ('E15', 'killed', 'the form keeps what was typed over a newer version', EDIT, EDITT, [('        key={`${wallet.id}:${wallet.version}`}\n', '        key={wallet.id}\n')]),
    ('E16', 'killed', 'a refused archive not read again', EDIT, EDITT, [(REFUSED_ARCHIVE, '        setArchiveRefused(true);\n')]),
    ('E17', 'killed', 'a refused archive not said', EDIT, EDITT, [(REFUSED_ARCHIVE, '        onChanged();\n')]),
    ('E18', 'killed', 'an unconfirmed save not held', EDIT, EDITT, [("  const locked = sending.phase === 'saving' || sending.phase === 'unconfirmed';\n", "  const locked = sending.phase === 'saving';\n")]),
    ('E19', 'killed', 'Try again sends another command', EDIT, EDITT, [('    void send(command);\n  };\n', "    void send({ ...command, slot: 'again' });\n  };\n")]),
    ('E20', 'killed', 'Try again offered while blocked', EDIT, EDITT, [("{sending.phase === 'unconfirmed' && !sending.blocked ? <TextLink", "{sending.phase === 'unconfirmed' ? <TextLink")]),
    ('E21', 'killed', 'a refusal naming a field worded as the hook words it', EDIT, EDITT, [("message: named ? tc('Check the highlighted fields.') : outcome.message ?? tc('This entry could not be saved.')", "message: outcome.message ?? tc('This entry could not be saved.')")]),
    ('E22', 'killed', 'a save waiting on an update not held', EDIT, EDITT, [('disabled={locked || stuck} onPress={() => save()}', 'disabled={locked} onPress={() => save()}')]),
    ('E23', 'killed', 'the entries note shown with none', EDIT, EDITT, [('        {hasRecords === true ? <WalletText testID="wallet-has-records"', '        {hasRecords !== false ? <WalletText testID="wallet-has-records"')]),
    ('E24', 'killed', 'below zero said as money held', EDIT, EDITT, [("below={advice.kind === 'below_zero'}", 'below={false}')]),
    ('E25', 'killed', 'below zero said with its minus', EDIT, EDITT, [('  const size = below ? balanceMinor.slice(1) : balanceMinor;\n', '  const size = balanceMinor;\n')]),
    ('E26', 'killed', 'the archive line says its amount in private mode', EDIT, EDITT, [("amount: hidden ? t('common.amountHidden') : spokenMoney(size, t)", 'amount: spokenMoney(size, t)')]),
    ('E27', 'killed', 'an archived wallet edited', EDIT, EDITT, [('loaded.data.find((each) => each.id === walletId && !each.archived)', 'loaded.data.find((each) => each.id === walletId)')]),
    ('E28', 'killed', "a load problem's Try again reads nothing", EDIT, EDITT, [('<LoadProblem error={loaded.error} onRetry={loaded.reload} />', '<LoadProblem error={loaded.error} onRetry={() => undefined} />')]),
    ('E29', 'killed', 'a look change needs a command', EDIT, EDITT, [('onLook={(next) => void setLook(wallet.id, { kind: next.kind, material: next.material, face: next.face })}', 'onLook={() => undefined}')]),
    ('E30', 'killed', "the preview ignores what the wallet has spent", EDIT, EDITT, [('  const preview = walletPreview(current, wallet);\n', '  const preview = walletPreview(current);\n')]),
    ('E31', 'killed', 'the opening balance starts empty', EDIT, EDITT, [('useState<KeypadState>(() => filledKeypad(wallet.opening_minor))', "useState<KeypadState>(() => filledKeypad('0'))")]),
    # CorrectionTray.tsx: WalletEdit.render.test.tsx
    ('T1', 'killed', "the reasons out of today's order", TRAY, EDITT, [('        {CORRECTION_REASONS.map((reason) => (\n', '        {[...CORRECTION_REASONS].reverse().map((reason) => (\n')]),
    ('T2', 'killed', 'a reason sends another', TRAY, EDITT, [('onPress={() => onReason(reason.value)}', "onPress={() => onReason('entry_error')}")]),
    ('T3', 'killed', 'the tray not named by its question', TRAY, EDITT, [("title={tc('Why are you changing this?')}", "title={tc('Edit wallet')}")]),
    ('T4', 'killed', 'reasons under 44 pt', TRAY, EDITT, [('              minHeight: 56,\n', '              minHeight: 40,\n')]),
    # copy.ts
    ('K1', 'killed', "the archive line's ฿0 written as text", COPY, EDITT, [("th: 'เก็บได้เมื่อยอดเหลือ {zero} ตอนนี้มี {amount} โอนไปกระเป๋าอื่นก่อนนะ'", "th: 'เก็บได้เมื่อยอดเหลือ ฿0 ตอนนี้มี {amount} โอนไปกระเป๋าอื่นก่อนนะ'")]),
    ('K2', 'killed', 'ready spaced in Thai', COPY, NEWT, [("'wallets.ready': { th: '{name}พร้อมให้จดแล้ว'", "'wallets.ready': { th: '{name} พร้อมให้จดแล้ว'")]),
    # walletListSections.tsx: NewWallet.render.test.tsx's sections case
    ('C1', 'killed', 'the new-wallet sections not listed', SECTIONS, SECTIONST, [("    id: 'bw-wallet-new-type',\n", "    id: 'bw-wallet-kind',\n")]),
    ('C2', 'killed', 'the added section stops before the create', SECTIONS, SECTIONST, [("[...FILLED, { call: 'onPress', on: { testID: 'new-wallet-add' } }, { waitFor: 'new-wallet-added' }]", '[...FILLED]')]),
    ('C3', 'killed', 'the correction section opens no tray', SECTIONS, SECTIONST, [("[EDITING, { press: '5' }, { call: 'onPress', on: { testID: 'wallet-edit-save' } }, { waitFor: 'correction-tray' }]", '[EDITING]')]),
    ('C4', 'killed', 'the sections drawn without the kept looks', SECTIONS, SECTIONST, [('    <WalletLooksProvider>\n      <Suspense fallback={null}>{children}</Suspense>\n    </WalletLooksProvider>\n', '    <Suspense fallback={null}>{children}</Suspense>\n')]),
    # The routes: PlanningRoutes.render.test.tsx
    ('R1', 'killed', 'the new-wallet route with the wallet area off', NEW_ROUTE, ROUTES, [(AREA, '')]),
    ('R2', 'killed', 'the new-wallet route in the legacy build', NEW_ROUTE, ROUTES, [(LEGACY, '')]),
    ('R3', 'killed', '?setup=1 not passed on', NEW_ROUTE, ROUTES, [("  if (params.setup === '1') return '/spend/setup';\n", '')]),
    ('R4', 'killed', 'any returnTo passed on', NEW_ROUTE, ROUTES, [("  if (params.returnTo === '/spend/wallets') return '/spend/wallets';\n", '  if (params.returnTo) return params.returnTo as NewWalletReturn;\n')]),
    ('R5', 'killed', 'the flow without the shared resources', NEW_ROUTE, ROUTES, [('  return <SpendV1Provider resources={getSharedV1Resources()}><NewWalletFlow returnTo={newWalletReturn(params)} /></SpendV1Provider>;\n', '  return <NewWalletFlow returnTo={newWalletReturn(params)} />;\n')]),
    ('R6', 'killed', 'the edit route with the wallet area off', EDIT_ROUTE, ROUTES, [(AREA, '')]),
    ('R7', 'killed', 'the edit route in the legacy build', EDIT_ROUTE, ROUTES, [(LEGACY, '')]),
    ('R8', 'killed', 'the edit route ignores its id', EDIT_ROUTE, ROUTES, [('<WalletEditScreen walletId={id} />', '<WalletEditScreen walletId="" />')]),
    ('R9', 'killed', 'the edit screen without the shared resources', EDIT_ROUTE, ROUTES, [('  return <SpendV1Provider resources={getSharedV1Resources()}><WalletEditScreen walletId={id} /></SpendV1Provider>;\n', '  return <WalletEditScreen walletId={id} />;\n')]),
    # WalletsListScreen.tsx: WalletsList.render.test.tsx
    ('L1', 'killed', 'the add tile opens a flow that goes home', LIST, LISTT, [("const NEW_WALLET_HREF = { pathname: '/spend/wallet/new', params: { returnTo: '/spend/wallets' } } as const;", "const NEW_WALLET_HREF = '/spend/wallet/new' as Href;")]),
    # walletCommands.ts: walletCommands.render.test.tsx
    ('H1', 'killed', 'wallet_added back inside the save', HOOK, HOOKT, [(EMIT + GUARDED + '    }\n', ''), ('      keys.settle(command.slot);\n      pending.current = null;\n      return { kind: \'done\' };\n    } catch', "      keys.settle(command.slot);\n      pending.current = null;\n      if (command.kind === 'create') trackWalletAdded(track ?? {});\n      return { kind: 'done' };\n    } catch")]),
    ('H2', 'killed', "an emitter's throw let out of the send", HOOK, HOOKT, [(GUARDED, '      trackWalletAdded(track ?? {});\n')]),
    ('H3', 'killed', 'wallet_added for any done command', HOOK, HOOKT, [(EMIT, "    if (outcome.kind === 'done') {\n")]),
    ('H4', 'killed', 'wallet_added for a refused create', HOOK, HOOKT, [(EMIT, "    if (command.kind === 'create' && outcome.kind !== 'unconfirmed') {\n")]),
    # useWalletMotion.ts: useWalletMotion.render.test.tsx
    ('M1', 'killed', "the drop from the window's height", MOTION, MOTIONT, [(".withInitialValues({ originY: -WALLET_DROP_PT })", '')]),
    ('M2', 'killed', 'the fade starts above its place', MOTION, MOTIONT, [('    ? FadeIn.duration(FADE_MS).reduceMotion(ReduceMotion.Never)\n    : sprung(new SlideInUp(), \'bouncy\')', "    ? FadeIn.duration(FADE_MS).withInitialValues({ originY: -WALLET_DROP_PT }).reduceMotion(ReduceMotion.Never)\n    : sprung(new SlideInUp(), 'bouncy')")]),
]

SUMMARY = re.compile(r'^\s*Tests  (.+?)\s*$', re.M)
FAILED = re.compile(r'^\s*×\s+\S+\s+>\s+(.+?)\s+\d+ms\s*$', re.M)


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def mutated(text, edits, ident, rel):
    for old, new in edits:
        count = text.count(old)
        if count != 1:
            print(f'{ident} SETUP ERROR: {count} matches for {old!r} in {rel}', flush=True)
            sys.exit(2)
        text = text.replace(old, new)
    return text


def main():
    root, logs = sys.argv[1], sys.argv[2]
    check = '--check' in sys.argv[3:]
    wanted = {arg for arg in sys.argv[3:] if arg != '--check'}
    os.makedirs(logs, exist_ok=True)
    app = os.path.join(root, 'apps/app')
    unexpected = killed = survived = 0
    for ident, expect, description, rel, command, edits in MUTANTS:
        if wanted and ident not in wanted:
            continue
        path = os.path.join(root, rel)
        with open(path, 'rb') as handle:
            original = handle.read()
        before = hashlib.sha256(original).hexdigest()
        text = mutated(original.decode('utf-8'), edits, ident, rel)
        if check:
            print(f'{ident} ok: {description}', flush=True)
            continue
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
    if check:
        print(f'{len([m for m in MUTANTS if not wanted or m[0] in wanted])} mutants found in their files')
        return
    print(f'{killed} killed, {survived} survived, {unexpected} not as expected')
    sys.exit(1 if unexpected else 0)


if __name__ == '__main__':
    main()

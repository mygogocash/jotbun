#!/usr/bin/env python3
"""P2-T16 mutation check. Usage: python3 -I mutants.py <worktree root> <log dir> [ids...]

Applies each mutant alone to the worktree, runs the render file that holds its
guard (AddTray.render.test.tsx for the host, the copy and the sections;
Tray.render.test.tsx for the tray's own c-n1 guard; AddSteps.render.test.tsx for
the confirm step's m1 guard), restores the file byte for byte (sha256 checked)
and prints one line per mutant. Exits 0 only when every mutant ends as expected.
"""
import hashlib
import os
import re
import subprocess
import sys

HOST = 'apps/app/src/wallet/add/AddTrayHost.tsx'
COPY = 'apps/app/src/wallet/add/copy.ts'
SECTIONS = 'apps/app/src/dev/catalogue/wallet/addSections.tsx'
STAGE = 'apps/app/src/dev/catalogue/wallet/addHostSection.tsx'
TRAY = 'apps/app/src/wallet/tray/Tray.tsx'
CONFIRM = 'apps/app/src/wallet/add/ConfirmStep.tsx'

ADD_TRAY = 'src/wallet/add/AddTray.render.test.tsx'
TRAY_TEST = 'src/wallet/tray/Tray.render.test.tsx'
STEPS_TEST = 'src/wallet/add/AddSteps.render.test.tsx'

KEYPAD_IMPORT = ("import { EMPTY_KEYPAD } from '@mobile/ui/keypadExpression';\n", "import { EMPTY_KEYPAD, keypadFromMinor } from '@mobile/ui/keypadExpression';\n")
BUN_FILL = '    if (applied.amountMinor !== null) setKeypad(filledKeypad(applied.amountMinor));\n'
PROBLEM = '  const problem = entrySave.message ?? Object.values(entrySave.errors)[0] ?? Object.values(entrySave.serverErrors)[0] ?? null;\n'
BACK = "      onBack={locked || step === 'amount' ? undefined : () => setStep(isPickStep(step) ? back : 'amount')}\n"
OPEN_LEAVING = '        if (!now.current.visible) whenClosed(() => open(request));\n        return;\n'

# (id, test file, description, file, [(old, new), ...]); each old must occur exactly once.
MUTANTS = [
    # The plan's three (Step 5).
    ('H1', ADD_TRAY, "the tray is not locked while it saves (the plan's mutant)", HOST, [('      locked={inFlight}\n', '      locked={false}\n')]),
    ('H2', ADD_TRAY, "source typed after a Bun draft (the plan's mutant)", HOST, [("source: guessed.size > 0 ? 'tell_bun' : 'typed'", "source: 'typed'")]),
    ('H3', ADD_TRAY, "the sheet rendered beside the tray (the plan's mutant)", HOST, [
        ('        {tellBun}\n', '        {null}\n'),
        ('  return (\n    <Tray\n      visible={visible}\n', '  return (\n    <>\n    {tellBun}\n    <Tray\n      visible={visible}\n'),
        ('      {middle}\n    </Tray>\n  );\n}\n', '      {middle}\n    </Tray>\n    </>\n  );\n}\n'),
    ]),
    # Opening, one tray at a time (R69).
    ('H4', ADD_TRAY, 'open ignores blocked', HOST, [('      if (now.current.blocked) return;\n', '')]),
    ('H5', ADD_TRAY, 'blocked is read only as it was first given', HOST, [('    now.current.blocked = blocked;\n', '')]),
    ('H6', ADD_TRAY, 'an open asked while the tray is open starts another entry', HOST, [(OPEN_LEAVING, '        if (!now.current.visible) {\n          whenClosed(() => open(request));\n          return;\n        }\n')]),
    ('H7', ADD_TRAY, 'an open asked while a tray leaves opens at once', HOST, [('whenClosed(() => open(request));', '{ keys.current += 1; show({ key: keys.current, request, openedAt: Date.now() }, true); }')]),
    ('H8', ADD_TRAY, 'an open asked while a tray leaves is dropped', HOST, [(OPEN_LEAVING, '        return;\n')]),
    ('H9', ADD_TRAY, 'whenClosed runs at once with a tray open', HOST, [('      if (now.current.entry === null) run();\n      else queue.current.push(run);\n', '      run();\n')]),
    ('H10', ADD_TRAY, 'what waited for a close runs again at the next', HOST, [('    for (const run of queue.current.splice(0)) run();\n', '    for (const run of [...queue.current]) run();\n')]),
    ('H11', ADD_TRAY, 'what waited for a close never runs', HOST, [('    for (const run of queue.current.splice(0)) run();\n', '    queue.current.splice(0);\n')]),
    ('H12', ADD_TRAY, "the host's close ignores a save in flight", HOST, [('      if (now.current.saving) return;\n', '')]),
    ('H13', ADD_TRAY, 'a save in flight is never reported to the host', HOST, [('    onSaving(inFlight);\n', '    onSaving(false);\n')]),
    ('H14', ADD_TRAY, "a copy's start says spending", HOST, [("  const kind = request.type ?? (request.copyOf === undefined ? 'expense' : undefined);\n", "  const kind = request.type ?? 'expense';\n")]),
    ('H15', ADD_TRAY, "the start ignores the request's type", HOST, [("  const kind = request.type ?? (request.copyOf === undefined ? 'expense' : undefined);\n", "  const kind = request.copyOf === undefined ? 'expense' : undefined;\n")]),
    ('H16', ADD_TRAY, 'no record_started', HOST, [('      trackRecordStarted(startOf(request));\n', '')]),
    ('H17', ADD_TRAY, 'isOpen always false', HOST, [('    return { open, close, whenClosed, isOpen: visible, blocked };\n', '    return { open, close, whenClosed, isOpen: false, blocked };\n')]),
    ('H18', ADD_TRAY, 'outside a host open does nothing', HOST, [("    open: (request = {}) => router.push({ pathname: '/spend/add', params: quickAddParams(request) }),\n", '    open: () => undefined,\n')]),
    ('H19', ADD_TRAY, "outside a host the request's params are dropped", HOST, [('params: quickAddParams(request)', 'params: {}')]),
    ('H20', ADD_TRAY, 'outside a host whenClosed never runs', HOST, [('    whenClosed: (run) => run(),\n', '    whenClosed: () => undefined,\n')]),
    # Saving.
    ('H21', ADD_TRAY, 'the tray stays open after a save lands', HOST, [('            onSaved?.(saved, context);\n            show(now.current.entry, false);\n', '            onSaved?.(saved, context);\n')]),
    ('H22', ADD_TRAY, 'the host is not told of a save', HOST, [('            onSaved?.(saved, context);\n', '')]),
    ('H23', ADD_TRAY, "offline ignores the diary's last outcome", HOST, [("offline: saved.via === 'device' && diaryView.outcome?.status !== 'synced'", "offline: saved.via === 'device'")]),
    ('H24', ADD_TRAY, 'offline ignores where the save went', HOST, [("offline: saved.via === 'device' && diaryView.outcome?.status !== 'synced'", "offline: diaryView.outcome?.status !== 'synced'")]),
    ('H25', ADD_TRAY, "a save kept on the phone plays Quick add's queued tap", HOST, [("    savedHaptic: 'success',\n", "    savedHaptic: 'quickAdd',\n")]),
    ('H26', ADD_TRAY, 'no category key in the track', HOST, [('categoryKey: analyticsCategoryKey(category)', 'categoryKey: null')]),
    ('H27', ADD_TRAY, 'openedAt is when Save is pressed', HOST, [('openedAt: entry.openedAt', 'openedAt: Date.now()')]),
    ('H28', ADD_TRAY, "a save's field error is not said", HOST, [(PROBLEM, '  const problem = entrySave.message;\n')]),
    ('H29', ADD_TRAY, 'the save problem is not an alert', HOST, [('<WalletText testID="add-save-problem" role="label" accessibilityRole="alert" aria-live="polite"', '<WalletText testID="add-save-problem" role="label" aria-live="polite"')]),
    ('H30', ADD_TRAY, 'the save problem is not said on iOS', HOST, [('  useAnnouncement(problem);\n', '')]),
    ('H31', ADD_TRAY, 'Try again despite a refused resend', HOST, [('disabled={resendBlocked}', 'disabled={false}')]),
    ('H32', ADD_TRAY, 'Try again does not resend', HOST, [("label={t('common.tryAgain')} disabled={resendBlocked} onPress={save}", "label={t('common.tryAgain')} disabled={resendBlocked} onPress={() => undefined}")]),
    ('H33', ADD_TRAY, 'Done does not close a conflict', HOST, [("label={t('common.done')} onPress={onClose}", "label={t('common.done')} onPress={() => undefined}")]),
    ('H34', ADD_TRAY, 'Save is not busy while saving', HOST, [('busy={inFlight}', 'busy={false}')]),
    ('H35', ADD_TRAY, 'Save despite a refusal that blocks it', HOST, [("disabled={status === 'blocked'}", 'disabled={false}')]),
    # The entry: its first draft, fills and guesses.
    ('H36', ADD_TRAY, "a new entry ignores the request's type", HOST, [('  const type = request.type ?? draft.type;\n', '  const type = draft.type;\n')]),
    ('H37', ADD_TRAY, "a new entry ignores the request's wallet", HOST, [('  const id = ready.wallets.find((wallet) => wallet.id === request.walletId)?.id;\n', '  const id: string | undefined = undefined;\n')]),
    ('H38', ADD_TRAY, "a move does not leave the request's wallet", HOST, [('walletId: id, fromWalletId: id, ', 'walletId: id, ')]),
    ('H39', ADD_TRAY, "a move's other side stays on the request's wallet", HOST, [('toWalletId: draft.toWalletId === id ? other : draft.toWalletId', 'toWalletId: draft.toWalletId')]),
    ('H40', ADD_TRAY, "a copy's amount opens as typed, not a fill", HOST, [KEYPAD_IMPORT, ('    return filledKeypad(source.amount_minor);\n', '    return keypadFromMinor(source.amount_minor);\n')]),
    ('H41', ADD_TRAY, "Bun's rows are not its guesses", HOST, [('    if (bun) setGuessed((now) => new Set([...now, ...guessedBy(filled)]));\n', '')]),
    ('H42', ADD_TRAY, "a chip's rows are taken for Bun's", HOST, [('apply: () => fill(item.draft, false)', 'apply: () => fill(item.draft, true)')]),
    ('H43', ADD_TRAY, "Bun's amount goes in as typed, not a fill", HOST, [KEYPAD_IMPORT, (BUN_FILL, '    if (applied.amountMinor !== null) setKeypad(keypadFromMinor(applied.amountMinor));\n')]),
    ('H44', ADD_TRAY, 'an amount Bun could not read clears what was typed', HOST, [(BUN_FILL, '    setKeypad(applied.amountMinor === null ? EMPTY_KEYPAD : filledKeypad(applied.amountMinor));\n')]),
    ('H45', ADD_TRAY, "an empty field of Bun's counts as its guess", HOST, [('.filter(([, value]) => Boolean(value))', '.filter(([, value]) => value !== undefined)')]),
    ('H46', ADD_TRAY, "Bun's day is not its guess", HOST, [('date: draft.occurred_on, ', '')]),
    ('H47', ADD_TRAY, 'the first touch fixes nothing', HOST, [('    setFrozen(live);\n', '')]),
    ('H48', ADD_TRAY, 'no defaults from the recent-use read before the first touch', HOST, [('frozen !== null ? draft : withDefaults(draft, live, ready?.source ?? null);', 'draft;')]),
    ('H49', ADD_TRAY, 'a key is not a touch', HOST, [('    onKeypad: (next) => {\n      touch();\n', '    onKeypad: (next) => {\n')]),
    ('H50', ADD_TRAY, 'a step change is not a touch', HOST, [('    if (locked) return;\n    touch();\n', '    if (locked) return;\n')]),
    ('H51', ADD_TRAY, 'a change to the draft is not a touch', HOST, [('    if (current === null) return;\n    touch();\n    setGuessed', '    if (current === null) return;\n    setGuessed')]),
    # Steps and the type.
    ('H52', ADD_TRAY, 'a row opens its pick while the entry is frozen', HOST, [('    if (locked) return;\n    touch();\n', '    touch();\n')]),
    ('H53', ADD_TRAY, 'the step that opened a pick is not kept', HOST, [('    if (isPickStep(next)) setBack(step);\n', '')]),
    ('H54', ADD_TRAY, 'a new type keeps every step', HOST, [("    setStep(from === 'amount' ? 'amount' : stepAfterAmount(type));\n", '')]),
    ('H55', ADD_TRAY, 'a pick counts as itself, not its opener, for a new type', HOST, [('    const from = isPickStep(step) ? back : step;\n', '    const from = step;\n')]),
    ('H56', ADD_TRAY, 'the type can change while the entry is frozen', HOST, [('onType={changeType} disabled={locked}', 'onType={changeType} disabled={inFlight}')]),
    ('H57', ADD_TRAY, 'back on the amount step', HOST, [(BACK, "      onBack={locked ? undefined : () => setStep(isPickStep(step) ? back : 'amount')}\n")]),
    ('H58', ADD_TRAY, 'back while the entry is frozen', HOST, [(BACK, "      onBack={step === 'amount' ? undefined : () => setStep(isPickStep(step) ? back : 'amount')}\n")]),
    ('H59', ADD_TRAY, 'back from confirm and the transfer step goes to confirm', HOST, [(BACK, "      onBack={locked || step === 'amount' ? undefined : () => setStep(isPickStep(step) ? back : 'confirm')}\n")]),
    ('H60', ADD_TRAY, 'back from a pick goes to confirm', HOST, [(BACK, "      onBack={locked || step === 'amount' ? undefined : () => setStep(isPickStep(step) ? 'confirm' : 'amount')}\n")]),
    ('H61', ADD_TRAY, 'the switch is always the header', HOST, [('      header={inHeader ? typeSwitch : undefined}\n', '      header={typeSwitch}\n')]),
    ('H62', ADD_TRAY, 'at AX5 the step gets no switch', HOST, [('          typeSwitch={inHeader ? null : typeSwitch}\n', '          typeSwitch={null}\n')]),
    ('H63', ADD_TRAY, "the keypad's problem is not shown", HOST, [('          problem={amountWords === null ? null : tc(KEYPAD_PROBLEM_TEXT[amountWords])}\n', '          problem={null}\n')]),
    ('H64', ADD_TRAY, "the name field's focus is ignored", HOST, [('naming={naming}', 'naming={false}')]),
    ('H65', ADD_TRAY, 'the transfer footer without the wallets (R114.2)', HOST, [('    footer = <TransferFooter {...props} wallets={wallets} />;\n', '    footer = <TransferFooter {...props} wallets={NO_WALLETS} />;\n')]),
    ('H66', ADD_TRAY, 'no balances on the transfer step', HOST, [('    middle = <TransferStep {...props} wallets={wallets} balances={ready.balances} />;\n', '    middle = <TransferStep {...props} wallets={wallets} balances={null} />;\n')]),
    ('H67', ADD_TRAY, 'confirm quotes a sentence the sheet never gave', HOST, [('bunSentence={null}', 'bunSentence={current.merchant || null}')]),
    ('H68', ADD_TRAY, 'the day has no lower bound', HOST, [('earliest={earliestFor(current, wallets) ?? undefined}', 'earliest={undefined}')]),
    # Tell Bun and the chips.
    ('H69', ADD_TRAY, "Tell Bun's sheet cannot be closed", HOST, [('      onClose={() => setTelling(false)}\n', '      onClose={() => undefined}\n')]),
    ('H70', ADD_TRAY, "Bun's sheet gets the often-logged entries", HOST, [('      locale={locale}\n      onUse=', '      locale={locale}\n      often={often}\n      onUse=')]),
    ('H71', ADD_TRAY, "chips of every type", HOST, [('    .filter((item) => item.draft.type === current.type)\n', '')]),
    ('H72', ADD_TRAY, 'only the three often-logged entries of every type', HOST, [('oftenLogged({ records, today, wallets, categories, top: Number.POSITIVE_INFINITY })', 'oftenLogged({ records, today, wallets, categories })')]),
    ('H73', ADD_TRAY, "a chip named by the often-logged label, which ends with its amount", HOST, [("label: item.draft.merchant ?? ''", 'label: item.label')]),
    # Waiting.
    ('H74', ADD_TRAY, 'the loading spinner says nothing', HOST, [("      <ActivityIndicator color={colors.ink} accessibilityLabel={references.state === 'loading' ? references.label : tc('Loading your wallets')} />\n", '      <ActivityIndicator color={colors.ink} />\n')]),
    ('H75', ADD_TRAY, 'no Try again on a load problem', HOST, [("        {references.retry === null ? null : <PrimaryButton label={t('common.tryAgain')} onPress={references.retry} />}\n", '')]),
    ('H76', ADD_TRAY, 'no new entry for a copy that is gone', HOST, [("        {references.startBlank === null ? null : <TextLink label={tc('Start a new entry')} onPress={references.startBlank} />}\n", '')]),
    ('H77', ADD_TRAY, 'no words for no wallet', HOST, [("  if (references.state === 'no_wallet') {\n", '  if (false) {\n')]),
    # The copy and the sections.
    ('K1', ADD_TRAY, "Save's busy words lose their ellipsis", COPY, [("'add.saving': { th: 'กำลังบันทึก…'", "'add.saving': { th: 'กำลังบันทึก'")]),
    ('S1', ADD_TRAY, 'the saving section lets the save land', SECTIONS, [("    fixture: () => online((fake) => { fake.hold('createTransaction'); }),\n", '    fixture: () => online(),\n')]),
    ('S2', ADD_TRAY, "the unconfirmed section's save is answered", SECTIONS, [("    fixture: () => online((fake) => { fake.fail('createTransaction', 'network'); }),\n", '    fixture: () => online(),\n')]),
    ('S3', ADD_TRAY, 'the script never presses Save', SECTIONS, [(", { waitFor: 'add-save' }, tap('add-save')];", ", { waitFor: 'add-save' }];")]),
    ('S4', ADD_TRAY, 'the saving section under another id', SECTIONS, [("    id: 'bw-tray-saving',\n", "    id: 'bw-tray-busy',\n")]),
    ('S5', ADD_TRAY, 'the list imports the host', SECTIONS, [("import { goldenFake } from '../screenFixtures';\n", "import { goldenFake } from '../screenFixtures';\nimport { AddTrayHost } from '@mobile/wallet/add/AddTrayHost';\nvoid AddTrayHost;\n")]),
    ('S6', ADD_TRAY, 'the stage never opens the tray', STAGE, [('  useEffect(() => {\n    open();\n  }, []);\n', '  useEffect(() => undefined, []);\n')]),
    # The two pins this task carries for its neighbours.
    ('T1', TRAY_TEST, "the end calls the onClosed captured when the Modal hid (tray-hardening's c-n1, mutant M3)", TRAY, [
        ("import { useEffect, useRef, useState } from 'react';\n", "import { useCallback, useEffect, useRef, useState } from 'react';\n"),
        ('  const dismissed = () => {\n    if (!shown && !showing.current) closed.current?.();\n  };\n', '  const dismissed = useCallback(() => {\n    if (!shown && !showing.current) onClosed?.();\n  }, [shown]);\n'),
    ]),
    ('C1', STEPS_TEST, "Bun's line quotes the sentence beside a typed amount in private mode (P2-T15's confirm m1, R3)", CONFIRM, [("{hidden ? t('add.bunReadHidden') : t('add.bunReadFrom', { sentence: bunSentence })}", "{masked ? t('add.bunReadHidden') : t('add.bunReadFrom', { sentence: bunSentence })}")]),
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
    for ident, test_file, description, rel, edits in MUTANTS:
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
            run = subprocess.run(['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', test_file], cwd=app, capture_output=True, text=True, timeout=900)
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
        mark = 'KILLED' if outcome == 'killed' else 'SURVIVED'
        first = f'; first failing: "{failed[0].strip()}"' if failed else ''
        restored = 'restored sha256 equal' if after == before else f'RESTORE MISMATCH {after}'
        print(f'{ident} {mark}: {description} [{os.path.basename(rel)}] -> Tests {summary}{first}; AssertionError x{assertions}; {restored}', flush=True)
        if outcome != 'killed' or after != before:
            unexpected += 1
    print(f'{killed} killed, {survived} survived, {unexpected} not as expected')
    sys.exit(1 if unexpected else 0)


if __name__ == '__main__':
    main()

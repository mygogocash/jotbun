#!/usr/bin/env python3
"""P2-T17 mutation check. Usage: python3 -I mutants.py <tree root> <log dir> [ids...]

Applies each mutant alone to the tree, runs the test file that holds its guard
(savedMoment.test.ts, with Node's test runner, for the pure rules and the toast's
Thai line; SavedMoment.render.test.tsx for the host, the flight, the sections,
the conflict line and TextLink's tone), restores the file byte for byte (sha256
checked) and prints one line per mutant. With ids, runs only those (the planner
ran them in batches; merge_mutants.py joins the batches). Exits 0 only when
every mutant it ran ends killed and restored.
"""
import hashlib
import os
import re
import subprocess
import sys

MOMENT = 'apps/app/src/wallet/saved/savedMoment.ts'
HOST = 'apps/app/src/wallet/saved/SavedToastHost.tsx'
FLIGHT = 'apps/app/src/wallet/saved/SaveFlight.tsx'
COPY = 'apps/app/src/wallet/saved/copy.ts'
LIST = 'apps/app/src/dev/catalogue/wallet/savedSections.tsx'
SCREENS = 'apps/app/src/dev/catalogue/wallet/savedScreens.tsx'
INDEX = 'apps/app/src/dev/catalogue/wallet/index.ts'
LINK = 'apps/app/src/wallet/tray/TextLink.tsx'

UNIT = 'src/wallet/saved/savedMoment.test.ts'
RENDER = 'src/wallet/saved/SavedMoment.render.test.tsx'

TITLE = "  const title = draft.merchant.trim() || draft.note.trim() || (category === undefined ? '' : categoryName(category, tc)) || tc(KIND_NAMES[draft.type]);\n"
HELD = "  if (command === undefined || command.state === 'acknowledged') return { kind: 'delete_record', recordId: notice.recordId, version: 1 };\n  return canUndoDraft(command) ? "
COUNTED = "    if (state === 'needs_review' || input.confirmedIds.has(payload.id)) continue;\n"
PLAN = "  const plan = notice.via === 'device' && view.phase !== 'ready' ? NONE : undoPlan(notice, view.outbox);\n"
OFFERED = "  const offered = plan.kind !== 'none' && (undo.phase === 'ready' || (undo.phase === 'said' && undo.again));\n"
ANSWER = "        setUndo({ phase: 'said', text: answer, again: problem.unconfirmed });\n"
OUTBOX = "            outbox: now.phase === 'ready' ? now.outbox : [],\n"
CHECK = '        <SavedCheck circle={colors.onToast} tick={colors.toast} />\n'
AIM = '        setFlight({ notice, to: { x: frame.x + frame.width / 2, y: frame.y + STACK_PEEK / 2 } });\n'

# (id, test, description, file, [(old, new), ...]); each old must occur exactly once in the file.
MUTANTS = [
    # The pure rules (savedMoment.ts), on the Node test.
    ('P1', UNIT, 'a transfer drops into the wallet it left', MOMENT, [("    walletId: draft.type === 'transfer' ? draft.toWalletId : draft.walletId,\n", '    walletId: draft.walletId,\n')]),
    ('P2', UNIT, 'the title skips the merchant', MOMENT, [(TITLE, TITLE.replace('draft.merchant.trim() || ', ''))]),
    ('P3', UNIT, 'the title skips the note', MOMENT, [(TITLE, TITLE.replace(' || draft.note.trim()', ''))]),
    ('P4', UNIT, 'the title is not trimmed', MOMENT, [(TITLE, TITLE.replace('draft.merchant.trim() || draft.note.trim()', 'draft.merchant || draft.note'))]),
    ('P5', UNIT, "the title skips the category's name", MOMENT, [(TITLE, TITLE.replace(" || (category === undefined ? '' : categoryName(category, tc))", ''))]),
    ('P6', UNIT, "a built-in category's name not in the app's words", MOMENT, [(TITLE, TITLE.replace('categoryName(category, tc)', 'categoryName(category, (english) => english)'))]),
    ('P7', UNIT, "no kind's name when nothing else names the save", MOMENT, [(TITLE, TITLE.replace(' || tc(KIND_NAMES[draft.type])', ''))]),
    ('P8', UNIT, 'how the save went is lost', MOMENT, [('    via: saved.via,\n', "    via: 'device',\n")]),
    ('P9', UNIT, 'offline is lost', MOMENT, [('    offline,\n', '    offline: false,\n')]),
    ('P10', UNIT, 'a command Jotbun acknowledged offers no Undo', MOMENT, [(HELD, HELD.replace(" || command.state === 'acknowledged'", ''))]),
    ('P11', UNIT, 'a save not in the outbox offers no Undo', MOMENT, [(HELD, "  if (command !== undefined && command.state === 'acknowledged') return { kind: 'delete_record', recordId: notice.recordId, version: 1 };\n  return command !== undefined && canUndoDraft(command) ? ")]),
    ('P12', UNIT, "a draft being sent is removed (the plan's mutant)", MOMENT, [('  return canUndoDraft(command) ? ', "  return canUndoDraft(command) || command.state === 'sending' ? ")]),
    ('P13', UNIT, "other kinds count in today's money out", MOMENT, [("    if (payload.type !== 'expense' || payload.occurred_on !== input.today) continue;\n", '    if (payload.occurred_on !== input.today) continue;\n')]),
    ('P14', UNIT, "other days count in today's money out", MOMENT, [("    if (payload.type !== 'expense' || payload.occurred_on !== input.today) continue;\n", "    if (payload.type !== 'expense') continue;\n")]),
    ('P15', UNIT, 'a refused draft counts', MOMENT, [(COUNTED, COUNTED.replace("state === 'needs_review' || ", ''))]),
    ('P16', UNIT, 'a draft whose record the read lists counts twice', MOMENT, [(COUNTED, COUNTED.replace(' || input.confirmedIds.has(payload.id)', ''))]),
    ('P17', UNIT, 'only a draft never sent counts', MOMENT, [(COUNTED, COUNTED.replace("state === 'needs_review'", "state !== 'unsent'"))]),
    ('P18', UNIT, 'the total goes through a JS number', MOMENT, [('    total += BigInt(payload.amount_minor);\n', '    total = BigInt(Number(total) + Number(payload.amount_minor));\n')]),
    ('P19', UNIT, "offline says rh-offline's words only while the total is unknown", MOMENT, [('  if (notice.offline) {\n', '  if (notice.offline && todayOut === null) {\n')]),
    ('P20', UNIT, "the total unknown says rh-offline's words", MOMENT, [("    const text = t('saved.toastPlain');\n", "    const text = t('saved.toastOffline');\n")]),
    ('P21', UNIT, "private mode draws today's total", MOMENT, [("    text: t('saved.toast', { amount: toastAmount(todayOut, hidden) }),\n", "    text: t('saved.toast', { amount: toastAmount(todayOut, false) }),\n")]),
    ('P22', UNIT, 'private mode says the dots', MOMENT, [("hidden ? t('common.amountHidden') : spokenMoney(todayOut, t)", 'hidden ? HIDDEN_AMOUNT : spokenMoney(todayOut, t)')]),
    ('P23', UNIT, 'toastAmount ignores private mode', MOMENT, [('  return hidden ? HIDDEN_AMOUNT : walletMoneyText(todayOut);\n', '  return walletMoneyText(todayOut);\n')]),
    ('P24', UNIT, 'the toast keeps .00', MOMENT, [('  return hidden ? HIDDEN_AMOUNT : walletMoneyText(todayOut);\n', '  return hidden ? HIDDEN_AMOUNT : walletMoneyText(todayOut, { exact: true });\n')]),
    # The copy.
    ('K1', UNIT, "the toast's Thai line loses its middle dot", COPY, [("'saved.toast': { th: 'บันทึกแล้ว · วันนี้ {amount}'", "'saved.toast': { th: 'บันทึกแล้ว วันนี้ {amount}'")]),
    ('K2', RENDER, "the conflict's Thai line says less", COPY, [("th: 'ลบไม่ได้ รายการนี้ถูกแก้ในอีกเครื่อง'", "th: 'ลบไม่ได้'")]),
    # The host (SavedToastHost.tsx), on the render suite.
    ('H1', RENDER, "a newer save never takes the toast's place", HOST, [('      setShown({ key: keys.current, notice });\n', '      setShown((now) => now ?? { key: keys.current, notice });\n')]),
    ('H2', RENDER, 'the toast and the chip share one key', HOST, [('<Toast key={`toast:${shown.key}`}', '<Toast key={shown.key}'), ('<SaveFlight key={`flight:${shown?.key ?? 0}`}', '<SaveFlight key={shown?.key ?? 0}')]),
    ('H3', RENDER, "offline still reads today's total", HOST, [('    if (notice.offline) return undefined;\n', '')]),
    ('H4', RENDER, 'offline waits for a read', HOST, [('useState(notice.offline)', 'useState(false)')]),
    ('H5', RENDER, 'no 600 ms bound', HOST, [('    const timer = setTimeout(() => setAppeared(true), TOTAL_WAIT_MS);\n', '    const timer = setTimeout(() => undefined, TOTAL_WAIT_MS);\n')]),
    ('H6', RENDER, 'the bound is 1 s', HOST, [('export const TOTAL_WAIT_MS = 600;\n', 'export const TOTAL_WAIT_MS = 1000;\n')]),
    ('H7', RENDER, "the toast stays the short toast's time", HOST, [('export const TOAST_MS = motion.duration.toastLong;\n', 'export const TOAST_MS = motion.duration.toast;\n')]),
    ('H8', RENDER, 'the read is not only spending', HOST, [("{ from: today, through: today, type: 'expense', sort: 'date_desc' }", "{ from: today, through: today, sort: 'date_desc' }")]),
    ('H9', RENDER, 'the read takes the default page', HOST, [('undefined, HISTORY_MAX_LIMIT).then(', 'undefined).then(')]),
    ('H10', RENDER, 'a day with more than a page is counted anyway', HOST, [('        if (page.next_cursor === null) {\n', '        if (true) {\n')]),
    ('H11', RENDER, 'a failed read waits for the bound', HOST, [('        if (live) setAppeared(true);\n', '        void live;\n')]),
    ('H12', RENDER, 'no draft counts', HOST, [(OUTBOX, '            outbox: [],\n')]),
    ('H13', RENDER, "a closed diary's drafts count", HOST, [(OUTBOX, '            outbox: now.outbox,\n')]),
    ('H14', RENDER, 'the outbox as it was at the show, not as the read lands', HOST, [('    latest.current = view;\n', '    void view;\n')]),
    ('H15', RENDER, 'a save kept on this phone offers Undo with no diary open', HOST, [(PLAN, PLAN.replace("notice.via === 'device' && view.phase !== 'ready'", 'false'))]),
    ('H16', RENDER, 'an online save waits on the diary', HOST, [(PLAN, PLAN.replace("notice.via === 'device' && ", ''))]),
    ('H17', RENDER, 'two taps, two removals', HOST, [("    if (busy.current || plan.kind === 'none') return;\n", "    if (plan.kind === 'none') return;\n")]),
    ('H18', RENDER, 'Undo removes nothing', HOST, [('        await diary?.removeDraft(plan.commandId);\n', '        void diary;\n')]),
    ('H19', RENDER, 'the delete names a later version', HOST, [('resources.deleteTransaction(plan.recordId, plan.version, ', 'resources.deleteTransaction(plan.recordId, 2, ')]),
    ('H20', RENDER, 'each tap a new command key', HOST, [('keys.keyFor(slot, { version: plan.version })', 'globalThis.crypto.randomUUID()')]),
    ('H21', RENDER, 'no undo_used', HOST, [('      trackUndoUsed({ kind: notice.kind });\n', '')]),
    ('H22', RENDER, 'undo_used always says spending', HOST, [('trackUndoUsed({ kind: notice.kind })', "trackUndoUsed({ kind: 'expense' })")]),
    ('H23', RENDER, 'undo_used for a refusal too', HOST, [("    } catch (error) {\n      if (plan.kind === 'remove_draft') {\n", "    } catch (error) {\n      trackUndoUsed({ kind: notice.kind });\n      if (plan.kind === 'remove_draft') {\n")]),
    ('H24', RENDER, "a draft's Undo says the record's words", HOST, [("t(plan.kind === 'remove_draft' ? 'saved.undone' : 'saved.undoneDeleted')", "t('saved.undoneDeleted')")]),
    ('H25', RENDER, "a newer version says today's words", HOST, [("        const answer = outcome === 'conflict'\n", '        const answer = false\n')]),
    ('H26', RENDER, 'one deleted elsewhere is not said', HOST, [("outcome === 'deleted' || outcome === 'not_found' ?", "outcome === 'not_found' ?")]),
    ('H27', RENDER, 'one not in Jotbun is not said', HOST, [("outcome === 'deleted' || outcome === 'not_found' ?", "outcome === 'deleted' ?")]),
    ('H28', RENDER, 'an unconfirmed delete ends Undo', HOST, [(ANSWER, ANSWER.replace('again: problem.unconfirmed', 'again: false'))]),
    ('H29', RENDER, 'a refusal keeps Undo', HOST, [(ANSWER, ANSWER.replace('again: problem.unconfirmed', 'again: true'))]),
    ('H30', RENDER, 'an unconfirmed delete drops its key', HOST, [('        if (!problem.unconfirmed) keys.settle(slot);\n', '        keys.settle(slot);\n')]),
    ('H31', RENDER, 'a removal the diary refuses ends Undo', HOST, [('text: tc("Couldn\'t change this device\'s copy. Try again."), again: true });', 'text: tc("Couldn\'t change this device\'s copy. Try again."), again: false });')]),
    ('H32', RENDER, 'the toast leaves while Undo is on its way', HOST, [("    if (!appeared || undo.phase === 'busy') return undefined;\n", '    if (!appeared) return undefined;\n')]),
    ('H33', RENDER, 'the 6 s never start again on new words', HOST, [('  }, [appeared, undo.phase, text, id, onGone]);\n', '  }, [appeared, undo.phase, id, onGone]);\n')]),
    ('H34', RENDER, 'iOS hears nothing', HOST, [('  useAnnouncement(appeared ? spoken : null);\n', '')]),
    ('H35', RENDER, 'iOS hears the drawn words, not the spoken ones', HOST, [('  useAnnouncement(appeared ? spoken : null);\n', '  useAnnouncement(appeared ? text : null);\n')]),
    ('H36', RENDER, "the amount in the line's own face", HOST, [("<Text style={{ fontFamily: LATIN_UI_FONT_FAMILY, fontWeight: '700' }}>", "<Text style={{ fontWeight: '700' }}>")]),
    ('H37', RENDER, "the check in the under colour (the plan's mutant)", HOST, [(CHECK, CHECK.replace('circle={colors.onToast}', 'circle={colors.under}'))]),
    ('H38', RENDER, "the tick in the circle's colour", HOST, [(CHECK, CHECK.replace('tick={colors.toast}', 'tick={colors.onToast}'))]),
    ('H39', RENDER, 'Undo in violet', HOST, [('<TextLink tone="toastLink"', '<TextLink tone="violet"')]),
    ('H40', RENDER, 'Undo with nothing to undo', HOST, [(OFFERED, OFFERED.replace("plan.kind !== 'none' && ", ''))]),
    ('H41', RENDER, 'Undo again after any answer', HOST, [(OFFERED, OFFERED.replace("(undo.phase === 'ready' || (undo.phase === 'said' && undo.again))", "undo.phase !== 'busy'"))]),
    ('H42', RENDER, 'the check is read aloud', HOST, [('<View {...DECORATIVE} testID="saved-check"', '<View testID="saved-check"')]),
    ('H43', RENDER, 'not a polite status', HOST, [('      {...POLITE_LIVE_REGION}\n', '')]),
    ('H44', RENDER, "the toast on the card's fill", HOST, [('          backgroundColor: colors.toast,\n', '          backgroundColor: colors.card,\n')]),
    ('H45', RENDER, 'the toast slides in under Reduce Motion', HOST, [('entering={toastEntering(reduced)}', 'entering={toastEntering(false)}')]),
    # The flight (SaveFlight.tsx).
    ('F1', RENDER, 'it flies under Reduce Motion', FLIGHT, [("motionFor('save', reduced)", "motionFor('save', false)")]),
    ('F2', RENDER, 'it flies to a card that is not on screen', FLIGHT, [('        if (frame === null) return;\n' + AIM, '        const at = frame ?? { x: 0, y: 0, width: 0, height: 0 };\n        setFlight({ notice, to: { x: at.x + at.width / 2, y: at.y + STACK_PEEK / 2 } });\n')]),
    ('F3', RENDER, 'it flies while the tray leaves', FLIGHT, [('    after(TRAY_EXIT_MS, () => {\n', '    after(0, () => {\n')]),
    ('F4', RENDER, 'the cards are not measured again', FLIGHT, [('      measure();\n', '')]),
    ('F5', RENDER, 'the frame is read before the measurements land', FLIGHT, [('      after(0, () => {\n        const frame', '      ((run: () => void) => run())(() => {\n        const frame')]),
    ('F6', RENDER, "it aims at the card's middle", FLIGHT, [(AIM, AIM.replace('y: frame.y + STACK_PEEK / 2', 'y: frame.y + frame.height / 2'))]),
    ('F7', RENDER, "it aims at the card's left edge", FLIGHT, [(AIM, AIM.replace('x: frame.x + frame.width / 2', 'x: frame.x'))]),
    ('F8', RENDER, 'it never lands', FLIGHT, [('        after(FLIGHT_MS, () => setFlight(null));\n', '')]),
    ('F9', RENDER, "the chip's real amount in private mode (the plan's mutant)", FLIGHT, [('{hidden ? HIDDEN_AMOUNT : walletMoneyText(notice.amountMinor, { sign: SIGNS[notice.kind] })}', '{walletMoneyText(notice.amountMinor, { sign: SIGNS[notice.kind] })}')]),
    ('F10', RENDER, "the chip's title in private mode", FLIGHT, [('{hidden ? null : <WalletText testID="save-flight-title"', '{false ? null : <WalletText testID="save-flight-title"')]),
    ('F11', RENDER, 'income lands as spending', FLIGHT, [("{ expense: 'expense', income: 'income', transfer: 'none' }", "{ expense: 'expense', income: 'expense', transfer: 'none' }")]),
    ('F12', RENDER, 'the chip is read aloud', FLIGHT, [('      {...DECORATIVE}\n      testID="save-flight"\n', '      testID="save-flight"\n')]),
    ('F13', RENDER, "the chip's box starts at the point", FLIGHT, [('left: to.x - room / 2,', 'left: to.x,')]),
    ('F14', RENDER, "the chip's top at the point", FLIGHT, [('top: to.y - CHIP_HALF,', 'top: to.y,')]),
    # The sections.
    ('S1', RENDER, 'the list loads the host', LIST, [("import type { CatalogueSection } from '../registry';\n", "import type { CatalogueSection } from '../registry';\nimport { SavedToastHost } from '@mobile/wallet/saved/SavedToastHost';\nvoid SavedToastHost;\n")]),
    ('S2', RENDER, 'the offline section is online', SCREENS, [('    fixture: offline,\n', '    fixture: online,\n')]),
    ('S3', RENDER, 'the private section is not private', SCREENS, [("memoryStore({ [PRIVATE_MODE_NAME]: '1' })", 'memoryStore({})')]),
    ('S4', RENDER, "the undone section's script never taps Undo", SCREENS, [("{ call: 'onPress', on: { tone: 'toastLink' } }, ", '')]),
    ('S5', RENDER, 'the page shows nothing as it opens', SCREENS, [('  useEffect(() => {\n    show(shown);\n  }, []);\n', '  useEffect(() => undefined, []);\n')]),
    ('S6', RENDER, 'the offline section under another id', LIST, [("'bw-saved-toast', 'bw-saved-offline', 'bw-saved-private'", "'bw-saved-toast', 'bw-saved-away', 'bw-saved-private'")]),
    ('S7', RENDER, 'the page has no heading of its own', SCREENS, [('<WalletText role="h1" accessibilityRole="header">', '<WalletText role="h1">')]),
    ('S8', RENDER, "the sections after the wallets list's", INDEX, [('  ...WALLET_SAVED_SECTIONS,\n  ...WALLET_LIST_SECTIONS,\n', '  ...WALLET_LIST_SECTIONS,\n  ...WALLET_SAVED_SECTIONS,\n')]),
    # TextLink's new tone.
    ('L1', RENDER, 'TextLink draws every tone violet', LINK, [("<WalletText role=\"label\" tone={tone} style={{ textAlign: 'center' }}>{label}</WalletText>", "<WalletText role=\"label\" tone=\"violet\" style={{ textAlign: 'center' }}>{label}</WalletText>")]),
]

RENDER_SUMMARY = re.compile(r'^\s*Tests  (.+?)\s*$', re.M)
RENDER_FAILED = re.compile(r'^\s*×\s+\S+\s+>\s+(.+?)\s+\d+ms\s*$', re.M)
UNIT_FAIL = re.compile(r'^ℹ fail (\d+)\s*$', re.M)
UNIT_TESTS = re.compile(r'^ℹ tests (\d+)\s*$', re.M)
UNIT_FAILED = re.compile(r'^✖ (.+?) \([\d.]+ms\)\s*$', re.M)


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def run(app, test_file):
    if test_file == UNIT:
        command = ['npm', 'run', 'test:unit', '--', test_file]
    else:
        command = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', test_file]
    done = subprocess.run(command, cwd=app, capture_output=True, text=True, timeout=900)
    return done.returncode, done.stdout + done.stderr


def summary_of(test_file, output):
    if test_file == UNIT:
        tests = UNIT_TESTS.findall(output)
        fails = UNIT_FAIL.findall(output)
        failed = UNIT_FAILED.findall(output)
        text = f'tests {tests[-1] if tests else "?"} fail {fails[-1] if fails else "?"}'
        return text, failed
    found = RENDER_SUMMARY.findall(output)
    return (found[-1] if found else 'no summary'), RENDER_FAILED.findall(output)


def main():
    root, logs = sys.argv[1], sys.argv[2]
    os.makedirs(logs, exist_ok=True)
    app = os.path.join(root, 'apps/app')
    wanted = set(sys.argv[3:])
    unknown = wanted - {ident for ident, *_ in MUTANTS}
    if unknown:
        print(f'unknown ids: {sorted(unknown)}')
        sys.exit(2)
    unexpected = killed = survived = 0
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
            code, output = run(app, test_file)
        finally:
            with open(path, 'wb') as handle:
                handle.write(original)
        after = sha(path)
        with open(os.path.join(logs, f'{ident}.log'), 'w', encoding='utf-8') as handle:
            handle.write(output)
        summary, failed = summary_of(test_file, output)
        assertions = output.count('AssertionError')
        outcome = 'killed' if code != 0 else 'survived'
        killed += outcome == 'killed'
        survived += outcome == 'survived'
        mark = 'KILLED' if outcome == 'killed' else 'SURVIVED'
        first = f'; first failing: "{failed[0].strip()}"' if failed else ''
        restored = 'restored sha256 equal' if after == before else f'RESTORE MISMATCH {after}'
        print(f'{ident} {mark}: {description} [{os.path.basename(rel)}] -> {summary}{first}; AssertionError x{assertions}; {restored}', flush=True)
        if outcome != 'killed' or after != before:
            unexpected += 1
    print(f'{killed} killed, {survived} survived, {unexpected} not as expected')
    sys.exit(1 if unexpected else 0)


if __name__ == '__main__':
    main()

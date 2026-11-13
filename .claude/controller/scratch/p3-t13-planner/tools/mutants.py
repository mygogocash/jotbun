#!/usr/bin/env python3
"""P3-T13 mutation check. Usage: python3 -I mutants.py <tree root> <log dir> [ids...]

Applies each mutant alone to the tree, runs the test file that holds its guard (the three Node files with Node's test
runner; entrySave.render.test.tsx or AddTray.render.test.tsx in the render suite, whole and verbose), restores the
file byte for byte (sha256 checked) and prints one line per mutant. With ids, runs only those (the planner ran them in
batches; merge_mutants.py joins the batches). Exits 0 only when every mutant it ran ends killed and restored.
"""
from __future__ import annotations

import hashlib
import os
import re
import subprocess
import sys

ORIGIN = 'apps/app/src/wallet/add/draftOrigin.ts'
MODEL = 'apps/app/src/spend/v1/redesign/quickAddModel.ts'
REVIEW = 'apps/app/src/spend/v1/ai/draftReview.ts'
SAVE = 'apps/app/src/screens/redesign/entry/entrySave.ts'
HOST = 'apps/app/src/wallet/add/AddTrayHost.tsx'

UNIT_ORIGIN = 'src/wallet/add/draftOrigin.test.ts'
UNIT_MODEL = 'src/spend/v1/redesign/quickAddModel.test.ts'
UNIT_REVIEW = 'src/spend/v1/ai/draftReview.test.ts'
UNITS = {UNIT_ORIGIN, UNIT_MODEL, UNIT_REVIEW}
ENTRY = 'src/screens/redesign/entry/entrySave.render.test.tsx'
TRAY = 'src/wallet/add/AddTray.render.test.tsx'

MADE = "  const made = context.source === undefined ? {} : { source: context.source };\n"
TRY = """  try {
    void Promise.resolve(tally(p.outcome, p.model)).catch(() => undefined);
  } catch {
    // A tally that throws before it hands back a promise is dropped the same way.
  }
"""
BUILT = '    const built = buildQuickAdd(fields, { today, tc, source: input.source });\n'
PHOTO = ', hasPhoto: track.hasPhoto });\n'
CLOSING = """  useEffect(() => {
    if (!visible) dropUnsaved();
  }, [visible, dropUnsaved]);
"""
SAVED = '        review({ ...savedOutcome(pending.original, draftFieldsOf(saved.draft, saved.draft.amountMinor)), model: pending.model, escalated: pending.escalated });\n'
DROPPED = "    review({ outcome: 'dropped', fieldsEdited: 0, model: pending.model, escalated: pending.escalated });\n"
GUARD = '    if (locked) return;\n    dropUnsaved();\n'
ORIGINAL = '    origin.current = { source: meta.source, review: { original: draftFieldsOf(shown.draft, shown.amountMinor), model: meta.model, escalated: meta.escalated } };\n'
SHOWN = '    return { draft: next, amountMinor: applied.amountMinor ?? settledMinor(keypad) };\n'
TRACK = '      track: { source, categoryKey: analyticsCategoryKey(category), openedAt: entry.openedAt, hasPhoto: false },\n'
REGISTER = """  useEffect(() => {
    onApplier(applyAi);
    return () => onApplier(null);
  });
"""

# (id, test, description, file, [(old, new), ...]); each old must occur exactly once in the file.
MUTANTS = [
    # draftOrigin.ts, on its Node test (O10 on the tray's suite).
    ('O1', UNIT_ORIGIN, "the amount is the draft's own, not the one passed", ORIGIN, [('    amountMinor,\n', '    amountMinor: draft.amountMinor,\n')]),
    ('O2', UNIT_ORIGIN, "income takes spending's category", ORIGIN, [('draft.categoryByType[draft.type],\n', 'draft.categoryByType.expense,\n')]),
    ('O3', UNIT_ORIGIN, "a move keeps spending's category", ORIGIN, [("    categoryId: draft.type === 'transfer' ? null : draft.categoryByType[draft.type],\n", "    categoryId: draft.categoryByType[draft.type === 'transfer' ? 'expense' : draft.type],\n")]),
    ('O4', UNIT_ORIGIN, "a move's wallet is the entry's wallet", ORIGIN, [('    walletId: move ? draft.fromWalletId : draft.walletId,\n', '    walletId: draft.walletId,\n')]),
    ('O5', UNIT_ORIGIN, "a move's wallet is the one it goes to", ORIGIN, [('move ? draft.fromWalletId : draft.walletId', 'move ? draft.toWalletId : draft.walletId')]),
    ('O6', UNIT_ORIGIN, 'the date is left out', ORIGIN, [('    occurredOn: draft.occurredOn,\n', '    occurredOn: null,\n')]),
    ('O7', UNIT_ORIGIN, 'the merchant is left out', ORIGIN, [('    merchant: draft.merchant,\n', '    merchant: null,\n')]),
    ('O8', UNIT_ORIGIN, 'the note is left out', ORIGIN, [('    note: draft.note,\n', '    note: null,\n')]),
    ('O9', UNIT_ORIGIN, 'the type is always spending', ORIGIN, [('    type: draft.type,\n', "    type: 'expense',\n")]),
    ('O10', TRAY, 'a typed entry says tell_bun', ORIGIN, [("export const TYPED_ORIGIN: DraftOrigin = { source: 'typed', review: null };\n", "export const TYPED_ORIGIN: DraftOrigin = { source: 'tell_bun', review: null };\n")]),
    # quickAddModel.ts, on its Node test.
    ('Q1', UNIT_MODEL, 'the source key is there when none is given', MODEL, [(MADE, '  const made = { source: context.source };\n')]),
    ('Q2', UNIT_MODEL, 'a move leaves the source out', MODEL, [('destination_wallet_id: clean.destination_wallet_id, ...made }', 'destination_wallet_id: clean.destination_wallet_id }')]),
    ('Q3', UNIT_MODEL, 'spending and income leave the source out', MODEL, [('category_id: clean.category_id, ...made }', 'category_id: clean.category_id }')]),
    # draftReview.ts (P3-T5's m1), on its Node test.
    ('R1', UNIT_REVIEW, 'a tally that throws at once fails the review', REVIEW, [(TRY, '  void Promise.resolve(tally(p.outcome, p.model)).catch(() => undefined);\n')]),
    # entrySave.ts, on its render suite.
    ('E1', ENTRY, 'the create leaves the source out', SAVE, [(BUILT, '    const built = buildQuickAdd(fields, { today, tc });\n')]),
    ('E2', ENTRY, "the track's source goes on the create when none is named", SAVE, [(BUILT, '    const built = buildQuickAdd(fields, { today, tc, source: input.source ?? input.track?.source });\n')]),
    ('E3', ENTRY, 'record_saved leaves the photo flag out', SAVE, [(PHOTO, ' });\n')]),
    ('E4', ENTRY, 'every record_saved says it has a photo', SAVE, [(PHOTO, ', hasPhoto: true });\n')]),
    # AddTrayHost.tsx, on the tray's render suite.
    ('H1', TRAY, "the source from Bun's guesses again (the plan's mutant)", HOST, [('    const { source } = origin.current;\n', "    const source = guessed.size > 0 ? 'tell_bun' : 'typed';\n")]),
    ('H2', TRAY, "the dropped review on every render (the plan's mutant)", HOST, [(CLOSING, "  const unsaved = origin.current.review;\n  if (!visible && unsaved !== null) review({ outcome: 'dropped', fieldsEdited: 0, model: unsaved.model, escalated: unsaved.escalated });\n")]),
    ('H3', TRAY, 'no review when the tray closes', HOST, [('    if (!visible) dropUnsaved();\n', '    void visible;\n')]),
    ('H4', TRAY, 'the saved review is not taken, so the close reviews it again', HOST, [('        origin.current = { ...origin.current, review: null };\n' + SAVED, SAVED)]),
    ('H5', TRAY, 'every saved draft is kept', HOST, [(SAVED, SAVED.replace('draftFieldsOf(saved.draft, saved.draft.amountMinor)', 'pending.original'))]),
    ('H6', TRAY, 'the saved amount is not compared', HOST, [(SAVED, SAVED.replace('saved.draft.amountMinor)', 'pending.original.amountMinor)'))]),
    ('H7', TRAY, "the saved review names Haiku whatever answered", HOST, [(SAVED, SAVED.replace('model: pending.model', "model: 'claude-haiku-5-5'"))]),
    ('H8', TRAY, 'the saved review never says escalated', HOST, [(SAVED, SAVED.replace('escalated: pending.escalated', 'escalated: false'))]),
    ('H9', TRAY, 'the dropped review never says escalated', HOST, [(DROPPED, DROPPED.replace('escalated: pending.escalated', 'escalated: false'))]),
    ('H10', TRAY, 'the dropped review counts a field', HOST, [(DROPPED, DROPPED.replace('fieldsEdited: 0', 'fieldsEdited: 1'))]),
    ('H11', TRAY, 'the dropped review names Haiku whatever answered', HOST, [(DROPPED, DROPPED.replace('model: pending.model', "model: 'claude-haiku-5-5'"))]),
    ('H12', TRAY, 'a new AI draft does not drop the one before', HOST, [(GUARD, '    if (locked) return;\n')]),
    ('H13', TRAY, "the sheet's draft does not drop an AI draft", HOST, [('  const fromSheet = (filled: AiDraft) => {\n    dropUnsaved();\n', '  const fromSheet = (filled: AiDraft) => {\n')]),
    ('H14', TRAY, "the sheet's draft keeps the origin before it", HOST, [('    origin.current = SHEET_ORIGIN;\n', '')]),
    ('H15', TRAY, "the sheet's draft says photo", HOST, [("const SHEET_ORIGIN: DraftOrigin = { source: 'tell_bun', review: null };\n", "const SHEET_ORIGIN: DraftOrigin = { source: 'photo', review: null };\n")]),
    ('H16', TRAY, 'an AI draft lands while a save is on its way', HOST, [(GUARD, '    dropUnsaved();\n')]),
    ('H17', TRAY, 'an AI draft lands while the answer is unknown', HOST, [(GUARD, "    if (status === 'saving') return;\n    dropUnsaved();\n")]),
    ('H18', TRAY, "an AI draft's rows are not Bun's guesses", HOST, [('    const shown = fill(filled, true);\n', '    const shown = fill(filled, false);\n')]),
    ('H19', TRAY, "an AI draft's source is ignored", HOST, [(ORIGINAL, ORIGINAL.replace('source: meta.source', "source: 'tell_bun'"))]),
    ('H20', TRAY, "an AI draft's model is ignored", HOST, [(ORIGINAL, ORIGINAL.replace('model: meta.model', "model: 'claude-haiku-5-5'"))]),
    ('H21', TRAY, 'an AI draft never says escalated', HOST, [(ORIGINAL, ORIGINAL.replace('escalated: meta.escalated', 'escalated: false'))]),
    ('H22', TRAY, 'the original is the entry before the draft filled it', HOST, [(ORIGINAL, ORIGINAL.replace('draftFieldsOf(shown.draft, ', 'draftFieldsOf(current ?? shown.draft, '))]),
    ('H23', TRAY, "the original's amount is the keypad's before the fill", HOST, [(SHOWN, '    return { draft: next, amountMinor: settledMinor(keypad) };\n')]),
    ('H24', TRAY, "the original's amount is Bun's alone", HOST, [(SHOWN, '    return { draft: next, amountMinor: applied.amountMinor };\n')]),
    ('H25', TRAY, 'the keypad never settles on an amount', HOST, [('  return settled.outcome.ok ? settled.outcome.minor : null;\n', '  return null;\n')]),
    ('H26', TRAY, "the track's source is always typed", HOST, [(TRACK, TRACK.replace('track: { source, ', "track: { source: 'typed', "))]),
    ('H27', TRAY, 'the save names no source', HOST, [('      wallets,\n      source,\n' + TRACK, '      wallets,\n' + TRACK)]),
    ('H28', TRAY, 'every save says it has a photo', HOST, [(TRACK, TRACK.replace('hasPhoto: false', 'hasPhoto: true'))]),
    ('H29', TRAY, "the host's applyAiDraft reaches nothing", HOST, [('    const applyAiDraft = (draft: AiDraft, meta: AiDraftMeta) => applier.current?.(draft, meta);\n', '    const applyAiDraft = (draft: AiDraft, meta: AiDraftMeta) => { void draft; void meta; };\n')]),
    ('H30', TRAY, "the host keeps the entry's first rule", HOST, [(REGISTER, REGISTER.replace('  });\n', '  }, []);\n'))]),
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
    if test_file in UNITS:
        command = ['npm', 'run', 'test:unit', '--', test_file]
    else:
        command = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', test_file]
    done = subprocess.run(command, cwd=app, capture_output=True, text=True, timeout=900)
    return done.returncode, done.stdout + done.stderr


def summary_of(test_file, output):
    if test_file in UNITS:
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

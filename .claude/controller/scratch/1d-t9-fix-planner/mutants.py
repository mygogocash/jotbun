#!/usr/bin/env python3
"""1D-T9 fix-round mutants. Usage: python3 -I mutants.py <app dir> [mutant ids...]

The planner's 30 (U3, C1 and C2 rewritten for the fix's new order) and the
fix round's 15: X1 to X9 for the new guards, Q4 to Q94 for the pins.

<app dir> is a checkout's apps/app (the implementer's: WT/apps/app). For each
mutant: record the file's SHA-256, apply one exact replacement (it must match
once), run the focused tests, restore the file and check the SHA-256 again.
A mutant is killed when the focused run fails. Logs go next to this script,
under mutant-logs/ (or MUTANT_LOGS when set).
"""
import hashlib
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LOGS = os.environ.get('MUTANT_LOGS', os.path.join(HERE, 'mutant-logs'))

RA = 'src/screens/redesign/record/recordActions.ts'
CP = 'src/screens/redesign/conflict/ChoicePanel.tsx'
SH = 'src/spend/v1/redesign/shared.ts'
FF = 'src/config/featureFlags.ts'
HS = 'src/screens/redesign/HistoryScreen.tsx'
RS = 'src/screens/redesign/RecordScreen.tsx'

RECORD = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', 'src/screens/redesign/RecordScreen.render.test.tsx']
PANEL = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', 'src/screens/redesign/conflict/ChoicePanel.render.test.tsx']
HISTORY = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', 'src/screens/redesign/HistoryScreen.render.test.tsx', '-t', 'waiting for a choice']
UNIT = ['node', 'scripts/test-unit.mjs']

# id: (why, file, old, new, command)
MUTANTS = {
    # The plan's four (Step 6).
    'P1': ("plan: send yours on the original version", RA,
           "const sent = resendForChoice(choice, server);",
           "const sent = resendForChoice(choice, choice.original);", RECORD + ['-t', 'use yours sends']),
    'P2': ("plan: drop the choice on Decide later", RA,
           "    leaving.current = true;\n    goBack();\n  };",
           "    leaving.current = true;\n    void dropOpen();\n    goBack();\n  };", RECORD + ['-t', 'decide later keeps']),
    'P3': ("plan: show the panel against the stored record while online", RA,
           "        if (choiceSettled(choice, record)) {",
           "        if (turn === generation.current) { setEditing(editingFromChoice(choice, choice.server)); return; }\n        if (choiceSettled(choice, record)) {",
           RECORD + ['-t', 'already holds|decide later keeps']),
    'P4': ("plan: send conflict_shown on every render of the panel", RA,
           "    if (model.kind === 'changed') {\n      choicePanel = {",
           "    if (model.kind === 'changed') {\n      trackConflictShown({ screen: RECORD_SCREEN });\n      choicePanel = {",
           RECORD + ['-t', 'conflict_shown is sent once']),
    # Further guards.
    'F1': ("the conflict area approved before E2", FF,
           "const APPROVED: readonly RedesignArea[] = ['core', 'planning', 'insights', 'account', 'import', 'companion'];",
           "const APPROVED: readonly RedesignArea[] = ['core', 'planning', 'insights', 'account', 'import', 'companion', 'conflict'];",
           UNIT + ['src/config/featureFlags.test.ts']),
    'F2': ("the flow runs with the area off", RA,
           "const choicesOn = input.conflictArea ?? isRedesignEnabled('conflict');",
           "const choicesOn = input.conflictArea ?? true;", RECORD + ['-t', 'area off']),
    'S1': ("every confirmed row marked", SH,
           "choicePending: context.pendingChoiceIds?.has(record.id) ?? false,",
           "choicePending: true,", UNIT + ['src/spend/v1/redesign/historyModel.test.ts']),
    'S2': ("a draft marked by its record id", SH,
           "canEdit: false, choicePending: false,",
           "canEdit: false, choicePending: context.pendingChoiceIds?.has(entry.id) ?? false,", UNIT + ['src/spend/v1/redesign/historyModel.test.ts']),
    'H1': ("History marks rows with the area off", HS,
           "diaryView.phase === 'ready' && (conflictArea ?? isRedesignEnabled('conflict')) ? diaryView.pendingChoices : NO_CHOICES",
           "diaryView.phase === 'ready' ? diaryView.pendingChoices : NO_CHOICES", HISTORY),
    'H2': ("History never marks", HS,
           "{choicePending ? <ChoiceWaitingCaption /> : null}", "{null}", HISTORY),
    'K1': ("a locked diary still keeps the choice", RA,
           "if (diary && diary.getView().phase === 'ready') {", "if (diary) {", RECORD + ['-t', 'cannot keep']),
    'K2': ("Decide later offered when the phone cannot keep the choice", RA,
           "onDecideLater: open.kept ? decideLater : undefined,", "onDecideLater: decideLater,", RECORD + ['-t', 'cannot keep']),
    'K3': ("the cannot-keep line never shown", RA,
           "note: open.kept ? null : copy('cannotKeep'),", "note: null,", RECORD + ['-t', 'cannot keep']),
    'U1': ("an unknown Use yours settles its key", RA,
           "      if (!saved.unconfirmed) keys.settle(slot);\n      const current = problem",
           "      keys.settle(slot);\n      const current = problem", RECORD + ['-t', 'unconfirmed "use yours"']),
    'U2': ("the panel stays up while frozen", RA,
           "if (choicesOn && open && editing?.conflict && !editing.unconfirmed) {", "if (choicesOn && open && editing?.conflict) {",
           RECORD + ['-t', 'unconfirmed "use yours"']),
    'U3': ("Use yours keeps the choice after the acknowledgement", RA,
           "      setNotice(null);\n      await dropOpen();\n    } catch",
           "      setNotice(null);\n    } catch", RECORD + ['-t', 'use yours sends|acknowledged the choice is gone']),
    'C1': ("Use the server's keeps the choice", RA,
           "    cancelEditing();\n    await dropOpen();\n    void load();",
           "    cancelEditing();\n    void load();", RECORD + ['-t', "server's version sends nothing"]),
    'C2': ("Use the server's leaves without cancelEditing (the notice stays)", RA,
           "    cancelEditing();\n    await dropOpen();\n    void load();",
           "    setEditing(null);\n    await dropOpen();\n    void load();", RECORD + ['-t', 'usable record reads']),
    'C3': ("Use yours changed again: the newer record not kept", RA,
           "        await keepOpen({ ...choice, server: snapshot, refusedAt: clock() });\n        trackConflictShown",
           "        trackConflictShown", RECORD + ['-t', 'yet another change']),
    'O1': ("offline still sends yours", RA, "canSendYours: !offline,", "canSendYours: true,", RECORD + ['-t', 'offline, the choice']),
    'O2': ("offline shows the load problem instead of the stored choice", RA,
           "      if (choice && unreachable(error)) {", "      if (choice && unreachable(error) && false) {", RECORD + ['-t', 'offline, the choice']),
    'D1': ("no Discard my change", RA, "choicePanel, discardChoice: open ? dropOpen : null,", "choicePanel, discardChoice: null,",
           RECORD + ['-t', 'deleted record offers']),
    'E1': ("conflict_shown names the record's own path", RA,
           "          trackConflictShown({ screen: RECORD_SCREEN });\n        }\n        setEditing({ ...current, draft, keypad, errors: {}",
           "          trackConflictShown({ screen: `/spend/record/${result.id}` });\n        }\n        setEditing({ ...current, draft, keypad, errors: {}",
           RECORD + ['-t', 'conflict_shown is sent once']),
    'E2': ("the refusal keeps no choice", RA,
           "          await keepOpen({ recordId: result.id, original: draft.original, changes: result.changes, server: snapshot, editedAt, refusedAt: clock() });\n",
           "", RECORD + ['-t', 'refused edit is kept']),
    'V1': ("the panel's cards start on the server's", CP,
           "const [chosen, setChosen] = useState<Side>('yours');", "const [chosen, setChosen] = useState<Side>('server');", PANEL),
    'V2': ("the main button always sends yours", CP,
           "onPress={yoursChosen ? onUseYours : onUseServer}", "onPress={onUseYours}", PANEL + ['-t', 'main button follows']),
    'V3': ("a differing field marked by weight only", CP,
           "{row.differs ? <BunText variant=\"caption\" style={{ fontWeight: '700' }}>{differs}</BunText> : null}", "{null}",
           PANEL + ['-t', 'radio card']),
    'V4': ("Decide later shown without onDecideLater", CP,
           "{onDecideLater ? (", "{true ? (", PANEL + ['-t', 'without onDecideLater']),
    'V5': ("the cards never stack", CP,
           "flexDirection: large ? 'column' : 'row'", "flexDirection: 'row'", PANEL + ['-t', 'stack']),
    'V6': ("offline does not disable yours", CP, "disabled={blocked}", "disabled={false}", PANEL + ['-t', 'main button follows']),
    # The fix round (review of 7f25a65): the new guards.
    'X1': ("M1: Use the server's drops before it leaves the edit", RA,
           "    cancelEditing();\n    await dropOpen();\n    void load();",
           "    await dropOpen();\n    cancelEditing();\n    void load();", RECORD + ['-t', "choosing the server's version never shows"]),
    'X2': ("M1: an acknowledged Use yours drops before it closes the edit", RA,
           "      setEditing(null);\n      setNotice(null);\n      await dropOpen();\n    } catch",
           "      await dropOpen();\n      setEditing(null);\n      setNotice(null);\n    } catch", RECORD + ['-t', 'acknowledged "use yours" never shows']),
    'X3': ("m1: no read when the diary shows a choice later", RA,
           "    if (heldHere && !openRef.current && !editingRef.current) void load();",
           "    if (false && heldHere && !openRef.current && !editingRef.current) void load();", RECORD + ['-t', 'the diary finds after the record has loaded']),
    'X4': ("m1: the re-read runs with the area off", RA,
           "const heldHere = choicesOn && diaryView.phase === 'ready'", "const heldHere = diaryView.phase === 'ready'",
           RECORD + ['-t', 'a diary that opens with a kept choice changes nothing']),
    'X5': ("m1: the re-read ignores a choice already open", RA,
           "    if (heldHere && !openRef.current && !editingRef.current) void load();",
           "    if (heldHere && !editingRef.current) void load();", RECORD + ['-t', "History's Edit on a record with a choice"]),
    'X6': ("m1: the re-read replaces an edit in progress", RA,
           "    if (heldHere && !openRef.current && !editingRef.current) void load();",
           "    if (heldHere && !openRef.current) void load();", RECORD + ['-t', 'never replaces the edit in progress']),
    'X7': ("m2: a choice not kept again is never dropped from the diary", RA,
           "    if (current && diary) await diary.dropChoice", "    if (current?.kept && diary) await diary.dropChoice",
           RECORD + ['-t', 'cannot keep again still leaves the diary']),
    'X8': ("m2: the reload re-adopts the choice declined here", RA,
           "openRef.current?.choice ?? (declined.current ? null : storedChoice())", "openRef.current?.choice ?? storedChoice()",
           RECORD + ['-t', 'cannot drop the choice shows the record']),
    'X9': ("m2: Use the server's never marks the choice declined", RA,
           "    declined.current = true;\n", "", RECORD + ['-t', 'cannot drop the choice shows the record']),
    # The fix round: pins on behaviour 7f25a65 already had (review m3, ruling R94).
    'Q4': ("an unavailable read not offline", RA,
           "(error.outcome === 'network' || error.outcome === 'unavailable')", "(error.outcome === 'network')",
           RECORD + ['-t', 'unavailable counts as offline']),
    'Q6': ("Use yours on a deleted record not treated as gone", RA,
           "      if (outcome === 'deleted' || outcome === 'not_found' || (outcome === 'conflict' && snapshot?.deleted_at)) {\n        // Gone:",
           "      if (false) {\n        // Gone:", RECORD + ['-t', 'meeting a record deleted elsewhere']),
    'Q7': ("no conflict_shown when Use yours meets another change", RA,
           "        await keepOpen({ ...choice, server: snapshot, refusedAt: clock() });\n        trackConflictShown({ screen: RECORD_SCREEN });",
           "        await keepOpen({ ...choice, server: snapshot, refusedAt: clock() });", RECORD + ['-t', 'sent again when']),
    'Q9': ("the choice path leaves autoEdit on", RA,
           "        // Opening a record that has a choice reads the record first.\n        autoEdit.current = false;\n",
           "        // Opening a record that has a choice reads the record first.\n", RECORD + ['-t', "History's Edit on a record with a choice"]),
    'Q11': ("no Discard my change on a missing record", RS,
            "tc(\"This entry isn't in your diary.\")} />\n          {discardMine}", "tc(\"This entry isn't in your diary.\")} />",
            RECORD + ['-t', 'record that is no longer there']),
    'Q94': ("R94: an edit refused for a deleted record keeps a choice", RA,
            "deleted_at)) {\n        setEditing(null);\n        setGone(true);",
            "deleted_at)) {\n        if (choicesOn && snapshot) await keepOpen({ recordId: result.id, original: draft.original, changes: result.changes, server: snapshot, editedAt, refusedAt: clock() });\n        setEditing(null);\n        setGone(true);",
            RECORD + ['-t', 'keeps no choice']),
}


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def main():
    app = os.path.abspath(sys.argv[1])
    wanted = sys.argv[2:] or list(MUTANTS)
    os.makedirs(LOGS, exist_ok=True)
    results = []
    for mid in wanted:
        why, rel, old, new, command = MUTANTS[mid]
        path = os.path.join(app, rel)
        before = sha(path)
        with open(path, encoding='utf-8') as handle:
            original = handle.read()
        if original.count(old) != 1:
            results.append((mid, 'NOT APPLIED', f'pattern matches {original.count(old)} times'))
            continue
        try:
            with open(path, 'w', encoding='utf-8') as handle:
                handle.write(original.replace(old, new))
            run = subprocess.run(command, cwd=app, capture_output=True, text=True, timeout=600)
        finally:
            with open(path, 'w', encoding='utf-8') as handle:
                handle.write(original)
        restored = sha(path) == before
        log = os.path.join(LOGS, f'{mid}.log')
        with open(log, 'w', encoding='utf-8') as handle:
            handle.write(run.stdout + run.stderr)
        summary = [line.strip() for line in (run.stdout + run.stderr).splitlines() if line.strip().startswith(('Tests ', 'ℹ fail', 'ℹ pass'))]
        verdict = 'KILLED' if run.returncode != 0 else 'SURVIVED'
        results.append((mid, verdict, f"{why}; {' | '.join(summary)}; restored={restored}"))
        if not restored:
            print(f'{mid}: checksum differs after restore', file=sys.stderr)
            sys.exit(2)
    for mid, verdict, detail in results:
        print(f'{mid} {verdict}: {detail}')
    sys.exit(0 if all(verdict == 'KILLED' for _, verdict, _ in results) else 1)


if __name__ == '__main__':
    main()

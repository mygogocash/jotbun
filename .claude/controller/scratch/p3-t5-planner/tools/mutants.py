#!/usr/bin/env python3
"""P3-T5 mutation check. Usage: python3 -I mutants.py <tree root> <log dir> [ids...]

Applies each mutant alone to the tree, runs its focused file (events.test.ts,
draftReview.test.ts or draftTally.test.ts under Node; the render file under
vitest), restores the file byte for byte (sha256 checked) and prints one line
per mutant. Exits 0 only when every mutant ends as expected.
"""
import hashlib
import os
import re
import subprocess
import sys

EVENTS = 'apps/app/src/analytics/events.ts'
REVIEW = 'apps/app/src/spend/v1/ai/draftReview.ts'
HOOK = 'apps/app/src/spend/v1/ai/useDraftReview.ts'
TALLY = 'apps/app/src/dev/draftTally.ts'

N_EVENTS = ['npm', 'run', 'test:unit', '--', 'src/analytics/events.test.ts']
N_REVIEW = ['npm', 'run', 'test:unit', '--', 'src/spend/v1/ai/draftReview.test.ts']
N_TALLY = ['npm', 'run', 'test:unit', '--', 'src/dev/draftTally.test.ts']
RENDER = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', 'src/spend/v1/ai/useDraftReview.render.test.tsx']
NODE = (N_EVENTS, N_REVIEW, N_TALLY)
# The release probe: Metro's release transform of the hook, as tools/release-fold.cjs says ({root} is the tree).
FOLD = ['node', '/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p3-t5-planner/tools/release-fold.cjs', '{root}', 'src/spend/v1/ai/useDraftReview.ts']

CLAMP = '  return Math.min(20, Math.max(0, Math.round(value)));\n'
QUEUE = '  const run = queue.then(work);\n  queue = run.catch(() => undefined);\n  return run;\n'
PARSE = '  try {\n    return JSON.parse(stored);\n  } catch {\n    return null;\n  }\n'
COUNTS = "  return { kept: countOf(fieldOf(value, 'kept')),"
BODY = '  trackAiDraftReviewed(p);\n  if (tally === undefined) return;\n  void Promise.resolve(tally(p.outcome, p.model)).catch(() => undefined);\n'
DEV_TALLY = "    ? (outcome, model) => import('@mobile/dev/draftTally').then((dev) => dev.addDraftOutcome(outcome, model))\n"

# (id, expectation, description, file, command, [(old, new), ...]); each old must occur exactly once.
MUTANTS = [
    # events.ts: events.test.ts
    ('E1', 'killed', 'has_photo sent false whatever the flag (the head\'s line)', EVENTS, N_EVENTS, [('    has_photo: p.hasPhoto === true,\n', '    has_photo: false,\n')]),
    ('E2', 'killed', 'has_photo left out when the flag is absent', EVENTS, N_EVENTS, [('    has_photo: p.hasPhoto === true,\n', '    has_photo: p.hasPhoto,\n')]),
    ('E3', 'killed', "fields_edited sent unclamped (the plan's mutant)", EVENTS, N_EVENTS, [('fields_edited: fieldsEditedCount(p.fieldsEdited)', 'fields_edited: p.fieldsEdited')]),
    ('E4', 'killed', 'fields_edited not held at 20', EVENTS, N_EVENTS, [(CLAMP, '  return Math.max(0, Math.round(value));\n')]),
    ('E5', 'killed', 'fields_edited below zero kept', EVENTS, N_EVENTS, [(CLAMP, '  return Math.min(20, Math.round(value));\n')]),
    ('E6', 'killed', 'fields_edited not rounded', EVENTS, N_EVENTS, [(CLAMP, '  return Math.min(20, Math.max(0, value));\n')]),
    ('E7', 'killed', 'a value that is not a number not sent as 0', EVENTS, N_EVENTS, [('function fieldsEditedCount(value: number): number {\n  if (!Number.isFinite(value)) return 0;\n', 'function fieldsEditedCount(value: number): number {\n')]),
    ('E8', 'killed', "helpful sent as edited (the plan's mutant)", EVENTS, N_EVENTS, [("outcome: p.helpful ? 'kept' : 'dropped'", "outcome: p.helpful ? 'edited' : 'dropped'")]),
    ('E9', 'killed', 'helpful and not helpful swapped', EVENTS, N_EVENTS, [("outcome: p.helpful ? 'kept' : 'dropped'", "outcome: p.helpful ? 'dropped' : 'kept'")]),
    ('E10', 'killed', 'tell_bun_sent never escalated', EVENTS, N_EVENTS, [("emit('tell_bun_sent', { model: p.model, escalated: p.escalated });", "emit('tell_bun_sent', { model: p.model, escalated: false });")]),
    ('E11', 'killed', 'ask_bun_asked always names the rules', EVENTS, N_EVENTS, [("emit('ask_bun_asked', { model: p.model, escalated: p.escalated });", "emit('ask_bun_asked', { model: 'rules', escalated: p.escalated });")]),
    ('E12', 'killed', 'the reason code sent under a name the allow-list does not hold', EVENTS, N_EVENTS, [('{ reason_code: p.reasonCode, screen: p.screen }', '{ reasonCode: p.reasonCode, screen: p.screen }')]),
    ('E13', 'killed', 'ai_unavailable without its screen', EVENTS, N_EVENTS, [('{ reason_code: p.reasonCode, screen: p.screen }', '{ reason_code: p.reasonCode }')]),
    ('E14', 'killed', 'ai_consent_changed never sent', EVENTS, N_EVENTS, [("  emit('ai_consent_changed');\n", '')]),
    ('E15', 'killed', 'ai_draft_reviewed always kept', EVENTS, N_EVENTS, [("emit('ai_draft_reviewed', { outcome: p.outcome,", "emit('ai_draft_reviewed', { outcome: 'kept',")]),
    # draftReview.ts: draftReview.test.ts
    ('R1', 'killed', "'' and null counted as an edit", REVIEW, N_REVIEW, [("  return (before ?? '') === (after ?? '');\n", '  return before === after;\n')]),
    ('R2', 'killed', 'the type not counted', REVIEW, N_REVIEW, [("['type', 'amountMinor',", "['amountMinor',")]),
    ('R3', 'killed', 'the note not counted', REVIEW, N_REVIEW, [("'merchant', 'note'];", "'merchant'];")]),
    ('R4', 'killed', 'every saved draft kept', REVIEW, N_REVIEW, [("outcome: edited === 0 ? 'kept' : 'edited'", "outcome: 'kept'")]),
    ('R5', 'killed', "savedOutcome's count always 0", REVIEW, N_REVIEW, [("'edited', fieldsEdited: edited }", "'edited', fieldsEdited: 0 }")]),
    ('R6', 'killed', 'the review never sent', REVIEW, N_REVIEW, [('  trackAiDraftReviewed(p);\n', '')]),
    ('R7', 'killed', 'the tally before the event', REVIEW, N_REVIEW, [(BODY, '  if (tally !== undefined) void Promise.resolve(tally(p.outcome, p.model)).catch(() => undefined);\n  trackAiDraftReviewed(p);\n')]),
    ('R8', 'killed', 'the tally given the rules for every model', REVIEW, N_REVIEW, [('tally(p.outcome, p.model)', "tally(p.outcome, 'rules')")]),
    ('R9', 'killed', 'a failed tally left unhandled', REVIEW, N_REVIEW, [('  void Promise.resolve(tally(p.outcome, p.model)).catch(() => undefined);\n', '  void Promise.resolve(tally(p.outcome, p.model));\n')]),
    ('R10', 'killed', 'a review with no tally throws', REVIEW, N_REVIEW, [('  if (tally === undefined) return;\n', '')]),
    # useDraftReview.ts: draftReview.test.ts (Node) or the render file (a development build)
    ('U1', 'killed', "__DEV__ read bare (the plan's mutant)", HOOK, N_REVIEW, [("  typeof __DEV__ !== 'undefined' && __DEV__\n", '  __DEV__\n')]),
    ('U2', 'killed', 'no tally in a development build', HOOK, RENDER, [(DEV_TALLY, '    ? undefined\n')]),
    ('U3', 'killed', 'the tally counts every review under the rules', HOOK, RENDER, [('dev.addDraftOutcome(outcome, model)', "dev.addDraftOutcome(outcome, 'rules')")]),
    ('U4', 'killed', 'the tally counts every review as kept', HOOK, RENDER, [('dev.addDraftOutcome(outcome, model)', "dev.addDraftOutcome('kept', model)")]),
    ('U5', 'killed', 'a new function for each call', HOOK, N_REVIEW, [('  return review;\n', '  return (p) => review(p);\n')]),
    # useDraftReview.ts: the release probe (Metro's release transform keeps the tally)
    ('F1', 'killed', 'the tally kept in a release build (only typeof __DEV__ checked)', HOOK, FOLD, [("  typeof __DEV__ !== 'undefined' && __DEV__\n", "  typeof __DEV__ !== 'undefined'\n")]),
    ('F2', 'killed', 'the tally imported statically', HOOK, FOLD, [("import { reviewDraft } from './draftReview.ts';\n", "import { addDraftOutcome } from '@mobile/dev/draftTally';\nimport { reviewDraft } from './draftReview.ts';\n"), (DEV_TALLY, '    ? (outcome, model) => addDraftOutcome(outcome, model)\n')]),
    # draftTally.ts: draftTally.test.ts
    ('D1', 'killed', 'no queue: reads and writes run at once', TALLY, N_TALLY, [(QUEUE, '  return work();\n')]),
    ('D2', 'killed', 'a failed write stops the queue', TALLY, N_TALLY, [('  queue = run.catch(() => undefined);\n', '  queue = run;\n')]),
    ('D3', 'killed', 'a read does not wait for the counts asked before it', TALLY, N_TALLY, [('  return serially(async () => tallyOf(await (await storeOf(backend)).getItem(DRAFT_TALLY_KEY)));\n', '  return (async () => tallyOf(await (await storeOf(backend)).getItem(DRAFT_TALLY_KEY)))();\n')]),
    ('D4', 'killed', 'words in a stored count kept', TALLY, N_TALLY, [(COUNTS, "  return { ...(value as object), kept: countOf(fieldOf(value, 'kept')),")]),
    ('D5', 'killed', 'a count below zero kept', TALLY, N_TALLY, [('Number.isSafeInteger(value) && (value as number) >= 0', 'Number.isSafeInteger(value)')]),
    ('D6', 'killed', 'a fractional count kept', TALLY, N_TALLY, [('Number.isSafeInteger(value) && (value as number) >= 0', "typeof value === 'number' && (value as number) >= 0")]),
    ('D7', 'killed', 'a stored value that is not JSON throws', TALLY, N_TALLY, [(PARSE, '  return JSON.parse(stored);\n')]),
    ('D8', 'killed', 'a stored null read as an object', TALLY, N_TALLY, [("typeof value === 'object' && value !== null ?", "typeof value === 'object' ?")]),
    ('D9', 'killed', 'reset keeps the tally', TALLY, N_TALLY, [('    await (await storeOf(backend)).removeItem(DRAFT_TALLY_KEY);\n', '    await storeOf(backend);\n')]),
    ('D10', 'killed', 'every outcome counted as kept', TALLY, N_TALLY, [('    tally[model][outcome] += 1;\n', '    tally[model].kept += 1;\n')]),
    ('D11', 'killed', 'the backend passed is ignored', TALLY, N_TALLY, [('  if (backend !== undefined) return backend;\n', '')]),
    ('D12', 'killed', "the tally kept under another key than P3-T22's marker", TALLY, N_TALLY, [("export const DRAFT_TALLY_KEY = 'jotbun.dev.draft-tally';", "export const DRAFT_TALLY_KEY = 'jotbun.wallet.draft-tally';")]),
]

SUMMARY = re.compile(r'^\s*Tests  (.+?)\s*$', re.M)
FAILED = re.compile(r'^\s*×\s+\S+\s+>\s+(.+?)\s+\d+ms\s*$', re.M)
NODE_TOTALS = re.compile(r'^ℹ (tests|pass|fail) (\d+)', re.M)
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
            run = subprocess.run([part.replace('{root}', root) for part in command], cwd=app, capture_output=True, text=True, timeout=900)
            output = run.stdout + run.stderr
        finally:
            with open(path, 'wb') as handle:
                handle.write(original)
        after = sha(path)
        with open(os.path.join(logs, f'{ident}.log'), 'w', encoding='utf-8') as handle:
            handle.write(output)
        if command is FOLD:
            lines = [line for line in output.splitlines() if line.strip()]
            summary = lines[-1] if lines else 'no output'
            failed = []
        elif command in NODE:
            totals = dict(NODE_TOTALS.findall(output))
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

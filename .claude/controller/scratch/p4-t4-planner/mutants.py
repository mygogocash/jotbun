"""P4-T4's mutants: one per new guard, each run against the test file that should kill it.

Usage: python3 -I mutants.py --tree <tree> --out <log dir> --batch <1-3>
       python3 -I mutants.py --tree <tree> --out <log dir> --only ID,ID

Each mutant replaces exact text (each `old` must occur exactly once in its file),
runs its test file, and restores the file byte for byte (checked by SHA-256).
A mutant counts as killed by an assertion only when its run exits non-zero and
every failing case failed on an assertion: in the vitest log, the first error
under each FAIL header is an AssertionError. `node` mutants run the focused
Node file (test/slip-read-import.test.ts); `workers` mutants run P3's
test/workers/slip-read.test.ts under the heavy lock, through locked.sh beside
this script, to show P3's own pins still hold the call code both modes share.
Each batch fits a 10-minute tool call. The last line reads:
"<k> of <n> killed; survivors [...]; other failures [...]; not restored [...]".
"""
from __future__ import annotations

import argparse
import hashlib
import os
import re
import subprocess
import sys

KIT = os.path.dirname(os.path.abspath(__file__))

READ = 'apps/edge/src/v1/ai/slip-read.ts'
IMPORT = 'apps/edge/src/v1/ai/slip-import.ts'

IMPORT_TEXT = 'text: JSON.stringify({ today: input.context.today, locale: input.locale }),'
HAIKU_FAILED_IMPORT = ("  if (haiku.kind === 'failed') throw new SlipNotRead(haiku.failure, lastWait(deps.trace))\n"
                       "  if (haiku.kind === 'answer' && missingImportFields")
HAIKU_FAILED_SINGLE = ("  if (haiku.kind === 'failed') throw new SlipNotRead(haiku.failure, lastWait(deps.trace))\n"
                       "  if (haiku.kind === 'answer' && !slipNeedsOpus")
OPUS_FAILED_IMPORT = ("  if (opus.kind === 'failed') throw new SlipNotRead(opus.failure, lastWait(deps.trace))\n"
                      "  // Opus answered, and neither model read a bank slip.\n")
OPUS_FAILED_SINGLE = ("  if (opus.kind === 'failed') throw new SlipNotRead(opus.failure, lastWait(deps.trace))\n"
                      "  // Opus answered and found nothing either")
OPUS_WINS = "  if (opus.kind === 'answer') return done(opus.read, OPUS, [haiku, opus])\n"
HAIKU_STANDS = "  if (haiku.kind === 'answer') return done(haiku.read, HAIKU, [haiku, opus])\n"
COMPLETE = "  if (haiku.kind === 'answer' && missingImportFields(haiku.read).length === 0) return done(haiku.read, HAIKU, [haiku])\n"
GUARDED = ("  let read: SlipImportRead | null\n"
           "  try {\n"
           "    read = sanitizeSlipImportRead(answer.raw, input.context.today)\n"
           "  } catch {\n"
           "    // A read the sanitizer cannot take is unusable, so Opus reads it again, as a single read's draft is.\n"
           "    return { kind: 'unusable' }\n"
           "  }\n")
REFUSAL = "error instanceof ModelUnavailable && error.reason === 'refusal' ? { kind: 'declined' } : { kind: 'unusable' }"
FILTER = "  return SLIP_IMPORT_REQUIRED.filter((path) => at[path] === null)\n"


def skip(path: str) -> tuple[str, str]:
    """missingImportFields never names `path`: a read missing only it is not read again."""
    return (FILTER, f"  return SLIP_IMPORT_REQUIRED.filter((path) => path !== '{path}' && at[path] === null)\n")


# (id, what it breaks, file, [(old, new), ...], test kind)
MUTANTS = [
    # The plan's six (Step 5).
    ('P1', "send the wallet list (the plan's mutant)", READ,
     [(IMPORT_TEXT, 'text: JSON.stringify({ today: input.context.today, locale: input.locale, ...draftChoices(input.context) }),')], 'node'),
    ('P2', "keep five digits (the plan's mutant)", IMPORT,
     [("account_last4: typeof raw.account_last4 === 'string' ? accountLast4(raw.account_last4) : null,",
       "account_last4: typeof raw.account_last4 === 'string' ? raw.account_last4.replace(/[^0-9]/g, '').slice(-5) || null : null,")], 'node'),
    ('P3', "skip the re-read on a missing name (the plan's mutant)", IMPORT, [skip('to.name')], 'node'),
    ('P4', "skip the re-read of an unreadable answer (the plan's mutant)", READ,
     [(HAIKU_FAILED_IMPORT, HAIKU_FAILED_IMPORT.replace("  if (haiku.kind === 'answer' && missingImportFields",
                                                        "  if (haiku.kind === 'unusable') return done(null, HAIKU, [haiku])\n  if (haiku.kind === 'answer' && missingImportFields"))], 'node'),
    ('P5', "leave retryAfterSeconds null (the plan's mutant)", READ,
     [(HAIKU_FAILED_IMPORT, HAIKU_FAILED_IMPORT.replace('SlipNotRead(haiku.failure, lastWait(deps.trace))', 'SlipNotRead(haiku.failure)'))], 'node'),
    ('P6', "give a single read import: null (the plan's mutant)", READ,
     [('SlipRead => settled(read, model, outcomes, deps.trace.calls.slice(first))\n',
       'SlipRead => ({ ...settled(read, model, outcomes, deps.trace.calls.slice(first)), import: null as never })\n')], 'node'),
    # The import flow (readSlipImport, importOnce).
    ('F1', 'the options are ignored: no import mode', READ, [("  if (options.fields === 'import') return readSlipImport(input, deps)\n", '')], 'node'),
    ('F2', 'the import mode is the default', READ, [("if (options.fields === 'import')", "if (options.fields !== 'single')")], 'node'),
    ('F3', "Haiku's import read is not capped", READ,
     [("importOnce(input, deps, haikuRequest('medium', 8_000), false, HAIKU_SLIP_CAP_MS)", "importOnce(input, deps, haikuRequest('medium', 8_000), false)")], 'node'),
    ('F4', "Opus's import call is not marked escalated in the trace", READ,
     [("importOnce(input, deps, opusRequest('medium', 8_000), true)", "importOnce(input, deps, opusRequest('medium', 8_000), false)")], 'node'),
    ('F5', "Opus is asked on Haiku's base", READ,
     [("importOnce(input, deps, opusRequest('medium', 8_000), true)", "importOnce(input, deps, haikuRequest('medium', 8_000), true)")], 'node'),
    ('F6', 'a complete Haiku read is read again anyway', READ, [(COMPLETE, '')], 'node'),
    ('F7', "Haiku's read wins over Opus's", READ, [(OPUS_WINS + HAIKU_STANDS, HAIKU_STANDS + OPUS_WINS)], 'node'),
    ('F8', "Haiku's read is dropped when Opus fails (A14)", READ, [(HAIKU_STANDS, '')], 'node'),
    ('F9', 'no SlipNotRead when Opus fails after Haiku read no bank slip', READ,
     [(OPUS_FAILED_IMPORT, "  // Opus answered, and neither model read a bank slip.\n")], 'node'),
    ('F10', "Opus's failure loses its wait", READ,
     [(OPUS_FAILED_IMPORT, OPUS_FAILED_IMPORT.replace('SlipNotRead(opus.failure, lastWait(deps.trace))', 'SlipNotRead(opus.failure)'))], 'node'),
    ('F11', "the wait is read from the trace's first call", READ, [('trace.calls.at(-1)?.retryAfterSeconds', 'trace.calls[0]?.retryAfterSeconds')], 'node'),
    ('F12', "the read's bank is the receiver's", READ, [('bank: read.from.bank }', 'bank: read.to.bank }')], 'node'),
    ('F13', 'an unreadable result carries import: null', READ, [('    return read ? { ...result, import: read } : result\n', '    return { ...result, import: read as never }\n')], 'node'),
    ('F14', "the import read's tokens count the whole trace", READ,
     [('    const result = settled(shown, model, outcomes, deps.trace.calls.slice(first))\n', '    const result = settled(shown, model, outcomes, deps.trace.calls.slice(0))\n')], 'node'),
    ('F15', 'a read the sanitizer cannot take crashes the read', READ, [(GUARDED, '  const read = sanitizeSlipImportRead(answer.raw, input.context.today)\n')], 'node'),
    ('F16', 'the import call uses the single prompt', READ, [('    system: SLIP_IMPORT_SYSTEM,\n', '    system: SLIP_SYSTEM,\n')], 'node'),
    ('F17', 'the import call uses the single schema', READ, [('    schema: SLIP_IMPORT_SCHEMA,\n', '    schema: SLIP_SCHEMA,\n')], 'node'),
    ('F18', "Opus's read is shown as not escalated", READ, [(OPUS_WINS, "  if (opus.kind === 'answer') return done(opus.read, OPUS, [opus])\n")], 'node'),
    ('F19', "Haiku's read after Opus is shown as not escalated", READ, [(HAIKU_STANDS, "  if (haiku.kind === 'answer') return done(haiku.read, HAIKU, [haiku])\n")], 'node'),
    ('F20', "an unreadable result names Haiku", READ, [('  return done(null, OPUS, [haiku, opus])\n', '  return done(null, HAIKU, [haiku, opus])\n')], 'node'),
    ('F21', "Opus's slip read loses when it misses a field too", READ,
     [(OPUS_WINS, "  if (opus.kind === 'answer' && missingImportFields(opus.read).length === 0) return done(opus.read, OPUS, [haiku, opus])\n")], 'node'),
    ('F22', 'the shown import read is logged', READ,
     [('    return read ? { ...result, import: read } : result\n', "    console.info(JSON.stringify({ event: 'slip_import_read', read }))\n    return read ? { ...result, import: read } : result\n")], 'node'),
    # The call both modes share (callSlip), pinned by the Node file for the import mode...
    ('C1', 'a refusal reads as an unusable answer', READ, [(REFUSAL, "{ kind: 'unusable' }")], 'node'),
    ('C2', 'every image is sent as a PNG', READ, [('media_type: input.image.mediaType', "media_type: 'image/png'")], 'node'),
    ('C3', "the base's effort is lost", READ,
     [("output_config: { ...base.output_config, format: { type: 'json_schema', schema: prompt.schema } },", "output_config: { format: { type: 'json_schema', schema: prompt.schema } },")], 'node'),
    ('C4', 'the image is not sent', READ, [('data: input.image.base64 }', "data: '' }")], 'node'),
    # ...and by P3's workers file for the single read, whose code moved into it.
    ('CW1', 'a refusal reads as an unusable answer (single read)', READ, [(REFUSAL, "{ kind: 'unusable' }")], 'workers'),
    ('CW2', 'every image is sent as a PNG (single read)', READ, [('media_type: input.image.mediaType', "media_type: 'image/png'")], 'workers'),
    ('CW3', 'the single read asks with the import schema', READ, [('    schema: SLIP_SCHEMA,\n', '    schema: SLIP_IMPORT_SCHEMA,\n')], 'workers'),
    # The single read's SlipNotRead (B27).
    ('W1', "a single read's Haiku failure loses its wait", READ,
     [(HAIKU_FAILED_SINGLE, HAIKU_FAILED_SINGLE.replace('SlipNotRead(haiku.failure, lastWait(deps.trace))', 'SlipNotRead(haiku.failure)'))], 'node'),
    ('W2', "a single read's Opus failure loses its wait", READ,
     [(OPUS_FAILED_SINGLE, OPUS_FAILED_SINGLE.replace('SlipNotRead(opus.failure, lastWait(deps.trace))', 'SlipNotRead(opus.failure)'))], 'node'),
    ('W3', 'the single read stops sending the choices', READ,
     [('text: JSON.stringify({ today: input.context.today, locale: input.locale, ...draftChoices(input.context) }),', IMPORT_TEXT)], 'node'),
    # The sanitizer (slip-import.ts).
    ('Z1', 'a receipt or unreadable answer has an import read', IMPORT,
     [("(raw as { kind?: unknown }).kind !== 'slip') return null", "!(SLIP_KINDS as readonly unknown[]).includes((raw as { kind?: unknown }).kind)) return null")], 'node'),
    ('Z2', 'a missing amount is not flagged amount_unclear', IMPORT, [("  if (amount === null) flags.add('amount_unclear')\n", '')], 'node'),
    ('Z3', "a 90-day window, as P3's drafts have (probe PK)", IMPORT,
     [('    return validateOccurredOn(value, EARLIEST, latest)\n', '    return validateOccurredOn(value, addDays(latest, -91), latest)\n')], 'node'),
    ('Z4', 'any later day is kept', IMPORT, [('  const latest = addDays(today, 1)\n', '  const latest = addDays(today, 3650)\n')], 'node'),
    ('Z5', 'the day after today is refused', IMPORT, [('  const latest = addDays(today, 1)\n', '  const latest = addDays(today, 0)\n')], 'node'),
    ('Z6', 'a missing day is not flagged date_guessed', IMPORT, [("  if (day === null) flags.add('date_guessed')\n", '')], 'node'),
    ('Z7', 'any time is kept', IMPORT,
     [("occurred_time: typeof reply.time === 'string' && TIME.test(reply.time) ? reply.time : null,", "occurred_time: typeof reply.time === 'string' ? reply.time : null,")], 'node'),
    ('Z8', 'a bank outside the list is kept', IMPORT,
     [('bank: isThaiBankKey(raw.bank) ? raw.bank : null,', "bank: typeof raw.bank === 'string' ? (raw.bank as never) : null,")], 'node'),
    ('Z9', 'a name keeps a long number', IMPORT, [('  return name !== null && LONG_NUMBER.test(name) ? null : name\n', '  return name\n')], 'node'),
    ('Z10', 'a separator breaks a long number', IMPORT,
     [('const LONG_NUMBER = /\\p{Nd}(?:[ .-]?\\p{Nd}){6,}/u', 'const LONG_NUMBER = /\\p{Nd}{7,}/u')], 'node'),
    ('Z11', 'Thai digits are not digits', IMPORT,
     [('const LONG_NUMBER = /\\p{Nd}(?:[ .-]?\\p{Nd}){6,}/u', 'const LONG_NUMBER = /[0-9](?:[ .-]?[0-9]){6,}/u')], 'node'),
    ('Z12', 'six digits are a long number', IMPORT,
     [('const LONG_NUMBER = /\\p{Nd}(?:[ .-]?\\p{Nd}){6,}/u', 'const LONG_NUMBER = /\\p{Nd}(?:[ .-]?\\p{Nd}){5,}/u')], 'node'),
    ('Z13', "a name is not read by the merchant's rule (only NFC and trimmed)", IMPORT,
     [('    name = normalizeMerchant(value)\n', "    name = typeof value === 'string' ? value.normalize('NFC').trim() || null : null\n")], 'node'),
    ('Z14', "unknown flags are kept, in the model's order", IMPORT, [('    flags: AI_DRAFT_FLAGS.filter((f) => flags.has(f)),\n', '    flags: [...flags] as never,\n')], 'node'),
    ('Z15', 'a side that is not an object crashes the sanitizer', IMPORT,
     [('  const raw = (typeof value === \'object\' && value !== null ? value : {}) as Record<string, unknown>\n', '  const raw = value as Record<string, unknown>\n')], 'node'),
    ('Z16', 'an account that is not text is read anyway', IMPORT,
     [("account_last4: typeof raw.account_last4 === 'string' ? accountLast4(raw.account_last4) : null,", 'account_last4: accountLast4(String(raw.account_last4)),')], 'node'),
    ('Z17', 'a read missing its amount is not read again', IMPORT, [skip('amount_minor')], 'node'),
    ('Z18', 'a read missing its day is not read again', IMPORT, [skip('occurred_on')], 'node'),
    ('Z19', "a read missing the sender's bank is not read again", IMPORT, [skip('from.bank')], 'node'),
    ('Z20', 'a day that is no day lets every date through', IMPORT,
     [('  const latest = addDays(today, 1)\n', "  let latest = '9999-12-31'\n  try {\n    latest = addDays(today, 1)\n  } catch {}\n")], 'node'),
]

# Each batch fits a 10-minute tool call: a Node mutant takes about 2 s, a workers one about 10 s without waiting for the lock.
BATCHES = {
    '1': ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'F13', 'F14',
          'F15', 'F16', 'F17', 'F18', 'F19', 'F20', 'F21', 'F22', 'C1', 'C2', 'C3', 'C4', 'W1', 'W2', 'W3'],
    '2': ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7', 'Z8', 'Z9', 'Z10', 'Z11', 'Z12', 'Z13', 'Z14', 'Z15', 'Z16', 'Z17', 'Z18', 'Z19', 'Z20'],
    '3': ['CW1', 'CW2', 'CW3'],
}


def command(kind: str, tree: str, log: str) -> tuple[list[str], str]:
    edge = os.path.join(tree, 'apps/edge')
    if kind == 'node':
        return (['npx', 'vitest', 'run', 'test/slip-read-import.test.ts'], edge)
    locked = os.path.join(KIT, 'locked.sh')
    return ([locked, log, edge, 'npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', 'test/workers/slip-read.test.ts'], tree)


def sha(file: str) -> str:
    with open(file, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def first_errors(body: str) -> list[str]:
    """The first error line of every failing case in the vitest log."""
    lines = body.splitlines()
    errors = []
    for i, line in enumerate(lines):
        if not line.startswith(' FAIL '):
            continue
        j = i + 1
        while j < len(lines) and (not lines[j].strip() or lines[j].startswith(' FAIL ')):
            j += 1
        if j < len(lines):
            errors.append(lines[j].split(':', 1)[0].strip())
    return errors


def counts(body: str) -> str:
    found = re.search(r'^\s+Tests\s+(.*)$', body, re.M)
    return found.group(1).strip() if found else 'no Tests line'


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--tree', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--only', default='')
    parser.add_argument('--batch', default='')
    args = parser.parse_args()
    tree = os.path.abspath(args.tree)
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)
    ids = [m[0] for m in MUTANTS]
    assert len(ids) == len(set(ids)), 'duplicate mutant ids'
    assert sorted(sum(BATCHES.values(), [])) == sorted(ids), 'the batches must hold every mutant once'
    only = set(BATCHES[args.batch]) if args.batch else {m for m in args.only.split(',') if m}
    killed, survivors, other, unrestored, ran = [], [], [], [], 0
    for mid, what, rel, swaps, kind in MUTANTS:
        if only and mid not in only:
            continue
        ran += 1
        target = os.path.join(tree, rel)
        before = sha(target)
        with open(target, encoding='utf-8') as f:
            original = f.read()
        text = original
        for old, new in swaps:
            found = text.count(old)
            if found != 1:
                print(f'{mid} BAD ANCHOR ({found} matches) in {rel}: {old[:60]!r}', flush=True)
                return 2
            text = text.replace(old, new)
        log = os.path.join(out, f'{mid}.log')
        try:
            with open(target, 'w', encoding='utf-8') as f:
                f.write(text)
            argv, cwd = command(kind, tree, log)
            if kind == 'node':
                with open(log, 'w', encoding='utf-8') as f:
                    rc = subprocess.run(argv, cwd=cwd, stdout=f, stderr=subprocess.STDOUT).returncode
            else:
                rc = subprocess.run(argv, cwd=cwd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode
        finally:
            with open(target, 'w', encoding='utf-8') as f:
                f.write(original)
        if sha(target) != before:
            unrestored.append(mid)
        with open(log, encoding='utf-8', errors='replace') as f:
            body = f.read()
        errors = first_errors(body)
        by_assertion = bool(errors) and all(e == 'AssertionError' for e in errors)
        if rc != 0 and by_assertion:
            killed.append(mid)
            print(f'{mid} killed (assertion): {what} [{kind}] -> {counts(body)}', flush=True)
        elif rc != 0:
            other.append(mid)
            print(f'{mid} KILLED BY ANOTHER FAILURE {sorted(set(errors))}: {what} [{kind}] -> {counts(body)}', flush=True)
        else:
            survivors.append(mid)
            print(f'{mid} SURVIVED: {what} [{kind}] -> {counts(body)}', flush=True)
    print(f'{len(killed)} of {ran} killed; survivors {survivors}; other failures {other}; not restored {unrestored}', flush=True)
    return 0 if not survivors and not other and not unrestored else 1


if __name__ == '__main__':
    sys.exit(main())

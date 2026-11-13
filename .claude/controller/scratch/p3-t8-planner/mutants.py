"""P3-T8's mutants: one per new guard, each run against the focused test that should kill it.

Usage: python3 -I mutants.py --tree <tree> --out <log dir> --batch <1-5>
       python3 -I mutants.py --tree <tree> --out <log dir> --only ID,ID

Each mutant replaces exact text (each `old` must occur exactly once in its file),
runs its test, and restores the file byte for byte (checked by SHA-256). A
mutant is killed when its test run exits non-zero; the line also says whether
the log shows an assertion failure. Workers runs take the heavy lock through
locked.sh, which sits next to this script. The batches keep each run inside a
10-minute tool call. The last line reads:
"<k> of <n> killed; survivors [...]; not restored [...]".
"""
import argparse
import hashlib
import os
import subprocess
import sys

KIT = os.path.dirname(os.path.abspath(__file__))

READ = 'apps/edge/src/v1/ai/slip-read.ts'
SERVICE = 'apps/edge/src/v1/ai/service.ts'
PROMPTS = 'apps/edge/src/server/ai/prompts.ts'
TRANSPORT = 'apps/edge/src/v1/ai/transport.ts'
CONTRACT = 'packages/contracts/src/v1/ai.ts'
PHONE = 'apps/app/src/spend/v1/ai/aiResources.ts'

RECEIVER = "(kind === 'slip' && draft.type === 'expense' && draft.merchant === null)"
TRIGGERS = "(draft) => draft.amount_minor === null || draft.flags.includes('date_guessed') ||"
OPUS_CALL = "opusRequest('medium', 8_000), true)"
HAIKU_CALL = "haikuRequest('medium', 8_000), false, HAIKU_SLIP_CAP_MS)"
WINS = ("  if (opus.kind === 'answer' && opus.read.drafts.length > 0) return done(opus.read, OPUS, [haiku, opus])\n"
        "  if (haiku.kind === 'answer' && haiku.read.drafts.length > 0) return done(haiku.read, HAIKU, [haiku, opus])\n")
KEPT = "  if (haiku.kind === 'answer' && haiku.read.drafts.length > 0) return done(haiku.read, HAIKU, [haiku, opus])\n"
IMAGE = "          { type: 'image', source: { type: 'base64', media_type: input.image.mediaType, data: input.image.base64 } },\n"
SUMS = 'usage.input + usage.cacheRead + usage.cacheWrite'
RULE = '- kind: "slip" for a bank or e-wallet transfer slip, "receipt" for a shop receipt or bill, "unreadable" when no amount can be read; with "unreadable" return 0 drafts.\n'

# (id, what it breaks, file, [(old, new), ...], test kind)
MUTANTS = [
    # The plan's four (Step 5).
    ('P1', "escalate on a guessed category (the plan's mutant)", READ,
     [(TRIGGERS, "(draft) => draft.amount_minor === null || draft.flags.includes('date_guessed') || draft.flags.includes('category_guessed') ||")], 'slip'),
    ('P2', "send Opus the text without the image (the plan's mutant)", READ,
     [(IMAGE, "          ...(escalated ? [] : [{ type: 'image' as const, source: { type: 'base64' as const, media_type: input.image.mediaType, data: input.image.base64 } }]),\n")], 'slip'),
    ('P3', "escalate on a Haiku 529 (the plan's mutant)", READ,
     [("  if (haiku.kind === 'failed') throw new SlipNotRead(haiku.failure)\n", ''),
      ("  if (outcome.kind === 'failed') return false\n", "  if (outcome.kind === 'failed') return true\n")], 'slip'),
    ('P4', "spend the use when Opus fails after a refusal (the plan's mutant)", READ,
     [("  if (opus.kind === 'failed') throw new SlipNotRead(opus.failure)\n", '')], 'slip'),
    # D25's triggers (slipNeedsOpus).
    ('E1', 'a read with no draft is not re-read', READ, [('  if (drafts.length === 0) return true\n', '')], 'slip'),
    ('E2', 'an amount that does not parse is not re-read', READ,
     [("(draft) => draft.amount_minor === null || draft.flags", '(draft) => draft.flags')], 'slip'),
    ('E3', 'an implausible date is not re-read', READ,
     [("null || draft.flags.includes('date_guessed') || (kind", 'null || (kind')], 'slip'),
    ('E4', 'a slip with no receiver is not re-read', READ, [(' || ' + RECEIVER + ',', ',')], 'slip'),
    ('E5', 'a receipt with no receiver is re-read', READ, [(RECEIVER, "(draft.type === 'expense' && draft.merchant === null)")], 'slip'),
    ('E6', 'an income slip with no receiver is re-read', READ, [(RECEIVER, "(kind === 'slip' && draft.merchant === null)")], 'slip'),
    ('E7', 'only the first draft is checked', READ, [('  return drafts.some(\n', '  return drafts.slice(0, 1).some(\n')], 'slip'),
    ('E8', 'a decline or an unusable answer needs no Opus (slipNeedsOpus)', READ,
     [("  if (outcome.kind !== 'answer') return true\n", "  if (outcome.kind !== 'answer') return false\n")], 'slip'),
    ('E9', 'an outage needs Opus (slipNeedsOpus)', READ,
     [("  if (outcome.kind === 'failed') return false\n", "  if (outcome.kind === 'failed') return true\n")], 'slip'),
    # What the read answers (readSlipImage).
    ('E10', "Haiku's draft wins over Opus's", READ, [(WINS, KEPT + "  if (opus.kind === 'answer' && opus.read.drafts.length > 0) return done(opus.read, OPUS, [haiku, opus])\n")], 'slip'),
    ('E11', "Haiku's draft is dropped when Opus fails or finds nothing", READ, [(KEPT, '')], 'slip'),
    ('E12', 'a read never says it escalated', READ, [('    escalated: outcomes.length > 1,\n', '    escalated: false,\n')], 'slip'),
    ('E13', "only Haiku's refusal marks the read declined", READ,
     [("    declined: outcomes.some((outcome) => outcome.kind === 'declined'),\n", "    declined: outcomes[0].kind === 'declined',\n")], 'slip'),
    ('E14', 'a refusal reads as an unusable answer', READ,
     [("? { kind: 'declined' } : { kind: 'unusable' }", "? { kind: 'unusable' } : { kind: 'unusable' }")], 'slip'),
    ('E15', 'tokens leave out cache reads', READ, [(SUMS, 'usage.input + usage.cacheWrite')], 'slip'),
    ('E16', 'tokens leave out cache writes', READ, [(SUMS, 'usage.input + usage.cacheRead')], 'slip'),
    ('E17', "tokens count Haiku's call only", READ, [('deps.trace.calls.slice(first))', 'deps.trace.calls.slice(first, first + 1))')], 'slip'),
    ('E18', 'output tokens are not counted', READ, [('    output += usage.output\n', '')], 'slip'),
    ('E19', "Haiku's read is not capped", READ, [(HAIKU_CALL, "haikuRequest('medium', 8_000), false)")], 'slip'),
    ('E20', "Opus's read is capped as Haiku's", READ, [(OPUS_CALL, "opusRequest('medium', 8_000), true, HAIKU_SLIP_CAP_MS)")], 'slip'),
    ('E21', "the trace does not mark Opus's call as the escalation", READ, [(OPUS_CALL, "opusRequest('medium', 8_000), false)")], 'slip'),
    ('E22', 'a reply with no kind is used', READ, [("  if (!(SLIP_KINDS as readonly unknown[]).includes(reply.kind)) return { kind: 'unusable' }\n", '')], 'slip'),
    ('E23', "an unreadable answer's drafts are kept", READ,
     [("reply.kind === 'unreadable' ? [] : sanitizeDrafts(raw, input.context)", 'sanitizeDrafts(raw, input.context)')], 'slip'),
    ('E24', "a read with no draft keeps the model's kind", READ,
     [("kind: drafts.length > 0 ? (reply.kind as SlipKind) : 'unreadable'", 'kind: reply.kind as SlipKind')], 'slip'),
    ('E25', 'an unreadable read after Opus names Haiku', READ,
     [("{ kind: 'unreadable', drafts: [], bank: null }, OPUS, [haiku, opus])", "{ kind: 'unreadable', drafts: [], bank: null }, HAIKU, [haiku, opus])")], 'slip'),
    ('E26', "SlipNotRead after Opus carries a fixed failure, not Opus's", READ,
     [('throw new SlipNotRead(opus.failure)', "throw new SlipNotRead('server_error')")], 'slip'),
    ('E27', "SlipNotRead after Haiku carries a fixed failure, not Haiku's", READ,
     [('throw new SlipNotRead(haiku.failure)', "throw new SlipNotRead('server_error')")], 'slip'),
    ('E28', "Opus is asked on Haiku's base (no fallback beta, no fallbacks)", READ,
     [(OPUS_CALL, "{ ...haikuRequest('medium', 8_000), model: OPUS }, true)")], 'slip'),
    ('E29', "Opus is asked at another effort", READ, [(OPUS_CALL, "opusRequest('high', 8_000), true)")], 'slip'),
    ('E30', "Haiku's base effort does not reach the slip's call (the P3-T6 review's n2)", READ,
     [(HAIKU_CALL, "haikuRequest('high', 8_000), false, HAIKU_SLIP_CAP_MS)")], 'slip'),
    ('E32', "the slip's JSON format is dropped", READ,
     [("output_config: { ...base.output_config, format: { type: 'json_schema', schema: SLIP_SCHEMA } },", 'output_config: { ...base.output_config },')], 'slip'),
    ('E33', 'the bank is cut at 61 characters', READ, [('reply.bank.trim().slice(0, 60)', 'reply.bank.trim().slice(0, 61)')], 'aitest'),
    ('E34', 'an Opus decline or broken answer after a Haiku decline is 503 and refunded', READ,
     [("  if (opus.kind === 'failed') throw", "  if (opus.kind !== 'answer') throw")], 'slip'),
    ('E35', 'the wallets and categories to choose from are not sent', READ, [(', ...choices(input.context) })', ' })')], 'slip'),
    ('E36', 'the bank is not trimmed', READ, [('reply.bank.trim().slice(0, 60)', 'reply.bank.slice(0, 60)')], 'aitest'),
    ('E37', "an unreadable read after Opus is built afresh, losing Opus's read (its bank)", READ,
     [("done(opus.kind === 'answer' ? opus.read : { kind: 'unreadable', drafts: [], bank: null }, OPUS", "done({ kind: 'unreadable', drafts: [], bank: null }, OPUS")], 'slip'),
    # The slip route (service.ts).
    ('G1', 'a slip that no model read keeps its use after an outage', SERVICE,
     [("      this.logFailure('slip', error)\n      await this.giveBack(s, use, trace)\n", "      this.logFailure('slip', error)\n")], 'slip'),
    ('RV5', "the slip's refund is not awaited, so the answer can leave first (the P3-T7 review's n1)", SERVICE,
     [("      this.logFailure('slip', error)\n      await this.giveBack(s, use, trace)\n", "      this.logFailure('slip', error)\n      void this.giveBack(s, use, trace)\n")], 'uses'),
    ('G2', "the route's answer has no kind", SERVICE, [('kind: read.kind, ', '')], 'slip'),
    ('G3', "the route's answer is never declined", SERVICE, [('declined: read.declined', 'declined: false')], 'slip'),
    ('G4', "the route's answer has no tokens", SERVICE, [('tokens: read.tokens }', 'tokens: { input: 0, output: 0 } }')], 'slip'),
    ('G5', "the route's answer always names Haiku", SERVICE, [('model: read.model, ', 'model: HAIKU, ')], 'slip'),
    ('G6', "the route's answer never says it escalated", SERVICE, [('escalated: read.escalated, ', 'escalated: false, ')], 'slip'),
    ('G7', "the route's answer has no bank", SERVICE, [('drafts: read.drafts, bank: read.bank', 'drafts: read.drafts, bank: null')], 'slip'),
    ('N1', "parse's base effort does not reach its call (the P3-T6 review's n2)", SERVICE,
     [("      const base = haikuRequest('low', 8_000)\n", "      const base = haikuRequest('high', 8_000)\n")], 'routing'),
    ('N2', "the note's base effort does not reach its call (the P3-T6 review's n2)", SERVICE,
     [("      const base = haikuRequest('low', 4_000)\n", "      const base = haikuRequest('high', 4_000)\n")], 'routing'),
    ('M6', "one request gives its use back twice (the P3-T7 second review's M6)", SERVICE,
     [("      await step<unknown>(s, 'ai.refund', { body: use })\n",
       "      await step<unknown>(s, 'ai.refund', { body: use })\n      await step<unknown>(s, 'ai.refund', { body: use })\n")], 'uses'),
    # The schema and the rule (prompts.ts).
    ('R1', 'the schema does not ask for the kind', PROMPTS, [("  required: ['kind', 'drafts', 'bank'],\n", "  required: ['drafts', 'bank'],\n")], 'slip'),
    ('R2', "the system prompt has no kind rule", PROMPTS, [(RULE, '')], 'slip'),
    ('R3', "the schema's kinds are not the contract's", PROMPTS, [('enum: [...SLIP_KINDS]', "enum: ['slip', 'receipt']")], 'slip'),
    # The cap (transport.ts, unchanged here; the P3-T4 review's m3 and R9).
    ('T1', 'tracedSend ignores capMs (R9)', TRANSPORT,
     [('const callTime = call.capMs !== undefined ? Math.min(availableMs, call.capMs) : availableMs', 'const callTime = availableMs')], 'slip'),
    ('T2', "the 2-second floor reads the deadline, not the cap", TRANSPORT,
     [('  if (callTime < MIN_CALL_MS) {', '  if (availableMs < MIN_CALL_MS) {')], 'slip'),
    # The contract and the phone's validator (Node).
    ('C1', 'a fourth slip kind', CONTRACT,
     [('export const SLIP_KINDS = ["slip", "receipt", "unreadable"] as const;', 'export const SLIP_KINDS = ["slip", "receipt", "unreadable", "invoice"] as const;')], 'node-app'),
    ('A1', "the phone takes any kind", PHONE, [('(SLIP_KINDS as readonly unknown[]).includes(value.kind) && ', '')], 'node-app'),
    ('A2', "the phone takes any declined", PHONE, [("typeof value.declined === 'boolean'", 'value.declined !== undefined')], 'node-app'),
    ('A3', "the phone takes tokens with other keys", PHONE, [("hasExactly(value.tokens, ['input', 'output']) && ", '')], 'node-app'),
    ('A4', "the phone takes any token counts", PHONE, [('isCount(value.tokens.input) && isCount(value.tokens.output)', 'true')], 'node-app'),
    ('A5', "the phone takes any input tokens", PHONE, [('isCount(value.tokens.input) && ', '')], 'node-app'),
    ('A6', "the phone takes any output tokens", PHONE, [(' && isCount(value.tokens.output)', '')], 'node-app'),
    ('A7', "the phone takes a slip result without kind, declined and tokens", PHONE,
     [("'escalated', 'kind', 'declined', 'tokens']", "'escalated']")], 'node-app'),
]

# Each batch runs inside a 10-minute tool call (about 10 s per workers mutant without waiting for the lock).
BATCHES = {
    '1': ['P1', 'P2', 'P3', 'P4', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10'],
    '2': ['E11', 'E12', 'E13', 'E14', 'E15', 'E16', 'E17', 'E18', 'E19', 'E20', 'E21', 'E22', 'E23', 'E24'],
    '3': ['E25', 'E26', 'E27', 'E28', 'E29', 'E30', 'E32', 'E33', 'E34', 'E35', 'E36', 'E37', 'T1', 'T2'],
    '4': ['G1', 'RV5', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'N1', 'N2', 'M6', 'R1', 'R2', 'R3'],
    '5': ['C1', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'],
}

WORKERS_FILES = {
    'slip': 'test/workers/slip-read.test.ts',
    'routing': 'test/workers/ai-routing.test.ts',
    'uses': 'test/workers/ai-uses.test.ts',
    'aitest': 'test/workers/ai.test.ts',
}


def command(kind: str, tree: str, log: str) -> tuple[list[str], str]:
    if kind == 'node-app':
        return (['node', 'scripts/test-unit.mjs', 'src/spend/v1/ai/aiResources.test.ts'], os.path.join(tree, 'apps/app'))
    edge = os.path.join(tree, 'apps/edge')
    locked = os.path.join(KIT, 'locked.sh')
    return ([locked, log, edge, 'npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', WORKERS_FILES[kind]], tree)


def sha(file: str) -> str:
    with open(file, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


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
    killed, survivors, unrestored, ran = [], [], [], 0
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
            count = text.count(old)
            if count != 1:
                print(f'{mid} BAD ANCHOR ({count} matches) in {rel}: {old[:60]!r}', flush=True)
                return 2
            text = text.replace(old, new)
        log = os.path.join(out, f'{mid}.log')
        try:
            with open(target, 'w', encoding='utf-8') as f:
                f.write(text)
            argv, cwd = command(kind, tree, log)
            if kind == 'node-app':
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
        assertion = 'AssertionError' in body or 'ERR_ASSERTION' in body
        if rc != 0:
            killed.append(mid)
            print(f'{mid} killed ({"assertion" if assertion else "other failure"}): {what} [{kind}]', flush=True)
        else:
            survivors.append(mid)
            print(f'{mid} SURVIVED: {what} [{kind}]', flush=True)
    print(f'{len(killed)} of {ran} killed; survivors {survivors}; not restored {unrestored}', flush=True)
    return 0 if not survivors and not unrestored else 1


if __name__ == '__main__':
    sys.exit(main())

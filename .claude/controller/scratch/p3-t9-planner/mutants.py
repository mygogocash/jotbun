"""P3-T9's mutants: one per new guard, each run against the focused test file that should kill it.

Usage: python3 -I mutants.py --tree <tree> --out <log dir> --batch <1-6>
       python3 -I mutants.py --tree <tree> --out <log dir> --only ID,ID

Each mutant replaces exact text (each `old` must occur exactly once in its file),
runs its test file, and restores the file byte for byte (checked by SHA-256).
A mutant counts as killed by an assertion only when its run exits non-zero and
every failing case failed on an assertion: in a vitest log, the first error
under each FAIL header is an AssertionError; in a node:test log, the failing
tests after "failing tests:" each carry AssertionError [ERR_ASSERTION]. Workers
runs take the heavy lock through locked.sh, which sits next to this script.
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

ASK = 'apps/edge/src/v1/ai/ask.ts'
SERVICE = 'apps/edge/src/v1/ai/service.ts'
USES = 'apps/edge/src/v1/ai/uses.ts'
VAULT = 'apps/edge/src/vault/ai.ts'
PHONE = 'apps/app/src/spend/v1/ai/aiResources.ts'
DRAFTS = 'apps/edge/src/server/ai/drafts.ts'
READ = 'apps/edge/src/v1/ai/slip-read.ts'

FIRST_TURN = ("  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [\n"
              "    { role: 'user', content: JSON.stringify({ question: input.question, today: input.today, locale: input.locale, categories: input.categories }) },\n"
              "  ]\n")
REPLAYED = ("  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = (REPLAYED[deps.trace.id] ??= [\n"
            "    { role: 'user', content: JSON.stringify({ question: input.question, today: input.today, locale: input.locale, categories: input.categories }) },\n"
            "  ])\n")
OUTCOME = "error.reason === 'refusal' ? { kind: 'declined', figures } : { kind: 'no_answer', figures }"
TOOL_REFUSAL = "        if (error instanceof ProblemException && error.getStatus() !== 500) throw error\n"
FIGURES_PICKED = "  const figures = last.figures.length > 0 ? last.figures : earlier\n"
OPUS_ANSWER = "figures: opus.figures, source: 'ai', model: OPUS, escalated: true }"
REFUND = "    await this.giveBack(s, use, trace)\n    if ('paused' in answered) throw this.paused()\n"
SPENDING = 'money(label, row.total, row.n, { from, through, type, category_id: category })'
PER_CATEGORY = 'r.total, r.n, { from, through, type, category_id: r.category_id })'
PER_PLACE = 'r.total, r.n, null))'
LAST_SENT = '  return last.sent || !calls.some((call) => call.failure === null)\n'
COUNT = '(value.count === null || isCount(value.count))'
CATEGORY = 'includes(value.type) && (value.category_id === null || isUuid(value.category_id))'
GUARDED = ("  let drafts: AiDraft[]\n"
           "  try {\n"
           "    drafts = reply.kind === 'unreadable' ? [] : sanitizeDrafts(raw, input.context)\n"
           "  } catch {\n"
           "    return { kind: 'unusable' }\n"
           "  }\n")
UNFILTERED = ("wallets: {ctx}.wallets.map((w) => ({{ id: w.id, name: w.name }})), "
              "categories: {ctx}.categories.map((c) => ({{ id: c.id, type: c.type, name: c.label ?? c.builtin_key }}))")

# (id, what it breaks, file, [(old, new), ...], test kind)
MUTANTS = [
    # The plan's five (Step 5).
    ('P1', "replay Haiku's turns to Opus (the plan's mutant)", ASK,
     [('export const ASK_MAX_TURNS = 5\n', 'const REPLAYED: Record<string, Anthropic.Beta.Messages.BetaMessageParam[]> = {}\nexport const ASK_MAX_TURNS = 5\n'), (FIRST_TURN, REPLAYED)], 'escalation'),
    ('P2', "escalate on a 429 (the plan's mutant)", ASK, [("  if (haiku.kind === 'failed') return plainFigures(haiku, [], input.locale, false)\n", '')], 'escalation'),
    ('P3', "consume a second use for Opus (the plan's mutant)", SERVICE,
     [(REFUND, "    if (!('paused' in answered) && answered.escalated) await this.consume(s, 'ask')\n" + REFUND)], 'escalation'),
    ('P4', "give Haiku the parent deadline (the plan's mutant)", ASK,
     [("{ ...deps, deadline: deps.deadline.child(HAIKU_ASK_CAP_MS) })\n  if (haiku.kind === 'grounded')", "{ ...deps, deadline: deps.deadline })\n  if (haiku.kind === 'grounded')")], 'node-edge'),
    ('P5', "answer paused whenever no figures exist (the plan's mutant)", ASK,
     [("  if (last.kind === 'failed' && figures.length === 0) return { paused: true }\n", '  if (figures.length === 0) return { paused: true }\n')], 'escalation'),
    # One conversation (runAskConversation).
    ('K1', 'a turn the deadline never let start is a failure, so Haiku is never followed by Opus', ASK,
     [("      return error instanceof DeadlinePassed ? { kind: 'no_answer', figures } : { kind: 'failed', failure: callFailure(error), figures }\n",
       "      return { kind: 'failed', failure: callFailure(error), figures }\n")], 'node-edge'),
    ('K2', 'a failed call is not logged', ASK,
     [('      logFallback(error)\n      // A turn the deadline never let start', '      // A turn the deadline never let start')], 'escalation'),
    ('K3', "the log line carries the error's message", ASK,
     [("failure: failureName(error) }))\n", "failure: failureName(error), message: error instanceof Error ? error.message : String(error) }))\n")], 'escalation'),
    ('K4', 'the turn limit is a failure', ASK,
     [("  return { kind: 'no_answer', figures }\n}\n\n/**\n * Ask Bun (D28, H7)", "  return { kind: 'failed', failure: 'other', figures }\n}\n\n/**\n * Ask Bun (D28, H7)")], 'escalation'),
    ('K5', 'a refusal reads as no answer', ASK, [(OUTCOME, "error.reason === 'refusal' ? { kind: 'no_answer', figures } : { kind: 'no_answer', figures }")], 'node-edge'),
    ('K6', 'a cut-short answer reads as a refusal', ASK, [(OUTCOME, "error.reason === 'refusal' ? { kind: 'declined', figures } : { kind: 'declined', figures }")], 'node-edge'),
    ('K7', 'an empty answer is grounded', ASK, [("  if (!answer) return { kind: 'no_answer', figures }\n", '')], 'node-edge'),
    ('K9', 'no grounding check: any text is grounded', ASK,
     [("  return isGrounded(answer, allowed) ? { kind: 'grounded', answer, figures } : { kind: 'ungrounded', figures }\n", "  return { kind: 'grounded', answer, figures }\n")], 'escalation'),
    ('K10', "a vault refusal at a tool step is swallowed as a failure", ASK, [(TOOL_REFUSAL, '')], 'node-edge'),
    ('K11', 'a tool step that failed is thrown on', ASK, [(TOOL_REFUSAL, '        throw error\n')], 'node-edge'),
    ('K12', 'a tool step that failed is not logged', ASK,
     [('        logFallback(error)\n        return { kind: \'failed\', failure: callFailure(error), figures }\n', "        return { kind: 'failed', failure: callFailure(error), figures }\n")], 'node-edge'),
    ('K13', "Opus's calls are not marked escalated in the trace", ASK, [("{ feature: 'ask', escalated: tier === OPUS, params:", "{ feature: 'ask', escalated: false, params:")], 'node-edge'),
    ('K14', "Opus is asked on Haiku's request base", ASK,
     [("  const base = tier === OPUS ? opusRequest('medium', 12_000) : haikuRequest('medium', 12_000)\n", "  const base = haikuRequest('medium', 12_000)\n")], 'escalation'),
    ('K15', "Opus's effort is low", ASK, [("opusRequest('medium', 12_000)", "opusRequest('low', 12_000)")], 'escalation'),
    ('K16', "Opus's answer is cut at 8,000 tokens", ASK, [("opusRequest('medium', 12_000)", "opusRequest('medium', 8_000)")], 'escalation'),
    ('K17', "Haiku's effort is low (the moved base)", ASK, [("haikuRequest('medium', 12_000)", "haikuRequest('low', 12_000)")], 'routing'),
    ('K18', 'Opus is given fewer tools', ASK,
     [('params: { ...base, system: ASK_SYSTEM, tools: ASK_TOOLS, messages } })', 'params: { ...base, system: ASK_SYSTEM, tools: tier === OPUS ? ASK_TOOLS.slice(0, 2) : ASK_TOOLS, messages } })')], 'escalation'),
    ('K19', "Opus's first message differs from Haiku's", ASK,
     [('categories: input.categories }) },\n  ]', 'categories: tier === OPUS ? [] : input.categories }) },\n  ]')], 'escalation'),
    ('K20', "a tool's numbers do not reach the grounding check", ASK, [('      allowAll(allowed, run.allow)\n', '')], 'escalation'),
    ('K21', "a tool's figures are dropped", ASK, [('      figures.push(...run.figures)\n', '')], 'escalation'),
    ('K22', "the plain figures prefer Haiku's to Opus's", ASK, [(FIGURES_PICKED, '  const figures = earlier.length > 0 ? earlier : last.figures\n')], 'escalation'),
    ('K23', "the plain figures never fall back to Haiku's", ASK, [(FIGURES_PICKED, '  const figures = last.figures\n')], 'escalation'),
    ('K24', "the plain figures say Haiku (the P3-T6 review's X1 and X2)", ASK,
     [("figures, source: 'facts', model: 'rules', escalated }\n", "figures, source: 'facts', model: HAIKU, escalated }\n")], 'escalation'),
    ('K25', 'the plain figures after Opus say escalated false', ASK,
     [('  return plainFigures(opus, haiku.figures, input.locale, true)\n', '  return plainFigures(opus, haiku.figures, input.locale, false)\n')], 'escalation'),
    ('K26', "Opus's grounded answer says Haiku", ASK, [(OPUS_ANSWER, "figures: opus.figures, source: 'ai', model: HAIKU, escalated: true }")], 'escalation'),
    ('K27', "Opus's grounded answer says escalated false", ASK, [(OPUS_ANSWER, "figures: opus.figures, source: 'ai', model: OPUS, escalated: false }")], 'escalation'),
    ('K28', "Haiku's grounded answer says escalated", ASK,
     [("figures: haiku.figures, source: 'ai', model: HAIKU, escalated: false }", "figures: haiku.figures, source: 'ai', model: HAIKU, escalated: true }")], 'routing'),
    ('K29', "Opus is capped at Haiku's 25 s", ASK,
     [('  const opus = await runAskConversation(OPUS, input, deps)\n', '  const opus = await runAskConversation(OPUS, input, { ...deps, deadline: deps.deadline.child(HAIKU_ASK_CAP_MS) })\n')], 'node-edge'),
    # The service's Ask Bun route.
    ('S1', 'Ask Bun never gives its use back', SERVICE, [(REFUND, "    if ('paused' in answered) throw this.paused()\n")], 'escalation'),
    ('S2', 'nothing to answer with is not a 503', SERVICE, [("    if ('paused' in answered) throw this.paused()\n    return answered\n", '    return answered as AiAskResult\n')], 'escalation'),
    ('S3', 'the plain figures after an outage keep the use (only the 503 gives it back)', SERVICE,
     [(REFUND, "    if ('paused' in answered) {\n      await this.giveBack(s, use, trace)\n      throw this.paused()\n    }\n")], 'escalation'),
    ('S4', 'the refund is not awaited before the answer', SERVICE, [(REFUND, REFUND.replace('    await this.giveBack', '    void this.giveBack'))], 'escalation'),
    ('S5', "the tools answer in English whatever the question's language", SERVICE,
     [('{ body: { name, input, locale: request.locale } }', "{ body: { name, input, locale: 'en' } }")], 'aitest'),
    ('S6', "a refund whose vault call rejects fails the request (the P3-T7 second review's M9)", SERVICE,
     [("    } catch (error) {\n      console.warn(JSON.stringify({ level: 'warn', event: 'ai_refund_failed'",
       "    } catch (error) {\n      if (!(error instanceof ProblemException)) throw error\n      console.warn(JSON.stringify({ level: 'warn', event: 'ai_refund_failed'")], 'escalation'),
    # R116 (shouldRefund).
    ('U1', 'a turn the deadline never let start always gives the use back (R116 dropped)', USES, [(LAST_SENT, '  return true\n')], 'uses'),
    ('U2', 'a turn the deadline never let start always spends', USES, [(LAST_SENT, '  return last.sent\n')], 'uses'),
    ('U3', 'any earlier call, not an answered one, spends a turn that never started', USES,
     [('!calls.some((call) => call.failure === null)', 'calls.length === 1')], 'uses'),
    ('U4', 'a sent last call that failed spends once an earlier call answered', USES, [('  return last.sent || !calls.some(', '  return !calls.some(')], 'uses'),
    # The vault's figures.
    ('V1', "a total's figure has no count", VAULT, [(SPENDING, 'money(label, row.total, null, { from, through, type, category_id: category })')], 'escalation'),
    ('V2', "a total's figure has no scope", VAULT, [(SPENDING, 'money(label, row.total, row.n, null)')], 'escalation'),
    ('V3', "a total's scope names a category the person does not have", VAULT,
     [('category_id: category })] }', "category_id: typeof input.category_id === 'string' ? input.category_id : null })] }")], 'escalation'),
    ('V4', "a total's scope always says expense", VAULT, [(SPENDING, "money(label, row.total, row.n, { from, through, type: 'expense', category_id: category })")], 'escalation'),
    ('V5', "a category's figure has no count", VAULT, [(PER_CATEGORY, 'r.total, null, { from, through, type, category_id: r.category_id })')], 'escalation'),
    ('V6', "a category's scope names every category", VAULT, [(PER_CATEGORY, 'r.total, r.n, { from, through, type, category_id: null })')], 'escalation'),
    ('V7', "a place's figure has no count", VAULT, [(PER_PLACE, 'r.total, null, null))')], 'escalation'),
    ('V8', "a place's figure has a scope", VAULT, [(PER_PLACE, "r.total, r.n, { from, through, type: 'expense', category_id: null }))")], 'escalation'),
    ('V9', "a budget line has a count", VAULT, [('b.overall_limit_minor, null, null)', 'b.overall_limit_minor, 0, null)')], 'escalation'),
    ('V10', "a total's scope swaps its days", VAULT, [(SPENDING, 'money(label, row.total, row.n, { from: through, through: from, type, category_id: category })')], 'escalation'),
    # The phone's validator.
    ('A1', 'the phone takes a figure without count and scope', PHONE, [("hasExactly(value, ['label', 'amount_minor', 'count', 'scope'])", "hasExactly(value, ['label', 'amount_minor'])")], 'node-app'),
    ('A2', 'the phone takes any count', PHONE, [(COUNT, 'true')], 'node-app'),
    ('A3', "the phone refuses a budget line's null count", PHONE, [(COUNT, 'isCount(value.count)')], 'node-app'),
    ('A4', 'the phone takes any scope', PHONE, [(' && isFigureScope(value.scope);', ';')], 'node-app'),
    ('A5', "the phone refuses a place's null scope", PHONE,
     [('const isFigureScope = (value: unknown) => value === null || (isObject(value)', 'const isFigureScope = (value: unknown) => (isObject(value)')], 'node-app'),
    ('A6', "the phone takes a scope with any keys", PHONE, [("hasExactly(value, ['from', 'through', 'type', 'category_id']) &&\n", '')], 'node-app'),
    ('A7', "the phone takes any first day", PHONE, [("typeof value.from === 'string' && DATE.test(value.from) && ", '')], 'node-app'),
    ('A8', "the phone takes any last day", PHONE, [(" && typeof value.through === 'string' && DATE.test(value.through)", '')], 'node-app'),
    ('A9', 'the phone takes a transfer scope', PHONE, [('(AI_DRAFT_TYPES as readonly unknown[]).includes(value.type) && ', '')], 'node-app'),
    ('A10', 'the phone refuses every category (null)', PHONE, [(CATEGORY, 'includes(value.type) && isUuid(value.category_id)')], 'node-app'),
    ('A11', 'the phone takes a category that is not an id', PHONE, [(CATEGORY, "includes(value.type) && (value.category_id === null || typeof value.category_id === 'string')")], 'node-app'),
    ('A12', 'the phone takes an answer with one good figure among bad ones', PHONE, [('value.figures.every(isAiFigure)', 'value.figures.some(isAiFigure)')], 'node-app'),
    # The P3-T8 reviews' carries: a date that is no calendar date, the shared choices, the sanitizer's guard and the token clamp.
    ('D1', "a date that is no calendar date throws (isRealDate's guard dropped; the second review's m1)", DRAFTS,
     [('  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso\n', '  return date.toISOString().slice(0, 10) === iso\n')], 'node-grounding'),
    ('D2', 'archived wallets reach the models (the shared choices)', DRAFTS,
     [('ctx.wallets.filter((w) => !w.archived).map((w) => ({ id: w.id, name: w.name }))', 'ctx.wallets.map((w) => ({ id: w.id, name: w.name }))')], 'slip'),
    ('D3', 'archived categories reach the models (the shared choices)', DRAFTS,
     [('ctx.categories.filter((c) => !c.archived).map(', 'ctx.categories.map(')], 'slip'),
    ('R1', "a draft the sanitizer cannot read crashes the read (the second review's m1)", READ,
     [(GUARDED, "  const drafts = reply.kind === 'unreadable' ? [] : sanitizeDrafts(raw, input.context)\n")], 'slip'),
    ('R2', "a usage's missing input tokens are added as they come (the second review's n1)", READ,
     [('for (const n of [usage.input, usage.cacheRead, usage.cacheWrite]) input += counted(n)', 'for (const n of [usage.input, usage.cacheRead, usage.cacheWrite]) input += n')], 'slip'),
    ('R3', "a usage's missing output tokens are added as they come", READ, [('    output += counted(usage.output)\n', '    output += usage.output\n')], 'slip'),
    ('R4', 'a count below zero is counted', READ, [('(Number.isSafeInteger(n) && n >= 0 ? n : 0)', '(Number.isSafeInteger(n) ? n : 0)')], 'slip'),
    ('R5', "the slip read sends every wallet and category again, archived ones too (its own copy)", READ,
     [('...draftChoices(input.context) })', '...{ ' + UNFILTERED.format(ctx='input.context') + ' } })')], 'slip'),
    ('R6', 'parse sends every wallet and category again, archived ones too (its own copy)', SERVICE,
     [('...draftChoices(ctx) }) }],', UNFILTERED.format(ctx='ctx') + ' }) }],')], 'aitest'),
    ('T1', "an Opus answer with no draft replaces Haiku's draft (the reviews' O1 and MC)", READ,
     [('  if (opus.kind === \'answer\' && opus.read.drafts.length > 0) return done(opus.read, OPUS, [haiku, opus])\n', "  if (opus.kind === 'answer') return done(opus.read, OPUS, [haiku, opus])\n")], 'slip'),
    ('T2', "an Opus outage gives the use back only after a Haiku decline (the reviews' O2 and MO2)", READ,
     [("  if (opus.kind === 'failed') throw new SlipNotRead(opus.failure)\n", "  if (opus.kind === 'failed' && haiku.kind === 'declined') throw new SlipNotRead(opus.failure)\n")], 'slip'),
    ('T3', "every image is sent as a PNG (the reviews' O3 and MO3)", READ, [('media_type: input.image.mediaType', "media_type: 'image/png'")], 'slip'),
    ('T4', "tokens count the whole trace (the reviews' O6 and MA)", READ, [('deps.trace.calls.slice(first)', 'deps.trace.calls.slice(0)')], 'slip'),
    ('T5', "a bare answer is read without the object guard (the second review's MJ)", READ,
     [('const reply = (typeof raw === \'object\' && raw !== null ? raw : {}) as { kind?: unknown; bank?: unknown }', 'const reply = raw as { kind?: unknown; bank?: unknown }')], 'slip'),
]

# Each batch fits a 10-minute tool call: about 10 s per workers mutant without waiting for the lock.
BATCHES = {
    '1': ['P1', 'P2', 'P3', 'P5', 'K2', 'K3', 'K4', 'K9', 'K14', 'K15', 'K16'],
    '2': ['K17', 'K18', 'K19', 'K20', 'K21', 'K22', 'K23', 'K24', 'K25', 'K26', 'K27'],
    '3': ['K28', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'U1', 'U2', 'U3', 'U4'],
    '4': ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10'],
    '5': ['D2', 'D3', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'T1', 'T2', 'T3', 'T4', 'T5'],
    '6': ['P4', 'K1', 'K5', 'K6', 'K7', 'K10', 'K11', 'K12', 'K13', 'K29', 'D1',
          'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12'],
}

WORKERS_FILES = {
    'escalation': 'test/workers/ask-escalation.test.ts',
    'uses': 'test/workers/ai-uses.test.ts',
    'aitest': 'test/workers/ai.test.ts',
    'routing': 'test/workers/ai-routing.test.ts',
    'slip': 'test/workers/slip-read.test.ts',
}


def command(kind: str, tree: str, log: str) -> tuple[list[str], str]:
    if kind == 'node-app':
        return (['node', 'scripts/test-unit.mjs', 'src/spend/v1/ai/aiResources.test.ts'], os.path.join(tree, 'apps/app'))
    edge = os.path.join(tree, 'apps/edge')
    if kind == 'node-edge':
        return (['npx', 'vitest', 'run', 'test/ask-deadline.test.ts'], edge)
    if kind == 'node-grounding':
        return (['npx', 'vitest', 'run', 'test/ai-grounding.test.ts'], edge)
    locked = os.path.join(KIT, 'locked.sh')
    return ([locked, log, edge, 'npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', WORKERS_FILES[kind]], tree)


def sha(file: str) -> str:
    with open(file, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def first_errors(body: str, kind: str) -> list[str]:
    """The first error line of every failing case in the log."""
    lines = body.splitlines()
    if kind == 'node-app':
        tail = body.split('failing tests:', 1)[1] if 'failing tests:' in body else ''
        failed = re.search(r'^ℹ fail (\d+)', body, re.M)
        count = int(failed.group(1)) if failed else 0
        asserts = tail.count('AssertionError [ERR_ASSERTION]')
        return ['AssertionError'] * asserts + ['other'] * max(0, count - asserts)
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


def counts(body: str, kind: str) -> str:
    if kind == 'node-app':
        found = re.findall(r'^ℹ (tests|pass|fail) (\d+)', body, re.M)
        return ' '.join(f'{k} {v}' for k, v in found)
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
            if kind in ('node-app', 'node-edge', 'node-grounding'):
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
        errors = first_errors(body, kind)
        by_assertion = bool(errors) and all(e == 'AssertionError' for e in errors)
        if rc != 0 and by_assertion:
            killed.append(mid)
            print(f'{mid} killed (assertion): {what} [{kind}] -> {counts(body, kind)}', flush=True)
        elif rc != 0:
            other.append(mid)
            print(f'{mid} KILLED BY ANOTHER FAILURE {sorted(set(errors))}: {what} [{kind}] -> {counts(body, kind)}', flush=True)
        else:
            survivors.append(mid)
            print(f'{mid} SURVIVED: {what} [{kind}] -> {counts(body, kind)}', flush=True)
    print(f'{len(killed)} of {ran} killed; survivors {survivors}; other failures {other}; not restored {unrestored}', flush=True)
    return 0 if not survivors and not other and not unrestored else 1


if __name__ == '__main__':
    sys.exit(main())

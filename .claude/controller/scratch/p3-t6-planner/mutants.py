"""P3-T6's mutants: one per new guard, each run against the focused test that should kill it.

Usage: python3 -I mutants.py --tree <tree> --out <log dir> [--only ID,ID]

Each mutant replaces exact text (each `old` must occur exactly once in its file),
runs its test, and restores the file byte for byte (checked by SHA-256). A
mutant is killed when its test run exits non-zero; the line also says whether
the log shows an assertion failure. Workers runs take the heavy lock through
locked.sh, which sits next to this script. The last line reads:
"<k> of <n> killed; survivors [...]; not restored [...]".
"""
import argparse
import hashlib
import os
import subprocess
import sys

KIT = os.path.dirname(os.path.abspath(__file__))

SERVICE = 'apps/edge/src/v1/ai/service.ts'
MODELS = 'apps/edge/src/v1/ai/models.ts'
CONTRACT = 'packages/contracts/src/v1/ai.ts'
HANDLER = 'apps/edge/src/v1/handler.ts'
ROUTES = 'apps/edge/src/v1/ai/routes.ts'
CLIENT = 'apps/edge/test/workers/support/v1-client.ts'
RESOURCES = 'apps/app/src/spend/v1/ai/aiResources.ts'

# (id, what it breaks, file, [(old, new), ...], test kind)
MUTANTS = [
    # The contract (edge Node: test/contracts-ai.test.ts).
    ('C1', "the slip's phone wait is 5 s past its deadline, not 15", CONTRACT,
     [('= { parse: 20_000, slip: 60_000, note: 15_000, ask: 60_000 };', '= { parse: 20_000, slip: 50_000, note: 15_000, ask: 60_000 };')], 'node-edge'),
    ('C2', "Ask Bun's route deadline equals the phone's wait", CONTRACT,
     [('= { parse: 15_000, slip: 45_000, note: 10_000, ask: 55_000 };', '= { parse: 15_000, slip: 45_000, note: 10_000, ask: 60_000 };')], 'node-edge'),
    ('C3', 'a fourth model is allowed', CONTRACT,
     [('export const AI_MODELS = ["claude-haiku-5-5", "claude-opus-5-5", "rules"] as const;',
       'export const AI_MODELS = ["claude-haiku-5-5", "claude-opus-5-5", "claude-sonnet-5-5", "rules"] as const;')], 'node-edge'),
    # The two request bases.
    ('M1', 'Haiku keeps the fallback beta and fallbacks (the plan\'s mutant)', MODELS,
     [("return { model: HAIKU, max_tokens: maxTokens, output_config: { effort } }",
       "return { model: HAIKU, max_tokens: maxTokens, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort } }")], 'workers'),
    ('M2', 'Opus loses fallbacks', MODELS,
     [("betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort } }",
       "betas: ['server-side-fallback-2026-07-01'], output_config: { effort } }")], 'node-edge'),
    ('M3', "Haiku's base names Opus", MODELS,
     [('return { model: HAIKU, max_tokens', 'return { model: OPUS, max_tokens')], 'node-edge'),
    # The service (workers: test/workers/ai-routing.test.ts).
    ('S1', "the rules' parse answer drops its model (the plan's mutant)", SERVICE,
     [("return { drafts: draft ? [draft] : [], source: 'rules', ...BY_RULES }", "return { drafts: draft ? [draft] : [], source: 'rules' }")], 'workers'),
    ('S2', "a Haiku parse names message.model (the plan's mutant)", SERVICE,
     [("return drafts.length > 0 ? { drafts, source: 'ai', ...BY_HAIKU } : rules()",
       "return drafts.length > 0 ? { drafts, source: 'ai', model: message.model, escalated: false } : rules()")], 'workers'),
    ('S3', 'the plain-facts note names Haiku', SERVICE,
     [("text: factsText(facts, locale), source: 'facts', ...BY_RULES }", "text: factsText(facts, locale), source: 'facts', ...BY_HAIKU }")], 'workers'),
    ('S4', "Ask Bun's answer from its figures names Haiku", SERVICE,
     [("figures, source: 'facts', ...BY_RULES })", "figures, source: 'facts', ...BY_HAIKU })")], 'workers'),
    ('S5', "Haiku's answers say escalated", SERVICE,
     [('= { model: HAIKU, escalated: false }', '= { model: HAIKU, escalated: true }')], 'workers'),
    ('S6', "the routes ignore the deps' deadlines", SERVICE,
     [('const totalMs = this.deps.deadlines?.[feature] ?? AI_ROUTE_DEADLINE_MS[feature]', 'const totalMs = AI_ROUTE_DEADLINE_MS[feature]')], 'workers'),
    ('S7', "parse starts its deadline after the use, not before its first step (n2)", SERVICE,
     [("    const { trace, deadline } = this.start('parse')\n    const ctx = await this.draftContext(s, request.today)\n",
       "    const ctx = await this.draftContext(s, request.today)\n"),
      ("    await this.consume(s, 'parse')\n", "    await this.consume(s, 'parse')\n    const { trace, deadline } = this.start('parse')\n")], 'workers'),
    ('S8', 'the note starts its deadline after the facts step (n2)', SERVICE,
     [("    const { trace, deadline } = this.start('note')\n    const today = trustedToday(date, bangkokDate(this.now()))\n    const facts = await step<BunFact[]>(s, 'ai.facts', { query: { date: today } })\n",
       "    const today = trustedToday(date, bangkokDate(this.now()))\n    const facts = await step<BunFact[]>(s, 'ai.facts', { query: { date: today } })\n    const { trace, deadline } = this.start('note')\n")], 'workers'),
    ('S9', "the deadline reads the real clock, not the service's", SERVICE,
     [('new AiDeadline(totalMs, () => this.now().getTime())', 'new AiDeadline(totalMs)')], 'workers'),
    ('S10', "Ask Bun's Haiku turns have no 25 s cap (R1)", SERVICE,
     [('const haiku = deadline.child(HAIKU_ASK_CAP_MS)', 'const haiku = deadline')], 'workers'),
    ('S11', "each Ask Bun turn gets a fresh 25 s (R4)", SERVICE,
     [('    const haiku = deadline.child(HAIKU_ASK_CAP_MS)\n', ''),
      ('tracedSend(this.deps.transport, trace, haiku, {', 'tracedSend(this.deps.transport, trace, deadline.child(HAIKU_ASK_CAP_MS), {')], 'workers'),
    ('S12', 'parse calls the transport around tracedSend: no trace, no 2 s floor (R3)', SERVICE,
     [("      const message = await tracedSend(this.deps.transport, trace, deadline, {\n        feature: 'parse',",
       "      const message = await ((t, _trace, d, call) => t.send(call.params, { timeoutMs: d.remainingMs() }))(this.deps.transport, trace, deadline, {\n        feature: 'parse',")], 'workers'),
    ('S13', "parse runs on the note's deadline", SERVICE,
     [("this.start('parse')", "this.start('note')")], 'workers'),
    ('S14', 'a Haiku slip read names the rules', SERVICE,
     [("return { drafts: sanitizeDrafts(raw, ctx), bank, source: 'ai', ...BY_HAIKU }", "return { drafts: sanitizeDrafts(raw, ctx), bank, source: 'ai', ...BY_RULES }")], 'workers'),
    # The wiring from the front door to the service.
    ('W1', 'the handler drops the deps\' deadlines', HANDLER,
     [('        aiDeadlines: deps.aiDeadlines,\n', '')], 'workers'),
    ('W2', 'the AI routes drop the context\'s deadlines', ROUTES,
     [('new VaultAiService({ transport: w.transport ?? null, deadlines: w.aiDeadlines })', 'new VaultAiService({ transport: w.transport ?? null })')], 'workers'),
    ('W3', 'startV1 drops its aiDeadlines option', CLIENT,
     [('    aiDeadlines: options?.aiDeadlines,\n', '')], 'workers'),
    # The phone (app Node: src/spend/v1/ai/aiResources.test.ts).
    ('A1', "a parse waits the transport's 20 s (the plan's mutant)", RESOURCES,
     [("{ body: request, resendLost: false, ...phoneWait('parse'), validate: isAiParseResult }", "{ body: request, resendLost: false, validate: isAiParseResult }")], 'node-app'),
    ('A2', "the note waits the parse's time", RESOURCES,
     [("{ ...phoneWait('note'), validate: isAiNoteResult }", "{ ...phoneWait('parse'), validate: isAiNoteResult }")], 'node-app'),
    ('A3', 'a resend after a refresh may outlast the wait (no deadlineMs)', RESOURCES,
     [('({ timeoutMs: AI_PHONE_TIMEOUT_MS[feature], deadlineMs: AI_PHONE_TIMEOUT_MS[feature] })', '({ timeoutMs: AI_PHONE_TIMEOUT_MS[feature] })')], 'node-app'),
    ('A4', 'any model name is accepted', RESOURCES,
     [("(AI_MODELS as readonly unknown[]).includes(value.model) && typeof value.escalated === 'boolean'", "typeof value.model === 'string' && typeof value.escalated === 'boolean'")], 'node-app'),
    ('A5', 'escalated need not be true or false', RESOURCES,
     [("(AI_MODELS as readonly unknown[]).includes(value.model) && typeof value.escalated === 'boolean'", "(AI_MODELS as readonly unknown[]).includes(value.model) && 'escalated' in value")], 'node-app'),
    ('A6', "an ask result's keys leave out escalated", RESOURCES,
     [("hasExactly(value, ['answer', 'figures', 'source', 'model', 'escalated'])", "hasExactly(value, ['answer', 'figures', 'source', 'model'])")], 'node-app'),
    ('A7', 'a slip read may be resent after a lost answer', RESOURCES,
     [("transport.request('POST', '/v1/ai/slip', { body: request, resendLost: false, ...phoneWait('slip')", "transport.request('POST', '/v1/ai/slip', { body: request, ...phoneWait('slip')")], 'node-app'),
]


def command(kind: str, tree: str, log: str) -> tuple[list[str], str]:
    if kind == 'node-edge':
        return (['npx', 'vitest', 'run', 'test/contracts-ai.test.ts'], os.path.join(tree, 'apps/edge'))
    if kind == 'node-app':
        return (['npm', 'run', 'test:unit', '-w', 'gogospend-app', '--', 'src/spend/v1/ai/aiResources.test.ts'], tree)
    if kind == 'workers':
        locked = os.path.join(KIT, 'locked.sh')
        return ([locked, log, os.path.join(tree, 'apps/edge'), 'npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', 'test/workers/ai-routing.test.ts'], tree)
    raise ValueError(kind)


def sha(path: str) -> str:
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--tree', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--only', default='')
    args = parser.parse_args()
    tree = os.path.abspath(args.tree)
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)
    only = {m for m in args.only.split(',') if m}
    killed, survivors, unrestored, ran = [], [], [], 0
    for mid, what, rel, swaps, kind in MUTANTS:
        if only and mid not in only:
            continue
        ran += 1
        path = os.path.join(tree, rel)
        before = sha(path)
        with open(path, encoding='utf-8') as f:
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
            with open(path, 'w', encoding='utf-8') as f:
                f.write(text)
            argv, cwd = command(kind, tree, log)
            if kind == 'workers':
                rc = subprocess.run(argv, cwd=cwd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode
            else:
                with open(log, 'w', encoding='utf-8') as f:
                    rc = subprocess.run(argv, cwd=cwd, stdout=f, stderr=subprocess.STDOUT).returncode
        finally:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(original)
        if sha(path) != before:
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

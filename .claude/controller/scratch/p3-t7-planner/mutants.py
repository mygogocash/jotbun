"""P3-T7's mutants: one per new guard, each run against the focused test that should kill it.

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

USES = 'apps/edge/src/v1/ai/uses.ts'
VAULT_AI = 'apps/edge/src/vault/ai.ts'
VAULT_ROUTES = 'apps/edge/src/vault/routes.ts'
STEPS = 'apps/edge/src/v1/routes.ts'
SERVICE = 'apps/edge/src/v1/ai/service.ts'
TRANSPORT = 'apps/edge/src/v1/ai/transport.ts'

FOUR = "const GIVES_BACK: readonly CallFailure[] = ['rate_limited', 'server_error', 'timeout', 'no_connection']"
REFUND_SQL = "'UPDATE ai_usage SET uses = uses - 1 WHERE day = ? AND feature = ? AND uses > 0', day, feature)"
SIGNAL = "error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')"

# (id, what it breaks, file, [(old, new), ...], test kind)
MUTANTS = [
    # When a use comes back (uses.ts; workers: test/workers/ai-uses.test.ts).
    ('U1', 'a request a model answered still gets its use back after a failed last call', USES,
     [('return !answeredByModel && last !== undefined', 'return last !== undefined')], 'uses'),
    ('U2', 'the first call decides, not the last', USES,
     [('const last = calls.at(-1)', 'const last = calls[0]')], 'uses'),
    ('U3', 'a rate limit spends the use', USES,
     [(FOUR, "const GIVES_BACK: readonly CallFailure[] = ['server_error', 'timeout', 'no_connection']")], 'uses'),
    ('U4', 'a 5xx spends the use', USES,
     [(FOUR, "const GIVES_BACK: readonly CallFailure[] = ['rate_limited', 'timeout', 'no_connection']")], 'uses'),
    ('U5', 'a timeout spends the use', USES,
     [(FOUR, "const GIVES_BACK: readonly CallFailure[] = ['rate_limited', 'server_error', 'no_connection']")], 'uses'),
    ('U6', 'no connection spends the use', USES,
     [(FOUR, "const GIVES_BACK: readonly CallFailure[] = ['rate_limited', 'server_error', 'timeout']")], 'uses'),
    ('U7', 'a request the API rejected (a 400) gives its use back', USES,
     [(FOUR, "const GIVES_BACK: readonly CallFailure[] = ['rate_limited', 'server_error', 'timeout', 'no_connection', 'rejected']")], 'uses'),
    ('U8', 'any other failure gives its use back', USES,
     [(FOUR, "const GIVES_BACK: readonly CallFailure[] = ['rate_limited', 'server_error', 'timeout', 'no_connection', 'other']")], 'uses'),
    ('U9', "a call that answered gives its use back: a refund on a decline (the plan's mutant)", USES,
     [('last.failure !== null && GIVES_BACK.includes(last.failure)', '(last.failure === null || GIVES_BACK.includes(last.failure))')], 'uses'),
    # The vault's use and refund (vault/ai.ts).
    ('V1', "a refund takes today's row, not the counted day's (the plan's mutant)", VAULT_AI,
     [(REFUND_SQL, "'UPDATE ai_usage SET uses = uses - 1 WHERE day = ? AND feature = ? AND uses > 0', bangkokDate(c.now), feature)")], 'uses'),
    ('V2', 'a refund goes below zero', VAULT_AI,
     [(REFUND_SQL, "'UPDATE ai_usage SET uses = uses - 1 WHERE day = ? AND feature = ?', day, feature)")], 'uses'),
    ('V3', "a refund takes every feature's use that day", VAULT_AI,
     [(REFUND_SQL, "'UPDATE ai_usage SET uses = uses - 1 WHERE day = ? AND ? IS NOT NULL AND uses > 0', day, feature)")], 'uses'),
    ('V4', 'a refund wipes the day\'s uses', VAULT_AI,
     [(REFUND_SQL, "'UPDATE ai_usage SET uses = 0 WHERE day = ? AND feature = ? AND uses > 0', day, feature)")], 'uses'),
    ('V5', "the use answers the real clock's day, not the vault's", VAULT_AI,
     [('  return { day: today }\n', '  return { day: bangkokDate(new Date()) }\n')], 'uses'),
    # The vault's steps (vault/routes.ts).
    ('R1', 'the use step answers no day', VAULT_ROUTES,
     [('    return okReply(call.route, consumeAi(c, feature as AiFeature))\n', '    consumeAi(c, feature as AiFeature)\n    return okReply(call.route, {})\n')], 'uses'),
    ('R2', "the refund step takes today's Bangkok day, not the body's", VAULT_ROUTES,
     [("refundAi(c, feature as AiFeature, parseAiDate(day, 'day'))", 'refundAi(c, feature as AiFeature, new Date(c.now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10))')], 'uses'),
    ('R3', 'the refund step takes any feature', VAULT_ROUTES,
     [("    if (!(AI_FEATURES as readonly unknown[]).includes(feature)) throw new Error('an AI step names its feature')\n    refundAi(",
       '    refundAi(')], 'uses'),
    ('R4', 'the refund step takes any day', VAULT_ROUTES,
     [("refundAi(c, feature as AiFeature, parseAiDate(day, 'day'))", 'refundAi(c, feature as AiFeature, day as string)')], 'uses'),
    # The step table (v1/routes.ts).
    ('S1', 'the refund step checks the session, so a session ended during the call keeps the use spent', STEPS,
     [("  'ai.refund': { anySession: true },\n", "  'ai.refund': {},\n")], 'uses'),
    # The service (service.ts).
    ('G1', 'a parse whose call failed keeps the use spent', SERVICE,
     [("      this.logFailure('parse', error)\n      await this.giveBack(s, use, trace)\n", "      this.logFailure('parse', error)\n")], 'uses'),
    ('G2', 'a slip read whose call failed keeps the use spent', SERVICE,
     [("      this.logFailure('slip', error)\n      await this.giveBack(s, use, trace)\n", "      this.logFailure('slip', error)\n")], 'uses'),
    ('G3', 'a note whose call failed keeps the use spent', SERVICE,
     [('      if (use) await this.giveBack(s, use, trace)\n', '')], 'uses'),
    ('G4', 'a question whose call failed keeps the use spent', SERVICE,
     [("      this.logFailure('ask', error)\n      await this.giveBack(s, use, trace)\n", "      this.logFailure('ask', error)\n")], 'uses'),
    ('G5', 'the service asks as if a model had answered', SERVICE,
     [('if (!shouldRefund(trace.calls, false)) return', 'if (!shouldRefund(trace.calls, true)) return')], 'uses'),
    ('G6', 'a refund that fails fails the request', SERVICE,
     [("    try {\n      await step<unknown>(s, 'ai.refund', { body: use })\n    } catch (error) {\n      console.warn(JSON.stringify({ level: 'warn', event: 'ai_refund_failed', feature: use.feature, failure: failureName(error) }))\n    }\n",
       "    await step<unknown>(s, 'ai.refund', { body: use })\n")], 'uses'),
    ('G7', 'a refund that fails is not logged', SERVICE,
     [("      console.warn(JSON.stringify({ level: 'warn', event: 'ai_refund_failed', feature: use.feature, failure: failureName(error) }))\n", '      void error\n')], 'uses'),
    ('G8', "the use keeps the service's own day, not the vault's", SERVICE,
     [('    return { feature, day }\n', '    return { feature, day: bangkokDate(this.now()) }\n')], 'uses'),
    ('G9', "a refund gives back the parse's use, whatever the feature", SERVICE,
     [("await step<unknown>(s, 'ai.refund', { body: use })", "await step<unknown>(s, 'ai.refund', { body: { ...use, feature: 'parse' } })")], 'uses'),
    ('G10', "every failure path gives the use back once a call was made: a refund on a decline (the plan's mutant)", SERVICE,
     [('if (!shouldRefund(trace.calls, false)) return', 'if (trace.calls.length === 0) return')], 'uses'),
    # The P3-T6 review's X4, pinned in ai-routing.test.ts (workers).
    ('X4', 'a parse whose Haiku reply has no usable draft: the rules, but say Haiku', SERVICE,
     [("return drafts.length > 0 ? { drafts, source: 'ai', ...BY_HAIKU } : rules()", "return drafts.length > 0 ? { drafts, source: 'ai', ...BY_HAIKU } : { ...rules(), ...BY_HAIKU }")], 'routing'),
    # A stalled body (transport.ts; edge Node: test/ai-transport.test.ts), the P3-T4 review's m1.
    ('T1', 'a read the signal ended is other, not timeout (as the base had it)', TRANSPORT,
     [('    error instanceof Anthropic.APIConnectionTimeoutError ||\n    endedBySignal(error)\n', '    error instanceof Anthropic.APIConnectionTimeoutError\n')], 'node-edge'),
    ('T2', 'a TimeoutError is not a timeout', TRANSPORT,
     [(SIGNAL, "error instanceof DOMException && error.name === 'AbortError'")], 'node-edge'),
    ('T3', 'an AbortError is not a timeout', TRANSPORT,
     [(SIGNAL, "error instanceof DOMException && error.name === 'TimeoutError'")], 'node-edge'),
    ('T4', 'every DOMException is a timeout', TRANSPORT,
     [(SIGNAL, 'error instanceof DOMException')], 'node-edge'),
    ('T5', "the call's own signal is dropped, so a stalled body outlives its time (the P3-T4 review's R10)", TRANSPORT,
     [('        signal: AbortSignal.timeout(options.timeoutMs),\n', '')], 'node-edge'),
]


def command(kind: str, tree: str, log: str) -> tuple[list[str], str]:
    edge = os.path.join(tree, 'apps/edge')
    if kind == 'node-edge':
        return (['npx', 'vitest', 'run', 'test/ai-transport.test.ts'], edge)
    locked = os.path.join(KIT, 'locked.sh')
    if kind == 'uses':
        return ([locked, log, edge, 'npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', 'test/workers/ai-uses.test.ts'], tree)
    if kind == 'routing':
        return ([locked, log, edge, 'npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', 'test/workers/ai-routing.test.ts'], tree)
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
            if kind == 'node-edge':
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

"""P3-T3's mutants: one per guard, each run against the focused test that should kill it.

Usage: python3 -I mutants.py --tree <tree> --out <log dir> [--only ID,ID] [--batch node|workers]

Each mutant replaces exact text (each `old` must occur exactly once in its file),
runs its test, and restores the file byte for byte (checked by SHA-256). A mutant
is killed when its run exits non-zero; the line says "killed (assertion)" only when
every failing case failed on an AssertionError (the count of failed cases equals the
count of AssertionError lines, and no other error starts a line). Workers runs take
the heavy lock through locked.sh, which sits next to this script. The last line reads:
"<k> of <n> killed; survivors [...]; not clean [...]; not restored [...]".
"""
from __future__ import annotations

import argparse
import hashlib
import os
import re
import subprocess
import sys

KIT = os.path.dirname(os.path.abspath(__file__))

GATES = 'apps/edge/src/v1/gates.ts'
CONFIG = 'apps/edge/src/v1/config.ts'
ROUTES = 'apps/edge/src/v1/routes.ts'
AI_ROUTES = 'apps/edge/src/v1/ai/routes.ts'
HANDLER = 'apps/edge/src/v1/handler.ts'

UNRELEASED = "    if (scopes.some((scope) => !this.isExposed(scope))) throw new ProblemException(404, 'NOT_FOUND')\n"
FIRST_PAUSED = '    const paused = scopes.find((scope) => this.isPaused(scope))\n'
REFUSAL = "{ retryAfterSeconds: this.retryAfterSeconds, messageKey: `errors.${paused}_paused` }"
EDGE_LIST = 'return this.aiPaused ? [...this.pausedScopes(), \'ai\'] : this.pausedScopes()'
FILTER = "config.paused?.filter((scope): scope is GateScope => scope !== 'ai')"
SCOPES_CHECK = '!paused.every((scope) => (EDGE_GATE_SCOPES as readonly unknown[]).includes(scope))'
GATED = "available: preferences.available && !w.gates.isPaused('ai')"
GATE_LINE = '    config.gates.assertOpen(...(route.gates ?? []))\n'
AUTH_LINE = '        claims = await authenticate(request, env, deps, config, route.access)\n'

PAUSED_CASE = 'a paused ai gate answers 503 AI_PAUSED'
PREFERENCES_CASE = 'AI preferences stay open'


def route(method: str, path: str, worker: str, status: str = '') -> str:
    """The route's line as GREEN writes it (gates: ['ai'] before the status)."""
    tail = f', status: {status}' if status else ''
    return f"{{ method: '{method}', path: '{path}', access: '{'bound_session' if method == 'GET' else 'current_policy'}', worker: '{worker}', gates: ['ai']{tail} }}"


def ungated(line: str) -> str:
    return line.replace(", gates: ['ai']", '')


PARSE = route('POST', '/v1/ai/parse', 'ai.parse', '200')
SLIP = route('POST', '/v1/ai/slip', 'ai.slip', '200')
NOTE = route('GET', '/v1/ai/note', 'ai.note')
ASK = route('POST', '/v1/ai/ask', 'ai.ask', '200')
PREFS_GET = "{ method: 'GET', path: '/v1/me/ai-preferences', access: 'bound_session', worker: 'ai.preferences.get' }"

# (id, what it breaks, file, [(old, new), ...], test kind, case filter or None)
MUTANTS = [
    # EdgeGates (src/v1/gates.ts; Node: test/edge-gates.test.ts).
    ('G1', 'an unreleased scope is not refused before a pause', GATES, [(UNRELEASED, '')], 'gates', None),
    ('G2', 'ai reads as an unreleased feature', GATES, [("return scope === 'ai' || super.isExposed(scope)", "return scope !== 'ai' && super.isExposed(scope)")], 'gates', None),
    ('G3', 'ai never reads as paused', GATES, [("return scope === 'ai' ? this.aiPaused : super.isPaused(scope)", "return scope === 'ai' ? false : super.isPaused(scope)")], 'gates', None),
    ('G4', "the constructor drops a pause of ai (the plan's stub)", GATES, [("this.aiPaused = config.paused?.includes('ai') ?? false", 'this.aiPaused = false')], 'gates', None),
    ('G5', 'gates with no list pause ai', GATES, [("this.aiPaused = config.paused?.includes('ai') ?? false", "this.aiPaused = config.paused?.includes('ai') ?? true")], 'gates', None),
    ('G6', 'ai goes to FeatureGates, which refuses it', GATES, [(FILTER, 'config.paused as readonly GateScope[] | undefined')], 'gates', None),
    ('G7', 'an unknown scope is dropped with ai', GATES, [(FILTER, 'config.paused?.filter((scope): scope is GateScope => (GATE_SCOPES as readonly string[]).includes(scope))')], 'gates', None),
    ('G8', 'a paused ai answers another code', GATES, [("ai: 'AI_PAUSED' }", "ai: 'SERVICE_UNAVAILABLE' }")], 'gates', None),
    ('G9', "the API's scopes lose their codes", GATES, [("{ ...GATE_PROBLEM_CODES, ai: 'AI_PAUSED' }", "{ ai: 'AI_PAUSED' }")], 'gates', None),
    ('G10', 'the refusal carries no retry', GATES, [(REFUSAL, "{ messageKey: `errors.${paused}_paused` }")], 'gates', None),
    ('G11', 'the refusal carries no message key', GATES, [(REFUSAL, '{ retryAfterSeconds: this.retryAfterSeconds }')], 'gates', None),
    ('G12', "the first paused scope in the edge's order, not the order given", GATES, [(FIRST_PAUSED, '    const paused = EDGE_GATE_SCOPES.find((scope) => scopes.includes(scope) && this.isPaused(scope))\n')], 'gates', None),
    ('G13', 'pausedEdgeScopes never lists ai', GATES, [(EDGE_LIST, 'return this.pausedScopes()')], 'gates', None),
    ('G14', 'pausedEdgeScopes always lists ai', GATES, [(EDGE_LIST, "return [...this.pausedScopes(), 'ai']")], 'gates', None),
    ('G15', "ai before the API's scopes", GATES, [(EDGE_LIST, "return this.aiPaused ? ['ai', ...this.pausedScopes()] : this.pausedScopes()")], 'gates', None),
    ('G16', "the edge's scope list has no ai", GATES, [("export const EDGE_GATE_SCOPES = [...GATE_SCOPES, 'ai'] as const", 'export const EDGE_GATE_SCOPES = [...GATE_SCOPES] as const')], 'gates', None),
    # The route table (src/v1/routes.ts and MODEL_ROUTE_WORKERS; Node: test/route-coverage.test.ts).
    ('R1', "the note route is ungated (the plan's mutant)", ROUTES, [(NOTE, ungated(NOTE))], 'coverage', None),
    ('R2', 'the parse route is ungated', ROUTES, [(PARSE, ungated(PARSE))], 'coverage', None),
    ('R3', 'the slip route is ungated', ROUTES, [(SLIP, ungated(SLIP))], 'coverage', None),
    ('R4', 'the ask route is ungated', ROUTES, [(ASK, ungated(ASK))], 'coverage', None),
    ('R5', 'the preferences carry the ai gate', ROUTES, [(PREFS_GET, PREFS_GET.replace(" }", ", gates: ['ai'] }"))], 'coverage', None),
    ('R6', 'parse also waits for writes', ROUTES, [(PARSE, PARSE.replace("gates: ['ai']", "gates: ['ai', 'writes']"))], 'coverage', None),
    ('R7', 'MODEL_ROUTE_WORKERS leaves the note out', GATES, [("['ai.parse', 'ai.slip', 'ai.note', 'ai.ask']", "['ai.parse', 'ai.slip', 'ai.ask']")], 'coverage', None),
    # The config reader (src/v1/config.ts; workers: test/workers/config.test.ts).
    ('C1', "fail closed with the API's scopes only (the plan's mutant)", CONFIG, [('paused: [...EDGE_GATE_SCOPES], retryAfterSeconds', "paused: EDGE_GATE_SCOPES.filter((scope) => scope !== 'ai'), retryAfterSeconds")], 'config', None),
    ('C2', 'a config that names ai is malformed', CONFIG, [(SCOPES_CHECK, "!paused.every((scope) => (EDGE_GATE_SCOPES as readonly unknown[]).includes(scope) && scope !== 'ai')")], 'config', None),
    ('C3', 'a config may name any scope', CONFIG, [(SCOPES_CHECK, "!paused.every((scope) => typeof scope === 'string')")], 'config', None),
    # The preferences (src/v1/ai/routes.ts; workers: the preferences case of test/workers/ai-gate.test.ts).
    ('P1', "the preferences ignore the gate (the plan's mutant)", AI_ROUTES, [(GATED, 'available: preferences.available')], 'gate', PREFERENCES_CASE),
    ('P2', 'available ignores whether a model is configured', AI_ROUTES, [(GATED, "available: !w.gates.isPaused('ai')")], 'gate', PREFERENCES_CASE),
    ('P3', 'GET answers without the gate', AI_ROUTES, [('return answer(gated(w, await service.preferences(vault)))', 'return answer(await service.preferences(vault))')], 'gate', PREFERENCES_CASE),
    ('P4', 'PUT answers without the gate', AI_ROUTES, [('return answer(gated(w, await service.setPreferences(vault, update)))', 'return answer(await service.setPreferences(vault, update))')], 'gate', PREFERENCES_CASE),
    # The front door's order (src/v1/handler.ts, unchanged by this task; workers: the paused case of ai-gate.test.ts).
    ('H1', 'the gates after the client check and the token', HANDLER, [(GATE_LINE, ''), (AUTH_LINE, AUTH_LINE + '    ' + GATE_LINE)], 'gate', PAUSED_CASE),
]

BATCHES = {
    'node': [m[0] for m in MUTANTS if m[4] in ('gates', 'coverage')],
    'workers': [m[0] for m in MUTANTS if m[4] in ('config', 'gate')],
}


def command(kind: str, case: str | None, tree: str, log: str) -> tuple[list[str], str]:
    edge = os.path.join(tree, 'apps/edge')
    if kind in ('gates', 'coverage'):
        test = {'gates': 'test/edge-gates.test.ts', 'coverage': 'test/route-coverage.test.ts'}[kind]
        return (['npx', 'vitest', 'run', '--reporter=verbose', test], edge)
    locked = os.path.join(KIT, 'locked.sh')
    test = {'config': 'test/workers/config.test.ts', 'gate': 'test/workers/ai-gate.test.ts'}[kind]
    argv = [locked, log, edge, 'npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', '--reporter=verbose', test]
    if case:
        argv += ['-t', case]
    return (argv, tree)


def sha(target: str) -> str:
    with open(target, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def verdict(body: str) -> tuple[int, int, int]:
    """(failed cases, AssertionError lines, other error lines) from a vitest log."""
    failed = re.search(r'Tests\s+(\d+) failed', body)
    assertions = len(re.findall(r'^AssertionError', body, re.M))
    others = len(re.findall(r'^(?:TypeError|ReferenceError|SyntaxError|RangeError|Error|SqliteError)\b[^\n]*:', body, re.M))
    return (int(failed.group(1)) if failed else 0, assertions, others)


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
    only = {m for m in args.only.split(',') if m}
    if args.batch:
        only |= set(BATCHES[args.batch])
    killed, survivors, unclean, unrestored, ran = [], [], [], [], 0
    for mid, what, rel, swaps, kind, case in MUTANTS:
        if only and mid not in only:
            continue
        ran += 1
        target = os.path.join(tree, rel)
        with open(target, encoding='utf-8') as f:
            original = f.read()
        digest = sha(target)
        text = original
        for old, new in swaps:
            count = text.count(old)
            if count != 1:
                print(f'{mid} BAD ANCHOR ({count} matches) in {rel}: {old[:60]!r}', flush=True)
                return 2
            text = text.replace(old, new)
        with open(target, 'w', encoding='utf-8') as f:
            f.write(text)
        log = os.path.join(out, f'{mid}.log')
        try:
            argv, cwd = command(kind, case, tree, log)
            if kind in ('gates', 'coverage'):
                with open(log, 'w', encoding='utf-8') as f:
                    rc = subprocess.run(argv, cwd=cwd, stdout=f, stderr=subprocess.STDOUT).returncode
            else:
                rc = subprocess.run(argv, cwd=cwd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode
        finally:
            with open(target, 'w', encoding='utf-8') as f:
                f.write(original)
        if sha(target) != digest:
            unrestored.append(mid)
        with open(log, encoding='utf-8', errors='replace') as f:
            body = f.read()
        failed, assertions, others = verdict(body)
        clean = failed > 0 and assertions == failed and others == 0
        where = kind if case is None else f'{kind}, -t "{case}"'
        if rc != 0:
            killed.append(mid)
            if not clean:
                unclean.append(mid)
            print(f'{mid} killed ({"assertion" if clean else "NOT CLEAN"}; {failed} failed): {what} [{where}]', flush=True)
        else:
            survivors.append(mid)
            print(f'{mid} SURVIVED: {what} [{where}]', flush=True)
    print(f'{len(killed)} of {ran} killed; survivors {survivors}; not clean {unclean}; not restored {unrestored}', flush=True)
    return 0 if not survivors and not unclean and not unrestored else 1


if __name__ == '__main__':
    sys.exit(main())

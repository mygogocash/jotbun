"""1D-T11's mutants: one per new guard, each run against the focused test file that should kill it.

Usage: python3 -I mutants.py --tree <tree> --out <log dir> [--only ID,ID]

Each mutant replaces exact text (each `old` must occur exactly once in its file),
runs its test file, and restores the file byte for byte (checked by SHA-256). A
mutant is killed when its test run exits non-zero; the line also says whether
the log shows an assertion failure. Workers runs take the heavy lock through
locked.sh, which sits next to this script. The last line reads:
"<k> of <n> killed; survivors [...]; not restored [...]".
No mutant here can reach PostHog: every front door in the tests is given a fake
port, and none of these mutants changes how the client is chosen.
"""
import argparse
import hashlib
import os
import subprocess
import sys

KIT = os.path.dirname(os.path.abspath(__file__))

ANALYTICS = 'apps/edge/src/vault/analytics.ts'
VAULT = 'apps/edge/src/vault/user-vault.ts'
HANDLER = 'apps/edge/src/v1/handler.ts'
ROUTES = 'apps/edge/src/v1/routes.ts'
LIVE = 'apps/edge/src/vault/live.ts'

WEEKS = 'return Math.min(MAX_WEEKS_SINCE_SIGNUP, Math.max(0, Math.floor((c.now.getTime() - created) / WEEK_MS)))'
CATCH = "  } catch (error) {\n    logFailure('vault_analytics_failed', error)\n    return { consent: 'unasked', events: [], failure }\n  }"
FAILURE = "if (!reply.ok && reply.code === 'INTERNAL_ERROR') failure = failureName(error)"
EVENTS = "const events = analytics.consent === 'yes' && !analyticsOff(request) ? [...analytics.events, ...replyEvents(vault, reply)] : []"
OUTBOX = "if (isInternalError(reply) && OUTBOX_ROUTES.includes(vault))"
COUNT = "    if (failed) client.captureFailure(analytics.failure ?? 'Error', vault)\n"
WORKER_COUNT = '    if (response.status === 500) countWorkerFailure(env, deps, error)\n'
ANSWER = "const answer = route.vault === 'me.analytics' ? await withAnalyticsId(reply, env, claims) : reply"
ROUTE = "{ method: 'GET', path: '/v1/me/analytics', access: 'bound_session', vault: 'me.analytics' }"
LIVE_CATCH = "  } catch (error) {\n    logFailure('live_after_call_failed', error)\n  }"

# (id, what it breaks, file, [(old, new), ...], test kind)
MUTANTS = [
    # The vault half (vault/analytics.ts; workers: test/workers/server-events.test.ts).
    ('A1', 'a person never asked reads as no', ANALYTICS,
     [("if (row === undefined) return 'unasked'", "if (row === undefined) return 'no'")], 'events'),
    ('A2', 'a no reads as yes', ANALYTICS,
     [("return row.granted === 1 ? 'yes' : 'no'", "return 'yes'")], 'events'),
    ('A3', 'the weeks round to the nearest week', ANALYTICS,
     [(WEEKS, WEEKS.replace('Math.floor(', 'Math.round('))], 'events'),
    ('A4', 'no bound of 1040 weeks', ANALYTICS,
     [(WEEKS, WEEKS.replace('Math.min(MAX_WEEKS_SINCE_SIGNUP, ', 'Math.min(Infinity, '))], 'events'),
    ('A5', 'a sign-up time in the future gives negative weeks', ANALYTICS,
     [(WEEKS, WEEKS.replace('Math.max(0, ', 'Math.max(-Infinity, '))], 'events'),
    ('A6', 'an unreadable sign-up time is not 0 weeks', ANALYTICS,
     [('  if (!Number.isFinite(created)) return 0\n', '')], 'events'),
    ('A7', 'every route counts its records, not only transactions.create (Q16)', ANALYTICS,
     [("  if (route !== 'transactions.create') return []\n", '')], 'events'),
    ('A8', 'every version of a record counts, not only its first', ANALYTICS,
     [('AND version = 1 AND', 'AND')], 'events'),
    ('A9', 'a change in any state counts, not only an active one', ANALYTICS,
     [("AND state = 'active' AND", 'AND')], 'events'),
    ('A10', 'a change of any entity counts, not only a transaction', ANALYTICS,
     [("WHERE entity = 'transaction' AND", 'WHERE')], 'events'),
    ('A11', "the range includes its start (the revision before the call)", ANALYTICS,
     [('revision > CAST(?1 AS INTEGER)', 'revision >= CAST(?1 AS INTEGER)')], 'events'),
    ('A12', 'the range has no end', ANALYTICS,
     [('AND revision <= CAST(?2 AS INTEGER)', 'AND ?2 IS NOT NULL')], 'events'),
    ('A13', 'a transfer sends a category', ANALYTICS,
     [("  if (kind === 'transfer') return { name: 'record_saved', properties: { kind } }\n", '')], 'events'),
    ('A14', "the category's built-in key is never read", ANALYTICS,
     [("category_key: category?.builtin_key ?? 'custom'", "category_key: 'custom'")], 'events'),
    ('A15', "another account's consent is read", ANALYTICS,
     [("account !== undefined && account.account_id === c.claims.accountId ? analyticsConsent(c) : 'unasked'", 'analyticsConsent(c)')], 'events'),
    ('A16', 'a failed analytics read fails the call', ANALYTICS,
     [(CATCH, '  } finally {\n  }')], 'events'),
    ('A17', 'the events are read up to the revision before the call', ANALYTICS,
     [('committedEvents(c, route, before, currentRevision(c.sql))', 'committedEvents(c, route, before, before)')], 'events'),
    # The plan's "count edits as record_saved": both the route guard and the first-version filter let an edit
    # through (either alone is masked by the other at the front door, and is A7 or A8 in the change-log case).
    ('A18', "edits count as record_saved (the plan's mutant)", ANALYTICS,
     [("  if (route !== 'transactions.create') return []\n", "  if (!route.startsWith('transactions.')) return []\n"), ('AND version = 1 AND', 'AND')], 'events'),
    # callWithAnalytics (vault/user-vault.ts; workers: server-events).
    ('U1', 'a deliberate refusal carries a failure name', VAULT,
     [(FAILURE, 'failure = failureName(error)')], 'events'),
    ('U2', "the error's message is the failure (the plan's mutant)", VAULT,
     [(FAILURE, "if (!reply.ok && reply.code === 'INTERNAL_ERROR') failure = error instanceof Error ? error.message : String(error)")], 'events'),
    ('U3', 'nothing is read after the block', VAULT,
     [('      read = c\n', '')], 'events'),
    # The Worker (v1/handler.ts; workers: server-events).
    ('H1', "the off header is ignored (the plan's mutant)", HANDLER,
     [(EVENTS, EVENTS.replace(" && !analyticsOff(request)", ''))], 'events'),
    ('H2', 'only a lower-case off counts', HANDLER,
     [("request.headers.get('x-gogospend-analytics')?.toLowerCase() === 'off'", "request.headers.get('x-gogospend-analytics') === 'off'")], 'events'),
    ('H3', 'events are sent for anyone who did not say no', HANDLER,
     [(EVENTS, EVENTS.replace("analytics.consent === 'yes'", "analytics.consent !== 'no'"))], 'events'),
    ('H4', "without the key the analytics answer is 503 (the plan's mutant)", HANDLER,
     [('  return key ? analyticsIdFor(claims.accountId, key) : null\n',
       "  if (!key) throw new ProblemException(503, 'SERVICE_UNAVAILABLE')\n  return analyticsIdFor(claims.accountId, key)\n")], 'events'),
    ('H5', 'a stale cursor sends nothing', HANDLER,
     [("reply.status === 410 && reply.code === 'RESYNC_REQUIRED'", "reply.status === 411 && reply.code === 'RESYNC_REQUIRED'")], 'events'),
    ('H6', 'a failure on the outbox routes sends no sync_failed', HANDLER,
     [(OUTBOX, OUTBOX[:-1] + ' && false)')], 'events'),
    ('H7', 'a failure on any route sends sync_failed', HANDLER,
     [(OUTBOX, 'if (isInternalError(reply))')], 'events'),
    ('H8', 'sync.changes is not an outbox route', HANDLER,
     [("const OUTBOX_ROUTES: readonly VaultRouteId[] = ['transactions.create', 'sync.changes']", "const OUTBOX_ROUTES: readonly VaultRouteId[] = ['transactions.create']")], 'events'),
    ('H9', "every 5xx reply is counted as a failure (the plan's mutant, the reply)", HANDLER,
     [("!reply.ok && reply.status === 500 && reply.code === 'INTERNAL_ERROR'", '!reply.ok && reply.status >= 500')], 'events'),
    ('H10', 'a failure is counted only for a person who said yes', HANDLER,
     [(COUNT, COUNT.replace('if (failed)', "if (failed && analytics.consent === 'yes')"))], 'events'),
    ('H11', "a vault failure is never counted", HANDLER,
     [(COUNT, '')], 'events'),
    ('H12', "every 5xx in the Worker is counted (the plan's mutant, the Worker)", HANDLER,
     [(WORKER_COUNT, WORKER_COUNT.replace('response.status === 500', 'response.status >= 500'))], 'events'),
    ('H13', 'every error that is not a ProblemException is counted', HANDLER,
     [(WORKER_COUNT, WORKER_COUNT.replace('response.status === 500', '!(error instanceof ProblemException)'))], 'events'),
    ('H14', 'an unexpected Worker exception is never counted', HANDLER,
     [(WORKER_COUNT, '')], 'events'),
    ('H15', "the vault's analytics reach the phone's reply", HANDLER,
     [(ANSWER, ANSWER.replace(': reply', ": reply.ok && typeof reply.body === 'object' && reply.body !== null && !Array.isArray(reply.body) ? { ...reply, body: { ...reply.body, analytics } } : reply"))], 'events'),
    ('H16', "the analytics answer is the vault's alone, with no analytics id", HANDLER,
     [(ANSWER, 'const answer = reply')], 'events'),
    ('H17', "the vault's record_saved events are dropped", HANDLER,
     [(EVENTS, EVENTS.replace('[...analytics.events, ...replyEvents(vault, reply)]', '[...replyEvents(vault, reply)]'))], 'events'),
    # The route table (v1/routes.ts; edge Node: test/route-coverage.test.ts).
    ('R1', 'the analytics route is not an added route', ROUTES,
     [("export const VAULT_ADDED_ROUTES: readonly string[] = ['GET /v1/sync/live', 'GET /v1/me/analytics']", "export const VAULT_ADDED_ROUTES: readonly string[] = ['GET /v1/sync/live']")], 'node'),
    ('R2', 'the analytics route is public', ROUTES,
     [(ROUTE, ROUTE.replace("access: 'bound_session'", "access: 'public'"))], 'node'),
    # The followup (1D-T10's review, minor 1): live.ts is unchanged; the new live.test.ts case pins it.
    ('L1', "the work after a call can throw (the 1D-T10 review's G1)", LIVE,
     [(LIVE_CATCH, '  } finally {\n  }')], 'live'),
]


def command(kind: str, tree: str, log: str) -> tuple[list[str], str]:
    edge = os.path.join(tree, 'apps/edge')
    if kind == 'node':
        return (['npx', 'vitest', 'run', 'test/route-coverage.test.ts'], edge)
    locked = os.path.join(KIT, 'locked.sh')
    if kind == 'events':
        return ([locked, log, edge, 'npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', 'test/workers/server-events.test.ts'], tree)
    if kind == 'live':
        return ([locked, log, edge, 'npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', 'test/workers/live.test.ts'], tree)
    raise ValueError(kind)


def sha(target: str) -> str:
    with open(target, 'rb') as f:
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

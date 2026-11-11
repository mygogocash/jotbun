# Planner check: every "Goes to" target of the 1B-T13 mapping table (plan lines 1120-1149) exists by name, as a
# quoted case title, in the tree's tests. It reads files only. Usage: python3 -I check-targets.py <apps/edge dir>
import pathlib, sys
edge = pathlib.Path(sys.argv[1])
targets = {
    'test/workers/front-door.test.ts': [
        'every response is no-store with its own request id and helmet-style headers',
        'a client-sent request id is ignored',
        'an unknown route is 404 NOT_FOUND as an ApiProblem when nothing is forwarded',
        'no client header is 426 before any token check',
        'an outdated client is 426',
        'no bearer token is 401 UNAUTHENTICATED',
        'a token from an unpublished key is 401',
        'privacy preferences are saved and read back',
        'a token without a session id is 401 SESSION_REQUIRED',
        'signing out ends this session only',
        'a call naming another person is refused by the vault, which writes nothing',
    ],
    # 1A-T3's cases (the plan names the task, not a file): commands.test.ts and wallets.test.ts.
    'ANY:test/workers#1A-T3': [
        'writes wait for the current terms; accepting them opens writes',
        'the policy check runs in the guard, before the body is validated',
        'creates a wallet whose balance starts at its opening balance',
        'a resent command replays its acknowledgement; the same key with other content is 409',
        'an unsupported command schema is 422 before anything is written',
        'a stale If-Match is 409 VERSION_CONFLICT with the current wallet',
        'validation problems name the field',
        'malformed JSON is 400 VALIDATION_FAILED; a JSON primitive is refused as strict JSON',
        'a body over 2 MB is 413 COMMAND_TOO_LARGE',
        'a paused writes gate answers 503 WRITES_PAUSED with Retry-After before authentication; reads stay open',
    ],
    'test/vault-parity.db.test.ts': [
        'isolates people in the runtime too: one person cannot read another person’s wallet',
        'the vault Worker answers the money session exactly like the NestJS v1 API',
    ],
    'test/vault-parity-files.db.test.ts': ['the vault Worker stores, queues and serves files exactly like the NestJS v1 API'],
    'test/workers/ai.test.ts': [
        'AI is off until the user agrees to the current notice',
        'turning AI on needs the current notice version; tips can be set alone',
        "preferences are the person's own",
        'turns a sentence into a grounded draft, asking Claude through the shared settings',
        'never passes on an amount the person did not write',
        'falls back to the offline rules when Claude refuses, fails or has nothing',
        'without AI configured, answers from the rules and spends no uses',
        'stops at the daily limit until the next Bangkok day',
        'validates the sentence',
        'reads a slip image into drafts and keeps nothing',
        'refuses other files and broken base64 before any model call',
        'without consent: the plain facts, and no model call',
        'uses Claude’s words only when every number is one of the facts',
        'out of note uses, the facts still come',
        'answers through a read-only tool and returns the figures it used',
        'an answer with a number no tool read becomes the plain figures',
        'a bad tool input is reported back to Claude, not run',
    ],
    'ANY:test/workers': [
        'seeds built-ins, records spending, and reads it back through history, summary, budgets, status and sync',
        'builds a requested snapshot, whose chunks the edge then serves',
        'writes a requested export, streamed back with its length, and never serves a tampered file',
        'parses an upload the edge accepted, which the edge then reviews and confirms',
        'after any alarm, every scheduled time is later than now',
        'a snapshot runs on SnapshotWorkflow, and its cursor continues with /v1/sync/changes',
    ],
}
missing = 0
for where, names in targets.items():
    if where.startswith('ANY:'):
        files = sorted((edge / where[4:].split('#')[0]).rglob('*.test.ts'))
    else:
        files = [edge / where]
    texts = {f: f.read_text(encoding='utf-8') for f in files}
    for name in names:
        hits = [str(f.relative_to(edge)) for f, t in texts.items() if f"'{name}'" in t or f'"{name}"' in t or f'`{name}`' in t]
        print(('OK   ' if hits else 'MISS ') + name + ('  -> ' + ', '.join(hits) if hits else ''))
        missing += 0 if hits else 1
print(f'{missing} missing')
sys.exit(1 if missing else 0)

"""P4-T3's mutants: one per guard, each run against the focused test that should kill it.

Usage: python3 -I mutants.py --tree <tree> --out <log dir> [--only ID,ID] [--batch sql|code]

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

SQL = 'apps/edge/src/vault/migrations/0006_slips.sql'
INDEX = 'apps/edge/src/vault/migrations/index.ts'
SALT = 'apps/edge/src/vault/slips/salt.ts'
ACC = 'apps/edge/src/vault/slips/accounts.ts'
INBOX = 'apps/edge/src/vault/slips/inbox.ts'
REG = 'apps/edge/src/vault/commands/registry.ts'
HANDLER = 'apps/edge/src/v1/handler.ts'
ROUTES = 'apps/edge/src/v1/routes.ts'
WRANGLER = 'apps/edge/wrangler.jsonc'

SHAPES = 'each slip table takes a well-formed row'
RELEASE = "  if (route.release && !flag(env[route.release])) return problemResponse(404, 'NOT_FOUND', requestId)\n"
RELEASE_COMMENT = "  // An unreleased route (P4-T3, S13) is 404 before its body, gates and token, as if it did not exist.\n"
SALT_ROUTE = "{ method: 'GET', path: '/v1/slips/salt', access: 'bound_session', vault: 'slips.salt' }"
LIST_ROUTE = "{ method: 'GET', path: '/v1/slip-accounts', access: 'bound_session', vault: 'slipAccounts.list', release: 'SLIP_IMPORT_ENABLED' }"
PUT_ROUTE = "{ method: 'PUT', path: '/v1/slip-accounts/:id', access: 'current_policy', vault: 'slipAccounts.update', gates: ['imports'], status: 200, release: 'SLIP_IMPORT_ENABLED' }"
COUNT = """(SELECT count(*) FROM slip_drafts d
    WHERE (d.from_bank = a.bank AND d.from_last4 = a.account_last4) OR (d.to_bank = a.bank AND d.to_last4 = a.account_last4)) AS open_drafts"""
ORDER = 'ORDER BY open_drafts DESC, a.bank, a.account_last4'
IF_MATCH_THROW = """  if (!match) throw new ContractValidationError('VALIDATION_FAILED', 'If-Match must be the current version, e.g. "7".', 'if_match')\n"""
SIDES = """    from: { bank: row.from_bank, account_last4: row.from_last4, name: row.from_name },
    to: { bank: row.to_bank, account_last4: row.to_last4, name: row.to_name },
"""
DUPLICATE = "'SELECT id FROM transactions WHERE deleted_at IS NULL AND amount_minor = CAST(?1 AS INTEGER) AND occurred_on = ?2 ORDER BY created_at LIMIT 1'"


def drop(text: str, part: str):
    """A swap that removes `part` from `text` (both exact)."""
    assert part in text, part
    return (text, text.replace(part, '', 1))


# (id, what it breaks, file, [(old, new), ...], test kind, case filter or None)
MUTANTS = [
    # The migration's rules (0006_slips.sql; workers: the shapes case of slips-vault.test.ts).
    ('S1', 'the salt takes another id than 1', SQL, [('id INTEGER PRIMARY KEY CHECK (id = 1), salt', 'id INTEGER PRIMARY KEY, salt')], 'vault', SHAPES),
    ('S2', 'the salt takes any length', SQL, [('salt BLOB NOT NULL CHECK (length(salt) = 32)', 'salt BLOB NOT NULL')], 'vault', SHAPES),
    ('S3', 'slip_salt is not STRICT', SQL, [('created_at TEXT NOT NULL) STRICT;', 'created_at TEXT NOT NULL);')], 'vault', SHAPES),
    ('S4', 'an account takes version 0', SQL, [('version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),', 'version INTEGER NOT NULL DEFAULT 1,')], 'vault', SHAPES),
    ('S5', 'slip_accounts is not STRICT', SQL, [('UNIQUE (bank, account_last4)) STRICT;', 'UNIQUE (bank, account_last4));')], 'vault', SHAPES),
    ('S6', "an account's bank may start with a capital", SQL, [("bank TEXT NOT NULL CHECK (bank GLOB '[a-z]*' AND length(bank) BETWEEN 2 AND 16)", 'bank TEXT NOT NULL CHECK (length(bank) BETWEEN 2 AND 16)')], 'vault', SHAPES),
    ('S7', "an account's bank may be any length", SQL, [("bank TEXT NOT NULL CHECK (bank GLOB '[a-z]*' AND length(bank) BETWEEN 2 AND 16)", "bank TEXT NOT NULL CHECK (bank GLOB '[a-z]*')")], 'vault', SHAPES),
    ('S8', "an account's last four may be three", SQL, [("CHECK (length(account_last4) = 4 AND account_last4 NOT GLOB '*[^0-9]*')", "CHECK (account_last4 NOT GLOB '*[^0-9]*')")], 'vault', SHAPES),
    ('S9', "an account's last four may hold a letter", SQL, [("CHECK (length(account_last4) = 4 AND account_last4 NOT GLOB '*[^0-9]*')", 'CHECK (length(account_last4) = 4)')], 'vault', SHAPES),
    ('S10', 'an account may name an unknown wallet', SQL, [('wallet_id TEXT REFERENCES wallets (id),', 'wallet_id TEXT,')], 'vault', SHAPES),
    ('S11', 'two accounts may share a bank and last four', SQL, [(', UNIQUE (bank, account_last4)) STRICT;', ') STRICT;')], 'vault', SHAPES),
    # The plan's mutant: no UNIQUE (bank, account_last4), and the insert made blind.
    ('S12', "an account is made on every read (the plan's mutant)", SQL, [(', UNIQUE (bank, account_last4)) STRICT;', ') STRICT;')], 'vault', None),
    ('S13', 'two references may share a hash', SQL, [('ref_hash TEXT NOT NULL UNIQUE CHECK', 'ref_hash TEXT NOT NULL CHECK')], 'vault', SHAPES),
    ('S14', 'a hash may be 63 digits', SQL, [("CHECK (length(ref_hash) = 64 AND ref_hash NOT GLOB '*[^0-9a-f]*')", "CHECK (ref_hash NOT GLOB '*[^0-9a-f]*')")], 'vault', SHAPES),
    ('S15', 'a hash may hold capitals or other letters', SQL, [("CHECK (length(ref_hash) = 64 AND ref_hash NOT GLOB '*[^0-9a-f]*')", 'CHECK (length(ref_hash) = 64)')], 'vault', SHAPES),
    ('S16', 'a reference may be in any state', SQL, [("state TEXT NOT NULL CHECK (state IN ('draft', 'confirmed', 'dismissed', 'expired', 'recorded')),", 'state TEXT NOT NULL,')], 'vault', SHAPES),
    ('S17', "a reference's record need not match its state", SQL, [(", CHECK ((state IN ('confirmed', 'recorded')) = (transaction_id IS NOT NULL))) STRICT;", ') STRICT;')], 'vault', SHAPES),
    ('S18', 'slip_refs is not STRICT', SQL, [('(transaction_id IS NOT NULL))) STRICT;', '(transaction_id IS NOT NULL)));')], 'vault', SHAPES),
    ('S19', 'a slip may have two drafts', SQL, [('ref_id TEXT NOT NULL UNIQUE REFERENCES slip_refs (id),', 'ref_id TEXT NOT NULL REFERENCES slip_refs (id),')], 'vault', SHAPES),
    ('S20', 'a draft may name an unknown reference', SQL, [('ref_id TEXT NOT NULL UNIQUE REFERENCES slip_refs (id),', 'ref_id TEXT NOT NULL UNIQUE,')], 'vault', SHAPES),
    ('S21', 'a draft takes any amount', SQL, [('amount_minor INTEGER CHECK (amount_minor IS NULL OR amount_minor BETWEEN 1 AND 99999999999),', 'amount_minor INTEGER,')], 'vault', SHAPES),
    ('S22', 'slip_drafts is not STRICT', SQL, [('expires_at TEXT NOT NULL) STRICT;', 'expires_at TEXT NOT NULL);')], 'vault', SHAPES),
    ('S23', 'a draft takes any date text', SQL, [('occurred_on TEXT CHECK (occurred_on IS NULL OR date(occurred_on) IS occurred_on),', 'occurred_on TEXT,')], 'vault', SHAPES),
    ('S24', 'a draft takes any time text', SQL, [("occurred_time TEXT CHECK (occurred_time IS NULL OR (length(occurred_time) = 5 AND occurred_time GLOB '[0-2][0-9]:[0-5][0-9]')),", 'occurred_time TEXT,')], 'vault', SHAPES),
    ('S25', 'a draft takes any direction', SQL, [("direction TEXT NOT NULL CHECK (direction IN ('out', 'in')),", 'direction TEXT NOT NULL,')], 'vault', SHAPES),
    ('S26', "a draft takes any sender's bank", SQL, [("from_bank TEXT CHECK (from_bank IS NULL OR (from_bank GLOB '[a-z]*' AND length(from_bank) BETWEEN 2 AND 16)),", 'from_bank TEXT,')], 'vault', SHAPES),
    ('S27', "a draft takes any sender's last four", SQL, [("from_last4 TEXT CHECK (from_last4 IS NULL OR (length(from_last4) = 4 AND from_last4 NOT GLOB '*[^0-9]*')),", 'from_last4 TEXT,')], 'vault', SHAPES),
    ('S28', "a draft takes any sender's name", SQL, [('from_name TEXT CHECK (from_name IS NULL OR length(from_name) BETWEEN 1 AND 120),', 'from_name TEXT,')], 'vault', SHAPES),
    ('S29', "a draft takes any receiver's bank", SQL, [("to_bank TEXT CHECK (to_bank IS NULL OR (to_bank GLOB '[a-z]*' AND length(to_bank) BETWEEN 2 AND 16)),", 'to_bank TEXT,')], 'vault', SHAPES),
    ('S30', "a draft takes any receiver's last four", SQL, [("to_last4 TEXT CHECK (to_last4 IS NULL OR (length(to_last4) = 4 AND to_last4 NOT GLOB '*[^0-9]*')),", 'to_last4 TEXT,')], 'vault', SHAPES),
    ('S31', "a draft takes any receiver's name", SQL, [('to_name TEXT CHECK (to_name IS NULL OR length(to_name) BETWEEN 1 AND 120),', 'to_name TEXT,')], 'vault', SHAPES),
    ('S32', 'a draft may name an unknown category', SQL, [('category_id TEXT REFERENCES categories (id),', 'category_id TEXT,')], 'vault', SHAPES),
    ('S33', 'category_guessed takes any number', SQL, [('category_guessed INTEGER NOT NULL DEFAULT 0 CHECK (category_guessed IN (0, 1)),', 'category_guessed INTEGER NOT NULL DEFAULT 0,')], 'vault', SHAPES),
    ('S34', 'flags take any text', SQL, [("flags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(flags) AND json_type(flags) = 'array'),", "flags TEXT NOT NULL DEFAULT '[]',")], 'vault', SHAPES),
    ('S35', 'flags take any JSON', SQL, [("CHECK (json_valid(flags) AND json_type(flags) = 'array')", 'CHECK (json_valid(flags))')], 'vault', SHAPES),
    ('S36', 'a draft takes any album', SQL, [('album TEXT CHECK (album IS NULL OR length(album) BETWEEN 1 AND 60),', 'album TEXT,')], 'vault', SHAPES),
    ('S37', 'a draft takes any origin', SQL, [("origin TEXT NOT NULL CHECK (origin IN ('album', 'share', 'photo')),", 'origin TEXT NOT NULL,')], 'vault', SHAPES),
    ('S38', 'a draft takes any model', SQL, [("model TEXT NOT NULL CHECK (model IN ('claude-haiku-5-5', 'claude-opus-5-5')),", 'model TEXT NOT NULL,')], 'vault', SHAPES),
    ('S39', 'escalated takes any number', SQL, [('escalated INTEGER NOT NULL CHECK (escalated IN (0, 1)),', 'escalated INTEGER NOT NULL,')], 'vault', SHAPES),
    ('S40', 'announced takes any number', SQL, [('announced INTEGER NOT NULL DEFAULT 0 CHECK (announced IN (0, 1)),', 'announced INTEGER NOT NULL DEFAULT 0,')], 'vault', SHAPES),
    ('S41', 'a lease may expire before 0', SQL, [('expires_at INTEGER NOT NULL CHECK (expires_at >= 0),', 'expires_at INTEGER NOT NULL,')], 'vault', SHAPES),
    ('S42', 'a lease takes any purpose', SQL, [("purpose TEXT NOT NULL CHECK (purpose IN ('live', 'backfill')),", 'purpose TEXT NOT NULL,')], 'vault', SHAPES),
    ('S43', "a lease's day takes any text", SQL, [('day TEXT NOT NULL CHECK (date(day) IS day), reserved', 'day TEXT NOT NULL, reserved')], 'vault', SHAPES),
    ('S44', 'a lease may reserve less than 0', SQL, [('reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0)) STRICT;', 'reserved INTEGER NOT NULL DEFAULT 0) STRICT;')], 'vault', SHAPES),
    ('S45', 'slip_leases is not STRICT', SQL, [('CHECK (reserved >= 0)) STRICT;', 'CHECK (reserved >= 0));')], 'vault', SHAPES),
    ('S46', "a use row's day takes any text", SQL, [('day TEXT PRIMARY KEY CHECK (date(day) IS day),', 'day TEXT PRIMARY KEY,')], 'vault', SHAPES),
    ('S47', 'a day takes any count of uses', SQL, [('uses INTEGER NOT NULL CHECK (uses BETWEEN 0 AND 500)) STRICT;', 'uses INTEGER NOT NULL) STRICT;')], 'vault', SHAPES),
    ('S48', 'slip_backfill_uses is not STRICT', SQL, [('CHECK (uses BETWEEN 0 AND 500)) STRICT;', 'CHECK (uses BETWEEN 0 AND 500));')], 'vault', SHAPES),
    # The migration's column and indexes (workers: vault-schema.test.ts), and the journal.
    ('S49', 'no slip_ref_id column', SQL, [('ALTER TABLE transactions ADD COLUMN slip_ref_id TEXT REFERENCES slip_refs (id);\n--> statement-breakpoint\n', '')], 'schema', None),
    ('S50', 'slip_ref_id is no key to slip_refs', SQL, [('ADD COLUMN slip_ref_id TEXT REFERENCES slip_refs (id);', 'ADD COLUMN slip_ref_id TEXT;')], 'schema', None),
    ('S51', 'no merchant index', SQL, [('--> statement-breakpoint\nCREATE INDEX transactions_merchant_idx ON transactions (lower(merchant)) WHERE deleted_at IS NULL AND merchant IS NOT NULL;\n', '')], 'schema', None),
    ('S52', "no drafts' order index", SQL, [('CREATE INDEX slip_drafts_order_idx ON slip_drafts (occurred_on, occurred_time, id);\n--> statement-breakpoint\n', '')], 'schema', None),
    ('S53', 'the journal leaves 0006 out', INDEX, [("      { idx: 6, when: 1761868800000, tag: '0006_slips', breakpoints: true },\n", ''), (', m0006: slips }', ' }')], 'schema', None),
    # The salt (vault/slips/salt.ts; workers).
    ('A1', "a new salt on every read (the plan's mutant)", SALT, [('  if (row) return asDto(new Uint8Array(row.salt))\n', ''), ('INSERT INTO slip_salt', 'INSERT OR REPLACE INTO slip_salt')], 'vault', None),
    ('A2', 'the salt is not random', SALT, [('crypto.getRandomValues(new Uint8Array(SALT_BYTES))', 'new Uint8Array(SALT_BYTES).fill(7)')], 'vault', None),
    ('A3', 'the first answer is not the stored salt', SALT, [('  return asDto(salt)\n', '  return asDto(crypto.getRandomValues(new Uint8Array(SALT_BYTES)))\n')], 'vault', None),
    # Slip accounts (vault/slips/accounts.ts; workers).
    ('B1', "one side's account is found by its bank alone", ACC, [("'SELECT id, wallet_id FROM slip_accounts WHERE bank = ? AND account_last4 = ?', bank, last4)", "'SELECT id, wallet_id FROM slip_accounts WHERE bank = ?', bank)")], 'vault', None),
    ('B2', "every draft counts for every account (the plan's mutant)", ACC, [(COUNT, '(SELECT count(*) FROM slip_drafts d) AS open_drafts')], 'vault', None),
    ('B3', "only the sender's side counts", ACC, [drop(COUNT, ' OR (d.to_bank = a.bank AND d.to_last4 = a.account_last4)')], 'vault', None),
    ('B4', "only the receiver's side counts", ACC, [drop(COUNT, '(d.from_bank = a.bank AND d.from_last4 = a.account_last4) OR ')], 'vault', None),
    ('B5', "a sender's bank alone matches", ACC, [('d.from_bank = a.bank AND d.from_last4 = a.account_last4', 'd.from_bank = a.bank')], 'vault', None),
    ('B6', "a receiver's last four alone match", ACC, [('d.to_bank = a.bank AND d.to_last4 = a.account_last4', 'd.to_last4 = a.account_last4')], 'vault', None),
    ('B7', 'the fewest open drafts first', ACC, [(ORDER, 'ORDER BY open_drafts, a.bank, a.account_last4')], 'vault', None),
    ('B8', 'last four digits before the bank', ACC, [(ORDER, 'ORDER BY open_drafts DESC, a.account_last4, a.bank')], 'vault', None),
    ('B9', 'no order by last four digits', ACC, [(ORDER, 'ORDER BY open_drafts DESC, a.bank')], 'vault', None),
    ('B10', "a stale version maps the account (the plan's mutant)", ACC, [('expectVersion(accountById(c, id), expected, (account) => account)', 'expectVersion(accountById(c, id), accountById(c, id)?.version, (account) => account)')], 'vault', None),
    ('B11', 'an archived wallet maps', ACC, [("    if (wallet.archived === 1) throw stateProblem('errors.wallet_archived', 'wallet_id')\n", '')], 'vault', None),
    ('B12', 'an unknown wallet reaches the write', ACC, [("    if (!wallet) throw stateProblem('errors.wallet_not_found', 'wallet_id')\n", '')], 'vault', None),
    ('B13', 'the version stays', ACC, [('SET wallet_id = ?, version = version + 1, updated_at = ?', 'SET wallet_id = ?, version = version, updated_at = ?')], 'vault', None),
    ('B14', 'a missing If-Match is not refused', ACC, [(IF_MATCH_THROW, '  if (!match) return Number.NaN\n')], 'vault', None),
    # The inbox, the draft mapper and the duplicate check (vault/slips/inbox.ts; workers).
    ('C1', 'the inbox version stays at the head', INBOX, [('const version = (head?.version ?? 0) + 1', 'const version = head?.version ?? 1')], 'vault', None),
    ('C2', 'the open count counts slip references', INBOX, [("'SELECT count(*) AS n FROM slip_drafts'", "'SELECT count(*) AS n FROM slip_refs'")], 'vault', None),
    ('C3', 'the inbox change is not active', INBOX, [("version, state: 'active', snapshot", "version, state: 'deleted', snapshot")], 'vault', None),
    ('C4', "the snapshot carries the head's version", INBOX, [('snapshot: { id: SLIP_INBOX_ID, version, open', 'snapshot: { id: SLIP_INBOX_ID, version: version - 1, open')], 'vault', None),
    ('C5', 'category_guessed is always false', INBOX, [('    category_guessed: row.category_guessed === 1,\n', '    category_guessed: false,\n')], 'vault', None),
    ('C6', 'escalated is always false', INBOX, [('    escalated: row.escalated === 1,\n', '    escalated: false,\n')], 'vault', None),
    ('C7', 'the flags are dropped', INBOX, [('    flags: JSON.parse(row.flags) as AiDraftFlag[],\n', '    flags: [],\n')], 'vault', None),
    ('C8', 'the two sides are swapped', INBOX, [(SIDES, SIDES.replace('from: {', 'TMP: {').replace('to: {', 'from: {').replace('TMP: {', 'to: {'))], 'vault', None),
    ('C9', 'the duplicate is dropped', INBOX, [('    duplicate_of: duplicateOf,\n', '    duplicate_of: null,\n')], 'vault', None),
    ('C10', 'the amount leaves SQLite as a number', INBOX, [('CAST(amount_minor AS TEXT) AS amount_minor', 'amount_minor')], 'vault', None),
    ('C11', 'a deleted record is a duplicate', INBOX, [(DUPLICATE, DUPLICATE.replace('WHERE deleted_at IS NULL AND ', 'WHERE '))], 'vault', None),
    ('C12', 'the newest record is the duplicate', INBOX, [(DUPLICATE, DUPLICATE.replace('ORDER BY created_at LIMIT 1', 'ORDER BY created_at DESC LIMIT 1'))], 'vault', None),
    ('C13', 'any date matches', INBOX, [(DUPLICATE, DUPLICATE.replace('AND occurred_on = ?2 ', 'AND ?2 IS NOT NULL '))], 'vault', None),
    ('C14', 'any amount matches', INBOX, [(DUPLICATE, DUPLICATE.replace('amount_minor = CAST(?1 AS INTEGER) AND ', '?1 IS NOT NULL AND '))], 'vault', None),
    # The registry (vault/commands/registry.ts; workers).
    ('R1', 'no slip_inbox entity', REG, [('  registry.defineEntity({ entity: SLIP_INBOX_ENTITY, validate: isSlipInboxSnapshot })\n', '')], 'vault', None),
    # The release and the routes (v1/handler.ts, v1/routes.ts; workers).
    ('H1', "the salt waits for the release (the plan's mutant)", ROUTES, [(SALT_ROUTE, SALT_ROUTE.replace(" vault: 'slips.salt' }", " vault: 'slips.salt', release: 'SLIP_IMPORT_ENABLED' }"))], 'vault', None),
    ('H2', 'the accounts list is out before the release', ROUTES, [(LIST_ROUTE, LIST_ROUTE.replace(", release: 'SLIP_IMPORT_ENABLED'", ''))], 'vault', None),
    ('H3', 'mapping is out before the release', ROUTES, [(PUT_ROUTE, PUT_ROUTE.replace(", release: 'SLIP_IMPORT_ENABLED'", ''))], 'vault', None),
    ('H4', 'the release ignores the var', HANDLER, [(RELEASE, RELEASE.replace(' && !flag(env[route.release])', ''))], 'vault', None),
    ('H5', 'any value releases', HANDLER, [(RELEASE, RELEASE.replace('!flag(env[route.release])', '!env[route.release]'))], 'vault', None),
    ('H6', 'the release after the body', HANDLER, [(RELEASE_COMMENT + RELEASE, ''), ('    const { body, stream } = await readRouteBody(request, route)\n', '    const { body, stream } = await readRouteBody(request, route)\n' + RELEASE.replace('  if', '    if'))], 'vault', None),
    ('H7', 'the release after the gates', HANDLER, [(RELEASE_COMMENT + RELEASE, ''), ('    config.gates.assertOpen(...(route.gates ?? []))\n', '    config.gates.assertOpen(...(route.gates ?? []))\n' + RELEASE.replace('  if', '    if'))], 'vault', None),
    ('H8', 'the release after the token', HANDLER, [(RELEASE_COMMENT + RELEASE, ''), ('    const claims = await authenticate(request, env, deps, config, route.access)\n    const stub', '    const claims = await authenticate(request, env, deps, config, route.access)\n' + RELEASE.replace('  if', '    if') + '    const stub')], 'vault', None),
    ('H9', 'mapping without the imports gate', ROUTES, [(PUT_ROUTE, PUT_ROUTE.replace("gates: ['imports'], ", ''))], 'vault', None),
    ('H10', 'mapping under the session alone', ROUTES, [(PUT_ROUTE, PUT_ROUTE.replace("access: 'current_policy'", "access: 'bound_session'"))], 'vault', None),
    # The route table and wrangler.jsonc (edge Node: test/route-coverage.test.ts).
    ('N1', 'a slip route is not an added route', ROUTES, [(", 'PUT /v1/slip-accounts/:id']", ']')], 'node', None),
    ('N2', 'wrangler.jsonc releases slip import', WRANGLER, [('"SLIP_IMPORT_ENABLED": "false",', '"SLIP_IMPORT_ENABLED": "true",')], 'node', None),
    ('N3', 'wrangler.jsonc has no SLIP_IMPORT_ENABLED', WRANGLER, [('    "SLIP_IMPORT_ENABLED": "false",\n', '')], 'node', None),
]

# Edits in a second file: S12 also makes the account insert blind (the plan's mutant is both edits).
EXTRA = {'S12': (ACC, [(' ON CONFLICT (bank, account_last4) DO NOTHING', '')])}

BATCHES = {
    'sql': [m[0] for m in MUTANTS if m[0].startswith('S')],
    'code': [m[0] for m in MUTANTS if not m[0].startswith('S')],
}


def command(kind: str, case: str | None, tree: str, log: str) -> tuple[list[str], str]:
    edge = os.path.join(tree, 'apps/edge')
    if kind == 'node':
        return (['npx', 'vitest', 'run', '--reporter=verbose', 'test/route-coverage.test.ts'], edge)
    locked = os.path.join(KIT, 'locked.sh')
    files = {'vault': 'test/workers/slips-vault.test.ts', 'schema': 'test/workers/vault-schema.test.ts'}
    argv = [locked, log, edge, 'npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', '--reporter=verbose', files[kind]]
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
        edits = [(rel, swaps)] + ([EXTRA[mid]] if mid in EXTRA else [])
        originals = {}
        for target_rel, target_swaps in edits:
            target = os.path.join(tree, target_rel)
            with open(target, encoding='utf-8') as f:
                original = f.read()
            originals[target] = (original, sha(target))
            text = original
            for old, new in target_swaps:
                count = text.count(old)
                if count != 1:
                    print(f'{mid} BAD ANCHOR ({count} matches) in {target_rel}: {old[:60]!r}', flush=True)
                    return 2
                text = text.replace(old, new)
            with open(target, 'w', encoding='utf-8') as f:
                f.write(text)
        log = os.path.join(out, f'{mid}.log')
        try:
            argv, cwd = command(kind, case, tree, log)
            if kind == 'node':
                with open(log, 'w', encoding='utf-8') as f:
                    rc = subprocess.run(argv, cwd=cwd, stdout=f, stderr=subprocess.STDOUT).returncode
            else:
                rc = subprocess.run(argv, cwd=cwd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode
        finally:
            for target, (original, _digest) in originals.items():
                with open(target, 'w', encoding='utf-8') as f:
                    f.write(original)
        for target, (_original, digest) in originals.items():
            if sha(target) != digest:
                unrestored.append(mid)
        with open(log, encoding='utf-8', errors='replace') as f:
            body = f.read()
        failed, assertions, others = verdict(body)
        clean = failed > 0 and assertions == failed and others == 0
        where = kind if case is None else f'{kind}, -t shapes'
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

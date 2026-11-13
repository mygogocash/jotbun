"""P4-T7's mutants: one per guard, each run against the focused case that should kill it.

Usage: python3 -I mutants.py --tree <tree> --out <log dir> [--only ID,ID] [--batch confirm|list|prune|pins] [--check] [--whole]

Each mutant replaces exact text (each `old` must occur exactly once in its file), runs its
test file filtered to the case that should kill it (`-t`), and restores the file byte for
byte (checked by SHA-256). A mutant is killed when its run exits non-zero; the line says
"assertion" only when every failing case failed on an AssertionError (each block of vitest's
"Failed Tests" section names one or more failing cases and then one error). Workers runs take
the heavy lock through locked.sh, which sits next to this script. `--check` only checks that
every anchor occurs exactly once, and runs nothing. `--whole` runs each mutant's whole file, with
no case filter (the planner's proof that the follow-up pins are new: the O mutants survive
P4-T3's own slips-vault.test.ts). The last line reads:
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

TX = 'apps/edge/src/vault/domain/transactions.ts'
DRAFTS = 'apps/edge/src/vault/slips/drafts.ts'
REFS = 'apps/edge/src/vault/slips/refs.ts'
PRUNE = 'apps/edge/src/vault/slips/prune.ts'
JOBS = 'apps/edge/src/vault/files/jobs.ts'
UV = 'apps/edge/src/vault/user-vault.ts'
REG = 'apps/edge/src/vault/commands/registry.ts'
ROUTES = 'apps/edge/src/v1/routes.ts'
ANALYTICS = 'apps/edge/src/vault/analytics.ts'
ACC = 'apps/edge/src/vault/slips/accounts.ts'
INBOX = 'apps/edge/src/vault/slips/inbox.ts'
HANDLER = 'apps/edge/src/v1/handler.ts'
SALT = 'apps/edge/src/vault/slips/salt.ts'

# The case each mutant runs (a plain substring of its name, given to vitest's -t).
LIST = 'drafts come newest first'
DUP = 'possible duplicate'
FIFTY = 'confirming 50 drafts'
SHARE = 'confirms as share_extension'
BAD = 'repeated record id'
PHONE = 'confirmed on another phone'
CHECKED = 'refused record is named'
KEYS = 'carrying source or slip_ref_id'
S18 = 'send no record_saved'
DISMISS = 'dismissing keeps the slip known'
REFONCE = 'recorded once against its record'
REFLEAVES = 'leaves the record as it was'
EXPIRY = 'leaves the inbox 30 days'
R37 = 'later or null'
MANY = 'more drafts than SQLite'
RELEASE = 'are 404 until SLIP_IMPORT_ENABLED'
GATES = 'confirm also under writes'
SOURCE_DIGEST = 'digested as the release before gave it'
V_RELEASE = 'the other slip routes are 404'
V_SALT = 'never logged or sent to analytics'
V_ONE = 'mapping one account changes only'
V_FAULTS = 'two faults at once'
V_ONCE = 'same account counts once'
V_HEAD = 'follows its own head'

CONFIRM_SOURCE = "createTransactionRow(c, transaction, { source: slipSourceOf(draft.origin), slipRefId: draft.ref_id })"
CONFIRM_GROUP = "    return { entityId: SLIP_INBOX_ID, version: inbox.version, changes: [...records, inbox] }\n"
CONFIRM_DELETE = "    c.sql.exec(`DELETE FROM slip_drafts WHERE id ${IN_IDS}`, ids).toArray()\n"
CONFIRM_INBOX = "    const inbox = inboxChange(c)\n    return { entityId: SLIP_INBOX_ID, version: inbox.version, changes: [...records, inbox] }\n"
DISMISS_DELETE = "    c.sql.exec('DELETE FROM slip_drafts WHERE id = ?', draftId).toArray()\n"
DISMISS_REF = """    c.sql.exec("UPDATE slip_refs SET state = 'dismissed', updated_at = ? WHERE id = ?", c.now.toISOString(), draft.ref_id).toArray()\n"""
DISMISS_INBOX = "    const inbox = inboxChange(c)\n    return { entityId: SLIP_INBOX_ID, version: inbox.version, changes: [inbox] }\n"
DECODE_CHECK = "  if (value?.v !== 1 || value.k !== 'slip_drafts' || !dateOk || !timeOk || !isUuid(value.i)) throw invalid()\n"
ASDRAFT_PROBLEM = """    if (error instanceof ProblemException && error.problem.fields) {
      const fields = Object.fromEntries(Object.entries(error.problem.fields).map(([field, key]) => [`${at}.${field}`, key]))
      throw new ProblemException(error.getStatus(), error.code, { ...error.problem, fields })
    }
"""
PRUNE_NOW = "    const now = c.now.toISOString()\n    const expired"
REF_UPDATE = "if (recorded) c.sql.exec('UPDATE transactions SET slip_ref_id = ? WHERE id = ? AND slip_ref_id IS NULL', recorded.id, transactionId).toArray()"
DUE_TIMES = "  const times = [expires === null ? null : Date.parse(expires), oldest === null ? null : Date.parse(`${shiftDate(oldest, BACKFILL_KEEP_DAYS + 1)}T00:00:00.000+07:00`)].filter("
LIST_ROUTE = "{ method: 'GET', path: '/v1/drafts', access: 'bound_session', vault: 'drafts.list', release: 'SLIP_IMPORT_ENABLED' }"
CONFIRM_ROUTE = "{ method: 'POST', path: '/v1/drafts/confirm', access: 'current_policy', vault: 'drafts.confirm', gates: ['imports', 'writes'], status: 200, release: 'SLIP_IMPORT_ENABLED' }"
DISMISS_ROUTE = "{ method: 'POST', path: '/v1/drafts/:id/dismiss', access: 'current_policy', vault: 'drafts.dismiss', gates: ['imports'], status: 200, release: 'SLIP_IMPORT_ENABLED' }"
REFS_ROUTE = "{ method: 'POST', path: '/v1/slips/refs', access: 'current_policy', vault: 'slips.refs', gates: ['imports'], status: 204 }"
# P4-T3's code, for the follow-up pins (the reviewers' own mutants O1 to O9, and the salt's).
COUNT = """(SELECT count(*) FROM slip_drafts d
    WHERE (d.from_bank = a.bank AND d.from_last4 = a.account_last4) OR (d.to_bank = a.bank AND d.to_last4 = a.account_last4)) AS open_drafts"""
SUMMED = """(SELECT count(*) FROM slip_drafts d WHERE d.from_bank = a.bank AND d.from_last4 = a.account_last4)
    + (SELECT count(*) FROM slip_drafts d WHERE d.to_bank = a.bank AND d.to_last4 = a.account_last4) AS open_drafts"""
HEADS = """  const expected = expectedVersionOf(call)
  const id = routeId(call.params.id ?? '')
  const { wallet_id: walletId } = parseSlipAccountUpdate(call.body)
"""
VERSION_LINE = '  expectVersion(accountById(c, id), expected, (account) => account)\n'
WALLET_BLOCK = """  if (walletId !== null) {
    const [wallet] = c.sql.exec<{ archived: number }>('SELECT archived FROM wallets WHERE id = ?', walletId).toArray()
    if (!wallet) throw stateProblem('errors.wallet_not_found', 'wallet_id')
    if (wallet.archived === 1) throw stateProblem('errors.wallet_archived', 'wallet_id')
  }
"""
RELEASE_LINE = "  if (route.release && !flag(env[route.release])) return problemResponse(404, 'NOT_FOUND', requestId)\n"
EVENTS_GUARD = "  if (route !== 'transactions.create') return []\n"


def drop(text: str, part: str):
    """A swap that removes `part` from `text` (both exact)."""
    assert part in text, part
    return (text, text.replace(part, '', 1))


# (id, what it breaks, file, [(old, new), ...], test kind, case filter)
MUTANTS = [
    # createTransactionRow and createTransaction (vault/domain/transactions.ts).
    ('T1', "a source key in the record is taken (the plan's mutant)", TX, [('const { draft } = parseCreate(c, input, false)', 'const { draft } = parseCreate(c, input, true)')], 'drafts', KEYS),
    ('T2', 'the record does not keep its slip reference', TX, [('      extras.slipRefId,\n', '      null,\n')], 'drafts', FIFTY),
    ('T3', "the slip path skips the create's reference checks", TX, [('  checkReferences(c, draft, new Set(refsOf(draft.type)))\n', '')], 'drafts', CHECKED),
    ('T4', 'a create without a source digests a null source', TX, [('payload: source === null ? draft : { ...draft, source }', 'payload: { ...draft, source }')], 'source', SOURCE_DIGEST),
    # Confirm (vault/slips/drafts.ts).
    ('D1', "one change group per draft (the plan's mutant)", DRAFTS, [(CONFIRM_GROUP, "    for (const record of records) appendChanges(c, crypto.randomUUID(), [record])\n    return { entityId: SLIP_INBOX_ID, version: inbox.version, changes: [inbox] }\n"), ("import { commandInput, runCommand } from '../commands/executor'\n", "import { appendChanges } from '../commands/change-log'\nimport { commandInput, runCommand } from '../commands/executor'\n")], 'drafts', FIFTY),
    ('D2', "a draft that is gone is not refused (the plan's mutant)", DRAFTS, [("    if (open.size !== drafts.length) throw new ProblemException(409, 'VERSION_CONFLICT')\n", '')], 'drafts', PHONE),
    ('D3', "the records get no source (the plan's mutant)", DRAFTS, [(CONFIRM_SOURCE, CONFIRM_SOURCE.replace('source: slipSourceOf(draft.origin)', 'source: null'))], 'drafts', FIFTY),
    ('D4', "a shared draft confirms as slip_import (the plan's mutant)", DRAFTS, [("return origin === 'share' ? 'share_extension' : 'slip_import'", "return origin === 'album' ? 'slip_import' : 'slip_import'")], 'drafts', SHARE),
    ('D5', 'a refusal is not named by its draft', DRAFTS, [('const record = asDraft(index, () => ' + CONFIRM_SOURCE + ')', 'const record = ' + CONFIRM_SOURCE)], 'drafts', CHECKED),
    ('D6', "a reference refusal keeps its own field's name", DRAFTS, [drop(ASDRAFT_PROBLEM, ASDRAFT_PROBLEM)], 'drafts', CHECKED),
    ('D7', 'the confirmed references stay drafts', DRAFTS, [drop("""      c.sql.exec("UPDATE slip_refs SET state = 'confirmed', transaction_id = ?, updated_at = ? WHERE id = ?", record.id, now, draft.ref_id).toArray()\n""", """      c.sql.exec("UPDATE slip_refs SET state = 'confirmed', transaction_id = ?, updated_at = ? WHERE id = ?", record.id, now, draft.ref_id).toArray()\n""")], 'drafts', FIFTY),
    ('D8', 'the confirmed drafts stay open', DRAFTS, [drop(CONFIRM_DELETE, CONFIRM_DELETE)], 'drafts', FIFTY),
    ('D9', 'the inbox counts before the confirmed drafts go', DRAFTS, [(CONFIRM_DELETE + CONFIRM_INBOX, '    const inbox = inboxChange(c)\n' + CONFIRM_DELETE + '    return { entityId: SLIP_INBOX_ID, version: inbox.version, changes: [...records, inbox] }\n')], 'drafts', FIFTY),
    ('D10', 'the inbox change comes first in the group', DRAFTS, [('changes: [...records, inbox] }', 'changes: [inbox, ...records] }')], 'drafts', FIFTY),
    # The list (vault/slips/drafts.ts).
    ('D11', 'the oldest slip first', DRAFTS, [('''const ORDER_BY = "coalesce(occurred_on, '') DESC, coalesce(occurred_time, '') DESC, id DESC"''', '''const ORDER_BY = "coalesce(occurred_on, '') ASC, coalesce(occurred_time, '') ASC, id ASC"''')], 'drafts', LIST),
    ('D12', 'a slip with no date or time first', DRAFTS, [('''const ORDER_KEY = "coalesce(occurred_on, ''), coalesce(occurred_time, ''), id"''', '''const ORDER_KEY = "coalesce(occurred_on, '9'), coalesce(occurred_time, '9'), id"'''), ('''const ORDER_BY = "coalesce(occurred_on, '') DESC, coalesce(occurred_time, '') DESC, id DESC"''', '''const ORDER_BY = "coalesce(occurred_on, '9') DESC, coalesce(occurred_time, '9') DESC, id DESC"''')], 'drafts', LIST),
    ('D13', "a page repeats the last page's last draft", DRAFTS, [("`WHERE (${ORDER_KEY}) < (coalesce(?, ''), coalesce(?, ''), ?)`", "`WHERE (${ORDER_KEY}) <= (coalesce(?, ''), coalesce(?, ''), ?)`")], 'drafts', LIST),
    ('D14', 'the cursor is checked but its place ignored', DRAFTS, [('const after = cursor === undefined ? null : decodeDraftCursor(cursor)', 'const after = cursor === undefined ? null : (decodeDraftCursor(cursor), null)')], 'drafts', LIST),
    ('D15', 'limit is not checked', DRAFTS, [("const limit = parseLimit(single(input.limit, 'limit'))", 'const limit = Number(input.limit ?? 50)')], 'drafts', LIST),
    ('D16', 'total counts the page', DRAFTS, [('    total: openDraftCount(c),\n', '    total: page.length,\n')], 'drafts', LIST),
    ('D17', 'no duplicate is named', DRAFTS, [('slipDraftDto(row, slipDuplicateOf(c, row.amount_minor, row.occurred_on))', 'slipDraftDto(row, null)')], 'drafts', DUP),
    ('D18', 'a page that ends the list still has a cursor', DRAFTS, [('next_cursor: rows.length > limit && last', 'next_cursor: rows.length >= limit && last')], 'drafts', LIST),
    ('D19', 'a cursor of any length', DRAFTS, [('    if (!CURSOR.test(cursor)) throw new Error(\'shape\')\n', '')], 'drafts', LIST),
    ('D20', "another list's cursor", DRAFTS, [(DECODE_CHECK, DECODE_CHECK.replace(" || value.k !== 'slip_drafts'", ''))], 'drafts', LIST),
    ('D21', "another version's cursor", DRAFTS, [(DECODE_CHECK, DECODE_CHECK.replace('value?.v !== 1 || ', 'value === null || '))], 'drafts', LIST),
    ('D22', "a cursor's date is not checked", DRAFTS, [(DECODE_CHECK, DECODE_CHECK.replace(' || !dateOk', ''))], 'drafts', LIST),
    ('D23', "a cursor's time is not checked", DRAFTS, [(DECODE_CHECK, DECODE_CHECK.replace(' || !timeOk', ''))], 'drafts', LIST),
    ('D24', "a cursor's id is not checked", DRAFTS, [(DECODE_CHECK, DECODE_CHECK.replace(' || !isUuid(value.i)', ''))], 'drafts', LIST),
    ('D25', 'an unknown query key is taken', DRAFTS, [("const input = assertKnownFields({ ...(query as Record<string, unknown>) }, ['cursor', 'limit'])", 'const input = { ...(query as Record<string, unknown>) }')], 'drafts', LIST),
    # Dismiss (vault/slips/drafts.ts).
    ('D26', 'an unknown draft is not refused', DRAFTS, [("    if (!draft) throw new ProblemException(404, 'NOT_FOUND')\n", '')], 'drafts', DISMISS),
    ('D27', 'a dismissed draft stays open', DRAFTS, [drop(DISMISS_DELETE, DISMISS_DELETE)], 'drafts', DISMISS),
    ('D28', 'a dismissed slip reads as expired', DRAFTS, [(DISMISS_REF, DISMISS_REF.replace("state = 'dismissed'", "state = 'expired'"))], 'drafts', DISMISS),
    ('D29', 'the inbox counts before the dismissed draft goes', DRAFTS, [(DISMISS_DELETE + DISMISS_REF + DISMISS_INBOX, '    const inbox = inboxChange(c)\n' + DISMISS_DELETE + DISMISS_REF + '    return { entityId: SLIP_INBOX_ID, version: inbox.version, changes: [inbox] }\n')], 'drafts', DISMISS),
    ('D30', 'a dismiss takes any body', DRAFTS, [('  assertKnownFields(call.body ?? {}, [])\n', '')], 'drafts', DISMISS),
    ('D31', "the body before the draft's id", DRAFTS, [("  const draftId = routeId(call.params.id ?? '')\n  assertKnownFields(call.body ?? {}, [])\n", "  assertKnownFields(call.body ?? {}, [])\n  const draftId = routeId(call.params.id ?? '')\n")], 'drafts', DISMISS),
    # A single read's slip ref (vault/slips/refs.ts).
    ('R1', 'a deleted record takes a slip ref', REFS, [("'SELECT id FROM transactions WHERE id = ? AND deleted_at IS NULL'", "'SELECT id FROM transactions WHERE id = ?'")], 'drafts', REFONCE),
    ('R2', 'a known hash is inserted again', REFS, [(' ON CONFLICT (ref_hash) DO NOTHING RETURNING id', ' RETURNING id')], 'drafts', REFONCE),
    ('R3', 'a slip ref replaces the one a record has', REFS, [(REF_UPDATE, REF_UPDATE.replace(' AND slip_ref_id IS NULL', ''))], 'drafts', REFLEAVES),
    ('R4', 'a slip ref reads as confirmed', REFS, [("VALUES (?, ?, 'recorded', ?, ?, ?)", "VALUES (?, ?, 'confirmed', ?, ?, ?)")], 'drafts', REFONCE),
    ('R5', "a slip ref moves the record's version", REFS, [(REF_UPDATE, REF_UPDATE.replace('SET slip_ref_id = ?', 'SET slip_ref_id = ?, version = version + 1'))], 'drafts', REFLEAVES),
    ('R6', 'a slip ref stamps a source where none was', REFS, [(REF_UPDATE, REF_UPDATE.replace('SET slip_ref_id = ?', "SET slip_ref_id = ?, source = COALESCE(source, \\'slip_import\\')"))], 'drafts', REFLEAVES),
    ('R7', 'a known hash writes too', REFS, [('if (recorded) c.sql.exec(', 'if (true) c.sql.exec(')], 'drafts', REFONCE),
    # The prune (vault/slips/prune.ts).
    ('P1', "the prune commits no inbox change (the plan's mutant)", PRUNE, [("    appendChanges(c, derivedUuid(c.vaultId, 'slip-prune', now), [inboxChange(c)])\n", '')], 'drafts', EXPIRY),
    ('P2', "a draft expires a day early, at 29 days (the plan's mutant)", PRUNE, [(PRUNE_NOW, '    const now = new Date(c.now.getTime() + DAY_MS).toISOString()\n    const expired')], 'drafts', EXPIRY),
    ('P3', 'the prune is due a day early', PRUNE, [(DUE_TIMES, DUE_TIMES.replace('Date.parse(expires)', 'Date.parse(expires) - DAY_MS'))], 'drafts', EXPIRY),
    ('P4', 'an expired slip reads as dismissed', PRUNE, [("UPDATE slip_refs SET state = 'expired'", "UPDATE slip_refs SET state = 'dismissed'")], 'drafts', EXPIRY),
    ('P5', 'every draft goes', PRUNE, [("c.sql.exec('DELETE FROM slip_drafts WHERE expires_at <= ?', now)", "c.sql.exec('DELETE FROM slip_drafts WHERE ? IS NOT NULL', now)")], 'drafts', EXPIRY),
    ('P6', 'nothing expired still commits a change', PRUNE, [('    if (expired.length === 0) return\n', '')], 'drafts', R37),
    ('P7', "the prune's change is under a random id", PRUNE, [("derivedUuid(c.vaultId, 'slip-prune', now)", 'crypto.randomUUID()')], 'drafts', EXPIRY),
    ('P8', 'backfill uses are kept 30 days', PRUNE, [('export const BACKFILL_KEEP_DAYS = 31', 'export const BACKFILL_KEEP_DAYS = 30')], 'drafts', R37),
    ('P9', 'backfill uses never go', PRUNE, [("'DELETE FROM slip_backfill_uses WHERE day < ? RETURNING day'", "'DELETE FROM slip_backfill_uses WHERE day < ? AND 0 RETURNING day'")], 'drafts', R37),
    ('P10', 'the due time leaves the drafts out', PRUNE, [(DUE_TIMES, DUE_TIMES.replace('expires === null ? null : Date.parse(expires)', 'null'))], 'drafts', R37),
    ('P11', 'the due time leaves the backfill out', PRUNE, [(DUE_TIMES, DUE_TIMES.replace('oldest === null ? null : Date.parse(`${shiftDate(oldest, BACKFILL_KEEP_DAYS + 1)}T00:00:00.000+07:00`)', 'null'))], 'drafts', R37),
    ('P12', "the backfill is due at UTC's midnight", PRUNE, [(DUE_TIMES, DUE_TIMES.replace('T00:00:00.000+07:00', 'T00:00:00.000Z'))], 'drafts', R37),
    ('P13', "the backfill cutoff is UTC's date", PRUNE, [('shiftDate(bangkokDate(c.now), -BACKFILL_KEEP_DAYS)', 'shiftDate(c.now.toISOString().slice(0, 10), -BACKFILL_KEEP_DAYS)')], 'drafts', R37),
    # The alarm's file jobs and the vault (vault/files/jobs.ts, user-vault.ts).
    ('J1', 'the alarm does not prune slips', JOBS, [('  (c) => pruneSlips(c),\n', '')], 'drafts', EXPIRY),
    ('J2', "the alarm ignores the slips' due time", JOBS, [('  (c) => slipsDueAt(c),\n', '')], 'drafts', EXPIRY),
    ('J3', 'the prunes get no registry', JOBS, [('const c = { ...v.fileContext(), registry: v.registry }', 'const c = { ...v.fileContext() } as ReturnType<UserVault["fileContext"]> & { registry: UserVault["registry"] }')], 'drafts', EXPIRY),
    ('U1', 'the registry is built on every read', UV, [('    this.builtRegistry ??= buildVaultRegistry()\n    return this.builtRegistry\n', '    return buildVaultRegistry()\n')], 'drafts', EXPIRY),
    # The registry (vault/commands/registry.ts).
    ('G1', 'a confirm acknowledges as created', REG, [("kind: SLIP_CONFIRM_KIND, entity: SLIP_INBOX_ENTITY, outcome: 'accepted'", "kind: SLIP_CONFIRM_KIND, entity: SLIP_INBOX_ENTITY, outcome: 'created'")], 'drafts', FIFTY),
    ('G2', 'a dismiss acknowledges as deleted', REG, [("kind: SLIP_DISMISS_KIND, entity: SLIP_INBOX_ENTITY, outcome: 'updated'", "kind: SLIP_DISMISS_KIND, entity: SLIP_INBOX_ENTITY, outcome: 'deleted'")], 'drafts', DISMISS),
    # S18 (vault/analytics.ts, 1D-T11's guard): a confirm sends no record_saved.
    ('A1', 'a slip confirm sends record_saved', ANALYTICS, [(EVENTS_GUARD, "  if (route !== 'transactions.create' && route !== 'drafts.confirm') return []\n")], 'drafts', S18),
    # The routes (v1/routes.ts): the release, gates, access and status (workers cases, then the Node table).
    ('N1', 'the list is out before the release', ROUTES, [(LIST_ROUTE, LIST_ROUTE.replace(", release: 'SLIP_IMPORT_ENABLED'", ''))], 'drafts', RELEASE),
    ('N2', 'confirm is out before the release', ROUTES, [(CONFIRM_ROUTE, CONFIRM_ROUTE.replace(", release: 'SLIP_IMPORT_ENABLED'", ''))], 'drafts', RELEASE),
    ('N3', 'dismiss is out before the release', ROUTES, [(DISMISS_ROUTE, DISMISS_ROUTE.replace(", release: 'SLIP_IMPORT_ENABLED'", ''))], 'drafts', RELEASE),
    ('N4', 'the slip ref waits for the release', ROUTES, [(REFS_ROUTE, REFS_ROUTE.replace(', status: 204 }', ", status: 204, release: 'SLIP_IMPORT_ENABLED' }"))], 'drafts', RELEASE),
    ('N5', 'confirm without the writes gate', ROUTES, [(CONFIRM_ROUTE, CONFIRM_ROUTE.replace("gates: ['imports', 'writes']", "gates: ['imports']"))], 'drafts', GATES),
    ('N6', 'dismiss under the writes gate', ROUTES, [(DISMISS_ROUTE, DISMISS_ROUTE.replace("gates: ['imports']", "gates: ['imports', 'writes']"))], 'drafts', GATES),
    ('N7', 'the slip ref under the session alone', ROUTES, [(REFS_ROUTE, REFS_ROUTE.replace("access: 'current_policy'", "access: 'bound_session'"))], 'drafts', GATES),
    ('N8', 'confirm without the imports gate', ROUTES, [(CONFIRM_ROUTE, CONFIRM_ROUTE.replace("gates: ['imports', 'writes']", "gates: ['writes']"))], 'drafts', GATES),
    ('N9', 'a drafts route is not an added route', ROUTES, [("  'POST /v1/drafts/:id/dismiss',\n", '')], 'node', None),
    ('N10', 'confirm answers 201', ROUTES, [(CONFIRM_ROUTE, CONFIRM_ROUTE.replace(' status: 200,', ''))], 'node', None),
    ('N11', 'the slip ref answers 201', ROUTES, [(REFS_ROUTE, REFS_ROUTE.replace(', status: 204 }', ' }'))], 'node', None),
    # The P4-T3 reviews' pins (followups, "P4-T6 and P4-T7"): P4-T3's code, killed by slips-vault.test.ts.
    ('O1', 'a draft on both sides of one account counts twice', ACC, [(COUNT, SUMMED)], 'vault', V_ONCE),
    ('O2', 'the body is read before If-Match', ACC, [(HEADS, "  const { wallet_id: walletId } = parseSlipAccountUpdate(call.body)\n  const expected = expectedVersionOf(call)\n  const id = routeId(call.params.id ?? '')\n")], 'vault', V_FAULTS),
    ('O3', 'the id is read before If-Match', ACC, [(HEADS, "  const id = routeId(call.params.id ?? '')\n  const expected = expectedVersionOf(call)\n  const { wallet_id: walletId } = parseSlipAccountUpdate(call.body)\n")], 'vault', V_FAULTS),
    ('O4', 'the wallet is checked before the version', ACC, [(VERSION_LINE + WALLET_BLOCK, WALLET_BLOCK + VERSION_LINE)], 'vault', V_FAULTS),
    ('O5', 'mapping one account writes every account', ACC, [("WHERE id = ?', walletId, c.now.toISOString(), id)", "WHERE id = ? OR 1', walletId, c.now.toISOString(), id)")], 'vault', V_ONE),
    ('O7', "the inbox version follows the vault's highest head", INBOX, [("'SELECT version FROM entity_heads WHERE entity = ? AND entity_id = ?'", "'SELECT max(version) AS version FROM entity_heads WHERE ? IS NOT NULL AND ? IS NOT NULL'")], 'vault', V_HEAD),
    ('O8', "the unreleased 404 is not a missing path's (a retry-after)", HANDLER, [(RELEASE_LINE, RELEASE_LINE.replace("requestId)\n", "requestId, { retryAfterSeconds: 30 })\n"))], 'vault', V_RELEASE),
    ('O9', 'the release var is read in any case and trimmed', HANDLER, [(RELEASE_LINE, RELEASE_LINE.replace('!flag(env[route.release])', '!flag(env[route.release]?.trim().toLowerCase())'))], 'vault', V_RELEASE),
    ('O10', 'the salt is logged when it is made', SALT, [("  c.sql.exec('INSERT INTO slip_salt (id, salt, created_at) VALUES (1, ?, ?)', salt, c.now.toISOString()).toArray()\n", "  c.sql.exec('INSERT INTO slip_salt (id, salt, created_at) VALUES (1, ?, ?)', salt, c.now.toISOString()).toArray()\n  console.log(JSON.stringify({ event: 'slip_salt_made', salt: asDto(salt).salt }))\n")], 'vault', V_SALT),
    ('O11', 'a salt read sends an event', ANALYTICS, [(EVENTS_GUARD, "  if (route === 'slips.salt') return [{ name: 'record_saved', properties: { kind: 'expense', category_key: 'custom' } }]\n" + EVENTS_GUARD)], 'vault', V_SALT),
]

# Four batches, each well inside a 10-minute call even while other agents hold the heavy lock.
LIST_IDS = {f'D{n}' for n in range(11, 32)}
BATCHES = {
    'confirm': [m[0] for m in MUTANTS if m[0][0] in 'TG' or (m[0][0] == 'D' and m[0] not in LIST_IDS)],
    'list': [m[0] for m in MUTANTS if m[0] in LIST_IDS or m[0][0] == 'R'],
    'prune': [m[0] for m in MUTANTS if m[0][0] in 'PJUAN'],
    'pins': [m[0] for m in MUTANTS if m[0][0] == 'O'],
}

FILES = {
    'drafts': 'test/workers/slip-drafts.test.ts',
    'vault': 'test/workers/slips-vault.test.ts',
    'source': 'test/workers/transaction-source.test.ts',
}


def command(kind: str, case: str | None, tree: str, log: str) -> tuple[list[str], str]:
    edge = os.path.join(tree, 'apps/edge')
    if kind == 'node':
        return (['npx', 'vitest', 'run', '--reporter=verbose', 'test/route-coverage.test.ts'], edge)
    argv = [os.path.join(KIT, 'locked.sh'), log, edge, 'npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', '--reporter=verbose', FILES[kind]]
    if case:
        argv += ['-t', case]
    return (argv, tree)


def sha(target: str) -> str:
    with open(target, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def kinds_of(body: str) -> list[str]:
    """The error kind of every failing case: vitest's "Failed Tests" blocks, each naming one or more cases and one error."""
    kinds: list[str] = []
    if 'Failed Tests' not in body:
        return kinds
    tail = body.split('Failed Tests', 1)[1]
    for block in re.split(r'^⎯+\[\d+/\d+\]⎯*$', tail, flags=re.M):
        cases = re.findall(r'^ FAIL  .+$', block, re.M)
        error = re.search(r'^(\w*Error)\b', block, re.M)
        kinds += [error.group(1) if error else 'unknown'] * len(cases)
    return kinds


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--tree', required=True)
    parser.add_argument('--out', default='')
    parser.add_argument('--only', default='')
    parser.add_argument('--batch', default='')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--whole', action='store_true')
    args = parser.parse_args()
    tree = os.path.abspath(args.tree)
    only = {m for m in args.only.split(',') if m}
    if args.batch:
        only |= set(BATCHES[args.batch])
    if args.check:
        bad = 0
        for mid, _what, rel, swaps, _kind, _case in MUTANTS:
            with open(os.path.join(tree, rel), encoding='utf-8') as f:
                text = f.read()
            for old, _new in swaps:
                if text.count(old) != 1:
                    bad += 1
                    print(f'{mid} BAD ANCHOR ({text.count(old)}) in {rel}: {old[:70]!r}')
        print(f'{len(MUTANTS)} mutants; {bad} bad anchors')
        return 1 if bad else 0
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)
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
        log = os.path.join(out, f'{mid}.log')
        try:
            with open(target, 'w', encoding='utf-8') as f:
                f.write(text)
            argv, cwd = command(kind, None if args.whole else case, tree, log)
            if kind == 'node':
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
        kinds = kinds_of(body)
        clean = len(kinds) > 0 and all(k == 'AssertionError' for k in kinds)
        where = f'{kind}' + (f', -t "{case}"' if case and not args.whole else '')
        if rc != 0:
            killed.append(mid)
            if not clean:
                unclean.append(mid)
            print(f'{mid} killed ({"assertion" if clean else "NOT CLEAN: " + ",".join(sorted(set(kinds)) or ["no failing case"])}; {len(kinds)} failed): {what} [{where}]', flush=True)
        else:
            survivors.append(mid)
            print(f'{mid} SURVIVED: {what} [{where}]', flush=True)
    print(f'{len(killed)} of {ran} killed; survivors {survivors}; not clean {unclean}; not restored {unrestored}', flush=True)
    return 0 if not survivors and not unclean and not unrestored else 1


if __name__ == '__main__':
    sys.exit(main())

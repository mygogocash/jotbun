#!/usr/bin/env python3
"""1B-T10 mutation check. Applies each mutant to one file, runs the focused
workers file (test/workers/imports-review.test.ts), restores the file byte for
byte, and reports the failing tests.

Usage (take the heavy lock first, release it after):
  python3 -I mutants.py <apps/edge directory> <scratch directory> [LABEL ...]
  python3 -I mutants.py --check <apps/edge directory>   (no lock needed: checks
      that each mutant's old text occurs exactly once in its file, and that
      every required case name is a case of the test file)

The scratch directory receives the backup (mutant.keep) and one log per mutant
under mutant-logs/. Exit status 1 if a mutant fails to apply, a restore differs
from the backup, or a mutant leaves any of its REQUIRED tests passing.
"""
import filecmp
import os
import re
import shutil
import subprocess
import sys

CF = 'src/vault/files/confirmation.ts'
PV = 'src/vault/files/previews.ts'
RC = 'src/v1/files/receipts.ts'
RT = 'src/v1/routes.ts'
RG = 'src/vault/commands/registry.ts'

F = 'imports-review.test.ts'
T = f'test/workers/{F}'


def case(name: str) -> str:
    return f'{F}: {name}'


# Required cases, by the names the test file gives them.
NOTHING_SAVED = case('parse, corrections and the freeze alone save no transaction')
FOREIGN = case('another account cannot correct, freeze, confirm or read an import, and a foreign row or wallet is refused')
FROZEN_5000 = case('a 5,000-row frozen selection succeeds, but a 501-row confirmation batch is rejected')
STALE_CASE = case('a changed frozen revision, a stale selection and rows outside the selection conflict, and committed rows are never rewritten')
ID_USED = case('a record id already used is never written again, even if its progress row were lost')
KILL = case('a kill after commit and before the response, retried with the original key and body, has the same outcome')
WALLET_ARCHIVED = case('a row whose wallet was archived after the freeze is conflicted; the rest are saved')
REFREEZE_PARTIAL = case('a re-freeze after a partial confirmation does not re-validate rows already committed, even if their wallet or category was archived since')
REFREEZE_COMMITTED = case('a re-freeze of only committed rows succeeds after their wallet and category are archived')
TRACKING = case("a row dated before its wallet's tracking start, moved after the freeze, is conflicted")
LABELS = case('every selected row needs its labels mapped, and transfers cannot be confirmed from a file')
CONSENT_RECEIPT = case('the record an image row becomes holds the kept receipt, in the same command, only with consent')
INVALID_NO_COPY = case('an invalid batch makes no copy: a wrong revision, a stale selection or an unknown selection never reaches the receipt copy')
COPY_ONCE = case("a confirmation with a receipt copies the import image once and attaches it to the image row's record")
NEVER_PREPARED = case('a confirmation whose receipt was never prepared answers 503 and saves nothing, and one with nothing copied is refused as expired')
RACE = case('a selection frozen while its confirmation was being prepared answers 503 with a retry, never saving the image record without its receipt')
UNUSED_COPY = case('a copy the confirmation did not use is due at once')
SESSION = case('the confirmation steps check the session: after sign-out nothing is reserved or saved')
VERSIONED = case('are versioned commands that clear the corrected issues and recompute the totals')
CLEARS = case('a correction clears the issues of the fields it names and keeps the others')
EXPIRED_RETENTION = case('an expired preview cannot be frozen or confirmed, and retention removes its frozen copies and synced records')
ONE_REVISION = case('a confirmation batch of 500 rows commits as one command under one revision')
SELECTION_1000 = case('a selection naming 1,000 rows freezes')
DUPES = case('names matching records and same-file twins, and keeps every row')
PAGES = case('pages only candidates: summary and issues stay whole-file, advice follows the page rows, pages rejoin the whole')
DEFAULTS = case('defaults the missing parameter, and a page past the end is empty')
IDENTICAL = case('5,000 identical rows against 5,000 identical records, with statistics older than the import: answered in time, five matches each')
SELF_JOIN = case('names exactly what the self-join named, row for row')
QUEUES_EXPIRY = case('queues one expiry job at the preview expiry, and it deletes the candidates when due')
M4_DISABLED = case('an account disabled at the due time: its job ends superseded, the route says expired at once, retention deletes the candidates')
EXPIRES_7D = case('a preview expires after 7 days: its candidates go, it reads expired, and an unattached image is due')
R37 = case('after pruneImports at importsDueAt, the next importsDueAt is later or null')
RESENT = case('a confirmation resent to another import is not found, and one resent after its preview expired is told the preview is unavailable')
ATTACHABLE = case('the preview says until when its image can be kept: two minutes before the image is due, while more than two minutes are left')
REJECTED = case('a rejected file reads rejected with its issue, and corrections and freezes are refused as rejected')
ROW_PROBLEMS = case('a freeze names each row it cannot take and why: incomplete, after today or before tracking, an unknown or mistyped wallet or category')
CONFLICTED_NOW = case('rows that cannot be saved now are conflicted: a category archived after the freeze, a date after today')
PROGRESS = case("progress reads stale after a correction and expired past the preview's expiry, and a re-freeze counts the rows already committed")
PENDING = case('an import with no preview reads its parse state: parsing, failed with its issue, cancelled or expired')
RECORDS_STAY = case('the synced records stay while their preview and selection are live, however old their last change')

STALE_BLOCK = """  if (selection.review_revision !== selection.frozen_revision) {
    // The preview was corrected after this freeze: freeze the current revision again.
    throw new ProblemException(409, 'IMPORT_SELECTION_CONFLICT', { messageKey: 'errors.import_selection_stale', current: { review_revision: selection.review_revision } })
  }
"""
CONFIRM_CALL = "    return await vault.call('imports.confirm', { params: { id: jobId }, headers, body: { batch, prepared: receipt } })"
CHECK_READ = """       FROM import_candidates WHERE job_id = ? AND source_row_id ${IN_IDS} ORDER BY ordinal`,
    jobId,
    list,
  )"""
TAKEN = ("const taken = new Set(c.sql.exec<{ entity_id: string }>(`SELECT entity_id FROM entity_heads WHERE entity = 'transaction' AND entity_id ${IN_IDS}`, "
         "JSON.stringify(open.map((row) => row.id))).toArray().map((row) => row.entity_id))")
ISSUE_FILTER = ".filter((issue) => !corrected.has(issue.field ?? ''))"
COMMITTED_BLOCK = """    if (committed.length > 0) {
      throw new ProblemException(409, 'IMPORT_ROW_COMMITTED', { fields: Object.fromEntries(committed.slice(0, MAX_ROW_PROBLEMS).map((row) => [row.source_row_id, 'errors.import_row_committed'])) })
    }
"""
NO_COPY_BLOCK = """  if (batch.receipt && imageRecord && !receipt) {
    // No copy was made: the read-only checks refused (and this refuses for the same reason) or the state
    // moved since they ran. Never save the image's record without the receipt the person asked to keep.
    assertOwnReceipt(c, selection.job_id, batch.receipt)
    throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 1 })
  }
"""
OPEN_FILTER = ".filter((row) => !row.wallet_archived && !row.category_archived && row.tracking_start !== null && (row.occurred_on as string) >= row.tracking_start && (row.occurred_on as string) <= today)"
RECORD_DUE = """              (SELECT min(max(strftime('%Y-%m-%dT%H:%M:%fZ', g.committed_at, '+30 days'),
                              coalesce(CASE h.entity WHEN ?1 THEN (SELECT s.expires_at FROM import_selections s WHERE s.selection_id = h.entity_id)
                                                     ELSE (SELECT p.expires_at FROM import_previews p WHERE p.job_id = h.entity_id) END, '')))"""
ADVICE_PUSHES = """    if (matches) advice.push({ source_row_id: row.source_row_id, kind: 'existing_transaction', matches: [...matches] })
    const others = (twins.get(row.twins) ?? []).filter((id) => id !== row.source_row_id).slice(0, 5)
    if (others.length > 0) advice.push({ source_row_id: row.source_row_id, kind: 'same_file', matches: others })"""
PAGE_ISSUES = """  for (const row of c.sql.exec<{ source_row_id: string; issues: string }>("SELECT source_row_id, issues FROM import_candidates WHERE job_id = ? AND json_array_length(issues) > 0 ORDER BY ordinal", jobId)) {
    issues.push(...rowIssues(row))
  }"""

# (label, description, file, old text (must occur exactly once), new text, tests that must fail)
MUTANTS = [
    # The plan's mutants (Task 1B-T10, Step 5).
    ('M1', 'skip the frozen-revision check (a stale selection confirms)', CF, STALE_BLOCK, '', {STALE_CASE, INVALID_NO_COPY}),
    ('M2', 'each confirmed row in its own command', RC, CONFIRM_CALL,
     "    let last: VaultReply | undefined\n"
     "    for (const row of batch.batch_row_ids) last = await vault.call('imports.confirm', { params: { id: jobId }, headers: { ...headers, 'idempotency-key': crypto.randomUUID() }, body: { batch: { ...batch, batch_row_ids: [row] }, prepared: receipt } })\n"
     "    return last as VaultReply",
     {ONE_REVISION}),
    ('M3a', "the freeze binds one ? per row id", CF, CHECK_READ,
     """       FROM import_candidates WHERE job_id = ? AND source_row_id IN (${ids.map(() => '?').join(', ')}) ORDER BY ordinal`,
    jobId,
    ...ids,
  )""", {SELECTION_1000}),
    ('M3b', 'the confirmation binds one ? per row id', CF, TAKEN,
     "const taken = new Set(c.sql.exec<{ entity_id: string }>(`SELECT entity_id FROM entity_heads WHERE entity = 'transaction' AND entity_id IN (${open.map(() => '?').join(', ') || 'NULL'})`, "
     "...open.map((row) => row.id)).toArray().map((row) => row.entity_id))", {ONE_REVISION}),
    # readyPreview and the corrections (patchRows, gogospend_patch_import_rows).
    ('C1', 'a preview past its expiry is still ready', CF, "  if (preview.status !== 'ready' || isPast(c, preview.expires_at)) {", "  if (preview.status !== 'ready') {", {EXPIRED_RETENTION}),
    ('C2', 'a rejected preview is refused as expired', CF,
     "messageKey: preview.status === 'rejected' ? 'errors.import_preview_rejected' : 'errors.import_preview_expired'", "messageKey: 'errors.import_preview_expired'", {REJECTED}),
    ('C3', 'a correction ignores If-Match', CF,
     "    if (preview.review_revision !== String(expected)) throw new ProblemException(409, 'VERSION_CONFLICT', { current: { review_revision: preview.review_revision } })\n", '', {VERSIONED}),
    ('C4', 'a correction takes an unknown row', CF,
     "    if (unknown.length > 0) throw rowProblems(new Map(unknown.map((id) => [id, 'errors.import_row_unknown'])), 'errors.import_rows_unknown')\n    const committed = c.sql",
     '    const committed = c.sql', {VERSIONED}),
    ('C5', 'a correction rewrites a committed row', CF, COMMITTED_BLOCK, '', {STALE_CASE}),
    ('C6', 'a correction clears no issue', CF, ISSUE_FILTER, '.filter(() => true)', {CLEARS}),
    ('C7', 'a correction clears every issue of its row', CF, ISSUE_FILTER, '.filter(() => false)', {CLEARS}),
    ('C8', 'the review flag ignores issues', CF, ' || next.wallet_label === null || issues.length > 0', ' || next.wallet_label === null', {CLEARS}),
    ('C9', 'the expense total is not recomputed', CF,
     "              expense_total_minor = (SELECT coalesce(sum(amount_minor), 0) FROM import_candidates WHERE job_id = ?1 AND type = 'expense'),\n", '', {VERSIONED}),
    ('C10', 'the review count is not recomputed', CF,
     '              review_required_count = (SELECT count(*) FROM import_candidates WHERE job_id = ?1 AND review_required = 1),\n', '', {CLEARS}),
    # The freeze (freezeSelection, checkSelectable, gogospend_freeze_import_selection).
    ('C11', 'a freeze ignores the review revision', CF,
     "    if (preview.review_revision !== request.review_revision) throw new ProblemException(409, 'VERSION_CONFLICT', { current: { review_revision: preview.review_revision } })\n    const count",
     '    const count', {STALE_CASE}),
    ('C12', 'a freeze takes an unknown row', CF,
     "  const unknown = ids.filter((id) => !known.has(id))\n  if (unknown.length > 0) throw rowProblems(new Map(unknown.map((id) => [id, 'errors.import_row_unknown'])), 'errors.import_rows_unknown')\n  if (problems.size > 0)",
     '  if (problems.size > 0)', {FOREIGN}),
    ('C13', 'an open row takes an archived wallet', CF, "      if (open && wallet.archived === 1) return 'errors.wallet_archived'\n", '', {REFREEZE_PARTIAL}),
    ('C14', 'a committed row is re-validated against its archived wallet', CF,
     "      if (open && wallet.archived === 1) return 'errors.wallet_archived'", "      if (wallet.archived === 1) return 'errors.wallet_archived'", {REFREEZE_COMMITTED, REFREEZE_PARTIAL}),
    ('C15', 'an open row takes an archived category', CF, "      if (open && category.archived === 1) return 'errors.category_archived'\n", '', {REFREEZE_PARTIAL}),
    ('C16', 'no category type check', CF, "      if (category.type !== row.type) return 'errors.category_type_mismatch'\n", '', {ROW_PROBLEMS}),
    ('C17', 'an unknown wallet is passed over', CF, "      if (!wallet) return 'errors.wallet_not_found'\n", '      if (!wallet) return null\n', {ROW_PROBLEMS}),
    ('C18', 'an unknown category is passed over', CF, "      if (!category) return 'errors.category_not_found'\n", '      if (!category) return null\n', {ROW_PROBLEMS}),
    ('C19', 'no tracking-start check at the freeze', CF, "      if (row.occurred_on < wallet.tracking_start) return 'errors.date_before_tracking_start'\n", '', {ROW_PROBLEMS}),
    ('C20', 'no future-date check at the freeze', CF, "      if (row.occurred_on > today) return 'errors.date_in_future'\n", '', {ROW_PROBLEMS}),
    ('C21', 'an incomplete row is taken', CF,
     "      if (row.type === null || row.amount_minor === null || row.occurred_on === null) return 'errors.import_row_incomplete'\n", '', {ROW_PROBLEMS}),
    ('C22', 'a transfer is taken', CF, "      if (row.type === 'transfer') return 'errors.import_row_transfer'\n", '', {LABELS}),
    ('C39', "the freeze's synced record counts no committed row", CF,
     'frozen_revision: request.review_revision, row_count: count, committed_count: committed }',
     'frozen_revision: request.review_revision, row_count: count, committed_count: 0 }', {PROGRESS}),
    ('C45', 'the freeze joins without CROSS JOIN (quadratic)', CF, 'FROM json_each(?) m CROSS JOIN import_candidates k', 'FROM json_each(?) m JOIN import_candidates k', {FROZEN_5000}),
    # The confirmation (openSelection, confirmIn, outcome, progress).
    ('C23', 'an archived wallet still takes its rows at the batch', CF, OPEN_FILTER,
     OPEN_FILTER.replace('!row.wallet_archived && ', ''), {WALLET_ARCHIVED}),
    ('C24', 'an archived category still takes its rows at the batch', CF, OPEN_FILTER,
     OPEN_FILTER.replace(' && !row.category_archived', ''), {CONFLICTED_NOW}),
    ('C25', "no tracking-start check at the batch", CF, OPEN_FILTER,
     OPEN_FILTER.replace(' && (row.occurred_on as string) >= row.tracking_start', ''), {TRACKING}),
    ('C26', 'no today check at the batch', CF, OPEN_FILTER,
     OPEN_FILTER.replace(' && (row.occurred_on as string) <= today', ''), {CONFLICTED_NOW}),
    ('C27', 'a used record id is written again', CF, '  const saving = open.filter((row) => !taken.has(row.id))', '  const saving = open', {ID_USED}),
    ('C28', 'rows outside the selection are accepted', CF,
     '  const rows = batchRows(c, selection, batch)\n  assertInsideSelection(rows)\n', '  const rows = batchRows(c, selection, batch)\n', {STALE_CASE}),
    ('C29', 'a batch naming another frozen revision is accepted', CF,
     """  if (batch.frozen_revision !== selection.frozen_revision) {
    throw new ProblemException(409, 'IMPORT_SELECTION_CONFLICT', { messageKey: 'errors.import_frozen_revision_mismatch', current: { frozen_revision: selection.frozen_revision } })
  }
""", '', {STALE_CASE, INVALID_NO_COPY}),
    ('C30', 'an expired preview still confirms', CF,
     "  if (selection.preview_status !== 'ready' || isPast(c, selection.expires_at)) throw new ProblemException(409, 'IMPORT_PREVIEW_UNAVAILABLE', { messageKey: 'errors.import_preview_expired' })\n",
     '', {EXPIRED_RETENTION}),
    ('C31', 'the prepare step skips the read-only checks', CF,
     '    const selection = openSelection(c, batch, jobId)\n    assertInsideSelection(batchRows(c, selection, batch))\n    assertOwnReceipt(c, selection.job_id, batch.receipt)\n',
     '', {CONSENT_RECEIPT, INVALID_NO_COPY}),
    ('C32', 'a refused prepare step answers none', CF,
     "    if (error instanceof ProblemException) return { kind: 'refused' }", "    if (error instanceof ProblemException) return { kind: 'none' }", {RACE}),
    ('C33', 'no 503 for a receipt that was never prepared', CF, NO_COPY_BLOCK, '', {NEVER_PREPARED, RACE}),
    ('C34', 'the receipt is readied but not attached', CF,
     "    c.sql.exec('INSERT INTO transaction_attachments (transaction_id, attachment_id, attached_at) VALUES (?, ?, ?)', imageRecord.id, batch.receipt.attachment_id, at)\n",
     '', {CONSENT_RECEIPT, COPY_ONCE}),
    ('C35', 'the receipt is attached without being readied', CF,
     "    ready(c, batch.receipt.attachment_id, receipt.kind === 'copied' ? { key: receipt.key, bytes: receipt.bytes, sha256: receipt.sha256 } : null)\n",
     '', {CONSENT_RECEIPT, NEVER_PREPARED}),
    ('C36', "the image record's change misses its receipt", CF,
     '    records = records.map((record) => (record.id === imageRecord.id ? (transactionRow(c, record.id) as TransactionRow) : record))\n', '', {CONSENT_RECEIPT}),
    ('C37', 'no consent in the audit', CF, '    audit.consent = RECEIPT_RETENTION_CONSENT\n', '', {CONSENT_RECEIPT}),
    ('C38', "the batch's synced record counts no committed row", CF,
     'frozen_revision: selection.frozen_revision, row_count: selection.row_count, committed_count: committed }',
     'frozen_revision: selection.frozen_revision, row_count: selection.row_count, committed_count: 0 }', {ONE_REVISION}),
    ('C40', 'conflicted rows are reported as remaining', CF,
     '    if (inBatch.has(row.source_row_id)) (row.committed ? committed : conflicted).push(row.source_row_id)\n    else if (!row.committed) remaining.push(row.source_row_id)',
     '    if (row.committed) {\n      if (inBatch.has(row.source_row_id)) committed.push(row.source_row_id)\n    } else remaining.push(row.source_row_id)',
     {WALLET_ARCHIVED, ID_USED}),
    ('C41', 'a replay after the frozen copies went answers an empty outcome', CF,
     "  if (!selection) throw new ProblemException(409, 'IMPORT_PREVIEW_UNAVAILABLE', { messageKey: 'errors.import_preview_expired' })\n  if (selection.job_id !== jobId)",
     '  if (!selection) return { ack, selection_id: batch.selection_id, frozen_revision: batch.frozen_revision, committed: [], remaining: [], conflicted: [] }\n  if (selection.job_id !== jobId)',
     {RESENT}),
    ('C42', "a replay is answered for another import", CF, "  if (selection.job_id !== jobId) throw new ProblemException(404, 'NOT_FOUND')\n  const inBatch", '  const inBatch', {RESENT}),
    ('C43', 'progress is never stale', CF, "selection.review_revision !== selection.frozen_revision ? 'stale' : 'open'", "'open'", {PROGRESS}),
    ('C44', 'progress ignores the expiry time', CF,
     "    selection.preview_status !== 'ready' || isPast(c, selection.expires_at) ? 'expired' :", "    selection.preview_status !== 'ready' ? 'expired' :", {PROGRESS}),
    # The preview read (PreviewQuery, so Q) and the duplicate advice.
    ('Q1', 'a parsing import reads queued', PV, "    case 'parsing':\n      return 'parsing'", "    case 'parsing':\n      return 'queued'", {PENDING}),
    ('Q2', 'an unreadable file reads parse_failed', PV,
     "head.parse_failure && UNAVAILABLE.has(head.parse_failure) ? 'quarantine_unavailable' : 'parse_failed'", "'parse_failed'", {PENDING}),
    ('Q3', 'an expired upload reads its parse state', PV, "  if (head.upload_status === 'expired') return 'expired'\n", '', {PENDING}),
    ('Q4', 'a preview past its expiry reads ready until pruned', PV, ' || (head.expires_at !== null && Date.parse(head.expires_at) <= now)', '', {M4_DISABLED}),
    ('Q5', 'an expired preview still serves its rows', PV,
     "  if (expired) {\n    return { job_id: head.job_id, status: 'expired', candidates: [], issues: [], duplicate_advice: [], review_revision: head.review_revision, expires_at: head.expires_at, summary }\n  }\n",
     '', {M4_DISABLED}),
    ('Q6', "attachable_until without the two minutes' margin", PV, '      now + SOURCE_MARGIN_MS,\n      jobId,', '      now,\n      jobId,', {ATTACHABLE}),
    ('Q7', 'attachable_until is the deadline itself', PV, 'new Date(head.image_due - SOURCE_MARGIN_MS).toISOString()', 'new Date(head.image_due).toISOString()', {ATTACHABLE}),
    ('Q8', "an expired preview's image is still attachable", PV,
     "WHERE o.key = p.image_key AND p.status = 'ready' AND o.purpose", 'WHERE o.key = p.image_key AND o.purpose', {EXPIRES_7D}),
    ('Q9', 'the last page names a next offset', PV,
     'next_offset: rows.length > 0 && end < total ? end : null', 'next_offset: rows.length > 0 && end <= total ? end : null', {PAGES, DEFAULTS}),
    ('Q10', "a page's issues are its own rows' only", PV, PAGE_ISSUES, '  for (const row of rows) issues.push(...rowIssues(row))', {PAGES}),
    ('Q11', "a page's advice covers the whole file", PV,
     'if (range === null || (row.ordinal >= range.first && row.ordinal <= range.last)) {', 'if (range === null || range !== null) {', {PAGES}),
    ('Q12', 'a row is its own same-file twin', PV, '.filter((id) => id !== row.source_row_id).slice(0, 5)', '.slice(0, 5)', {DUPES}),
    ('Q13', 'a group keeps five rows, not six', PV, 'if (group.length < 6) group.push', 'if (group.length < 5) group.push', {IDENTICAL}),
    ('Q14', 'six records per row', PV, ') WHERE n <= 5 ORDER BY n`,', ') WHERE n <= 6 ORDER BY n`,', {IDENTICAL}),
    ('Q15', 'a deleted record is advice', PV, '        WHERE t.deleted_at IS NULL\n          AND (t.occurred_on', '        WHERE 1 = 1\n          AND (t.occurred_on', {SELF_JOIN}),
    ('Q16', 'same-file advice comes first', PV, ADVICE_PUSHES,
     ADVICE_PUSHES.split('\n')[1] + '\n' + ADVICE_PUSHES.split('\n')[2] + '\n' + ADVICE_PUSHES.split('\n')[0], {DUPES}),
    ('Q17', 'twins ignore the wallet', PV,
     'JSON.stringify([row.occurred_on, row.type, row.amount_minor, row.wallet_label, row.merchant, row.note])',
     'JSON.stringify([row.occurred_on, row.type, row.amount_minor, row.merchant, row.note])', {SELF_JOIN}),
    # The retention (pruneImports, importsDueAt).
    ('Q18', 'expiry keeps the candidates', PV, "    c.sql.exec('DELETE FROM import_candidates WHERE job_id IN (SELECT value FROM json_each(?))', jobs)\n", '',
     {QUEUES_EXPIRY, M4_DISABLED, EXPIRES_7D}),
    ('Q19', "expiry leaves the image's deadline as it was", PV,
     "SET delete_after = min(delete_after, ?) WHERE purpose = 'import_image'", "SET delete_after = max(delete_after, ?) WHERE purpose = 'import_image'", {EXPIRES_7D}),
    ('Q20', 'a preview expires only after its expiry', PV,
     "WHERE status <> 'expired' AND expires_at <= ? RETURNING job_id\", at, at)", "WHERE status <> 'expired' AND expires_at < ? RETURNING job_id\", at, at)",
     {EXPIRES_7D, R37, QUEUES_EXPIRY}),
    ('Q21', 'expired selections are kept', PV,
     "    const gone = c.sql.exec('DELETE FROM import_selections WHERE expires_at <= ? RETURNING selection_id', at).toArray()", '    const gone: unknown[] = []', {EXPIRED_RETENTION}),
    ('Q22', 'the synced records are purged at once', PV,
     '      new Date(c.now.getTime() - IMPORT_RECORDS_MS).toISOString(),', '      c.now.toISOString(),', {EXPIRED_RETENTION}),
    ('Q23', "a review record is purged while its preview is live", PV,
     "      : 'NOT EXISTS (SELECT 1 FROM import_previews p WHERE p.job_id = h.entity_id AND p.expires_at > ?2)'", "      : '?2 IS NOT NULL'", {RECORDS_STAY}),
    ('Q24', 'a selection record is purged while its selection is live', PV,
     "      ? 'NOT EXISTS (SELECT 1 FROM import_selections s WHERE s.selection_id = h.entity_id)'", "      ? '1 = 1'", {RECORDS_STAY}),
    ('Q25', "a record's due time ignores its live preview or selection", PV, RECORD_DUE,
     "              (SELECT min(strftime('%Y-%m-%dT%H:%M:%fZ', g.committed_at, '+30 days'))", {RECORDS_STAY}),
    ('Q26', 'importsDueAt ignores the previews', PV,
     "      `SELECT (SELECT min(expires_at) FROM import_previews WHERE status <> 'expired') AS preview,", '      `SELECT NULL AS preview,', {QUEUES_EXPIRY}),
    ('Q27', 'importsDueAt ignores the synced records', PV, '  const times = [preview, selection, record]', '  const times = [preview, selection]', {R37}),
    # The Worker's confirmation (receipts.ts), the step table (S) and the registry (G).
    ('W1', 'an unused copy is not given back', RC,
     CONFIRM_CALL + '\n  } finally {\n    if (copy) await release(vault, copy.key)\n  }', CONFIRM_CALL + '\n  } finally {\n    void copy\n  }', {UNUSED_COPY}),
    ('W2', 'the command step never gets the copy', RC,
     "  const receipt: ConfirmReceipt = prepared === 'refused' ? null : copy ? { kind: 'copied', ...copy } : { kind: 'none' }",
     "  const receipt: ConfirmReceipt = prepared === 'refused' ? null : { kind: 'none' }", {CONSENT_RECEIPT, COPY_ONCE}),
    ('W3', 'a refused prepare step is sent as none', RC, "prepared === 'refused' ? null : copy ?", "prepared === 'refused' ? { kind: 'none' } : copy ?", {RACE}),
    ('W4', 'a receipt batch prepares nothing', RC,
     "  const prepared = batch.receipt ? await prepare(w, vault, 'imports.confirmPrepare', { command_id: command.commandId, batch }, { id: jobId }) : 'refused'",
     "  const prepared = 'refused' as StoredCopy | null | 'refused'", {CONSENT_RECEIPT}),
    ('S1', 'the prepare step runs after sign-out', RT, "  'imports.confirmPrepare': {},\n", "  'imports.confirmPrepare': { anySession: true },\n", {SESSION}),
    ('G1', "a confirmation's outcome is created", RG,
     "registry.defineCommand({ kind: CONFIRM_KIND, entity: SELECTION_ENTITY, outcome: 'updated'", "registry.defineCommand({ kind: CONFIRM_KIND, entity: SELECTION_ENTITY, outcome: 'created'", {KILL}),
    ('G2', "a correction's outcome is created", RG,
     "registry.defineCommand({ kind: PATCH_KIND, entity: REVIEW_ENTITY, outcome: 'updated'", "registry.defineCommand({ kind: PATCH_KIND, entity: REVIEW_ENTITY, outcome: 'created'", {VERSIONED}),
    ('G3', "a freeze's outcome is updated", RG,
     "registry.defineCommand({ kind: FREEZE_KIND, entity: SELECTION_ENTITY, outcome: 'created'", "registry.defineCommand({ kind: FREEZE_KIND, entity: SELECTION_ENTITY, outcome: 'updated'", {FROZEN_5000}),
]

FAILED = re.compile(r'^\s*×\s+test/(?:workers/)?(\S+)\s+>\s+(?:.+? > )?(.+?)(?:\s+\d+ms)?$')
IT_NAME = re.compile(r"""^\s*it\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")""")


def case_names(edge: str) -> set:
    names = set()
    for line in open(os.path.join(edge, T), encoding='utf-8'):
        match = IT_NAME.match(line)
        if match:
            raw = match.group(1) if match.group(1) is not None else match.group(2)
            names.add(case(raw.replace("\\'", "'").replace('\\"', '"')))
    return names


def run(edge: str, cmd: list, log) -> tuple:
    out = subprocess.run(cmd, cwd=edge, capture_output=True, text=True, timeout=1200)
    text = out.stdout + out.stderr
    log.write(text)
    failed = set()
    for line in text.splitlines():
        match = FAILED.match(line)
        if match:
            failed.add(f'{match.group(1)}: {match.group(2).strip()}')
    totals = re.search(r'Tests\s+(.+)', text)
    return failed, (totals.group(1).strip() if totals else 'no totals')


def run_focused(edge: str, log_path: str) -> tuple:
    with open(log_path, 'w') as log:
        failed, totals = run(edge, ['npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', '--reporter=verbose', T], log)
    return failed, f'workers {totals}'


def check(edge: str) -> int:
    ok = True
    names = case_names(edge)
    labels = set()
    for label, _description, rel, old, new, required in MUTANTS:
        if label in labels:
            print(f'{label} is used twice')
            ok = False
        labels.add(label)
        count = open(os.path.join(edge, rel), encoding='utf-8').read().count(old)
        if count != 1:
            print(f'{label} old text found {count} times in {rel}')
            ok = False
        if old == new:
            print(f'{label} changes nothing')
            ok = False
        for name in sorted(required - names):
            print(f'{label} requires a case the test file does not have: {name}')
            ok = False
    print(f'{len(MUTANTS)} mutants, {len(names)} cases; old text found exactly once and every required case exists: {ok}')
    return 0 if ok else 1


def main() -> int:
    if sys.argv[1] == '--check':
        return check(sys.argv[2])
    edge, scratch = sys.argv[1], sys.argv[2]
    only = set(sys.argv[3:])
    os.makedirs(os.path.join(scratch, 'mutant-logs'), exist_ok=True)
    ok = True
    for label, description, rel, old, new, required in MUTANTS:
        if only and label not in only:
            continue
        path = os.path.join(edge, rel)
        keep = os.path.join(scratch, 'mutant.keep')
        shutil.copyfile(path, keep)
        text = open(path, encoding='utf-8').read()
        if text.count(old) != 1:
            print(f'{label} NOT APPLIED: old text found {text.count(old)} times in {rel}')
            ok = False
            continue
        open(path, 'w', encoding='utf-8').write(text.replace(old, new))
        try:
            failed, totals = run_focused(edge, os.path.join(scratch, 'mutant-logs', f'{label}.log'))
        finally:
            shutil.copyfile(keep, path)
        restored = filecmp.cmp(keep, path, shallow=False)
        missing = sorted(required - failed)
        verdict = 'KILLED' if not missing else 'SURVIVED'
        if missing or not restored:
            ok = False
        print(f'{label} {verdict} ({description}) [{totals}] restored={restored}', flush=True)
        for name in sorted(failed):
            print(f'    failed: {name}', flush=True)
        for name in missing:
            print(f'    REQUIRED BUT PASSED: {name}', flush=True)
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())

// Planner exploration (scratch only): rowsRead and plans of the due-time reads, old SQL against the new functions.
import { runInDurableObject } from 'cloudflare:test'
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'

import { attachmentsDueAt } from '../../src/vault/files/attachments'
import type { FileContext } from '../../src/vault/files/context'
import { importsDueAt } from '../../src/vault/files/previews'
import { builtinId, moneyFixtures } from './support/money-fixtures'
import { startV1, vaultOf } from './support/v1-client'

const UNHELD = "status = 'retained' AND NOT EXISTS (SELECT 1 FROM transaction_attachments ta WHERE ta.attachment_id = attachments.id)"
const OBJECT_GONE = "NOT EXISTS (SELECT 1 FROM vault_objects o WHERE o.key = attachments.object_key AND o.status IN ('reserved', 'published'))"
const A0 = `SELECT EXISTS (SELECT 1 FROM attachments WHERE (status = 'released' AND released_at IS NULL) OR (${UNHELD})) AS waiting,
              (SELECT min(released_at) FROM attachments WHERE status = 'released' AND released_at IS NOT NULL AND ${OBJECT_GONE}) AS oldest`
const I0 = `SELECT (SELECT min(expires_at) FROM import_previews WHERE status <> 'expired') AS preview,
              (SELECT min(expires_at) FROM import_selections) AS selection,
              (SELECT min(max(strftime('%Y-%m-%dT%H:%M:%fZ', g.committed_at, '+30 days'),
                              coalesce(CASE h.entity WHEN ?1 THEN (SELECT s.expires_at FROM import_selections s WHERE s.selection_id = h.entity_id)
                                                     ELSE (SELECT p.expires_at FROM import_previews p WHERE p.job_id = h.entity_id) END, '')))
                 FROM entity_heads h
                 JOIN entity_changes g ON g.revision = h.revision AND g.entity = h.entity AND g.entity_id = h.entity_id
                WHERE h.entity IN (?1, ?2) AND h.state <> 'purged') AS record`

it('rowsRead and plans', async () => {
  const v1 = await startV1(undefined, { startWork: 'manual' })
  const money = moneyFixtures(v1)
  const user = await money.member()
  const wallet = await money.wallet(user)
  const food = builtinId(user, 'food')
  const out: Record<string, unknown> = {}
  for (const n of [0, 100, 400]) {
    out[n] = await runInDurableObject(vaultOf(user), (_vault, state) => {
      const sql = state.storage.sql
      if (n > 0) {
        const more = n === 100 ? 100 : 300
        const from = n === 100 ? 0 : 100
        for (let i = from; i < from + more; i += 1) {
          const record = randomUUID()
          const receipt = randomUUID()
          sql.exec("INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, version, created_at, updated_at) VALUES (?, 'expense', 100, '2026-02-01', ?, ?, 1, 'x', 'x')", record, wallet, food)
          sql.exec("INSERT INTO attachments (id, source_job_id, status, object_key, content_type, bytes, sha256, width, height, retained_at) VALUES (?, ?, 'retained', ?, 'image/jpeg', 10, ?, 1, 1, 'x')", receipt, randomUUID(), `receipt/v/${receipt}/t/image.jpg`, 'a'.repeat(64))
          sql.exec("INSERT INTO transaction_attachments (transaction_id, attachment_id, attached_at) VALUES (?, ?, 'x')", record, receipt)
          sql.exec('UPDATE sync_state SET revision = revision + 1 WHERE id = 1')
          const first = sql.exec<{ revision: number }>('SELECT revision FROM sync_state WHERE id = 1').one().revision
          const head = randomUUID()
          sql.exec("INSERT INTO entity_heads (entity, entity_id, version, state, revision) VALUES ('import_review', ?, 1, 'active', ?)", head, first)
          sql.exec('UPDATE sync_state SET revision = revision + 1 WHERE id = 1')
          const { revision } = sql.exec<{ revision: number }>('SELECT revision FROM sync_state WHERE id = 1').one()
          sql.exec("INSERT INTO entity_changes (revision, ordinal, command_id, entity, entity_id, version, state, snapshot, committed_at, group_bytes) VALUES (?, 0, ?, 'import_review', ?, 2, 'purged', NULL, 'x', 10)", revision, randomUUID(), head)
          sql.exec("UPDATE entity_heads SET version = 2, state = 'purged', revision = ? WHERE entity = 'import_review' AND entity_id = ?", revision, head)
        }
        // pruneAttachments would have emptied the checks after its pass.
        sql.exec('DELETE FROM attachment_checks')
      }
      const cursors: { query: string; cursor: SqlStorageCursor<Record<string, SqlStorageValue>> }[] = []
      const spy = { exec: (query: string, ...b: unknown[]) => { const cursor = sql.exec(query, ...b); cursors.push({ query, cursor }); return cursor } } as unknown as SqlStorage
      const c: FileContext = { sql: spy, storage: state.storage, now: new Date(), vaultId: state.id.toString() }
      attachmentsDueAt(c)
      const a = cursors.splice(0).map(({ cursor }) => cursor.rowsRead)
      importsDueAt(c)
      const i = cursors.splice(0).map(({ cursor }) => cursor.rowsRead)
      const a0 = sql.exec(A0)
      a0.toArray()
      const i0 = sql.exec(I0, 'import_selection', 'import_review')
      i0.toArray()
      const plan = (q: string, ...b: unknown[]) => sql.exec<{ detail: string }>(`EXPLAIN QUERY PLAN ${q}`, ...b).toArray().map((r) => r.detail)
      return { newAttachmentsRows: a, newImportsRows: i, oldAttachmentsRows: a0.rowsRead, oldImportsRows: i0.rowsRead, checks: sql.exec('SELECT count(*) AS n FROM attachment_checks').one().n, ...(n === 0 ? {} : {}) }
    })
  }
  const plans = await runInDurableObject(vaultOf(user), (_vault, state) => {
    const sql = state.storage.sql
    const queries: { query: string; b: unknown[] }[] = []
    const spy = { exec: (query: string, ...b: unknown[]) => (queries.push({ query, b }), sql.exec(query, ...b)) } as unknown as SqlStorage
    const c: FileContext = { sql: spy, storage: state.storage, now: new Date(), vaultId: state.id.toString() }
    attachmentsDueAt(c)
    importsDueAt(c)
    return queries.map(({ query, b }) => sql.exec<{ detail: string }>(`EXPLAIN QUERY PLAN ${query}`, ...b).toArray().map((r) => r.detail))
  })
  console.log(`rows probe: ${JSON.stringify(out)}`)
  console.log(`plans probe: ${JSON.stringify(plans)}`)
  expect(plans.length).toBe(2)
})

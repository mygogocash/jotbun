// Planner measurement for alarm-hardening m4 (scratch only, never committed): the per-write due-time reads, the
// functions themselves, at the 1B-T11 review's sizes and at a larger vault. The same file runs on the base and on the
// real files.
import { runInDurableObject } from 'cloudflare:test'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { attachmentsDueAt, pruneAttachments } from '../../src/vault/files/attachments'
import type { FileContext } from '../../src/vault/files/context'
import { fileJobsDue } from '../../src/vault/files/jobs'
import { importsDueAt } from '../../src/vault/files/previews'
import { nextDue, reschedule } from '../../src/vault/retention'
import type { UserVault } from '../../src/vault/user-vault'
import { vaultRows } from './support/files'
import { builtinId, moneyFixtures } from './support/money-fixtures'
import { startV1, vaultOf } from './support/v1-client'
import type { TestUser } from './support/v1-client'

const ctx = (state: DurableObjectState): FileContext => ({ sql: state.storage.sql, storage: state.storage, now: new Date(), vaultId: state.id.toString() })

async function seed(user: TestUser, wallet: string, food: string, receipts: number, purgedHeads: number): Promise<void> {
  await runInDurableObject(vaultOf(user), (_vault, state) => {
    const sql = state.storage.sql
    // 30,000 records, every tenth deleted (3,000).
    sql.exec(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 30000)
       INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, version, deleted_at, created_at, updated_at)
       SELECT printf('01900000-0000-4000-8000-%012d', i), 'expense', 100, '2026-02-01', ?, ?, 1, CASE WHEN i % 10 = 0 THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END, 'x', 'x' FROM n`,
      wallet,
      food,
    ).toArray()
    sql.exec(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
       INSERT INTO attachments (id, source_job_id, status, object_key, content_type, bytes, sha256, width, height, retained_at)
       SELECT printf('a1900000-0000-4000-8000-%012d', i), printf('b1900000-0000-4000-8000-%012d', i), 'retained', printf('receipt/v/%d/t/image.jpg', i), 'image/jpeg', 10, ?, 1, 1, 'x' FROM n`,
      receipts,
      'a'.repeat(64),
    ).toArray()
    // Each receipt held by one record: every sixth at the review's 5,000 (as its probe), else records 1 to n.
    sql.exec(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
       INSERT INTO transaction_attachments (transaction_id, attachment_id, attached_at)
       SELECT printf('01900000-0000-4000-8000-%012d', CASE WHEN ? <= 5000 THEN i * 6 - 1 ELSE i END), printf('a1900000-0000-4000-8000-%012d', i), 'x' FROM n`,
      receipts,
      receipts,
    ).toArray()
    // Import review records, purged long ago (their heads stay, purged, for good), in groups of 1,000.
    sql.exec('UPDATE sync_state SET revision = revision + 1 WHERE id = 1').toArray()
    sql.exec(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
       INSERT INTO entity_heads (entity, entity_id, version, state, revision)
       SELECT 'import_review', printf('c1900000-0000-4000-8000-%012d', i), 1, 'active', (SELECT revision FROM sync_state WHERE id = 1) FROM n`,
      purgedHeads,
    ).toArray()
    for (let from = 0; from < purgedHeads; from += 1_000) {
      sql.exec('UPDATE sync_state SET revision = revision + 1 WHERE id = 1').toArray()
      const size = Math.min(1_000, purgedHeads - from)
      sql.exec(
        `WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < ? - 1)
         INSERT INTO entity_changes (revision, ordinal, command_id, entity, entity_id, version, state, snapshot, committed_at, group_bytes)
         SELECT (SELECT revision FROM sync_state WHERE id = 1), i, ?, 'import_review', printf('c1900000-0000-4000-8000-%012d', ? + i + 1), 2, 'purged', NULL, 'x', CASE WHEN i = 0 THEN 100 END FROM n`,
        size,
        randomUUID(),
        from,
      ).toArray()
      sql.exec(
        "UPDATE entity_heads SET version = 2, state = 'purged', revision = (SELECT revision FROM sync_state WHERE id = 1) WHERE entity = 'import_review' AND entity_id BETWEEN printf('c1900000-0000-4000-8000-%012d', ? + 1) AND printf('c1900000-0000-4000-8000-%012d', ? + ?)",
        from,
        from,
        size,
      ).toArray()
    }
  })
  // The alarm's prune checks every receipt once (on the real files it also empties attachment_checks).
  await runInDurableObject(vaultOf(user), (_vault, state) => pruneAttachments(ctx(state)))
}

const N = 200
async function timed(user: TestUser, f: (vault: UserVault, state: DurableObjectState) => void): Promise<number> {
  const runs: number[] = []
  for (let r = 0; r < 5; r += 1) {
    const start = Date.now()
    await runInDurableObject(vaultOf(user), (vault: UserVault, state) => {
      for (let i = 0; i < N; i += 1) f(vault, state)
    })
    runs.push((Date.now() - start) / N)
  }
  return runs.sort((a, b) => a - b)[2]
}

describe('m4 before and after', () => {
  for (const [receipts, purged] of [
    [5_000, 3_000],
    [20_000, 30_000],
  ]) {
    it(`the per-write due-time reads at 30,000 records, ${receipts} held receipts and ${purged} purged import heads`, async () => {
      const v1 = await startV1(undefined, { startWork: 'manual' })
      const money = moneyFixtures(v1)
      const user = await money.member()
      const wallet = await money.wallet(user, { opening_minor: '0', tracking_start: '2026-01-01' })
      await seed(user, wallet, builtinId(user, 'food'), receipts, purged)
      const counts = await vaultRows(user, "SELECT (SELECT count(*) FROM transactions) AS records, (SELECT count(*) FROM transactions WHERE deleted_at IS NOT NULL) AS deleted, (SELECT count(*) FROM transaction_attachments) AS held, (SELECT count(*) FROM entity_heads WHERE entity = 'import_review' AND state = 'purged') AS purgedImportHeads")
      const rows = await runInDurableObject(vaultOf(user), (_vault, state) => {
        const cursors: SqlStorageCursor<Record<string, SqlStorageValue>>[] = []
        const sql = { exec: (query: string, ...b: unknown[]) => { const cursor = state.storage.sql.exec(query, ...b); cursors.push(cursor); return cursor } } as unknown as SqlStorage
        const c: FileContext = { sql, storage: state.storage, now: new Date(), vaultId: state.id.toString() }
        const total = () => cursors.splice(0).reduce((sum, cursor) => sum + cursor.rowsRead, 0)
        attachmentsDueAt(c)
        const attachments = total()
        importsDueAt(c)
        return { attachmentsDueAt: attachments, importsDueAt: total() }
      })
      const ms = {
        attachmentsDueAt: await timed(user, (_v, s) => attachmentsDueAt(ctx(s))),
        importsDueAt: await timed(user, (_v, s) => importsDueAt(ctx(s))),
        fileJobsDue: await timed(user, (v, s) => fileJobsDue(ctx(s), v.lastStartAttemptMs)),
        nextDue: await timed(user, (_v, s) => nextDue(ctx(s))),
        rescheduleBlock: await timed(user, (v, s) => s.storage.transactionSync(() => reschedule(ctx(s), v.lastStartAttemptMs))),
      }
      console.log(`measure ${receipts}/${purged}: ${JSON.stringify({ counts, rowsRead: rows, msPerCall: ms })}`)
      expect(counts[0]).toMatchObject({ records: 30_000, deleted: 3_000, held: receipts, purgedImportHeads: purged })
    }, 600_000)
  }
})

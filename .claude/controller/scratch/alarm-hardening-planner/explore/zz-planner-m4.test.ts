// Planner measurement for alarm-hardening m4 (scratch only, never committed): the cost of the file due-time reads
// that run after every write, at the 1B-T11 review's sizes, for the current SQL and the candidate rewrites.
import { runInDurableObject } from 'cloudflare:test'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { attachmentsDueAt } from '../../src/vault/files/attachments'
import type { FileContext } from '../../src/vault/files/context'
import { fileJobsDue } from '../../src/vault/files/jobs'
import { importsDueAt } from '../../src/vault/files/previews'
import { nextDue, reschedule } from '../../src/vault/retention'
import type { UserVault } from '../../src/vault/user-vault'
import { vaultExec, vaultRows } from './support/files'
import { builtinId, moneyFixtures } from './support/money-fixtures'
import { startV1, vaultOf } from './support/v1-client'
import type { TestUser } from './support/v1-client'

const UNHELD = "status = 'retained' AND NOT EXISTS (SELECT 1 FROM transaction_attachments ta WHERE ta.attachment_id = attachments.id)"
const OBJECT_GONE = "NOT EXISTS (SELECT 1 FROM vault_objects o WHERE o.key = attachments.object_key AND o.status IN ('reserved', 'published'))"
const OLDEST = `(SELECT min(released_at) FROM attachments WHERE status = 'released' AND released_at IS NOT NULL AND ${OBJECT_GONE}) AS oldest`
const A1 = `SELECT EXISTS (SELECT 1 FROM attachments WHERE status = 'released' AND released_at IS NULL)
                OR EXISTS (SELECT 1 FROM attachments WHERE ${UNHELD}) AS waiting, ${OLDEST}`
const A4 = `SELECT EXISTS (SELECT 1 FROM attachments WHERE status = 'released' AND released_at IS NULL)
                OR EXISTS (SELECT 1 FROM planner_checks k CROSS JOIN attachments ON attachments.id = k.attachment_id WHERE ${UNHELD}) AS waiting, ${OLDEST}`
const RECORD = (join: string, where: string, sel: string) => `SELECT (SELECT min(expires_at) FROM import_previews WHERE status <> 'expired') AS preview,
       (SELECT min(expires_at) FROM import_selections) AS selection,
       (SELECT min(max(strftime('%Y-%m-%dT%H:%M:%fZ', g.committed_at, '+30 days'),
                       coalesce(CASE h.entity WHEN ${sel} THEN (SELECT s.expires_at FROM import_selections s WHERE s.selection_id = h.entity_id)
                                              ELSE (SELECT p.expires_at FROM import_previews p WHERE p.job_id = h.entity_id) END, '')))
          FROM entity_heads h
          ${join} entity_changes g ON g.revision = h.revision AND g.entity = h.entity AND g.entity_id = h.entity_id
         WHERE ${where}) AS record`
const LIVE = "h.entity IN ('import_selection', 'import_review') AND h.state <> 'purged'"
const I0 = RECORD('JOIN', "h.entity IN (?1, ?2) AND h.state <> 'purged'", '?1')
const I1 = RECORD('JOIN', LIVE, "'import_selection'")
const I3 = RECORD('CROSS JOIN', LIVE, "'import_selection'")

const ctx = (state: DurableObjectState): FileContext => ({ sql: state.storage.sql, storage: state.storage, now: new Date(), vaultId: state.id.toString() })
const plan = (state: DurableObjectState, query: string, ...b: unknown[]) =>
  state.storage.sql
    .exec<{ detail: string }>(`EXPLAIN QUERY PLAN ${query}`, ...b)
    .toArray()
    .map((r) => r.detail)
    .filter((d) => /SCAN|SEARCH/.test(d))
const one = (state: DurableObjectState, query: string, ...b: unknown[]) => state.storage.sql.exec<Record<string, SqlStorageValue>>(query, ...b).one()

async function seed(user: TestUser, wallet: string, food: string, receipts: number, purgedHeads: number, liveHeads: number): Promise<void> {
  await runInDurableObject(vaultOf(user), (_vault, state) => {
    const sql = state.storage.sql
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
    // Each receipt held by one record (the review's probe used every sixth record; a held receipt is what costs).
    sql.exec(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
       INSERT INTO transaction_attachments (transaction_id, attachment_id, attached_at)
       SELECT printf('01900000-0000-4000-8000-%012d', CASE WHEN ? <= 5000 THEN i * 6 - 1 ELSE i END), printf('a1900000-0000-4000-8000-%012d', i), 'x' FROM n`,
      receipts,
      receipts,
    ).toArray()
    sql.exec('UPDATE sync_state SET revision = revision + 1 WHERE id = 1').toArray()
    sql.exec(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
       INSERT INTO entity_heads (entity, entity_id, version, state, revision)
       SELECT 'import_review', printf('c1900000-0000-4000-8000-%012d', i), 1, 'active', (SELECT revision FROM sync_state WHERE id = 1) FROM n`,
      purgedHeads,
    ).toArray()
    // Purged in groups of 1,000, each its own revision (a change group holds at most 10,000 changes).
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
    // A few live import records (reviews and selections), changed recently, so the record term has an answer.
    for (let i = 0; i < liveHeads; i += 1) {
      sql.exec('UPDATE sync_state SET revision = revision + 1 WHERE id = 1').toArray()
      const { revision } = sql.exec<{ revision: number }>('SELECT revision FROM sync_state WHERE id = 1').one()
      const entity = i % 2 === 0 ? 'import_review' : 'import_selection'
      const id = randomUUID()
      const at = new Date(Date.now() - (liveHeads - i) * 60_000).toISOString()
      sql.exec("INSERT INTO entity_changes (revision, ordinal, command_id, entity, entity_id, version, state, snapshot, committed_at, group_bytes) VALUES (?, 0, ?, ?, ?, 1, 'active', '{}', ?, 10)", revision, randomUUID(), entity, id, at).toArray()
      sql.exec("INSERT INTO entity_heads (entity, entity_id, version, state, revision) VALUES (?, ?, 1, 'active', ?)", entity, id, revision).toArray()
    }
  })
}

const N = 200
async function timed(user: TestUser, f: (vault: UserVault, state: DurableObjectState) => void): Promise<number> {
  const runs: number[] = []
  for (let r = 0; r < 3; r += 1) {
    const start = Date.now()
    await runInDurableObject(vaultOf(user), (vault: UserVault, state) => {
      for (let i = 0; i < N; i += 1) f(vault, state)
    })
    runs.push((Date.now() - start) / N)
  }
  return runs.sort((a, b) => a - b)[1]
}

describe('m4 measurement', () => {
  for (const [receipts, purged] of [
    [5_000, 3_000],
    [20_000, 30_000],
  ]) {
    it(`due-time reads at 30,000 records, ${receipts} held receipts and ${purged} purged import heads`, async () => {
      const v1 = await startV1(undefined, { startWork: 'manual' })
      const money = moneyFixtures(v1)
      const user = await money.member()
      const wallet = await money.wallet(user, { opening_minor: '0', tracking_start: '2026-01-01' })
      await seed(user, wallet, builtinId(user, 'food'), receipts, purged, 40)
      const out: Record<string, unknown> = {}
      out.counts = await vaultRows(user, "SELECT (SELECT count(*) FROM transactions) AS records, (SELECT count(*) FROM attachments) AS receipts, (SELECT count(*) FROM transaction_attachments) AS held, (SELECT count(*) FROM entity_heads WHERE entity LIKE 'import%') AS importHeads, (SELECT count(*) FROM entity_heads WHERE entity LIKE 'import%' AND state <> 'purged') AS liveImportHeads")
      const ms: Record<string, number> = {}
      ms.nextDue = await timed(user, (_v, s) => nextDue(ctx(s)))
      ms.A0_attachmentsDueAt = await timed(user, (_v, s) => attachmentsDueAt(ctx(s)))
      ms.I0_importsDueAt = await timed(user, (_v, s) => importsDueAt(ctx(s)))
      ms.fileJobsDue_base = await timed(user, (v, s) => fileJobsDue(ctx(s), v.lastStartAttemptMs))
      ms.reschedule_base = await timed(user, (v, s) => s.storage.transactionSync(() => reschedule(ctx(s), v.lastStartAttemptMs)))
      ms.A1_split = await timed(user, (_v, s) => one(s, A1))
      const answers: Record<string, unknown> = {}
      const plans: Record<string, unknown> = {}
      await vaultExec(user, 'CREATE TABLE planner_checks (attachment_id TEXT PRIMARY KEY NOT NULL) STRICT')
      ms.A4_checks_empty = await timed(user, (_v, s) => one(s, A4))
      await vaultExec(user, "INSERT INTO planner_checks SELECT id FROM attachments ORDER BY id LIMIT 10")
      ms.A4_checks_10 = await timed(user, (_v, s) => one(s, A4))
      await runInDurableObject(vaultOf(user), (_v, state) => {
        answers.A0 = attachmentsDueAt(ctx(state))
        answers.A1 = one(state, A1)
        answers.A4 = one(state, A4)
        answers.I0 = importsDueAt(ctx(state))
        answers.I0sql = one(state, I0, 'import_selection', 'import_review')
        plans.A1 = plan(state, A1)
        plans.A4 = plan(state, A4)
        plans.I0 = plan(state, I0, 'import_selection', 'import_review')
      })
      const before = await runInDurableObject(vaultOf(user), (_v, state) => state.storage.sql.databaseSize)
      await vaultExec(user, "CREATE INDEX planner_import_heads_idx ON entity_heads (entity, entity_id) WHERE entity IN ('import_selection', 'import_review') AND state <> 'purged'")
      const after = await runInDurableObject(vaultOf(user), (_v, state) => state.storage.sql.databaseSize)
      ms.I1_literal_join_idx = await timed(user, (_v, s) => one(s, I1))
      ms.I3_literal_crossjoin_idx = await timed(user, (_v, s) => one(s, I3))
      await runInDurableObject(vaultOf(user), (_v, state) => {
        answers.I1 = one(state, I1)
        answers.I3 = one(state, I3)
        plans.I1 = plan(state, I1)
        plans.I3 = plan(state, I3)
      })
      out.indexBytes = after - before
      out.ms = ms
      out.answers = answers
      out.plans = plans
      console.log(`m4 measure ${receipts}/${purged}: ${JSON.stringify(out)}`)
      expect(answers.A1).toEqual({ waiting: 0, oldest: null })
      expect(answers.A4).toEqual({ waiting: 0, oldest: null })
      expect(answers.I3).toEqual(answers.I0sql)
    }, 300_000)
  }
})

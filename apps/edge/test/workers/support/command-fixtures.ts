// The command protocol's test domain for the vault: a fixture business table in
// the vault's own SQLite, shaped like the API's fixture domain
// (apps/api/src/testing/command-fixtures.ts) without its PostgreSQL row-level
// security. Each call runs runCommand inside one transactionSync, as
// UserVault#call does, so a failure rolls the whole call back. A failure reaches
// the test as an Error with `status` and `code`, the way the HTTP client shows it.
import { runInDurableObject } from 'cloudflare:test'
import { randomUUID } from 'node:crypto'

import { CommandDigester } from '@api/commands/command-digest'
import type { DigestKey } from '@api/commands/command-digest'
import { CommandRegistry } from '@api/commands/command-registry'
import { ProblemException } from '@api/common/api-problem.filter'
import type { CommandAck } from '@gogospend/contracts'

import { requireLiveEntity } from '../../../src/vault/commands/entity-state'
import { runCommand } from '../../../src/vault/commands/executor'
import type { VaultMutation } from '../../../src/vault/commands/executor'
import type { VaultContext } from '../../../src/vault/context'
import { ensureAccount } from '../../../src/vault/session'
import { TEST_POLICIES, vaultOf } from './v1-client'
import type { TestUser } from './v1-client'

export const FIXTURE_ENTITY = 'fixture_purchase'
export type FixturePurchase = { id: string; amount_minor: string; note: string | null }

/** The same synthetic secret as the API's TEST_DIGEST_KEY, and a rotated one. */
export const TEST_DIGEST_KEY: DigestKey = { id: 'test1', secret: Buffer.from('synthetic-command-digest-key-0123456789abcdef', 'utf8') }
export const ROTATED_DIGEST_KEY: DigestKey = { id: 'test2', secret: Buffer.from('synthetic-command-digest-key-rotated-0123456789', 'utf8') }

const FIXTURE_DDL = `CREATE TABLE IF NOT EXISTS fixture_purchases (
  id TEXT PRIMARY KEY,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  note TEXT,
  version INTEGER NOT NULL CHECK (version >= 1),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
) STRICT`

export const purchase = (overrides: Partial<FixturePurchase> = {}): FixturePurchase => ({ id: randomUUID(), amount_minor: '6500', note: 'coffee', ...overrides })

function isFixtureSnapshot(value: unknown): boolean {
  const snapshot = value as Partial<FixturePurchase> | null
  return (
    typeof snapshot === 'object' &&
    snapshot !== null &&
    Object.keys(snapshot).sort().join(',') === 'amount_minor,id,note' &&
    typeof snapshot.id === 'string' &&
    typeof snapshot.amount_minor === 'string' &&
    (snapshot.note === null || typeof snapshot.note === 'string')
  )
}

/** The fixture entity and its commands, with the given create schema versions. */
export function fixtureRegistry(createSchemas: readonly number[] = [1, 2]): CommandRegistry {
  const registry = new CommandRegistry()
  registry.defineEntity({ entity: FIXTURE_ENTITY, validate: isFixtureSnapshot })
  registry.defineCommand({ kind: 'fixture.purchase.create', entity: FIXTURE_ENTITY, outcome: 'created', schemaVersions: createSchemas, policy: 'current' })
  registry.defineCommand({ kind: 'fixture.purchase.delete', entity: FIXTURE_ENTITY, outcome: 'deleted', schemaVersions: [1], policy: 'current' })
  registry.defineCommand({ kind: 'fixture.export', entity: FIXTURE_ENTITY, outcome: 'accepted', schemaVersions: [1], policy: 'exempt' })
  return registry
}

export type FixtureScope = { registry?: CommandRegistry; digester?: CommandDigester }

type Failure = { ok: false; status?: number; code?: string; message: string }

function failureOf(error: unknown): Failure {
  if (error instanceof ProblemException) return { ok: false, status: error.getStatus(), code: error.code, message: error.message }
  return { ok: false, message: error instanceof Error ? error.message : String(error) }
}

/**
 * Runs `run` with this person's vault context, inside one transactionSync after
 * the account rows exist (UserVault#call's order). A failure is thrown as an
 * Error carrying the problem's status and code, after the block rolled back.
 */
export async function inVault<T>(user: TestUser, run: (c: VaultContext) => T, scope: FixtureScope = {}): Promise<T> {
  const outcome = await runInDurableObject(vaultOf(user), (vault, state) => {
    state.storage.sql.exec(FIXTURE_DDL).toArray()
    try {
      const value = state.storage.transactionSync(() => {
        const c: VaultContext = {
          db: vault.db,
          sql: state.storage.sql,
          storage: state.storage,
          registry: scope.registry ?? fixtureRegistry(),
          digester: scope.digester ?? new CommandDigester(TEST_DIGEST_KEY),
          claims: { accountId: user.sub, sessionId: user.sid, issuedAt: Math.floor(Date.now() / 1000), clientId: 'ios/1.0.0' },
          policies: TEST_POLICIES,
          now: new Date(),
        }
        ensureAccount(c)
        return run(c)
      })
      return { ok: true as const, value }
    } catch (error) {
      return failureOf(error)
    }
  })
  if (!outcome.ok) throw Object.assign(new Error(outcome.message), { status: outcome.status, code: outcome.code })
  return outcome.value as T
}

export type CreateOptions = {
  commandId?: string
  schemaVersion?: number
  /** Runs inside the mutation, before the write. */
  during?: (c: VaultContext) => void
  /** Overrides the returned mutation result (to test the change writer's checks). */
  result?: (purchase: FixturePurchase) => VaultMutation
}

/** Fixture commands for one person, counting mutation executions. */
export function fixtureCommands(user: TestUser, scope: FixtureScope = {}) {
  const registry = scope.registry ?? fixtureRegistry()
  const digester = scope.digester ?? new CommandDigester(TEST_DIGEST_KEY)
  const counter = { executions: 0 }

  function create(p: FixturePurchase, options: CreateOptions = {}): Promise<CommandAck> {
    return inVault(
      user,
      (c) =>
        runCommand(c, { commandId: options.commandId ?? randomUUID(), kind: 'fixture.purchase.create', schemaVersion: options.schemaVersion ?? 1, payload: p }, () => {
          counter.executions += 1
          options.during?.(c)
          c.sql.exec('INSERT INTO fixture_purchases (id, amount_minor, note, version) VALUES (?, ?, ?, 1)', p.id, p.amount_minor, p.note).toArray()
          if (options.result) return options.result(p)
          return { entityId: p.id, version: 1, changes: [{ entity: FIXTURE_ENTITY, id: p.id, version: 1, state: 'active', snapshot: p }] }
        }),
      { registry, digester },
    )
  }

  function remove(id: string, expectedVersion: number, commandId: string = randomUUID()): Promise<CommandAck> {
    return inVault(
      user,
      (c) =>
        runCommand(c, { commandId, kind: 'fixture.purchase.delete', schemaVersion: 1, payload: { id }, expectedVersion }, () => {
          counter.executions += 1
          const head = requireLiveEntity(c, FIXTURE_ENTITY, id)
          if (head.version !== expectedVersion) throw new ProblemException(409, 'VERSION_CONFLICT')
          c.sql.exec('UPDATE fixture_purchases SET deleted = 1, version = version + 1 WHERE id = ?', id).toArray()
          const [row] = c.sql
            .exec<{ amount_minor: string; note: string | null; version: number }>('SELECT CAST(amount_minor AS TEXT) AS amount_minor, note, version FROM fixture_purchases WHERE id = ?', id)
            .toArray()
          return { entityId: id, version: row.version, changes: [{ entity: FIXTURE_ENTITY, id, version: row.version, state: 'deleted', snapshot: { id, amount_minor: row.amount_minor, note: row.note } }] }
        }),
      { registry, digester },
    )
  }

  return { counter, create, remove }
}

/** Reads rows of this person's vault. Integers come back as numbers, so read money as CAST(... AS TEXT). */
export function sqlRows<T = Record<string, unknown>>(user: TestUser, query: string, ...args: unknown[]): Promise<T[]> {
  return runInDurableObject(vaultOf(user), (_vault, state) => state.storage.sql.exec(query, ...args).toArray() as unknown as T[])
}

/** Runs one statement in this person's vault, outside any command. */
export async function sqlExec(user: TestUser, query: string, ...args: unknown[]): Promise<void> {
  await runInDurableObject(vaultOf(user), (_vault, state) => {
    state.storage.sql.exec(query, ...args).toArray()
  })
}

export async function countRows(user: TestUser, table: string): Promise<number> {
  return (await sqlRows<{ n: number }>(user, `SELECT count(*) AS n FROM ${table}`))[0].n
}

/** The account's revision as decimal text, as the vault stores it. */
export async function revisionOf(user: TestUser): Promise<string> {
  const [row] = await sqlRows<{ revision: string }>(user, 'SELECT CAST(revision AS TEXT) AS revision FROM sync_state WHERE id = 1')
  return row.revision
}

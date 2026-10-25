// The command protocol in the vault. Ported by name and assertion from
// apps/api/src/commands/command-executor.integration.spec.ts,
// command-hardening.integration.spec.ts and command-status.integration.spec.ts,
// and from the command cases of test/dispatch.db.test.ts. Where the vault's shape
// differs (no account column, JSON text for snapshots and metadata), the
// assertion keeps the API's meaning. Not ported, as not applicable to the vault:
// PostgreSQL roles and grants, row-level security, the REPEATABLE READ replay, the
// refusal of a nested owner transaction (a PostgreSQL connection guard), and the
// lock-wait races: a status lookup, a deletion or a logout queued behind a command,
// and the commit order of two commands queued on the account lock. A vault call is
// one synchronous transaction, so nothing waits between steps. The sequential forms
// of those races are ported: 'an account marked for deletion ...', 'a command after
// a global logout ...' and 'twenty writes at once ...' (the commit order).
import { createHash, randomUUID } from 'node:crypto'

import { evictAllDurableObjects } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import { CommandDigester, canonicalCommandText } from '@api/commands/command-digest'
import { changeGroupBytes } from '@api/sync/change-writer'
import { MAX_CHANGE_GROUP_BYTES } from '@gogospend/contracts'
import type { EntityChange } from '@gogospend/contracts'

import { appendChanges } from '../../src/vault/commands/change-log'
import { requireLiveEntity } from '../../src/vault/commands/entity-state'
import { runCommand } from '../../src/vault/commands/executor'
import { BASE, TEST_POLICIES, member, newUser, signedHeaders, startV1 } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'
import { FIXTURE_ENTITY, ROTATED_DIGEST_KEY, TEST_DIGEST_KEY, countRows, fixtureCommands, fixtureRegistry, inVault, purchase, revisionOf, sqlExec, sqlRows } from './support/command-fixtures'

let client: V1Client

beforeEach(async () => {
  client = await startV1()
})

const wallet = (overrides: Record<string, unknown> = {}) => ({ id: randomUUID(), name: 'Cash', opening_minor: '403200', tracking_start: '2026-01-01', ...overrides })

/** A failed call as 'STATUS CODE' and a committed one as 'ok' (the API's `code` helper). */
async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
    return 'ok'
  } catch (error) {
    const failure = error as { status?: number; code?: string }
    return failure.status === undefined ? 'error' : `${failure.status} ${failure.code}`
  }
}

/** The message of a refusal the API raises as a plain error (not a problem), or 'ok'. */
async function messageOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
    return 'ok'
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

const live = (user: TestUser, id: string) => inVault(user, (c) => requireLiveEntity(c, FIXTURE_ENTITY, id))

describe('idempotent commands', () => {
  it('same_command_executes_once_after_lost_response', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    const commandId = randomUUID()
    const coffee = purchase()
    const firstAck = await commands.create(coffee, { commandId })
    // The response was lost; the client resends the same immutable command.
    const secondAck = await commands.create(coffee, { commandId })
    expect(commands.counter.executions).toBe(1)
    expect(secondAck).toEqual(firstAck)
    expect(firstAck).toEqual({ command_id: commandId, entity_id: coffee.id, version: 1, committed_revision: '1', outcome: 'created', entity_state: 'active' })
  })

  it('concurrent requests with one key run the mutation once and all get the same acknowledgement', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    const commandId = randomUUID()
    const coffee = purchase()
    const acks = await Promise.all(Array.from({ length: 5 }, () => commands.create(coffee, { commandId })))
    expect(commands.counter.executions).toBe(1)
    expect(new Set(acks.map((ack) => JSON.stringify(ack))).size).toBe(1)
    expect(await countRows(user, 'fixture_purchases')).toBe(1)
    expect(await revisionOf(user)).toBe('1')
  })

  it('the same key with a changed payload is IDEMPOTENCY_MISMATCH and writes nothing', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    const commandId = randomUUID()
    const coffee = purchase()
    await commands.create(coffee, { commandId })
    expect(await codeOf(() => commands.create({ ...coffee, amount_minor: '6600' }, { commandId }))).toBe('409 IDEMPOTENCY_MISMATCH')
    expect(commands.counter.executions).toBe(1)
    expect(await revisionOf(user)).toBe('1')
  })

  it('two identical purchases with different keys are both kept', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    const first = await commands.create(purchase({ note: 'coffee' }))
    const second = await commands.create(purchase({ note: 'coffee' }))
    expect([first.committed_revision, second.committed_revision]).toEqual(['1', '2'])
    expect(await countRows(user, 'fixture_purchases')).toBe(2)
  })

  it('a failed mutation rolls back its writes, receipt and revision together, and the key stays usable', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    const commandId = randomUUID()
    const coffee = purchase()
    await expect(
      commands.create(coffee, {
        commandId,
        result: () => {
          throw new Error('domain failure')
        },
      }),
    ).rejects.toThrow('domain failure')
    expect(await countRows(user, 'fixture_purchases')).toBe(0)
    expect(await countRows(user, 'command_receipts')).toBe(0)
    expect(await countRows(user, 'entity_changes')).toBe(0)
    expect(await revisionOf(user)).toBe('0')
    expect((await commands.create(coffee, { commandId })).committed_revision).toBe('1')
  })

  it('receipts and audit rows hold no amounts, notes or DTOs', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    await commands.create(purchase({ amount_minor: '98765432', note: 'secret-note-text' }))
    const [receipt] = await sqlRows(user, 'SELECT * FROM command_receipts')
    const [audit] = await sqlRows(user, 'SELECT * FROM audit_events')
    for (const row of [receipt, audit]) expect(JSON.stringify(row)).not.toMatch(/98765432|secret-note-text|amount|note/)
    expect(Object.keys(receipt).sort()).toEqual(['command_id', 'committed_at', 'digest_key_id', 'entity', 'entity_id', 'entity_state', 'entity_version', 'kind', 'outcome', 'request_digest', 'revision', 'schema_version'])
    expect(audit).toMatchObject({ kind: 'fixture.purchase.create', session_id: user.sid, client_id: 'ios/1.0.0', metadata: '{}' })
  })
})

describe('command schema versions', () => {
  it.each([[0], [3]])('schema version %i with no receipt is 422 COMMAND_SCHEMA_UNSUPPORTED and reserves nothing', async (schemaVersion) => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    const commandId = randomUUID()
    expect(await codeOf(() => commands.create(purchase(), { commandId, schemaVersion }))).toBe('422 COMMAND_SCHEMA_UNSUPPORTED')
    expect(commands.counter.executions).toBe(0)
    expect(await countRows(user, 'command_receipts')).toBe(0)
    expect(await revisionOf(user)).toBe('0')
  })

  it('a committed command replays its original acknowledgement after its schema version is withdrawn', async () => {
    const user = await member(client)
    const commandId = randomUUID()
    const coffee = purchase()
    const original = await fixtureCommands(user).create(coffee, { commandId, schemaVersion: 2 })
    const later = fixtureCommands(user, { registry: fixtureRegistry([1]) })
    expect(await later.create(coffee, { commandId, schemaVersion: 2 })).toEqual(original)
    expect(later.counter.executions).toBe(0)
  })

  it('the same key with a different schema version is IDEMPOTENCY_MISMATCH', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    const commandId = randomUUID()
    const coffee = purchase()
    await commands.create(coffee, { commandId, schemaVersion: 1 })
    expect(await codeOf(() => commands.create(coffee, { commandId, schemaVersion: 2 }))).toBe('409 IDEMPOTENCY_MISMATCH')
  })
})

describe('authorization under the account lock', () => {
  it('writes need the current required policies, checked under the lock', async () => {
    const user = newUser()
    const commands = fixtureCommands(user)
    expect(await codeOf(() => commands.create(purchase()))).toBe('403 POLICY_ACCEPTANCE_REQUIRED')
    expect(commands.counter.executions).toBe(0)
  })

  it('a replay still needs a currently valid session', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    const commandId = randomUUID()
    const coffee = purchase()
    await commands.create(coffee, { commandId })
    expect((await client.as(user).post('/v1/me/logout')).status).toBe(204)
    expect(await codeOf(() => commands.create(coffee, { commandId }))).toBe('401 SESSION_REQUIRED')
  })

  // The API's form waits on the account lock while a deletion commits. The vault
  // has no lock to wait on, so this ports the re-check that form protects: a
  // command after the account is marked deleting is refused and writes nothing.
  it('an account marked for deletion refuses a command at the re-check and writes nothing', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    await sqlExec(user, "UPDATE account_state SET status = 'deleting' WHERE id = 1")
    expect(await codeOf(() => commands.create(purchase()))).toBe('403 ACCOUNT_UNAVAILABLE')
    expect(commands.counter.executions).toBe(0)
    expect(await countRows(user, 'command_receipts')).toBe(0)
  })
})

describe('the change group', () => {
  it('commits one group per command under one revision, with entity heads moving forward', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    const coffee = purchase()
    const created = await commands.create(coffee)
    const deleted = await commands.remove(coffee.id, 1)
    expect(deleted).toMatchObject({ entity_id: coffee.id, version: 2, committed_revision: '2', outcome: 'deleted', entity_state: 'deleted' })
    const changes = await sqlRows<Record<string, unknown>>(user, 'SELECT CAST(revision AS TEXT) AS revision, ordinal, entity, entity_id, version, state, snapshot FROM entity_changes ORDER BY revision, ordinal')
    expect(changes.map((row) => ({ ...row, snapshot: JSON.parse(String(row.snapshot)) }))).toEqual([
      { revision: created.committed_revision, ordinal: 0, entity: FIXTURE_ENTITY, entity_id: coffee.id, version: 1, state: 'active', snapshot: coffee },
      { revision: '2', ordinal: 0, entity: FIXTURE_ENTITY, entity_id: coffee.id, version: 2, state: 'deleted', snapshot: coffee },
    ])
    expect(await sqlRows(user, 'SELECT version, state, CAST(revision AS TEXT) AS revision FROM entity_heads')).toEqual([{ version: 2, state: 'deleted', revision: '2' }])
  })

  it('a group above 1 MiB is COMMAND_TOO_LARGE before commit and leaves nothing behind', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    const big = 'x'.repeat(MAX_CHANGE_GROUP_BYTES)
    expect(
      await codeOf(() =>
        commands.create(purchase(), {
          result: (p) => ({ entityId: p.id, version: 1, changes: [{ entity: FIXTURE_ENTITY, id: p.id, version: 1, state: 'active', snapshot: { ...p, note: big } }] }),
        }),
      ),
    ).toBe('413 COMMAND_TOO_LARGE')
    expect(await countRows(user, 'fixture_purchases')).toBe(0)
    expect(await revisionOf(user)).toBe('0')
  })

  it('a snapshot that does not match its entity DTO is refused and rolled back', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    await expect(
      commands.create(purchase(), {
        result: (p) => ({ entityId: p.id, version: 1, changes: [{ entity: FIXTURE_ENTITY, id: p.id, version: 1, state: 'active', snapshot: { ...p, owner_id: user.sub } }] }),
      }),
    ).rejects.toThrow(/does not match its entity's persisted DTO/)
    expect(await countRows(user, 'fixture_purchases')).toBe(0)
    expect(await countRows(user, 'command_receipts')).toBe(0)
  })

  it('an entity version that does not move forward is refused and rolled back', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    const coffee = purchase()
    await commands.create(coffee)
    // The payload names the existing entity. The mutation writes nothing (a second
    // fixture insert would hit the table's primary key first), so the head guard in
    // appendChanges is what refuses the group.
    const stale = { entityId: coffee.id, version: 1, changes: [{ entity: FIXTURE_ENTITY, id: coffee.id, version: 1, state: 'active' as const, snapshot: { ...coffee } }] }
    await expect(inVault(user, (c) => runCommand(c, { commandId: randomUUID(), kind: 'fixture.purchase.create', schemaVersion: 1, payload: coffee }, () => stale))).rejects.toThrow(/did not move forward/)
    expect(await revisionOf(user)).toBe('1')
    expect(await countRows(user, 'fixture_purchases')).toBe(1)
  })

  it('an acknowledgement must describe a change in its own group', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    await expect(commands.create(purchase(), { result: (p) => ({ entityId: p.id, version: 1, changes: [] }) })).rejects.toThrow(/acknowledged an entity version its change group does not contain/)
    expect(await revisionOf(user)).toBe('0')
  })

  it('a change group holds 1 to 10,000 changes', async () => {
    const user = await member(client)
    const change = { entity: FIXTURE_ENTITY, id: randomUUID(), version: 1, state: 'purged' as const, snapshot: null }
    for (const group of [[], Array.from({ length: 10_001 }, () => change)]) {
      expect(await messageOf(() => inVault(user, (c) => appendChanges(c, randomUUID(), group), { registry: fixtureRegistry() }))).toMatch(/commits 1-10000 changes/)
    }
    expect(await revisionOf(user)).toBe('0')
  })
})

describe('command identity', () => {
  it('an acknowledgement must name the entity its payload targets', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    const other = purchase()
    const refusal = await messageOf(() =>
      commands.create(purchase(), { result: () => ({ entityId: other.id, version: 1, changes: [{ entity: FIXTURE_ENTITY, id: other.id, version: 1, state: 'active', snapshot: other }] }) }),
    )
    expect(refusal).toMatch(/acknowledged an entity other than its target/)
    expect(await revisionOf(user)).toBe('0')
  })

  it('a payload that does not name its target entity is refused before any mutation', async () => {
    const user = await member(client)
    let ran = false
    const refusal = await messageOf(() =>
      inVault(
        user,
        (c) =>
          runCommand(c, { commandId: randomUUID(), kind: 'fixture.export', schemaVersion: 1, payload: { scope: 'all' } }, () => {
            ran = true
            throw new Error('should not run')
          }),
        { registry: fixtureRegistry() },
      ),
    )
    expect(refusal).toMatch(/must name their target entity/)
    expect(ran).toBe(false)
  })

  it('the same key for a different command kind is IDEMPOTENCY_MISMATCH', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    const coffee = purchase()
    const commandId = randomUUID()
    await commands.create(coffee, { commandId })
    expect(await codeOf(() => commands.remove(coffee.id, 1, commandId))).toBe('409 IDEMPOTENCY_MISMATCH')
  })

  it('exempt kinds run while required policies are pending', async () => {
    const pending = newUser()
    const id = randomUUID()
    const ack = await inVault(
      pending,
      (c) =>
        runCommand(c, { commandId: randomUUID(), kind: 'fixture.export', schemaVersion: 1, payload: { id } }, () => ({
          entityId: id,
          version: 1,
          changes: [{ entity: FIXTURE_ENTITY, id, version: 1, state: 'active', snapshot: { id, amount_minor: '1', note: null } }],
        })),
      { registry: fixtureRegistry() },
    )
    expect(ack.outcome).toBe('accepted')
  })
})

describe('receipt digests', () => {
  it('are keyed: the receipt row alone cannot confirm a guessed payload', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    const coffee = purchase({ amount_minor: '48250' })
    const ack = await commands.create(coffee)
    const [receipt] = await sqlRows<{ request_digest: ArrayBuffer; digest_key_id: string }>(user, 'SELECT request_digest, digest_key_id FROM command_receipts')
    const text = canonicalCommandText(user.sub, { commandId: ack.command_id, kind: 'fixture.purchase.create', schemaVersion: 1, payload: coffee }) as string
    expect(receipt.digest_key_id).toBe(TEST_DIGEST_KEY.id)
    expect(Buffer.from(receipt.request_digest).equals(createHash('sha256').update(text).digest())).toBe(false)
  })

  it('a replay still verifies after key rotation while the old key is kept, and not once it is dropped', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    const coffee = purchase()
    const commandId = randomUUID()
    const original = await commands.create(coffee, { commandId })
    const rotated = fixtureCommands(user, { digester: new CommandDigester(ROTATED_DIGEST_KEY, [TEST_DIGEST_KEY]) })
    expect(await rotated.create(coffee, { commandId })).toEqual(original)
    expect(rotated.counter.executions).toBe(0)
    const dropped = fixtureCommands(user, { digester: new CommandDigester(ROTATED_DIGEST_KEY) })
    expect(await codeOf(() => dropped.create(coffee, { commandId }))).toBe('409 IDEMPOTENCY_MISMATCH')
  })
})

// The app role's grants on audit rows and receipts (PostgreSQL) have no vault counterpart: the vault has no roles, and its SQL runs only inside the Durable Object.
describe('database guards on the change log', () => {
  it('an entity head can neither move backwards nor leave purged', async () => {
    const user = await member(client)
    const coffee = purchase()
    await fixtureCommands(user).create(coffee)
    await expect(sqlExec(user, "UPDATE entity_heads SET version = 1, state = 'deleted' WHERE entity_id = ?", coffee.id)).rejects.toThrow(/move forward/)
    await sqlExec(user, "UPDATE entity_heads SET state = 'purged', version = 2 WHERE entity_id = ?", coffee.id)
    await expect(sqlExec(user, "UPDATE entity_heads SET version = 9, state = 'active' WHERE entity_id = ?", coffee.id)).rejects.toThrow(/move forward/)
  })

  it('a new head starts at version 1 and active', async () => {
    const user = await member(client)
    await fixtureCommands(user).create(purchase())
    await expect(sqlExec(user, "INSERT INTO entity_heads (entity, entity_id, version, state, revision) VALUES (?, ?, 77, 'active', 1)", FIXTURE_ENTITY, randomUUID())).rejects.toThrow(/starts at version 1/)
  })

  it('change, receipt and audit rows outside the current revision are refused, so a stray write cannot wedge the account', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    await commands.create(purchase())
    const now = new Date().toISOString()
    await expect(
      sqlExec(user, "INSERT INTO entity_changes (revision, ordinal, command_id, entity, entity_id, version, state, snapshot, committed_at) VALUES (2, 0, ?, ?, ?, 1, 'active', '{}', ?)", randomUUID(), FIXTURE_ENTITY, randomUUID(), now),
    ).rejects.toThrow(/current revision/)
    await expect(
      sqlExec(user, "INSERT INTO audit_events (revision, command_id, kind, session_id, client_id, created_at) VALUES (2, ?, 'fixture.purchase.create', ?, 'ios/1.0.0', ?)", randomUUID(), user.sid, now),
    ).rejects.toThrow(/current revision/)
    await expect(
      sqlExec(user, "INSERT INTO command_receipts (command_id, kind, schema_version, entity, entity_id, entity_version, outcome, entity_state, revision, committed_at) VALUES (?, 'fixture.purchase.create', 1, ?, ?, 1, 'created', 'active', 2, ?)", randomUUID(), FIXTURE_ENTITY, randomUUID(), now),
    ).rejects.toThrow(/current revision/)
    expect((await commands.create(purchase())).committed_revision).toBe('2')
  })
})

describe('change validation', () => {
  it("a snapshot's id must be its change's id", async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    const refusal = await messageOf(() => commands.create(purchase(), { result: (p) => ({ entityId: p.id, version: 1, changes: [{ entity: FIXTURE_ENTITY, id: p.id, version: 1, state: 'active', snapshot: purchase() }] }) }))
    expect(refusal).toMatch(/persisted DTO/)
    expect(await revisionOf(user)).toBe('0')
  })

  it('what is stored is what was validated: toJSON cannot smuggle fields in', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    const sneaky = (id: string) => Object.assign(Object.create({ toJSON: () => ({ id, amount_minor: '1', note: null, owner: 'x' }) }), { id, amount_minor: '6500', note: null })
    const refusal = await messageOf(() => commands.create(purchase(), { result: (p) => ({ entityId: p.id, version: 1, changes: [{ entity: FIXTURE_ENTITY, id: p.id, version: 1, state: 'active', snapshot: sneaky(p.id) }] }) }))
    expect(refusal).toMatch(/persisted DTO/)
    expect(await revisionOf(user)).toBe('0')
  })

  it('a group of exactly 1 MiB is accepted and one byte more is refused', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    const sized = (extra: number, id: string, commandId: string): EntityChange[] => {
      const base: EntityChange[] = [{ entity: FIXTURE_ENTITY, id, version: 1, state: 'active', snapshot: { id, amount_minor: '6500', note: '' } }]
      const note = 'x'.repeat(MAX_CHANGE_GROUP_BYTES - changeGroupBytes(commandId, base) + extra)
      return [{ entity: FIXTURE_ENTITY, id, version: 1, state: 'active', snapshot: { id, amount_minor: '6500', note } }]
    }
    const attempt = (extra: number) => {
      const commandId = randomUUID()
      return commands.create(purchase(), { commandId, result: (p) => ({ entityId: p.id, version: 1, changes: sized(extra, p.id, commandId) }) })
    }
    expect(await codeOf(() => attempt(1))).toBe('413 COMMAND_TOO_LARGE')
    expect(await codeOf(() => attempt(0))).toBe('ok')
  })
})

// The API's lock-wait cases are not ported (a status lookup waiting on an in-flight
// command, a replay under REPEATABLE READ, a command waiting behind a global
// logout). The vault runs each call as one synchronous transaction, so nothing
// waits between steps. The global-logout check is ported as a sequential case.
// The API's refusal of a nested owner transaction is not ported: it guards a
// PostgreSQL connection, and workerd nests transactionSync as a savepoint, so a
// nested block is not refused. runCommand never nests (ruling R21).
describe('concurrency', () => {
  it('a command after a global logout writes nothing', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    await sqlExec(user, 'UPDATE account_state SET not_before = ? WHERE id = 1', Math.floor(Date.now() / 1000) + 3600)
    expect(await codeOf(() => commands.create(purchase()))).toBe('401 SESSION_REQUIRED')
    expect(commands.counter.executions).toBe(0)
    expect(await countRows(user, 'command_receipts')).toBe(0)
  })
})

describe('POST /v1/commands/status', () => {
  it('reports unknown for never-committed commands and the original acknowledgement otherwise', async () => {
    const user = await member(client)
    const ack = await (await client.as(user).post('/v1/wallets', wallet())).json()
    const never = randomUUID()
    const res = await client.as(user).post('/v1/commands/status', { command_ids: [ack.command_id, never] })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ statuses: [{ command_id: ack.command_id, state: 'known', ack }, { command_id: never, state: 'unknown' }] })
  })

  it("another account's commands look exactly like unknown ones", async () => {
    const owner = await member(client)
    const other = await member(client)
    const ack = await (await client.as(owner).post('/v1/wallets', wallet())).json()
    const res = await client.as(other).post('/v1/commands/status', { command_ids: [ack.command_id] })
    expect(await res.json()).toEqual({ statuses: [{ command_id: ack.command_id, state: 'unknown' }] })
  })

  it('reports a since-deleted entity as deleted, keeping the original version', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    const coffee = purchase()
    const created = await commands.create(coffee)
    await commands.remove(coffee.id, 1)
    const res = await client.as(user).post('/v1/commands/status', { command_ids: [created.command_id] })
    expect((await res.json()).statuses[0]).toEqual({ command_id: created.command_id, state: 'known', ack: { ...created, entity_state: 'deleted' } })
  })

  it('reports a purged entity as purged without reconstructing any of its data', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    const created = await commands.create(purchase({ note: 'private-note' }))
    // A purge marks each head purged (the API's test does the same through SQL).
    await sqlExec(user, "UPDATE entity_heads SET state = 'purged', version = version + 1")
    const body = await (await client.as(user).post('/v1/commands/status', { command_ids: [created.command_id] })).json()
    expect(body.statuses[0].ack.entity_state).toBe('purged')
    expect(JSON.stringify(body)).not.toMatch(/private-note|6500/)
  })

  it.each<[string, unknown]>([
    ['empty', []],
    ['too many', Array.from({ length: 101 }, () => randomUUID())],
    ['not UUIDs', ['not-a-uuid']],
    ['not a list', 'x'],
  ])('rejects %s command ids', async (_label, ids) => {
    const user = await member(client)
    const res = await client.as(user).post('/v1/commands/status', { command_ids: ids })
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('VALIDATION_FAILED')
  })

  it('accepts exactly 100 ids', async () => {
    const user = await member(client)
    const res = await client.as(user).post('/v1/commands/status', { command_ids: Array.from({ length: 100 }, () => randomUUID()) })
    expect(res.status).toBe(200)
    expect((await res.json()).statuses).toHaveLength(100)
  })

  it('a status lookup of exactly 100 command ids returns 100 statuses', async () => {
    const user = await member(client)
    const first = await (await client.as(user).post('/v1/wallets', wallet())).json()
    const second = await (await client.as(user).post('/v1/wallets', wallet())).json()
    const ids = [first.command_id, second.command_id, ...Array.from({ length: 98 }, () => randomUUID())]
    const res = await client.as(user).post('/v1/commands/status', { command_ids: ids })
    expect(res.status).toBe(200)
    const { statuses } = await res.json()
    expect(statuses).toHaveLength(100)
    expect(statuses.slice(0, 2)).toEqual([
      { command_id: first.command_id, state: 'known', ack: first },
      { command_id: second.command_id, state: 'known', ack: second },
    ])
    expect(statuses.slice(2).every((status: { state: string }) => status.state === 'unknown')).toBe(true)
  })

  it('needs a bound session but not current policy acceptance', async () => {
    const pending = newUser()
    expect((await client.as(pending).post('/v1/commands/status', { command_ids: [randomUUID()] })).status).toBe(200)
    const unbound = await client.as(pending, { omitSid: true }).post('/v1/commands/status', { command_ids: [randomUUID()] })
    expect(unbound.status).toBe(401)
  })
})

describe('entity state for later commands', () => {
  it('a deleted entity is ENTITY_DELETED and a purged one ENTITY_PURGED', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    const coffee = purchase()
    await commands.create(coffee)
    expect(await live(user, coffee.id)).toEqual({ version: 1, state: 'active' })
    await commands.remove(coffee.id, 1)
    expect(await codeOf(() => live(user, coffee.id))).toBe('409 ENTITY_DELETED')
    await sqlExec(user, "UPDATE entity_heads SET state = 'purged', version = version + 1")
    expect(await codeOf(() => live(user, coffee.id))).toBe('410 ENTITY_PURGED')
  })

  it("another account's entity is NOT_FOUND, exactly like a missing one", async () => {
    const owner = await member(client)
    const other = await member(client)
    const coffee = purchase()
    await fixtureCommands(owner).create(coffee)
    expect(await codeOf(() => live(other, coffee.id))).toBe('404 NOT_FOUND')
    expect(await codeOf(() => live(other, randomUUID()))).toBe('404 NOT_FOUND')
  })

  it('a stale version on a later command is VERSION_CONFLICT with no receipt or revision', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user)
    const coffee = purchase()
    await commands.create(coffee)
    const commandId = randomUUID()
    expect(await codeOf(() => commands.remove(coffee.id, 7, commandId))).toBe('409 VERSION_CONFLICT')
    const status = await (await client.as(user).post('/v1/commands/status', { command_ids: [commandId] })).json()
    expect(status.statuses[0].state).toBe('unknown')
  })
})

describe('the command protocol over HTTP', () => {
  it('a resent command replays its acknowledgement; the same key with other content is 409', async () => {
    const user = await member(client)
    const key = randomUUID()
    const body = wallet()
    const first = await (await client.as(user).post('/v1/wallets', body, { key })).json()
    const again = await client.as(user).post('/v1/wallets', body, { key })
    expect(again.status).toBe(201)
    expect(await again.json()).toEqual(first)
    const other = await client.as(user).post('/v1/wallets', { ...body, name: 'Bank' }, { key })
    expect(other.status).toBe(409)
    expect((await other.json()).code).toBe('IDEMPOTENCY_MISMATCH')
  })

  it('an unsupported command schema is 422 before anything is written', async () => {
    const user = await member(client)
    const res = await client.as(user).post('/v1/wallets', wallet(), { schema: null })
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('COMMAND_SCHEMA_UNSUPPORTED')
    expect(await (await client.as(user).get('/v1/wallets')).json()).toEqual([])
  })

  it('a stale If-Match is 409 VERSION_CONFLICT with the current wallet', async () => {
    const user = await member(client)
    const body = wallet()
    expect((await client.as(user).post('/v1/wallets', body)).status).toBe(201)
    expect((await client.as(user).patch(`/v1/wallets/${body.id}`, { name: 'Bank' }, { ifMatch: 1 })).status).toBe(200)
    const stale = await client.as(user).patch(`/v1/wallets/${body.id}`, { name: 'Pocket' }, { ifMatch: 1 })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ code: 'VERSION_CONFLICT', current: { id: body.id, name: 'Bank', version: 2 } })
  })

  it('validation problems name the field', async () => {
    const user = await member(client)
    const res = await client.as(user).post('/v1/wallets', wallet({ opening_minor: '1.50' }))
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'INVALID_MINOR', fields: { opening_minor: expect.any(String) } })
  })

  it('writes wait for the current terms; accepting them opens writes', async () => {
    const user = newUser()
    const blocked = await client.as(user).post('/v1/wallets', wallet())
    expect(blocked.status).toBe(403)
    expect((await blocked.json()).code).toBe('POLICY_ACCEPTANCE_REQUIRED')
    const me = await (await client.as(user).get('/v1/me')).json()
    expect(me).toMatchObject({ account_id: user.sub, status: 'active', pending_policies: [{ kind: 'terms', version: 1 }], privacy: { analytics: false } })
    const accept = await client.as(user).post('/v1/me/policy-acceptances', { kind: 'terms', version: 1 })
    expect(accept.status).toBe(204)
    expect(await accept.text()).toBe('')
    expect((await client.as(user).post('/v1/wallets', wallet())).status).toBe(201)
    expect((await (await client.as(user).get('/v1/me')).json()).pending_policies).toEqual([])
  })

  it('the policy check runs in the guard, before the body is validated', async () => {
    const user = newUser()
    const res = await client.as(user).post('/v1/wallets', wallet({ opening_minor: 'not money' }))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('POLICY_ACCEPTANCE_REQUIRED')
  })

  it('a paused writes gate answers 503 WRITES_PAUSED with Retry-After before authentication; reads stay open', async () => {
    const paused = await startV1({ gates: { paused: ['writes'], retry_after_seconds: 120 }, policies: TEST_POLICIES })
    const res = await paused.raw(new Request(`${BASE}/v1/wallets`, { method: 'POST' }))
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('120')
    expect(await res.json()).toMatchObject({ code: 'WRITES_PAUSED', retry_after_seconds: 120, message_key: 'errors.writes_paused' })
    expect((await paused.raw(new Request(`${BASE}/v1/policies`))).status).toBe(200)
  })

  it('malformed JSON is 400 VALIDATION_FAILED; a JSON primitive is refused as strict JSON', async () => {
    const user = await member(client)
    const headers = { ...(await signedHeaders(user)), 'content-type': 'application/json', 'idempotency-key': randomUUID(), 'x-gogospend-command-schema': '1' }
    for (const body of ['{"id":', '"text"', '42']) {
      const res = await client.raw(new Request(`${BASE}/v1/wallets`, { method: 'POST', headers, body }))
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe('VALIDATION_FAILED')
    }
  })

  it('a body over 2 MB is 413 COMMAND_TOO_LARGE', async () => {
    const res = await client.raw(new Request(`${BASE}/v1/wallets`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x'.repeat(2 * 1024 * 1024) }) }))
    expect(res.status).toBe(413)
    expect((await res.json()).code).toBe('COMMAND_TOO_LARGE')
  })

  it('with no config in KV, writes wait for published policies (503) while reads work', async () => {
    const bare = await startV1('absent')
    const user = newUser()
    const res = await bare.as(user).post('/v1/wallets', { id: randomUUID(), name: 'Cash', opening_minor: '0', tracking_start: '2026-10-01' })
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE', message_key: 'errors.policy_unpublished' })
    expect((await bare.as(user).get('/v1/wallets')).status).toBe(200)
  })

  it('after the vault sleeps, a resent command replays its acknowledgement and the next one takes the next revision', async () => {
    const user = await member(client)
    const key = randomUUID()
    const body = { id: randomUUID(), name: 'Cash', opening_minor: '100000', tracking_start: '2026-10-01' }
    const first = await (await client.as(user).post('/v1/wallets', body, { key })).json()
    await evictAllDurableObjects()
    expect(await (await client.as(user).post('/v1/wallets', body, { key })).json()).toEqual(first)
    const next = await (await client.as(user).post('/v1/wallets', { ...body, id: randomUUID() })).json()
    expect(BigInt(next.committed_revision)).toBe(BigInt(first.committed_revision) + 1n)
  })

  it('twenty writes at once commit in one order with contiguous revisions', async () => {
    const user = await member(client)
    const acks = await Promise.all(
      Array.from({ length: 20 }, () => client.as(user).post('/v1/wallets', { id: randomUUID(), name: 'W', opening_minor: '0', tracking_start: '2026-10-01' }).then((r) => r.json())),
    )
    const revisions = acks.map((a) => Number(a.committed_revision)).sort((a, b) => a - b)
    expect(revisions.every(Number.isFinite)).toBe(true)
    expect(revisions).toEqual(revisions.map((_, i) => revisions[0] + i))
  })

  it('the same command sent twice at once is committed once', async () => {
    const user = await member(client)
    const key = randomUUID()
    const body = { id: randomUUID(), name: 'Cash', opening_minor: '0', tracking_start: '2026-10-01' }
    const [a, b] = await Promise.all([0, 1].map(() => client.as(user).post('/v1/wallets', body, { key }).then((r) => r.json())))
    expect(a).toEqual(b)
    expect((await sqlRows<{ n: number }>(user, 'SELECT count(*) AS n FROM command_receipts WHERE command_id = ?', key))[0].n).toBe(1)
  })
})

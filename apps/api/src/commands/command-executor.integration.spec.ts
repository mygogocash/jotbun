import { randomUUID } from 'node:crypto';

import { MAX_CHANGE_GROUP_BYTES } from '@gogospend/contracts';
import type { CommandAck } from '@gogospend/contracts';
import { Client } from 'pg';
import type { Pool } from 'pg';

import { SessionRevocationService } from '../accounts/session-revocation.service';
import { ProblemException } from '../common/api-problem.filter';
import { poolConfigFromUrl } from '../database/database-config';
import { DatabaseService } from '../database/database.service';
import { PolicyService } from '../policies/policy.service';
import { ChangeWriter } from '../sync/change-writer';
import { authFixtures } from '../testing/auth-fixtures';
import type { SignedUp } from '../testing/auth-fixtures';
import { FIXTURE_ENTITY, acceptPolicies, createFixtureDomain, fixtureCommands, publishPolicies, purchase, registerFixtureDomain } from '../testing/command-fixtures';
import { startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { CommandDigester, TEST_DIGEST_KEY } from './command-digest';
import { CommandExecutor } from './command-executor';
import { CommandReceiptRepository } from './command-receipts.repository';
import { CommandRegistry } from './command-registry';

let db: TestDatabase;
let issuer: JwksFixture;
let pool: Pool;
let fx: ReturnType<typeof authFixtures>;
let service: DatabaseService;
let commands: ReturnType<typeof fixtureCommands>;

function executorWith(registry: CommandRegistry): CommandExecutor {
  return new CommandExecutor(service, registry, new PolicyService(pool, service, 0), new ChangeWriter(registry), new CommandReceiptRepository(), new CommandDigester(TEST_DIGEST_KEY));
}

async function code(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return 'ok';
  } catch (error) {
    if (error instanceof ProblemException) return `${error.getStatus()} ${error.code}`;
    throw error;
  }
}

const one = async <R>(sql: string, values: unknown[] = []): Promise<R> => (await db.admin((client) => client.query(sql, values))).rows[0] as R;
const revisionOf = async (user: SignedUp) => (await one<{ revision: string }>('SELECT revision::text FROM account_sync_state WHERE account_id = $1', [user.accountId])).revision;
const countOf = async (table: string, user: SignedUp) => (await one<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE account_id = $1`, [user.accountId])).n;

async function member(): Promise<SignedUp> {
  const user = await fx.signUp();
  await acceptPolicies(db, user.accountId);
  return user;
}

beforeAll(async () => {
  db = await createTestDatabase();
  issuer = await startJwksFixture();
  pool = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 8);
  fx = authFixtures(issuer, pool);
  service = new DatabaseService(pool);
  await createFixtureDomain(db);
  await publishPolicies(db);
  const registry = new CommandRegistry();
  registerFixtureDomain(registry);
  commands = fixtureCommands(executorWith(registry));
});

afterAll(async () => {
  await issuer?.close();
  await db?.drop();
});

beforeEach(() => {
  commands.counter.executions = 0;
});

describe('idempotent commands', () => {
  it('same_command_executes_once_after_lost_response', async () => {
    const user = await member();
    const commandId = randomUUID();
    const coffee = purchase();
    const firstAck = await commands.create(user.session, coffee, { commandId });
    // The response was lost; the client resends the same immutable command.
    const secondAck = await commands.create(user.session, coffee, { commandId });
    const mutationExecutions = commands.counter.executions;
    expect(mutationExecutions).toBe(1);
    expect(secondAck).toEqual(firstAck);
    expect(firstAck).toEqual({ command_id: commandId, entity_id: coffee.id, version: 1, committed_revision: '1', outcome: 'created', entity_state: 'active' });
  });

  it('concurrent requests with one key run the mutation once and all get the same acknowledgement', async () => {
    const user = await member();
    const commandId = randomUUID();
    const coffee = purchase();
    const acks = await Promise.all(Array.from({ length: 5 }, () => commands.create(user.session, coffee, { commandId })));
    expect(commands.counter.executions).toBe(1);
    expect(new Set(acks.map((ack) => JSON.stringify(ack))).size).toBe(1);
    expect(await countOf('fixture_purchases', user)).toBe(1);
    expect(await revisionOf(user)).toBe('1');
  });

  it('the same key with a changed payload is IDEMPOTENCY_MISMATCH and writes nothing', async () => {
    const user = await member();
    const commandId = randomUUID();
    const coffee = purchase();
    await commands.create(user.session, coffee, { commandId });
    expect(await code(() => commands.create(user.session, { ...coffee, amount_minor: '6600' }, { commandId }))).toBe('409 IDEMPOTENCY_MISMATCH');
    expect(commands.counter.executions).toBe(1);
    expect(await revisionOf(user)).toBe('1');
  });

  it('two identical purchases with different keys are both kept', async () => {
    const user = await member();
    const first = await commands.create(user.session, purchase({ note: 'coffee' }));
    const second = await commands.create(user.session, purchase({ note: 'coffee' }));
    expect([first.committed_revision, second.committed_revision]).toEqual(['1', '2']);
    expect(await countOf('fixture_purchases', user)).toBe(2);
  });

  it('a failed mutation rolls back its writes, receipt and revision together, and the key stays usable', async () => {
    const user = await member();
    const commandId = randomUUID();
    const coffee = purchase();
    await expect(commands.create(user.session, coffee, { commandId, result: () => { throw new Error('domain failure'); } })).rejects.toThrow('domain failure');
    expect(await countOf('fixture_purchases', user)).toBe(0);
    expect(await countOf('command_receipts', user)).toBe(0);
    expect(await countOf('entity_changes', user)).toBe(0);
    expect(await revisionOf(user)).toBe('0');
    expect((await commands.create(user.session, coffee, { commandId })).committed_revision).toBe('1');
  });

  it('receipts and audit rows hold no amounts, notes or DTOs', async () => {
    const user = await member();
    await commands.create(user.session, purchase({ amount_minor: '98765432', note: 'secret-note-text' }));
    const receipt = await one<{ text: string }>('SELECT row_to_json(r)::text AS text FROM command_receipts r WHERE account_id = $1', [user.accountId]);
    const audit = await one<{ text: string }>('SELECT row_to_json(a)::text AS text FROM audit_events a WHERE account_id = $1', [user.accountId]);
    for (const row of [receipt.text, audit.text]) {
      expect(row).not.toMatch(/98765432|secret-note-text|amount|note/);
    }
    expect(Object.keys(JSON.parse(receipt.text)).sort()).toEqual(
      ['account_id', 'command_id', 'committed_at', 'digest_key_id', 'entity', 'entity_id', 'entity_state', 'entity_version', 'kind', 'outcome', 'request_digest', 'revision', 'schema_version'],
    );
    expect(JSON.parse(audit.text)).toMatchObject({ kind: 'fixture.purchase.create', session_id: user.session.bindingId, metadata: {} });
  });
});

describe('command schema versions', () => {
  it.each([[0], [3]])('schema version %i with no receipt is 422 COMMAND_SCHEMA_UNSUPPORTED and reserves nothing', async (schemaVersion) => {
    const user = await member();
    const commandId = randomUUID();
    expect(await code(() => commands.create(user.session, purchase(), { commandId, schemaVersion }))).toBe('422 COMMAND_SCHEMA_UNSUPPORTED');
    expect(commands.counter.executions).toBe(0);
    expect(await countOf('command_receipts', user)).toBe(0);
    expect(await revisionOf(user)).toBe('0');
  });

  it('a committed command replays its original acknowledgement after its schema version is withdrawn', async () => {
    const user = await member();
    const commandId = randomUUID();
    const coffee = purchase();
    const original = await commands.create(user.session, coffee, { commandId, schemaVersion: 2 });
    const withdrawn = new CommandRegistry();
    registerFixtureDomain(withdrawn, [1]);
    const later = fixtureCommands(executorWith(withdrawn));
    expect(await later.create(user.session, coffee, { commandId, schemaVersion: 2 })).toEqual(original);
    expect(later.counter.executions).toBe(0);
  });

  it('the same key with a different schema version is IDEMPOTENCY_MISMATCH', async () => {
    const user = await member();
    const commandId = randomUUID();
    const coffee = purchase();
    await commands.create(user.session, coffee, { commandId, schemaVersion: 1 });
    expect(await code(() => commands.create(user.session, coffee, { commandId, schemaVersion: 2 }))).toBe('409 IDEMPOTENCY_MISMATCH');
  });
});

describe('authorization under the account lock', () => {
  it('writes need the current required policies, checked under the lock', async () => {
    const user = await fx.signUp();
    expect(await code(() => commands.create(user.session, purchase()))).toBe('403 POLICY_ACCEPTANCE_REQUIRED');
    expect(commands.counter.executions).toBe(0);
  });

  it('a replay still needs a currently valid session', async () => {
    const user = await member();
    const commandId = randomUUID();
    const coffee = purchase();
    await commands.create(user.session, coffee, { commandId });
    await new SessionRevocationService(service).revokeCurrent(user.session);
    expect(await code(() => commands.create(user.session, coffee, { commandId }))).toBe('401 SESSION_REQUIRED');
  });

  it('a mutation that passed the guard loses to a deletion committed first', async () => {
    const user = await member();
    const deletion = new Client(poolConfigFromUrl(db.adminUrl, 1));
    await deletion.connect();
    try {
      await deletion.query('BEGIN');
      await deletion.query('SELECT 1 FROM account_sync_state WHERE account_id = $1 FOR UPDATE', [user.accountId]);
      await deletion.query(`UPDATE accounts SET status = 'deleting', lifecycle_generation = lifecycle_generation + 1 WHERE id = $1`, [user.accountId]);
      const waiting = code(() => commands.create(user.session, purchase()));
      await new Promise((resolve) => setTimeout(resolve, 200));
      await deletion.query('COMMIT');
      expect(await waiting).toBe('403 ACCOUNT_UNAVAILABLE');
      expect(commands.counter.executions).toBe(0);
    } finally {
      await deletion.end();
    }
  });

  it('commit order is revision order', async () => {
    const user = await member();
    let releaseFirst!: () => void;
    const firstHolding = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      firstEntered = resolve;
    });
    const order: string[] = [];
    const first = commands.create(user.session, purchase(), { during: async () => { firstEntered(); await firstHolding; } }).then((ack) => {
      order.push('first');
      return ack;
    });
    await entered;
    const second = commands.create(user.session, purchase(), { during: async () => { order.push('second-mutating'); } }).then((ack) => {
      order.push('second');
      return ack;
    });
    let blocked: string[];
    try {
      await new Promise((resolve) => setTimeout(resolve, 150));
      blocked = [...order];
    } finally {
      releaseFirst();
    }
    const [a, b] = await Promise.all([first, second]);
    expect(blocked).toEqual([]);
    expect(order).toEqual(['first', 'second-mutating', 'second']);
    expect([a.committed_revision, b.committed_revision]).toEqual(['1', '2']);
    const logged = (await db.admin((client) => client.query('SELECT revision::text, command_id FROM entity_changes WHERE account_id = $1 ORDER BY revision', [user.accountId]))).rows;
    expect(logged.map((row) => row.command_id)).toEqual([a.command_id, b.command_id]);
  });
});

describe('the change group', () => {
  it('commits one group per command under one revision, with entity heads moving forward', async () => {
    const user = await member();
    const coffee = purchase();
    const created = await commands.create(user.session, coffee);
    const deleted = await commands.remove(user.session, coffee.id, 1);
    expect(deleted).toMatchObject({ entity_id: coffee.id, version: 2, committed_revision: '2', outcome: 'deleted', entity_state: 'deleted' });
    const changes = (await db.admin((client) => client.query('SELECT revision::text, ordinal, entity, entity_id, version, state, snapshot FROM entity_changes WHERE account_id = $1 ORDER BY revision, ordinal', [user.accountId]))).rows;
    expect(changes).toEqual([
      { revision: created.committed_revision, ordinal: 0, entity: FIXTURE_ENTITY, entity_id: coffee.id, version: 1, state: 'active', snapshot: coffee },
      { revision: '2', ordinal: 0, entity: FIXTURE_ENTITY, entity_id: coffee.id, version: 2, state: 'deleted', snapshot: coffee },
    ]);
    expect(await one('SELECT version, state, revision::text FROM entity_heads WHERE account_id = $1', [user.accountId])).toEqual({ version: 2, state: 'deleted', revision: '2' });
  });

  it('a group above 1 MiB is COMMAND_TOO_LARGE before commit and leaves nothing behind', async () => {
    const user = await member();
    const big = 'x'.repeat(MAX_CHANGE_GROUP_BYTES);
    expect(await code(() => commands.create(user.session, purchase(), { result: (p) => ({ entityId: p.id, version: 1, changes: [{ entity: FIXTURE_ENTITY, id: p.id, version: 1, state: 'active', snapshot: { ...p, note: big } }] }) }))).toBe('413 COMMAND_TOO_LARGE');
    expect(await countOf('fixture_purchases', user)).toBe(0);
    expect(await revisionOf(user)).toBe('0');
  });

  it('a snapshot that does not match its entity DTO is refused and rolled back', async () => {
    const user = await member();
    await expect(commands.create(user.session, purchase(), { result: (p) => ({ entityId: p.id, version: 1, changes: [{ entity: FIXTURE_ENTITY, id: p.id, version: 1, state: 'active', snapshot: { ...p, owner_id: user.accountId } }] }) })).rejects.toThrow();
    expect(await countOf('fixture_purchases', user)).toBe(0);
    expect(await countOf('command_receipts', user)).toBe(0);
  });

  it('an entity version that does not move forward is refused and rolled back', async () => {
    const user = await member();
    const coffee = purchase();
    await commands.create(user.session, coffee);
    const stale = (p: typeof coffee) => ({ entityId: coffee.id, version: 1, changes: [{ entity: FIXTURE_ENTITY, id: coffee.id, version: 1, state: 'active' as const, snapshot: { ...coffee } }] });
    await expect(commands.create(user.session, purchase(), { result: stale })).rejects.toThrow();
    expect(await revisionOf(user)).toBe('1');
    expect(await countOf('fixture_purchases', user)).toBe(1);
  });

  it('an acknowledgement must describe a change in its own group', async () => {
    const user = await member();
    await expect(commands.create(user.session, purchase(), { result: (p) => ({ entityId: p.id, version: 1, changes: [] }) })).rejects.toThrow();
    expect(await revisionOf(user)).toBe('0');
  });
});

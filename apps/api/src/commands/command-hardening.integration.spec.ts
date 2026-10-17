import { createHash, randomUUID } from 'node:crypto';

import { MAX_CHANGE_GROUP_BYTES } from '@gogospend/contracts';
import type { CommandAck, EntityChange } from '@gogospend/contracts';
import { Client, Pool } from 'pg';

import { ProblemException } from '../common/api-problem.filter';
import { poolConfigFromUrl } from '../database/database-config';
import { DatabaseService } from '../database/database.service';
import { PolicyService } from '../policies/policy.service';
import { ChangeWriter, changeGroupBytes } from '../sync/change-writer';
import { authFixtures } from '../testing/auth-fixtures';
import type { SignedUp } from '../testing/auth-fixtures';
import { FIXTURE_ENTITY, acceptPolicies, createFixtureDomain, fixtureCommands, publishPolicies, purchase, registerFixtureDomain } from '../testing/command-fixtures';
import { startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { CommandDigester, TEST_DIGEST_KEY, canonicalCommandText } from './command-digest';
import type { DigestKey } from './command-digest';
import { CommandExecutor } from './command-executor';
import { CommandReceiptRepository } from './command-receipts.repository';
import { CommandRegistry } from './command-registry';

let db: TestDatabase;
let issuer: JwksFixture;
let pool: Pool;
let fx: ReturnType<typeof authFixtures>;
let service: DatabaseService;
let registry: CommandRegistry;
let executor: CommandExecutor;
let commands: ReturnType<typeof fixtureCommands>;

const ROTATED: DigestKey = { id: 'test2', secret: Buffer.from('synthetic-command-digest-key-rotated-0123456789', 'utf8') };

function executorWith(digester: CommandDigester, on: DatabaseService = service): CommandExecutor {
  return new CommandExecutor(on, registry, new PolicyService(pool, on, 0), new ChangeWriter(registry), new CommandReceiptRepository(), digester);
}

async function code(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return 'ok';
  } catch (error) {
    if (error instanceof ProblemException) return `${error.getStatus()} ${error.code}`;
    if (error instanceof Error && 'code' in error) return `sql ${(error as { code: string }).code}`;
    return 'error';
  }
}

const rows = async <R>(sql: string, values: unknown[] = []): Promise<R[]> => (await db.admin((client) => client.query(sql, values))).rows as R[];
const revisionOf = async (user: SignedUp) => (await rows<{ revision: string }>('SELECT revision::text FROM account_sync_state WHERE account_id = $1', [user.accountId]))[0].revision;

async function member(): Promise<SignedUp> {
  const user = await fx.signUp();
  await acceptPolicies(db, user.accountId);
  return user;
}

const asOwner = <T>(user: SignedUp, run: (tx: Parameters<Parameters<DatabaseService['withOwnerTransaction']>[1]>[0]) => Promise<T>) => service.withOwnerTransaction(user.session, run);

beforeAll(async () => {
  db = await createTestDatabase();
  issuer = await startJwksFixture();
  pool = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 8);
  fx = authFixtures(issuer, pool);
  service = new DatabaseService(pool);
  await createFixtureDomain(db);
  await publishPolicies(db);
  registry = new CommandRegistry();
  registerFixtureDomain(registry);
  executor = executorWith(new CommandDigester(TEST_DIGEST_KEY));
  commands = fixtureCommands(executor);
});

afterAll(async () => {
  await issuer?.close();
  await db?.drop();
});

beforeEach(() => {
  commands.counter.executions = 0;
});

describe('command identity', () => {
  it('an acknowledgement must name the entity its payload targets', async () => {
    const user = await member();
    const other = purchase();
    const result = await code(() => commands.create(user.session, purchase(), { result: () => ({ entityId: other.id, version: 1, changes: [{ entity: FIXTURE_ENTITY, id: other.id, version: 1, state: 'active', snapshot: other }] }) }));
    expect(result).not.toBe('ok');
    expect(await revisionOf(user)).toBe('0');
  });

  it('a payload that does not name its target entity is refused before any mutation', async () => {
    const user = await member();
    let ran = false;
    const result = await code(() => executor.run(user.session, { commandId: randomUUID(), kind: 'fixture.export', schemaVersion: 1, payload: { scope: 'all' } }, async () => {
      ran = true;
      throw new Error('should not run');
    }));
    expect(result).not.toBe('ok');
    expect(ran).toBe(false);
  });

  it('the same key for a different command kind is IDEMPOTENCY_MISMATCH', async () => {
    const user = await member();
    const coffee = purchase();
    const commandId = randomUUID();
    await commands.create(user.session, coffee, { commandId });
    expect(await code(() => commands.remove(user.session, coffee.id, 1, commandId))).toBe('409 IDEMPOTENCY_MISMATCH');
  });

  it('exempt kinds run while required policies are pending', async () => {
    const pending = await fx.signUp();
    const id = randomUUID();
    const ack = await executor.run(pending.session, { commandId: randomUUID(), kind: 'fixture.export', schemaVersion: 1, payload: { id } }, async () => ({
      entityId: id, version: 1, changes: [{ entity: FIXTURE_ENTITY, id, version: 1, state: 'active', snapshot: { id, amount_minor: '1', note: null } }],
    }));
    expect(ack.outcome).toBe('accepted');
  });
});

describe('receipt digests', () => {
  it('are keyed: the receipt row alone cannot confirm a guessed payload', async () => {
    const user = await member();
    const coffee = purchase({ amount_minor: '48250' });
    const ack = await commands.create(user.session, coffee);
    const [receipt] = await rows<{ request_digest: Buffer; digest_key_id: string }>('SELECT request_digest, digest_key_id FROM command_receipts WHERE account_id = $1', [user.accountId]);
    const text = canonicalCommandText(user.accountId, { commandId: ack.command_id, kind: 'fixture.purchase.create', schemaVersion: 1, payload: coffee }) as string;
    expect(receipt.digest_key_id).toBe(TEST_DIGEST_KEY.id);
    expect(receipt.request_digest.equals(createHash('sha256').update(text).digest())).toBe(false);
  });

  it('a replay still verifies after key rotation while the old key is kept, and not once it is dropped', async () => {
    const user = await member();
    const coffee = purchase();
    const commandId = randomUUID();
    const original = await commands.create(user.session, coffee, { commandId });
    const rotated = fixtureCommands(executorWith(new CommandDigester(ROTATED, [TEST_DIGEST_KEY])));
    expect(await rotated.create(user.session, coffee, { commandId })).toEqual(original);
    expect(rotated.counter.executions).toBe(0);
    const dropped = fixtureCommands(executorWith(new CommandDigester(ROTATED)));
    expect(await code(() => dropped.create(user.session, coffee, { commandId }))).toBe('409 IDEMPOTENCY_MISMATCH');
  });
});

describe('database guards on the change log', () => {
  it('an entity head can neither move backwards nor leave purged', async () => {
    const user = await member();
    const coffee = purchase();
    await commands.create(user.session, coffee);
    expect(await code(() => asOwner(user, (tx) => tx.query(`UPDATE entity_heads SET version = 1, state = 'deleted' WHERE entity_id = $1`, [coffee.id])))).toMatch(/^sql /);
    await db.admin((client) => client.query(`UPDATE entity_heads SET state = 'purged', version = 2 WHERE entity_id = $1`, [coffee.id]));
    expect(await code(() => asOwner(user, (tx) => tx.query(`UPDATE entity_heads SET version = 9, state = 'active' WHERE entity_id = $1`, [coffee.id])))).toMatch(/^sql /);
  });

  it('a new head starts at version 1 and active', async () => {
    const user = await member();
    await commands.create(user.session, purchase());
    expect(await code(() => asOwner(user, (tx) => tx.query(`INSERT INTO entity_heads (account_id, entity, entity_id, version, state, revision) VALUES ($1, $2, $3, 77, 'active', 1)`, [user.accountId, FIXTURE_ENTITY, randomUUID()])))).toMatch(/^sql /);
  });

  it('change, receipt and audit rows outside the current revision are refused, so a stray write cannot wedge the account', async () => {
    const user = await member();
    await commands.create(user.session, purchase());
    const next = '2';
    expect(await code(() => asOwner(user, (tx) => tx.query(
      `INSERT INTO entity_changes (account_id, revision, ordinal, command_id, entity, entity_id, version, state, snapshot) VALUES ($1, $2, 0, $3, $4, $5, 1, 'active', '{}')`,
      [user.accountId, next, randomUUID(), FIXTURE_ENTITY, randomUUID()],
    )))).toMatch(/^sql /);
    expect(await code(() => asOwner(user, (tx) => tx.query(
      `INSERT INTO audit_events (account_id, revision, command_id, kind, session_id, client_id) VALUES ($1, $2, $3, 'fixture.purchase.create', $4, 'x')`,
      [user.accountId, next, randomUUID(), user.session.bindingId],
    )))).toMatch(/^sql /);
    expect((await commands.create(user.session, purchase())).committed_revision).toBe(next);
  });

  it('the app can neither read audit rows nor rewrite receipts and changes', async () => {
    const user = await member();
    await commands.create(user.session, purchase());
    expect(await code(() => asOwner(user, (tx) => tx.query('SELECT * FROM audit_events')))).toBe('sql 42501');
    expect(await code(() => asOwner(user, (tx) => tx.query(`UPDATE command_receipts SET outcome = 'deleted'`)))).toBe('sql 42501');
    expect(await code(() => asOwner(user, (tx) => tx.query('DELETE FROM entity_changes')))).toBe('sql 42501');
  });
});

describe('change validation', () => {
  const override = (user: SignedUp, snapshot: (id: string) => unknown) => commands.create(user.session, purchase(), {
    result: (p) => ({ entityId: p.id, version: 1, changes: [{ entity: FIXTURE_ENTITY, id: p.id, version: 1, state: 'active', snapshot: snapshot(p.id) }] }),
  });

  it("a snapshot's id must be its change's id", async () => {
    const user = await member();
    expect(await code(() => override(user, () => purchase()))).not.toBe('ok');
    expect(await revisionOf(user)).toBe('0');
  });

  it('what is stored is what was validated: toJSON cannot smuggle fields in', async () => {
    const user = await member();
    const sneaky = (id: string) => Object.assign(Object.create({ toJSON: () => ({ id, amount_minor: '1', note: null, owner: 'x' }) }), { id, amount_minor: '6500', note: null });
    expect(await code(() => override(user, sneaky))).not.toBe('ok');
    expect(await revisionOf(user)).toBe('0');
  });

  it('a group of exactly 1 MiB is accepted and one byte more is refused', async () => {
    const user = await member();
    const sized = (extra: number) => (id: string, commandId: string): EntityChange[] => {
      const base: EntityChange[] = [{ entity: FIXTURE_ENTITY, id, version: 1, state: 'active', snapshot: { id, amount_minor: '6500', note: '' } }];
      const note = 'x'.repeat(MAX_CHANGE_GROUP_BYTES - changeGroupBytes(commandId, base) + extra);
      return [{ entity: FIXTURE_ENTITY, id, version: 1, state: 'active', snapshot: { id, amount_minor: '6500', note } }];
    };
    const attempt = (extra: number) => {
      const commandId = randomUUID();
      return commands.create(user.session, purchase(), { commandId, result: (p) => ({ entityId: p.id, version: 1, changes: sized(extra)(p.id, commandId) }) });
    };
    expect(await code(() => attempt(1))).toBe('413 COMMAND_TOO_LARGE');
    expect(await code(() => attempt(0))).toBe('ok');
  });
});

describe('concurrency', () => {
  it('a status lookup waits for an in-flight command and then reports it', async () => {
    const user = await member();
    const commandId = randomUUID();
    let release!: () => void;
    const holding = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const inside = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const running = commands.create(user.session, purchase(), { commandId, during: async () => { entered(); await holding; } });
    await inside;
    const lookup = asOwner(user, (tx) => new CommandReceiptRepository().lookup(tx, [commandId]));
    await new Promise((resolve) => setTimeout(resolve, 150));
    release();
    await running;
    expect((await lookup)[0].state).toBe('known');
  });

  it('replay holds even when the login defaults to REPEATABLE READ', async () => {
    const user = await member();
    const repeatable = new Pool({ ...poolConfigFromUrl(await db.loginUrl(['gogospend_app', 'gogospend_bootstrap']), 6), options: '-c default_transaction_isolation=repeatable\\ read' });
    try {
      const strict = fixtureCommands(executorWith(new CommandDigester(TEST_DIGEST_KEY), new DatabaseService(repeatable)));
      const coffee = purchase();
      const commandId = randomUUID();
      const acks = await Promise.all(Array.from({ length: 4 }, () => strict.create(user.session, coffee, { commandId })));
      expect(strict.counter.executions).toBe(1);
      expect(new Set(acks.map((ack: CommandAck) => JSON.stringify(ack))).size).toBe(1);
    } finally {
      await repeatable.end();
    }
  });

  it('a command waiting behind a global logout writes nothing', async () => {
    const user = await member();
    const logout = new Client(poolConfigFromUrl(db.adminUrl, 1));
    await logout.connect();
    try {
      await logout.query('BEGIN');
      await logout.query(`SELECT set_config('gogospend.account_id', $1, true)`, [user.accountId]);
      await logout.query('SELECT * FROM gogospend_global_logout($1)', [randomUUID()]);
      const waiting = code(() => commands.create(user.session, purchase()));
      await new Promise((resolve) => setTimeout(resolve, 200));
      await logout.query('COMMIT');
      expect(await waiting).toBe('401 SESSION_REQUIRED');
      expect(commands.counter.executions).toBe(0);
    } finally {
      await logout.end();
    }
  });

  it('a nested owner transaction inside a mutation is refused', async () => {
    const user = await member();
    const result = await code(() => commands.create(user.session, purchase(), { during: () => service.withOwnerTransaction(user.session, async () => undefined) }));
    expect(result).not.toBe('ok');
    expect(await revisionOf(user)).toBe('0');
  });
});

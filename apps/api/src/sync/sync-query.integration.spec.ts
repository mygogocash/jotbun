import { randomUUID } from 'node:crypto';

import { SYNC_PAGE_BYTES } from '@gogospend/contracts';
import type { CommittedChangeGroup, SessionContext, SyncChangesPage } from '@gogospend/contracts';
import type { Pool } from 'pg';

import { CommandDigester, TEST_DIGEST_KEY } from '../commands/command-digest';
import { CommandExecutor } from '../commands/command-executor';
import { CommandReceiptRepository } from '../commands/command-receipts.repository';
import { CommandRegistry } from '../commands/command-registry';
import { DatabaseService } from '../database/database.service';
import { PolicyService } from '../policies/policy.service';
import { authFixtures } from '../testing/auth-fixtures';
import type { SignedUp } from '../testing/auth-fixtures';
import { FIXTURE_ENTITY, acceptPolicies, createFixtureDomain, fixtureCommands, publishPolicies, purchase, registerFixtureDomain } from '../testing/command-fixtures';
import { startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { ChangeWriter } from './change-writer';
import { decodeSyncCursor, encodeSyncCursor } from './sync-cursor';
import { SyncQuery, parseSyncRequest } from './sync-query';
import { SyncRetention } from './sync-retention';

let db: TestDatabase;
let issuer: JwksFixture;
let service: DatabaseService;
let fx: ReturnType<typeof authFixtures>;
let commands: ReturnType<typeof fixtureCommands>;
let query: SyncQuery;
let retention: SyncRetention;

async function member(): Promise<SignedUp> {
  const user = await fx.signUp();
  await acceptPolicies(db, user.accountId);
  return user;
}

const page = (session: SessionContext, cursor?: string, limit?: number): Promise<SyncChangesPage> =>
  service.withOwnerTransaction(session, (tx) => query.after(tx, cursor, limit), { snapshot: true });

async function failure(run: () => Promise<unknown>): Promise<{ status?: number; code?: string }> {
  try {
    await run();
  } catch (error) {
    const e = error as { getStatus?: () => number; code?: string };
    return { status: e.getStatus?.() ?? (e.code ? 422 : undefined), code: e.code };
  }
  return {};
}

/** One command that commits `count` sibling purchases under one revision. */
function wideCommand(user: SignedUp, count: number) {
  const siblings = Array.from({ length: count }, () => purchase());
  return commands.create(user.session, siblings[0], {
    result: () => ({ entityId: siblings[0].id, version: 1, changes: siblings.map((p) => ({ entity: FIXTURE_ENTITY, id: p.id, version: 1, state: 'active' as const, snapshot: p })) }),
  });
}

async function allGroups(session: SessionContext, cursor?: string, limit?: number): Promise<{ pages: SyncChangesPage[]; groups: CommittedChangeGroup[] }> {
  const pages: SyncChangesPage[] = [];
  let next = cursor;
  do {
    const current = await page(session, next, limit);
    pages.push(current);
    next = current.next_cursor;
    if (!current.has_more) break;
  } while (pages.length < 50);
  return { pages, groups: pages.flatMap((p) => p.groups) };
}

beforeAll(async () => {
  db = await createTestDatabase();
  issuer = await startJwksFixture();
  const appPool: Pool = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 8);
  fx = authFixtures(issuer, appPool);
  await createFixtureDomain(db);
  await publishPolicies(db);
  service = new DatabaseService(appPool);
  const registry = new CommandRegistry();
  registerFixtureDomain(registry);
  commands = fixtureCommands(new CommandExecutor(service, registry, new PolicyService(appPool, service, 0), new ChangeWriter(registry), new CommandReceiptRepository(), new CommandDigester(TEST_DIGEST_KEY)));
  query = new SyncQuery(registry);
  retention = new SyncRetention(await db.loginPool(['gogospend_jobs'], 2));
});

afterAll(async () => {
  await issuer?.close();
  await db?.drop();
});

describe('ordered deltas', () => {
  it('pagination_never_splits_a_command_group', async () => {
    const user = await member();
    const first = await commands.create(user.session, purchase());
    const wide = await wideCommand(user, 500);
    await commands.create(user.session, purchase());
    const firstPage = await page(user.session, encodeSyncCursor(user.accountId, first.committed_revision), 1);
    const group = firstPage.groups[0];
    expect(firstPage.groups).toHaveLength(1);
    expect(group.revision).toBe(wide.committed_revision);
    expect(group.command_id).toBe(wide.command_id);
    expect(firstPage.groups[0].changes).toHaveLength(500);
    expect(decodeSyncCursor(user.accountId, firstPage.next_cursor)).toBe(group.revision);
    expect(firstPage.has_more).toBe(true);
  });

  it('pages whole groups in revision order within the 2 MiB budget, with no gaps', async () => {
    const user = await member();
    const big = 'x'.repeat(600 * 1024);
    for (let i = 0; i < 5; i += 1) await commands.create(user.session, purchase({ note: big }));
    const { pages, groups } = await allGroups(user.session, undefined, 1000);
    expect(groups.map((g) => g.revision)).toEqual(['1', '2', '3', '4', '5']);
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) {
      expect(Buffer.byteLength(JSON.stringify(p))).toBeLessThanOrEqual(SYNC_PAGE_BYTES);
      for (const g of p.groups) expect(g.changes).toHaveLength(1);
    }
    expect(decodeSyncCursor(user.accountId, pages[pages.length - 1].next_cursor)).toBe('5');
  });

  it('defaults to 200 groups a page and refuses more than 1,000', async () => {
    const user = await member();
    for (let i = 0; i < 201; i += 1) await commands.create(user.session, purchase());
    const first = await page(user.session, undefined, parseSyncRequest({}).limit);
    expect(first.groups).toHaveLength(200);
    expect(first.has_more).toBe(true);
    const second = await page(user.session, first.next_cursor, parseSyncRequest({}).limit);
    expect(second.groups.map((g) => g.revision)).toEqual(['201']);
    expect(second.has_more).toBe(false);
    const empty = await page(user.session, second.next_cursor);
    expect(empty).toEqual({ groups: [], next_cursor: second.next_cursor, has_more: false });
    expect(parseSyncRequest({ limit: '1000' }).limit).toBe(1000);
    for (const bad of [{ limit: '1001' }, { limit: '0' }, { limit: 'ten' }, { other: '1' }, { cursor: ['a', 'b'] }]) {
      expect(() => parseSyncRequest(bad)).toThrow();
    }
  });

  it('a read during staggered commits never skips a group committed later at a lower revision', async () => {
    const user = await member();
    await commands.create(user.session, purchase());
    let release!: () => void;
    let entered!: () => void;
    const inside = new Promise<void>((resolve) => (entered = resolve));
    const held = new Promise<void>((resolve) => (release = resolve));
    // A holds the account lock mid-command; B queues behind it.
    const a = commands.create(user.session, purchase({ note: 'a' }), { during: async () => { entered(); await held; } });
    await inside;
    const b = commands.create(user.session, purchase({ note: 'b' }));
    let during: SyncChangesPage;
    try {
      during = await page(user.session);
    } finally {
      release();
    }
    expect(during.groups.map((g) => g.revision)).toEqual(['1']);
    const [ackA, ackB] = await Promise.all([a, b]);
    expect([ackA.committed_revision, ackB.committed_revision]).toEqual(['2', '3']);
    const after = await page(user.session, during.next_cursor);
    expect(after.groups.map((g) => [g.revision, (g.changes[0].snapshot as { note: string }).note])).toEqual([['2', 'a'], ['3', 'b']]);
  });

  it('rejects malformed, foreign and future cursors, and needs a resync below retention', async () => {
    const user = await member();
    const other = await member();
    await commands.create(user.session, purchase());
    await commands.create(user.session, purchase());
    await commands.create(other.session, purchase());
    expect(await failure(() => page(user.session, 'not a cursor'))).toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
    expect(await failure(() => page(user.session, encodeSyncCursor(other.accountId, '1')))).toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
    expect(await failure(() => page(user.session, encodeSyncCursor(user.accountId, '3')))).toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
    expect((await page(user.session, encodeSyncCursor(user.accountId, '2'))).groups).toEqual([]);
    await db.admin((client) => client.query('UPDATE account_sync_state SET pruned_through = 1 WHERE account_id = $1', [user.accountId]));
    expect(await failure(() => page(user.session, encodeSyncCursor(user.accountId, '0')))).toMatchObject({ status: 410, code: 'RESYNC_REQUIRED' });
    expect(await failure(() => page(user.session))).toMatchObject({ status: 410, code: 'RESYNC_REQUIRED' });
    expect((await page(user.session, encodeSyncCursor(user.accountId, '1'))).groups.map((g) => g.revision)).toEqual(['2']);
  });

  it('30-day retention drops superseded changes, keeps every head, and expires older cursors', async () => {
    const user = await member();
    const coffee = purchase();
    await commands.create(user.session, coffee);
    await commands.remove(user.session, coffee.id, 1);
    const tea = purchase({ note: 'tea' });
    await commands.create(user.session, tea);
    await commands.create(user.session, purchase());
    await db.admin((client) => client.query(`UPDATE entity_changes SET committed_at = now() - interval '31 days' WHERE account_id = $1 AND revision <= 3`, [user.accountId]));
    expect(await retention.prune(new Date())).toBeGreaterThanOrEqual(1);
    const rows = (await db.admin((client) => client.query('SELECT revision::text, entity_id FROM entity_changes WHERE account_id = $1 ORDER BY revision', [user.accountId]))).rows;
    // Coffee's create (revision 1) was superseded by its delete; every head stays.
    expect(rows.map((row) => row.revision)).toEqual(['2', '3', '4']);
    expect((await db.admin((client) => client.query('SELECT pruned_through::text AS p FROM account_sync_state WHERE account_id = $1', [user.accountId]))).rows[0].p).toBe('3');
    expect(await failure(() => page(user.session, encodeSyncCursor(user.accountId, '2')))).toMatchObject({ status: 410, code: 'RESYNC_REQUIRED' });
    expect((await page(user.session, encodeSyncCursor(user.accountId, '3'))).groups.map((g) => g.revision)).toEqual(['4']);
    // Nothing newer than the cutoff is touched, and recent cutoffs are refused.
    await expect(retention.prune(new Date(Date.now() + 40 * 86_400_000))).rejects.toThrow();
  });

  it('refuses to serve a stored change that no longer matches its entity DTO', async () => {
    const user = await member();
    await commands.create(user.session, purchase());
    await db.admin((client) => client.query(`UPDATE entity_changes SET snapshot = snapshot || '{"extra": 1}'::jsonb WHERE account_id = $1`, [user.accountId]));
    await expect(page(user.session)).rejects.toThrow();
  });

  it('a cursor is bound to its account and names a revision, nothing else', () => {
    const account = randomUUID();
    const cursor = encodeSyncCursor(account, '42');
    expect(cursor).toMatch(/^[A-Za-z0-9_-]{16,200}$/);
    expect(decodeSyncCursor(account, cursor)).toBe('42');
    expect(() => decodeSyncCursor(randomUUID(), cursor)).toThrow();
    expect(cursor).not.toContain(account);
  });
});

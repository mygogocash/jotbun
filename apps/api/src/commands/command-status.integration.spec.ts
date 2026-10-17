import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';

import { ProblemException } from '../common/api-problem.filter';
import { DatabaseService } from '../database/database.service';
import { authFixtures } from '../testing/auth-fixtures';
import type { SignedUp } from '../testing/auth-fixtures';
import { FIXTURE_ENTITY, acceptPolicies, createFixtureDomain, fixtureCommands, publishPolicies, purchase, registerFixtureDomain, startV1App } from '../testing/command-fixtures';
import { startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { CommandExecutor } from './command-executor';
import { CommandRegistry } from './command-registry';
import { requireLiveEntity } from './entity-state';

let db: TestDatabase;
let issuer: JwksFixture;
let pool: Pool;
let fx: ReturnType<typeof authFixtures>;
let v1: Awaited<ReturnType<typeof startV1App>>;
let app: NestExpressApplication;
let commands: ReturnType<typeof fixtureCommands>;

async function member(): Promise<SignedUp> {
  const user = await fx.signUp();
  await acceptPolicies(db, user.accountId);
  return user;
}

async function statusOf(user: SignedUp, ids: unknown) {
  const token = await issuer.accessToken({ sub: user.who.subject });
  return request(app.getHttpServer())
    .post('/v1/commands/status')
    .set({ 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${token}`, 'x-gogospend-session': user.binding })
    .send({ command_ids: ids });
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

beforeAll(async () => {
  db = await createTestDatabase();
  issuer = await startJwksFixture();
  pool = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 6);
  fx = authFixtures(issuer, pool);
  await createFixtureDomain(db);
  await publishPolicies(db);
  v1 = await startV1App(db, issuer);
  app = v1.app;
  registerFixtureDomain(app.get(CommandRegistry));
  commands = fixtureCommands(app.get(CommandExecutor));
});

afterAll(async () => {
  await v1?.close();
  await issuer?.close();
  await db?.drop();
});

describe('POST /v1/commands/status', () => {
  it('reports unknown for never-committed commands and the original acknowledgement otherwise', async () => {
    const user = await member();
    const ack = await commands.create(user.session, purchase());
    const never = randomUUID();
    const res = await statusOf(user, [ack.command_id, never]);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ statuses: [{ command_id: ack.command_id, state: 'known', ack }, { command_id: never, state: 'unknown' }] });
  });

  it("another account's commands look exactly like unknown ones", async () => {
    const owner = await member();
    const other = await member();
    const ack = await commands.create(owner.session, purchase());
    const res = await statusOf(other, [ack.command_id]);
    expect(res.body).toEqual({ statuses: [{ command_id: ack.command_id, state: 'unknown' }] });
  });

  it('reports a since-deleted entity as deleted, keeping the original version', async () => {
    const user = await member();
    const coffee = purchase();
    const created = await commands.create(user.session, coffee);
    await commands.remove(user.session, coffee.id, 1);
    const res = await statusOf(user, [created.command_id]);
    expect(res.body.statuses[0]).toEqual({ command_id: created.command_id, state: 'known', ack: { ...created, entity_state: 'deleted' } });
  });

  it('reports a purged entity as purged without reconstructing any of its data', async () => {
    const user = await member();
    const coffee = purchase({ note: 'private-note' });
    const created = await commands.create(user.session, coffee);
    // P5's purge marks the head purged and drops snapshots.
    await db.admin((client) => client.query(`UPDATE entity_heads SET state = 'purged', version = version + 1 WHERE account_id = $1`, [user.accountId]));
    const res = await statusOf(user, [created.command_id]);
    expect(res.body.statuses[0].ack.entity_state).toBe('purged');
    expect(JSON.stringify(res.body)).not.toMatch(/private-note|6500/);
  });

  it.each([
    ['empty', []],
    ['too many', Array.from({ length: 101 }, () => randomUUID())],
    ['not UUIDs', ['not-a-uuid']],
    ['not a list', 'x'],
  ])('rejects %s command ids', async (_label, ids) => {
    const user = await member();
    const res = await statusOf(user, ids);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('accepts exactly 100 ids', async () => {
    const user = await member();
    const res = await statusOf(user, Array.from({ length: 100 }, () => randomUUID()));
    expect(res.status).toBe(200);
    expect(res.body.statuses).toHaveLength(100);
  });

  it('needs a bound session but not current policy acceptance', async () => {
    const pending = await fx.signUp();
    expect((await statusOf(pending, [randomUUID()])).status).toBe(200);
    const token = await issuer.accessToken({ sub: pending.who.subject });
    const unbound = await request(app.getHttpServer()).post('/v1/commands/status').set({ 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${token}` }).send({ command_ids: [randomUUID()] });
    expect(unbound.status).toBe(401);
  });
});

describe('entity state for later commands', () => {
  const live = (user: SignedUp, id: string) => new DatabaseService(pool).withOwnerTransaction(user.session, (tx) => requireLiveEntity(tx, FIXTURE_ENTITY, id));

  it('a deleted entity is ENTITY_DELETED and a purged one ENTITY_PURGED', async () => {
    const user = await member();
    const coffee = purchase();
    await commands.create(user.session, coffee);
    expect(await live(user, coffee.id)).toEqual({ version: 1, state: 'active' });
    await commands.remove(user.session, coffee.id, 1);
    expect(await code(() => live(user, coffee.id))).toBe('409 ENTITY_DELETED');
    await db.admin((client) => client.query(`UPDATE entity_heads SET state = 'purged', version = version + 1 WHERE account_id = $1`, [user.accountId]));
    expect(await code(() => live(user, coffee.id))).toBe('410 ENTITY_PURGED');
  });

  it("another account's entity is NOT_FOUND, exactly like a missing one", async () => {
    const owner = await member();
    const other = await member();
    const coffee = purchase();
    await commands.create(owner.session, coffee);
    expect(await code(() => live(other, coffee.id))).toBe('404 NOT_FOUND');
    expect(await code(() => live(other, randomUUID()))).toBe('404 NOT_FOUND');
  });

  it('a stale version on a later command is VERSION_CONFLICT with no receipt or revision', async () => {
    const user = await member();
    const coffee = purchase();
    await commands.create(user.session, coffee);
    const commandId = randomUUID();
    expect(await code(() => commands.remove(user.session, coffee.id, 7, commandId))).toBe('409 VERSION_CONFLICT');
    expect((await statusOf(user, [commandId])).body.statuses[0].state).toBe('unknown');
  });
});

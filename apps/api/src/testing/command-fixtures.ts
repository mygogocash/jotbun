// A compile-safe fixture domain for exercising the command executor without
// a real business table: `fixture_purchases`, created in the disposable test
// database only, with the same owner RLS shape as real domain tables.
// Test use only.
import { randomUUID } from 'node:crypto';

import type { CommandAck, SessionContext } from '@gogospend/contracts';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import type { CommandExecutor, MutationResult } from '../commands/command-executor';
import type { CommandRegistry } from '../commands/command-registry';
import { requireLiveEntity } from '../commands/entity-state';
import { ProblemException } from '../common/api-problem.filter';
import type { OwnerTx } from '../database/owner-transaction';
import { V1AppModule, configureV1App } from '../v1/v1-app.module';
import { TEST_AUDIENCE, TEST_CLIENT_ID } from './jwks-server';
import type { JwksFixture } from './jwks-server';
import type { TestDatabase } from './postgres-harness';

export const FIXTURE_ENTITY = 'fixture_purchase';
export type FixturePurchase = { id: string; amount_minor: string; note: string | null };

export async function createFixtureDomain(db: TestDatabase): Promise<void> {
  await db.admin(async (client) => {
    await client.query(`CREATE TABLE fixture_purchases (
      account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
      id uuid NOT NULL,
      amount_minor bigint NOT NULL CHECK (amount_minor > 0),
      note text,
      version integer NOT NULL CHECK (version >= 1),
      deleted boolean NOT NULL DEFAULT false,
      PRIMARY KEY (account_id, id))`);
    await client.query('ALTER TABLE fixture_purchases ENABLE ROW LEVEL SECURITY');
    await client.query(`CREATE POLICY fixture_purchases_owner ON fixture_purchases TO gogospend_app
      USING (account_id = gogospend_current_account()) WITH CHECK (account_id = gogospend_current_account())`);
    await client.query('GRANT SELECT, INSERT, UPDATE ON fixture_purchases TO gogospend_app');
  });
}

/** Required terms v1 and a privacy policy, published; see `acceptPolicies`. */
export async function publishPolicies(db: TestDatabase): Promise<void> {
  await db.admin((client) =>
    client.query(`INSERT INTO policy_versions (kind, version, required, published_at, text_th, text_en)
      VALUES ('terms', 1, true, now() - interval '1 day', 'ข้อกำหนด', 'Terms'), ('privacy', 1, false, now() - interval '1 day', 'ความเป็นส่วนตัว', 'Privacy')
      ON CONFLICT DO NOTHING`),
  );
}

export async function acceptPolicies(db: TestDatabase, accountId: string): Promise<void> {
  await db.admin((client) => client.query(`INSERT INTO consents (account_id, kind, version, granted) VALUES ($1, 'terms', 1, true) ON CONFLICT DO NOTHING`, [accountId]));
}

function isFixtureSnapshot(value: unknown): boolean {
  const snapshot = value as Partial<FixturePurchase> | null;
  return (
    typeof snapshot === 'object' && snapshot !== null &&
    Object.keys(snapshot).sort().join(',') === 'amount_minor,id,note' &&
    typeof snapshot.id === 'string' && typeof snapshot.amount_minor === 'string' &&
    (snapshot.note === null || typeof snapshot.note === 'string')
  );
}

export function registerFixtureDomain(registry: CommandRegistry, createSchemas: readonly number[] = [1, 2]): void {
  registry.defineEntity({ entity: FIXTURE_ENTITY, validate: isFixtureSnapshot });
  registry.defineCommand({ kind: 'fixture.purchase.create', entity: FIXTURE_ENTITY, outcome: 'created', schemaVersions: createSchemas, policy: 'current' });
  registry.defineCommand({ kind: 'fixture.purchase.delete', entity: FIXTURE_ENTITY, outcome: 'deleted', schemaVersions: [1], policy: 'current' });
  registry.defineCommand({ kind: 'fixture.export', entity: FIXTURE_ENTITY, outcome: 'accepted', schemaVersions: [1], policy: 'exempt' });
}

export type CreateOptions = {
  commandId?: string;
  schemaVersion?: number;
  /** Runs inside the mutation, under the account lock, before the write. */
  during?: (tx: OwnerTx) => Promise<void>;
  /** Overrides the returned mutation result (to test the change writer's checks). */
  result?: (purchase: FixturePurchase) => MutationResult;
};

/** Fixture commands through a given executor, counting mutation executions. */
export function fixtureCommands(executor: CommandExecutor) {
  const counter = { executions: 0 };

  function create(session: SessionContext, purchase: FixturePurchase, options: CreateOptions = {}): Promise<CommandAck> {
    return executor.run(session, { commandId: options.commandId ?? randomUUID(), kind: 'fixture.purchase.create', schemaVersion: options.schemaVersion ?? 1, payload: purchase }, async (tx) => {
      counter.executions += 1;
      await options.during?.(tx);
      await tx.query('INSERT INTO fixture_purchases (account_id, id, amount_minor, note, version) VALUES (gogospend_current_account(), $1, $2, $3, 1)', [purchase.id, purchase.amount_minor, purchase.note]);
      if (options.result) return options.result(purchase);
      return { entityId: purchase.id, version: 1, changes: [{ entity: FIXTURE_ENTITY, id: purchase.id, version: 1, state: 'active', snapshot: purchase }] };
    });
  }

  function remove(session: SessionContext, id: string, expectedVersion: number, commandId: string = randomUUID()): Promise<CommandAck> {
    return executor.run(session, { commandId, kind: 'fixture.purchase.delete', schemaVersion: 1, payload: { id }, expectedVersion }, async (tx) => {
      counter.executions += 1;
      const head = await requireLiveEntity(tx, FIXTURE_ENTITY, id);
      if (head.version !== expectedVersion) throw new ProblemException(409, 'VERSION_CONFLICT');
      const [row] = await tx.query<{ amount_minor: string; note: string | null; version: number }>(
        'UPDATE fixture_purchases SET deleted = true, version = version + 1 WHERE id = $1 RETURNING amount_minor::text, note, version',
        [id],
      );
      return { entityId: id, version: row.version, changes: [{ entity: FIXTURE_ENTITY, id, version: row.version, state: 'deleted', snapshot: { id, amount_minor: row.amount_minor, note: row.note } }] };
    });
  }

  return { counter, create, remove };
}

export const purchase = (overrides: Partial<FixturePurchase> = {}): FixturePurchase => ({ id: randomUUID(), amount_minor: '6500', note: 'coffee', ...overrides });

/** The real v1 app on a test database and synthetic issuer. */
export async function startV1App(db: TestDatabase, issuer: JwksFixture): Promise<{ app: NestExpressApplication; close(): Promise<void> }> {
  const settings: Record<string, string> = {
    DATABASE_URL: await db.loginUrl(['gogospend_app', 'gogospend_bootstrap']),
    AUTH0_ISSUER: issuer.issuer,
    AUTH0_AUDIENCE: TEST_AUDIENCE,
    AUTH0_ALLOWED_CLIENT_IDS: TEST_CLIENT_ID,
    RATE_LIMIT_KEY: 'synthetic-test-key-0123456789abcdef0123456789',
    COMMAND_DIGEST_KEY: 'synthetic-command-digest-key-0123456789abcdef',
    MIN_CLIENT_VERSION_IOS: '1.0.0',
    MIN_CLIENT_VERSION_ANDROID: '1.0.0',
    OBJECT_STORE: 'memory',
  };
  const saved = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
  const app = await NestFactory.create<NestExpressApplication>(V1AppModule, { bodyParser: false, logger: false, abortOnError: false });
  configureV1App(app);
  await app.init();
  return {
    app,
    async close() {
      await app.close();
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

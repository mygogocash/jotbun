import { DatabaseService } from '../database/database.service';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { createV1App } from './v1-app.module';

const ACCOUNT = '0192f0c1-7b3a-7c3e-9d4f-0000000000aa';

let db: TestDatabase;
// Synthetic configuration only; no tenant is contacted at startup.
const v1Settings = {
  AUTH0_ISSUER: 'https://gogospend-test.invalid/',
  AUTH0_AUDIENCE: 'https://api.gogospend.test',
  AUTH0_ALLOWED_CLIENT_IDS: 'native-client-test',
  RATE_LIMIT_KEY: 'synthetic-test-key-0123456789abcdef0123456789',
  COMMAND_DIGEST_KEY: 'synthetic-command-digest-key-0123456789abcdef',
  MIN_CLIENT_VERSION_IOS: '1.0.0',
  MIN_CLIENT_VERSION_ANDROID: '1.0.0',
  OBJECT_STORE: 'memory',
};
const saved = Object.fromEntries(['DATABASE_URL', 'MONGO_URI', ...Object.keys(v1Settings)].map((key) => [key, process.env[key]]));

beforeAll(async () => {
  db = await createTestDatabase();
  Object.assign(process.env, v1Settings);
});

afterAll(async () => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await db?.drop();
});

it('starts on PostgreSQL alone, with no Mongo configuration, as a non-owner login', async () => {
  process.env.DATABASE_URL = await db.loginUrl(['gogospend_app', 'gogospend_bootstrap']);
  delete process.env.MONGO_URI;
  const app = await createV1App();
  try {
    await app.listen(0, '127.0.0.1');
    const response = await fetch(`${await app.getUrl()}/v1/unregistered`);
    expect(response.status).toBe(404);
    const service = app.get(DatabaseService);
    const session = { accountId: ACCOUNT, subject: 'auth0|x', clientId: 'test', bindingId: 'test', sessionGeneration: 0 };
    await expect(service.withOwnerTransaction(session, (tx) => tx.query('SELECT current_user = session_user AS plain_login'))).resolves.toEqual([{ plain_login: true }]);
  } finally {
    await app.close();
  }
});

it.each([
  ['a superuser login', () => Promise.resolve(db.adminUrl)],
  ['a login that is a member of the table owner', async () => {
    const url = await db.loginUrl(['gogospend_app']);
    const login = decodeURIComponent(new URL(url).username);
    await db.admin((client) => client.query(`GRANT gogospend_local_admin TO ${login}`));
    return url;
  }],
])('refuses to start on %s', async (_name, makeUrl) => {
  process.env.DATABASE_URL = await makeUrl();
  await expect(createV1App()).rejects.toThrow(/least-privilege/);
});

it.each([
  ['no AUTH0_ISSUER', { AUTH0_ISSUER: undefined }],
  ['no allowed client ids', { AUTH0_ALLOWED_CLIENT_IDS: '' }],
  ['no iOS minimum version', { MIN_CLIENT_VERSION_IOS: undefined }],
  ['a short RATE_LIMIT_KEY', { RATE_LIMIT_KEY: 'too-short' }],
  ['TRUST_PROXY_HOPS unset in production', { NODE_ENV: 'production', TRUST_PROXY_HOPS: undefined }],
])('refuses to start with %s', async (_name, override: Record<string, string | undefined>) => {
  process.env.DATABASE_URL = await db.loginUrl(['gogospend_app', 'gogospend_bootstrap']);
  const before = Object.fromEntries(Object.keys(override).map((key) => [key, process.env[key]]));
  const apply = (values: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  apply(override);
  try {
    await expect(createV1App()).rejects.toThrow();
  } finally {
    apply(before);
  }
});

it('fails fast without DATABASE_URL instead of starting unconfigured', async () => {
  delete process.env.DATABASE_URL;
  await expect(createV1App()).rejects.toThrow(/not configured/);
});

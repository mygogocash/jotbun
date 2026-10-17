import { DatabaseService } from '../database/database.service';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { createV1App } from './v1-app.module';

const ACCOUNT = '0192f0c1-7b3a-7c3e-9d4f-0000000000aa';

let db: TestDatabase;
const saved = { DATABASE_URL: process.env.DATABASE_URL, MONGO_URI: process.env.MONGO_URI };

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  process.env.DATABASE_URL = saved.DATABASE_URL;
  process.env.MONGO_URI = saved.MONGO_URI;
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

it('fails fast without DATABASE_URL instead of starting unconfigured', async () => {
  delete process.env.DATABASE_URL;
  await expect(createV1App()).rejects.toThrow(/not configured/);
});

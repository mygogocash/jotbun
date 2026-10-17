// The mobile app's own v1 adapter (apps/app/src/spend/v1) against the real
// v1 API: proves the app's strict DTO validators, command headers and money
// handling agree with what the server actually sends. Synthetic issuer and a
// disposable database only; no native build or tenant is involved.
import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import { createV1Transport } from '../../../app/src/api/client';
import { formatMinor, parseAmountInput } from '../../../app/src/spend/v1/money';
import { createSpendV1Resources } from '../../../app/src/spend/v1/resources';
import type { SpendV1Resources } from '../../../app/src/spend/v1/resources';
import { byId, recordView, walletsTotal } from '../../../app/src/spend/v1/viewModels';
import { authFixtures } from '../testing/auth-fixtures';
import type { SignedUp } from '../testing/auth-fixtures';
import { acceptPolicies, publishPolicies, startV1App } from '../testing/command-fixtures';
import { startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';

let db: TestDatabase;
let issuer: JwksFixture;
let pool: Pool;
let fx: ReturnType<typeof authFixtures>;
let v1: Awaited<ReturnType<typeof startV1App>>;
let baseUrl: string;

function appFor(user: SignedUp): SpendV1Resources {
  return createSpendV1Resources(createV1Transport({
    baseUrl,
    client: { platform: 'ios', version: '1.0.0' },
    credentials: {
      getAccessToken: () => issuer.accessToken({ sub: user.who.subject }),
      getSessionSnapshot: () => ({ binding: user.binding, epoch: 1 }),
    },
  }));
}

beforeAll(async () => {
  db = await createTestDatabase();
  issuer = await startJwksFixture();
  pool = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 6);
  fx = authFixtures(issuer, pool);
  await publishPolicies(db);
  v1 = await startV1App(db, issuer);
  await v1.app.listen(0, '127.0.0.1');
  baseUrl = (await v1.app.getUrl()).replace('[::1]', '127.0.0.1');
});

afterAll(async () => {
  await v1?.close();
  await issuer?.close();
  await db?.drop();
});

test('the golden journey through the app adapter reconciles exactly', async () => {
  const user = await fx.signUp();
  await acceptPolicies(db, user.accountId);
  const app = appFor(user);
  const categories = await app.ensureBuiltinCategories();
  const key = (name: string) => categories.find((category) => category.builtin_key === name)!.id;
  const cash = randomUUID();
  const daily = randomUUID();
  await app.createWallet({ id: cash, name: 'Cash', opening_minor: parseAmountInput('4,032', 'en'), tracking_start: '2026-09-01' }, randomUUID());
  await app.createWallet({ id: daily, name: 'Daily account', opening_minor: parseAmountInput('1,468', 'en'), tracking_start: '2026-09-01' }, randomUUID());
  await app.createTransaction({ id: randomUUID(), type: 'income', amount_minor: parseAmountInput('28,000', 'en'), occurred_on: '2026-09-25', wallet_id: daily, category_id: key('salary'), note: 'September salary' }, randomUUID());
  await app.createTransaction({ id: randomUUID(), type: 'expense', amount_minor: parseAmountInput('182', 'en'), occurred_on: '2026-09-26', wallet_id: cash, category_id: key('food') }, randomUUID());
  const rent = randomUUID();
  await app.createTransaction({ id: rent, type: 'expense', amount_minor: parseAmountInput('12,268', 'en'), occurred_on: '2026-09-27', wallet_id: daily, category_id: key('bills'), note: 'Rent' }, randomUUID());
  const transferKey = randomUUID();
  const transfer = { id: randomUUID(), amount_minor: parseAmountInput('1,500', 'en'), occurred_on: '2026-09-28', source_wallet_id: cash, destination_wallet_id: daily };
  const first = await app.createTransfer(transfer, transferKey);
  // A resent command (lost response) replays the same acknowledgement.
  expect(await app.createTransfer(transfer, transferKey)).toEqual(first);

  const wallets = await app.wallets();
  expect(wallets.map((wallet) => [wallet.name, formatMinor(wallet.balance_minor, 'en')])).toEqual([['Cash', '฿2,350.00'], ['Daily account', '฿18,700.00']]);
  expect(formatMinor(walletsTotal(wallets), 'en')).toBe('฿21,050.00');

  const summary = await app.summary('2026-09');
  expect([summary.income_minor, summary.expense_minor]).toEqual(['2800000', '1245000']);
  const page = await app.history({ from: '2026-09-01', through: '2026-09-30', sort: 'date_desc' });
  expect(page.items).toHaveLength(4);
  const rows = page.items.map((record) => recordView(record, { wallets: byId(wallets), categories: byId(categories) }, (text) => text, 'en'));
  expect(rows.map((row) => row.amountText)).toEqual(['฿1,500.00', '-฿12,268.00', '-฿182.00', '+฿28,000.00']);

  // Versioned edit, a stale edit's conflict, delete and undo, all through the adapter.
  const edited = await app.updateTransaction(rent, 1, { amount_minor: '1200000' }, randomUUID());
  expect(edited.version).toBe(2);
  await expect(app.updateTransaction(rent, 1, { amount_minor: '1' }, randomUUID())).rejects.toMatchObject({ outcome: 'conflict', current: expect.objectContaining({ id: rent, version: 2 }) });
  const deleted = await app.deleteTransaction(rent, 2, randomUUID());
  expect(deleted.entity_state).toBe('deleted');
  await app.restoreTransaction(rent, deleted.version, randomUUID());
  expect((await app.transaction(rent)).amount_minor).toBe('1200000');
  expect(await app.budget('2026-09')).toBeNull();
  expect((await app.commandStatus([transferKey]))[0]).toMatchObject({ state: 'known' });
});

test('an app build below the minimum version is told to upgrade, not signed out', async () => {
  const user = await fx.signUp();
  const old = createSpendV1Resources(createV1Transport({
    baseUrl,
    client: { platform: 'android', version: '0.9.0' },
    credentials: { getAccessToken: () => issuer.accessToken({ sub: user.who.subject }), getSessionSnapshot: () => ({ binding: user.binding, epoch: 1 }) },
  }));
  await expect(old.wallets()).rejects.toMatchObject({ outcome: 'upgrade_required', status: 426 });
});

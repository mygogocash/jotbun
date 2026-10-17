// Money fixtures for HTTP specs: a signed-up member with accepted policies,
// seeded built-in categories and named wallets. Test use only.
import { randomUUID } from 'node:crypto';

import type { BuiltinCategoryKey } from '@gogospend/contracts';

import { derivedUuid } from '../commands/derived-id';
import type { SignedUp, authFixtures } from './auth-fixtures';
import { acceptPolicies } from './command-fixtures';
import type { TestDatabase } from './postgres-harness';
import type { v1Client } from './v1-client';

type Client = ReturnType<ReturnType<typeof v1Client>>;

export const builtinId = (user: SignedUp, key: BuiltinCategoryKey) => derivedUuid(user.accountId, 'builtin-category', key);

export async function expectOk(res: { status: number; body: unknown }, status = 200): Promise<void> {
  if (res.status !== status) throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
}

export function moneyFixtures(db: TestDatabase, fx: ReturnType<typeof authFixtures>, as: (user: SignedUp) => Client) {
  async function member(): Promise<SignedUp> {
    const user = await fx.signUp();
    await acceptPolicies(db, user.accountId);
    await expectOk(await as(user).post('/v1/categories/builtins'));
    return user;
  }

  async function wallet(user: SignedUp, overrides: Record<string, unknown> = {}): Promise<string> {
    const body = { id: randomUUID(), name: 'Cash', opening_minor: '0', tracking_start: '2026-01-01', ...overrides };
    await expectOk(await as(user).post('/v1/wallets', body), 201);
    return body.id;
  }

  async function record(user: SignedUp, body: Record<string, unknown>): Promise<string> {
    const id = (body.id as string | undefined) ?? randomUUID();
    await expectOk(await as(user).post('/v1/transactions', { id, ...body }), 201);
    return id;
  }

  async function balances(user: SignedUp): Promise<Record<string, string>> {
    const wallets = (await as(user).get('/v1/wallets')).body as { id: string; balance_minor: string }[];
    return Object.fromEntries(wallets.map((w) => [w.id, w.balance_minor]));
  }

  return { member, wallet, record, balances };
}

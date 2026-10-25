// Money fixtures for the vault's workers tests: a member with the terms accepted
// and the built-in categories seeded, named wallets, records and the golden
// diary. The vault's port of apps/api/src/testing/money-fixtures.ts, over the
// Worker's client instead of the PostgreSQL harness.
import { randomUUID } from 'node:crypto'

import { derivedUuid } from '@api/commands/derived-id'
import { GOLDEN_RECORDS, GOLDEN_START, GOLDEN_WALLETS } from '@api/transactions/fixtures/golden-diary'

import { member as acceptTerms } from './v1-client'
import type { TestUser, V1Client } from './v1-client'

/** A built-in category's id for this person, as the vault derives it when it seeds the built-ins. */
export const builtinId = (user: TestUser, key: string): string => derivedUuid(user.sub, 'builtin-category', key)

export type Golden = { user: TestUser; wallets: { cash: string; daily: string }; records: string[] }

async function expectStatus(res: Response, status: number): Promise<void> {
  if (res.status !== status) throw new Error(`expected ${status}, got ${res.status}: ${await res.text()}`)
}

export function moneyFixtures(client: V1Client) {
  /** A person who accepted the terms and has the built-in categories. */
  async function member(): Promise<TestUser> {
    const user = await acceptTerms(client)
    await expectStatus(await client.as(user).post('/v1/categories/builtins'), 200)
    return user
  }

  async function wallet(user: TestUser, overrides: Record<string, unknown> = {}): Promise<string> {
    const body = { id: randomUUID(), name: 'Cash', opening_minor: '0', tracking_start: '2026-01-01', ...overrides }
    await expectStatus(await client.as(user).post('/v1/wallets', body), 201)
    return body.id as string
  }

  async function record(user: TestUser, body: Record<string, unknown>): Promise<string> {
    const id = (body.id as string | undefined) ?? randomUUID()
    await expectStatus(await client.as(user).post('/v1/transactions', { ...body, id }), 201)
    return id
  }

  /** Each wallet's derived balance, from GET /v1/wallets. */
  async function balances(user: TestUser): Promise<Record<string, string>> {
    const wallets = (await (await client.as(user).get('/v1/wallets')).json()) as { id: string; balance_minor: string }[]
    return Object.fromEntries(wallets.map((w) => [w.id, w.balance_minor]))
  }

  /** The pinned golden diary for a new member; records in GOLDEN_RECORDS order. */
  async function golden(): Promise<Golden> {
    const user = await member()
    const wallets = {
      cash: await wallet(user, { ...GOLDEN_WALLETS.cash, tracking_start: GOLDEN_START }),
      daily: await wallet(user, { ...GOLDEN_WALLETS.daily, tracking_start: GOLDEN_START }),
    }
    const records: string[] = []
    for (const item of GOLDEN_RECORDS) {
      const base = { type: item.type, amount_minor: item.amount_minor, occurred_on: item.occurred_on, note: item.note }
      records.push(
        await record(
          user,
          item.type === 'transfer'
            ? { ...base, source_wallet_id: wallets[item.source], destination_wallet_id: wallets[item.destination] }
            : { ...base, wallet_id: wallets[item.wallet], category_id: builtinId(user, item.category) },
        ),
      )
    }
    return { user, wallets, records }
  }

  return { member, wallet, record, balances, golden }
}

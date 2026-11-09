import { Pool } from 'pg'

import { featureGatesFromEnv } from '@api/common/feature-gates'
import type { FeatureGates } from '@api/common/feature-gates'

import { hyperdrivePoolConfig } from '../server/db/request-pool'
import { nodeEnvFor, settingsOf } from '../server/env'
import type { Settings } from '../server/jobs/roles'

// Shared glue for the background Workers (jobs, security, deletion). Each is
// its own Worker with its own Hyperdrive logins and secrets, as each was its
// own process in the API, so a leak of one never exposes the others'
// credentials.

export type HyperdriveLike = { connectionString: string }
export type MessageLike = { ack(): void }
export type BatchLike = { messages: readonly MessageLike[] }
export type ScheduledLike = { scheduledTime: number; cron: string }

/** A Cron or queue invocation may run for minutes; leave room under the 15-minute wall limit. */
export const RUN_BUDGET_MS = 10 * 60_000

/** The fetch the shared clients receive (src/server/http/fetch.ts). */
export { workerFetch } from '../server/http/fetch'

/** The Worker's string settings, with NODE_ENV as the HTTP Worker sets it (loopback http only outside production). */
export function settingsAndGates(env: object): { settings: Settings; gates: FeatureGates } {
  const settings: Settings = { ...settingsOf(env as Record<string, unknown>) }
  settings.NODE_ENV = nodeEnvFor(settings)
  return { settings, gates: featureGatesFromEnv(settings as NodeJS.ProcessEnv) }
}

/** A pool for one invocation on a Hyperdrive login; Workers cannot keep sockets between invocations. */
export function poolOf(binding: HyperdriveLike | undefined, name: string): Pool {
  if (!binding?.connectionString) throw new Error(`${name} is not bound.`)
  return new Pool(hyperdrivePoolConfig(binding.connectionString))
}

/** Runs `fn` with the invocation's pools and ends them however it finishes. */
export async function withPools<T>(pools: Pool[], fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } finally {
    await Promise.allSettled(pools.map((pool) => pool.end()))
  }
}

/** Wake-ups carry nothing: PostgreSQL holds the work, so every message is acknowledged once the run starts. */
export function ackAll(batch: BatchLike): void {
  for (const message of batch.messages) message.ack()
}

/** The role Workers answer no HTTP request (Cron Triggers and queues only). */
export function noHttp(): Response {
  return new Response(null, { status: 404 })
}

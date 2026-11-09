// The import parser container: the API's own parser (apps/api
// src/imports/parse-worker.ts, in the API's release image) in a Cloudflare
// Container, because a parse needs what a Worker isolate cannot give it: a
// Node child process under Node's permission model (no network, no file
// writes, no processes) and libvips for receipt images, within the reviewed
// 512 MiB budget. The jobs Worker wakes it when parses are due; it claims
// `import_parse` only and exits once the queue has been idle, so it runs
// only while uploads wait.
import { DurableObject } from 'cloudflare:workers'
import type { Pool } from 'pg'

import { queueAge } from '@api/common/operational-metrics'

/** The parser's Durable Object namespace, as the jobs Worker binds it. */
export type ParserBinding = { getByName(name: string): { fetch(input: string, init?: RequestInit): Promise<Response> } }

/**
 * What the container receives, and nothing else: the gogospend_jobs login,
 * the bucket's S3 credentials (the parse worker uses the API's S3 adapter;
 * R2 keeps the digest the edge's binding adapter reads) and the gates.
 */
export type ParserEnv = {
  PARSER_DATABASE_URL?: string
  R2_ENDPOINT?: string
  R2_BUCKET?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  OPERATIONAL_PAUSE?: string
  PARSE_WORKER_IDLE_EXIT_SECONDS?: string
}

const PASSED = ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'OPERATIONAL_PAUSE', 'PARSE_WORKER_IDLE_EXIT_SECONDS'] as const

/** The container's environment (the parser child it starts gets TZ only). */
export function parserEnvOf(env: ParserEnv): Record<string, string> {
  if (!env.PARSER_DATABASE_URL) throw new Error('PARSER_DATABASE_URL is not set.')
  const out: Record<string, string> = { NODE_ENV: 'production', TZ: 'UTC', DATABASE_URL: env.PARSER_DATABASE_URL }
  for (const name of PASSED) {
    const value = env[name]
    if (value) out[name] = value
  }
  return out
}

/** The release image's parse worker process (apps/api/Dockerfile; its working directory is apps/api). */
export const PARSER_COMMAND = ['node', 'dist/imports/parse-worker.js']

/** One parser for the whole account base, as the API runs one job worker (parser concurrency one). */
export const PARSER_NAME = 'import-parser'

export class ImportParser extends DurableObject<ParserEnv> {
  /** Starts the parse worker unless it is already running; it stops itself when idle. */
  async fetch(): Promise<Response> {
    const container = this.ctx.container
    if (!container) return new Response(null, { status: 503 })
    if (!container.running) {
      // Internet for PostgreSQL and R2; each parser child is denied the network by Node's permission model.
      container.start({ entrypoint: PARSER_COMMAND, env: parserEnvOf(this.env), enableInternet: true })
      this.ctx.waitUntil(
        container.monitor().then(
          () => console.log('parse worker: container exited'),
          () => console.error('parse worker: container failed'),
        ),
      )
    }
    return new Response(null, { status: 202 })
  }
}

/** Wakes the parser when an `import_parse` job is due (read on the jobs Worker's own login). */
export async function wakeParser(binding: ParserBinding, jobsPool: Pool): Promise<boolean> {
  const [due] = await queueAge(jobsPool, ['import_parse'])
  if (!due || due.due === 0) return false
  const res = await binding.getByName(PARSER_NAME).fetch('https://import-parser/wake', { method: 'POST' })
  await res.body?.cancel()
  return res.status === 202
}

// C1 (B15): the vault, its Workflows, its parse queue consumer and its
// container live in the one HTTP Worker, and the PostgreSQL edge's Workers are
// gone. Read from the files as written: wrangler.jsonc keeps every comment on
// a line of its own, so dropping those lines leaves plain JSON.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const EDGE = fileURLToPath(new URL('../', import.meta.url))
const read = (file: string) => readFileSync(join(EDGE, file), 'utf8')
const readJsonc = (file: string) =>
  JSON.parse(
    read(file)
      .split('\n')
      .filter((line) => !/^\s*\/\//.test(line))
      .join('\n'),
  )

const RETENTION = { success_retention: '1 day', error_retention: '7 days' }

describe('C1: the vault moves into the HTTP Worker', () => {
  it('one Worker hosts the vault, its Workflows, its queue consumer and its container', () => {
    const config = readJsonc('wrangler.jsonc')
    expect([config.name, config.main]).toEqual(['jotbun-edge', 'src/server.ts'])
    expect(config.hyperdrive).toBeUndefined()
    expect(config.limits.cpu_ms).toBe(120000)
    expect(config.durable_objects.bindings.map((b: { name: string }) => b.name).sort()).toEqual(['PARSER', 'VAULT'])
    expect(config.migrations).toEqual([
      { tag: 'v1-user-vault', new_sqlite_classes: ['UserVault'] },
      { tag: 'v2-statement-parser', new_sqlite_classes: ['StatementParser'] },
    ])
    expect(config.workflows.map((w: { binding: string }) => w.binding).sort()).toEqual(['EXPORT_WORKFLOW', 'SNAPSHOT_WORKFLOW'])
    // The 1B-T12 review's n1: without a retention, Paid's 30-day default would keep a finished instance, and
    // createOnce would count a resent request's id as started long after its instance ended.
    expect(config.workflows.map((w: { default_retention: unknown }) => w.default_retention)).toEqual([RETENTION, RETENTION])
    expect(config.queues.producers.map((p: { binding: string }) => p.binding)).toEqual(['PARSE_QUEUE'])
    expect(config.queues.consumers.map((c: { queue: string }) => c.queue)).toEqual(['jotbun-statement-parse'])
    expect(config.containers.map((c: { class_name: string }) => c.class_name)).toEqual(['StatementParser'])
    expect(config.dev.enable_containers).toBe(false)
    // The 1B-T12 review's n7: the parity copy (B13, test/support/vault-worker.ts) leaves out Workflows, queue
    // consumers and containers only. A Cron Trigger added here would need leaving out there too.
    expect(config.triggers).toBeUndefined()
    expect([config.r2_buckets[0].binding, config.kv_namespaces[0].binding]).toEqual(['OBJECTS', 'CONFIG'])
    // Better Auth's databases and the email binding (1C-T1) stay with the merge.
    expect([config.d1_databases.map((d: { binding: string }) => d.binding), config.send_email.map((e: { name: string }) => e.name)]).toEqual([['AUTH_DB', 'ERASURE_DB'], ['EMAIL']])
    for (const gone of ['wrangler.vault.jsonc', 'wrangler.jobs.jsonc', 'wrangler.security.jsonc', 'wrangler.deletion.jsonc', 'src/roles', 'src/server/app', 'src/server/db', 'src/server/jobs', 'src/server/worker.ts']) {
      expect(existsSync(join(EDGE, gone)), gone).toBe(false)
    }
    expect(read('vite.config.ts')).not.toMatch(/auxiliaryWorkers/)
    const server = read('src/server.ts')
    expect(server).toMatch(/export \{[^}]*UserVault[^}]*\}/)
    for (const name of ['ExportWorkflow', 'SnapshotWorkflow', 'StatementParser', 'UserVault']) {
      expect(server, name).toMatch(new RegExp(`export \\{[^}]*\\b${name}\\b[^}]*\\} from '\\./vault-worker'`))
    }
    expect(server).toMatch(/queue: vaultWorker\.queue/)
  })

  it('the Workers-runtime tests load the vault module, never TanStack Start, on the one config (B15)', () => {
    const workers = read('vitest.workers.config.ts')
    expect(workers).toMatch(/main: '\.\/src\/vault-worker\.ts'/)
    expect(workers).toMatch(/configPath: '\.\/wrangler\.jsonc'/)
  })
})

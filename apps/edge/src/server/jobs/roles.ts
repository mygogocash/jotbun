import type { Pool } from 'pg'

import { receiptCleanupOverdue } from '@api/attachments/receipt-cleanup'
import { managementConfigFromEnv } from '@api/auth/auth0-management-api'
import { Auth0MaintenanceClient } from '@api/auth/auth0-management.client'
import { Auth0ProfileClient, profileGatewayFromEnv } from '@api/auth/auth0-profile.client'
import { SecurityJobRepository, runSecurityJobsOnce } from '@api/auth/security-job.repository'
import { ConfigurationError } from '@api/common/configuration-error'
import type { FeatureGates } from '@api/common/feature-gates'
import { failureName, queueAge, queueAgeLines } from '@api/common/operational-metrics'
import { LeasedAccountRead } from '@api/database/leased-account-read'
import { ExportHandler, exportCleanupOverdue } from '@api/exports/export-handler'
import { ImportExpiry, importMaintenance, quarantineCleanupOverdue } from '@api/imports/import-expiry'
import { HandlerRegistry } from '@api/jobs/handler-registry'
import { JobRepository } from '@api/jobs/job.repository'
import { JobWorker } from '@api/jobs/worker'
import { assertLoginRoles } from '@api/jobs/worker-login'
import { DeletionHandler, DeletionRepository } from '@api/privacy/deletion-handler'
import { LookupKey, PostgresErasureRegistry } from '@api/privacy/erasure-registry'
import { defaultPrivacySteps } from '@api/privacy/privacy-steps'
import { RetentionHandler } from '@api/privacy/retention-handler'
import { ObjectPublicationService } from '@api/storage/object-publication.service'
import type { ObjectStore } from '@api/storage/object-store'
import { SnapshotBuilder } from '@api/sync/snapshot-builder'

// The API's three background processes (worker.ts, jobs/security-worker.ts,
// privacy/deletion-worker.ts) as functions a Worker runs per Cron Trigger or
// queue wake-up. Each keeps its own least-privilege login, checked on every
// run as the API checks it at start; the same log lines (counts only, never
// subjects, payloads or error text), so the API's alerts carry over.

export type Settings = Record<string, string | undefined>
export type Log = { info(line: string): void; error(line: string): void }

export const consoleLog: Log = { info: (line) => console.log(line), error: (line) => console.error(line) }

/**
 * Runs claimed jobs one at a time until none is due or the budget is spent:
 * one invocation's share of the API's poll loop. Leases make an overlapping
 * invocation safe; whatever is left is claimed by the next one.
 */
export async function drain(worker: JobWorker, budgetMs: number, now: () => number = Date.now): Promise<number> {
  const until = now() + budgetMs
  let ran = 0
  while (now() < until && (await worker.runOnce()) === 'ran') ran += 1
  return ran
}

export type GenericJobDeps = {
  /** gogospend_jobs only: the queue, the publication registry and the import routines. */
  jobsPool: Pool
  /** gogospend_leased_read only: account reads through lease-validating routines. */
  readPool: Pool
  store: ObjectStore
  gates: FeatureGates
  /** True when the parser container runs `import_parse`, so a queued parse is not reported as unhandled. */
  parserContainer: boolean
}

/**
 * The job worker's kinds that run on Workers (jobs/handlers.ts without
 * `import_parse`, which needs the Node parser sandbox and libvips and runs in
 * the parser container): one snapshot per request, one private CSV per
 * export, and import expiry.
 */
async function genericWorker(deps: GenericJobDeps): Promise<{ worker: JobWorker; jobs: JobRepository; handled: Set<string>; publication: ObjectPublicationService }> {
  await assertLoginRoles(deps.jobsPool, ['gogospend_jobs'], 'HYPERDRIVE_JOBS')
  await assertLoginRoles(deps.readPool, ['gogospend_leased_read'], 'HYPERDRIVE_LEASED_READ')
  const jobs = new JobRepository(deps.jobsPool)
  const publication = new ObjectPublicationService(deps.jobsPool, deps.store)
  const workerDeps = { jobs, reader: new LeasedAccountRead(deps.readPool), store: deps.store, publication, pool: deps.jobsPool }
  const snapshots = new SnapshotBuilder(workerDeps)
  const exporter = new ExportHandler(workerDeps)
  const imports = new ImportExpiry(workerDeps)
  const handlers = new HandlerRegistry()
    .register('sync_snapshot', async (job) => {
      const manifest = await snapshots.build(job.lease)
      // Not published but still held: the manifest was refused - retry.
      if (!manifest && (await jobs.isHeld(job.lease))) await jobs.fail(job.lease, { code: 'snapshot_not_recorded', retryable: true })
    })
    .register('export', (job) => exporter.run(job.lease))
    .register('import_expire', (job) => imports.run(job))
  const handled = new Set(handlers.kinds())
  if (deps.parserContainer) handled.add('import_parse')
  return { worker: new JobWorker(jobs, handlers, { gates: deps.gates }), jobs, handled, publication }
}

/** Claims and runs generic jobs for up to `budgetMs`; the count of jobs run. */
export async function runGenericJobs(deps: GenericJobDeps, budgetMs: number): Promise<number> {
  const { worker } = await genericWorker(deps)
  return drain(worker, budgetMs)
}

/**
 * The job worker's sweep (worker.ts `maintain`): import maintenance, the
 * object sweep, overdue export, quarantine and receipt objects, P5
 * retention, the backlog and the queue heartbeat. Each step runs even if
 * another fails.
 */
export async function runMaintenance(deps: GenericJobDeps, log: Log = consoleLog): Promise<void> {
  const { jobs, handled, publication } = await genericWorker(deps)
  const step = async (name: string, run: () => Promise<void>) => {
    try {
      await run()
    } catch (error) {
      log.error(`job worker: ${name} failed (${failureName(error)})`)
    }
  }
  await step('import maintenance', async () => {
    const ended = await importMaintenance(deps.jobsPool)
    if (ended.stale + ended.expired + ended.namesCleared > 0) {
      log.info(`job worker: import maintenance marked ${ended.stale} stale upload(s) failed, ended ${ended.expired} import(s), cleared ${ended.namesCleared} name(s)`)
    }
  })
  await step('object sweep', async () => {
    const removed = await publication.sweep(null)
    if (removed.length > 0) log.info(`job worker: swept ${removed.length} object(s)`)
  })
  await step('export cleanup check', async () => {
    const overdue = await exportCleanupOverdue(deps.jobsPool)
    if (overdue > 0) log.error(`job worker: ${overdue} export object(s) overdue for deletion`)
  })
  await step('quarantine cleanup check', async () => {
    const overdue = await quarantineCleanupOverdue(deps.jobsPool)
    if (overdue > 0) log.error(`job worker: ${overdue} quarantine object(s) overdue for deletion`)
  })
  await step('receipt cleanup check', async () => {
    const overdue = await receiptCleanupOverdue(deps.jobsPool)
    if (overdue > 0) log.error(`job worker: ${overdue} receipt object(s) overdue for deletion`)
  })
  await step('retention', async () => {
    const report = await new RetentionHandler(deps.jobsPool).run()
    const removed = Object.entries(report.counts).filter(([, n]) => n > 0)
    if (removed.length > 0) log.info(`job worker: retention ${removed.map(([name, n]) => `${name}=${n}`).join(' ')}`)
    if (report.failed.length > 0) log.error(`job worker: retention step(s) failed: ${report.failed.join(' ')}`)
  })
  await step('backlog report', async () => {
    for (const row of await jobs.backlog()) {
      if (row.status === 'failed') log.error(`job worker: ${row.count} ${row.kind} job(s) failed`)
      else if (!handled.has(row.kind)) log.error(`job worker: ${row.count} ${row.kind} job(s) ${row.status} with no handler in this worker`)
    }
  })
  await step('queue report', async () => {
    const lines = queueAgeLines('job worker', await queueAge(deps.jobsPool, [...handled]))
    for (const line of lines.info) log.info(line)
    for (const line of lines.alerts) log.error(line)
    if (deps.gates.pausedScopes().length > 0) log.error(`job worker: paused ${deps.gates.pausedScopes().join(',')}`)
  })
}

/**
 * The Auth0 maintenance client (revocation, deletion), always a separate
 * Auth0 application from the read-profile client, with a fetch the Worker
 * runtime accepts as a field.
 */
function maintenanceGateway(settings: Settings, fetchImpl: typeof fetch): Auth0MaintenanceClient {
  const clientId = settings.AUTH0_MAINTENANCE_CLIENT_ID
  if (clientId && clientId === settings.AUTH0_PROFILE_LINK_CLIENT_ID) {
    throw new ConfigurationError('AUTH0_MAINTENANCE_CLIENT_ID must be a separate Auth0 application from the profile client.')
  }
  const config = managementConfigFromEnv(settings as NodeJS.ProcessEnv, clientId, settings.AUTH0_MAINTENANCE_CLIENT_SECRET)
  if (!config) throw new ConfigurationError('AUTH0_MAINTENANCE_CLIENT_ID and AUTH0_MAINTENANCE_CLIENT_SECRET are not configured.')
  return new Auth0MaintenanceClient(config, fetchImpl)
}

function nativeClientIdsOf(settings: Settings): string[] {
  const ids = (settings.AUTH0_ALLOWED_CLIENT_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean)
  if (ids.length === 0) throw new ConfigurationError('AUTH0_ALLOWED_CLIENT_IDS (the native app clients) is not configured.')
  return ids
}

function boundedInteger(name: string, value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new ConfigurationError(`${name} must be ${min}-${max}.`)
  return parsed
}

export type SecurityDeps = {
  /** gogospend_jobs + gogospend_security. */
  pool: Pool
  settings: Settings
  gates: FeatureGates
  fetch: typeof fetch
}

/**
 * One pass of the security worker (jobs/security-worker.ts): global-logout
 * and credential-change provider cleanup, provider links, and the
 * reconciliation pass for lost provider events.
 */
export async function runSecurityJobs(deps: SecurityDeps, log: Log = consoleLog): Promise<void> {
  const gateway = maintenanceGateway(deps.settings, deps.fetch)
  const nativeClientIds = nativeClientIdsOf(deps.settings)
  const security = new SecurityJobRepository(deps.pool)
  await security.assertLeastPrivilegeWorker()
  const reconcile = {
    everySeconds: boundedInteger('SECURITY_RECONCILE_INTERVAL_SECONDS', deps.settings.SECURITY_RECONCILE_INTERVAL_SECONDS, 300, 60, 86_400),
    batch: boundedInteger('SECURITY_RECONCILE_BATCH', deps.settings.SECURITY_RECONCILE_BATCH, 200, 1, 1000),
  }
  const profiles = profileGatewayFromEnv(deps.settings as NodeJS.ProcessEnv, deps.fetch)
  const linker = profiles instanceof Auth0ProfileClient ? profiles : undefined
  const kinds = ['auth0_revoke_grants', 'auth0_security_reconcile', ...(linker ? ['auth0_link_identities'] : [])]
  try {
    const lines = queueAgeLines('security worker', await queueAge(deps.pool, kinds))
    for (const line of lines.info) log.info(line)
    for (const line of lines.alerts) log.error(line)
  } catch (error) {
    log.error(`security worker: queue report failed (${failureName(error)})`)
  }
  if (deps.gates.isPaused('jobs')) {
    log.error('security worker: paused jobs')
    return
  }
  try {
    const summary = await runSecurityJobsOnce({ jobs: new JobRepository(deps.pool), security, gateway, nativeClientIds, reconcile, linker, stop: new AbortController().signal })
    if (Object.values(summary).some((count) => count > 0)) log.info(`security worker: ${JSON.stringify(summary)}`)
    if (summary.failed > 0) log.error(`security worker: ${summary.failed} security job(s) failed terminally`)
  } catch (error) {
    log.error(`security worker: batch failed (${failureName(error)})`)
  }
}

export type DeletionDeps = {
  /** gogospend_jobs + gogospend_security: the deletion job, its routines and the publication registry. */
  pool: Pool
  /** gogospend_erasure_registry only. */
  registryPool: Pool
  /** The registry's 32-byte lookup key, base64url (43 characters). */
  lookupKey: string | undefined
  store: ObjectStore
  settings: Settings
  gates: FeatureGates
  fetch: typeof fetch
}

/** The erasure registry's lookup key, as privacy/deletion-worker.ts reads it. */
export function lookupKeyOf(value: string | undefined): LookupKey {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new ConfigurationError('ERASURE_REGISTRY_LOOKUP_KEY must be 32 bytes, base64url.')
  return new LookupKey(Buffer.from(value, 'base64url'))
}

/** Runs account deletions (privacy/deletion-worker.ts) for up to `budgetMs`, then reports the backlog. */
export async function runDeletions(deps: DeletionDeps, budgetMs: number, log: Log = consoleLog): Promise<number> {
  const lookupKey = lookupKeyOf(deps.lookupKey)
  const gateway = maintenanceGateway(deps.settings, deps.fetch)
  const nativeClientIds = nativeClientIdsOf(deps.settings)
  await assertLoginRoles(deps.pool, ['gogospend_jobs', 'gogospend_security'], 'HYPERDRIVE_DELETION')
  await assertLoginRoles(deps.registryPool, ['gogospend_erasure_registry'], 'the erasure registry login', 'The erasure registry login must be a member of gogospend_erasure_registry only.')
  const jobs = new JobRepository(deps.pool)
  const repository = new DeletionRepository(deps.pool)
  const handler = new DeletionHandler({
    jobs,
    repository,
    registry: new PostgresErasureRegistry(deps.registryPool, lookupKey),
    gateway,
    publication: new ObjectPublicationService(deps.pool, deps.store),
    pool: deps.pool,
    nativeClientIds,
    steps: defaultPrivacySteps(),
  })
  const handlers = new HandlerRegistry({ security: true }).register('account_deletion', (job) => handler.run(job.lease))
  const ran = await drain(new JobWorker(jobs, handlers, { gates: deps.gates }), budgetMs)
  try {
    const backlog = await repository.backlog()
    if (backlog.open > 0) log.info(`deletion worker: ${backlog.open} deletion(s) in progress, oldest ${backlog.oldestSeconds}s`)
    if (backlog.overdue > 0) log.error(`deletion worker: ${backlog.overdue} deletion(s) open for over 20 hours`)
    if (backlog.failed > 0) log.error(`deletion worker: ${backlog.failed} deletion job(s) failed terminally`)
    const lines = queueAgeLines('deletion worker', await queueAge(deps.pool, ['account_deletion']))
    for (const line of lines.info) log.info(line)
    for (const line of lines.alerts) log.error(line)
    if (deps.gates.isPaused('jobs')) log.error('deletion worker: paused jobs')
  } catch (error) {
    log.error(`deletion worker: backlog report failed (${failureName(error)})`)
  }
  return ran
}

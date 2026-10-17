import type { LeasedAccountRead } from '../database/leased-account-read';
import { ImportExpiry } from '../imports/import-expiry';
import type { ObjectPublicationService } from '../storage/object-publication.service';
import type { ObjectStore } from '../storage/object-store';
import { SnapshotBuilder } from '../sync/snapshot-builder';
import type { SnapshotBuilderOptions } from '../sync/snapshot-builder';
import { HandlerRegistry } from './handler-registry';
import type { JobRepository } from './job.repository';

export type WorkerDeps = { jobs: JobRepository; reader: LeasedAccountRead; store: ObjectStore; publication: ObjectPublicationService };

/**
 * Every generic job handler. `import_parse` (P2b) has none yet: those jobs
 * stay queued, the worker's backlog report names them, and the 24-hour
 * `import_expire` job cancels them and deletes their quarantined upload.
 */
export function buildHandlers(deps: WorkerDeps, options: { snapshot?: SnapshotBuilderOptions } = {}): HandlerRegistry {
  const snapshots = new SnapshotBuilder(deps, options.snapshot);
  const imports = new ImportExpiry(deps);
  return new HandlerRegistry()
    .register('sync_snapshot', async (job) => {
      const manifest = await snapshots.build(job.lease);
      // Not published but still held: the manifest was refused - retry.
      if (!manifest && (await deps.jobs.isHeld(job.lease))) await deps.jobs.fail(job.lease, { code: 'snapshot_not_recorded', retryable: true });
    })
    .register('import_expire', (job) => imports.run(job));
}

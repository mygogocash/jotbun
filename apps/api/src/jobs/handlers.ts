import type { LeasedAccountRead } from '../database/leased-account-read';
import { ExportHandler } from '../exports/export-handler';
import type { ExportHandlerOptions } from '../exports/export-handler';
import type { ObjectPublicationService } from '../storage/object-publication.service';
import type { ObjectStore } from '../storage/object-store';
import { SnapshotBuilder } from '../sync/snapshot-builder';
import type { SnapshotBuilderOptions } from '../sync/snapshot-builder';
import { HandlerRegistry } from './handler-registry';
import type { JobRepository } from './job.repository';

export type WorkerDeps = { jobs: JobRepository; reader: LeasedAccountRead; store: ObjectStore; publication: ObjectPublicationService };

/** Every generic job handler. */
export function buildHandlers(deps: WorkerDeps, options: { snapshot?: SnapshotBuilderOptions; export?: ExportHandlerOptions } = {}): HandlerRegistry {
  const snapshots = new SnapshotBuilder(deps, options.snapshot);
  const exporter = new ExportHandler(deps, options.export);
  return new HandlerRegistry()
    .register('sync_snapshot', async (job) => {
      const manifest = await snapshots.build(job.lease);
      // Not published but still held: the manifest was refused - retry.
      if (!manifest && (await deps.jobs.isHeld(job.lease))) await deps.jobs.fail(job.lease, { code: 'snapshot_not_recorded', retryable: true });
    })
    // P4: one private CSV per export request; the handler completes or fails its job.
    .register('export', (job) => exporter.run(job.lease));
}

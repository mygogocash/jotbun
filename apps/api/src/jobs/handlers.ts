import type { Pool } from 'pg';

import type { LeasedAccountRead } from '../database/leased-account-read';
import { ExportHandler } from '../exports/export-handler';
import type { ExportHandlerOptions } from '../exports/export-handler';
import { ImportExpiry } from '../imports/import-expiry';
import { ParseHandler } from '../imports/parse-handler';
import type { ParseHandlerOptions } from '../imports/parse-handler';
import type { ObjectPublicationService } from '../storage/object-publication.service';
import type { ObjectStore } from '../storage/object-store';
import { SnapshotBuilder } from '../sync/snapshot-builder';
import type { SnapshotBuilderOptions } from '../sync/snapshot-builder';
import { HandlerRegistry } from './handler-registry';
import type { JobRepository } from './job.repository';

/** `pool` is the worker's own (gogospend_jobs) login: the queue, the publication registry and the import routines. */
export type WorkerDeps = { jobs: JobRepository; reader: LeasedAccountRead; store: ObjectStore; publication: ObjectPublicationService; pool: Pool };

/**
 * Every generic job handler. `import_parse` (P2b) runs the parser child for
 * one quarantined upload and records a reviewable preview - never a
 * transaction; `import_expire` deletes quarantine at 24 hours and unconfirmed
 * candidates at 7 days. `parse: null` leaves `import_parse` unregistered (the
 * job worker does so when its parser sandbox check fails: imports/import-parsing.ts).
 */
export function buildHandlers(deps: WorkerDeps, options: { snapshot?: SnapshotBuilderOptions; export?: ExportHandlerOptions; parse?: ParseHandlerOptions | null } = {}): HandlerRegistry {
  const snapshots = new SnapshotBuilder(deps, options.snapshot);
  const exporter = new ExportHandler(deps, options.export);
  const imports = new ImportExpiry(deps);
  const registry = new HandlerRegistry()
    .register('sync_snapshot', async (job) => {
      const manifest = await snapshots.build(job.lease);
      // Not published but still held: the manifest was refused - retry.
      if (!manifest && (await deps.jobs.isHeld(job.lease))) await deps.jobs.fail(job.lease, { code: 'snapshot_not_recorded', retryable: true });
    })
    // P4: one private CSV per export request; the handler completes or fails its job.
    .register('export', (job) => exporter.run(job.lease))
    .register('import_expire', (job) => imports.run(job));
  if (options.parse !== null) {
    const parser = new ParseHandler(deps, options.parse);
    // P2b: one reviewable preview per accepted upload; the handler completes or fails its job.
    registry.register('import_parse', (job) => parser.run(job));
  }
  return registry;
}

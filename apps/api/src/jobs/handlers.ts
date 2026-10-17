import type { LeasedAccountRead } from '../database/leased-account-read';
import type { ObjectPublicationService } from '../storage/object-publication.service';
import type { ObjectStore } from '../storage/object-store';
import { HandlerRegistry } from './handler-registry';
import type { JobRepository } from './job.repository';

export type WorkerDeps = { jobs: JobRepository; reader: LeasedAccountRead; store: ObjectStore; publication: ObjectPublicationService };

/** Every generic job handler. Kinds are added by their tasks (S1: sync_snapshot). */
export function buildHandlers(_deps: WorkerDeps): HandlerRegistry {
  return new HandlerRegistry();
}

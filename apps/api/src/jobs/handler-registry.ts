import { SECURITY_JOB_KINDS } from '../database/schema';
import type { ClaimedJob, JobKind } from './job-types';

/** A job handler must end its job with exactly one transition (complete or fail), or throw. */
export type JobHandler = (job: ClaimedJob) => Promise<void>;

const KIND = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * The kinds a generic worker runs. A worker claims only registered kinds, so
 * a job nobody handles stays queued (visible in the backlog) instead of being
 * claimed and failed. Security kinds are never registered here: they run in
 * the security worker under its own role.
 */
export class HandlerRegistry {
  private readonly handlers = new Map<JobKind, JobHandler>();

  register(kind: JobKind, handler: JobHandler): this {
    if (!KIND.test(kind)) throw new RangeError('job kinds are lowercase identifiers');
    if ((SECURITY_JOB_KINDS as readonly string[]).includes(kind)) throw new RangeError('security job kinds run in the security worker');
    if (this.handlers.has(kind)) throw new Error(`a handler for ${kind} is already registered`);
    this.handlers.set(kind, handler);
    return this;
  }

  kinds(): JobKind[] {
    return [...this.handlers.keys()];
  }

  handler(kind: JobKind): JobHandler {
    const handler = this.handlers.get(kind);
    if (!handler) throw new Error(`no handler for ${kind}`);
    return handler;
  }
}

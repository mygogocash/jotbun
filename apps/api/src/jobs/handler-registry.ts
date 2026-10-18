import { SECURITY_JOB_KINDS } from '../database/schema';
import type { ClaimedJob, JobKind } from './job-types';

/** A job handler must end its job with exactly one transition (complete or fail), or throw. */
export type JobHandler = (job: ClaimedJob) => Promise<void>;

const KIND = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * The kinds a worker runs. A worker claims only registered kinds, so a job
 * nobody handles stays queued (visible in the backlog) instead of being
 * claimed and failed. A generic registry never takes a security kind: those
 * run only in a worker whose login has gogospend_security, through a registry
 * created with `{ security: true }`, which takes security kinds only (P5's
 * account_deletion runs in the deletion worker this way).
 */
export class HandlerRegistry {
  private readonly handlers = new Map<JobKind, JobHandler>();
  private readonly security: boolean;

  constructor(options: { security?: boolean } = {}) {
    this.security = options.security ?? false;
  }

  register(kind: JobKind, handler: JobHandler): this {
    if (!KIND.test(kind)) throw new RangeError('job kinds are lowercase identifiers');
    const isSecurityKind = (SECURITY_JOB_KINDS as readonly string[]).includes(kind);
    if (isSecurityKind && !this.security) throw new RangeError('security job kinds run in the security worker');
    if (!isSecurityKind && this.security) throw new RangeError('a security registry runs security job kinds only');
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

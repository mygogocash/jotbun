import { HandlerRegistry } from './handler-registry';
import { JobRepository } from './job.repository';
import type { ClaimedJob } from './job-types';

export type WorkerOptions = { leaseSeconds?: number; heartbeatMs?: number };
export type WorkerOutcome = 'idle' | 'ran';

/**
 * Runs one registered job at a time. While a handler runs, a heartbeat
 * extends its lease every `heartbeatMs` (by `leaseSeconds`, never past the
 * attempt's runtime bound) and keeps `lease.signal` and `lease.deadline` in
 * step; the signal aborts when the lease can no longer be extended. A handler
 * that throws is failed as retryable (`handler_error`, or `handler_timeout`
 * after its signal aborted); one that returns while still holding its lease
 * never transitioned the job, which is a bug, so it fails terminally
 * (`handler_incomplete`). Errors are never logged with their text: messages
 * may carry user data.
 */
export class JobWorker {
  private readonly leaseSeconds: number;
  private readonly heartbeatMs: number;

  constructor(private readonly jobs: JobRepository, private readonly handlers: HandlerRegistry, options: WorkerOptions = {}) {
    this.leaseSeconds = options.leaseSeconds ?? 30;
    this.heartbeatMs = options.heartbeatMs ?? 10_000;
    if (!Number.isInteger(this.heartbeatMs) || this.heartbeatMs < 100 || this.heartbeatMs >= this.leaseSeconds * 1000) {
      throw new RangeError('heartbeatMs must be at least 100 and shorter than the lease');
    }
  }

  async runOnce(): Promise<WorkerOutcome> {
    const kinds = this.handlers.kinds();
    if (kinds.length === 0) return 'idle';
    const [claimed] = await this.jobs.claim(kinds, { limit: 1, leaseSeconds: this.leaseSeconds });
    if (!claimed) return 'idle';
    await this.run(claimed);
    return 'ran';
  }

  /** Polls until `stop` aborts, sleeping `idleMs` whenever the queue is empty. */
  async runUntil(stop: AbortSignal, idleMs = 2_000, onError: (error: unknown) => void = () => undefined): Promise<void> {
    while (!stop.aborted) {
      let outcome: WorkerOutcome = 'idle';
      try {
        outcome = await this.runOnce();
      } catch (error) {
        onError(error);
      }
      if (outcome === 'idle') await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, idleMs);
        stop.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      });
    }
  }

  private async run(claimed: ClaimedJob): Promise<void> {
    const controller = new AbortController();
    const lease = { ...claimed.lease, signal: controller.signal };
    let timer: NodeJS.Timeout | undefined;
    let extended = false;
    claimed.lease.signal.addEventListener('abort', () => {
      if (!extended) controller.abort();
    }, { once: true });
    if (claimed.lease.signal.aborted) controller.abort();
    let beat: Promise<void> = Promise.resolve();
    const interval = setInterval(() => {
      beat = beat.then(async () => {
        if (controller.signal.aborted) return;
        const next = await this.jobs.extend(lease, this.leaseSeconds).catch(() => null);
        if (!next) {
          controller.abort();
          return;
        }
        extended = true;
        lease.deadline = next.deadline;
        clearTimeout(timer);
        timer = setTimeout(() => controller.abort(), next.budgetMs);
      });
    }, this.heartbeatMs);
    let thrown = false;
    try {
      await this.handlers.handler(claimed.kind)({ ...claimed, lease });
    } catch {
      thrown = true;
    } finally {
      clearInterval(interval);
      await beat;
      clearTimeout(timer);
    }
    if (thrown) {
      await this.jobs.fail(lease, { code: controller.signal.aborted ? 'handler_timeout' : 'handler_error', retryable: true });
    } else if (await this.jobs.isHeld(lease)) {
      await this.jobs.fail(lease, { code: 'handler_incomplete', retryable: false });
    }
    controller.abort();
  }
}

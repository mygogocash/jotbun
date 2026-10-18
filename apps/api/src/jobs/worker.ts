import { setTimeout as sleep } from 'node:timers/promises';

import type { FeatureGates } from '../common/feature-gates';
import { HandlerRegistry } from './handler-registry';
import { JobRepository, leaseSafetyMs } from './job.repository';
import type { ClaimedJob } from './job-types';

export type WorkerOptions = { leaseSeconds?: number; heartbeatMs?: number; gates?: FeatureGates };
export type WorkerOutcome = 'idle' | 'ran';

/**
 * Runs one registered job at a time. While a handler runs, a heartbeat
 * extends its lease every `heartbeatMs` (by `leaseSeconds`, never past the
 * attempt's runtime bound) and keeps `lease.signal` and `lease.deadline` in
 * step. The signal aborts when the lease is lost (a heartbeat finds it
 * expired, reclaimed or cancelled), when the local budget of the last granted
 * lease runs out (a transient heartbeat error alone does not abort), or when
 * the worker is stopped. A handler that throws is failed as retryable
 * (`handler_error`, `handler_timeout` after its signal aborted, or
 * `worker_stopped`); one that returns while still holding its lease never
 * transitioned the job, which is a bug, so it fails terminally
 * (`handler_incomplete`). Error text is never logged: it may carry user data.
 */
export class JobWorker {
  private readonly leaseSeconds: number;
  private readonly heartbeatMs: number;
  private readonly gates: FeatureGates | undefined;

  constructor(private readonly jobs: JobRepository, private readonly handlers: HandlerRegistry, options: WorkerOptions = {}) {
    this.leaseSeconds = options.leaseSeconds ?? 30;
    this.heartbeatMs = options.heartbeatMs ?? 10_000;
    this.gates = options.gates;
    if (!Number.isInteger(this.heartbeatMs) || this.heartbeatMs < 100 || this.heartbeatMs >= this.leaseSeconds * 1000 - leaseSafetyMs(this.leaseSeconds)) {
      throw new RangeError('heartbeatMs must be at least 100 and leave the lease safety margin');
    }
  }

  /**
   * Claims and runs at most one job. With `gates`, a paused `jobs` gate
   * claims nothing and a kind whose JOB_KIND_GATES are paused is not claimed
   * (it stays queued without spending an attempt).
   */
  async runOnce(stop?: AbortSignal): Promise<WorkerOutcome> {
    const registered = this.handlers.kinds();
    const kinds = this.gates ? this.gates.claimableKinds(registered) : registered;
    if (kinds.length === 0 || stop?.aborted) return 'idle';
    const [claimed] = await this.jobs.claim(kinds, { limit: 1, leaseSeconds: this.leaseSeconds });
    if (!claimed) return 'idle';
    await this.run(claimed, stop);
    return 'ran';
  }

  /** Polls until `stop` aborts (which also aborts a running handler), sleeping `idleMs` whenever the queue is empty. */
  async runUntil(stop: AbortSignal, idleMs = 2_000, onError: (error: unknown) => void = () => undefined): Promise<void> {
    while (!stop.aborted) {
      let outcome: WorkerOutcome = 'idle';
      try {
        outcome = await this.runOnce(stop);
      } catch (error) {
        onError(error);
      }
      if (outcome === 'idle') await sleep(idleMs, undefined, { signal: stop }).catch(() => undefined);
    }
  }

  private async run(claimed: ClaimedJob, stop?: AbortSignal): Promise<void> {
    const controller = new AbortController();
    const lease = { ...claimed.lease, signal: controller.signal };
    let timer: NodeJS.Timeout | undefined;
    let extended = false;
    let stopped = false;
    const onStop = () => {
      stopped = true;
      controller.abort();
    };
    stop?.addEventListener('abort', onStop, { once: true });
    const onExpire = () => {
      if (!extended) controller.abort();
    };
    claimed.lease.signal.addEventListener('abort', onExpire, { once: true });
    if (claimed.lease.signal.aborted) controller.abort();
    let beat: Promise<void> = Promise.resolve();
    const interval = setInterval(() => {
      beat = beat.then(async () => {
        if (controller.signal.aborted) return;
        let next: Awaited<ReturnType<JobRepository['extend']>> | 'error';
        try {
          next = await this.jobs.extend(lease, this.leaseSeconds);
        } catch {
          // Transient: keep the last granted budget and try again next beat.
          next = 'error';
        }
        if (next === 'error') return;
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
      stop?.removeEventListener('abort', onStop);
      claimed.lease.signal.removeEventListener('abort', onExpire);
    }
    if (thrown) {
      await this.jobs.fail(lease, { code: stopped ? 'worker_stopped' : controller.signal.aborted ? 'handler_timeout' : 'handler_error', retryable: true });
    } else if (await this.jobs.isHeld(lease)) {
      await this.jobs.fail(lease, { code: 'handler_incomplete', retryable: false });
    }
    controller.abort();
  }
}

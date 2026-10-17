import type { FlushTrigger, SyncOutcome } from './types.ts';

export type SchedulerDeps = {
  flush: (trigger: FlushTrigger) => Promise<SyncOutcome>;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
};

export interface SyncScheduler {
  launch(): Promise<void>;
  foreground(): Promise<void>;
  background(): void;
  written(): Promise<void>;
  manual(): Promise<void>;
  /** Sign-out or account switch: stops for good. */
  stop(): void;
}

const FOREGROUND_INTERVAL_MS = 60_000;
// Outcomes that only the user, a new session or an app update can change: no timer.
const NO_TIMER = new Set<SyncOutcome['status']>(['paused', 'upgrade_required', 'signed_out', 'policy_required', 'session_changed']);

/**
 * When to sync: at launch, on coming to the foreground, after a local save,
 * on a manual retry, and on at most one timer while in the foreground - every
 * 60 seconds, or at the backoff/Retry-After time when that is set. Going to
 * the background or stopping (sign-out, account switch) clears the timer; no
 * background delivery is promised. Results arriving after a stop are ignored.
 */
export function createSyncScheduler(deps: SchedulerDeps): SyncScheduler {
  let timer: unknown = null;
  let foreground = false;
  let stopped = false;

  const clear = () => {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
  };

  const arm = (outcome: SyncOutcome) => {
    clear();
    if (stopped || !foreground || NO_TIMER.has(outcome.status)) return;
    const at = outcome.nextAttemptAt !== null && (outcome.status === 'rate_limited' || outcome.status === 'waiting') ? outcome.nextAttemptAt : deps.now() + FOREGROUND_INTERVAL_MS;
    timer = deps.setTimer(() => {
      timer = null;
      void run('timer');
    }, Math.max(0, at - deps.now()));
  };

  async function run(trigger: FlushTrigger): Promise<void> {
    if (stopped) return;
    const outcome = await deps.flush(trigger);
    if (!stopped) arm(outcome);
  }

  return {
    launch: () => run('launch'),
    async foreground() {
      if (stopped) return;
      foreground = true;
      await run('foreground');
    },
    background() {
      foreground = false;
      clear();
    },
    written: () => run('write'),
    manual: () => run('manual'),
    stop() {
      stopped = true;
      foreground = false;
      clear();
    },
  };
}

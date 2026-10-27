import type { FlushTrigger, SyncOutcome } from './types.ts';

export type SchedulerDeps = {
  flush: (trigger: FlushTrigger) => Promise<SyncOutcome>;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  /** Every run's outcome, including the one reported for a flush that failed outright. */
  onOutcome?: (outcome: SyncOutcome) => void;
  /** The live channel: started on launch and foreground, stopped on background and stop. */
  channel?: { start(): void; stop(): void };
};

export interface SyncScheduler {
  launch(): Promise<void>;
  foreground(): Promise<void>;
  background(): void;
  written(): Promise<void>;
  manual(): Promise<void>;
  /** A poke from the live channel (or its reconnect): a `live` flush. */
  live(): Promise<void>;
  /** Sign-out or account switch: stops for good. */
  stop(): void;
}

const FOREGROUND_INTERVAL_MS = 60_000;
// Outcomes that only the user, a new session or an app update can change: no timer.
const NO_TIMER = new Set<SyncOutcome['status']>(['paused', 'upgrade_required', 'signed_out', 'policy_required', 'session_changed']);

/**
 * When to sync: at launch, on coming to the foreground, after a local save,
 * on a manual retry, on a live poke from the vault (the live channel runs
 * from launch or foreground until background or stop), and on at most one
 * timer while in the foreground - every 60 seconds, or at the backoff or
 * Retry-After time when that is set. Going to the background or stopping
 * (sign-out, account switch) clears the timer and stops the channel; no
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
    let outcome: SyncOutcome;
    try {
      outcome = await deps.flush(trigger);
    } catch {
      // A flush that failed outright tries again on the regular timer.
      outcome = { status: 'waiting', progress: { sent: 0, total: 0 }, nextAttemptAt: null, uncertain: 0, needsReview: 0 };
    }
    if (stopped) return;
    deps.onOutcome?.(outcome);
    arm(outcome);
  }

  return {
    async launch() {
      if (stopped) return;
      // The app launches into the foreground.
      foreground = true;
      deps.channel?.start();
      await run('launch');
    },
    async foreground() {
      if (stopped) return;
      foreground = true;
      deps.channel?.start();
      await run('foreground');
    },
    background() {
      foreground = false;
      clear();
      deps.channel?.stop();
    },
    written: () => run('write'),
    manual: () => run('manual'),
    live: () => run('live'),
    stop() {
      stopped = true;
      foreground = false;
      clear();
      deps.channel?.stop();
    },
  };
}

import type { Server } from 'node:http';

import { IMPORT_UPLOAD_RECEIVE_SECONDS } from '@gogospend/contracts';

import { describeFailure } from './operational-metrics';

/**
 * Bounded HTTP timeouts for the v1 API; this is their only owner.
 * `requestMs` covers a whole request: the upload receive bound
 * (IMPORT_UPLOAD_RECEIVE_SECONDS, 8 minutes) + 60 s, so the import intake,
 * which ends a stalled or too-slow upload itself and cleans up, always
 * answers first (P2a's review fix). `keepAliveMs`
 * outlasts a fronting proxy's idle reuse so the proxy never reuses a socket
 * the API is closing; `headersMs` must exceed it.
 */
export const HTTP_TIMEOUTS = Object.freeze({ requestMs: (IMPORT_UPLOAD_RECEIVE_SECONDS + 60) * 1000, headersMs: 66_000, keepAliveMs: 65_000 });

export function applyHttpTimeouts(server: Server): void {
  server.requestTimeout = HTTP_TIMEOUTS.requestMs;
  server.headersTimeout = HTTP_TIMEOUTS.headersMs;
  server.keepAliveTimeout = HTTP_TIMEOUTS.keepAliveMs;
}

/**
 * `SHUTDOWN_TIMEOUT_SECONDS` (5-120, default 25): how long a stopping process
 * may drain before it is forced out. Keep the platform's stop grace period
 * (Railway: RAILWAY_DEPLOYMENT_DRAINING_SECONDS) above it.
 */
export function shutdownTimeoutMsFromEnv(value: string | undefined): number {
  if (value === undefined || value === '') return 25_000;
  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds < 5 || seconds > 120) throw new Error('SHUTDOWN_TIMEOUT_SECONDS must be 5-120.');
  return seconds * 1000;
}

export type ShutdownOptions = {
  /** Process name for the log lines ("v1", "job worker"). */
  name: string;
  timeoutMs: number;
  /** Starts the graceful stop. */
  stop: (signal: NodeJS.Signals) => Promise<void> | void;
  /**
   * The API exits 0 as soon as `stop` resolves. Workers pass false: their
   * main loop ends after the stop, and the process exits when it is done.
   */
  exitWhenStopped: boolean;
  /** Called just before a forced exit (the API closes every open socket). */
  onTimeout?: () => void;
  signals?: readonly NodeJS.Signals[];
  emitter?: Pick<NodeJS.EventEmitter, 'once' | 'removeListener'>;
  exit?: (code: number) => void;
  log?: (line: string) => void;
};

/**
 * Graceful shutdown on SIGTERM/SIGINT: the first signal starts `stop`
 * (later ones are ignored) and an unref'd timer that forces exit 1 after
 * `timeoutMs`, so a hung drain cannot outlive the platform's grace period.
 * Returns a function that removes the handlers.
 */
export function handleShutdownSignals(options: ShutdownOptions): () => void {
  const emitter = options.emitter ?? process;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const log = options.log ?? ((line: string) => console.error(line));
  const signals = options.signals ?? ['SIGTERM', 'SIGINT'];
  let started = false;
  const onSignal = (signal: NodeJS.Signals) => {
    if (started) return;
    started = true;
    log(`${options.name}: stopping (${signal})`);
    const timer = setTimeout(() => {
      log(`${options.name}: shutdown timed out after ${options.timeoutMs} ms`);
      try {
        options.onTimeout?.();
      } finally {
        exit(1);
      }
    }, options.timeoutMs);
    timer.unref();
    Promise.resolve()
      .then(() => options.stop(signal))
      .then(
        () => {
          if (!options.exitWhenStopped) return;
          clearTimeout(timer);
          exit(0);
        },
        (error: unknown) => {
          clearTimeout(timer);
          log(`${options.name}: shutdown failed: ${describeFailure(error)}`);
          exit(1);
        },
      );
  };
  const listeners = signals.map((signal) => {
    const listener = () => onSignal(signal);
    emitter.once(signal, listener);
    return [signal, listener] as const;
  });
  return () => {
    for (const [signal, listener] of listeners) emitter.removeListener(signal, listener);
  };
}

/**
 * Runs a process entry point. A startup failure is reported through
 * describeFailure (never raw error text: driver and configuration errors can
 * carry connection strings, keys or values) and sets exit code 1.
 */
export async function runMain(name: string, main: () => Promise<void>, log: (line: string) => void = (line) => console.error(line)): Promise<void> {
  try {
    await main();
  } catch (error) {
    log(`${name} startup failed: ${describeFailure(error)}`);
    process.exitCode = 1;
  }
}

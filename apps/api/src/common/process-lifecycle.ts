import type { Server, ServerResponse } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

import { IMPORT_UPLOAD_RECEIVE_SECONDS } from '@gogospend/contracts';

import { ConfigurationError } from './configuration-error';
import { describeFailure } from './operational-metrics';

/**
 * Bounded HTTP timeouts for the v1 API; this is their only owner.
 * `requestMs` covers a whole request: the upload receive bound
 * (IMPORT_UPLOAD_RECEIVE_SECONDS, 8 minutes) + 60 s, so the import intake,
 * which ends a stalled or too-slow upload itself and cleans up, always
 * answers first (P2a's review fix). Node applies it to every request, so a
 * client that stalls a JSON body (at most 2 MiB) also holds its socket for
 * up to 9 minutes; real clients send JSON at once. `keepAliveMs`
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
  if (!Number.isInteger(seconds) || seconds < 5 || seconds > 120) throw new ConfigurationError('SHUTDOWN_TIMEOUT_SECONDS must be 5-120.');
  return seconds * 1000;
}

/**
 * `SHUTDOWN_DRAIN_DELAY_SECONDS` (0-30, default 2): how long the API keeps
 * serving after it starts draining (`/ready` 503, every response
 * `Connection: close`) before it stops accepting connections, so a proxy
 * that routes by `/ready` stops sending it new requests first. 0 when the
 * platform moves traffic away before SIGTERM. At most half of
 * SHUTDOWN_TIMEOUT_SECONDS, leaving the rest for in-flight requests.
 */
export function shutdownDrainDelayMsFromEnv(value: string | undefined, timeoutMs: number): number {
  const seconds = value === undefined || value === '' ? 2 : Number(value);
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 30 || seconds * 1000 * 2 > timeoutMs) {
    throw new ConfigurationError('SHUTDOWN_DRAIN_DELAY_SECONDS must be 0-30 and at most half of SHUTDOWN_TIMEOUT_SECONDS.');
  }
  return seconds * 1000;
}

export type HttpDrain = {
  /** From now on every response that has not started says `Connection: close`, so its socket closes when it is done. */
  begin(): void;
  /** begin(), stop accepting connections, and resolve once every connection has closed (idle ones are closed every `pollMs`). */
  close(): Promise<void>;
};

/**
 * Tracks a server's responses so a stop can end keep-alive (install before
 * `listen`). Node's `server.close()` waits for every connection, and a
 * keep-alive socket that is busy when it is called stays open after its
 * response for the whole keep-alive timeout (65 s here): the stop would
 * time out. While draining, each response gets `Connection: close` (Node
 * then closes its socket after it), and idle sockets are closed until the
 * server has none left.
 */
export function trackHttpDrain(server: Server, pollMs = 100): HttpDrain {
  const open = new Set<ServerResponse>();
  let draining = false;
  let closing: Promise<void> | undefined;
  const closeAfter = (res: ServerResponse) => {
    if (!res.headersSent) res.setHeader('Connection', 'close');
  };
  // Before the application's own listener, so no handler has written yet.
  server.prependListener('request', (_req, res: ServerResponse) => {
    if (draining) {
      closeAfter(res);
      return;
    }
    open.add(res);
    res.once('close', () => open.delete(res));
  });
  const begin = () => {
    if (draining) return;
    draining = true;
    for (const res of open) closeAfter(res);
    open.clear();
  };
  return {
    begin,
    close() {
      begin();
      closing ??= new Promise<void>((resolve) => {
        const idle = setInterval(() => server.closeIdleConnections(), pollMs);
        server.close(() => {
          clearInterval(idle);
          resolve();
        });
        server.closeIdleConnections();
      });
      return closing;
    },
  };
}

export type GracefulHttpStop = {
  /** `/ready` turns 503 (HealthService.markDraining). */
  markDraining: () => void;
  /** SHUTDOWN_DRAIN_DELAY_SECONDS, in ms. */
  delayMs: number;
  drain: HttpDrain;
  /** app.close(): Nest ends the database pool before it closes HTTP, so it runs last. */
  closeApp: () => Promise<void>;
};

/**
 * The API's stop, in order: mark draining (and end keep-alive), wait the
 * drain delay while still serving, stop accepting and wait for every
 * in-flight request, and only then close the application (its destroy
 * hooks end the database pool, which a request still running would need).
 */
export async function gracefulHttpStop(options: GracefulHttpStop): Promise<void> {
  options.markDraining();
  options.drain.begin();
  if (options.delayMs > 0) await sleep(options.delayMs);
  await options.drain.close();
  await options.closeApp();
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
  emitter?: Pick<NodeJS.EventEmitter, 'on' | 'removeListener'>;
  exit?: (code: number) => void;
  log?: (line: string) => void;
};

/**
 * Graceful shutdown on SIGTERM/SIGINT: the first signal starts `stop` and an
 * unref'd timer that forces exit 1 after `timeoutMs`, so a hung drain cannot
 * outlive the platform's grace period. Later signals are ignored (the
 * handlers stay installed, so a second SIGTERM cannot fall through to
 * Node's default and kill the drain). Returns a function that removes the
 * handlers.
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
    emitter.on(signal, listener);
    return [signal, listener] as const;
  });
  return () => {
    for (const [signal, listener] of listeners) emitter.removeListener(signal, listener);
  };
}

export type RunMainOptions = { emitter?: Pick<NodeJS.EventEmitter, 'on'>; exit?: (code: number) => void };

/**
 * Runs a process entry point. A startup failure is reported through
 * describeFailure (never raw error text: driver and configuration errors can
 * carry connection strings, keys or values) and sets exit code 1. An
 * uncaught exception or unhandled rejection at any later point is reported
 * the same way (`<name> crashed: <class>[ code]`, no stack) and exits 1,
 * instead of Node printing the raw message and stack.
 */
export async function runMain(name: string, main: () => Promise<void>, log: (line: string) => void = (line) => console.error(line), options: RunMainOptions = {}): Promise<void> {
  const emitter = options.emitter ?? process;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const crashed = (error: unknown) => {
    log(`${name} crashed: ${describeFailure(error)}`);
    exit(1);
  };
  emitter.on('uncaughtException', crashed);
  emitter.on('unhandledRejection', crashed);
  try {
    await main();
  } catch (error) {
    log(`${name} startup failed: ${describeFailure(error)}`);
    process.exitCode = 1;
  }
}

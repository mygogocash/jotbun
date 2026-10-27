// The app's live channel (plan 1D, L1 and L2; spec §6.5). One WebSocket to the
// person's vault carries only revisions: `{"revision":"<n>"}` means "pull now",
// `pong` answers the keepalive. The phone sends only `ping`. Every event from a
// socket the channel no longer holds is ignored, so a replaced socket's late
// close never stops the current one.
import type { V1ClientVersion } from '../api/client.ts';

export type LiveSocket = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: (() => void) | null;
};

/** Where the socket goes and with what: the transport's base URL, client version and credentials. */
export type LiveTarget = { baseUrl: string; client: V1ClientVersion | null; token: () => Promise<string | null> };

export type LiveChannelDeps = {
  target: LiveTarget;
  connect: (url: string, headers: Record<string, string>) => LiveSocket;
  appliedRevision: () => Promise<string>;
  /** A poke or a (re)connect: run a 'live' flush. */
  onLive: () => void;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  random: () => number;
};

export interface LiveChannel {
  start(): void;
  stop(): void;
}

export const LIVE_PING_MS = 25_000;
export const LIVE_PONG_WAIT_MS = 10_000;
export const LIVE_BACKOFF_CAP_MS = 15_000;
/** The vault's close codes: the session ended, or a newer socket replaced this one. */
export const LIVE_CLOSE = { sessionEnded: 4401, replaced: 4409 } as const;

const BACKOFF_BASE_MS = 1_000;
const MAX_POKE_LENGTH = 64;
const POKE = /^\{"revision":"([0-9]+)"\}$/;

/** The socket URL for a base URL: http becomes ws, https becomes wss, then `/v1/sync/live`. */
export function liveUrl(baseUrl: string): string {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/v1/sync/live`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

/** The revision of exactly `{"revision":"<decimal>"}`, at most 64 characters; anything else is null. */
export function parsePoke(data: unknown): string | null {
  if (typeof data !== 'string' || data.length > MAX_POKE_LENGTH) return null;
  return POKE.exec(data)?.[1] ?? null;
}

/** Whether `revision` is greater than `applied`, compared exactly (never as a JavaScript number). */
export function revisionGrew(revision: string, applied: string): boolean {
  try {
    return BigInt(revision) > BigInt(applied);
  } catch {
    return false;
  }
}

/**
 * The channel: `start()` connects (and every reconnect connects) with the
 * token read at that moment; a poke for a newer revision, a successful open
 * and a session's 4401 each run one `onLive()`. The keepalive pings every 25
 * seconds and closes a socket whose pong is 10 seconds late. Other closes and
 * errors reconnect with a backoff of 1 second, doubling to 15, kept between
 * half and all of it by `random()`; an open resets the backoff. 4401 and 4409
 * end the channel until the next `start()`. `stop()` closes with 1000 and
 * clears every timer.
 */
export function createLiveChannel(deps: LiveChannelDeps): LiveChannel {
  const { target } = deps;
  // Bumped by start() and stop(): a token read that started before one of them connects nothing.
  let generation = 0;
  let current: LiveSocket | null = null;
  let failures = 0;
  let pingTimer: unknown = null;
  let pongTimer: unknown = null;
  let reconnectTimer: unknown = null;

  const cancel = (handle: unknown) => {
    if (handle !== null) deps.clearTimer(handle);
  };

  /** Forgets the current socket and its timers: its events are ignored from now on. */
  function detach(): LiveSocket | null {
    const old = current;
    current = null;
    cancel(pingTimer);
    cancel(pongTimer);
    cancel(reconnectTimer);
    pingTimer = null;
    pongTimer = null;
    reconnectTimer = null;
    return old;
  }

  function scheduleReconnect(): void {
    failures += 1;
    const gen = generation;
    const base = Math.min(LIVE_BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (failures - 1));
    const delay = Math.round(base / 2 + (base / 2) * Math.min(Math.max(deps.random(), 0), 1));
    reconnectTimer = deps.setTimer(() => {
      reconnectTimer = null;
      void connect(gen);
    }, delay);
  }

  function armPing(socket: LiveSocket): void {
    cancel(pingTimer);
    pingTimer = deps.setTimer(() => {
      pingTimer = null;
      if (current !== socket) return;
      socket.send('ping');
      pongTimer = deps.setTimer(() => {
        pongTimer = null;
        if (current !== socket) return;
        detach();
        socket.close(1000);
        scheduleReconnect();
      }, LIVE_PONG_WAIT_MS);
    }, LIVE_PING_MS);
  }

  function wire(socket: LiveSocket): void {
    socket.onopen = () => {
      if (current !== socket) return;
      failures = 0;
      deps.onLive();
      armPing(socket);
    };
    socket.onmessage = (event) => {
      if (current !== socket) return;
      if (event.data === 'pong') {
        cancel(pongTimer);
        pongTimer = null;
        armPing(socket);
        return;
      }
      const revision = parsePoke(event.data);
      if (revision === null) return;
      void deps.appliedRevision().then(
        (applied) => {
          if (current === socket && revisionGrew(revision, applied)) deps.onLive();
        },
        () => undefined,
      );
    };
    socket.onclose = (event) => {
      if (current !== socket) return;
      detach();
      if (event.code === LIVE_CLOSE.sessionEnded) {
        deps.onLive();
        return;
      }
      if (event.code === LIVE_CLOSE.replaced) return;
      scheduleReconnect();
    };
    socket.onerror = () => {
      if (current !== socket) return;
      detach();
      socket.close(1000);
      scheduleReconnect();
    };
  }

  async function connect(gen: number): Promise<void> {
    const client = target.client;
    if (!client) return;
    let token: string | null;
    try {
      token = await target.token();
    } catch {
      // The credentials cannot be read right now (offline): try again after the backoff.
      if (gen === generation) scheduleReconnect();
      return;
    }
    if (gen !== generation || !token) return;
    let socket: LiveSocket;
    try {
      socket = deps.connect(liveUrl(target.baseUrl), {
        Authorization: `Bearer ${token}`,
        'X-GoGoSpend-Client': `${client.platform}/${client.version}`,
      });
    } catch {
      scheduleReconnect();
      return;
    }
    current = socket;
    wire(socket);
  }

  return {
    start() {
      generation += 1;
      detach()?.close(1000);
      void connect(generation);
    },
    stop() {
      generation += 1;
      detach()?.close(1000);
    },
  };
}

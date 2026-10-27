import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { V1ClientVersion } from '../api/client.ts';
import { LIVE_BACKOFF_CAP_MS, LIVE_CLOSE, LIVE_PING_MS, LIVE_PONG_WAIT_MS, createLiveChannel, liveUrl, parsePoke } from './liveChannel.ts';
import type { LiveChannel, LiveChannelDeps, LiveSocket, LiveTarget } from './liveChannel.ts';

// Lets the promises the channel started (token reads, poke checks) run to their next step.
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

type FakeSocket = LiveSocket & {
  url: string;
  headers: Record<string, string>;
  sent: string[];
  closes: (number | undefined)[];
  serverOpen(): Promise<void>;
  serverMessage(data: unknown): Promise<void>;
  serverClose(code: number): Promise<void>;
  serverError(): Promise<void>;
};

/** A socket the test drives: the server's events go in through `server*`, what the channel does shows in `sent` and `closes`. */
function fakeSocket(url: string, headers: Record<string, string>): FakeSocket {
  const socket: FakeSocket = {
    url,
    headers,
    sent: [],
    closes: [],
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send(data) {
      socket.sent.push(data);
    },
    close(code) {
      socket.closes.push(code);
    },
    async serverOpen() {
      socket.onopen?.();
      await settle();
    },
    async serverMessage(data) {
      socket.onmessage?.({ data });
      await settle();
    },
    async serverClose(code) {
      socket.onclose?.({ code });
      await settle();
    },
    async serverError() {
      socket.onerror?.();
      await settle();
    },
  };
  return socket;
}

/** Timers the test runs by hand, in time order. */
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; run: () => void }>();
  return {
    setTimer(run: () => void, ms: number): unknown {
      const id = nextId;
      nextId += 1;
      timers.set(id, { at: now + ms, run });
      return id;
    },
    clearTimer(handle: unknown): void {
      timers.delete(handle as number);
    },
    pending: () => timers.size,
    /** Runs every timer due within `ms`, each one followed by the promises it started. */
    async advance(ms: number): Promise<void> {
      const end = now + ms;
      for (;;) {
        let due: [number, { at: number; run: () => void }] | undefined;
        for (const entry of timers) {
          if (entry[1].at <= end && (due === undefined || entry[1].at < due[1].at)) due = entry;
        }
        if (due === undefined) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].run();
        await settle();
      }
      now = end;
    },
  };
}

type State = {
  sockets: FakeSocket[];
  token: string | null;
  tokenReads: number;
  /** Token reads that fail before the next answer (the phone cannot read its credentials yet). */
  failReads: number;
  applied: string;
  lives: number;
  client: V1ClientVersion | null;
};

function rig(options: { applied?: string; token?: string | null; client?: V1ClientVersion | null } = {}) {
  const clock = fakeClock();
  const state: State = {
    sockets: [],
    token: options.token === undefined ? 't1' : options.token,
    tokenReads: 0,
    failReads: 0,
    applied: options.applied ?? '41',
    lives: 0,
    client: options.client === undefined ? { platform: 'ios', version: '1.2.3' } : options.client,
  };
  const target: LiveTarget = {
    baseUrl: 'http://localhost:8787',
    get client() {
      return state.client;
    },
    async token() {
      state.tokenReads += 1;
      if (state.failReads > 0) {
        state.failReads -= 1;
        throw new Error('the credentials are locked');
      }
      return state.token;
    },
  };
  const deps: LiveChannelDeps = {
    target,
    connect: (url, headers) => {
      const socket = fakeSocket(url, headers);
      state.sockets.push(socket);
      return socket;
    },
    appliedRevision: async () => state.applied,
    onLive: () => {
      state.lives += 1;
    },
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    random: () => 1,
  };
  const channel: LiveChannel = createLiveChannel(deps);
  return { channel, clock, state };
}

/** The socket the channel opened at `index`; the test fails here, with an assertion, when there is none. */
function socketAt(state: State, index: number): FakeSocket {
  const socket = state.sockets[index];
  assert.ok(socket, `the channel opened no socket ${index + 1}`);
  return socket;
}

test('it connects with the token and the client header to the live URL', async () => {
  assert.equal(liveUrl('https://api.example/'), 'wss://api.example/v1/sync/live');
  assert.equal(liveUrl('http://localhost:8787'), 'ws://localhost:8787/v1/sync/live');
  assert.equal(liveUrl('http://192.168.1.20:8787'), 'ws://192.168.1.20:8787/v1/sync/live');
  const { channel, state } = rig({ token: 't1' });
  channel.start();
  await settle();
  assert.equal(state.sockets.length, 1);
  assert.equal(socketAt(state, 0).url, 'ws://localhost:8787/v1/sync/live');
  assert.deepEqual(socketAt(state, 0).headers, { Authorization: 'Bearer t1', 'X-GoGoSpend-Client': 'ios/1.2.3' });
  channel.stop();
});

test('without a token or a client version it stays quiet', async () => {
  const web = rig({ client: null });
  web.channel.start();
  await web.clock.advance(60_000);
  assert.equal(web.state.sockets.length, 0);

  const signedOut = rig({ token: null });
  signedOut.channel.start();
  await signedOut.clock.advance(60_000);
  assert.equal(signedOut.state.sockets.length, 0);
  signedOut.state.token = 't2';
  signedOut.channel.start();
  await settle();
  assert.equal(signedOut.state.sockets.length, 1, 'the next start() connects');
  signedOut.channel.stop();
});

test('the open runs a live flush, and a newer revision runs another', async () => {
  const { channel, state } = rig({ applied: '41' });
  channel.start();
  await settle();
  const socket = socketAt(state, 0);
  await socket.serverOpen();
  assert.equal(state.lives, 1);
  await socket.serverMessage('{"revision":"42"}');
  assert.equal(state.lives, 2);
  state.applied = '42';
  await socket.serverMessage('{"revision":"42"}');
  assert.equal(state.lives, 2, 'a revision already applied runs nothing');
  channel.stop();
});

test('anything but an exact poke is ignored and the socket stays open', async () => {
  const { channel, state } = rig({ applied: '41' });
  channel.start();
  await settle();
  const socket = socketAt(state, 0);
  await socket.serverOpen();
  const ignored: unknown[] = [
    '{"revision":42}',
    '{"revision":"4x"}',
    '{"revision":"1","note":"x"}',
    `{"revision":"${'1'.repeat(50)}"}`,
    new ArrayBuffer(8),
    'pong',
  ];
  for (const data of ignored) await socket.serverMessage(data);
  assert.equal(state.lives, 1, 'only the open ran a flush');
  assert.deepEqual(socket.closes, []);
  // The longest poke, 64 characters, is read and counts.
  await socket.serverMessage(`{"revision":"${'9'.repeat(49)}"}`);
  assert.equal(state.lives, 2);
  assert.deepEqual(socket.closes, []);
  channel.stop();
});

test('parsePoke reads only an exact revision poke of at most 64 characters', () => {
  assert.equal(parsePoke('{"revision":"42"}'), '42');
  assert.equal(parsePoke(`{"revision":"${'9'.repeat(49)}"}`), '9'.repeat(49));
  for (const data of ['{"revision":42}', '{"revision":"4x"}', '{"revision":"1","note":"x"}', `{"revision":"${'1'.repeat(50)}"}`, new ArrayBuffer(8), 'pong', '']) {
    assert.equal(parsePoke(data), null);
  }
});

test('no pong within 10 seconds closes and reconnects; the open runs a live flush', async () => {
  const { channel, state, clock } = rig();
  channel.start();
  await settle();
  const first = socketAt(state, 0);
  await first.serverOpen();
  await clock.advance(LIVE_PING_MS);
  assert.deepEqual(first.sent, ['ping']);
  await clock.advance(LIVE_PONG_WAIT_MS - 1);
  assert.deepEqual(first.closes, []);
  await clock.advance(1);
  assert.deepEqual(first.closes, [1000], 'the silent socket is closed');
  await clock.advance(1_000);
  assert.equal(state.sockets.length, 2, 'then it reconnects');
  await socketAt(state, 1).serverOpen();
  assert.equal(state.lives, 2, 'and the open catches up');
  channel.stop();
});

test('a pong keeps the socket open', async () => {
  const { channel, state, clock } = rig();
  channel.start();
  await settle();
  const socket = socketAt(state, 0);
  await socket.serverOpen();
  for (let i = 0; i < 5; i += 1) {
    await clock.advance(LIVE_PING_MS);
    await socket.serverMessage('pong');
  }
  assert.deepEqual(socket.closes, []);
  assert.equal(state.sockets.length, 1);
  channel.stop();
});

test('the channel sends nothing but ping', async () => {
  const { channel, state, clock } = rig();
  channel.start();
  await settle();
  const socket = socketAt(state, 0);
  await socket.serverOpen();
  for (let i = 0; i < 3; i += 1) {
    await clock.advance(LIVE_PING_MS);
    await socket.serverMessage('pong');
  }
  assert.deepEqual(socket.sent, ['ping', 'ping', 'ping']);
  channel.stop();
});

test('each reconnect reads the token again', async () => {
  const { channel, state, clock } = rig({ token: 't1' });
  channel.start();
  await settle();
  assert.equal(socketAt(state, 0).headers.Authorization, 'Bearer t1');
  await socketAt(state, 0).serverOpen();
  state.token = 't2';
  await socketAt(state, 0).serverClose(1006);
  await clock.advance(1_000);
  assert.equal(state.sockets.length, 2);
  assert.equal(socketAt(state, 1).headers.Authorization, 'Bearer t2');
  assert.equal(state.tokenReads, 2);
  channel.stop();
});

test('a token that cannot be read yet is tried again after the backoff', async () => {
  const { channel, state, clock } = rig();
  state.failReads = 1;
  channel.start();
  await settle();
  assert.equal(state.sockets.length, 0);
  await clock.advance(999);
  assert.equal(state.sockets.length, 0);
  await clock.advance(1);
  assert.equal(state.sockets.length, 1);
  assert.equal(socketAt(state, 0).headers.Authorization, 'Bearer t1');
  channel.stop();
});

test('a late close from a replaced socket changes nothing', async () => {
  const { channel, state, clock } = rig();
  channel.start();
  await settle();
  const first = socketAt(state, 0);
  await first.serverOpen();
  // No pong: the first socket is closed and the second one opens after the backoff.
  await clock.advance(LIVE_PING_MS + LIVE_PONG_WAIT_MS + 1_000);
  assert.equal(state.sockets.length, 2);
  const second = socketAt(state, 1);
  await second.serverOpen();
  // The vault closes the replaced socket with 4409, and that socket's late events arrive too.
  await first.serverClose(LIVE_CLOSE.replaced);
  await first.serverMessage('{"revision":"99"}');
  await first.serverOpen();
  await first.serverError();
  assert.equal(state.sockets.length, 2, 'no third socket');
  assert.deepEqual(second.closes, [], 'the current socket is not stopped');
  assert.equal(state.lives, 2, 'the late poke and the late open ran nothing');
  await clock.advance(LIVE_PING_MS);
  assert.deepEqual(second.sent, ['ping'], 'the current socket still runs its keepalive');
  channel.stop();
});

test('an ended session stops reconnecting and flushes once', async () => {
  const { channel, state, clock } = rig();
  channel.start();
  await settle();
  await socketAt(state, 0).serverOpen();
  await socketAt(state, 0).serverClose(LIVE_CLOSE.sessionEnded);
  assert.equal(state.lives, 2, 'one flush meets the ended session');
  await clock.advance(60_000);
  assert.equal(state.sockets.length, 1, 'no reconnect after 4401');
  assert.equal(clock.pending(), 0, 'no timer is left');
  channel.start();
  await settle();
  assert.equal(state.sockets.length, 2, 'start() connects again');
  channel.stop();
});

test('a replaced socket does not come back', async () => {
  const { channel, state, clock } = rig();
  channel.start();
  await settle();
  await socketAt(state, 0).serverOpen();
  await socketAt(state, 0).serverClose(LIVE_CLOSE.replaced);
  await clock.advance(60_000);
  assert.equal(state.sockets.length, 1, 'no new socket after 4409');
  assert.equal(clock.pending(), 0);
  channel.stop();
});

test('other closes back off from 1 second to 15 seconds, and an open resets it', async () => {
  const { channel, state, clock } = rig();
  channel.start();
  await settle();
  const delays = [1_000, 2_000, 4_000, 8_000, LIVE_BACKOFF_CAP_MS, LIVE_BACKOFF_CAP_MS];
  for (const [index, delay] of delays.entries()) {
    await socketAt(state, index).serverClose(1006);
    await clock.advance(delay - 1);
    assert.equal(state.sockets.length, index + 1, `no socket before ${delay} ms`);
    await clock.advance(1);
    assert.equal(state.sockets.length, index + 2, `a socket after ${delay} ms`);
  }
  const last = socketAt(state, state.sockets.length - 1);
  await last.serverOpen();
  await last.serverClose(1006);
  await clock.advance(999);
  assert.equal(state.sockets.length, 7);
  await clock.advance(1);
  assert.equal(state.sockets.length, 8, 'the open reset the backoff to 1 second');
  channel.stop();
});

test('stop closes the socket, cancels a pending connect, and ignores late events', async () => {
  const { channel, state, clock } = rig();
  channel.start();
  await settle();
  const socket = socketAt(state, 0);
  await socket.serverOpen();
  channel.stop();
  assert.deepEqual(socket.closes, [1000]);
  await socket.serverMessage('{"revision":"99"}');
  await socket.serverClose(1006);
  await clock.advance(60_000);
  assert.equal(state.lives, 1);
  assert.equal(state.sockets.length, 1, 'no reconnect after stop()');
  assert.equal(clock.pending(), 0, 'every timer is cleared');

  // A connect still reading its token when stop() arrives opens nothing.
  const pending = rig();
  pending.channel.start();
  pending.channel.stop();
  await settle();
  assert.equal(pending.state.sockets.length, 0);
});

test('start replaces an open socket, and the old socket\'s close changes nothing', async () => {
  const { channel, state, clock } = rig();
  channel.start();
  await settle();
  const old = socketAt(state, 0);
  await old.serverOpen();
  channel.start();
  await settle();
  assert.deepEqual(old.closes, [1000]);
  assert.equal(state.sockets.length, 2);
  const current = socketAt(state, 1);
  await current.serverOpen();
  await old.serverClose(LIVE_CLOSE.replaced);
  await clock.advance(LIVE_PING_MS);
  assert.deepEqual(current.sent, ['ping']);
  assert.equal(state.sockets.length, 2);
  channel.stop();
});

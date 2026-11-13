import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { RatesTodayDto } from '@gogospend/contracts';

import { V1Error } from '../../api/client.ts';
import { deviceStore } from '../../wallet/store/walletStore.ts';
import type { KeyValueStore, StoreBackend } from '../../wallet/store/walletStore.ts';
import { RATES_TODAY_NAME, readCachedRates, refreshRates } from './ratesCache.ts';
import type { CachedRates } from './ratesCache.ts';
import type { SpendV1Resources } from './resources.ts';

// The fixture feed's quotes (P5-T6): tc-offline-rate's cached day, then the next day's set.
const NOV_2: RatesTodayDto = { base: 'USD', as_of: '2026-11-02', rates: { THB: { per_base: '34.62', day: '2026-11-02' }, JPY: { per_base: '150', day: '2026-11-02' } } };
const NOV_3: RatesTodayDto = { base: 'USD', as_of: '2026-11-03', rates: { THB: { per_base: '34.68', day: '2026-11-03' }, JPY: { per_base: '150', day: '2026-11-03' } } };
/** Where the device scope keeps the set (walletStore.ts's DEVICE_PREFIX). */
const KEY = 'jotbun.wallet.rates-today';

/** A memory backend under the device scope, as `walletDeviceStore()` is on a phone. */
function memory(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  const backend: StoreBackend = {
    getItem: async (key) => items.get(key) ?? null,
    setItem: async (key, value) => { items.set(key, value); },
    removeItem: async (key) => { items.delete(key); },
    getAllKeys: async () => [...items.keys()],
    multiRemove: async (keys) => { for (const key of keys) items.delete(key); },
  };
  return { items, store: deviceStore(backend) };
}

type Answer = Awaited<ReturnType<SpendV1Resources['ratesToday']>>;
/** Today's rates as the server answers them, one queued answer per call, recording the ETag each call sent. */
function server(answers: (Answer | V1Error)[]) {
  const asked: (string | undefined)[] = [];
  const resources: Pick<SpendV1Resources, 'ratesToday'> = {
    async ratesToday(etag) {
      asked.push(etag);
      const answer = answers.shift();
      if (answer === undefined) throw new Error('no answer queued');
      if (answer instanceof V1Error) throw answer;
      return answer;
    },
  };
  return { asked, resources };
}

/** A promise's value, or the name of what it rejected with, so every check below is an assertion. */
const settled = <T>(promise: Promise<T>) => promise.then((value) => ({ value }), (error: unknown) => ({ rejected: error instanceof Error ? error.name : String(error) }));
/** The stored text, parsed; 'not JSON' when it cannot be. */
const stored = (text: string | undefined): unknown => {
  try {
    return text === undefined ? null : JSON.parse(text);
  } catch {
    return 'not JSON';
  }
};

test('a refresh stores a new set with its ETag', async () => {
  const { items, store } = memory();
  const { asked, resources } = server([{ etag: '"r2"', rates: NOV_2 }, { etag: null, rates: NOV_3 }]);
  const first = await settled(refreshRates(resources, store));
  const kept = stored(items.get(KEY));
  const second = await settled(refreshRates(resources, store));
  assert.deepEqual([first, kept], [{ value: { etag: '"r2"', rates: NOV_2 } }, { etag: '"r2"', rates: NOV_2 }]);
  // The next refresh asks with that ETag; a set the server sent without one is kept with null.
  assert.deepEqual(asked, [undefined, '"r2"']);
  assert.deepEqual([second, stored(items.get(KEY))], [{ value: { etag: null, rates: NOV_3 } }, { etag: null, rates: NOV_3 }]);
  assert.deepEqual(await settled(readCachedRates(store)), { value: { etag: null, rates: NOV_3 } });
  assert.equal(RATES_TODAY_NAME, 'rates-today');
});

test('a 304 or a failure keeps the cache', async () => {
  const cached: CachedRates = { etag: '"r2"', rates: NOV_2 };
  const { items, store } = memory({ [KEY]: JSON.stringify(cached) });
  const { asked, resources } = server(['unchanged', new V1Error('network', 0, 'NETWORK_ERROR'), new V1Error('unavailable', 503, 'SERVICE_UNAVAILABLE'), new V1Error('invalid_response', 200, 'INVALID_RESPONSE')]);
  const answers: unknown[] = [];
  for (let call = 0; call < 4; call += 1) answers.push(await settled(refreshRates(resources, store)));
  assert.deepEqual(answers, [{ value: cached }, { value: cached }, { value: cached }, { value: cached }]);
  assert.deepEqual(asked, ['"r2"', '"r2"', '"r2"', '"r2"']);
  assert.deepEqual(stored(items.get(KEY)), cached);
});

test('a damaged cache reads as none', async () => {
  const good: CachedRates = { etag: '"r2"', rates: NOV_2 };
  const read = (text: string) => settled(readCachedRates(memory({ [KEY]: text }).store));
  assert.deepEqual(await read(JSON.stringify(good)), { value: good });
  const damaged = [
    '{"etag":',
    'null',
    '[]',
    JSON.stringify({ rates: NOV_2 }),
    JSON.stringify({ ...good, etag: 5 }),
    JSON.stringify({ ...good, extra: true }),
    JSON.stringify({ ...good, rates: { ...NOV_2, base: 'usd' } }),
  ];
  assert.deepEqual(await Promise.all(damaged.map(read)), damaged.map(() => ({ value: null })));
  // Nothing stored is none, and so is a store that cannot be read: never a failure.
  assert.deepEqual(await settled(readCachedRates(memory().store)), { value: null });
  const unreadable: KeyValueStore = { ...memory().store, get: async () => { throw new Error('locked'); } };
  assert.deepEqual(await settled(readCachedRates(unreadable)), { value: null });
});

test('a refresh never fails: a store that cannot be read or written still answers the new set', async () => {
  const broken: KeyValueStore = { ...memory().store, get: async () => { throw new Error('locked'); }, set: async () => { throw new Error('full'); } };
  const { asked, resources } = server([{ etag: '"r3"', rates: NOV_3 }]);
  assert.deepEqual(await settled(refreshRates(resources, broken)), { value: { etag: '"r3"', rates: NOV_3 } });
  assert.deepEqual(asked, [undefined]);
});

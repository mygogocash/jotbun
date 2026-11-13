// RED stub (P5-T17): the plan's interface, answering no cache yet.
import type { RatesTodayDto } from '@gogospend/contracts';

import type { KeyValueStore } from '../../wallet/store/walletStore.ts';
import type { SpendV1Resources } from './resources.ts';

export const RATES_TODAY_NAME = 'rates-today';

export type CachedRates = { etag: string | null; rates: RatesTodayDto };

export async function readCachedRates(_store: KeyValueStore): Promise<CachedRates | null> {
  return null;
}

export async function refreshRates(_resources: Pick<SpendV1Resources, 'ratesToday'>, _store: KeyValueStore): Promise<CachedRates | null> {
  return null;
}

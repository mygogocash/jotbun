// Today's reference rates, cached on this phone (P5-T17) so it can estimate
// home amounts offline (P5-T18a). The set is public data: it lives in the
// device store (`jotbun.wallet.rates-today`, `walletDeviceStore()`) and leaves
// at sign-out with every device setting. Pure over a KeyValueStore.
import { isRatesTodayDto } from '@gogospend/contracts';
import type { RatesTodayDto } from '@gogospend/contracts';

import type { KeyValueStore } from '../../wallet/store/walletStore.ts';
import type { SpendV1Resources } from './resources.ts';

/** The cached set's name in the device store. */
export const RATES_TODAY_NAME = 'rates-today';

/** The set as the server last sent it, and the ETag that names it (null when it sent none). */
export type CachedRates = { etag: string | null; rates: RatesTodayDto };

/** Exactly a cached set: its two keys, an ETag of text or null, and a valid set. */
function isCachedRates(value: unknown): value is CachedRates {
  if (typeof value !== 'object' || value === null) return false;
  const cached = value as Record<string, unknown>;
  return Object.keys(cached).sort().join(',') === 'etag,rates' && (cached.etag === null || typeof cached.etag === 'string') && isRatesTodayDto(cached.rates);
}

/** The cached set, or null when there is none, the store cannot be read, or what it holds is damaged. */
export async function readCachedRates(store: KeyValueStore): Promise<CachedRates | null> {
  let value: unknown;
  try {
    const text = await store.get(RATES_TODAY_NAME);
    if (text === null) return null;
    value = JSON.parse(text);
  } catch {
    return null;
  }
  return isCachedRates(value) ? value : null;
}

/**
 * Asks for today's set with the cached set's ETag. A new set is stored and
 * answered; 'unchanged' (304) or a failed read keeps the cache and answers
 * it. Never rejects: a store that cannot be written still answers the new set.
 */
export async function refreshRates(resources: Pick<SpendV1Resources, 'ratesToday'>, store: KeyValueStore): Promise<CachedRates | null> {
  const cached = await readCachedRates(store);
  let answer: Awaited<ReturnType<SpendV1Resources['ratesToday']>>;
  try {
    answer = await resources.ratesToday(cached?.etag ?? undefined);
  } catch {
    return cached;
  }
  if (answer === 'unchanged') return cached;
  const next: CachedRates = { etag: answer.etag, rates: answer.rates };
  try {
    await store.set(RATES_TODAY_NAME, JSON.stringify(next));
  } catch {
    // Not kept for the next start, but it is still today's set.
  }
  return next;
}

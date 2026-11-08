// RED stub (1D-T6): the exports the tests import, with none of the behaviour.
import type { StoredConsent } from './controller';

export const ANALYTICS_CONSENT_KEY = 'gogospend.analytics-consent';

export async function readStoredConsent(): Promise<StoredConsent | null> {
  return null;
}

export async function writeStoredConsent(_value: StoredConsent): Promise<void> {}

export async function eraseStoredConsent(): Promise<void> {}

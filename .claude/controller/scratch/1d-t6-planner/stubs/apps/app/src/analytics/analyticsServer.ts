// RED stub (1D-T6): the exports the tests import, with none of the behaviour.
import type { V1Transport } from '../api/client.ts';
import type { AnalyticsDeps } from './controller.ts';

export function createAnalyticsServer(_transport: V1Transport): AnalyticsDeps['server'] {
  return {
    read: async () => ({ consent: 'unasked', analyticsId: null, weeksSinceSignup: null }),
    setConsent: async () => undefined,
  };
}

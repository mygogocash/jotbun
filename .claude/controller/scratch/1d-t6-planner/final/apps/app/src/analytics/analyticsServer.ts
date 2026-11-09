// The consent and identity calls over the v1 transport (plan 1D-T6), pure.
// The server's answer is read from GET /v1/me/analytics (1D-T11); a server
// without that route answers 404 NOT_FOUND, and then /v1/me says only whether
// analytics is on, with no analytics id. The answer is sent with
// PUT /v1/me/privacy-preferences, and the server must say it back.
import { V1Error } from '../api/client.ts';
import type { V1Transport } from '../api/client.ts';
import type { AnalyticsDeps, ServerConsent } from './controller.ts';

type AnalyticsAnswer = { analytics_id: string | null; weeks_since_signup: number; consent: ServerConsent };

const ANALYTICS_ID = /^[0-9a-f]{64}$/;
const MAX_WEEKS = 1040;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function isAnalyticsAnswer(value: unknown): value is AnalyticsAnswer {
  if (!isRecord(value) || !hasExactly(value, ['analytics_id', 'weeks_since_signup', 'consent'])) return false;
  const id = value.analytics_id;
  const weeks = value.weeks_since_signup;
  const consent = value.consent;
  return (id === null || (typeof id === 'string' && ANALYTICS_ID.test(id)))
    && typeof weeks === 'number' && Number.isInteger(weeks) && weeks >= 0 && weeks <= MAX_WEEKS
    && (consent === 'yes' || consent === 'no' || consent === 'unasked');
}

function isMeWithPrivacy(value: unknown): value is { privacy: { analytics: boolean } } {
  return isRecord(value) && isRecord(value.privacy) && typeof value.privacy.analytics === 'boolean';
}

/** A server that predates 1D-T11: the route table has no /v1/me/analytics. */
function routeMissing(error: unknown): boolean {
  return error instanceof V1Error && error.status === 404 && error.code === 'NOT_FOUND';
}

export function createAnalyticsServer(transport: V1Transport): AnalyticsDeps['server'] {
  return {
    async read() {
      try {
        const answer = await transport.request('GET', '/v1/me/analytics', { validate: isAnalyticsAnswer });
        return { consent: answer.consent, analyticsId: answer.analytics_id, weeksSinceSignup: answer.weeks_since_signup };
      } catch (error) {
        if (!routeMissing(error)) throw error;
      }
      const me = await transport.request('GET', '/v1/me', { validate: isMeWithPrivacy });
      return { consent: me.privacy.analytics ? 'yes' : 'unasked', analyticsId: null, weeksSinceSignup: null };
    },
    async setConsent(analytics) {
      await transport.request('PUT', '/v1/me/privacy-preferences', {
        body: { analytics },
        validate: (value): value is { analytics: boolean } => isRecord(value) && hasExactly(value, ['analytics']) && value.analytics === analytics,
      });
    },
  };
}

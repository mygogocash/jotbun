export function getMobileEnv() {
  const v1ApiUrl = process.env.EXPO_PUBLIC_V1_API_URL?.trim() || 'http://localhost:8091';
  return {
    apiUrl: process.env.EXPO_PUBLIC_API_URL?.trim() || 'http://localhost:8090',
    /** The v1 API (`npm run dev:v1` serves it on 8091). */
    v1ApiUrl,
    frontendUrl: process.env.EXPO_PUBLIC_FRONTEND_URL?.trim() || 'http://localhost:8081',
    /** Better Auth. Defaults to the v1 API: one Worker serves both. */
    authUrl: process.env.EXPO_PUBLIC_AUTH_URL?.trim() || v1ApiUrl,
    /** Google sign-in's web client id: Google is offered only once it is set (Q1, after the development-build check). */
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? '',
    /** Google sign-in's iOS client id: on iOS, Google also needs this one. */
    googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? '',
    /** PostHog's project key: empty until the PostHog project exists (plan 1D, Q5), and then nothing is sent. */
    posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim() ?? '',
    /** PostHog's host: the Worker's /ingest proxy (1D-T2) unless set. */
    posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || `${v1ApiUrl.replace(/\/+$/, '')}/ingest`,
    /** Scrubbed crash reports without consent (spec section 7, Q4): on unless '0' makes them consent-only. */
    crashReportsWithoutConsent: process.env.EXPO_PUBLIC_CRASH_REPORTS_WITHOUT_CONSENT?.trim() !== '0',
  };
}

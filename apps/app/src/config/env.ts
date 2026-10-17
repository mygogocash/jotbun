export function getMobileEnv() {
  return {
    apiUrl: process.env.EXPO_PUBLIC_API_URL?.trim() || 'http://localhost:8090',
    /** The v1 API (`npm run dev:v1` serves it on 8091). */
    v1ApiUrl: process.env.EXPO_PUBLIC_V1_API_URL?.trim() || 'http://localhost:8091',
    frontendUrl: process.env.EXPO_PUBLIC_FRONTEND_URL?.trim() || 'http://localhost:8081',
    /** Public Auth0 settings (no secret): empty until the E1 tenant exists, which keeps the app signed out. */
    auth0Domain: process.env.EXPO_PUBLIC_AUTH0_DOMAIN?.trim() || '',
    auth0ClientId: process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID?.trim() || '',
    auth0Audience: process.env.EXPO_PUBLIC_AUTH0_AUDIENCE?.trim() || '',
  };
}

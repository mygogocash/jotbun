export function getMobileEnv() {
  const v1ApiUrl = process.env.EXPO_PUBLIC_V1_API_URL?.trim() || 'http://localhost:8091';
  return {
    apiUrl: process.env.EXPO_PUBLIC_API_URL?.trim() || 'http://localhost:8090',
    /** The v1 API (`npm run dev:v1` serves it on 8091). */
    v1ApiUrl,
    frontendUrl: process.env.EXPO_PUBLIC_FRONTEND_URL?.trim() || 'http://localhost:8081',
    /** Better Auth. Defaults to the v1 API: one Worker serves both. */
    authUrl: process.env.EXPO_PUBLIC_AUTH_URL?.trim() || v1ApiUrl,
  };
}

export function getMobileEnv() {
  return {
    apiUrl: process.env.EXPO_PUBLIC_API_URL?.trim() || 'http://localhost:8090',
    frontendUrl: process.env.EXPO_PUBLIC_FRONTEND_URL?.trim() || 'http://localhost:8081',
  };
}

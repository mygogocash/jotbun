import { getSession } from '@mobile/auth/session';
import { createMobileApiClient } from './client';

export async function getSharedMobileApiClient(baseUrl: string) {
  return createMobileApiClient({ baseUrl, getToken: async () => getSession()?.access_token ?? null });
}

import { getSession } from '@mobile/auth/session';
import { createMobileApiClient } from './client';

/** Legacy /spend client: only for development screens not yet converted to v1. */
export async function getSharedMobileApiClient(baseUrl: string) {
  return createMobileApiClient({ baseUrl, getToken: async () => getSession()?.access_token ?? null });
}

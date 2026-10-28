import type { BetterAuthClientPlugin } from 'better-auth/client';

/**
 * The client half of the server's `jotbun-account` plugin: the account's
 * devices and the sign-out routes. Declared with `satisfies`, not as the
 * return type, so the client keeps every action's type and tsc checks each
 * call; the answers stay `unknown` until betterAuthClient.ts reads them.
 */
export function jotbunAccountClient() {
  return {
    id: 'jotbun-account',
    getActions: ($fetch) => ({
      devices: () => $fetch<unknown>('/jotbun/devices', { method: 'GET' }),
      signOutDevice: ({ id }: { id: string }) => $fetch<unknown>('/jotbun/devices/sign-out', { method: 'POST', body: { id } }),
      signOutOtherDevices: () => $fetch<unknown>('/jotbun/devices/sign-out-others', { method: 'POST' }),
      signOutEverywhere: () => $fetch<unknown>('/jotbun/sign-out-everywhere', { method: 'POST' }),
    }),
  } satisfies BetterAuthClientPlugin;
}

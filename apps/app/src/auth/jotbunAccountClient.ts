import type { BetterAuthClientPlugin } from 'better-auth/client';

/** The account's devices and the sign-out routes the vault does not own (R57). */
export function jotbunAccountClient(): BetterAuthClientPlugin {
  return {
    id: 'jotbun-account',
    getActions($fetch) {
      return {
        devices: () => $fetch('/jotbun/devices', { method: 'GET' }),
        signOutDevice: ({ id }: { id: string }) => $fetch('/jotbun/devices/sign-out', { method: 'POST', body: { id } }),
        signOutOtherDevices: () => $fetch('/jotbun/devices/sign-out-others', { method: 'POST' }),
        signOutEverywhere: () => $fetch('/jotbun/sign-out-everywhere', { method: 'POST' }),
      };
    },
  };
}

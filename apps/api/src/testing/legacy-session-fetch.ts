// Test use only (ruling R90). The app's v1 transport no longer sends
// X-GoGoSpend-Session (plan 1C, K13): the vault reads the session from the
// token's `sid`. This API is frozen and retiring and still requires the
// header, so a spec that drives the app's own transport against it passes
// this as the transport's `fetchImpl`, with the binding it already uses.
import { V1_HEADERS } from '@gogospend/contracts';

/** A fetch that sends `binding` as the legacy session header, then calls `inner`. */
export function legacySessionFetch(binding: string, inner: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set(V1_HEADERS.session, binding);
    return inner(input, { ...init, headers });
  };
}

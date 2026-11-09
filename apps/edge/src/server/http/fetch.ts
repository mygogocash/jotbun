/**
 * The fetch the shared API clients receive on Workers. Two runtime gaps are
 * closed here, so the clients run unchanged:
 *   - the clients keep `fetch` as a field and call it as a method, which the
 *     runtime refuses ("Illegal invocation") for the bare global; and
 *   - Workers do not implement `redirect: "error"` (constructing such a
 *     request throws before anything is sent). The Auth0 Management client
 *     uses it to never follow a redirect, so it is emulated as the Fetch
 *     standard defines it: the request is sent with `manual`, and a redirect
 *     response rejects with a TypeError, its body released.
 */
export function makeWorkerFetch(base: typeof fetch = (input, init) => fetch(input, init)): typeof fetch {
  return async (input, init) => {
    if (init?.redirect !== 'error') return base(input, init)
    const res = await base(input, { ...init, redirect: 'manual' })
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel()
      throw new TypeError('fetch failed: redirect refused')
    }
    return res
  }
}

export const workerFetch: typeof fetch = makeWorkerFetch()

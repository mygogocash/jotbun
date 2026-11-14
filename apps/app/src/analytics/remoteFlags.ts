// Remote flags after yes (plan P6B-T14, X5, B25), pure: nothing here loads the
// SDK or reads a store. 1D-T6's client keeps `disableRemoteFeatureFlags: true`,
// so PostHog never asks for flags itself; the controller asks here, only in
// yes, under the analytics id, and pushes the answer with `updateFlags`. The
// request goes to 1D-T2's proxy and carries the project key and the analytics
// id, nothing else. It asks for `redirect: 'error'`, but React Native's fetch
// (whatwg-fetch over XHR) ignores that and follows a redirect, so the proxy host
// must never redirect (P6C sets it). Any failure answers null, and the controller
// keeps the last answer.

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type RemoteFlags = { flags: Record<string, boolean | string>; payloads: Record<string, JsonValue> };

/** P2-T3's account store: the last loaded RemoteFlags, values only (no ids, versions or reasons). */
export const REMOTE_FLAGS_NAME = 'remote-flags';

/** How long a flags request may take before it counts as failed. */
export const FLAGS_TIMEOUT_MS = 5000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * PostHog's v2 answer: each flag is its variant when it has one, else `enabled`;
 * a payload is JSON text, parsed. A partial answer (errors while computing) or
 * one over the flags quota is a failure, so the last whole answer stays.
 * Anything else out of shape is malformed: null.
 */
function readAnswer(body: unknown): RemoteFlags | null {
  if (!isRecord(body) || !isRecord(body.flags)) return null;
  if (body.errorsWhileComputingFlags === true) return null;
  if (Array.isArray(body.quotaLimited) && body.quotaLimited.includes('feature_flags')) return null;
  const flags: Record<string, boolean | string> = {};
  const payloads: Record<string, JsonValue> = {};
  for (const [key, detail] of Object.entries(body.flags)) {
    if (!isRecord(detail) || typeof detail.enabled !== 'boolean') return null;
    flags[key] = typeof detail.variant === 'string' ? detail.variant : detail.enabled;
    const payload = isRecord(detail.metadata) ? detail.metadata.payload : undefined;
    if (typeof payload === 'string') payloads[key] = JSON.parse(payload) as JsonValue;
  }
  return { flags, payloads };
}

/**
 * POST `${host}/flags/?v=2` (as @posthog/core asks) with `{ api_key, distinct_id }`
 * and `redirect: 'error'` (which React Native's fetch ignores). Null on any failure, a status outside 2xx, a timeout
 * (default 5000 ms; the request is then aborted) or a malformed answer.
 */
export async function fetchRemoteFlags(input: {
  host: string;
  apiKey: string;
  distinctId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<RemoteFlags | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Settles at the time limit even when the fetch ignores the abort.
  const timedOut = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, input.timeoutMs ?? FLAGS_TIMEOUT_MS);
  });
  const asked = (async () => {
    const response = await fetchImpl(`${input.host.replace(/\/+$/, '')}/flags/?v=2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: input.apiKey, distinct_id: input.distinctId }),
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return readAnswer(await response.json());
  })().catch(() => null);
  try {
    return await Promise.race([asked, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

/** The kept answer read back from the account's store, or null when there is none or it cannot be read. */
export function parseKeptFlags(raw: string | null): RemoteFlags | null {
  if (raw === null) return null;
  try {
    const kept: unknown = JSON.parse(raw);
    if (isRecord(kept) && isRecord(kept.flags) && isRecord(kept.payloads)) return kept as RemoteFlags;
  } catch {
    // Unreadable: as if nothing were kept.
  }
  return null;
}

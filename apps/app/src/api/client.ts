export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) { super(message); this.name = 'ApiError'; this.status = status; this.code = code; }
}

export function createMobileApiClient(options: {
  baseUrl: string;
  getToken: () => Promise<string | null>;
}) {
  const base = new URL(options.baseUrl);
  if (base.username || base.password || !['http:', 'https:'].includes(base.protocol)) {
    throw new ApiError('Invalid API URL.', 0, 'CONFIG_REQUIRED');
  }
  if (base.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
    throw new ApiError('Use HTTPS for a remote API.', 0, 'CONFIG_REQUIRED');
  }
  const baseUrl = options.baseUrl.replace(/\/+$/, '');

  async function request<T>(method: string, path: string, body?: unknown, multipart = false): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
      throw new ApiError('Expected a relative API path.', 0, 'INVALID_PATH');
    }
    const token = await options.getToken();
    if (!token) throw new ApiError('Sign in to use your diary.', 401, 'SESSION_REQUIRED');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(!multipart && body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body === undefined ? undefined : multipart ? body as FormData : JSON.stringify(body),
        signal: controller.signal,
        redirect: 'error',
      });
      const text = await response.text();
      let payload: unknown = null;
      try { payload = text ? JSON.parse(text) : null; } catch {
        throw new ApiError('The API returned an unreadable response.', response.status, 'INVALID_RESPONSE');
      }
      if (!response.ok) {
        const error = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
        const code = typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code) ? error.code : undefined;
        throw new ApiError(typeof error.message === 'string' ? error.message : `Request failed (${response.status}).`, response.status, code);
      }
      if (await options.getToken() !== token) {
        throw new ApiError('Your session changed. Try again.', 401, 'SESSION_CHANGED');
      }
      return payload as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(controller.signal.aborted ? 'The request timed out. Try again.' : 'Could not reach the API. Try again.', 0, controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR');
    } finally {
      clearTimeout(timeout);
    }
  }
  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
    postFormData: <T>(path: string, body: FormData) => request<T>('POST', path, body, true),
  };
}

// ---------------------------------------------------------------------------
// v1 transport (PostgreSQL/Auth0 API). Separate from the legacy /spend client
// above, which stays only for unconverted development screens.

/** What the session layer (F5) exposes to the transport. */
export type V1SessionSnapshot = { binding: string | null; epoch: number };
/** A v1 refusal that means the server ended the session (F5). */
export type V1SessionEnd = { code: 'SESSION_REQUIRED' | 'REAUTH_REQUIRED' | 'ACCOUNT_UNAVAILABLE'; epoch: number };
export type V1Credentials = {
  /** null: no usable session. A rejection means the token can't be read right now (offline): a `network` outcome. */
  getAccessToken(): Promise<string | null>;
  getSessionSnapshot(): V1SessionSnapshot;
  /** One serialized token refresh after a 401 (F5); false when the session cannot be renewed; a rejection is a `network` outcome. */
  refreshAfterUnauthorized?(): Promise<boolean>;
  /** The server ended the session the request was sent under (F5); `epoch` is the epoch it was sent under. */
  sessionEnded?(event: V1SessionEnd): void;
};
export type V1ClientVersion = { platform: 'ios' | 'android'; version: string };

/** How a screen should react, independent of the exact problem code. */
export type V1Outcome =
  | 'invalid'
  | 'signed_out'
  | 'session_changed'
  | 'policy_required'
  | 'not_found'
  | 'conflict'
  | 'deleted'
  | 'purged'
  | 'idempotency_mismatch'
  | 'schema_unsupported'
  | 'too_large'
  | 'rate_limited'
  | 'upgrade_required'
  | 'unavailable'
  | 'unsupported_platform'
  | 'network'
  | 'invalid_response';

export class V1Error extends Error {
  readonly status: number;
  readonly code: string;
  readonly outcome: V1Outcome;
  readonly fields?: Readonly<Record<string, string>>;
  readonly current?: unknown;
  readonly retryAfterSeconds?: number;
  constructor(outcome: V1Outcome, status: number, code: string, extra: { fields?: Record<string, string>; current?: unknown; retryAfterSeconds?: number } = {}) {
    super(`${code} (${status})`);
    this.name = 'V1Error';
    this.outcome = outcome;
    this.status = status;
    this.code = code;
    this.fields = extra.fields;
    this.current = extra.current;
    this.retryAfterSeconds = extra.retryAfterSeconds;
  }
}

export type V1CommandHeaders = { id: string; schemaVersion: number; ifMatch?: number };
/**
 * A raw (non-JSON) request body, e.g. an import file (P3): sent byte for
 * byte with its own Content-Type and, for an upload, its percent-encoded
 * original file name. Never combined with `body`.
 */
export type V1RawBody = { bytes: Uint8Array; contentType: string; fileName?: string };
export type V1RequestOptions<T> = {
  body?: unknown;
  raw?: V1RawBody;
  command?: V1CommandHeaders;
  /** Hand the raw response text to `validate` (e.g. to check a digest) instead of parsed JSON. */
  text?: boolean;
  /**
   * Hand a success's raw bytes to `validate` instead of parsed JSON (a
   * receipt's image, which a text read would change), asking for these media
   * types; a refusal is still read as a JSON problem.
   */
  bytes?: { accept: readonly string[] };
  /** This request's own time limit instead of the transport's (a slow server-side copy, a large download). */
  timeoutMs?: number;
  /**
   * One limit for the whole request, from the call: every resend (after a
   * lost answer or a refreshed token) waits only for what is left of it, and
   * none is sent once it passed. Without it, each attempt gets its full limit.
   */
  deadlineMs?: number;
  /** Token-only routes (challenge, bootstrap, proof): no application binding is sent or required. */
  tokenOnly?: boolean;
  /**
   * This request's own credentials instead of the session's: a pending
   * sign-in's access token, or a binding being revoked at sign-out. Never
   * refreshed, and never reported as the session ending.
   */
  credentials?: { accessToken: string; binding?: string };
  /** The command carries a purpose proof: REAUTH_REQUIRED refuses that proof, not the session. */
  proof?: boolean;
  /**
   * false: one attempt only, never resent after a lost response (the outbox
   * decides; a hidden resend could commit and then be reported as refused).
   */
  resendLost?: boolean;
  /** Rejects any response that is not exactly the expected DTO. */
  validate: (payload: unknown) => payload is T;
};

export type V1Transport = {
  request<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, options: V1RequestOptions<T>): Promise<T>;
};

const PROBLEM_OUTCOMES: Record<string, V1Outcome> = {
  SESSION_REQUIRED: 'signed_out',
  UNAUTHENTICATED: 'signed_out',
  REAUTH_REQUIRED: 'signed_out',
  ACCOUNT_UNAVAILABLE: 'signed_out',
  POLICY_ACCEPTANCE_REQUIRED: 'policy_required',
  // Missing scope: a fresh sign-in is the only fix the app can offer.
  FORBIDDEN: 'signed_out',
  RESYNC_REQUIRED: 'unavailable',
  NOT_FOUND: 'not_found',
  VERSION_CONFLICT: 'conflict',
  ENTITY_DELETED: 'deleted',
  ENTITY_PURGED: 'purged',
  IDEMPOTENCY_MISMATCH: 'idempotency_mismatch',
  COMMAND_SCHEMA_UNSUPPORTED: 'schema_unsupported',
  COMMAND_TOO_LARGE: 'too_large',
  RATE_LIMITED: 'rate_limited',
  CLIENT_UPGRADE_REQUIRED: 'upgrade_required',
  SERVICE_UNAVAILABLE: 'unavailable',
  WRITES_PAUSED: 'unavailable',
};

function outcomeFor(status: number, code: string): V1Outcome {
  const known = PROBLEM_OUTCOMES[code];
  if (known) return known;
  if (status === 401) return 'signed_out';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 426) return 'upgrade_required';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unavailable';
  return 'invalid';
}

const PROBLEM_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
/** A 401 that a token refresh can fix (not REAUTH_REQUIRED, SESSION_REQUIRED or an unavailable account). */
const unauthenticated = (payload: unknown) => {
  const code = payload && typeof payload === 'object' ? (payload as { code?: unknown }).code : undefined;
  return code === undefined || code === 'UNAUTHENTICATED';
};
/** The refusals that mean the server ended the session (binding gone or expired, re-authentication needed, account unavailable). */
const sessionEnd = (status: number, code: string): V1SessionEnd['code'] | null => {
  if (status === 401 && (code === 'SESSION_REQUIRED' || code === 'REAUTH_REQUIRED')) return code;
  if (status === 403 && code === 'ACCOUNT_UNAVAILABLE') return code;
  return null;
};
const NETWORK_RETRIES = 2;

/** A private IPv4 literal (10/8, 172.16/12, 192.168/16), read from the hostname the URL parser normalised. */
function privateIpv4(hostname: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  const [first, second] = octets;
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

/**
 * The v1 transport: every private request carries the access token, the
 * opaque session binding and `X-GoGoSpend-Client`; every command carries its
 * Idempotency-Key, `X-GoGoSpend-Command-Schema` and If-Match when versioned.
 * A command whose response is lost is resent as the same immutable request
 * (same key, same body). A response that arrives after the session epoch
 * changed (sign-out, account switch, new binding) is dropped, and nothing is
 * resent or refreshed once it moved. A 401 for an expired token is refreshed
 * at most once per request, and not at all when another request already
 * renewed the token it was sent with. A session the server ended is reported
 * to the credentials with the epoch the request was sent under. A token that
 * can't be read right now (offline) is a `network` outcome, never a sign-out.
 * Responses must pass the caller's exact DTO validator; nothing is coerced.
 * A binary read (a receipt's image) gets the same headers, refresh and
 * session checks, with a success read as bytes. A request with its own
 * deadline ends by then, resends and a refreshed resend included.
 */
export function createV1Transport(options: {
  baseUrl: string;
  credentials: V1Credentials;
  client: V1ClientVersion | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /**
   * true: `http://` to a private IPv4 literal (10/8, 172.16/12, 192.168/16) is accepted, as loopback is.
   * For a development build reaching `wrangler dev` on the LAN; release builds never set it (plan 1D, L8).
   */
  allowLanHttp?: boolean;
}): V1Transport {
  let base: URL;
  try {
    base = new URL(options.baseUrl);
  } catch {
    throw new V1Error('invalid', 0, 'CONFIG_REQUIRED');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  const lan = options.allowLanHttp === true && privateIpv4(base.hostname);
  if (base.username || base.password || !(base.protocol === 'https:' || (base.protocol === 'http:' && (loopback || lan)))) {
    throw new V1Error('invalid', 0, 'CONFIG_REQUIRED');
  }
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const credentials = options.credentials;

  type Answer = { status: number; payload: unknown; readable: boolean; text: string; bytes?: Uint8Array };
  async function once(url: string, init: RequestInit, limitMs: number, binary: boolean): Promise<Answer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limitMs);
    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal, redirect: 'error' });
      if (binary && response.status >= 200 && response.status <= 299) {
        return { status: response.status, payload: null, readable: true, text: '', bytes: new Uint8Array(await response.arrayBuffer()) };
      }
      const text = await response.text();
      try {
        return { status: response.status, payload: text ? JSON.parse(text) : null, readable: true, text };
      } catch {
        // A gateway's HTML error page: classified by status below, so a 5xx
        // while the origin may have committed stays "unavailable".
        return { status: response.status, payload: null, readable: false, text };
      }
    } catch (error) {
      if (error instanceof V1Error) throw error;
      throw new V1Error('network', 0, controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
    }
  }

  // The session's credentials can be unreadable for a moment (offline): an outage, not a sign-out.
  const readToken = async (): Promise<string | null> => {
    try {
      return await credentials.getAccessToken();
    } catch {
      throw new V1Error('network', 0, 'NETWORK_ERROR');
    }
  };
  const refresh = async (): Promise<boolean> => {
    try {
      return (await credentials.refreshAfterUnauthorized?.()) ?? false;
    } catch {
      throw new V1Error('network', 0, 'NETWORK_ERROR');
    }
  };

  return {
    async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, request: V1RequestOptions<T>): Promise<T> {
      if (!path.startsWith('/v1/') || path.includes('\\') || path.includes('//')) throw new V1Error('invalid', 0, 'INVALID_PATH');
      if (!options.client) throw new V1Error('unsupported_platform', 0, 'CLIENT_UNSUPPORTED');
      const deadline = request.deadlineMs === undefined ? Infinity : Date.now() + request.deadlineMs;
      const before = credentials.getSessionSnapshot();
      const stillCurrent = () => {
        if (credentials.getSessionSnapshot().epoch !== before.epoch) throw new V1Error('session_changed', 0, 'SESSION_CHANGED');
      };
      // This request's own credentials (a pending sign-in, a binding being revoked) or the session's.
      const own = request.credentials;
      const token = own ? own.accessToken : await readToken();
      stillCurrent();
      const binding = request.tokenOnly ? null : own ? (own.binding ?? null) : before.binding;
      // Status 0 like every refusal made here: nothing was sent, so it is never the server's 401.
      if (!token || (!binding && !request.tokenOnly)) throw new V1Error('signed_out', 0, 'SESSION_REQUIRED');
      const headers: Record<string, string> = {
        Accept: request.bytes ? [...request.bytes.accept, 'application/json'].join(', ') : 'application/json',
        Authorization: `Bearer ${token}`,
        'X-GoGoSpend-Client': `${options.client.platform}/${options.client.version}`,
      };
      if (binding) headers['X-GoGoSpend-Session'] = binding;
      if (request.body !== undefined && request.raw) throw new V1Error('invalid', 0, 'INVALID_BODY');
      if (request.body !== undefined) headers['Content-Type'] = 'application/json';
      if (request.raw) {
        headers['Content-Type'] = request.raw.contentType;
        if (request.raw.fileName !== undefined) headers['X-GoGoSpend-File-Name'] = encodeURIComponent(request.raw.fileName);
      }
      if (request.command) {
        headers['Idempotency-Key'] = request.command.id;
        headers['X-GoGoSpend-Command-Schema'] = String(request.command.schemaVersion);
        if (request.command.ifMatch !== undefined) headers['If-Match'] = `"${request.command.ifMatch}"`;
      }
      // Serialized once, so every retry sends byte-identical content.
      const body: string | Uint8Array | undefined = request.raw ? request.raw.bytes : request.body === undefined ? undefined : JSON.stringify(request.body);
      const send = async (): Promise<Answer> => {
        const init: RequestInit = { method, headers, body: body as BodyInit | undefined };
        for (let attempt = 0; ; attempt += 1) {
          // Each attempt waits for its own limit or what is left of the request's, whichever is less.
          const limitMs = Math.min(request.timeoutMs ?? timeoutMs, deadline - Date.now());
          if (limitMs <= 0) throw new V1Error('network', 0, 'TIMEOUT');
          try {
            return await once(`${baseUrl}${path}`, init, limitMs, Boolean(request.bytes));
          } catch (error) {
            // Only a command may be resent blindly, and only as itself, and
            // never once the session changed; a read is retried from the screen.
            const lost = error instanceof V1Error && error.outcome === 'network';
            if (!lost || !request.command || request.resendLost === false || attempt >= NETWORK_RETRIES) throw error;
            await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
            stillCurrent();
          }
        }
      };
      let result = await send();
      // An expired access token (401 UNAUTHENTICATED): one resend of the same
      // body and key, with the token another request already renewed or after
      // one serialized refresh - never for 426, other refusals or a request's
      // own credentials, and never once the session changed.
      if (!own && result.status === 401 && unauthenticated(result.payload) && credentials.refreshAfterUnauthorized) {
        let renewed = await readToken();
        stillCurrent();
        if (renewed === token) {
          renewed = (await refresh()) ? await readToken() : null;
          stillCurrent();
        }
        if (!renewed) throw new V1Error('signed_out', 401, 'UNAUTHENTICATED');
        headers.Authorization = `Bearer ${renewed}`;
        result = await send();
      }
      stillCurrent();
      const { status, payload, readable, text, bytes } = result;
      if (status >= 200 && status <= 299 && request.bytes) {
        if (!bytes || !request.validate(bytes)) throw new V1Error('invalid_response', status, 'INVALID_RESPONSE');
        return bytes;
      }
      if (status >= 200 && status <= 299 && request.text) {
        if (!request.validate(text)) throw new V1Error('invalid_response', status, 'INVALID_RESPONSE');
        return text as T;
      }
      if (status >= 200 && status <= 299 && !readable) throw new V1Error('invalid_response', status, 'INVALID_RESPONSE');
      if (status < 200 || status > 299) {
        const problem = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
        const code = typeof problem.code === 'string' && PROBLEM_CODE.test(problem.code) ? problem.code : `HTTP_${status}`;
        const fields = problem.fields && typeof problem.fields === 'object' ? (problem.fields as Record<string, string>) : undefined;
        const retryAfterSeconds = typeof problem.retry_after_seconds === 'number' ? problem.retry_after_seconds : undefined;
        // The server ended the session this request was sent under. Not for a
        // request's own credentials or a token-only route (a sign-in handles
        // those), nor for a refused purpose proof (the proof, not the session).
        const ended = sessionEnd(status, code);
        if (ended && !own && !request.tokenOnly && !(ended === 'REAUTH_REQUIRED' && request.proof)) {
          credentials.sessionEnded?.({ code: ended, epoch: before.epoch });
        }
        throw new V1Error(outcomeFor(status, code), status, code, { fields, current: problem.current, retryAfterSeconds });
      }
      if (!request.validate(payload)) throw new V1Error('invalid_response', status, 'INVALID_RESPONSE');
      return payload;
    },
  };
}

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
export type V1Credentials = {
  getAccessToken(): Promise<string | null>;
  getSessionSnapshot(): V1SessionSnapshot;
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
export type V1RequestOptions<T> = {
  body?: unknown;
  command?: V1CommandHeaders;
  /** Hand the raw response text to `validate` (e.g. to check a digest) instead of parsed JSON. */
  text?: boolean;
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
const NETWORK_RETRIES = 2;

/**
 * The v1 transport: every private request carries the access token, the
 * opaque session binding and `X-GoGoSpend-Client`; every command carries its
 * Idempotency-Key, `X-GoGoSpend-Command-Schema` and If-Match when versioned.
 * A command whose response is lost is resent as the same immutable request
 * (same key, same body). A response that arrives after the session epoch
 * changed (sign-out, account switch, new binding) is dropped. Responses must
 * pass the caller's exact DTO validator; nothing is coerced.
 */
export function createV1Transport(options: {
  baseUrl: string;
  credentials: V1Credentials;
  client: V1ClientVersion | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): V1Transport {
  let base: URL;
  try {
    base = new URL(options.baseUrl);
  } catch {
    throw new V1Error('invalid', 0, 'CONFIG_REQUIRED');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (base.username || base.password || !(base.protocol === 'https:' || (base.protocol === 'http:' && loopback))) {
    throw new V1Error('invalid', 0, 'CONFIG_REQUIRED');
  }
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;

  async function once(url: string, init: RequestInit): Promise<{ status: number; payload: unknown; readable: boolean; text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal, redirect: 'error' });
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

  return {
    async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, request: V1RequestOptions<T>): Promise<T> {
      if (!path.startsWith('/v1/') || path.includes('\\') || path.includes('//')) throw new V1Error('invalid', 0, 'INVALID_PATH');
      if (!options.client) throw new V1Error('unsupported_platform', 0, 'CLIENT_UNSUPPORTED');
      const before = options.credentials.getSessionSnapshot();
      const token = await options.credentials.getAccessToken();
      if (!token || !before.binding) throw new V1Error('signed_out', 401, 'SESSION_REQUIRED');
      const headers: Record<string, string> = {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'X-GoGoSpend-Session': before.binding,
        'X-GoGoSpend-Client': `${options.client.platform}/${options.client.version}`,
      };
      if (request.body !== undefined) headers['Content-Type'] = 'application/json';
      if (request.command) {
        headers['Idempotency-Key'] = request.command.id;
        headers['X-GoGoSpend-Command-Schema'] = String(request.command.schemaVersion);
        if (request.command.ifMatch !== undefined) headers['If-Match'] = `"${request.command.ifMatch}"`;
      }
      // Serialized once, so every retry sends byte-identical content.
      const init: RequestInit = { method, headers, body: request.body === undefined ? undefined : JSON.stringify(request.body) };
      let result: { status: number; payload: unknown; readable: boolean; text: string } | undefined;
      for (let attempt = 0; ; attempt += 1) {
        try {
          result = await once(`${baseUrl}${path}`, init);
          break;
        } catch (error) {
          // Only a command may be resent blindly, and only as itself, and
          // never once the session changed; a read is retried from the screen.
          const lost = error instanceof V1Error && error.outcome === 'network';
          if (!lost || !request.command || attempt >= NETWORK_RETRIES) throw error;
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
          if (options.credentials.getSessionSnapshot().epoch !== before.epoch) throw new V1Error('session_changed', 0, 'SESSION_CHANGED');
        }
      }
      if (options.credentials.getSessionSnapshot().epoch !== before.epoch) throw new V1Error('session_changed', 0, 'SESSION_CHANGED');
      const { status, payload, readable, text } = result;
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
        throw new V1Error(outcomeFor(status, code), status, code, { fields, current: problem.current, retryAfterSeconds });
      }
      if (!request.validate(payload)) throw new V1Error('invalid_response', status, 'INVALID_RESPONSE');
      return payload;
    },
  };
}

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

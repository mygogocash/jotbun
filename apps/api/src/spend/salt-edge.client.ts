const SALT_EDGE_API = 'https://www.saltedge.com/api/v6';

/*
 * Deadline for one Salt Edge call. Without it a silent far side holds the
 * request open indefinitely — and these calls sit behind a member-triggered
 * webhook and a paging import loop, so one stalled socket blocks a handler
 * rather than a background job.
 */
const SALT_EDGE_TIMEOUT_MS = 15_000;

export type SaltEdgeConnectResult = {
  connect_url: string;
  customer_id: string;
  expires_at?: string;
};

export type SaltEdgeTransaction = {
  id: string;
  amount: number;
  currency_code?: string;
  description?: string;
  made_on?: string;
  status?: string;
  duplicated?: boolean;
  extra?: { merchant?: string; payee?: string };
};

const TX_PAGE_SIZE = 250;
const TX_MAX_PAGES = 8;

export function importableSaltEdgeTransaction(
  tx: SaltEdgeTransaction,
): boolean {
  if (tx.duplicated) return false;
  if (tx.status && tx.status !== 'posted') return false;
  const currency = (tx.currency_code ?? 'THB').trim().toUpperCase();
  if (currency !== 'THB') return false;
  const amount = Number(tx.amount);
  return Number.isFinite(amount) && amount !== 0;
}

export function saltEdgeConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.SALT_EDGE_APP_ID?.trim() && env.SALT_EDGE_SECRET?.trim());
}

export class SaltEdgeClient {
  constructor(
    private readonly appId = process.env.SALT_EDGE_APP_ID?.trim() ?? '',
    private readonly secret = process.env.SALT_EDGE_SECRET?.trim() ?? '',
    private readonly timeoutMs = SALT_EDGE_TIMEOUT_MS,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.appId && this.secret);
  }

  async createCustomer(identifier: string): Promise<string> {
    const body = await this.request<{ data: { id: string | number } }>(
      'POST',
      '/customers',
      { data: { identifier } },
    );
    return String(body.data.id);
  }

  /**
   * Revoke the Salt Edge customer and every consent attached to it
   * (`DELETE /customers/{id}`), so an account deletion erases the aggregator's
   * copy of the member's bank data and not just ours (#2232).
   *
   * Returns whether this call is what removed the customer. Two non-deletions
   * are deliberately not thrown:
   *
   *  - **unconfigured** — Salt Edge was never wired up in this environment, so
   *    there is no remote customer to erase. Callers on the deletion path must
   *    not fail because an optional integration is absent.
   *  - **404 CustomerNotFound** — the customer is already gone, which is the
   *    outcome the caller wanted. Throwing here would make a retry of a
   *    half-completed purge permanently red.
   *
   * Every other status still throws, `406 CustomerLocked` above all: that one
   * means a human locked the customer in the Salt Edge dashboard and the
   * erasure genuinely did not happen.
   */
  async deleteCustomer(customerId: string): Promise<boolean> {
    if (!this.isConfigured() || !customerId.trim()) return false;
    try {
      const body = await this.request<{
        data?: { deleted?: boolean };
      }>('DELETE', `/customers/${encodeURIComponent(customerId)}`);
      return body.data?.deleted !== false;
    } catch (error) {
      if (error instanceof Error && error.message === 'saltedge_404') {
        return false;
      }
      throw error;
    }
  }

  async createConnectSession(input: {
    customerId: string;
    userId: string;
    returnTo: string;
  }): Promise<SaltEdgeConnectResult> {
    const body = await this.request<{
      data: { connect_url: string; customer_id: string; expires_at?: string };
    }>('POST', '/connections/connect', {
      data: {
        customer_id: input.customerId,
        consent: {
          scopes: ['accounts', 'transactions'],
          period_days: 90,
        },
        attempt: {
          fetch_scopes: ['accounts', 'transactions'],
          locale: 'th',
          store_credentials: false,
          return_to: input.returnTo,
          custom_fields: { user_id: input.userId },
        },
        widget: {
          allowed_countries: ['TH'],
          popular_providers_country: 'TH',
        },
        automatic_refresh: false,
        return_connection_id: true,
      },
    });
    return {
      connect_url: body.data.connect_url,
      customer_id: String(body.data.customer_id),
      expires_at: body.data.expires_at,
    };
  }

  async getConnection(connectionId: string): Promise<{
    id: string;
    customer_id: string;
    provider_code?: string;
    status?: string;
  } | null> {
    try {
      const body = await this.request<{
        data: {
          id: string | number;
          customer_id: string | number;
          provider_code?: string;
          status?: string;
        };
      }>('GET', `/connections/${encodeURIComponent(connectionId)}`);
      return {
        id: String(body.data.id),
        customer_id: String(body.data.customer_id),
        provider_code: body.data.provider_code,
        status: body.data.status,
      };
    } catch {
      return null;
    }
  }

  async listTransactions(connectionId: string): Promise<SaltEdgeTransaction[]> {
    const rows: SaltEdgeTransaction[] = [];
    let fromId: string | undefined;
    for (let page = 0; page < TX_MAX_PAGES; page += 1) {
      const query = new URLSearchParams({
        connection_id: connectionId,
        per_page: String(TX_PAGE_SIZE),
      });
      if (fromId) query.set('from_id', fromId);
      const body = await this.request<{
        data: SaltEdgeTransaction[];
        meta?: { next_id?: string | number | null };
      }>('GET', `/transactions?${query.toString()}`);
      const batch = Array.isArray(body.data) ? body.data : [];
      rows.push(...batch);
      const next = body.meta?.next_id;
      if (!next || batch.length === 0) break;
      fromId = String(next);
    }
    return rows;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    payload?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'App-id': this.appId,
      Secret: this.secret,
    };
    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(this.timeoutMs),
    };
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(payload ?? {});
    }
    const response = await fetch(`${SALT_EDGE_API}${path}`, init);
    if (!response.ok) {
      throw new Error(`saltedge_${response.status}`);
    }
    return (await response.json()) as T;
  }
}

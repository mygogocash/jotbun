import {
  SaltEdgeClient,
  importableSaltEdgeTransaction,
  saltEdgeConfigured,
} from './salt-edge.client';

describe('saltEdgeConfigured', () => {
  const previousId = process.env.SALT_EDGE_APP_ID;
  const previousSecret = process.env.SALT_EDGE_SECRET;

  afterEach(() => {
    if (previousId === undefined) delete process.env.SALT_EDGE_APP_ID;
    else process.env.SALT_EDGE_APP_ID = previousId;
    if (previousSecret === undefined) delete process.env.SALT_EDGE_SECRET;
    else process.env.SALT_EDGE_SECRET = previousSecret;
  });

  it('is false when keys are missing', () => {
    delete process.env.SALT_EDGE_APP_ID;
    delete process.env.SALT_EDGE_SECRET;
    expect(saltEdgeConfigured()).toBe(false);
  });

  it('is true only when both App-id and Secret are set', () => {
    process.env.SALT_EDGE_APP_ID = 'app';
    process.env.SALT_EDGE_SECRET = 'secret';
    expect(saltEdgeConfigured()).toBe(true);
  });

  it('does not send a body on GET connection', async () => {
    process.env.SALT_EDGE_APP_ID = 'app';
    process.env.SALT_EDGE_SECRET = 'secret';
    const previousFetch = globalThis.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { id: 'c1', customer_id: 'u1', status: 'active' },
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const client = new SaltEdgeClient();
      await expect(client.getConnection('c1')).resolves.toMatchObject({
        id: 'c1',
        customer_id: 'u1',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('GET');
      expect(init.body).toBeUndefined();
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  /*
   * Salt Edge sits behind a member-triggered webhook and a paging import loop.
   * A request with no deadline holds the handler open for as long as the far
   * side stays silent, so every call carries an abort signal.
   */
  it('gives every request an abort signal so a silent Salt Edge cannot hang it', async () => {
    process.env.SALT_EDGE_APP_ID = 'app';
    process.env.SALT_EDGE_SECRET = 'secret';
    const previousFetch = globalThis.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { id: 'c1', customer_id: 'u1', status: 'active' },
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const client = new SaltEdgeClient();
      await client.getConnection('c1');
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(init.signal?.aborted).toBe(false);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it('aborts a Salt Edge request that never answers', async () => {
    process.env.SALT_EDGE_APP_ID = 'app';
    process.env.SALT_EDGE_SECRET = 'secret';
    const previousFetch = globalThis.fetch;
    // Stands in for a far side that accepts the connection and then goes quiet:
    // resolves only if the caller's own signal fires.
    const fetchMock = jest.fn(
      (_url: unknown, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      // createCustomer propagates; getConnection deliberately swallows into null.
      const client = new SaltEdgeClient(undefined, undefined, 25);
      await expect(client.createCustomer('member-1')).rejects.toThrow();
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it('pages transactions until next_id is empty', async () => {
    process.env.SALT_EDGE_APP_ID = 'app';
    process.env.SALT_EDGE_SECRET = 'secret';
    const previousFetch = globalThis.fetch;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: '1', amount: -10 }],
          meta: { next_id: '2' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: '2', amount: -20 }],
          meta: { next_id: null },
        }),
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const client = new SaltEdgeClient();
      await expect(client.listTransactions('c1')).resolves.toEqual([
        { id: '1', amount: -10 },
        { id: '2', amount: -20 },
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(String(fetchMock.mock.calls[1][0])).toContain('from_id=2');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

describe('importableSaltEdgeTransaction', () => {
  it('keeps posted THB rows and drops pending, duplicated, or foreign currency', () => {
    expect(
      importableSaltEdgeTransaction({
        id: '1',
        amount: -99,
        currency_code: 'THB',
        status: 'posted',
      }),
    ).toBe(true);
    expect(
      importableSaltEdgeTransaction({
        id: '2',
        amount: -99,
        currency_code: 'USD',
        status: 'posted',
      }),
    ).toBe(false);
    expect(
      importableSaltEdgeTransaction({
        id: '3',
        amount: -99,
        status: 'pending',
      }),
    ).toBe(false);
    expect(
      importableSaltEdgeTransaction({
        id: '4',
        amount: -99,
        duplicated: true,
      }),
    ).toBe(false);
  });
});

/**
 * PDPA s.33 erasure (#2232 gap 1): account deletion must revoke the Salt Edge
 * customer, not just our local copy of the imported rows.
 */
describe('SaltEdgeClient.deleteCustomer', () => {
  const previousId = process.env.SALT_EDGE_APP_ID;
  const previousSecret = process.env.SALT_EDGE_SECRET;
  let previousFetch: typeof globalThis.fetch;

  beforeEach(() => {
    process.env.SALT_EDGE_APP_ID = 'app';
    process.env.SALT_EDGE_SECRET = 'secret';
    previousFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = previousFetch;
    if (previousId === undefined) delete process.env.SALT_EDGE_APP_ID;
    else process.env.SALT_EDGE_APP_ID = previousId;
    if (previousSecret === undefined) delete process.env.SALT_EDGE_SECRET;
    else process.env.SALT_EDGE_SECRET = previousSecret;
  });

  it('sends DELETE /customers/{id} with no body and reports the deletion', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { customer_id: 'cus-1', deleted: true } }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(new SaltEdgeClient().deleteCustomer('cus-1')).resolves.toBe(
      true,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://www.saltedge.com/api/v6/customers/cus-1');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });

  it('percent-encodes the customer id into the path', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { customer_id: 'a/b', deleted: true } }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await new SaltEdgeClient().deleteCustomer('a/b');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://www.saltedge.com/api/v6/customers/a%2Fb',
    );
  });

  /**
   * CustomerNotFound means the erasure outcome we wanted already holds, so a
   * retry of a partially-completed purge must not be turned into a failure.
   */
  it('treats 404 CustomerNotFound as already erased', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    await expect(new SaltEdgeClient().deleteCustomer('gone')).resolves.toBe(
      false,
    );
  });

  /** 406 CustomerLocked needs a human in the Salt Edge dashboard — surface it. */
  it('throws on 406 CustomerLocked', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 406,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    await expect(new SaltEdgeClient().deleteCustomer('locked')).rejects.toThrow(
      'saltedge_406',
    );
  });

  it('does not call Salt Edge at all when credentials are absent', async () => {
    delete process.env.SALT_EDGE_APP_ID;
    delete process.env.SALT_EDGE_SECRET;
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(new SaltEdgeClient().deleteCustomer('cus-1')).resolves.toBe(
      false,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

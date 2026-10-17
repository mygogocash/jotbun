import { poolConfigFromUrl, poolMaxFromEnv } from './database-config';

describe('database URL configuration', () => {
  it.each(['?sslmode=disable', '?sslmode=no-verify', '?sslmode=require', ''])('always verifies TLS for a remote host (%s)', (query) => {
    const config = poolConfigFromUrl(`postgres://app:secret@ep-test.ap-southeast-1.aws.neon.tech/gogospend${query}`);
    expect(config.ssl).toEqual({ rejectUnauthorized: true, servername: 'ep-test.ap-southeast-1.aws.neon.tech' });
  });

  it.each(['127.0.0.1', 'localhost', '[::1]'])('uses plain TCP only for loopback %s', (host) => {
    expect(poolConfigFromUrl(`postgres://app:secret@${host}:55432/gogospend`).ssl).toBe(false);
  });

  it('decodes credentials and keeps the pool bounded', () => {
    const config = poolConfigFromUrl('postgresql://app%40x:p%2Fw@127.0.0.1:55432/db_name', 3);
    expect(config).toMatchObject({ user: 'app@x', password: 'p/w', host: '127.0.0.1', port: 55432, database: 'db_name', max: 3 });
  });

  it.each([undefined, '', 'not a url', 'mysql://u:secret@host/db', 'postgres://u:secret@host/'])('rejects %p without echoing it', (url) => {
    expect(() => poolConfigFromUrl(url)).toThrow();
    try {
      poolConfigFromUrl(url);
    } catch (error) {
      expect((error as Error).message).not.toContain('secret');
    }
  });

  it.each([['5', 5], ['50', 50], ['0', 10], ['51', 10], ['2.5', 10], [undefined, 10], ['ten', 10]] as const)('bounds DATABASE_POOL_MAX %p', (value, expected) => {
    expect(poolMaxFromEnv(value)).toBe(expected);
  });
});

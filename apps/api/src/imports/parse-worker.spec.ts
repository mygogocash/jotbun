import type { Pool } from 'pg';

import { ConfigurationError } from '../common/configuration-error';
import { featureGatesFromEnv } from '../common/feature-gates';
import { MemoryObjectStore } from '../storage/object-store';
import { idleExitMsFromEnv, runParseWorker } from './parse-worker';

// The parse worker's own rules; its database path (claim, parse, preview)
// runs end to end in apps/edge test/jobs.db.test.ts, against an upload the
// edge accepted.
const unused = {} as Pool;
const deps = (stop?: AbortSignal) => ({ pool: unused, store: new MemoryObjectStore(), gates: featureGatesFromEnv({}), idleExitMs: 1_000, stop });

describe('parse worker', () => {
  it('exits idle after a minute by default, and takes 1-3600 seconds', () => {
    expect(idleExitMsFromEnv(undefined)).toBe(60_000);
    expect(idleExitMsFromEnv('5')).toBe(5_000);
    for (const bad of ['0', '3601', '1.5', 'soon']) expect(() => idleExitMsFromEnv(bad)).toThrow(ConfigurationError);
  });

  it('parses nothing where the parser sandbox does not hold, and says so once', async () => {
    const alert = 'job worker: import parsing disabled (parser sandbox unsupported: net)';
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await runParseWorker(deps(), async () => ({ parse: null, alert }))).toEqual({ ran: 0, reason: 'disabled' });
      expect(errors.mock.calls).toEqual([[alert]]);
    } finally {
      errors.mockRestore();
    }
  });

  it('claims nothing once stopped', async () => {
    const stop = new AbortController();
    stop.abort();
    const runner = { run: jest.fn(), verifySandbox: jest.fn() };
    expect(await runParseWorker(deps(stop.signal), async () => ({ parse: { runner }, alert: null }))).toEqual({ ran: 0, reason: 'stopped' });
    expect(runner.run).not.toHaveBeenCalled();
  });
});

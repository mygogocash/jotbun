import { createHmac } from 'node:crypto';

import { HandlerRegistry } from '../jobs/handler-registry';
import { readRegistrySettings } from './deletion-worker';
import { LookupKey } from './erasure-registry';
import { ERASURE_HANDLED_TABLES, PrivacySteps, defaultPrivacySteps } from './privacy-steps';

describe('the privacy extension point', () => {
  it('takes <domain>.<step> names once each, and keeps registration order', async () => {
    const steps = new PrivacySteps()
      .retention({ name: 'uploads.quarantine', run: async () => 0 })
      .retention({ name: 'imports.preview', run: async () => 0 })
      .erasure({ name: 'attachments.objects', run: async () => undefined });
    expect(steps.retentionSteps().map((step) => step.name)).toEqual(['uploads.quarantine', 'imports.preview']);
    expect(steps.erasureSteps().map((step) => step.name)).toEqual(['attachments.objects']);
    expect(() => steps.retention({ name: 'uploads.quarantine', run: async () => 0 })).toThrow(/already registered/);
    for (const name of ['uploads', 'Uploads.raw', 'uploads.', '.raw', 'uploads.raw.extra', 'uploads raw']) {
      expect(() => new PrivacySteps().retention({ name, run: async () => 0 })).toThrow(RangeError);
    }
  });

  it('lists every retention rule this release has, and the tables the cascade cannot reach', () => {
    expect(defaultPrivacySteps().retentionSteps().map((step) => step.name)).toEqual([
      'records.purge', 'sync.change_log', 'commands.receipt_digests', 'auth.security_records', 'jobs.finished', 'privacy.deletion_requests', 'imports.uploads', 'imports.selections',
    ]);
    expect(defaultPrivacySteps().erasureSteps()).toEqual([]);
    expect(Object.keys(ERASURE_HANDLED_TABLES).sort()).toEqual(['auth_event_receipts', 'jobs', 'object_publications']);
  });
});

describe('security handler registries', () => {
  it('a generic registry refuses the deletion job, and a security registry takes security kinds only', () => {
    expect(() => new HandlerRegistry().register('account_deletion', async () => undefined)).toThrow(/security worker/);
    expect(new HandlerRegistry({ security: true }).register('account_deletion', async () => undefined).kinds()).toEqual(['account_deletion']);
    expect(() => new HandlerRegistry({ security: true }).register('export', async () => undefined)).toThrow(/security job kinds only/);
  });
});

describe('the erasure lookup key (P6a contract)', () => {
  it('derives the same key id and subject lookups as the restore side', () => {
    const bytes = Buffer.alloc(32, 3);
    const key = new LookupKey(bytes);
    expect(key.id).toBe(createHmac('sha256', bytes).update('gogospend-erasure-key-id-v1').digest().subarray(0, 16).toString('hex'));
    expect(key.lookup('https://issuer.test/', 'apple|001')).toBe(
      createHmac('sha256', bytes).update('gogospend-erasure-subject-v1\u0000https://issuer.test/\u0000apple|001', 'utf8').digest('base64url'),
    );
    expect(key.lookup('https://issuer.test/', 'apple|001')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(key)).toBe(JSON.stringify({ lookup_key_id: key.id }));
    expect(() => new LookupKey(Buffer.alloc(31))).toThrow(RangeError);
  });
});

describe('deletion worker settings', () => {
  const key = Buffer.alloc(32, 5).toString('base64url');
  const settings = (text: string) => readRegistrySettings(['node', 'worker', '--registry-fd', '3'], () => text);

  it('reads the registry login and lookup key from an inherited descriptor only', () => {
    const read = settings(JSON.stringify({ database_url: 'postgres://registry@127.0.0.1/db', lookup_key: key }));
    expect(read.databaseUrl).toBe('postgres://registry@127.0.0.1/db');
    expect(read.lookupKey.id).toBe(new LookupKey(Buffer.alloc(32, 5)).id);
  });

  it('refuses a missing descriptor, other keys, a short key or unreadable settings, without echoing them', () => {
    expect(() => readRegistrySettings(['node', 'worker'], () => '{}')).toThrow(/--registry-fd/);
    expect(() => readRegistrySettings(['node', 'worker', '--registry-fd', '1'], () => '{}')).toThrow(/--registry-fd/);
    for (const text of [
      JSON.stringify({ database_url: 'postgres://x', lookup_key: key, extra: 1 }),
      JSON.stringify({ database_url: 'postgres://x', lookup_key: 'short' }),
      'postgres://secret-in-plain-text',
    ]) {
      let message = '';
      try {
        settings(text);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).not.toBe('');
      expect(message).not.toContain('postgres://');
    }
  });
});

import { randomUUID } from 'node:crypto';

import { ContractValidationError } from '@gogospend/contracts';

import { commandDigest } from './command-digest';
import { commandHeaders } from './command-headers';
import { CommandRegistry } from './command-registry';

const ACCOUNT = '0b8a4d1e-6f0a-4c51-9a8e-2f5f6d1f9c11';
const COMMAND = '5f2c9d64-3b1e-4f7a-8c2d-9e0a1b2c3d4e';
const input = (payload: unknown, extra: { schemaVersion?: number; expectedVersion?: number; commandId?: string } = {}) => ({
  commandId: extra.commandId ?? COMMAND,
  kind: 'wallet.create',
  schemaVersion: extra.schemaVersion ?? 1,
  payload,
  expectedVersion: extra.expectedVersion,
});

describe('command digest', () => {
  it('ignores key order but not values, schema version or expected version', () => {
    const base = commandDigest(ACCOUNT, input({ a: '1', b: 'x' }));
    expect(commandDigest(ACCOUNT, input({ b: 'x', a: '1' }))).toEqual(base);
    expect(commandDigest(ACCOUNT, input({ a: '2', b: 'x' }))).not.toEqual(base);
    expect(commandDigest(ACCOUNT, input({ a: '1', b: 'x' }, { schemaVersion: 2 }))).not.toEqual(base);
    expect(commandDigest(ACCOUNT, input({ a: '1', b: 'x' }, { expectedVersion: 3 }))).not.toEqual(base);
  });

  it('is salted by account and command id', () => {
    const base = commandDigest(ACCOUNT, input({ a: '1' }));
    expect(commandDigest(randomUUID(), input({ a: '1' }))).not.toEqual(base);
    expect(commandDigest(ACCOUNT, input({ a: '1' }, { commandId: randomUUID() }))).not.toEqual(base);
  });

  it('has no digest for a missing schema version and refuses non-JSON payloads', () => {
    expect(commandDigest(ACCOUNT, input({ a: '1' }, { schemaVersion: 0 }))).toBeNull();
    expect(() => commandDigest(ACCOUNT, input({ amount: 1.5 }))).toThrow(ContractValidationError);
  });
});

describe('command headers', () => {
  const key = randomUUID();

  it('reads the key, schema and If-Match', () => {
    expect(commandHeaders({ 'idempotency-key': key, 'x-gogospend-command-schema': '3' }, 'forbidden')).toEqual({ commandId: key, schemaVersion: 3 });
    expect(commandHeaders({ 'idempotency-key': key, 'x-gogospend-command-schema': '1', 'if-match': '"7"' }, 'required')).toEqual({ commandId: key, schemaVersion: 1, expectedVersion: 7 });
  });

  it.each([[undefined], ['0'], ['01'], ['1.0'], ['abc'], ['100000']])('treats schema %p as unsupported (0)', (schema) => {
    expect(commandHeaders({ 'idempotency-key': key, 'x-gogospend-command-schema': schema }, 'forbidden').schemaVersion).toBe(0);
  });

  it.each([[undefined], ['not-a-uuid'], [key.toUpperCase()]])('refuses Idempotency-Key %p', (value) => {
    expect(() => commandHeaders({ 'idempotency-key': value }, 'forbidden')).toThrow(ContractValidationError);
  });

  it.each([[undefined], ['7'], ['W/"7"'], ['"0"'], ['"x"']])('refuses If-Match %p where it is required', (value) => {
    expect(() => commandHeaders({ 'idempotency-key': key, 'if-match': value }, 'required')).toThrow(ContractValidationError);
  });

  it('refuses If-Match where it is not used', () => {
    expect(() => commandHeaders({ 'idempotency-key': key, 'if-match': '"1"' }, 'forbidden')).toThrow(ContractValidationError);
  });
});

describe('command registry', () => {
  it('needs a defined entity, valid kinds and schema versions, and no duplicates', () => {
    const registry = new CommandRegistry();
    expect(() => registry.defineCommand({ kind: 'wallet.create', entity: 'wallet', outcome: 'created', schemaVersions: [1], policy: 'current' })).toThrow();
    registry.defineEntity({ entity: 'wallet', validate: () => true });
    expect(() => registry.defineEntity({ entity: 'wallet', validate: () => true })).toThrow();
    expect(() => registry.defineCommand({ kind: 'Wallet Create', entity: 'wallet', outcome: 'created', schemaVersions: [1], policy: 'current' })).toThrow();
    expect(() => registry.defineCommand({ kind: 'wallet.create', entity: 'wallet', outcome: 'created', schemaVersions: [], policy: 'current' })).toThrow();
    registry.defineCommand({ kind: 'wallet.create', entity: 'wallet', outcome: 'created', schemaVersions: [1], policy: 'current' });
    expect(registry.command('wallet.create').schemaVersions).toEqual([1]);
    expect(() => registry.command('wallet.delete')).toThrow();
  });
});

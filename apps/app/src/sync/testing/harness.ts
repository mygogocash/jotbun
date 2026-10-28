// A sync test bench: a real S2 diary (node:sqlite), the fake server with the
// synced wallets and category, a controllable clock and an engine. Test use only.
import { randomUUID } from 'node:crypto';

import { AccountDatabase } from '../../storage/accountDatabase.ts';
import type { DiaryStore } from '../../storage/diaryRepository.ts';
import { createMemoryKeyStore } from '../../storage/testing/memoryKeys.ts';
import { createTestDiaryFiles } from '../../storage/testing/nodeSqlite.ts';
import type { TestDiaryFiles } from '../../storage/testing/nodeSqlite.ts';
import { ACCOUNT_A, SAVINGS, category, change, draft, outbox, wallet } from '../../storage/testing/diaryFixtures.ts';

export const SALARY = '2c000000-0000-4000-8000-000000000002';
import type { OutboxCommand, PendingEntry } from '../../storage/types.ts';
import { createSyncEngine } from '../syncEngine.ts';
import type { SyncEngine } from '../syncEngine.ts';
import type { SyncRemote } from '../types.ts';
import { createFakeServer } from './fakeServer.ts';
import type { FakeServer } from './fakeServer.ts';

export const START = Date.parse('2026-03-02T05:00:00.000Z');

export type Bench = {
  files: TestDiaryFiles;
  database: AccountDatabase;
  store: DiaryStore;
  server: FakeServer;
  clock: { now: number };
  session: { epoch: number };
  refreshes: { count: number; result: boolean };
  engine: SyncEngine;
  /** An engine over `store` and `remote` (the fake server's by default). */
  newEngine(store?: DiaryStore, remote?: SyncRemote): SyncEngine;
  save(overrides?: Partial<PendingEntry>, command?: Partial<OutboxCommand>): Promise<OutboxCommand>;
  flush(trigger?: Parameters<SyncEngine['flush']>[1]): ReturnType<SyncEngine['flush']>;
  dispose(): void;
};

export async function bench(options: { writesPerMinute?: number } = {}): Promise<Bench> {
  const files = createTestDiaryFiles();
  const session = { epoch: 1 };
  const clock = { now: START };
  const database = new AccountDatabase({ files, keys: createMemoryKeyStore(), epoch: () => session.epoch });
  const store = await database.open(ACCOUNT_A);
  const server = createFakeServer({ now: () => clock.now, writesPerMinute: options.writesPerMinute });
  server.commitElsewhere([
    change('wallet', wallet()),
    change('wallet', wallet({ id: SAVINGS, name: 'Savings', opening_minor: '0' })),
    change('category', category()),
    change('category', category({ id: SALARY, type: 'income', builtin_key: 'salary' })),
  ]);
  await store.applyChangeGroups(server.groups.slice(0, 1), 'cursor-1', null);
  const refreshes = { count: 0, result: true };
  const newEngine = (target: DiaryStore = store, remote: SyncRemote = server.remote) =>
    createSyncEngine({
      store: target,
      remote,
      now: () => clock.now,
      random: () => 0.5,
      refreshSession: async () => {
        refreshes.count += 1;
        return refreshes.result;
      },
      reconcile: { newKey: () => randomUUID(), sleep: async () => undefined, maxSnapshotPolls: 3 },
    });
  const engine = newEngine();
  return {
    files,
    database,
    store,
    server,
    clock,
    session,
    refreshes,
    engine,
    newEngine,
    async save(overrides = {}, command = {}) {
      const entry = draft(overrides);
      const queued = outbox(entry, ACCOUNT_A, { createdAt: new Date(clock.now).toISOString(), ...command });
      await store.savePending(entry, queued);
      return queued;
    },
    flush: (trigger = 'timer') => engine.flush({ accountId: ACCOUNT_A, epoch: session.epoch }, trigger),
    dispose: () => files.dispose(),
  };
}

import { Module } from '@nestjs/common';

import { CommandDigester } from '../commands/command-digest';
import { CommandsModule } from '../commands/commands.module';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { SnapshotGrants } from './snapshot-grants';
import { SnapshotRepository } from './snapshot.repository';
import { SyncController } from './sync.controller';
import { SyncQuery } from './sync-query';

/** S1: change deltas and snapshot requests, status and chunk downloads. */
@Module({
  imports: [DatabaseModule, CommandsModule, StorageModule],
  controllers: [SyncController],
  providers: [
    SyncQuery,
    SnapshotRepository,
    { provide: SnapshotGrants, useFactory: (digester: CommandDigester) => new SnapshotGrants(digester.deriveKeys('gogospend.snapshot-grant.v1')), inject: [CommandDigester] },
  ],
})
export class SyncModule {}

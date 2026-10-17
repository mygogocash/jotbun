import { Module } from '@nestjs/common';

import { CommandDigester } from '../commands/command-digest';
import { CommandsModule } from '../commands/commands.module';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { SnapshotGrants } from '../sync/snapshot-grants';
import { EXPORT_GRANTS, ExportService } from './export.service';
import { ExportsController } from './exports.controller';

/**
 * P4: export requests (a command), status, five-minute download grants and
 * downloads. The worker side is ExportHandler (registered in jobs/handlers.ts).
 * Grants reuse S1's opaque grant construction under keys derived for exports
 * only, so an export grant never verifies as a snapshot grant or the reverse.
 */
@Module({
  imports: [DatabaseModule, CommandsModule, StorageModule],
  controllers: [ExportsController],
  providers: [
    ExportService,
    { provide: EXPORT_GRANTS, useFactory: (digester: CommandDigester) => new SnapshotGrants(digester.deriveKeys('gogospend.export-grant.v1')), inject: [CommandDigester] },
  ],
})
export class ExportsModule {}

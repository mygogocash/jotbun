import { Module } from '@nestjs/common';
import { ATTACHMENT_GRANT_MINUTES } from '@gogospend/contracts';

import { CommandDigester } from '../commands/command-digest';
import { CommandsModule } from '../commands/commands.module';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { SnapshotGrants } from '../sync/snapshot-grants';
import { TransactionsModule } from '../transactions/transactions.module';
import { ATTACHMENT_LIMITS, DEFAULT_ATTACHMENT_LIMITS } from './attachment-limits';
import { ATTACHMENT_GRANTS, AttachmentService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';

/**
 * P2c: retained receipt attachments - retain/replace/remove commands on a
 * record, five-minute download grants and downloads. Grants reuse S1's opaque
 * grant construction under keys derived for receipts only, so a receipt grant
 * never verifies as a snapshot or export grant, or the reverse. Exports
 * AttachmentService for P3, which retains receipts while confirming rows.
 */
@Module({
  imports: [DatabaseModule, CommandsModule, StorageModule, TransactionsModule],
  controllers: [AttachmentsController],
  providers: [
    AttachmentService,
    { provide: ATTACHMENT_LIMITS, useFactory: () => ({ ...DEFAULT_ATTACHMENT_LIMITS }) },
    { provide: ATTACHMENT_GRANTS, useFactory: (digester: CommandDigester) => new SnapshotGrants(digester.deriveKeys('gogospend.attachment-grant.v1'), { minutes: ATTACHMENT_GRANT_MINUTES }), inject: [CommandDigester] },
  ],
  exports: [AttachmentService],
})
export class AttachmentsModule {}

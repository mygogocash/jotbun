import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { DeletionController } from './deletion.controller';
import { DeletionService } from './deletion.service';

/**
 * P5 privacy, API side: the account deletion request and the initiating
 * device's receipt. Erasure itself runs in the deletion worker
 * (deletion-worker.ts, DeletionHandler) and retention in the job worker
 * (RetentionHandler); neither runs in the API process, and the API never
 * holds the erasure registry or maintenance credentials.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [DeletionController],
  providers: [DeletionService],
})
export class PrivacyModule {}

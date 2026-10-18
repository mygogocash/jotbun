import { Module } from '@nestjs/common';

import { AttachmentsModule } from '../attachments/attachments.module';
import { CommandsModule } from '../commands/commands.module';
import { DatabaseModule } from '../database/database.module';
import { PoliciesModule } from '../policies/policies.module';
import type { ObjectStore } from '../storage/object-store';
import { OBJECT_STORE, StorageModule } from '../storage/storage.module';
import { ConfirmationController } from './confirmation.controller';
import { ConfirmationService } from './confirmation.service';
import { ImportRepository } from './import.repository';
import { ImportsController } from './imports.controller';
import { PreviewQuery } from './preview-query';
import { IMPORT_INTAKE_CONFIG, UploadIntake, importIntakeConfigFromEnv } from './upload-intake';

/**
 * P2a: bounded private upload quarantine (uploads stay disabled unless
 * IMPORT_UPLOADS_ENABLED is set). P2b: the owner's reviewable preview; the
 * parsing itself runs in the job worker, never in the API. P3: review
 * corrections, the frozen selection and confirmation batches (M1 commands),
 * which keep an image import's receipt through P2c's AttachmentService.
 */
@Module({
  imports: [DatabaseModule, PoliciesModule, StorageModule, CommandsModule, AttachmentsModule],
  controllers: [ImportsController, ConfirmationController],
  providers: [
    ImportRepository,
    PreviewQuery,
    ConfirmationService,
    { provide: IMPORT_INTAKE_CONFIG, useFactory: () => importIntakeConfigFromEnv(process.env) },
    { provide: UploadIntake, inject: [ImportRepository, OBJECT_STORE], useFactory: (imports: ImportRepository, store: ObjectStore) => new UploadIntake(imports, store) },
  ],
})
export class ImportsModule {}

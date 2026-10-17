import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { PoliciesModule } from '../policies/policies.module';
import { ChangeWriter } from '../sync/change-writer';
import { CommandDigester, commandDigesterFromEnv } from './command-digest';
import { CommandExecutor } from './command-executor';
import { CommandReceiptRepository } from './command-receipts.repository';
import { CommandRegistry } from './command-registry';
import { CommandStatusController } from './command-status.controller';

/** The common command protocol; domain modules import it and register their kinds. */
@Module({
  imports: [DatabaseModule, PoliciesModule],
  controllers: [CommandStatusController],
  providers: [CommandRegistry, ChangeWriter, CommandReceiptRepository, CommandExecutor, { provide: CommandDigester, useFactory: () => commandDigesterFromEnv(process.env) }],
  exports: [CommandRegistry, CommandExecutor, CommandDigester],
})
export class CommandsModule {}

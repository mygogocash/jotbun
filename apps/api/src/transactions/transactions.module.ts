import { Module } from '@nestjs/common';

import { CommandsModule } from '../commands/commands.module';
import { DatabaseModule } from '../database/database.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [DatabaseModule, CommandsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}

import { Module } from '@nestjs/common';

import { CommandsModule } from '../commands/commands.module';
import { DatabaseModule } from '../database/database.module';
import { HistoryController } from '../history/history.controller';
import { SummaryController } from '../summary/summary.controller';
import { BudgetsController } from './budgets.controller';
import { BudgetService } from './budgets.service';

/** Budgets plus the read models built on records and budgets (history, month summary). */
@Module({
  imports: [DatabaseModule, CommandsModule],
  controllers: [BudgetsController, HistoryController, SummaryController],
  providers: [BudgetService],
})
export class BudgetsModule {}

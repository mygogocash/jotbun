import { Controller, Get, Query } from '@nestjs/common';
import { parseMonth } from '@gogospend/contracts';
import type { MonthSummary, SessionContext } from '@gogospend/contracts';

import { Access } from '../auth/auth-route.decorator';
import { CurrentSession } from '../auth/request-context';
import { DatabaseService } from '../database/database.service';
import { SummaryQuery } from './summary-query';

@Controller('v1')
export class SummaryController {
  constructor(private readonly db: DatabaseService) {}

  /** One Bangkok calendar month: totals, category totals and budget usage at one revision. */
  @Get('summary')
  @Access('bound_session')
  month(@CurrentSession() session: SessionContext, @Query('month') month: unknown): Promise<MonthSummary> {
    const parsed = parseMonth(month);
    return this.db.withOwnerTransaction(session, (tx) => SummaryQuery.month(tx, parsed), { snapshot: true });
  }
}

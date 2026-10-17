import { Controller, Get, Query } from '@nestjs/common';
import type { HistoryPage, SessionContext } from '@gogospend/contracts';

import { Access } from '../auth/auth-route.decorator';
import { CurrentSession } from '../auth/request-context';
import { DatabaseService } from '../database/database.service';
import { HistoryQuery, parseHistoryRequest } from './history-query';

@Controller('v1')
export class HistoryController {
  constructor(private readonly db: DatabaseService) {}

  /** Filtered, keyset-paginated records with totals over the whole filter, read from one snapshot. */
  @Get('history')
  @Access('bound_session')
  list(@CurrentSession() session: SessionContext, @Query() query: Record<string, unknown>): Promise<HistoryPage> {
    const request = parseHistoryRequest(query);
    return this.db.withOwnerTransaction(session, (tx) => HistoryQuery.list(tx, request.filter, request.cursor, request.limit), { snapshot: true });
  }
}

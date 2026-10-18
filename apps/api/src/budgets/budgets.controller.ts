import { Body, Controller, Get, Headers, Param, Put } from '@nestjs/common';
import type { BudgetDto, CommandAck, SessionContext } from '@gogospend/contracts';

import { Access } from '../auth/auth-route.decorator';
import { CurrentSession } from '../auth/request-context';
import { commandHeaders } from '../commands/command-headers';
import { BudgetService } from './budgets.service';

type HeaderBag = Record<string, string | string[] | undefined>;

/** A month's budget: read, or replace as a whole (If-Match absent to create, current version to replace). */
@Controller('v1')
export class BudgetsController {
  constructor(private readonly budgets: BudgetService) {}

  @Get('budgets/:month')
  @Access('bound_session')
  get(@CurrentSession() session: SessionContext, @Param('month') month: string): Promise<BudgetDto> {
    return this.budgets.get(session, month);
  }

  @Put('budgets/:month')
  @Access('current_policy')
  set(@CurrentSession() session: SessionContext, @Headers() headers: HeaderBag, @Param('month') month: string, @Body() body: unknown): Promise<CommandAck> {
    return this.budgets.set(session, commandHeaders(headers, 'optional'), month, body);
  }
}

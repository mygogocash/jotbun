import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post } from '@nestjs/common';
import type { CommandAck, SessionContext, TransactionDto } from '@gogospend/contracts';

import { Access } from '../auth/auth-route.decorator';
import { CurrentSession } from '../auth/request-context';
import { commandHeaders } from '../commands/command-headers';
import { TransactionsService } from './transactions.service';

type HeaderBag = Record<string, string | string[] | undefined>;

/** Expense, income and transfer records. Writes are commands; edits, deletes and restores need If-Match. */
@Controller('v1')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get('transactions/:id')
  @Access('bound_session')
  get(@CurrentSession() session: SessionContext, @Param('id') id: string): Promise<TransactionDto> {
    return this.transactions.get(session, id);
  }

  @Post('transactions')
  @Access('current_policy')
  create(@CurrentSession() session: SessionContext, @Headers() headers: HeaderBag, @Body() body: unknown): Promise<CommandAck> {
    return this.transactions.create(session, commandHeaders(headers, 'forbidden'), body);
  }

  @Patch('transactions/:id')
  @Access('current_policy')
  @HttpCode(200)
  update(@CurrentSession() session: SessionContext, @Headers() headers: HeaderBag, @Param('id') id: string, @Body() body: unknown): Promise<CommandAck> {
    return this.transactions.update(session, commandHeaders(headers, 'required'), id, body);
  }

  @Delete('transactions/:id')
  @Access('current_policy')
  @HttpCode(200)
  remove(@CurrentSession() session: SessionContext, @Headers() headers: HeaderBag, @Param('id') id: string): Promise<CommandAck> {
    return this.transactions.remove(session, commandHeaders(headers, 'required'), id);
  }

  @Post('transactions/:id/restore')
  @Access('current_policy')
  @HttpCode(200)
  restore(@CurrentSession() session: SessionContext, @Headers() headers: HeaderBag, @Param('id') id: string, @Body() body: unknown): Promise<CommandAck> {
    return this.transactions.restore(session, commandHeaders(headers, 'required'), id, body);
  }
}

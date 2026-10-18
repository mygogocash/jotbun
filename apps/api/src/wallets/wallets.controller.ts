import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post } from '@nestjs/common';
import type { CommandAck, SessionContext, WalletDto } from '@gogospend/contracts';

import { Access } from '../auth/auth-route.decorator';
import { Gated } from '../common/feature-gates';
import { CurrentSession } from '../auth/request-context';
import { commandHeaders } from '../commands/command-headers';
import { WalletsService } from './wallets.service';

type HeaderBag = Record<string, string | string[] | undefined>;

/** Owned wallets. Writes are commands (Idempotency-Key, X-GoGoSpend-Command-Schema, If-Match on existing wallets). */
@Controller('v1')
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Get('wallets')
  @Access('bound_session')
  list(@CurrentSession() session: SessionContext): Promise<WalletDto[]> {
    return this.wallets.list(session);
  }

  @Get('wallets/:id')
  @Access('bound_session')
  get(@CurrentSession() session: SessionContext, @Param('id') id: string): Promise<WalletDto> {
    return this.wallets.get(session, id);
  }

  @Post('wallets')
  @Access('current_policy')
  @Gated('writes')
  create(@CurrentSession() session: SessionContext, @Headers() headers: HeaderBag, @Body() body: unknown): Promise<CommandAck> {
    return this.wallets.create(session, commandHeaders(headers, 'forbidden'), body);
  }

  @Patch('wallets/:id')
  @Access('current_policy')
  @Gated('writes')
  @HttpCode(200)
  update(@CurrentSession() session: SessionContext, @Headers() headers: HeaderBag, @Param('id') id: string, @Body() body: unknown): Promise<CommandAck> {
    return this.wallets.update(session, commandHeaders(headers, 'required'), id, body);
  }

  @Post('wallets/:id/archive')
  @Access('current_policy')
  @Gated('writes')
  @HttpCode(200)
  archive(@CurrentSession() session: SessionContext, @Headers() headers: HeaderBag, @Param('id') id: string, @Body() body: unknown): Promise<CommandAck> {
    return this.wallets.archive(session, commandHeaders(headers, 'required'), id, body);
  }

  @Post('wallets/:id/unarchive')
  @Access('current_policy')
  @Gated('writes')
  @HttpCode(200)
  unarchive(@CurrentSession() session: SessionContext, @Headers() headers: HeaderBag, @Param('id') id: string, @Body() body: unknown): Promise<CommandAck> {
    return this.wallets.unarchive(session, commandHeaders(headers, 'required'), id, body);
  }
}

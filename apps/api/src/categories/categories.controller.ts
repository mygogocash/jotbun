import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post } from '@nestjs/common';
import type { CategoryDto, CommandAck, SessionContext } from '@gogospend/contracts';

import { Access } from '../auth/auth-route.decorator';
import { CurrentSession } from '../auth/request-context';
import { commandHeaders } from '../commands/command-headers';
import { CategoriesService } from './categories.service';

type HeaderBag = Record<string, string | string[] | undefined>;

/** Built-in and custom categories. Writes are commands, like wallets. */
@Controller('v1')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get('categories')
  @Access('bound_session')
  list(@CurrentSession() session: SessionContext): Promise<CategoryDto[]> {
    return this.categories.list(session);
  }

  /** Ensures every built-in category exists (idempotent), then returns all categories. */
  @Post('categories/builtins')
  @Access('current_policy')
  @HttpCode(200)
  seedBuiltins(@CurrentSession() session: SessionContext): Promise<CategoryDto[]> {
    return this.categories.seedBuiltins(session);
  }

  @Post('categories')
  @Access('current_policy')
  create(@CurrentSession() session: SessionContext, @Headers() headers: HeaderBag, @Body() body: unknown): Promise<CommandAck> {
    return this.categories.create(session, commandHeaders(headers, 'forbidden'), body);
  }

  @Patch('categories/:id')
  @Access('current_policy')
  @HttpCode(200)
  update(@CurrentSession() session: SessionContext, @Headers() headers: HeaderBag, @Param('id') id: string, @Body() body: unknown): Promise<CommandAck> {
    return this.categories.update(session, commandHeaders(headers, 'required'), id, body);
  }

  @Post('categories/:id/archive')
  @Access('current_policy')
  @HttpCode(200)
  archive(@CurrentSession() session: SessionContext, @Headers() headers: HeaderBag, @Param('id') id: string, @Body() body: unknown): Promise<CommandAck> {
    return this.categories.archive(session, commandHeaders(headers, 'required'), id, body);
  }

  @Post('categories/:id/unarchive')
  @Access('current_policy')
  @HttpCode(200)
  unarchive(@CurrentSession() session: SessionContext, @Headers() headers: HeaderBag, @Param('id') id: string, @Body() body: unknown): Promise<CommandAck> {
    return this.categories.unarchive(session, commandHeaders(headers, 'required'), id, body);
  }
}

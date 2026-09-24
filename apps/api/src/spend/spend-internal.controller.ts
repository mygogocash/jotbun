import {
  Controller,
  Delete,
  Get,
  Param,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import type { Request } from 'express';

import { ProductAccessService } from '../product-access/product-access.service';
import { SpendImportService } from './spend-import.service';
import { SpendService } from './spend.service';

/**
 * Machine-to-machine endpoints for the monorepo (account deletion, PDPA
 * export). Guarded by a shared `INTERNAL_API_KEY` — never exposed to member
 * clients. Replaces the in-process `UserModule → SpendModule` import, which
 * cannot cross the repo boundary.
 */
@Controller('internal/spend')
export class SpendInternalController {
  constructor(
    private readonly spend: SpendService,
    private readonly imports: SpendImportService,
    private readonly productAccess: ProductAccessService,
  ) {}

  @Delete('users/:id')
  async purgeUser(@Param('id') id: string, @Req() req: Request) {
    this.requireInternalKey(req);
    const userId = new Types.ObjectId(id);
    await this.imports.purgeForUser(userId);
    await this.productAccess.purgeForUser(userId);
    return { purged: id };
  }

  @Get('users/:id/export')
  async exportUser(@Param('id') id: string, @Req() req: Request) {
    this.requireInternalKey(req);
    return this.spend.exportForUser(id);
  }

  private requireInternalKey(req: Request): void {
    const expected = process.env.INTERNAL_API_KEY?.trim();
    const [type, token] = req.headers.authorization?.split(' ') ?? [];
    if (!expected || type !== 'Bearer' || token !== expected) {
      throw new UnauthorizedException('Invalid internal credentials');
    }
  }
}

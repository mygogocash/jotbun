import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ContractValidationError, MAX_COMMAND_STATUS_IDS, assertKnownFields, isUuid } from '@gogospend/contracts';
import type { CommandStatusResponse, SessionContext } from '@gogospend/contracts';

import { Access } from '../auth/auth-route.decorator';
import { CurrentSession } from '../auth/request-context';
import { DatabaseService } from '../database/database.service';
import { CommandReceiptRepository } from './command-receipts.repository';

@Controller('v1')
export class CommandStatusController {
  constructor(
    private readonly db: DatabaseService,
    private readonly receipts: CommandReceiptRepository,
  ) {}

  /**
   * What happened to commands whose response was lost: `unknown` (never
   * committed for this account; another account's ids look the same) or the
   * original acknowledgement with the entity's current state.
   */
  @Post('commands/status')
  @Access('bound_session')
  @HttpCode(200)
  async status(@CurrentSession() session: SessionContext, @Body() body: unknown): Promise<CommandStatusResponse> {
    const input = assertKnownFields(body, ['command_ids']);
    const ids = input.command_ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_COMMAND_STATUS_IDS || !ids.every(isUuid)) {
      throw new ContractValidationError('VALIDATION_FAILED', `command_ids must be 1-${MAX_COMMAND_STATUS_IDS} UUIDs.`, 'command_ids');
    }
    const statuses = await this.db.withOwnerTransaction(session, (tx) => this.receipts.lookup(tx, ids));
    return { statuses };
  }
}

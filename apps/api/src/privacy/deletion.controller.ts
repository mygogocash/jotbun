import { Body, Controller, Header, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ContractValidationError, V1_HEADERS, assertKnownFields, isUuid } from '@gogospend/contracts';
import type { ApiIdentity, DeletionAccepted, DeletionReceipt, SessionContext } from '@gogospend/contracts';
import type { Request } from 'express';

import { bindingFrom } from '../auth/application-session.guard';
import { Access } from '../auth/auth-route.decorator';
import { CurrentIdentity, CurrentSession } from '../auth/request-context';
import { ProblemException } from '../common/api-problem.filter';
import { DeletionService } from './deletion.service';

/**
 * P5 account deletion. The request is a privacy operation: a bound session
 * and a fresh `deletion` proof (Idempotency-Key = its command id), no newly
 * required policy acceptance. The receipt is token-only - the initiating
 * device's binding is dead once its request was accepted - and answers only
 * to that device's old binding, principal and client with the same command
 * id; anything else is the same 404.
 */
@Controller('v1')
export class DeletionController {
  constructor(private readonly deletion: DeletionService) {}

  @Post('me/deletion')
  @Access('recent_proof')
  @HttpCode(202)
  request(
    @CurrentSession() session: SessionContext,
    @Headers(V1_HEADERS.idempotencyKey) commandId: string | undefined,
    @Body() body: unknown,
  ): Promise<DeletionAccepted> {
    const input = assertKnownFields(body, ['proof_id']);
    if (!isUuid(commandId)) throw new ContractValidationError('VALIDATION_FAILED', 'Idempotency-Key must be a UUID.', 'idempotency_key');
    if (!isUuid(input.proof_id)) throw new ContractValidationError('VALIDATION_FAILED', 'proof_id must be a UUID.', 'proof_id');
    return this.deletion.request(session, input.proof_id, commandId);
  }

  @Post('auth/deletion-receipt')
  @Access('token_only')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  async receipt(@CurrentIdentity() identity: ApiIdentity, @Req() req: Request, @Body() body: unknown): Promise<DeletionReceipt> {
    const input = assertKnownFields(body, ['command_id']);
    if (!isUuid(input.command_id)) throw new ContractValidationError('VALIDATION_FAILED', 'command_id must be a UUID.', 'command_id');
    const binding = bindingFrom(req);
    const receipt = binding ? await this.deletion.receipt(identity, binding, input.command_id) : null;
    if (!receipt) throw new ProblemException(404, 'NOT_FOUND');
    return receipt;
  }
}

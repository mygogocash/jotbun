import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post } from '@nestjs/common';
import type { CommandAck, ConfirmImportBatchResult, ImportSelectionProgress, PatchImportRowsResult, SessionContext } from '@gogospend/contracts';

import { Access } from '../auth/auth-route.decorator';
import { CurrentSession } from '../auth/request-context';
import { commandHeaders } from '../commands/command-headers';
import { routeId } from '../commands/versioned-entity';
import { ProblemException } from '../common/api-problem.filter';
import { Gated } from '../common/feature-gates';
import { CONFIRM_KIND, FREEZE_KIND, PATCH_KIND, ConfirmationService, parseConfirmBody, parseFreezeBody, parsePatchBody } from './confirmation.service';

type HeaderBag = Record<string, string | string[] | undefined>;

/**
 * P3: review corrections, the full-selection freeze and confirmation
 * batches. Each write is an M1 command (Idempotency-Key and command schema);
 * corrections also name the review revision they were made against as
 * `If-Match: "<review_revision>"`. Corrections and the freeze pause with the
 * `imports` gate; confirmation, which writes records, also with `writes`.
 * Another account's import, selection or rows are the same 404 as unknown ones.
 */
@Controller('v1/imports')
export class ConfirmationController {
  constructor(private readonly confirmation: ConfirmationService) {}

  @Patch(':id/rows')
  @Access('current_policy')
  @Gated('imports')
  @HttpCode(200)
  patchRows(@CurrentSession() session: SessionContext, @Headers() headers: HeaderBag, @Param('id') id: string, @Body() body: unknown): Promise<PatchImportRowsResult> {
    const jobId = routeId(id);
    const command = commandHeaders(headers, 'required');
    return this.confirmation.patchRows(session, { ...command, kind: PATCH_KIND, payload: { job_id: jobId, rows: parsePatchBody(body) } });
  }

  @Post(':id/selections')
  @Access('current_policy')
  @Gated('imports')
  @HttpCode(201)
  freeze(@CurrentSession() session: SessionContext, @Headers() headers: HeaderBag, @Param('id') id: string, @Body() body: unknown): Promise<CommandAck> {
    const jobId = routeId(id);
    const command = commandHeaders(headers, 'forbidden');
    return this.confirmation.freezeSelection(session, { ...command, kind: FREEZE_KIND, payload: { job_id: jobId, ...parseFreezeBody(body) } });
  }

  @Post(':id/confirmations')
  @Access('current_policy')
  @Gated('imports', 'writes')
  @HttpCode(200)
  confirm(@CurrentSession() session: SessionContext, @Headers() headers: HeaderBag, @Param('id') id: string, @Body() body: unknown): Promise<ConfirmImportBatchResult> {
    const jobId = routeId(id);
    const command = commandHeaders(headers, 'forbidden');
    return this.confirmation.confirm(session, { ...command, kind: CONFIRM_KIND, payload: parseConfirmBody(body) }, { jobId });
  }

  @Get(':id/selections/:selectionId')
  @Access('bound_session')
  async progress(@CurrentSession() session: SessionContext, @Param('id') id: string, @Param('selectionId') selectionId: string): Promise<ImportSelectionProgress> {
    const found = await this.confirmation.progress(session, routeId(id), routeId(selectionId));
    if (!found) throw new ProblemException(404, 'NOT_FOUND');
    return found;
  }
}

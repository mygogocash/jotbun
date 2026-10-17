import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Res, StreamableFile } from '@nestjs/common';
import { ContractValidationError, assertKnownFields, isUuid } from '@gogospend/contracts';
import type { CommandAck, ExportDto, ExportGrant, SessionContext } from '@gogospend/contracts';
import type { Response } from 'express';
import { createHash } from 'node:crypto';

import { Access } from '../auth/auth-route.decorator';
import { CurrentSession } from '../auth/request-context';
import { commandHeaders } from '../commands/command-headers';
import { ProblemException } from '../common/api-problem.filter';
import type { ObjectStore } from '../storage/object-store';
import { OBJECT_STORE } from '../storage/storage.module';
import { EXPORT_REQUEST_KIND, ExportService, parseExportFilter } from './export.service';

type HeaderBag = Record<string, string | string[] | undefined>;

/**
 * P4 export. The request is a privacy operation: it needs a bound session
 * and a fresh `export` proof, but no newly required policy acceptance. Status,
 * grant and download need the owner's bound session; anything the caller
 * does not own (or that is not ready, or expired) is the same 404.
 */
@Controller('v1')
export class ExportsController {
  constructor(
    private readonly exportsService: ExportService,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore,
  ) {}

  /** Queues one export of the period (202). Idempotency-Key = the export proof's command id. */
  @Post('exports')
  @Access('recent_proof')
  @HttpCode(202)
  request(@CurrentSession() session: SessionContext, @Headers() headers: HeaderBag, @Body() body: unknown): Promise<CommandAck> {
    const command = commandHeaders(headers, 'forbidden');
    const input = assertKnownFields(body, ['proof_id', 'from', 'through']);
    if (!isUuid(input.proof_id)) throw new ContractValidationError('VALIDATION_FAILED', 'proof_id must be a UUID.', 'proof_id');
    const filter = parseExportFilter(input);
    return this.exportsService.request(session, input.proof_id, { commandId: command.commandId, kind: EXPORT_REQUEST_KIND, schemaVersion: command.schemaVersion, payload: filter });
  }

  @Get('exports/:id')
  @Access('bound_session')
  async status(@CurrentSession() session: SessionContext, @Param('id') id: string): Promise<ExportDto> {
    if (!isUuid(id)) throw new ProblemException(404, 'NOT_FOUND');
    const dto = await this.exportsService.status(session, id);
    if (!dto) throw new ProblemException(404, 'NOT_FOUND');
    return dto;
  }

  /** A five-minute opaque download path for the caller's own ready export. */
  @Get('exports/:id/grant')
  @Access('bound_session')
  async grant(@CurrentSession() session: SessionContext, @Param('id') id: string): Promise<ExportGrant> {
    if (!isUuid(id)) throw new ProblemException(404, 'NOT_FOUND');
    const grant = await this.exportsService.grant(session, id);
    if (!grant) throw new ProblemException(404, 'NOT_FOUND');
    return grant;
  }

  /** The CSV for a current grant of the caller's own unexpired export; the body must match its recorded size and digest. */
  @Get('export-files/:grant')
  @Access('bound_session')
  async file(@CurrentSession() session: SessionContext, @Param('grant') grant: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const stored = await this.exportsService.file(session, grant);
    if (!stored) throw new ProblemException(404, 'NOT_FOUND');
    const body = await this.store.get(stored.key);
    if (!body || body.byteLength !== stored.bytes || createHash('sha256').update(body).digest('hex') !== stored.sha256) throw new ProblemException(404, 'NOT_FOUND');
    res.setHeader('Content-Disposition', `attachment; filename="${stored.fileName}"`);
    return new StreamableFile(Buffer.from(body), { type: 'text/csv; charset=utf-8', length: body.byteLength });
  }
}

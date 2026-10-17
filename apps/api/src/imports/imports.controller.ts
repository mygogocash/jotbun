import { Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { ContractValidationError, IMPORT_FILE_NAME_HEADER, isUuid } from '@gogospend/contracts';
import type { ImportJobDto, ImportPreview, SessionContext, UploadAccepted } from '@gogospend/contracts';
import type { Request } from 'express';

import { Access } from '../auth/auth-route.decorator';
import { CurrentSession } from '../auth/request-context';
import { ProblemException } from '../common/api-problem.filter';
import { ImportRepository } from './import.repository';
import { PreviewQuery } from './preview-query';
import { IMPORT_INTAKE_CONFIG, UploadIntake } from './upload-intake';
import type { ImportIntakeConfig } from './upload-intake';

function singleHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' ? value : undefined;
}

/** The percent-encoded file name header, decoded; anything undecodable is an invalid name. */
function fileNameFrom(req: Request): string {
  const raw = singleHeader(req, IMPORT_FILE_NAME_HEADER);
  if (raw === undefined) throw new ContractValidationError('INVALID_FILE_NAME', 'File name header is required.', 'file_name');
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new ContractValidationError('INVALID_FILE_NAME', 'File name is not percent-encoded UTF-8.', 'file_name');
  }
}

function contentLength(req: Request): number | null {
  const raw = singleHeader(req, 'content-length');
  if (raw === undefined || !/^\d{1,16}$/.test(raw)) return null;
  return Number(raw);
}

@Controller('v1/imports')
export class ImportsController {
  constructor(
    private readonly intake: UploadIntake,
    private readonly imports: ImportRepository,
    private readonly previews: PreviewQuery,
    @Inject(IMPORT_INTAKE_CONFIG) private readonly config: ImportIntakeConfig,
  ) {}

  /**
   * Streams the raw body into private quarantine and queues one parse job
   * (202). Disabled (404, body unread) unless IMPORT_UPLOADS_ENABLED is set.
   */
  @Post()
  @Access('current_policy')
  @HttpCode(202)
  async upload(@CurrentSession() session: SessionContext, @Req() req: Request): Promise<UploadAccepted> {
    if (!this.config.uploadsEnabled) throw new ProblemException(404, 'NOT_FOUND');
    // Leaving the iteration early must not destroy the socket: the response
    // still has to reach the client.
    const body = req.iterator({ destroyOnReturn: false }) as AsyncIterator<Uint8Array>;
    try {
      return await this.intake.accept(session, { [Symbol.asyncIterator]: () => body }, {
        idempotencyKey: singleHeader(req, 'idempotency-key'),
        fileName: fileNameFrom(req),
        contentType: singleHeader(req, 'content-type') ?? '',
        declaredBytes: contentLength(req),
      });
    } finally {
      // Whatever was not read is discarded as it arrives, never buffered.
      if (!req.complete) req.resume();
    }
  }

  /** The caller's own accepted import; any other id is 404. */
  @Get(':id')
  @Access('bound_session')
  async status(@CurrentSession() session: SessionContext, @Param('id') id: string): Promise<ImportJobDto> {
    if (!isUuid(id)) throw new ProblemException(404, 'NOT_FOUND');
    const found = await this.imports.find(session, id);
    if (!found) throw new ProblemException(404, 'NOT_FOUND');
    return found;
  }

  /**
   * P2b: the caller's own import as a reviewable preview (candidates,
   * issues, advisory duplicates); any other id is the same 404. Reading it
   * never saves anything.
   */
  @Get(':id/preview')
  @Access('bound_session')
  async preview(@CurrentSession() session: SessionContext, @Param('id') id: string): Promise<ImportPreview> {
    if (!isUuid(id)) throw new ProblemException(404, 'NOT_FOUND');
    const found = await this.previews.find(session, id);
    if (!found) throw new ProblemException(404, 'NOT_FOUND');
    return found;
  }
}

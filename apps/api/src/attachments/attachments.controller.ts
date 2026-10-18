import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Post, Put, Res, StreamableFile } from '@nestjs/common';
import { assertKnownFields, isUuid } from '@gogospend/contracts';
import type { AttachmentGrant, CommandAck, ReceiptRetentionConsent, SessionContext } from '@gogospend/contracts';
import type { Response } from 'express';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

import { Access } from '../auth/auth-route.decorator';
import { CurrentSession } from '../auth/request-context';
import { commandHeaders } from '../commands/command-headers';
import { routeId } from '../commands/versioned-entity';
import { ProblemException } from '../common/api-problem.filter';
import { Gated } from '../common/feature-gates';
import type { ObjectStore } from '../storage/object-store';
import { OBJECT_STORE } from '../storage/storage.module';
import { ATTACHMENT_REMOVE_KIND, ATTACHMENT_REPLACE_KIND, ATTACHMENT_RETAIN_KIND, AttachmentService } from './attachments.service';

type HeaderBag = Record<string, string | string[] | undefined>;

/** Receipt downloads one API process streams at once; more are told to retry. */
export const ATTACHMENT_DOWNLOADS_PER_PROCESS = 8;

/**
 * P2c receipts. Retain, replace and remove are commands on the record
 * (`If-Match` = the record's version, `Idempotency-Key`; the record moves to
 * its next version) and need the current policies; retain and replace also
 * need the user's explicit consent in the body. The grant and the download
 * need the owner's bound session; anything the caller cannot use is the same
 * 404.
 */
@Controller('v1')
export class AttachmentsController {
  private downloading = 0;

  constructor(
    private readonly attachments: AttachmentService,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore,
  ) {}

  /** Retains a preview's sanitized image as the record's receipt. */
  @Post('transactions/:id/attachment')
  @Access('current_policy')
  @Gated('writes')
  @HttpCode(200)
  retain(@CurrentSession() session: SessionContext, @Headers() headers: HeaderBag, @Param('id') id: string, @Body() body: unknown): Promise<CommandAck> {
    const command = commandHeaders(headers, 'required');
    const transactionId = routeId(id);
    const input = assertKnownFields(body, ['attachment_id', 'consent']);
    return this.attachments.retain(session, {
      ...command,
      kind: ATTACHMENT_RETAIN_KIND,
      payload: { transaction_id: transactionId, attachment_id: input.attachment_id as string, consent: input.consent as ReceiptRetentionConsent },
    });
  }

  /** Replaces the record's receipt; the one it held is deleted once nothing else holds it. */
  @Put('transactions/:id/attachment')
  @Access('current_policy')
  @Gated('writes')
  @HttpCode(200)
  replace(@CurrentSession() session: SessionContext, @Headers() headers: HeaderBag, @Param('id') id: string, @Body() body: unknown): Promise<CommandAck> {
    const command = commandHeaders(headers, 'required');
    const transactionId = routeId(id);
    const input = assertKnownFields(body, ['attachment_id', 'consent']);
    return this.attachments.replace(session, {
      ...command,
      kind: ATTACHMENT_REPLACE_KIND,
      payload: { transaction_id: transactionId, attachment_id: input.attachment_id as string, consent: input.consent as ReceiptRetentionConsent },
    });
  }

  /** Removes the record's receipt (no undo: its image is deleted once nothing else holds it). */
  @Delete('transactions/:id/attachment')
  @Access('current_policy')
  @Gated('writes')
  @HttpCode(200)
  remove(@CurrentSession() session: SessionContext, @Headers() headers: HeaderBag, @Param('id') id: string): Promise<CommandAck> {
    const command = commandHeaders(headers, 'required');
    return this.attachments.remove(session, { ...command, kind: ATTACHMENT_REMOVE_KIND, payload: { transaction_id: routeId(id) } });
  }

  /** A five-minute download path for a receipt one of the caller's active records holds. */
  @Get('attachments/:id/grant')
  @Access('bound_session')
  async grant(@CurrentSession() session: SessionContext, @Param('id') id: string): Promise<AttachmentGrant> {
    if (!isUuid(id)) throw new ProblemException(404, 'NOT_FOUND');
    const grant = await this.attachments.grant(session, id);
    if (!grant) throw new ProblemException(404, 'NOT_FOUND');
    return grant;
  }

  /**
   * The image for a current grant, re-authorized now (a record of the
   * caller's still holds it), streamed with its recorded length and checked
   * against its recorded digest as it streams.
   */
  @Get('attachment-files/:grant')
  @Access('bound_session')
  async file(@CurrentSession() session: SessionContext, @Param('grant') grant: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const stored = await this.attachments.file(session, grant);
    if (!stored) throw new ProblemException(404, 'NOT_FOUND');
    if (this.downloading >= ATTACHMENT_DOWNLOADS_PER_PROCESS) throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 });
    this.downloading += 1;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        this.downloading -= 1;
      }
    };
    try {
      const object = await this.store.getStream(stored.key);
      if (!object || object.bytes !== stored.bytes || (object.sha256 !== '' && object.sha256 !== stored.sha256)) throw new ProblemException(404, 'NOT_FOUND');
      const checked = Readable.from(verifiedChunks(object.body, stored.bytes, stored.sha256));
      checked.once('close', release);
      res.once('close', release);
      res.setHeader('Content-Disposition', `attachment; filename="${stored.fileName}"`);
      return new StreamableFile(checked, { type: stored.contentType, length: stored.bytes });
    } catch (error) {
      release();
      throw error;
    }
  }
}

/** Passes chunks through, failing the stream if the total size or digest is not what was recorded. */
async function* verifiedChunks(body: AsyncIterable<Uint8Array>, bytes: number, sha256: string): AsyncIterable<Uint8Array> {
  const hash = createHash('sha256');
  let seen = 0;
  for await (const chunk of body) {
    seen += chunk.byteLength;
    if (seen > bytes) throw new Error('receipt is larger than recorded');
    hash.update(chunk);
    yield chunk;
  }
  if (seen !== bytes || hash.digest('hex') !== sha256) throw new Error('receipt does not match its record');
}

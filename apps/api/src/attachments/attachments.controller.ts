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
import { ATTACHMENT_LIMITS } from './attachment-limits';
import type { AttachmentLimits } from './attachment-limits';
import { ATTACHMENT_REMOVE_KIND, ATTACHMENT_REPLACE_KIND, ATTACHMENT_RETAIN_KIND, AttachmentService } from './attachments.service';

type HeaderBag = Record<string, string | string[] | undefined>;

/** Told to a caller turned away because downloads are at their limit, or the object store failed. */
const RETRY_SECONDS = 5;

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
  private readonly downloadingByAccount = new Map<string, number>();

  constructor(
    private readonly attachments: AttachmentService,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore,
    @Inject(ATTACHMENT_LIMITS) private readonly limits: AttachmentLimits,
  ) {}

  /** Retains a preview's sanitized image as the record's receipt. */
  @Post('transactions/:id/attachment')
  @Access('current_policy')
  @Gated('imports', 'writes')
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
  @Gated('imports', 'writes')
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
   * caller's still holds it), streamed with its recorded length. The digest
   * is checked as it streams and the final chunk is held back until it
   * matches, so a corrupted object never reaches the client as a complete
   * download; one chunk is read before any header is sent, so a failure up to
   * then is an `ApiProblem` 503 (never the failure's text) and a failure after
   * it closes the connection. A process streams a few downloads at once and an
   * account only some of those; a stream with no progress for the idle limit,
   * or still running at the total limit, is cut off.
   */
  @Get('attachment-files/:grant')
  @Access('bound_session')
  async file(@CurrentSession() session: SessionContext, @Param('grant') grant: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const stored = await this.attachments.file(session, grant);
    if (!stored) throw new ProblemException(404, 'NOT_FOUND');
    const release = this.take(session.accountId);
    let stream: Readable | undefined;
    let total: NodeJS.Timeout | undefined;
    const finish = () => {
      clearTimeout(total);
      release();
    };
    try {
      const object = await this.store.getStream(stored.key);
      if (!object || object.bytes !== stored.bytes || (object.sha256 !== '' && object.sha256 !== stored.sha256)) throw new ProblemException(404, 'NOT_FOUND');
      const chunks = verifiedChunks(object.body, stored.bytes, stored.sha256)[Symbol.asyncIterator]();
      const first = await this.withinIdle(chunks.next());
      stream = Readable.from(this.rest(first, chunks));
      total = setTimeout(() => stream?.destroy(new Error('receipt download timed out')), this.limits.downloadTotalMs);
      stream.once('close', finish);
      res.once('close', finish);
      res.setHeader('Content-Disposition', `attachment; filename="${stored.fileName}"`);
      const file = new StreamableFile(stream, { type: stored.contentType, length: stored.bytes });
      file.setErrorHandler(() => void res.destroy());
      return file;
    } catch (error) {
      stream?.destroy();
      finish();
      if (error instanceof ProblemException) throw error;
      throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: RETRY_SECONDS });
    }
  }

  /** A download slot (process-wide and for this account), returned by calling the result once; 503 when none is free. */
  private take(accountId: string): () => void {
    const mine = this.downloadingByAccount.get(accountId) ?? 0;
    if (this.downloading >= this.limits.downloadsPerProcess || mine >= this.limits.downloadsPerAccount) {
      throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: RETRY_SECONDS });
    }
    this.downloading += 1;
    this.downloadingByAccount.set(accountId, mine + 1);
    let given = false;
    return () => {
      if (given) return;
      given = true;
      this.downloading -= 1;
      const left = (this.downloadingByAccount.get(accountId) ?? 1) - 1;
      if (left > 0) this.downloadingByAccount.set(accountId, left);
      else this.downloadingByAccount.delete(accountId);
    };
  }

  /** The step's result, or a failure if it takes longer than the idle limit. */
  private withinIdle<T>(step: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const idle = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('receipt download stalled')), this.limits.downloadIdleMs);
    });
    return Promise.race([step, idle]).finally(() => clearTimeout(timer));
  }

  /** The chunks after `first`, each of which has to arrive within the idle limit. */
  private async *rest(first: IteratorResult<Uint8Array>, chunks: AsyncIterator<Uint8Array>): AsyncIterable<Uint8Array> {
    if (first.done) return;
    yield first.value;
    try {
      for (;;) {
        const next = await this.withinIdle(chunks.next());
        if (next.done) return;
        yield next.value;
      }
    } finally {
      // Releases the object's body when the client left, the stream was cut off or a check failed. Not
      // awaited: a source that stalled would never answer, and this stream must close regardless.
      void chunks.return?.().catch(() => undefined);
    }
  }
}

/**
 * Passes chunks through, failing the stream if the total size or digest is
 * not what was recorded. The last chunk is held until the end of the body has
 * been checked, so nothing that fails the check is ever the final byte sent.
 */
async function* verifiedChunks(body: AsyncIterable<Uint8Array>, bytes: number, sha256: string): AsyncIterable<Uint8Array> {
  const hash = createHash('sha256');
  let seen = 0;
  let held: Uint8Array | undefined;
  for await (const chunk of body) {
    seen += chunk.byteLength;
    if (seen > bytes) throw new Error('receipt is larger than recorded');
    hash.update(chunk);
    if (held) yield held;
    held = chunk;
  }
  if (seen !== bytes || hash.digest('hex') !== sha256) throw new Error('receipt does not match its record');
  if (held) yield held;
}

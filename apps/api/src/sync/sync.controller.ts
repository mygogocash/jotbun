import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { ContractValidationError, assertKnownFields, isUuid } from '@gogospend/contracts';
import type { SessionContext, SnapshotDto, SyncChangesPage } from '@gogospend/contracts';
import type { Response } from 'express';
import { createHash } from 'node:crypto';

import { Access } from '../auth/auth-route.decorator';
import { CurrentSession } from '../auth/request-context';
import { ProblemException } from '../common/api-problem.filter';
import { DatabaseService } from '../database/database.service';
import type { ObjectStore } from '../storage/object-store';
import { OBJECT_STORE } from '../storage/storage.module';
import { SnapshotRepository } from './snapshot.repository';
import { SyncQuery, parseSyncRequest } from './sync-query';

@Controller('v1/sync')
export class SyncController {
  constructor(
    private readonly db: DatabaseService,
    private readonly query: SyncQuery,
    private readonly snapshots: SnapshotRepository,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore,
  ) {}

  /** Whole committed change groups after the cursor, in revision order, from one snapshot. */
  @Get('changes')
  @Access('bound_session')
  changes(@CurrentSession() session: SessionContext, @Query() query: Record<string, unknown>): Promise<SyncChangesPage> {
    const request = parseSyncRequest(query);
    return this.db.withOwnerTransaction(session, (tx) => this.query.after(tx, request.cursor, request.limit), { snapshot: true });
  }

  /**
   * Asks for a full snapshot (built in the background). Idempotent by
   * `Idempotency-Key`; an open build or a snapshot from the last hour is
   * reused. 200 with a ready snapshot; otherwise 202 - poll `GET
   * snapshots/:id` until it is ready.
   */
  @Post('snapshots')
  @Access('bound_session')
  async request(
    @CurrentSession() session: SessionContext,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SnapshotDto> {
    assertKnownFields(body ?? {}, []);
    if (!isUuid(key)) throw new ContractValidationError('VALIDATION_FAILED', 'Idempotency-Key must be a UUID.', 'idempotency-key');
    const status = await this.db.withOwnerTransaction(session, async (tx) => {
      const id = await this.snapshots.request(tx, key);
      const current = await this.snapshots.status(tx, id);
      if (!current) throw new Error('a requested snapshot has no status');
      return current;
    });
    res.status(status.status === 'ready' ? 200 : 202);
    return status;
  }

  @Get('snapshots/:id')
  @Access('bound_session')
  async status(@CurrentSession() session: SessionContext, @Param('id') id: string): Promise<SnapshotDto> {
    if (!isUuid(id)) throw new ProblemException(404, 'NOT_FOUND');
    const status = await this.db.withOwnerTransaction(session, (tx) => this.snapshots.status(tx, id), { snapshot: true });
    if (!status) throw new ProblemException(404, 'NOT_FOUND');
    return status;
  }

  /** One chunk's JSON body, for a current grant of the caller's own ready snapshot. */
  @Get('snapshot-chunks/:grant')
  @Access('bound_session')
  async chunk(@CurrentSession() session: SessionContext, @Param('grant') grant: string): Promise<StreamableFile> {
    const stored = await this.db.withOwnerTransaction(session, (tx) => this.snapshots.chunk(tx, grant), { snapshot: true });
    if (!stored) throw new ProblemException(404, 'NOT_FOUND');
    const body = await this.store.get(stored.key);
    if (!body || body.byteLength !== stored.bytes || createHash('sha256').update(body).digest('hex') !== stored.sha256) throw new ProblemException(404, 'NOT_FOUND');
    return new StreamableFile(Buffer.from(body), { type: 'application/json', length: body.byteLength });
  }
}

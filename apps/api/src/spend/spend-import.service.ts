import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron } from '@nestjs/schedule';

import { isLegacyCronEnabled } from 'src/common/legacy-cron-gate';
import { AnalyticsService } from 'src/analytics/analytics.service';
import { Optional } from '@nestjs/common';

import {
  parseSpendUpload,
  spendRowFingerprint,
  type SpendParsedRow,
} from './mappers/parse-spend-file';
import type { SpendMapperId } from '@gogospend/contracts';
import { SpendCategory } from './schemas/spend-category.schema';
import { SpendImportJob } from './schemas/spend-import-job.schema';
import { SaltEdgeClient } from './salt-edge.client';
import { SpendBankConnection } from './schemas/spend-bank-connection.schema';
import { SpendTx } from './schemas/spend-tx.schema';
import { SpendWallet } from './schemas/spend-wallet.schema';
import { createHash } from 'node:crypto';

/** Reclaim a `running` job whose worker likely died before a terminal write. */
export const SPEND_IMPORT_STALE_RUNNING_MS = 60_000;

@Injectable()
export class SpendImportService implements OnModuleInit {
  private readonly logger = new Logger(SpendImportService.name);
  private draining = false;
  private readonly saltEdge: SaltEdgeClient;
  private indexesReady = false;

  constructor(
    @InjectModel(SpendImportJob.name)
    private readonly jobModel: Model<SpendImportJob>,
    @InjectModel(SpendWallet.name)
    private readonly walletModel: Model<SpendWallet>,
    @InjectModel(SpendCategory.name)
    private readonly categoryModel: Model<SpendCategory>,
    @InjectModel(SpendTx.name)
    private readonly txModel: Model<SpendTx>,
    @Optional() private readonly analytics?: AnalyticsService,
    @Optional()
    @InjectModel(SpendBankConnection.name)
    private readonly bankConnectionModel?: Model<SpendBankConnection>,
    @Optional() saltEdge?: SaltEdgeClient,
  ) {
    this.saltEdge = saltEdge ?? new SaltEdgeClient();
  }

  async onModuleInit(): Promise<void> {
    await this.ensureIndexReady();
  }

  async countSucceeded(userId: string): Promise<number> {
    return this.jobModel.countDocuments({
      user_id: new Types.ObjectId(userId),
      status: 'succeeded',
    });
  }

  async enqueue(
    userId: string,
    buf: Buffer,
    filename: string,
  ): Promise<{ job_id: string; status: string; duplicate?: boolean }> {
    await this.ensureIndexReady();
    const userOid = new Types.ObjectId(userId);
    const importHash = createHash('sha256').update(buf).digest('hex');

    const existing = await this.jobModel
      .findOne({ user_id: userOid, import_hash: importHash })
      .lean();
    if (existing?.status === 'succeeded') {
      return {
        job_id: String(existing._id),
        status: 'succeeded',
        duplicate: true,
      };
    }
    if (
      existing &&
      (existing.status === 'queued' || existing.status === 'running')
    ) {
      throw new ConflictException({ code: 'IN_FLIGHT' });
    }
    if (existing?.status === 'failed') {
      try {
        const reset = await this.jobModel.findOneAndUpdate(
          { _id: existing._id, status: 'failed' },
          {
            $set: {
              mapper: null,
              status: 'queued',
              error_code: null,
              payload: buf,
              filename: filename.slice(0, 200) || 'import.csv',
              parsed_sum_minor: 0,
              file_sum_minor: 0,
              row_ok: 0,
              row_reject: 0,
              started_at: null,
              finished_at: null,
            },
          },
          { returnDocument: 'after' },
        );
        if (!reset) {
          throw new ConflictException({ code: 'IN_FLIGHT' });
        }
        this.capture(userId, 'spend_import_started', { mapper: 'unknown' });
        return { job_id: String(reset._id), status: 'queued' };
      } catch (error) {
        if (error instanceof ConflictException) throw error;
        if (isDuplicateKey(error)) {
          throw new ConflictException({ code: 'IN_FLIGHT' });
        }
        throw error;
      }
    }

    try {
      const created = await this.jobModel.create({
        user_id: userOid,
        mapper: null,
        import_hash: importHash,
        status: 'queued',
        error_code: null,
        payload: buf,
        filename: filename.slice(0, 200) || 'import.csv',
      });
      this.capture(userId, 'spend_import_started', { mapper: 'unknown' });
      return { job_id: String(created._id), status: 'queued' };
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictException({ code: 'IN_FLIGHT' });
      }
      throw error;
    }
  }

  async getJob(userId: string, jobId: string) {
    if (!Types.ObjectId.isValid(jobId)) return null;
    const job = await this.jobModel
      .findOne({
        _id: new Types.ObjectId(jobId),
        user_id: new Types.ObjectId(userId),
      })
      .select({ payload: 0 })
      .lean();
    return job;
  }

  @Cron('*/15 * * * * *')
  async drainTick(): Promise<void> {
    if (!isLegacyCronEnabled()) return;
    if (this.draining) return;
    this.draining = true;
    try {
      await this.drainOne();
    } finally {
      this.draining = false;
    }
  }

  async drainOne(): Promise<void> {
    await this.ensureIndexReady();
    const staleBefore = new Date(Date.now() - SPEND_IMPORT_STALE_RUNNING_MS);
    const claimed = await this.jobModel.findOneAndUpdate(
      {
        $or: [
          { status: 'queued' },
          { status: 'running', started_at: { $lte: staleBefore } },
        ],
      },
      { $set: { status: 'running', started_at: new Date() } },
      { returnDocument: 'after' },
    );
    if (!claimed) return;

    const userId = String(claimed.user_id);
    const payload = claimed.payload;
    if (!payload) {
      await this.failJob(claimed._id, 'EMPTY');
      return;
    }

    const parsed = await parseSpendUpload(payload, claimed.filename);
    if (parsed.ok === false) {
      await this.failJob(claimed._id, parsed.error_code);
      this.capture(userId, 'spend_import_failed', {
        mapper: 'unknown',
        error_code: parsed.error_code,
        row_ok: 0,
      });
      return;
    }

    try {
      await this.persistRows(
        claimed.user_id,
        claimed._id,
        parsed.mapper,
        parsed.rows,
      );
      await this.jobModel.updateOne(
        { _id: claimed._id },
        {
          $set: {
            status: 'succeeded',
            mapper: parsed.mapper,
            parsed_sum_minor: parsed.parsed_sum_minor,
            file_sum_minor: parsed.file_sum_minor,
            row_ok: parsed.rows.length,
            row_reject: parsed.row_reject,
            error_code: null,
            finished_at: new Date(),
          },
          $unset: { payload: 1 },
        },
      );
      this.capture(userId, 'spend_import_completed', {
        mapper: parsed.mapper,
        row_ok: parsed.rows.length,
      });
    } catch (error) {
      this.logger.error(
        `spend import persist failed job=${String(claimed._id)}`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.failJob(claimed._id, 'PERSIST_FAILED');
      this.capture(userId, 'spend_import_failed', {
        mapper: parsed.mapper,
        error_code: 'PERSIST_FAILED',
        row_ok: 0,
      });
    }
  }

  /**
   * Erase every Salt Edge customer this member holds before the local rows go.
   *
   * Order matters and is the whole point: `saltedge_customer_id` lives ONLY on
   * the `spend_bank_connections` row, so deleting locally first would strand
   * the aggregator's copy with no id left to erase it by — an unreachable
   * PDPA s.33 orphan.
   *
   * A remote failure does not abort the purge. The member's right to erasure
   * of our own copy is not contingent on Salt Edge being reachable, and this
   * runs inside the account-deletion sweep, where throwing would block every
   * other member queued behind them. The orphan is logged at `error` with its
   * customer id so it can be retried by hand; `deleteCustomer` is idempotent,
   * so a retry after a partial run is safe.
   */
  private async revokeSaltEdgeCustomers(userId: Types.ObjectId): Promise<void> {
    if (!this.bankConnectionModel || !this.saltEdge.isConfigured()) return;
    const rows = await this.bankConnectionModel
      .find({ user_id: userId }, { saltedge_customer_id: 1 })
      .lean()
      .exec();
    const customerIds = [
      ...new Set(
        rows
          .map(
            (row) =>
              (row as { saltedge_customer_id?: string }).saltedge_customer_id,
          )
          .filter((id): id is string => Boolean(id?.trim())),
      ),
    ];
    for (const customerId of customerIds) {
      try {
        await this.saltEdge.deleteCustomer(customerId);
      } catch (error) {
        this.logger.error(
          `Salt Edge erasure failed for customer ${customerId} (user ${userId.toHexString()}); local rows still purged, retry by hand: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  async purgeForUser(userId: Types.ObjectId): Promise<void> {
    await this.revokeSaltEdgeCustomers(userId);
    await this.jobModel.updateMany(
      { user_id: userId, status: { $in: ['queued', 'running'] } },
      {
        $set: {
          status: 'failed',
          error_code: 'ACCOUNT_DELETED',
          finished_at: new Date(),
        },
        $unset: { payload: 1 },
      },
    );
    await Promise.all([
      this.jobModel.deleteMany({ user_id: userId }),
      this.txModel.deleteMany({ user_id: userId }),
      this.walletModel.deleteMany({ user_id: userId }),
      this.categoryModel.deleteMany({ user_id: userId }),
      this.bankConnectionModel
        ? this.bankConnectionModel.deleteMany({ user_id: userId })
        : Promise.resolve(),
    ]);
  }

  private async persistRows(
    userId: Types.ObjectId,
    importId: Types.ObjectId,
    mapper: SpendMapperId,
    rows: SpendParsedRow[],
  ): Promise<void> {
    for (const row of rows) {
      const wallet = await this.walletModel.findOneAndUpdate(
        { user_id: userId, name: row.wallet_name },
        {
          $setOnInsert: {
            user_id: userId,
            name: row.wallet_name,
            kind: inferWalletKind(row.wallet_name),
            currency: 'THB',
            source: mapper,
            import_id: importId,
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
      const categoryType = row.type === 'income' ? 'income' : 'expense';
      const category = await this.categoryModel.findOneAndUpdate(
        { user_id: userId, name: row.category, type: categoryType },
        {
          $setOnInsert: {
            user_id: userId,
            name: row.category,
            type: categoryType,
            source: mapper,
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
      if (!wallet || !category) {
        throw new Error('spend wallet or category upsert failed');
      }
      const fingerprint = spendRowFingerprint(mapper, row);
      try {
        await this.txModel.create({
          user_id: userId,
          wallet_id: wallet._id,
          category_id: category._id,
          type: row.type,
          amount_minor: row.amount_minor,
          occurred_on: row.occurred_on,
          note: row.note,
          merchant: row.merchant,
          tags: row.tags,
          source: mapper,
          import_id: importId,
          fingerprint,
        });
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
      }
    }
  }

  private async failJob(id: Types.ObjectId, errorCode: string): Promise<void> {
    await this.jobModel.updateOne(
      { _id: id },
      {
        $set: {
          status: 'failed',
          error_code: errorCode,
          finished_at: new Date(),
        },
        $unset: { payload: 1 },
      },
    );
  }

  private async ensureIndexReady(): Promise<void> {
    if (this.indexesReady) return;
    await Promise.all([
      this.jobModel.createIndexes(),
      this.walletModel.createIndexes(),
      this.categoryModel.createIndexes(),
      this.txModel.createIndexes(),
      this.bankConnectionModel
        ? this.bankConnectionModel.createIndexes()
        : Promise.resolve(),
    ]);
    this.indexesReady = true;
  }

  private capture(
    userId: string,
    event:
      'spend_import_started' | 'spend_import_completed' | 'spend_import_failed',
    props: { mapper: string; row_ok?: number; error_code?: string },
  ): void {
    this.analytics
      ?.capture(event, { userId, distinctId: userId, platform: 'api' }, props)
      ?.catch((error: unknown) => {
        this.logger.error(
          `Analytics emit failed for ${event}: ${
            error instanceof Error ? error.name : 'unknown error'
          }`,
        );
      });
  }
}

function inferWalletKind(name: string): 'cash' | 'bank' | 'card' {
  const n = name.toLowerCase();
  if (n.includes('card') || n.includes('บัตร')) return 'card';
  if (n.includes('bank') || n.includes('ไทย') || n.includes('kbank')) {
    return 'bank';
  }
  return 'cash';
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

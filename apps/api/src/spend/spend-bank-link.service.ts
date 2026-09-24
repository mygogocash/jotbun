import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { spendRowFingerprint } from './mappers/parse-spend-file';
import {
  importableSaltEdgeTransaction,
  SaltEdgeClient,
} from './salt-edge.client';
import { SpendBankConnection } from './schemas/spend-bank-connection.schema';
import { SpendCategory } from './schemas/spend-category.schema';
import { SpendTx } from './schemas/spend-tx.schema';
import { SpendWallet } from './schemas/spend-wallet.schema';

@Injectable()
export class SpendBankLinkService {
  private readonly logger = new Logger(SpendBankLinkService.name);
  private readonly client = new SaltEdgeClient();

  constructor(
    @InjectModel(SpendBankConnection.name)
    private readonly connectionModel: Model<SpendBankConnection>,
    @InjectModel(SpendWallet.name)
    private readonly walletModel: Model<SpendWallet>,
    @InjectModel(SpendCategory.name)
    private readonly categoryModel: Model<SpendCategory>,
    @InjectModel(SpendTx.name)
    private readonly txModel: Model<SpendTx>,
  ) {}

  async status(userId: string): Promise<{
    available: boolean;
    link_status: 'none' | 'pending' | 'active';
    provider_code: string | null;
  }> {
    const available = this.client.isConfigured();
    if (!available) {
      return { available: false, link_status: 'none', provider_code: null };
    }
    const row = await this.connectionModel
      .findOne({ user_id: new Types.ObjectId(userId) })
      .lean();
    if (!row) {
      return { available: true, link_status: 'none', provider_code: null };
    }
    return {
      available: true,
      link_status: row.status === 'active' ? 'active' : 'pending',
      provider_code: row.provider_code ?? null,
    };
  }

  async startConnect(
    userId: string,
  ): Promise<{ connect_url: string; expires_at?: string }> {
    if (!this.client.isConfigured()) {
      throw new ServiceUnavailableException({
        code: 'BANK_LINK_UNAVAILABLE',
      });
    }
    const userOid = new Types.ObjectId(userId);
    let existing = await this.connectionModel.findOne({ user_id: userOid });
    let customerId = existing?.saltedge_customer_id;
    if (!customerId) {
      customerId = await this.client.createCustomer(userId);
      existing = await this.connectionModel.create({
        user_id: userOid,
        saltedge_customer_id: customerId,
        connection_id: null,
        status: 'pending',
      });
    }
    const frontend =
      process.env.CUSTOMER_FRONTEND_URL?.trim() ||
      process.env.EXPO_PUBLIC_FRONTEND_URL?.trim() ||
      'https://app.gogocash.co';
    const session = await this.client.createConnectSession({
      customerId,
      userId,
      returnTo: `${frontend.replace(/\/$/, '')}/spend`,
    });
    await this.connectionModel.updateOne(
      { _id: existing!._id },
      {
        $set: {
          saltedge_customer_id: session.customer_id,
          status: 'pending',
        },
      },
    );
    return {
      connect_url: session.connect_url,
      expires_at: session.expires_at,
    };
  }

  async handleCallback(
    body: Record<string, unknown>,
  ): Promise<{ ok: true; imported: number }> {
    if (!this.client.isConfigured()) {
      throw new ServiceUnavailableException({
        code: 'BANK_LINK_UNAVAILABLE',
      });
    }
    const data = isRecord(body.data) ? body.data : undefined;
    const connectionId =
      typeof data?.connection_id === 'string' ? data.connection_id.trim() : '';
    const stage =
      (typeof data?.api_stage === 'string' && data.api_stage) ||
      (typeof data?.stage === 'string' && data.stage) ||
      undefined;
    const skipStages = new Set([
      'start',
      'connect',
      'fetch_holder_info',
      'fetch_accounts',
      'fetch_transactions',
      'start_categorization',
    ]);
    if (!connectionId || (stage && skipStages.has(stage))) {
      return { ok: true, imported: 0 };
    }
    const remote = await this.client.getConnection(connectionId);
    if (!remote) {
      this.logger.warn('saltedge callback connection not found');
      return { ok: true, imported: 0 };
    }
    const link = await this.connectionModel.findOne({
      saltedge_customer_id: remote.customer_id,
    });
    if (!link) {
      this.logger.warn('saltedge callback customer is not mapped');
      return { ok: true, imported: 0 };
    }
    const active = remote.status === 'active';
    await this.connectionModel.updateOne(
      { _id: link._id },
      {
        $set: {
          connection_id: remote.id,
          provider_code: remote.provider_code ?? null,
          status: active ? 'active' : 'pending',
        },
      },
    );
    if (!active) {
      return { ok: true, imported: 0 };
    }
    const txs = await this.client.listTransactions(connectionId);
    let imported = 0;
    for (const tx of txs) {
      if (!importableSaltEdgeTransaction(tx)) continue;
      const amount = Number(tx.amount);
      const amountMinor = Math.round(Math.abs(amount) * 100);
      const type = amount < 0 ? ('expense' as const) : ('income' as const);
      const merchant = (
        tx.extra?.merchant ||
        tx.extra?.payee ||
        tx.description ||
        ''
      ).slice(0, 120);
      const occurredOn = tx.made_on || bangkokToday();
      const row = {
        occurred_on: occurredOn,
        type,
        amount_minor: amountMinor,
        category: 'Bank',
        wallet_name: remote.provider_code || 'Bank',
        merchant,
        note: tx.description ?? '',
        tags: [] as string[],
      };
      const fingerprint = spendRowFingerprint('saltedge', row);
      const wallet = await this.walletModel.findOneAndUpdate(
        { user_id: link.user_id, name: row.wallet_name },
        {
          $setOnInsert: {
            user_id: link.user_id,
            name: row.wallet_name,
            kind: 'bank',
            currency: 'THB',
            source: 'saltedge',
            import_id: null,
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
      const category = await this.categoryModel.findOneAndUpdate(
        {
          user_id: link.user_id,
          name: row.category,
          type: type === 'income' ? 'income' : 'expense',
        },
        {
          $setOnInsert: {
            user_id: link.user_id,
            name: row.category,
            type: type === 'income' ? 'income' : 'expense',
            source: 'saltedge',
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
      if (!wallet || !category) continue;
      try {
        await this.txModel.create({
          user_id: link.user_id,
          wallet_id: wallet._id,
          category_id: category._id,
          type,
          amount_minor: amountMinor,
          occurred_on: occurredOn,
          note: row.note,
          merchant,
          tags: [],
          source: 'saltedge',
          import_id: null,
          fingerprint,
        });
        imported += 1;
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
      }
    }
    return { ok: true, imported };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bangkokToday(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

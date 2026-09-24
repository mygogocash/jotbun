import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { parseSpendAllowlist } from '../spend/spend-allowlist';

import {
  canUseProduct,
  resolveProductAccessSnapshot,
  type ProductAccessProduct,
} from './can-use-product';
import {
  ProductAccessGrant,
  type ProductAccessGrantDocument,
} from './schemas/product-access-grant.schema';
import {
  ProductAccess,
  type ProductAccessDocument,
} from './schemas/product-access.schema';

const PRODUCT_ACCESS_SEED_ACTOR = 'seed:product-access';
const PRODUCT_ACCESS_ENV_MIGRATION_ACTOR = 'seed:spend-env-allowlist';

/**
 * Standalone product-access. Same collections (`product_access`,
 * `product_access_grants`) and same `canUse` semantics as the monorepo —
 * absent rows mean Off — but admin write routes stay in the monorepo.
 * Only the `spend` product is seeded here (`SPEND_ALLOWLIST_USER_IDS`
 * migrates to grants once, mirroring `ensureSpendFromEnvOrOff`).
 */
@Injectable()
export class ProductAccessService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProductAccessService.name);

  constructor(
    @InjectModel(ProductAccess.name)
    private readonly accessModel: Model<ProductAccessDocument>,
    @InjectModel(ProductAccessGrant.name)
    private readonly grantModel: Model<ProductAccessGrantDocument>,
  ) {}

  onApplicationBootstrap(): void {
    void this.ensureDefaults();
  }

  async ensureDefaults(): Promise<void> {
    try {
      await this.ensureSpendFromEnvOrOff();
      await Promise.all([
        this.accessModel.createIndexes(),
        this.grantModel.createIndexes(),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`product_access_seed_skipped: ${message}`);
    }
  }

  async canUse(
    product: ProductAccessProduct,
    userId: string | null | undefined,
  ): Promise<boolean> {
    const snapshot = await this.snapshot(product);
    return canUseProduct(snapshot, userId);
  }

  async snapshot(product: ProductAccessProduct) {
    const [row, grants] = await Promise.all([
      this.accessModel.findOne({ product }).lean(),
      this.grantModel.find({ product }).select({ user_id: 1 }).lean(),
    ]);
    return resolveProductAccessSnapshot(
      row,
      grants.map((grant) => String(grant.user_id)),
    );
  }

  async purgeForUser(userId: Types.ObjectId): Promise<void> {
    await this.grantModel.deleteMany({ user_id: userId });
  }

  private async ensureSpendFromEnvOrOff(): Promise<void> {
    const existing = await this.accessModel
      .findOne({ product: 'spend' })
      .lean();
    if (existing) return;
    const ids = [...parseSpendAllowlist()];
    if (ids.length === 0) {
      await this.accessModel.create({
        product: 'spend',
        mode: 'off',
        updated_by: PRODUCT_ACCESS_SEED_ACTOR,
      });
      return;
    }
    await this.accessModel.create({
      product: 'spend',
      mode: 'allowlist',
      updated_by: PRODUCT_ACCESS_ENV_MIGRATION_ACTOR,
    });
    for (const id of ids) {
      await this.grantModel.updateOne(
        { product: 'spend', user_id: new Types.ObjectId(id) },
        {
          $setOnInsert: {
            product: 'spend',
            user_id: new Types.ObjectId(id),
            granted_by: PRODUCT_ACCESS_ENV_MIGRATION_ACTOR,
          },
        },
        { upsert: true },
      );
    }
    this.logger.log(`product_access_spend_env_migrated grants=${ids.length}`);
  }
}

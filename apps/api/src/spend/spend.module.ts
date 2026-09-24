import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';

import { FirebaseAuthGuard } from 'src/auth/firebase-auth.guard';
import { RateLimitGuard } from 'src/auth/rate-limit.guard';
import { LegalDocumentModule } from 'src/legal-documents/legal-document.module';
import { ProductAccessModule } from 'src/product-access/product-access.module';
import { User, UserSchema } from 'src/user/schemas/user.schema';

import {
  SpendBankLinkCallbackController,
  SpendController,
} from './spend.controller';
import { SpendInternalController } from './spend-internal.controller';
import { SpendBankLinkService } from './spend-bank-link.service';
import { SpendImportService } from './spend-import.service';
import { SpendService } from './spend.service';
import {
  SpendBankConnection,
  SpendBankConnectionSchema,
} from './schemas/spend-bank-connection.schema';
import {
  SpendCategory,
  SpendCategorySchema,
} from './schemas/spend-category.schema';
import {
  SpendImportJob,
  SpendImportJobSchema,
} from './schemas/spend-import-job.schema';
import { SpendTx, SpendTxSchema } from './schemas/spend-tx.schema';
import { SpendWallet, SpendWalletSchema } from './schemas/spend-wallet.schema';

/**
 * Standalone note: the monorepo registers the Offer model here for the
 * missed-cashback hint. This service does not — `SpendService.offerModel`
 * stays undefined and the hint returns empty (fail-closed). Re-introducing
 * a direct Offer import would recouple the ledgers; the upgrade path is a
 * catalog HTTP client.
 *
 * JwtModule + FirebaseAuthGuard + User model live here: Nest resolves
 * route guards against the controller's host module.
 */
@Module({
  imports: [
    LegalDocumentModule,
    ProductAccessModule,
    JwtModule.register({ secret: process.env.JWT_SECRET }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: SpendWallet.name, schema: SpendWalletSchema },
      { name: SpendCategory.name, schema: SpendCategorySchema },
      { name: SpendTx.name, schema: SpendTxSchema },
      { name: SpendImportJob.name, schema: SpendImportJobSchema },
      { name: SpendBankConnection.name, schema: SpendBankConnectionSchema },
    ]),
  ],
  controllers: [
    SpendController,
    SpendBankLinkCallbackController,
    SpendInternalController,
  ],
  providers: [
    SpendService,
    SpendImportService,
    SpendBankLinkService,
    RateLimitGuard,
    FirebaseAuthGuard,
  ],
  exports: [SpendImportService, SpendService],
})
export class SpendModule {}

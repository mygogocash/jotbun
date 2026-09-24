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
import { Offer, OfferSchema } from 'src/offer/schemas/offer.schema';

/**
 * JwtModule + FirebaseAuthGuard + User model live here: Nest resolves
 * route guards against the controller's host module. Do not import
 * UserModule — UserModule already imports SpendModule for PDPA purge.
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
      { name: Offer.name, schema: OfferSchema },
    ]),
  ],
  controllers: [SpendController, SpendBankLinkCallbackController],
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

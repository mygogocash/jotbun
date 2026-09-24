import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';

import { LegalDocumentModule } from './legal-documents/legal-document.module';
import { ProductAccessModule } from './product-access/product-access.module';
import { SpendModule } from './spend/spend.module';

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGO_URI ?? '', {
      autoIndex: false,
    }),
    ScheduleModule.forRoot(),
    LegalDocumentModule,
    ProductAccessModule,
    SpendModule,
  ],
})
export class AppModule {}

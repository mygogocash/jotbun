import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ProductAccessService } from './product-access.service';
import {
  ProductAccessGrant,
  ProductAccessGrantSchema,
} from './schemas/product-access-grant.schema';
import {
  ProductAccess,
  ProductAccessSchema,
} from './schemas/product-access.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProductAccess.name, schema: ProductAccessSchema },
      { name: ProductAccessGrant.name, schema: ProductAccessGrantSchema },
    ]),
  ],
  providers: [ProductAccessService],
  exports: [ProductAccessService],
})
export class ProductAccessModule {}

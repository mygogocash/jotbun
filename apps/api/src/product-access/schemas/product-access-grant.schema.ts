import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

import {
  PRODUCT_ACCESS_PRODUCTS,
  type ProductAccessProduct,
} from '../can-use-product';

export type ProductAccessGrantDocument = HydratedDocument<ProductAccessGrant>;

@Schema({
  collection: 'product_access_grants',
  timestamps: true,
  autoIndex: false,
})
export class ProductAccessGrant {
  @Prop({ type: String, required: true, enum: PRODUCT_ACCESS_PRODUCTS })
  product!: ProductAccessProduct;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  user_id!: Types.ObjectId;

  @Prop({ type: String, required: true })
  granted_by!: string;
}

export const ProductAccessGrantSchema =
  SchemaFactory.createForClass(ProductAccessGrant);
ProductAccessGrantSchema.index({ product: 1, user_id: 1 }, { unique: true });
ProductAccessGrantSchema.index({ user_id: 1 });

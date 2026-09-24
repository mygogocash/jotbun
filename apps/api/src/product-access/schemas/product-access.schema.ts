import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import {
  PRODUCT_ACCESS_MODES,
  PRODUCT_ACCESS_PRODUCTS,
  type ProductAccessMode,
  type ProductAccessProduct,
} from '../can-use-product';

export type ProductAccessDocument = HydratedDocument<ProductAccess>;

@Schema({ collection: 'product_access', timestamps: true, autoIndex: false })
export class ProductAccess {
  @Prop({
    type: String,
    required: true,
    enum: PRODUCT_ACCESS_PRODUCTS,
    unique: true,
  })
  product: ProductAccessProduct;

  @Prop({
    type: String,
    required: true,
    enum: PRODUCT_ACCESS_MODES,
    default: 'off',
  })
  mode: ProductAccessMode;

  @Prop({ type: String, default: 'seed:product-access' })
  updated_by: string;
}

export const ProductAccessSchema = SchemaFactory.createForClass(ProductAccess);
ProductAccessSchema.index({ product: 1 }, { unique: true });

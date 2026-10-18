import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type SpendWalletDocument = HydratedDocument<SpendWallet>;

@Schema({ collection: 'spend_wallets', timestamps: true, autoIndex: false })
export class SpendWallet {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  user_id!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, enum: ['cash', 'bank', 'card'], default: 'cash' })
  kind!: 'cash' | 'bank' | 'card';

  @Prop({ type: String, default: 'THB' })
  currency!: string;

  @Prop({ type: String, default: 'manual' })
  source!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  import_id!: Types.ObjectId | null;
}

export const SpendWalletSchema = SchemaFactory.createForClass(SpendWallet);
SpendWalletSchema.index({ user_id: 1, name: 1 }, { unique: true });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type SpendBankConnectionDocument = HydratedDocument<SpendBankConnection>;

@Schema({
  collection: 'spend_bank_connections',
  timestamps: true,
  autoIndex: false,
})
export class SpendBankConnection {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  user_id: Types.ObjectId;

  @Prop({ type: String, required: true })
  saltedge_customer_id: string;

  @Prop({ type: String, default: null })
  connection_id: string | null;

  @Prop({ type: String, default: null })
  provider_code: string | null;

  @Prop({
    type: String,
    enum: ['pending', 'active', 'failed'],
    default: 'pending',
  })
  status: 'pending' | 'active' | 'failed';
}

export const SpendBankConnectionSchema =
  SchemaFactory.createForClass(SpendBankConnection);
SpendBankConnectionSchema.index({ saltedge_customer_id: 1 }, { unique: true });
SpendBankConnectionSchema.index({ user_id: 1 });

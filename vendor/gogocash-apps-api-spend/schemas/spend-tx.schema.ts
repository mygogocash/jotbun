import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

import { SPEND_TX_SOURCES, SPEND_TX_TYPES } from '@gogocash/contracts';

export type SpendTxDocument = HydratedDocument<SpendTx>;

@Schema({ collection: 'spend_txs', timestamps: true, autoIndex: false })
export class SpendTx {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  user_id: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  wallet_id: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  category_id: Types.ObjectId;

  @Prop({ type: String, enum: [...SPEND_TX_TYPES], required: true })
  type: (typeof SPEND_TX_TYPES)[number];

  @Prop({ type: Number, required: true, min: 0 })
  amount_minor: number;

  @Prop({ type: String, required: true })
  occurred_on: string;

  @Prop({ type: String, default: '' })
  note: string;

  @Prop({ type: String, default: '' })
  merchant: string;

  /**
   * The provider's own id for a row GoGoCash filled in — today the cashback
   * conversion id, which is what support asks a member to quote.
   *
   * It used to be stuffed into `note` as `cashback:<id>`, which meant the
   * member's own note had nowhere to go and their history printed a database id
   * at them. Its own field, so `note` belongs to the member again (owner call
   * 2026-09-07). Empty for every row a member typed themselves.
   */
  @Prop({ type: String, default: '' })
  external_ref: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: String, enum: [...SPEND_TX_SOURCES], required: true })
  source: (typeof SPEND_TX_SOURCES)[number];

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  import_id: Types.ObjectId | null;

  @Prop({ type: String, required: true })
  fingerprint: string;
}

export const SpendTxSchema = SchemaFactory.createForClass(SpendTx);
SpendTxSchema.index({ user_id: 1, fingerprint: 1 }, { unique: true });
SpendTxSchema.index({ user_id: 1, occurred_on: 1, type: 1 });

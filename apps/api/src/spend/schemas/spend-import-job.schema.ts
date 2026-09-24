import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

import {
  SPEND_JOB_ERROR_CODES,
  SPEND_JOB_STATUSES,
  SPEND_MAPPERS,
} from '@gogospend/contracts';

export type SpendImportJobDocument = HydratedDocument<SpendImportJob>;

export const SPEND_IMPORT_IN_FLIGHT_INDEX = 'spend_import_user_inflight_unique';

@Schema({ collection: 'spend_import_jobs', timestamps: true, autoIndex: false })
export class SpendImportJob {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  user_id: Types.ObjectId;

  @Prop({ type: String, enum: [...SPEND_MAPPERS], default: null })
  mapper: (typeof SPEND_MAPPERS)[number] | null;

  @Prop({ type: String, required: true })
  import_hash: string;

  @Prop({ type: String, enum: [...SPEND_JOB_STATUSES], required: true })
  status: (typeof SPEND_JOB_STATUSES)[number];

  @Prop({
    type: String,
    enum: [...SPEND_JOB_ERROR_CODES],
    default: null,
  })
  error_code: (typeof SPEND_JOB_ERROR_CODES)[number] | null;

  @Prop({ type: Number, default: 0 })
  parsed_sum_minor: number;

  @Prop({ type: Number, default: 0 })
  file_sum_minor: number;

  @Prop({ type: Number, default: 0 })
  row_ok: number;

  @Prop({ type: Number, default: 0 })
  row_reject: number;

  @Prop({ type: Date, default: null })
  started_at: Date | null;

  @Prop({ type: Date, default: null })
  finished_at: Date | null;

  /** Dropped after parse. Never copy to R2. */
  @Prop({ type: Buffer, default: null })
  payload: Buffer | null;

  @Prop({ type: String, default: 'import.csv' })
  filename: string;
}

export const SpendImportJobSchema =
  SchemaFactory.createForClass(SpendImportJob);

SpendImportJobSchema.index(
  { user_id: 1 },
  {
    name: SPEND_IMPORT_IN_FLIGHT_INDEX,
    unique: true,
    partialFilterExpression: { status: { $in: ['queued', 'running'] } },
  },
);
SpendImportJobSchema.index({ user_id: 1, import_hash: 1 }, { unique: true });

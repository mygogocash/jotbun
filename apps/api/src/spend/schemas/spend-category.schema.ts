import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type SpendCategoryDocument = HydratedDocument<SpendCategory>;

@Schema({ collection: 'spend_categories', timestamps: true, autoIndex: false })
export class SpendCategory {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  user_id: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({ type: String, enum: ['expense', 'income'], required: true })
  type: 'expense' | 'income';

  @Prop({ type: String, default: 'manual' })
  source: string;

  /**
   * The member's own mark for this category, and the colour its chip wears.
   *
   * Both optional: a category made before this existed, or made by someone who
   * only wanted a name, keeps the plain tag look. The emoji is its OWN field
   * rather than part of `name` on purpose — names are what the month summary
   * groups by, so "🎵 Music" as a name would never add up with "Music".
   *
   * The controller is the authority on what may go in either: `hue` must be one
   * of `SPEND_CATEGORY_HUES`, and `emoji` must carry no text.
   */
  @Prop({ type: String })
  emoji?: string;

  @Prop({ type: String })
  hue?: string;
}

export const SpendCategorySchema = SchemaFactory.createForClass(SpendCategory);
SpendCategorySchema.index({ user_id: 1, name: 1, type: 1 }, { unique: true });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Minimal User projection for the standalone spend service.
 *
 * Same default collection (`users`) as the monorepo, which this service
 * shares in v1 — only the fields the FirebaseAuthGuard reads live here.
 * The monorepo remains the writer of user rows; this service never writes
 * them.
 */
export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, autoIndex: false })
export class User {
  @Prop({ type: String, default: null })
  id_firebase?: string | null;

  @Prop({ type: String, default: null })
  id_google?: string | null;

  @Prop({ type: String, default: null })
  id_facebook?: string | null;

  @Prop({ type: Boolean, default: false })
  disabled?: boolean;

  @Prop({ type: Number, default: 0 })
  session_version?: number;
}

export const UserSchema = SchemaFactory.createForClass(User);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AnalysisSettingsDocument = AnalysisSettings & Document;

@Schema()
export class AnalysisSettings {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  user: Types.ObjectId;

  @Prop({ default: true })
  saveHistory: boolean;

  @Prop({ default: 30 })
  retentionDays: number;

  @Prop({ default: 30 })
  averageDays: number;

  @Prop({ default: true })
  pushEnabled: boolean;
}

export const AnalysisSettingsSchema =
  SchemaFactory.createForClass(AnalysisSettings);

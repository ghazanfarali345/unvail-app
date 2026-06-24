import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AnalysisHistoryDocument = AnalysisHistory & Document;

@Schema({ timestamps: true })
export class AnalysisHistory {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ type: Object, required: true })
  report: any;

  @Prop()
  totalScore?: number;

  @Prop()
  sourceText?: string;

  @Prop()
  resultText?: string;

  @Prop({ default: null })
  reportFileName?: string;

  @Prop({ default: null })
  reportFileMimeType?: string;

  @Prop({ default: null })
  reportFileSize?: number;

  @Prop({ default: null })
  reportFilePath?: string;

  @Prop({ default: null })
  reportSubmittedAt?: Date;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const AnalysisHistorySchema =
  SchemaFactory.createForClass(AnalysisHistory);

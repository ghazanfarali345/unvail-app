import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalysisService } from './analysis.service';
import { AnalysisController } from './analysis.controller';
import {
  AnalysisHistory,
  AnalysisHistorySchema,
} from './schemas/analysis-history.schema';
import {
  AnalysisSettings,
  AnalysisSettingsSchema,
} from './schemas/analysis-settings.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AnalysisHistory.name, schema: AnalysisHistorySchema },
      { name: AnalysisSettings.name, schema: AnalysisSettingsSchema },
    ]),
  ],
  providers: [AnalysisService],
  controllers: [AnalysisController],
})
export class AnalysisModule {}

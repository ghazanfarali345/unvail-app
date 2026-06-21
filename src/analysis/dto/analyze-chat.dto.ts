import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AnalyzeChatDto {
  @ApiPropertyOptional({
    description: 'Text content of the chat conversation',
    example: 'Person A: Hello, how are you?\nPerson B: I am doing well...',
  })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description:
      'Screenshot image files of the chat (JPG, PNG, WebP, GIF). Up to 4 images can be provided. The AI will extract and analyze the conversation from the images.',
  })
  @IsOptional()
  images?: any[];
}

export class RoleAndTendency {
  person: string;
  role: string;
  communicationStyle: string;
}

export class Marker {
  title: string;
  description: string;
  evidence: string;
}

export class ScoringBreakdown {
  positiveMarkersScore: number; // 0-25
  negativeMarkersScore: number; // 0-25
  conflictInsightsScore: number; // 0-25
  rolesTendenciesScore: number; // 0-25
  totalScore: number; // 0-100
}

export class AnalysisReport {
  relationshipHealthScore: ScoringBreakdown;
  rolesAndTendencies: RoleAndTendency[];
  positiveMarkers: Marker[];
  negativeMarkers: Marker[];
  conflictInsights: string;
  improvementTips: string[];
  // Indicates this report was produced as a comparison reanalysis
  isComparison?: boolean;
}

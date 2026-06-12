import { IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class HistoryFilterDto {
  @IsOptional()
  @IsString()
  @IsIn(['All', 'Latest', 'High', 'Low'])
  @ApiPropertyOptional({ enum: ['All', 'Latest', 'High', 'Low'], description: 'Filter to apply to history' })
  filter?: string;
}

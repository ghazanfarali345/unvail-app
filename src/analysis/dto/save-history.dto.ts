import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SaveHistoryDto {
  @IsBoolean()
  @ApiProperty({ description: 'Whether to save analysis history for the user', type: 'boolean' })
  saveHistory: boolean;
}

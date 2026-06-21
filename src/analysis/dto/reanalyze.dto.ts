import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { AnalyzeChatDto } from './analyze-chat.dto';

export class ReanalyzeDto extends AnalyzeChatDto {
  @ApiProperty({ description: 'Existing analysis history id to update' })
  @IsString()
  historyId: string;
}

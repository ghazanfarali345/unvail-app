import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AnalyzeChatDto {
  @ApiPropertyOptional({ description: 'Text content of the chat' })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({ type: 'string', format: 'binary', description: 'Screenshot image file' })
  @IsOptional()
  image?: any;
}

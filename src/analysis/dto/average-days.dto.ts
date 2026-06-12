import { IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AverageDaysDto {
  @IsNumber()
  @Min(1)
  @ApiProperty({ description: 'Number of days to average scores over', example: 7 })
  averageDays: number;
}

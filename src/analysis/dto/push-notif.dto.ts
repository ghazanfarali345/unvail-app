import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PushNotifDto {
  @IsBoolean()
  @ApiProperty({ description: 'Enable or disable push notifications for analysis results', type: 'boolean' })
  pushEnabled: boolean;
}

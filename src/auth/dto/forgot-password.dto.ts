import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'ghazanfar@yopmail.com' })
  @IsEmail()
  email: string;
}

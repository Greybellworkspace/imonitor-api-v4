import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ description: 'New password' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ description: 'Confirm new password (must match password)' })
  @IsString()
  @IsNotEmpty()
  confirmPassword: string;

  @ApiProperty({ description: 'Current password' })
  @IsString()
  @IsNotEmpty()
  oldPassword: string;
}

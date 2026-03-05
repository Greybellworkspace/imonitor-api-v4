import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ChangeWbOwnerDto {
  @ApiProperty({ description: 'Widget builder ID' })
  @IsString()
  @IsNotEmpty()
  widgetBuilderId: string;

  @ApiProperty({ description: 'New owner user ID' })
  @IsString()
  @IsNotEmpty()
  newOwnerId: string;
}

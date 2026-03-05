import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RenameWidgetBuilderDto {
  @ApiProperty({ description: 'Widget builder ID' })
  @IsString()
  @IsNotEmpty()
  widgetBuilderId: string;

  @ApiProperty({ description: 'New name' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

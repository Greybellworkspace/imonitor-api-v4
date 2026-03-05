import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';

export class ShareWidgetBuilderDto {
  @ApiProperty({ description: 'User IDs to share with', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  userIds: Array<string>;
}

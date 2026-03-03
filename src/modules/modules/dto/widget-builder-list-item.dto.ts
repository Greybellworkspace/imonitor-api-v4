import { ApiProperty } from '@nestjs/swagger';

export class WidgetBuilderListItemDto {
  @ApiProperty({ description: 'Widget builder ID' })
  id: string;

  @ApiProperty({ description: 'Widget builder name' })
  name: string;

  @ApiProperty({ description: 'Whether the widget builder is a favorite' })
  isFavorite: boolean;

  @ApiProperty({ description: 'Whether the widget builder is the default' })
  isDefault: boolean;

  @ApiProperty({ description: 'Owner user ID' })
  ownerId: string;

  @ApiProperty({ description: 'Widget builder creation date' })
  createdAt: Date;
}

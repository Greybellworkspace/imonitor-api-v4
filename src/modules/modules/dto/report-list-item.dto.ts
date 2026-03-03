import { ApiProperty } from '@nestjs/swagger';

export class ReportListItemDto {
  @ApiProperty({ description: 'Report ID' })
  id: string;

  @ApiProperty({ description: 'Report name' })
  name: string;

  @ApiProperty({ description: 'Whether the report is a favorite' })
  isFavorite: boolean;

  @ApiProperty({ description: 'Whether the report is the default' })
  isDefault: boolean;

  @ApiProperty({ description: 'Owner user ID' })
  ownerId: string;

  @ApiProperty({ description: 'Report creation date' })
  createdAt: Date;
}

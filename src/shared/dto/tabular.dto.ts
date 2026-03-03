import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TabularHeaderDto {
  @ApiProperty()
  text: string;

  @ApiProperty()
  datafield: string;

  @ApiPropertyOptional()
  columnName?: string;

  @ApiProperty({ type: [String], default: [] })
  aggregates: string[];

  @ApiProperty()
  pinned: boolean;

  @ApiProperty()
  hidden: boolean;

  @ApiPropertyOptional()
  editable?: boolean;

  @ApiPropertyOptional()
  columntype?: string;

  @ApiPropertyOptional()
  index?: number;

  @ApiPropertyOptional()
  headerColumnType?: string;
}

export class TabularObjectDto {
  @ApiProperty({ type: [TabularHeaderDto] })
  header: TabularHeaderDto[];

  @ApiProperty({ type: [Object] })
  body: Record<string, unknown>[];
}

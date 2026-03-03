import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsObject } from 'class-validator';

export class DynamicTableInsertDto {
  @ApiProperty({ description: 'Target table name' })
  @IsString()
  @IsNotEmpty()
  tableName: string;

  @ApiProperty({ description: 'Record data as key-value pairs', type: Object })
  @IsObject()
  @IsNotEmpty()
  data: Record<string, unknown>;
}

export class DynamicTableListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tableName: string;

  @ApiProperty()
  displayName: string;
}

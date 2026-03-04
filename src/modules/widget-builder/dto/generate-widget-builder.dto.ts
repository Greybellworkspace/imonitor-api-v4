import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsArray, IsOptional, IsObject, Min } from 'class-validator';
import {
  IReportGlobalFilter,
  IMinimalTabularTable,
  ITabularTable,
  ITabularOrderBy,
  ICustomControlColumn,
  ICustomOperationColumn,
  ICustomCompareColumn,
} from '../../reports/dto/report-interfaces';

/**
 * DTO for widget builder query generation.
 *
 * Key difference from Reports' GenerateReportDto:
 * - No fromDate/toDate — WidgetBuilder uses IntervalAdjustment() based on
 *   table statInterval and startTime, not explicit user-provided date range.
 * - timeFilter is optional and used differently (no time-filter dimension switching).
 * - nodeType controls node filtering (ALL/TEST/PRODUCTION).
 */
export class GenerateWidgetBuilderDto {
  @ApiPropertyOptional({ description: 'Row limit' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  limit?: number;

  @ApiPropertyOptional({ description: 'Time filter interval' })
  @IsOptional()
  @IsString()
  timeFilter?: string;

  @ApiProperty({ description: 'Order by columns', type: 'array' })
  @IsArray()
  orderBy: Array<ITabularOrderBy>;

  @ApiProperty({ description: 'Global filter object' })
  @IsObject()
  globalFilter: IReportGlobalFilter;

  @ApiProperty({ description: 'Tables with fields', type: 'array' })
  @IsArray()
  tables: Array<IMinimalTabularTable | ITabularTable>;

  @ApiProperty({ description: 'Compare custom columns', type: 'array' })
  @IsArray()
  compare: Array<ICustomCompareColumn>;

  @ApiProperty({ description: 'Operation custom columns', type: 'array' })
  @IsArray()
  operation: Array<ICustomOperationColumn>;

  @ApiProperty({ description: 'Control custom columns', type: 'array' })
  @IsArray()
  control: Array<ICustomControlColumn>;

  @ApiPropertyOptional({ description: 'Priority custom columns', type: 'array' })
  @IsOptional()
  @IsArray()
  priority?: Array<ICustomControlColumn>;

  @ApiPropertyOptional({ description: 'Inclusion custom columns', type: 'array' })
  @IsOptional()
  @IsArray()
  inclusion?: Array<ICustomControlColumn>;

  @ApiPropertyOptional({ description: 'Node type filter (ALL, TEST, PRODUCTION)' })
  @IsOptional()
  @IsString()
  nodeType?: string;
}

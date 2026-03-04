import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsArray, IsOptional, IsObject, Min } from 'class-validator';
import {
  IReportGlobalFilter,
  IReportOptions,
  IMinimalTabularTable,
  ITabularOrderBy,
  ICustomControlColumn,
  ICustomOperationColumn,
  ICustomCompareColumn,
  IChartData,
} from './report-interfaces';

export class SaveReportDto {
  @ApiProperty({ description: 'Report name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Time filter interval (minutes, hourly, daily, weekly, monthly, yearly)' })
  @IsString()
  @IsNotEmpty()
  timeFilter: string;

  @ApiProperty({ description: 'Global filter object with conditions and rules' })
  @IsObject()
  globalFilter: IReportGlobalFilter;

  @ApiProperty({ description: 'Report options (thresholds, aggregation settings)' })
  @IsObject()
  options: IReportOptions;

  @ApiProperty({ description: 'Date range start' })
  @IsString()
  @IsNotEmpty()
  fromDate: string;

  @ApiProperty({ description: 'Date range end' })
  @IsString()
  @IsNotEmpty()
  toDate: string;

  @ApiProperty({ description: 'Row limit for query results' })
  @IsNumber()
  @Min(0)
  limit: number;

  @ApiProperty({ description: 'Tables used in the report with their fields', type: 'array' })
  @IsArray()
  tables: Array<IMinimalTabularTable>;

  @ApiProperty({ description: 'Order by columns', type: 'array' })
  @IsArray()
  orderBy: Array<ITabularOrderBy>;

  @ApiProperty({ description: 'Control (CASE/WHEN) custom columns', type: 'array' })
  @IsArray()
  control: Array<ICustomControlColumn>;

  @ApiProperty({ description: 'Operation (formula) custom columns', type: 'array' })
  @IsArray()
  operation: Array<ICustomOperationColumn>;

  @ApiProperty({ description: 'Compare (back-period) custom columns', type: 'array' })
  @IsArray()
  compare: Array<ICustomCompareColumn>;

  @ApiProperty({ description: 'Global order index for chart ordering' })
  @IsNumber()
  globalOrderIndex: number;

  @ApiProperty({ description: 'Chart definitions', type: 'array' })
  @IsArray()
  charts: Array<IChartData>;

  @ApiPropertyOptional({ description: 'Chart statuses (created/edited/deleted) keyed by chart ID' })
  @IsOptional()
  @IsObject()
  chartsStatus?: Record<string, string>;
}

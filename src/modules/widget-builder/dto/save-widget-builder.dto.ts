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
} from '../../reports/dto/report-interfaces';

export class SaveWidgetBuilderDto {
  @ApiProperty({ description: 'Widget builder name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Global filter object with conditions and rules' })
  @IsObject()
  globalFilter: IReportGlobalFilter;

  @ApiProperty({ description: 'Widget builder options (thresholds, aggregation settings)' })
  @IsObject()
  options: IReportOptions;

  @ApiProperty({ description: 'Row limit for query results' })
  @IsNumber()
  @Min(0)
  limit: number;

  @ApiProperty({ description: 'Tables used with their fields', type: 'array' })
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

  @ApiPropertyOptional({ description: 'Priority custom columns', type: 'array' })
  @IsOptional()
  @IsArray()
  priority?: Array<ICustomControlColumn>;

  @ApiPropertyOptional({ description: 'Inclusion custom columns', type: 'array' })
  @IsOptional()
  @IsArray()
  inclusion?: Array<ICustomControlColumn>;

  @ApiProperty({ description: 'Global order index for chart ordering' })
  @IsNumber()
  globalOrderIndex: number;

  @ApiProperty({ description: 'Chart definitions', type: 'array' })
  @IsArray()
  charts: Array<IChartData>;
}

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

export class EditWidgetBuilderDto {
  @ApiProperty({ description: 'Widget builder ID' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ description: 'Widget builder name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Global filter object' })
  @IsObject()
  globalFilter: IReportGlobalFilter;

  @ApiProperty({ description: 'Widget builder options' })
  @IsObject()
  options: IReportOptions;

  @ApiProperty({ description: 'Row limit' })
  @IsNumber()
  @Min(0)
  limit: number;

  @ApiProperty({ description: 'Tables with fields', type: 'array' })
  @IsArray()
  tables: Array<IMinimalTabularTable>;

  @ApiProperty({ description: 'Order by columns', type: 'array' })
  @IsArray()
  orderBy: Array<ITabularOrderBy>;

  @ApiProperty({ description: 'Control custom columns', type: 'array' })
  @IsArray()
  control: Array<ICustomControlColumn>;

  @ApiProperty({ description: 'Operation custom columns', type: 'array' })
  @IsArray()
  operation: Array<ICustomOperationColumn>;

  @ApiProperty({ description: 'Compare custom columns', type: 'array' })
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

  @ApiProperty({ description: 'Chart definitions', type: 'array' })
  @IsArray()
  charts: Array<IChartData>;

  @ApiProperty({ description: 'Global order index' })
  @IsNumber()
  globalOrderIndex: number;

  @ApiPropertyOptional({ description: 'Chart statuses (created/edited/deleted) keyed by chart ID' })
  @IsOptional()
  @IsObject()
  chartsStatus?: Record<string, string>;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { GenerateWidgetBuilderDto } from './generate-widget-builder.dto';
import { IChartData } from '../../reports/dto/report-interfaces';

/**
 * Request body for individual chart generation endpoints (pie, doughnut, trend, etc.).
 * Mirrors v3 pattern: { tabular: GenerateWidgetBuilderDto, chart: ChartConfigObject }
 */
export class GenerateWbChartDto {
  @ApiProperty({ description: 'Widget builder query configuration (tables, filters, etc.)' })
  @IsObject()
  @ValidateNested()
  @Type(() => GenerateWidgetBuilderDto)
  tabular: GenerateWidgetBuilderDto;

  @ApiProperty({ description: 'Chart configuration object (type, options, etc.)' })
  @IsObject()
  chart: IChartData;
}

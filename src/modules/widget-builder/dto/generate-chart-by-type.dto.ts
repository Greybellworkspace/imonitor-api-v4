import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class GenerateChartByTypeDto {
  @ApiProperty({ description: 'Widget builder ID' })
  @IsString()
  @IsNotEmpty()
  widgetBuilderId: string;

  @ApiProperty({ description: 'Chart ID within the widget builder' })
  @IsString()
  @IsNotEmpty()
  chartId: string;
}

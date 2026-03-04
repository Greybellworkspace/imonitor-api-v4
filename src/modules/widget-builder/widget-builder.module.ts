import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreWidgetBuilder } from '../../database/entities/core-widget-builder.entity';
import { CoreWidgetBuilderCharts } from '../../database/entities/core-widget-builder-charts.entity';
import { CoreWidgetBuilderModule as CoreWidgetBuilderModuleEntity } from '../../database/entities/core-widget-builder-module.entity';
import { CoreWidgetBuilderUsedTables } from '../../database/entities/core-widget-builder-used-tables.entity';
import { CoreSharedWidgetBuilder } from '../../database/entities/core-shared-widget-builder.entity';
import { WidgetBuilderController } from './widget-builder.controller';
import { WidgetBuilderService } from './widget-builder.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CoreWidgetBuilder,
      CoreWidgetBuilderCharts,
      CoreWidgetBuilderModuleEntity,
      CoreWidgetBuilderUsedTables,
      CoreSharedWidgetBuilder,
    ]),
  ],
  controllers: [WidgetBuilderController],
  providers: [WidgetBuilderService],
  exports: [WidgetBuilderService],
})
export class WidgetBuilderModule {}

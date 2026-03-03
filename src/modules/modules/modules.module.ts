import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreReport } from '../../database/entities/core-report.entity';
import { CoreReportModule } from '../../database/entities/core-report-module.entity';
import { CoreWidgetBuilder } from '../../database/entities/core-widget-builder.entity';
import { CoreWidgetBuilderModule } from '../../database/entities/core-widget-builder-module.entity';
import { ModulesService } from './modules.service';
import { ModulesController } from './modules.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CoreReport, CoreReportModule, CoreWidgetBuilder, CoreWidgetBuilderModule])],
  controllers: [ModulesController],
  providers: [ModulesService],
  exports: [ModulesService],
})
export class ModulesModule {}

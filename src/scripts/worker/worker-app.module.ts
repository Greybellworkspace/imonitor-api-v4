/**
 * WorkerAppModule — minimal NestJS application context for worker scripts.
 *
 * Used by automatedReport.worker.ts to bootstrap NestJS services
 * (ReportsService, ExportHelperService, etc.) without the full AppModule
 * overhead (no guards, no middleware, no gateways, no scheduler).
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';
import { CoreDataModule } from '../../database/core-data.module';
import { LegacyDataDbModule } from '../../database/legacy-data-db/legacy-data-db.module';
import { SharedModule } from '../../shared/shared.module';
import { ReportsModule } from '../../modules/reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    CoreDataModule,
    LegacyDataDbModule,
    SharedModule,
    ReportsModule,
  ],
})
export class WorkerAppModule {}

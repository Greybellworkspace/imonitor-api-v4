import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LegacyDataDbService } from './legacy-data-db.service';
import { MYSQL_POOL_DEFAULTS, mysqlTypeCast } from '../database.constants';

export const LEGACY_DATA_DB = 'LEGACY_DATA_DB';
export const LEGACY_DATA_LIMITED_DB = 'LEGACY_DATA_LIMITED_DB';

@Global()
@Module({
  providers: [
    {
      provide: LEGACY_DATA_DB,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const mysql = await import('mysql2/promise');
        return mysql.createPool({
          host: configService.get<string>('DB_HOST'),
          user: configService.get<string>('DB_USER'),
          password: configService.get<string>('DB_PASSWORD'),
          port: configService.get<number>('DB_PORT'),
          database: configService.get<string>('dataDbName', 'iMonitorData').replace(/`/g, ''),
          decimalNumbers: true,
          multipleStatements: true,
          ...MYSQL_POOL_DEFAULTS,
          typeCast: mysqlTypeCast,
        });
      },
    },
    {
      provide: LEGACY_DATA_LIMITED_DB,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const mysql = await import('mysql2/promise');
        return mysql.createPool({
          host: configService.get<string>('DB_HOST'),
          user: configService.get<string>('DB_LIMIT_USER'),
          password: configService.get<string>('DB_LIMIT_PASSWORD'),
          port: configService.get<number>('DB_PORT'),
          database: configService.get<string>('dataDbName', 'iMonitorData').replace(/`/g, ''),
          decimalNumbers: true,
          ...MYSQL_POOL_DEFAULTS,
          typeCast: mysqlTypeCast,
        });
      },
    },
    LegacyDataDbService,
  ],
  exports: [LegacyDataDbService, LEGACY_DATA_DB, LEGACY_DATA_LIMITED_DB],
})
export class LegacyDataDbModule {}

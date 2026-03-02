import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CoreSysConfig } from '../../database/entities/core-sys-config.entity';

@Injectable()
export class SystemConfigService {
  private static readonly VALID_SETTING_COLUMNS = new Set([
    'reportSetting',
    'selfAnalysisSetting',
    'widgetBuilderSetting',
    'dashboardSetting',
    'generalSetting',
    'operationSettings',
  ]);

  constructor(
    @InjectRepository(CoreSysConfig)
    private readonly sysConfigRepo: Repository<CoreSysConfig>,
  ) {}

  async getConfigValue(key: string): Promise<string | null> {
    const row = await this.sysConfigRepo.findOne({ where: { confKey: key } });
    return row?.confVal ?? null;
  }

  async getConfigValues(keys: string[]): Promise<Record<string, string>> {
    const rows = await this.sysConfigRepo.find({ where: { confKey: In(keys) } });
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.confKey] = row.confVal;
    }
    return result;
  }

  async getSettingsByColumn(columnName: string): Promise<CoreSysConfig[]> {
    if (!SystemConfigService.VALID_SETTING_COLUMNS.has(columnName)) {
      return [];
    }
    return this.sysConfigRepo.createQueryBuilder('config').where(`config.${columnName} = :val`, { val: 1 }).getMany();
  }
}

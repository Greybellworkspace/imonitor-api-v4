import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CoreModulesTables } from '../../database/entities/core-modules-tables.entity';
import { CoreTablesField } from '../../database/entities/core-tables-field.entity';
import { CoreParamsTableRelations } from '../../database/entities/core-params-table-relations.entity';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { CoreApplicationRoles } from '../../database/entities/core-application-roles.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { EncryptionHelperService } from '../../shared/services/encryption-helper.service';
import { ExportHelperService } from '../../shared/services/export-helper.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { DynamicTableService } from '../../shared/services/dynamic-table.service';

@Injectable()
export class NodeDefinitionService extends DynamicTableService {
  protected readonly tableType = 'nodes';

  constructor(
    @InjectRepository(CoreModulesTables)
    tablesRepo: Repository<CoreModulesTables>,
    @InjectRepository(CoreTablesField)
    fieldsRepo: Repository<CoreTablesField>,
    @InjectRepository(CoreParamsTableRelations)
    relationsRepo: Repository<CoreParamsTableRelations>,
    @InjectRepository(CorePrivileges)
    privilegesRepo: Repository<CorePrivileges>,
    @InjectRepository(CoreApplicationRoles)
    rolesRepo: Repository<CoreApplicationRoles>,
    legacyDataDbService: LegacyDataDbService,
    systemConfigService: SystemConfigService,
    encryptionHelperService: EncryptionHelperService,
    exportHelperService: ExportHelperService,
    dateHelperService: DateHelperService,
    configService: ConfigService,
  ) {
    super(
      tablesRepo,
      fieldsRepo,
      relationsRepo,
      privilegesRepo,
      rolesRepo,
      legacyDataDbService,
      systemConfigService,
      encryptionHelperService,
      exportHelperService,
      dateHelperService,
      configService,
    );
  }
}

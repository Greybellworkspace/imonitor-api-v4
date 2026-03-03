import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreApplicationUsers } from './entities/core-application-users.entity';
import { CoreApplicationRoles } from './entities/core-application-roles.entity';
import { CoreApplicationRefreshToken } from './entities/core-application-refresh-token.entity';
import { CorePrivileges } from './entities/core-privileges.entity';
import { CoreModules } from './entities/core-modules.entity';
import { CoreMinimumPrivileges } from './entities/core-minimum-privileges.entity';
import { CoreModulesTables } from './entities/core-modules-tables.entity';
import { CoreTablesField } from './entities/core-tables-field.entity';
import { CoreParamsTableRelations } from './entities/core-params-table-relations.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CoreApplicationUsers,
      CoreApplicationRoles,
      CoreApplicationRefreshToken,
      CorePrivileges,
      CoreModules,
      CoreMinimumPrivileges,
      CoreModulesTables,
      CoreTablesField,
      CoreParamsTableRelations,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class CoreDataModule {}

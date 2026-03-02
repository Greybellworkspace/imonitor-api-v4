import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreApplicationUsers } from '../../database/entities/core-application-users.entity';
import { CoreApplicationRoles } from '../../database/entities/core-application-roles.entity';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { CoreModules } from '../../database/entities/core-modules.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CoreApplicationUsers, CoreApplicationRoles, CorePrivileges, CoreModules])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

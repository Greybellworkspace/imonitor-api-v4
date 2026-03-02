import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreApplicationUsers } from '../../database/entities/core-application-users.entity';
import { CoreApplicationRoles } from '../../database/entities/core-application-roles.entity';
import { CoreApplicationRefreshToken } from '../../database/entities/core-application-refresh-token.entity';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { CoreModules } from '../../database/entities/core-modules.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CoreApplicationUsers,
      CoreApplicationRoles,
      CoreApplicationRefreshToken,
      CorePrivileges,
      CoreModules,
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthEndpointsModule {}

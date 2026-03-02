import { Module } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PrivilegeGuard } from './guards/privilege.guard';
import { ApiKeyGuard } from './guards/api-key.guard';

@Module({
  providers: [JwtAuthGuard, RolesGuard, PrivilegeGuard, ApiKeyGuard],
  exports: [JwtAuthGuard, RolesGuard, PrivilegeGuard, ApiKeyGuard],
})
export class AuthModule {}

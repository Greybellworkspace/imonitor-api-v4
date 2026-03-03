import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreSysConfig } from '../database/entities/core-sys-config.entity';
import { DateHelperService } from './services/date-helper.service';
import { EncryptionHelperService } from './services/encryption-helper.service';
import { ExportHelperService } from './services/export-helper.service';
import { PasswordService } from './services/password.service';
import { SystemConfigService } from './services/system-config.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([CoreSysConfig])],
  providers: [DateHelperService, EncryptionHelperService, ExportHelperService, PasswordService, SystemConfigService],
  exports: [DateHelperService, EncryptionHelperService, ExportHelperService, PasswordService, SystemConfigService],
})
export class SharedModule {}

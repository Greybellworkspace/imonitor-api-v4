import { Injectable } from '@nestjs/common';
import { SystemConfigService } from './system-config.service';

@Injectable()
export class EncryptionHelperService {
  private cachedKey: string | null = null;

  constructor(private readonly systemConfigService: SystemConfigService) {}

  /** Get the AES encryption key from sys_config (cached after first call) */
  async getEncryptionKey(): Promise<string> {
    if (this.cachedKey) return this.cachedKey;
    const key = await this.systemConfigService.getConfigValue('aesEncryptionKey');
    if (!key) throw new Error('AES encryption key not found in core_sys_config');
    this.cachedKey = key;
    return key;
  }

  /** Generate SQL fragment for AES_DECRYPT - used in SELECT columns */
  decryptExpression(column: string, alias: string): string {
    return `AES_DECRYPT(\`${column}\`, ?) AS \`${alias}\``;
  }

  /** Generate SQL fragment for AES_ENCRYPT - used in INSERT/UPDATE values */
  encryptExpression(column: string): string {
    return `\`${column}\` = AES_ENCRYPT(?, ?)`;
  }
}

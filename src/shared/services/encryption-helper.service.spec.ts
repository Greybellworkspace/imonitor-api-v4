import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionHelperService } from './encryption-helper.service';
import { SystemConfigService } from './system-config.service';

describe('EncryptionHelperService', () => {
  let service: EncryptionHelperService;
  let systemConfigService: any;

  async function buildModule(): Promise<void> {
    systemConfigService = {
      getConfigValue: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [EncryptionHelperService, { provide: SystemConfigService, useValue: systemConfigService }],
    }).compile();

    service = module.get<EncryptionHelperService>(EncryptionHelperService);
  }

  beforeEach(async () => {
    await buildModule();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── getEncryptionKey ──────────────────────────────────────────────────────

  describe('getEncryptionKey', () => {
    it('should call SystemConfigService and return the encryption key', async () => {
      systemConfigService.getConfigValue.mockResolvedValue('my-aes-key-123');

      const key = await service.getEncryptionKey();

      expect(key).toBe('my-aes-key-123');
      expect(systemConfigService.getConfigValue).toHaveBeenCalledWith('aesEncryptionKey');
      expect(systemConfigService.getConfigValue).toHaveBeenCalledTimes(1);
    });

    it('should cache the key and not call SystemConfigService on subsequent calls', async () => {
      systemConfigService.getConfigValue.mockResolvedValue('cached-key');

      const first = await service.getEncryptionKey();
      const second = await service.getEncryptionKey();

      expect(first).toBe('cached-key');
      expect(second).toBe('cached-key');
      expect(systemConfigService.getConfigValue).toHaveBeenCalledTimes(1);
    });

    it('should throw an Error when the key is not found in sys_config', async () => {
      systemConfigService.getConfigValue.mockResolvedValue(null);

      await expect(service.getEncryptionKey()).rejects.toThrow('AES encryption key not found in core_sys_config');
    });

    it('should throw an Error when the key is empty string', async () => {
      systemConfigService.getConfigValue.mockResolvedValue('');

      await expect(service.getEncryptionKey()).rejects.toThrow('AES encryption key not found in core_sys_config');
    });
  });

  // ─── decryptExpression ─────────────────────────────────────────────────────

  describe('decryptExpression', () => {
    it('should return correct AES_DECRYPT SQL fragment', () => {
      const result = service.decryptExpression('gui_pass', 'password');

      expect(result).toBe('AES_DECRYPT(`gui_pass`, ?) AS `password`');
    });

    it('should handle different column and alias names', () => {
      const result = service.decryptExpression('sftp_password', 'sftpPass');

      expect(result).toBe('AES_DECRYPT(`sftp_password`, ?) AS `sftpPass`');
    });
  });

  // ─── encryptExpression ─────────────────────────────────────────────────────

  describe('encryptExpression', () => {
    it('should return correct AES_ENCRYPT SQL fragment', () => {
      const result = service.encryptExpression('gui_pass');

      expect(result).toBe('`gui_pass` = AES_ENCRYPT(?, ?)');
    });

    it('should handle different column names', () => {
      const result = service.encryptExpression('sftp_password');

      expect(result).toBe('`sftp_password` = AES_ENCRYPT(?, ?)');
    });
  });
});

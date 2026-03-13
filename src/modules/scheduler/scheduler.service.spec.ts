import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { CoreAutomatedReport } from '../../database/entities/core-automated-report.entity';
import { CoreAutomatedReportCleaning } from '../../database/entities/core-automated-report-cleaning.entity';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import * as childProcess from 'child_process';

// Ensure isTestEnv() returns true in all tests so cron logic bypasses the guard
// (tests only verify conditional dispatch logic by temporarily clearing NODE_ENV)

const AR_ID = 'ar-001';
const REPORT_ID = 'report-001';
const OWNER_ID = 'user-001';

describe('SchedulerService', () => {
  let service: SchedulerService;
  let arRepo: jest.Mocked<{
    find: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  }>;
  let arCleaningRepo: jest.Mocked<{
    create: jest.Mock;
    save: jest.Mock;
  }>;
  let systemConfig: jest.Mocked<SystemConfigService>;
  let legacyDataDb: jest.Mocked<LegacyDataDbService>;
  let schedulerRegistry: jest.Mocked<SchedulerRegistry>;
  let forkSpy: jest.SpyInstance;

  const mockWorkerProcess = {
    send: jest.fn(),
    on: jest.fn(),
  };

  beforeEach(async () => {
    arRepo = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockResolvedValue({}),
    };
    arCleaningRepo = {
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockResolvedValue({}),
    };
    systemConfig = {
      getConfigValue: jest.fn().mockResolvedValue(null),
      getConfigValues: jest.fn().mockResolvedValue({}),
      getSettingsByColumn: jest.fn().mockResolvedValue([]),
    } as any;
    legacyDataDb = {
      query: jest.fn().mockResolvedValue([]),
    } as any;
    schedulerRegistry = {
      addCronJob: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        { provide: getRepositoryToken(CoreAutomatedReport), useValue: arRepo },
        { provide: getRepositoryToken(CoreAutomatedReportCleaning), useValue: arCleaningRepo },
        { provide: SystemConfigService, useValue: systemConfig },
        { provide: LegacyDataDbService, useValue: legacyDataDb },
        { provide: SchedulerRegistry, useValue: schedulerRegistry },
      ],
    }).compile();

    service = module.get<SchedulerService>(SchedulerService);

    // Mock child_process.fork to avoid actual process spawning
    forkSpy = jest.spyOn(childProcess, 'fork').mockReturnValue(mockWorkerProcess as any);
    mockWorkerProcess.send.mockClear();
    mockWorkerProcess.on.mockClear();
  });

  afterEach(() => {
    forkSpy.mockRestore();
  });

  // ─── onModuleInit ─────────────────────────────────────────────────────────

  describe('onModuleInit', () => {
    it('skips initialization in test environment', async () => {
      // NODE_ENV is 'test' by default in Jest
      await service.onModuleInit();
      expect(schedulerRegistry.addCronJob).not.toHaveBeenCalled();
    });
  });

  // ─── initRequestArchiveCleanupCron ────────────────────────────────────────

  describe('initRequestArchiveCleanupCron', () => {
    it('registers a cron job using the sys_config value', async () => {
      systemConfig.getConfigValue.mockResolvedValue('0 2 * * *');
      await service.initRequestArchiveCleanupCron();
      expect(schedulerRegistry.addCronJob).toHaveBeenCalledWith(
        'requestArchiveCleanup',
        expect.objectContaining({ start: expect.any(Function) }),
      );
    });

    it('falls back to default cron expression when sys_config returns null', async () => {
      systemConfig.getConfigValue.mockResolvedValue(null);
      await service.initRequestArchiveCleanupCron();
      expect(schedulerRegistry.addCronJob).toHaveBeenCalledWith('requestArchiveCleanup', expect.anything());
    });
  });

  // ─── runAutomatedReports ──────────────────────────────────────────────────

  describe('runAutomatedReports', () => {
    it('does nothing in test environment', async () => {
      await service.runAutomatedReports();
      expect(arRepo.find).not.toHaveBeenCalled();
    });

    it('skips reports whose firstOccurence is in the future', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const futureDate = new Date(Date.now() + 60_000);
      arRepo.find.mockResolvedValue([
        { id: AR_ID, reportId: REPORT_ID, ownerId: OWNER_ID, firstOccurence: futureDate },
      ]);

      await service.runAutomatedReports();

      expect(arRepo.update).not.toHaveBeenCalled();
      expect(forkSpy).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
    });

    it('forks worker for pending AR records with past firstOccurence', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const pastDate = new Date(Date.now() - 60_000);
      arRepo.find.mockResolvedValue([
        {
          id: AR_ID,
          reportId: REPORT_ID,
          ownerId: OWNER_ID,
          firstOccurence: pastDate,
          title: 'Test AR',
          timeFilter: 'daily',
          method: 'email',
          exportType: 'csv',
          reportHourInterval: 0,
          reportDayInterval: 1,
          relativeHour: 0,
          relativeDay: 0,
          emailSubject: '',
          emailDescription: '',
        },
      ]);

      await service.runAutomatedReports();

      expect(arRepo.update).toHaveBeenCalledWith(
        { id: AR_ID },
        expect.objectContaining({ processId: expect.any(String) }),
      );
      expect(forkSpy).toHaveBeenCalledWith(
        expect.stringContaining('automatedReport.worker.js'),
        [],
        expect.objectContaining({ env: expect.any(Object) }),
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('forks worker for AR records with null firstOccurence', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      arRepo.find.mockResolvedValue([{ id: AR_ID, reportId: REPORT_ID, ownerId: OWNER_ID, firstOccurence: null }]);

      await service.runAutomatedReports();

      expect(forkSpy).toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
    });

    it('logs error and returns when repo.find throws', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      arRepo.find.mockRejectedValue(new Error('DB error'));

      await expect(service.runAutomatedReports()).resolves.not.toThrow();

      process.env.NODE_ENV = originalEnv;
    });
  });

  // ─── runRetentionCleaning ─────────────────────────────────────────────────

  describe('runRetentionCleaning', () => {
    it('does nothing in test environment', async () => {
      await service.runRetentionCleaning();
      expect(forkSpy).not.toHaveBeenCalled();
    });

    it('forks retention cleaning worker with retentionDays from config', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      systemConfig.getConfigValue.mockResolvedValue('60');
      await service.runRetentionCleaning();

      expect(forkSpy).toHaveBeenCalledWith(
        expect.stringContaining('automatedReportRetentionCleaning.worker.js'),
        [],
        expect.anything(),
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('uses default 30 days when config returns null', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      systemConfig.getConfigValue.mockResolvedValue(null);
      await service.runRetentionCleaning();

      expect(forkSpy).toHaveBeenCalled();
      const sentData = JSON.parse(mockWorkerProcess.send.mock.calls[0][0]);
      expect(sentData.retentionDays).toBe(30);

      process.env.NODE_ENV = originalEnv;
    });
  });

  // ─── runScheduledBulkProcess ──────────────────────────────────────────────

  describe('runScheduledBulkProcess', () => {
    it('does nothing in test environment', () => {
      service.runScheduledBulkProcess();
      expect(forkSpy).not.toHaveBeenCalled();
    });

    it('forks scheduledBulkProcess worker in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      service.runScheduledBulkProcess();

      expect(forkSpy).toHaveBeenCalledWith(
        expect.stringContaining('scheduledBulkProcess.worker.js'),
        [],
        expect.anything(),
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  // ─── runRequestArchiveCleanup ─────────────────────────────────────────────

  describe('runRequestArchiveCleanup', () => {
    it('does nothing in test environment', async () => {
      await service.runRequestArchiveCleanup();
      expect(forkSpy).not.toHaveBeenCalled();
    });

    it('forks requestArchiveCleanup worker in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      await service.runRequestArchiveCleanup();

      expect(forkSpy).toHaveBeenCalledWith(
        expect.stringContaining('requestArchiveCleanup.worker.js'),
        [],
        expect.anything(),
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  // ─── runRequestArchiveRetention ───────────────────────────────────────────

  describe('runRequestArchiveRetention', () => {
    it('does nothing in test environment', () => {
      service.runRequestArchiveRetention();
      expect(forkSpy).not.toHaveBeenCalled();
    });

    it('forks databaseRetentionCleanup worker in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      service.runRequestArchiveRetention();

      expect(forkSpy).toHaveBeenCalledWith(
        expect.stringContaining('databaseRetentionCleanup.worker.js'),
        [],
        expect.anything(),
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  // ─── runObservabilityAlarms ───────────────────────────────────────────────

  describe('runObservabilityAlarms', () => {
    it('does nothing in test environment', () => {
      service.runObservabilityAlarms();
      expect(forkSpy).not.toHaveBeenCalled();
    });

    it('forks observabilityAlarms worker in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      service.runObservabilityAlarms();

      expect(forkSpy).toHaveBeenCalledWith(
        expect.stringContaining('observabilityAlarms.worker.js'),
        [],
        expect.anything(),
      );

      process.env.NODE_ENV = originalEnv;
    });
  });
});

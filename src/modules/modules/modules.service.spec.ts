import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { ModulesService } from './modules.service';
import { CoreModules } from '../../database/entities/core-modules.entity';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { CoreApplicationRoles } from '../../database/entities/core-application-roles.entity';
import { CoreReport } from '../../database/entities/core-report.entity';
import { CoreReportModule } from '../../database/entities/core-report-module.entity';
import { CoreWidgetBuilder } from '../../database/entities/core-widget-builder.entity';
import { CoreWidgetBuilderModule } from '../../database/entities/core-widget-builder-module.entity';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockQueryBuilder(result: any) {
  return {
    select: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(result),
    getRawMany: jest.fn().mockResolvedValue(result),
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('ModulesService', () => {
  let service: ModulesService;
  let modulesRepo: any;
  let privilegesRepo: any;
  let rolesRepo: any;
  let reportRepo: any;
  let reportModuleRepo: any;
  let widgetBuilderRepo: any;
  let widgetBuilderModuleRepo: any;

  beforeEach(async () => {
    modulesRepo = {
      createQueryBuilder: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    privilegesRepo = { find: jest.fn(), findOne: jest.fn() };
    rolesRepo = { find: jest.fn(), findOne: jest.fn() };
    reportRepo = {
      createQueryBuilder: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    reportModuleRepo = { find: jest.fn(), findOne: jest.fn() };
    widgetBuilderRepo = {
      createQueryBuilder: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    widgetBuilderModuleRepo = { find: jest.fn(), findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModulesService,
        { provide: getRepositoryToken(CoreModules), useValue: modulesRepo },
        { provide: getRepositoryToken(CorePrivileges), useValue: privilegesRepo },
        { provide: getRepositoryToken(CoreApplicationRoles), useValue: rolesRepo },
        { provide: getRepositoryToken(CoreReport), useValue: reportRepo },
        { provide: getRepositoryToken(CoreReportModule), useValue: reportModuleRepo },
        { provide: getRepositoryToken(CoreWidgetBuilder), useValue: widgetBuilderRepo },
        { provide: getRepositoryToken(CoreWidgetBuilderModule), useValue: widgetBuilderModuleRepo },
      ],
    }).compile();

    service = module.get<ModulesService>(ModulesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** Mock privilege access for module-level access checks [S-09] */
  function mockModuleAccess() {
    rolesRepo.findOne.mockResolvedValue({ id: 'na-role-id' });
    privilegesRepo.findOne.mockResolvedValue({ id: 'priv-1' }); // user has access
  }

  // ─── getModulesWithReports ──────────────────────────────────────────────────

  describe('getModulesWithReports', () => {
    it('should return modules with reports filtered by user privileges', async () => {
      const modules = [
        { id: 'mod-1', name: 'Module A' },
        { id: 'mod-2', name: 'Module B' },
      ];
      const qb = createMockQueryBuilder(modules);
      modulesRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getModulesWithReports('user-1');

      expect(result).toEqual([
        { id: 'mod-1', name: 'Module A' },
        { id: 'mod-2', name: 'Module B' },
      ]);
      expect(modulesRepo.createQueryBuilder).toHaveBeenCalledWith('cm');
      expect(qb.select).toHaveBeenCalledWith(['cm.id', 'cm.name']);
      expect(qb.innerJoin).toHaveBeenCalledTimes(3);
      expect(qb.groupBy).toHaveBeenCalledWith('cm.id');
      expect(qb.orderBy).toHaveBeenCalledWith('cm.name', 'ASC');
    });

    it('should return empty array when no data exists', async () => {
      const qb = createMockQueryBuilder([]);
      modulesRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getModulesWithReports('user-1');

      expect(result).toEqual([]);
    });

    it('should filter out users with default (N/A) role', async () => {
      const qb = createMockQueryBuilder([]);
      modulesRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getModulesWithReports('user-1');

      // The third innerJoin should filter out N/A role
      const innerJoinCalls = qb.innerJoin.mock.calls;
      const roleJoinCall = innerJoinCalls.find((call: any[]) => String(call[1]) === 'car');
      expect(roleJoinCall).toBeDefined();
      expect(roleJoinCall![2]).toContain('car.name <> :defaultRole');
      expect(roleJoinCall![3]).toEqual({ defaultRole: 'N/A' });
    });
  });

  // ─── getModulesWithWidgetBuilders ───────────────────────────────────────────

  describe('getModulesWithWidgetBuilders', () => {
    it('should return modules with widget builders filtered by user privileges', async () => {
      const modules = [{ id: 'mod-3', name: 'Module C' }];
      const qb = createMockQueryBuilder(modules);
      modulesRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getModulesWithWidgetBuilders('user-2');

      expect(result).toEqual([{ id: 'mod-3', name: 'Module C' }]);
      expect(qb.innerJoin).toHaveBeenCalledTimes(3);
      expect(qb.groupBy).toHaveBeenCalledWith('cm.id');
      expect(qb.orderBy).toHaveBeenCalledWith('cm.name', 'ASC');
    });

    it('should return empty array when no data exists', async () => {
      const qb = createMockQueryBuilder([]);
      modulesRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getModulesWithWidgetBuilders('user-2');

      expect(result).toEqual([]);
    });

    it('should join on CoreWidgetBuilderModule instead of CoreReportModule', async () => {
      const qb = createMockQueryBuilder([]);
      modulesRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getModulesWithWidgetBuilders('user-1');

      // The second innerJoin should be for widget builder module
      const innerJoinCalls = qb.innerJoin.mock.calls;
      const wbmJoinCall = innerJoinCalls.find((call: any[]) => String(call[1]) === 'wbm');
      expect(wbmJoinCall).toBeDefined();
    });
  });

  // ─── getReportsByModuleId ───────────────────────────────────────────────────

  describe('getReportsByModuleId', () => {
    it('should return reports for a given module ID when user has access', async () => {
      mockModuleAccess();
      const reports = [
        {
          id: 'r-1',
          name: 'Report A',
          isFavorite: false,
          isDefault: true,
          ownerId: 'user-1',
          createdAt: new Date('2026-01-01'),
        },
      ];
      const qb = createMockQueryBuilder(reports);
      reportRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getReportsByModuleId('mod-1', 'user-1');

      expect(result).toEqual([
        {
          id: 'r-1',
          name: 'Report A',
          isFavorite: false,
          isDefault: true,
          ownerId: 'user-1',
          createdAt: new Date('2026-01-01'),
        },
      ]);
      expect(reportRepo.createQueryBuilder).toHaveBeenCalledWith('r');
      expect(qb.where).toHaveBeenCalledWith('rm.moduleId = :moduleId', { moduleId: 'mod-1' });
      expect(qb.orderBy).toHaveBeenCalledWith('r.name', 'ASC');
    });

    it('should throw ForbiddenException when user lacks module access', async () => {
      rolesRepo.findOne.mockResolvedValue({ id: 'na-role-id' });
      privilegesRepo.findOne.mockResolvedValue(null); // no access

      await expect(service.getReportsByModuleId('mod-1', 'user-no-access')).rejects.toThrow(ForbiddenException);
    });

    it('should return empty array when no reports exist for module', async () => {
      mockModuleAccess();
      const qb = createMockQueryBuilder([]);
      reportRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getReportsByModuleId('mod-nonexistent', 'user-1');

      expect(result).toEqual([]);
    });

    it('should select the correct report fields', async () => {
      mockModuleAccess();
      const qb = createMockQueryBuilder([]);
      reportRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getReportsByModuleId('mod-1', 'user-1');

      expect(qb.select).toHaveBeenCalledWith([
        'r.id',
        'r.name',
        'r.isFavorite',
        'r.isDefault',
        'r.ownerId',
        'r.createdAt',
      ]);
    });
  });

  // ─── getWidgetBuildersByModuleId ────────────────────────────────────────────

  describe('getWidgetBuildersByModuleId', () => {
    it('should return widget builders for a given module ID when user has access', async () => {
      mockModuleAccess();
      const widgetBuilders = [
        {
          id: 'wb-1',
          name: 'Widget A',
          isFavorite: true,
          isDefault: false,
          ownerId: 'user-2',
          createdAt: new Date('2026-02-01'),
        },
      ];
      const qb = createMockQueryBuilder(widgetBuilders);
      widgetBuilderRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getWidgetBuildersByModuleId('mod-2', 'user-2');

      expect(result).toEqual([
        {
          id: 'wb-1',
          name: 'Widget A',
          isFavorite: true,
          isDefault: false,
          ownerId: 'user-2',
          createdAt: new Date('2026-02-01'),
        },
      ]);
      expect(widgetBuilderRepo.createQueryBuilder).toHaveBeenCalledWith('wb');
      expect(qb.where).toHaveBeenCalledWith('wbm.moduleId = :moduleId', { moduleId: 'mod-2' });
      expect(qb.orderBy).toHaveBeenCalledWith('wb.name', 'ASC');
    });

    it('should throw ForbiddenException when user lacks module access', async () => {
      rolesRepo.findOne.mockResolvedValue({ id: 'na-role-id' });
      privilegesRepo.findOne.mockResolvedValue(null); // no access

      await expect(service.getWidgetBuildersByModuleId('mod-2', 'user-no-access')).rejects.toThrow(ForbiddenException);
    });

    it('should return empty array when no widget builders exist for module', async () => {
      mockModuleAccess();
      const qb = createMockQueryBuilder([]);
      widgetBuilderRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getWidgetBuildersByModuleId('mod-nonexistent', 'user-1');

      expect(result).toEqual([]);
    });

    it('should select the correct widget builder fields', async () => {
      mockModuleAccess();
      const qb = createMockQueryBuilder([]);
      widgetBuilderRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getWidgetBuildersByModuleId('mod-1', 'user-1');

      expect(qb.select).toHaveBeenCalledWith([
        'wb.id',
        'wb.name',
        'wb.isFavorite',
        'wb.isDefault',
        'wb.ownerId',
        'wb.createdAt',
      ]);
    });
  });
});

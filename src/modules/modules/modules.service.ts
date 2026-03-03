import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { CoreModules } from '../../database/entities/core-modules.entity';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { CoreApplicationRoles } from '../../database/entities/core-application-roles.entity';
import { CoreReport } from '../../database/entities/core-report.entity';
import { CoreReportModule } from '../../database/entities/core-report-module.entity';
import { CoreWidgetBuilder } from '../../database/entities/core-widget-builder.entity';
import { CoreWidgetBuilderModule } from '../../database/entities/core-widget-builder-module.entity';
import { AvailableRoles } from '../../shared/enums/roles.enum';
import { ModuleListItemDto } from './dto/module-list-item.dto';
import { ReportListItemDto } from './dto/report-list-item.dto';
import { WidgetBuilderListItemDto } from './dto/widget-builder-list-item.dto';

@Injectable()
export class ModulesService {
  private readonly logger = new Logger(ModulesService.name);

  /** Cached default role ID ("N/A") [P-03] */
  private cachedDefaultRoleId: string | null = null;

  constructor(
    @InjectRepository(CoreModules)
    private readonly modulesRepo: Repository<CoreModules>,
    @InjectRepository(CorePrivileges)
    private readonly privilegesRepo: Repository<CorePrivileges>,
    @InjectRepository(CoreApplicationRoles)
    private readonly rolesRepo: Repository<CoreApplicationRoles>,
    @InjectRepository(CoreReport)
    private readonly reportRepo: Repository<CoreReport>,
    @InjectRepository(CoreReportModule)
    private readonly reportModuleRepo: Repository<CoreReportModule>,
    @InjectRepository(CoreWidgetBuilder)
    private readonly widgetBuilderRepo: Repository<CoreWidgetBuilder>,
    @InjectRepository(CoreWidgetBuilderModule)
    private readonly widgetBuilderModuleRepo: Repository<CoreWidgetBuilderModule>,
  ) {}

  // ─── Get Modules With Reports ──────────────────────────────────────────

  /**
   * Returns modules that have at least one report, filtered by user privileges.
   * Replicates v3 usersService.getAdminModulesReport query.
   */
  async getModulesWithReports(userId: string): Promise<ModuleListItemDto[]> {
    const modules = await this.modulesRepo
      .createQueryBuilder('cm')
      .select(['cm.id', 'cm.name'])
      .innerJoin(CorePrivileges, 'cp', 'cm.id = cp.ModuleId AND cp.UserId = :userId', { userId })
      .innerJoin(CoreReportModule, 'rm', 'cm.id = rm.moduleId')
      .innerJoin(CoreApplicationRoles, 'car', 'cp.RoleId = car.id AND car.name <> :defaultRole', {
        defaultRole: AvailableRoles.DEFAULT,
      })
      .groupBy('cm.id')
      .orderBy('cm.name', 'ASC')
      .getMany();

    return modules.map((m) => ({
      id: m.id,
      name: m.name,
    }));
  }

  // ─── Get Modules With Widget Builders ──────────────────────────────────

  /**
   * Returns modules that have at least one widget builder, filtered by user privileges.
   * Same pattern as getModulesWithReports but joins core_widget_builder_module.
   */
  async getModulesWithWidgetBuilders(userId: string): Promise<ModuleListItemDto[]> {
    const modules = await this.modulesRepo
      .createQueryBuilder('cm')
      .select(['cm.id', 'cm.name'])
      .innerJoin(CorePrivileges, 'cp', 'cm.id = cp.ModuleId AND cp.UserId = :userId', { userId })
      .innerJoin(CoreWidgetBuilderModule, 'wbm', 'cm.id = wbm.moduleId')
      .innerJoin(CoreApplicationRoles, 'car', 'cp.RoleId = car.id AND car.name <> :defaultRole', {
        defaultRole: AvailableRoles.DEFAULT,
      })
      .groupBy('cm.id')
      .orderBy('cm.name', 'ASC')
      .getMany();

    return modules.map((m) => ({
      id: m.id,
      name: m.name,
    }));
  }

  // ─── Get Reports By Module ID ──────────────────────────────────────────

  /**
   * Returns reports for a specific module.
   * Replicates v3 reportService.getReportByModuleId query.
   * [S-09] Verifies user has access to the module before returning reports.
   */
  async getReportsByModuleId(moduleId: string, userId: string): Promise<ReportListItemDto[]> {
    await this.verifyModuleAccess(moduleId, userId);

    const reports = await this.reportRepo
      .createQueryBuilder('r')
      .select(['r.id', 'r.name', 'r.isFavorite', 'r.isDefault', 'r.ownerId', 'r.createdAt'])
      .innerJoin(CoreReportModule, 'rm', 'r.id = rm.reportId')
      .where('rm.moduleId = :moduleId', { moduleId })
      .orderBy('r.name', 'ASC')
      .getMany();

    return reports.map((r) => ({
      id: r.id,
      name: r.name,
      isFavorite: r.isFavorite,
      isDefault: r.isDefault,
      ownerId: r.ownerId,
      createdAt: r.createdAt,
    }));
  }

  // ─── Get Widget Builders By Module ID ──────────────────────────────────

  /**
   * Returns widget builders for a specific module.
   * Same pattern as getReportsByModuleId but for widget builders.
   * [S-09] Verifies user has access to the module before returning widget builders.
   */
  async getWidgetBuildersByModuleId(moduleId: string, userId: string): Promise<WidgetBuilderListItemDto[]> {
    await this.verifyModuleAccess(moduleId, userId);

    const widgetBuilders = await this.widgetBuilderRepo
      .createQueryBuilder('wb')
      .select(['wb.id', 'wb.name', 'wb.isFavorite', 'wb.isDefault', 'wb.ownerId', 'wb.createdAt'])
      .innerJoin(CoreWidgetBuilderModule, 'wbm', 'wb.id = wbm.widgetBuilderId')
      .where('wbm.moduleId = :moduleId', { moduleId })
      .orderBy('wb.name', 'ASC')
      .getMany();

    return widgetBuilders.map((wb) => ({
      id: wb.id,
      name: wb.name,
      isFavorite: wb.isFavorite,
      isDefault: wb.isDefault,
      ownerId: wb.ownerId,
      createdAt: wb.createdAt,
    }));
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  /**
   * Get and cache the default role ID ("N/A") [P-03].
   */
  private async getDefaultRoleId(): Promise<string> {
    if (this.cachedDefaultRoleId !== null) return this.cachedDefaultRoleId;
    const defaultRole = await this.rolesRepo.findOne({
      where: { name: 'N/A' },
      select: { id: true },
    });
    this.cachedDefaultRoleId = defaultRole?.id ?? '';
    return this.cachedDefaultRoleId;
  }

  /**
   * Verify that a user has access to a specific module [S-09].
   * Throws ForbiddenException if user lacks access.
   */
  private async verifyModuleAccess(moduleId: string, userId: string): Promise<void> {
    const defaultRoleId = await this.getDefaultRoleId();
    const hasAccess = await this.privilegesRepo.findOne({
      where: { userId, moduleId: Number(moduleId), roleId: Not(defaultRoleId) },
      select: { id: true },
    });
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this module');
    }
  }
}

import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { ModulesService } from './modules.service';
import { ModuleListItemDto, ReportListItemDto, WidgetBuilderListItemDto } from './dto';

@ApiTags('Modules')
@ApiBearerAuth('JWT')
@UseGuards(PrivilegeGuard)
@Controller('api/v1/modules')
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) {}

  @Get('reports')
  @ApiOperation({ summary: 'Get modules that have reports (filtered by user privileges)' })
  @ApiResponse({ status: 200, description: 'List of modules with reports', type: [ModuleListItemDto] })
  async getModulesWithReports(@CurrentUser('id') userId: string) {
    const result = await this.modulesService.getModulesWithReports(userId);
    return { result };
  }

  @Get('widgetbuilders')
  @ApiOperation({ summary: 'Get modules that have widget builders (filtered by user privileges)' })
  @ApiResponse({ status: 200, description: 'List of modules with widget builders', type: [ModuleListItemDto] })
  async getModulesWithWidgetBuilders(@CurrentUser('id') userId: string) {
    const result = await this.modulesService.getModulesWithWidgetBuilders(userId);
    return { result };
  }

  @Get(':id/report')
  @ApiOperation({ summary: 'Get reports for a specific module' })
  @ApiParam({ name: 'id', description: 'Module ID' })
  @ApiResponse({ status: 200, description: 'List of reports for the module', type: [ReportListItemDto] })
  async getReportsByModule(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const result = await this.modulesService.getReportsByModuleId(id, userId);
    return { result };
  }

  @Get(':id/widgetbuilder')
  @ApiOperation({ summary: 'Get widget builders for a specific module' })
  @ApiParam({ name: 'id', description: 'Module ID' })
  @ApiResponse({ status: 200, description: 'List of widget builders for the module', type: [WidgetBuilderListItemDto] })
  async getWidgetBuildersByModule(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const result = await this.modulesService.getWidgetBuildersByModuleId(id, userId);
    return { result };
  }
}

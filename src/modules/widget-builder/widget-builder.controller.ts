import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { ChartTypes } from '../reports/enums';
import { WidgetBuilderService } from './widget-builder.service';
import {
  SaveWidgetBuilderDto,
  EditWidgetBuilderDto,
  RenameWidgetBuilderDto,
  ChangeWbOwnerDto,
  ShareWidgetBuilderDto,
  GenerateWidgetBuilderDto,
  GenerateWbChartDto,
  GenerateChartByTypeDto,
} from './dto';

@ApiTags('WidgetBuilder')
@ApiBearerAuth()
@UseGuards(PrivilegeGuard)
@Controller('api/v1/widgetbuilder')
export class WidgetBuilderController {
  constructor(private readonly widgetBuilderService: WidgetBuilderService) {}

  // --- Named GET routes first (before :id wildcard) ---

  @Get('privileges/tables')
  @ApiOperation({ summary: 'Get privileged statistic tables for widget builder side menu' })
  @ApiResponse({ status: 200, description: 'Privileged tables returned' })
  getPrivilegedTables(@CurrentUser('id') userId: string) {
    return this.widgetBuilderService.privilegedStatisticTables(userId);
  }

  @Get()
  @ApiOperation({ summary: 'List current user widget builders' })
  @ApiResponse({ status: 200, description: 'Widget builders list returned' })
  list(@CurrentUser('id') userId: string) {
    return this.widgetBuilderService.list(userId);
  }

  @Get('shared/:id')
  @ApiOperation({ summary: 'Get shared widget builder by ID' })
  @ApiResponse({ status: 200, description: 'Shared widget builder returned' })
  getSharedById(@Param('id') id: string) {
    return this.widgetBuilderService.getSharedById(id);
  }

  @Get('access/:id')
  @ApiOperation({ summary: 'Check user access to widget builder' })
  @ApiResponse({ status: 200, description: 'Access check result returned' })
  access(@Param('id') widgetBuilderId: string, @CurrentUser('id') userId: string) {
    return this.widgetBuilderService.hasAccess(widgetBuilderId, userId);
  }

  @Get('closetab/:wbId/:chartId')
  @ApiOperation({ summary: 'Close/delete a widget builder chart tab' })
  @ApiResponse({ status: 200, description: 'Chart tab closed' })
  closeTab(@Param('wbId') wbId: string, @Param('chartId') chartId: string) {
    return this.widgetBuilderService.closeTab(wbId, chartId);
  }

  // --- Wildcard :id routes LAST ---

  @Get(':id')
  @ApiOperation({ summary: 'Get widget builder by ID' })
  @ApiResponse({ status: 200, description: 'Widget builder returned' })
  getById(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.widgetBuilderService.getById(id, userId);
  }

  // --- Mutation routes (POST/PUT/DELETE) ---

  @Post()
  @ApiOperation({ summary: 'Create a new widget builder' })
  @ApiResponse({ status: 201, description: 'Widget builder created' })
  save(@Body() dto: SaveWidgetBuilderDto, @CurrentUser('id') userId: string) {
    return this.widgetBuilderService.save(dto, userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an existing widget builder' })
  @ApiResponse({ status: 200, description: 'Widget builder updated' })
  update(@Body() dto: EditWidgetBuilderDto, @CurrentUser('id') userId: string) {
    return this.widgetBuilderService.update(dto, userId);
  }

  @Put('rename')
  @ApiOperation({ summary: 'Rename a widget builder' })
  @ApiResponse({ status: 200, description: 'Widget builder renamed' })
  rename(@Body() dto: RenameWidgetBuilderDto, @CurrentUser('id') userId: string) {
    return this.widgetBuilderService.rename(dto, userId);
  }

  @Put('favorite/:id')
  @ApiOperation({ summary: 'Toggle widget builder favorite status' })
  @ApiResponse({ status: 200, description: 'Favorite status toggled' })
  favorite(@Param('id') id: string, @Query('isShared') isShared: string) {
    return this.widgetBuilderService.favorite(id, isShared === 'true');
  }

  @Put('transfer/ownership')
  @ApiOperation({ summary: 'Transfer widget builder ownership' })
  @ApiResponse({ status: 200, description: 'Ownership transferred' })
  changeOwner(@Body() dto: ChangeWbOwnerDto, @CurrentUser('id') userId: string) {
    return this.widgetBuilderService.changeOwner(dto, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a widget builder' })
  @ApiResponse({ status: 200, description: 'Widget builder deleted' })
  deleteWidgetBuilder(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.widgetBuilderService.delete(userId, id);
  }

  @Post(':id/share')
  @ApiOperation({ summary: 'Share widget builder with users' })
  @ApiResponse({ status: 201, description: 'Widget builder shared' })
  share(@Param('id') id: string, @Body() dto: ShareWidgetBuilderDto) {
    return this.widgetBuilderService.share(id, dto);
  }

  @Post('shared/:id')
  @ApiOperation({ summary: 'Save a shared widget builder as own' })
  @ApiResponse({ status: 201, description: 'Shared widget builder saved as own' })
  saveSharedWidgetBuilder(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.widgetBuilderService.saveSharedWidgetBuilder(id, userId);
  }

  // --- Chart Generation Endpoints ---

  @Post('generate/tabular')
  @ApiOperation({ summary: 'Execute widget builder query (tabular data)' })
  @ApiResponse({ status: 201, description: 'Query executed, tabular result returned' })
  executeQuery(@Body() dto: GenerateWidgetBuilderDto) {
    return this.widgetBuilderService.executeQuery(dto);
  }

  @Post('generate/chartbytype')
  @ApiOperation({ summary: 'Generate chart by type from saved widget builder' })
  @ApiResponse({ status: 201, description: 'Chart generated from saved config' })
  generateChartByType(@Body() dto: GenerateChartByTypeDto) {
    return this.widgetBuilderService.generateChartByType(dto);
  }

  @Post('generate/pie')
  @ApiOperation({ summary: 'Generate pie chart' })
  @ApiResponse({ status: 201, description: 'Pie chart generated' })
  pie(@Body() dto: GenerateWbChartDto) {
    return this.widgetBuilderService.dispatchChart(ChartTypes.PIE, dto.tabular, dto.chart);
  }

  @Post('generate/doughnut')
  @ApiOperation({ summary: 'Generate doughnut chart' })
  @ApiResponse({ status: 201, description: 'Doughnut chart generated' })
  doughnut(@Body() dto: GenerateWbChartDto) {
    return this.widgetBuilderService.dispatchChart(ChartTypes.DOUGHNUT, dto.tabular, dto.chart);
  }

  @Post('generate/bar/vertical')
  @ApiOperation({ summary: 'Generate vertical bar chart' })
  @ApiResponse({ status: 201, description: 'Vertical bar chart generated' })
  verticalBar(@Body() dto: GenerateWbChartDto) {
    return this.widgetBuilderService.dispatchChart(ChartTypes.VERTICAL_BAR, dto.tabular, dto.chart);
  }

  @Post('generate/bar/horizontal')
  @ApiOperation({ summary: 'Generate horizontal bar chart' })
  @ApiResponse({ status: 201, description: 'Horizontal bar chart generated' })
  horizontalBar(@Body() dto: GenerateWbChartDto) {
    return this.widgetBuilderService.dispatchChart(ChartTypes.HORIZONTAL_BAR, dto.tabular, dto.chart);
  }

  @Post('generate/progress')
  @ApiOperation({ summary: 'Generate progress gauge chart' })
  @ApiResponse({ status: 201, description: 'Progress chart generated' })
  progress(@Body() dto: GenerateWbChartDto) {
    return this.widgetBuilderService.dispatchChart(ChartTypes.PROGRESS, dto.tabular, dto.chart);
  }

  @Post('generate/progress/exploded')
  @ApiOperation({ summary: 'Generate exploded progress gauge chart' })
  @ApiResponse({ status: 201, description: 'Exploded progress chart generated' })
  explodedProgress(@Body() dto: GenerateWbChartDto) {
    return this.widgetBuilderService.dispatchChart(ChartTypes.EXPLODED_PROGRESS, dto.tabular, dto.chart);
  }

  @Post('generate/counter')
  @ApiOperation({ summary: 'Generate counter chart' })
  @ApiResponse({ status: 201, description: 'Counter chart generated' })
  counter(@Body() dto: GenerateWbChartDto) {
    return this.widgetBuilderService.dispatchChart(ChartTypes.COUNTER, dto.tabular, dto.chart);
  }

  @Post('generate/counter/exploded')
  @ApiOperation({ summary: 'Generate exploded counter chart' })
  @ApiResponse({ status: 201, description: 'Exploded counter chart generated' })
  explodedCounter(@Body() dto: GenerateWbChartDto) {
    return this.widgetBuilderService.dispatchChart(ChartTypes.EXPLODED_COUNTER, dto.tabular, dto.chart);
  }

  @Post('generate/percentage')
  @ApiOperation({ summary: 'Generate percentage chart' })
  @ApiResponse({ status: 201, description: 'Percentage chart generated' })
  percentage(@Body() dto: GenerateWbChartDto) {
    return this.widgetBuilderService.dispatchChart(ChartTypes.PERCENTAGE, dto.tabular, dto.chart);
  }

  @Post('generate/percentage/exploded')
  @ApiOperation({ summary: 'Generate exploded percentage chart' })
  @ApiResponse({ status: 201, description: 'Exploded percentage chart generated' })
  explodedPercentage(@Body() dto: GenerateWbChartDto) {
    return this.widgetBuilderService.dispatchChart(ChartTypes.EXPLODED_PERCENTAGE, dto.tabular, dto.chart);
  }

  @Post('generate/trend')
  @ApiOperation({ summary: 'Generate widget builder trend chart' })
  @ApiResponse({ status: 201, description: 'Trend chart generated' })
  trend(@Body() dto: GenerateWbChartDto) {
    return this.widgetBuilderService.dispatchChart(ChartTypes.WIDGET_BUILDER_TREND, dto.tabular, dto.chart);
  }

  @Post('generate/trend/compare')
  @ApiOperation({ summary: 'Generate compare trend chart' })
  @ApiResponse({ status: 201, description: 'Compare trend chart generated' })
  compareTrend(@Body() dto: GenerateWbChartDto) {
    return this.widgetBuilderService.dispatchChart(ChartTypes.COMPARE_TREND, dto.tabular, dto.chart);
  }

  @Post('generate/bar/solo')
  @ApiOperation({ summary: 'Generate solo bar chart' })
  @ApiResponse({ status: 201, description: 'Solo bar chart generated' })
  soloBar(@Body() dto: GenerateWbChartDto) {
    return this.widgetBuilderService.dispatchChart(ChartTypes.SOLO_BAR, dto.tabular, dto.chart);
  }

  @Post('generate/bar/top')
  @ApiOperation({ summary: 'Generate top/least bar chart' })
  @ApiResponse({ status: 201, description: 'Top bar chart generated' })
  topBar(@Body() dto: GenerateWbChartDto) {
    return this.widgetBuilderService.dispatchChart(ChartTypes.TOP_LEAST_BAR, dto.tabular, dto.chart);
  }

  @Post('generate/table')
  @ApiOperation({ summary: 'Generate tabular chart' })
  @ApiResponse({ status: 201, description: 'Tabular chart generated' })
  tabularChart(@Body() dto: GenerateWbChartDto) {
    return this.widgetBuilderService.dispatchChart(ChartTypes.TABULAR, dto.tabular, dto.chart);
  }

  @Post('generate/table/topleast')
  @ApiOperation({ summary: 'Generate top/least table chart' })
  @ApiResponse({ status: 201, description: 'Top/least table generated' })
  topLeastTable(@Body() dto: GenerateWbChartDto) {
    return this.widgetBuilderService.dispatchChart(ChartTypes.TOP_LEAST_TABULAR, dto.tabular, dto.chart);
  }

  @Post('generate/table/cumulative')
  @ApiOperation({ summary: 'Generate cumulative table chart' })
  @ApiResponse({ status: 201, description: 'Cumulative table generated' })
  cumulativeTable(@Body() dto: GenerateWbChartDto) {
    return this.widgetBuilderService.dispatchChart(ChartTypes.CUMULATIVE_TABLE, dto.tabular, dto.chart);
  }
}

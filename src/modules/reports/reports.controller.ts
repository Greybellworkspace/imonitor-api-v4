import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { ReportsService } from './reports.service';
import {
  SaveReportDto,
  EditReportDto,
  RenameReportDto,
  ChangeReportOwnerDto,
  ShareReportDto,
  GenerateReportDto,
  GenerateChartByTypeDto,
  ExportReportParamsDto,
  ExportTabParamsDto,
} from './dto';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(PrivilegeGuard)
@Controller('api/v1/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // --- CRUD & Sharing ---

  @Get('privileges/tables')
  @ApiOperation({ summary: 'Get privileged statistic tables for side menu' })
  @ApiResponse({ status: 200, description: 'Privileged tables returned' })
  getPrivilegedTables(@CurrentUser('id') userId: string) {
    return this.reportsService.privilegedStatisticTables(userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get current user reports list' })
  @ApiResponse({ status: 200, description: 'Reports list returned' })
  userReports(@CurrentUser('id') userId: string) {
    return this.reportsService.list(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get report by ID' })
  @ApiResponse({ status: 200, description: 'Report returned' })
  getReportById(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.reportsService.getReportById(id, userId);
  }

  @Get('shared/:id')
  @ApiOperation({ summary: 'Get shared report by ID' })
  @ApiResponse({ status: 200, description: 'Shared report returned' })
  getSharedReportById(@Param('id') id: string) {
    return this.reportsService.getSharedReportById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new report' })
  @ApiResponse({ status: 201, description: 'Report created' })
  save(@Body() dto: SaveReportDto, @CurrentUser('id') userId: string) {
    return this.reportsService.save(dto, userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an existing report' })
  @ApiResponse({ status: 200, description: 'Report updated' })
  update(@Body() dto: EditReportDto, @CurrentUser('id') userId: string) {
    return this.reportsService.update(dto, userId);
  }

  @Put('rename')
  @ApiOperation({ summary: 'Rename a report' })
  @ApiResponse({ status: 200, description: 'Report renamed' })
  rename(@Body() dto: RenameReportDto, @CurrentUser('id') userId: string) {
    return this.reportsService.rename(dto, userId);
  }

  @Put('favorite/:id')
  @ApiOperation({ summary: 'Toggle report favorite status' })
  @ApiResponse({ status: 200, description: 'Favorite status toggled' })
  favorite(@Param('id') id: string, @Query('isShared') isShared: string) {
    return this.reportsService.favorite(id, isShared === 'true');
  }

  @Put('transfer/ownership')
  @ApiOperation({ summary: 'Transfer report ownership' })
  @ApiResponse({ status: 200, description: 'Ownership transferred' })
  changeReportOwner(@Body() dto: ChangeReportOwnerDto, @CurrentUser('id') userId: string) {
    return this.reportsService.changeReportOwner(dto, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a report' })
  @ApiResponse({ status: 200, description: 'Report deleted' })
  deleteReport(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.reportsService.deleteReport(userId, id);
  }

  @Post(':id/share')
  @ApiOperation({ summary: 'Share report with users' })
  @ApiResponse({ status: 201, description: 'Report shared' })
  shareReport(@Param('id') id: string, @Body() dto: ShareReportDto) {
    return this.reportsService.share(id, dto);
  }

  @Post('shared/:id')
  @ApiOperation({ summary: 'Save a shared report as own' })
  @ApiResponse({ status: 201, description: 'Shared report saved as own' })
  saveSharedReport(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.reportsService.saveSharedReport(id, userId);
  }

  @Get('closetab/:reportId/:chartId')
  @ApiOperation({ summary: 'Close/delete a report chart tab' })
  @ApiResponse({ status: 200, description: 'Chart tab closed' })
  closeTab(@Param('reportId') reportId: string, @Param('chartId') chartId: string) {
    return this.reportsService.closeTab(reportId, chartId);
  }

  // --- Chart Generation ---

  @Post('generate/tabular')
  @ApiOperation({ summary: 'Generate tabular report data' })
  @ApiResponse({ status: 200, description: 'Tabular data returned' })
  tabular(@Body() dto: GenerateReportDto) {
    return this.reportsService.executeQuery(dto);
  }

  @Post('generate/query')
  @ApiOperation({ summary: 'Generate SQL query without executing' })
  @ApiResponse({ status: 200, description: 'SQL query returned' })
  generatedQuery(@Body() dto: GenerateReportDto) {
    return this.reportsService.generatedQuery(dto);
  }

  @Post('generate/pie')
  @ApiOperation({ summary: 'Generate pie chart' })
  @ApiResponse({ status: 200, description: 'Pie chart data returned' })
  pie(@Body() dto: GenerateReportDto, @CurrentUser('id') userId: string) {
    return this.reportsService.generatePie(dto, userId);
  }

  @Post('generate/doughnut')
  @ApiOperation({ summary: 'Generate doughnut chart' })
  @ApiResponse({ status: 200, description: 'Doughnut chart data returned' })
  doughnut(@Body() dto: GenerateReportDto, @CurrentUser('id') userId: string) {
    return this.reportsService.generateDoughnut(dto, userId);
  }

  @Post('generate/trend')
  @ApiOperation({ summary: 'Generate trend chart' })
  @ApiResponse({ status: 200, description: 'Trend chart data returned' })
  trend(@Body() dto: GenerateReportDto, @CurrentUser('id') userId: string) {
    return this.reportsService.generateTrend(dto, userId);
  }

  @Post('generate/bar/vertical')
  @ApiOperation({ summary: 'Generate vertical bar chart' })
  @ApiResponse({ status: 200, description: 'Vertical bar chart data returned' })
  verticalChart(@Body() dto: GenerateReportDto, @CurrentUser('id') userId: string) {
    return this.reportsService.generateVerticalBar(dto, userId);
  }

  @Post('generate/bar/horizontal')
  @ApiOperation({ summary: 'Generate horizontal bar chart' })
  @ApiResponse({ status: 200, description: 'Horizontal bar chart data returned' })
  horizontalChart(@Body() dto: GenerateReportDto, @CurrentUser('id') userId: string) {
    return this.reportsService.generateHorizontalBar(dto, userId);
  }

  @Post('generate/progress')
  @ApiOperation({ summary: 'Generate progress chart' })
  @ApiResponse({ status: 200, description: 'Progress chart data returned' })
  progress(@Body() dto: GenerateReportDto, @CurrentUser('id') userId: string) {
    return this.reportsService.generateProgress(dto, userId);
  }

  @Post('generate/progress/exploded')
  @ApiOperation({ summary: 'Generate exploded progress chart' })
  @ApiResponse({ status: 200, description: 'Exploded progress chart data returned' })
  explodedProgress(@Body() dto: GenerateReportDto, @CurrentUser('id') userId: string) {
    return this.reportsService.generateExplodedProgress(dto, userId);
  }

  @Post('dataanalysis/chart')
  @ApiOperation({ summary: 'Generate chart by type for data analysis' })
  @ApiResponse({ status: 200, description: 'Chart data returned' })
  generateChartByType(@Body() dto: GenerateChartByTypeDto, @CurrentUser('id') userId: string) {
    return this.reportsService.generateChartByType(dto, userId);
  }

  // --- Export (full report) ---

  @Get('export/csv/:reportId/:status/:fromdate/:todate/:interval')
  @ApiOperation({ summary: 'Export report to CSV' })
  @ApiResponse({ status: 200, description: 'CSV file path returned' })
  exportTableCSV(@Param() params: ExportReportParamsDto, @CurrentUser('id') userId: string) {
    return this.reportsService.exportCSV(
      params.reportId,
      params.status,
      params.fromdate,
      params.todate,
      params.interval,
      userId,
    );
  }

  @Get('export/json/:reportId/:status/:fromdate/:todate/:interval')
  @ApiOperation({ summary: 'Export report to JSON' })
  @ApiResponse({ status: 200, description: 'JSON file path returned' })
  exportTableJSON(@Param() params: ExportReportParamsDto, @CurrentUser('id') userId: string) {
    return this.reportsService.exportJSON(
      params.reportId,
      params.status,
      params.fromdate,
      params.todate,
      params.interval,
      userId,
    );
  }

  @Get('export/html/:reportId/:status/:fromdate/:todate/:interval')
  @ApiOperation({ summary: 'Export report to HTML' })
  @ApiResponse({ status: 200, description: 'HTML file path returned' })
  exportReportHTML(@Param() params: ExportReportParamsDto, @CurrentUser('id') userId: string) {
    return this.reportsService.exportHTML(
      params.reportId,
      params.status,
      params.fromdate,
      params.todate,
      params.interval,
      userId,
    );
  }

  @Get('export/pdf/:reportId/:status/:fromdate/:todate/:interval')
  @ApiOperation({ summary: 'Export report to PDF' })
  @ApiResponse({ status: 200, description: 'PDF file path returned' })
  exportReportPDF(@Param() params: ExportReportParamsDto, @CurrentUser('id') userId: string) {
    return this.reportsService.exportPDF(
      params.reportId,
      params.status,
      params.fromdate,
      params.todate,
      params.interval,
      userId,
    );
  }

  @Get('export/png/:reportId/:status/:fromdate/:todate/:interval')
  @ApiOperation({ summary: 'Export report to PNG' })
  @ApiResponse({ status: 200, description: 'PNG file path returned' })
  exportReportPNG(@Param() params: ExportReportParamsDto, @CurrentUser('id') userId: string) {
    return this.reportsService.exportPNG(
      params.reportId,
      params.status,
      params.fromdate,
      params.todate,
      params.interval,
      userId,
    );
  }

  @Get('export/jpeg/:reportId/:status/:fromdate/:todate/:interval')
  @ApiOperation({ summary: 'Export report to JPEG' })
  @ApiResponse({ status: 200, description: 'JPEG file path returned' })
  exportReportJPEG(@Param() params: ExportReportParamsDto, @CurrentUser('id') userId: string) {
    return this.reportsService.exportJPEG(
      params.reportId,
      params.status,
      params.fromdate,
      params.todate,
      params.interval,
      userId,
    );
  }

  @Get('export/excel/:reportId/:status/:fromdate/:todate/:interval')
  @ApiOperation({ summary: 'Export report to Excel' })
  @ApiResponse({ status: 200, description: 'Excel file path returned' })
  exportExcel(@Param() params: ExportReportParamsDto, @CurrentUser('id') userId: string) {
    return this.reportsService.exportExcel(
      params.reportId,
      params.status,
      params.fromdate,
      params.todate,
      params.interval,
      userId,
    );
  }

  // --- Export (per tab) ---

  @Get('export/tab/html/:reportId/:status/:chartId/:fromdate/:todate/:interval')
  @ApiOperation({ summary: 'Export chart tab to HTML' })
  @ApiResponse({ status: 200, description: 'HTML file path returned' })
  exportTabHTML(@Param() params: ExportTabParamsDto, @CurrentUser('id') userId: string) {
    return this.reportsService.exportTabHTML(
      params.reportId,
      params.status,
      params.chartId,
      params.fromdate,
      params.todate,
      params.interval,
      userId,
    );
  }

  @Get('export/tab/pdf/:reportId/:status/:chartId/:fromdate/:todate/:interval')
  @ApiOperation({ summary: 'Export chart tab to PDF' })
  @ApiResponse({ status: 200, description: 'PDF file path returned' })
  exportTabPDF(@Param() params: ExportTabParamsDto, @CurrentUser('id') userId: string) {
    return this.reportsService.exportTabPDF(
      params.reportId,
      params.status,
      params.chartId,
      params.fromdate,
      params.todate,
      params.interval,
      userId,
    );
  }

  @Get('export/tab/png/:reportId/:status/:chartId/:fromdate/:todate/:interval')
  @ApiOperation({ summary: 'Export chart tab to PNG' })
  @ApiResponse({ status: 200, description: 'PNG file path returned' })
  exportTabPNG(@Param() params: ExportTabParamsDto, @CurrentUser('id') userId: string) {
    return this.reportsService.exportTabPNG(
      params.reportId,
      params.status,
      params.chartId,
      params.fromdate,
      params.todate,
      params.interval,
      userId,
    );
  }

  @Get('export/tab/jpeg/:reportId/:status/:chartId/:fromdate/:todate/:interval')
  @ApiOperation({ summary: 'Export chart tab to JPEG' })
  @ApiResponse({ status: 200, description: 'JPEG file path returned' })
  exportTabJPEG(@Param() params: ExportTabParamsDto, @CurrentUser('id') userId: string) {
    return this.reportsService.exportTabJPEG(
      params.reportId,
      params.status,
      params.chartId,
      params.fromdate,
      params.todate,
      params.interval,
      userId,
    );
  }
}

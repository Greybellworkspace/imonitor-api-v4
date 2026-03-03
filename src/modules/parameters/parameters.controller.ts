import { Controller, Get, Post, Put, Param, Body, UseGuards, Res, StreamableFile } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { basename } from 'path';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { ParametersService } from './parameters.service';
import { DynamicTableInsertDto, DynamicTableListItemDto } from '../../shared/dto/dynamic-table.dto';
import { TabularObjectDto } from '../../shared/dto/tabular.dto';

@ApiTags('Parameters')
@ApiBearerAuth('JWT')
@UseGuards(PrivilegeGuard)
@Controller('api/v1/paramstable')
export class ParametersController {
  constructor(private readonly parametersService: ParametersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all parameter tables accessible by the current user' })
  @ApiResponse({ status: 200, description: 'List of parameter tables', type: [DynamicTableListItemDto] })
  async getAllTables(@CurrentUser('id') userId: string) {
    const result = await this.parametersService.getAllTables(userId);
    return { result };
  }

  @Get('export/excel')
  @ApiOperation({ summary: 'Export all parameter tables to Excel' })
  @ApiResponse({ status: 200, description: 'Excel file download' })
  async exportAllToExcel(
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const filePath = await this.parametersService.exportAllToExcel(userId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${basename(filePath)}"`,
    });
    return new StreamableFile(createReadStream(filePath));
  }

  @Get('export/excel/:id')
  @ApiOperation({ summary: 'Export a single parameter table to Excel' })
  @ApiParam({ name: 'id', description: 'Table ID' })
  @ApiResponse({ status: 200, description: 'Excel file download' })
  async exportTableToExcel(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const filePath = await this.parametersService.exportTableToExcel(id, userId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${basename(filePath)}"`,
    });
    return new StreamableFile(createReadStream(filePath));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get parameter table details (header + data)' })
  @ApiParam({ name: 'id', description: 'Table ID' })
  @ApiResponse({ status: 200, description: 'Table header and data rows', type: TabularObjectDto })
  async getTableDetails(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const result = await this.parametersService.getTableDetails(id, userId);
    return { result };
  }

  @Post()
  @ApiOperation({ summary: 'Insert a new record into a parameter table' })
  @ApiResponse({ status: 201, description: 'Record inserted successfully' })
  async insertRecord(@Body() body: DynamicTableInsertDto, @CurrentUser('id') userId: string) {
    await this.parametersService.insertRecord(body, userId);
    return { result: null };
  }

  @Put()
  @ApiOperation({ summary: 'Update records in parameter tables' })
  @ApiResponse({ status: 200, description: 'Records updated successfully' })
  async updateRecords(@Body() body: Record<string, unknown[]>, @CurrentUser('id') userId: string) {
    await this.parametersService.updateRecords(body, userId);
    return { result: null };
  }
}

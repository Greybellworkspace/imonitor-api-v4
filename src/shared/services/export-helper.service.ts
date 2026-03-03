import { Injectable, Logger } from '@nestjs/common';
import { join } from 'path';
import * as ExcelJS from 'exceljs';
import { ensureDirCreation } from '../helpers/common.helper';

export interface ExcelSheet {
  name: string;
  header: { text: string; datafield: string }[];
  body: Record<string, unknown>[];
}

@Injectable()
export class ExportHelperService {
  private readonly logger = new Logger(ExportHelperService.name);
  private readonly exportDir = join(process.cwd(), 'assets', 'exports');

  async exportTabularToExcel(sheets: ExcelSheet[]): Promise<string> {
    await ensureDirCreation(this.exportDir);

    const workbook = new ExcelJS.Workbook();
    for (const sheet of sheets) {
      const worksheet = workbook.addWorksheet(sheet.name.substring(0, 31)); // Excel 31 char limit

      // Header row
      const headerRow = sheet.header.map((h) => h.text);
      const row = worksheet.addRow(headerRow);
      row.font = { bold: true };

      // Data rows
      for (const record of sheet.body) {
        const dataRow = sheet.header.map((h) => {
          const val = record[h.datafield];
          return val === null || val === undefined ? '' : val;
        });
        worksheet.addRow(dataRow);
      }

      // Auto-width columns
      worksheet.columns.forEach((col) => {
        let maxLength = 10;
        col.eachCell?.({ includeEmpty: true }, (cell) => {
          const cellLength = cell.value ? String(cell.value).length : 0;
          if (cellLength > maxLength) maxLength = cellLength;
        });
        col.width = Math.min(maxLength + 2, 50);
      });
    }

    const fileName = `export_${Date.now()}.xlsx`;
    const filePath = join(this.exportDir, fileName);
    await workbook.xlsx.writeFile(filePath);
    this.logger.log(`Excel exported: ${filePath}`);
    return filePath;
  }
}

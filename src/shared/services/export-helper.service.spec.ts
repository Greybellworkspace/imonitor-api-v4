import { Test, TestingModule } from '@nestjs/testing';
import { ExportHelperService, ExcelSheet } from './export-helper.service';

// ─── ExcelJS Mock ────────────────────────────────────────────────────────────

const mockColumns: Array<{
  eachCell?: (opts: unknown, cb: (cell: { value: unknown }) => void) => void;
  width?: number;
}> = [];

const mockWorksheet = {
  addRow: jest.fn().mockReturnValue({ font: {} }),
  columns: mockColumns,
};

const mockWorkbook = {
  addWorksheet: jest.fn().mockReturnValue(mockWorksheet),
  xlsx: {
    writeFile: jest.fn().mockResolvedValue(undefined),
  },
};

jest.mock('exceljs', () => ({
  Workbook: jest.fn().mockImplementation(() => mockWorkbook),
}));

jest.mock('../helpers/common.helper', () => ({
  ...jest.requireActual('../helpers/common.helper'),
  ensureDirCreation: jest.fn().mockResolvedValue(undefined),
}));

describe('ExportHelperService', () => {
  let service: ExportHelperService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset worksheet columns mock
    mockWorksheet.columns.length = 0;
    mockWorksheet.addRow.mockReturnValue({ font: {} });

    const module: TestingModule = await Test.createTestingModule({
      providers: [ExportHelperService],
    }).compile();

    service = module.get<ExportHelperService>(ExportHelperService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── exportTabularToExcel ──────────────────────────────────────────────────

  describe('exportTabularToExcel', () => {
    it('should create an Excel file and return the file path', async () => {
      const sheets: ExcelSheet[] = [
        {
          name: 'TestSheet',
          header: [
            { text: 'Name', datafield: 'name' },
            { text: 'Value', datafield: 'value' },
          ],
          body: [
            { name: 'Row1', value: 100 },
            { name: 'Row2', value: 200 },
          ],
        },
      ];

      const result = await service.exportTabularToExcel(sheets);

      expect(result).toMatch(/export_\d+\.xlsx$/);
      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('TestSheet');
      // Header row + 2 data rows = 3 addRow calls
      expect(mockWorksheet.addRow).toHaveBeenCalledTimes(3);
      expect(mockWorksheet.addRow).toHaveBeenCalledWith(['Name', 'Value']);
      expect(mockWorksheet.addRow).toHaveBeenCalledWith(['Row1', 100]);
      expect(mockWorksheet.addRow).toHaveBeenCalledWith(['Row2', 200]);
      expect(mockWorkbook.xlsx.writeFile).toHaveBeenCalledTimes(1);
    });

    it('should handle empty sheets array', async () => {
      const result = await service.exportTabularToExcel([]);

      expect(result).toMatch(/export_\d+\.xlsx$/);
      expect(mockWorkbook.addWorksheet).not.toHaveBeenCalled();
      expect(mockWorkbook.xlsx.writeFile).toHaveBeenCalledTimes(1);
    });

    it('should truncate sheet names longer than 31 characters', async () => {
      const longName = 'A'.repeat(50);
      const sheets: ExcelSheet[] = [
        {
          name: longName,
          header: [{ text: 'Col', datafield: 'col' }],
          body: [],
        },
      ];

      await service.exportTabularToExcel(sheets);

      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('A'.repeat(31));
    });

    it('should replace null/undefined values with empty strings in body', async () => {
      const sheets: ExcelSheet[] = [
        {
          name: 'NullTest',
          header: [
            { text: 'A', datafield: 'a' },
            { text: 'B', datafield: 'b' },
          ],
          body: [{ a: null, b: undefined }],
        },
      ];

      await service.exportTabularToExcel(sheets);

      // Header row + 1 data row
      expect(mockWorksheet.addRow).toHaveBeenCalledWith(['', '']);
    });

    it('should handle multiple sheets', async () => {
      const sheets: ExcelSheet[] = [
        {
          name: 'Sheet1',
          header: [{ text: 'X', datafield: 'x' }],
          body: [{ x: 1 }],
        },
        {
          name: 'Sheet2',
          header: [{ text: 'Y', datafield: 'y' }],
          body: [{ y: 2 }],
        },
      ];

      await service.exportTabularToExcel(sheets);

      expect(mockWorkbook.addWorksheet).toHaveBeenCalledTimes(2);
      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('Sheet1');
      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('Sheet2');
    });

    it('should set bold font on the header row', async () => {
      const headerRowObj: Record<string, unknown> = {};
      mockWorksheet.addRow.mockReturnValueOnce(headerRowObj);

      const sheets: ExcelSheet[] = [
        {
          name: 'FontTest',
          header: [{ text: 'Col', datafield: 'col' }],
          body: [],
        },
      ];

      await service.exportTabularToExcel(sheets);

      // The source code sets row.font = { bold: true } on the first addRow result
      expect(headerRowObj.font).toEqual({ bold: true });
    });
  });
});

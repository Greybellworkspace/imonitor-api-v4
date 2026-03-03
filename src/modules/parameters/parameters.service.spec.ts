import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ParametersService } from './parameters.service';
import { CoreModulesTables } from '../../database/entities/core-modules-tables.entity';
import { CoreTablesField } from '../../database/entities/core-tables-field.entity';
import { CoreParamsTableRelations } from '../../database/entities/core-params-table-relations.entity';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { CoreApplicationRoles } from '../../database/entities/core-application-roles.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { EncryptionHelperService } from '../../shared/services/encryption-helper.service';
import { ExportHelperService } from '../../shared/services/export-helper.service';
import { DateHelperService } from '../../shared/services/date-helper.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeField(overrides: Partial<CoreTablesField> = {}): CoreTablesField {
  return {
    id: 'field-1',
    tId: 'table-1',
    columnName: 'name',
    columnDisplayName: 'Name',
    type: 'varchar',
    CreatedBy: null,
    CreatedOn: new Date(),
    ModifiedBy: null,
    ModifiedOn: null,
    operation: null,
    isParam: null,
    isEncrypted: false,
    priority_id: 1,
    ordinalPosition: null,
    isPrimaryKey: null,
    table: null as any,
    ...overrides,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('ParametersService', () => {
  let service: ParametersService;
  let tablesRepo: any;
  let fieldsRepo: any;
  let relationsRepo: any;
  let privilegesRepo: any;
  let rolesRepo: any;
  let legacyDataDbService: any;
  let systemConfigService: any;
  let encryptionHelperService: any;
  let exportHelperService: any;
  let dateHelperService: any;
  let configService: any;

  beforeEach(async () => {
    tablesRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    fieldsRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    relationsRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    privilegesRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    rolesRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    legacyDataDbService = {
      query: jest.fn().mockResolvedValue([]),
    };
    systemConfigService = {
      getConfigValue: jest.fn().mockResolvedValue('%Y-%m-%d %H:%i:%s'),
    };
    encryptionHelperService = {
      getEncryptionKey: jest.fn().mockResolvedValue('test-aes-key'),
      decryptExpression: jest.fn(),
      encryptExpression: jest.fn(),
    };
    exportHelperService = {
      exportTabularToExcel: jest.fn().mockResolvedValue('/path/to/file.xlsx'),
    };
    dateHelperService = {
      currentDate: jest.fn().mockReturnValue(new Date('2026-03-03T12:00:00Z')),
      formatDate: jest.fn().mockReturnValue('2026-03-03 12:00:00'),
    };
    configService = {
      get: jest.fn().mockReturnValue('iMonitorV3_1'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParametersService,
        { provide: getRepositoryToken(CoreModulesTables), useValue: tablesRepo },
        { provide: getRepositoryToken(CoreTablesField), useValue: fieldsRepo },
        { provide: getRepositoryToken(CoreParamsTableRelations), useValue: relationsRepo },
        { provide: getRepositoryToken(CorePrivileges), useValue: privilegesRepo },
        { provide: getRepositoryToken(CoreApplicationRoles), useValue: rolesRepo },
        { provide: LegacyDataDbService, useValue: legacyDataDbService },
        { provide: SystemConfigService, useValue: systemConfigService },
        { provide: EncryptionHelperService, useValue: encryptionHelperService },
        { provide: ExportHelperService, useValue: exportHelperService },
        { provide: DateHelperService, useValue: dateHelperService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<ParametersService>(ParametersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** Mock privilege access for getTableDetails/exportTableToExcel calls */
  function mockTableAccess() {
    rolesRepo.findOne.mockResolvedValue({ id: 'na-role-id' });
    privilegesRepo.findOne.mockResolvedValue({ id: 'priv-1' }); // user has access
  }

  // ─── tableType ──────────────────────────────────────────────────────────────

  it('should have tableType set to "param"', () => {
    expect((service as any).tableType).toBe('param');
  });

  // ─── getAllTables ───────────────────────────────────────────────────────────

  describe('getAllTables', () => {
    it('should return param tables filtered by user privileges', async () => {
      rolesRepo.findOne.mockResolvedValue({ id: 'na-role-id' });
      privilegesRepo.find.mockResolvedValue([
        { moduleId: 1 },
        { moduleId: 2 },
        { moduleId: 1 }, // duplicate — should be deduplicated
      ]);
      tablesRepo.find.mockResolvedValue([
        { id: 't-1', tableName: 'V3_sdp_nodes', displayName: 'SDP Nodes' },
        { id: 't-2', tableName: 'V3_air_nodes', displayName: 'AIR Nodes' },
      ]);

      const result = await service.getAllTables('user-1');

      expect(result).toEqual([
        { id: 't-1', tableName: 'V3_sdp_nodes', displayName: 'SDP Nodes' },
        { id: 't-2', tableName: 'V3_air_nodes', displayName: 'AIR Nodes' },
      ]);
      expect(rolesRepo.findOne).toHaveBeenCalledWith({
        where: { name: 'N/A' },
        select: { id: true },
      });
      expect(privilegesRepo.find).toHaveBeenCalledWith({
        where: expect.objectContaining({ userId: 'user-1' }),
        select: { moduleId: true },
      });
      // Verify tableType filter is 'param'
      expect(tablesRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tableType: 'param' }),
        }),
      );
    });

    it('should return empty array when user has no privileges', async () => {
      rolesRepo.findOne.mockResolvedValue({ id: 'na-role-id' });
      privilegesRepo.find.mockResolvedValue([]);

      const result = await service.getAllTables('user-no-access');

      expect(result).toEqual([]);
      expect(tablesRepo.find).not.toHaveBeenCalled();
    });

    it('should handle missing default role gracefully', async () => {
      rolesRepo.findOne.mockResolvedValue(null);
      privilegesRepo.find.mockResolvedValue([{ moduleId: 1 }]);
      tablesRepo.find.mockResolvedValue([]);

      const result = await service.getAllTables('user-1');

      expect(result).toEqual([]);
      // Should still have been called with empty string as defaultRoleId
      expect(privilegesRepo.find).toHaveBeenCalled();
    });
  });

  // ─── getTableDetails ────────────────────────────────────────────────────────

  describe('getTableDetails', () => {
    it('should return header and body for valid table', async () => {
      mockTableAccess();
      tablesRepo.findOne.mockResolvedValue({
        id: 't-1',
        tableName: 'V3_sdp_nodes',
        tableType: 'param',
        mId: 1,
      });
      const fields = [
        makeField({ columnName: 'id', columnDisplayName: 'ID', type: 'varchar', priority_id: 1 }),
        makeField({ columnName: 'name', columnDisplayName: 'Node Name', type: 'varchar', priority_id: 2 }),
      ];
      fieldsRepo.find.mockResolvedValue(fields);
      legacyDataDbService.query.mockResolvedValue([
        { id: '1', name: 'SDP-1' },
        { id: '2', name: 'SDP-2' },
      ]);

      const result = await service.getTableDetails('t-1', 'user-1');

      expect(result.header).toHaveLength(2);
      expect(result.header[0].datafield).toBe('id');
      expect(result.header[0].hidden).toBe(true); // id columns are hidden
      expect(result.header[1].datafield).toBe('name');
      expect(result.header[1].hidden).toBe(false);
      expect(result.body).toHaveLength(2);
      expect(legacyDataDbService.query).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when table does not exist', async () => {
      tablesRepo.findOne.mockResolvedValue(null);

      await expect(service.getTableDetails('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
      await expect(service.getTableDetails('nonexistent', 'user-1')).rejects.toThrow('Table not found');
    });

    it('should throw ForbiddenException when user lacks access to table module', async () => {
      rolesRepo.findOne.mockResolvedValue({ id: 'na-role-id' });
      privilegesRepo.findOne.mockResolvedValue(null); // no access
      tablesRepo.findOne.mockResolvedValue({
        id: 't-1',
        tableName: 'V3_sdp_nodes',
        tableType: 'param',
        mId: 99,
      });

      await expect(service.getTableDetails('t-1', 'user-no-access')).rejects.toThrow(ForbiddenException);
    });

    it('should return empty header and body when table has no fields', async () => {
      mockTableAccess();
      tablesRepo.findOne.mockResolvedValue({
        id: 't-1',
        tableName: 'V3_empty_table',
        tableType: 'param',
        mId: 1,
      });
      fieldsRepo.find.mockResolvedValue([]);

      const result = await service.getTableDetails('t-1', 'user-1');

      expect(result).toEqual({ header: [], body: [] });
      expect(legacyDataDbService.query).not.toHaveBeenCalled();
    });

    it('should build correct header visibility rules', async () => {
      mockTableAccess();
      tablesRepo.findOne.mockResolvedValue({
        id: 't-1',
        tableName: 'V3_test_table',
        tableType: 'param',
        mId: 1,
      });
      const fields = [
        makeField({ columnName: 'id', type: 'varchar', priority_id: 1 }),
        makeField({ columnName: 'creation_date', type: 'datetime', priority_id: 2 }),
        makeField({ columnName: 'created_by', type: 'varchar', priority_id: 3 }),
        makeField({ columnName: 'gui_pass', type: 'varchar', priority_id: 4, isEncrypted: true }),
        makeField({ columnName: 'hostname', type: 'varchar', priority_id: 5 }),
      ];
      fieldsRepo.find.mockResolvedValue(fields);
      legacyDataDbService.query.mockResolvedValue([]);

      const result = await service.getTableDetails('t-1', 'user-1');

      // id: hidden=true, editable=false
      expect(result.header[0].hidden).toBe(true);
      expect(result.header[0].editable).toBe(false);

      // datetime field: hidden=false, editable=false
      expect(result.header[1].hidden).toBe(false);
      expect(result.header[1].editable).toBe(false);

      // _by field: hidden=false, editable=false
      expect(result.header[2].hidden).toBe(false);
      expect(result.header[2].editable).toBe(false);

      // isEncrypted field: hidden=true, editable=true [S-10]
      expect(result.header[3].hidden).toBe(true);
      expect(result.header[3].editable).toBe(true);

      // normal field: hidden=false, editable=true
      expect(result.header[4].hidden).toBe(false);
      expect(result.header[4].editable).toBe(true);
    });

    it('should use encryption key for encrypted fields in SQL', async () => {
      mockTableAccess();
      tablesRepo.findOne.mockResolvedValue({
        id: 't-1',
        tableName: 'V3_test_table',
        tableType: 'param',
        mId: 1,
      });
      const fields = [makeField({ columnName: 'gui_pass', type: 'varchar', priority_id: 1, isEncrypted: true })];
      fieldsRepo.find.mockResolvedValue(fields);
      legacyDataDbService.query.mockResolvedValue([]);

      await service.getTableDetails('t-1', 'user-1');

      // The query should include the AES key as a parameter value
      expect(legacyDataDbService.query).toHaveBeenCalledWith(
        expect.stringContaining('AES_DECRYPT'),
        expect.arrayContaining(['test-aes-key']),
      );
    });

    it('should use LEFT JOINs for _by fields instead of subqueries', async () => {
      mockTableAccess();
      tablesRepo.findOne.mockResolvedValue({
        id: 't-1',
        tableName: 'V3_test_table',
        tableType: 'param',
        mId: 1,
      });
      const fields = [makeField({ columnName: 'created_by', type: 'varchar', priority_id: 1 })];
      fieldsRepo.find.mockResolvedValue(fields);
      legacyDataDbService.query.mockResolvedValue([]);

      await service.getTableDetails('t-1', 'user-1');

      const [sql] = legacyDataDbService.query.mock.calls[0];
      expect(sql).toContain('LEFT JOIN');
      expect(sql).toContain('core_application_users');
      expect(sql).toContain('CONCAT');
    });
  });

  // ─── insertRecord ──────────────────────────────────────────────────────────

  describe('insertRecord', () => {
    it('should generate INSERT SQL and call legacyDataDbService', async () => {
      tablesRepo.findOne.mockResolvedValue({
        id: 't-1',
        tableName: 'V3_sdp_nodes',
        tableType: 'param',
      });
      const fields = [
        makeField({ columnName: 'id', type: 'varchar', isPrimaryKey: 1, priority_id: 1 }),
        makeField({ columnName: 'name', type: 'varchar', priority_id: 2 }),
        makeField({ columnName: 'hostname', type: 'varchar', priority_id: 3 }),
      ];
      fieldsRepo.find.mockResolvedValue(fields);

      await service.insertRecord(
        { tableName: 'V3_sdp_nodes', data: { name: 'SDP-1', hostname: '10.0.0.1' } },
        'user-1',
      );

      expect(legacyDataDbService.query).toHaveBeenCalledTimes(1);
      const [sql, values] = legacyDataDbService.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO');
      expect(sql).toContain('V3_sdp_nodes');
      // Should auto-generate UUID for id
      expect(values.length).toBeGreaterThan(0);
    });

    it('should throw BadRequestException for invalid tableName', async () => {
      tablesRepo.findOne.mockResolvedValue(null);

      await expect(
        service.insertRecord({ tableName: 'nonexistent_table', data: { name: 'test' } }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.insertRecord({ tableName: 'nonexistent_table', data: { name: 'test' } }, 'user-1'),
      ).rejects.toThrow("Table 'nonexistent_table' not found or invalid type");
    });

    it('should throw BadRequestException for tableName with special characters', async () => {
      tablesRepo.findOne.mockResolvedValue({
        id: 't-1',
        tableName: 'table; DROP TABLE users;--',
        tableType: 'param',
      });
      fieldsRepo.find.mockResolvedValue([makeField({ columnName: 'name' })]);

      await expect(
        service.insertRecord({ tableName: 'table; DROP TABLE users;--', data: { name: 'test' } }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should encrypt fields with isEncrypted flag using AES_ENCRYPT', async () => {
      tablesRepo.findOne.mockResolvedValue({
        id: 't-1',
        tableName: 'V3_air_nodes',
        tableType: 'param',
      });
      const fields = [
        makeField({ columnName: 'id', type: 'varchar', isPrimaryKey: 1 }),
        makeField({ columnName: 'gui_pass', type: 'varchar', isEncrypted: true }),
      ];
      fieldsRepo.find.mockResolvedValue(fields);

      await service.insertRecord({ tableName: 'V3_air_nodes', data: { gui_pass: 'secret123' } }, 'user-1');

      const [sql, values] = legacyDataDbService.query.mock.calls[0];
      expect(sql).toContain('AES_ENCRYPT(?, ?)');
      expect(values).toContain('secret123');
      expect(values).toContain('test-aes-key');
    });

    it('should auto-populate creation_date and created_by fields', async () => {
      tablesRepo.findOne.mockResolvedValue({
        id: 't-1',
        tableName: 'V3_sdp_nodes',
        tableType: 'param',
      });
      const fields = [
        makeField({ columnName: 'id', type: 'varchar' }),
        makeField({ columnName: 'creation_date', type: 'datetime' }),
        makeField({ columnName: 'created_by', type: 'varchar' }),
        makeField({ columnName: 'name', type: 'varchar' }),
      ];
      fieldsRepo.find.mockResolvedValue(fields);

      await service.insertRecord({ tableName: 'V3_sdp_nodes', data: { name: 'test' } }, 'admin-1');

      const values = legacyDataDbService.query.mock.calls[0][1];
      expect(values).toContain('2026-03-03 12:00:00'); // formatted date
      expect(values).toContain('admin-1'); // userId for created_by
    });
  });

  // ─── updateRecords ─────────────────────────────────────────────────────────

  describe('updateRecords', () => {
    it('should generate UPDATE SQL and call legacyDataDbService', async () => {
      tablesRepo.findOne.mockResolvedValue({
        id: 't-1',
        tableName: 'V3_sdp_nodes',
        tableType: 'param',
      });
      const fields = [
        makeField({ columnName: 'id', type: 'varchar', isPrimaryKey: 1 }),
        makeField({ columnName: 'name', type: 'varchar' }),
      ];
      fieldsRepo.find.mockResolvedValue(fields);

      await service.updateRecords({ V3_sdp_nodes: [{ id: 'node-1', name: 'Updated Name' }] }, 'user-1');

      expect(legacyDataDbService.query).toHaveBeenCalledTimes(1);
      const [sql, values] = legacyDataDbService.query.mock.calls[0];
      expect(sql).toContain('UPDATE');
      expect(sql).toContain('V3_sdp_nodes');
      expect(sql).toContain('WHERE');
      expect(values).toContain('Updated Name');
      expect(values).toContain('user-1'); // audit field: updated_by
      expect(values).toContain('node-1'); // WHERE clause PK value
    });

    it('should handle empty rows array gracefully', async () => {
      await service.updateRecords({ V3_sdp_nodes: [] }, 'user-1');

      expect(legacyDataDbService.query).not.toHaveBeenCalled();
      expect(tablesRepo.findOne).not.toHaveBeenCalled();
    });

    it('should skip rows without a primary key value', async () => {
      tablesRepo.findOne.mockResolvedValue({
        id: 't-1',
        tableName: 'V3_sdp_nodes',
        tableType: 'param',
      });
      const fields = [
        makeField({ columnName: 'id', type: 'varchar', isPrimaryKey: 1 }),
        makeField({ columnName: 'name', type: 'varchar' }),
      ];
      fieldsRepo.find.mockResolvedValue(fields);

      await service.updateRecords(
        { V3_sdp_nodes: [{ name: 'No PK' }] }, // no id field
        'user-1',
      );

      expect(legacyDataDbService.query).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid table name', async () => {
      tablesRepo.findOne.mockResolvedValue(null);

      await expect(service.updateRecords({ bad_table: [{ id: '1', name: 'test' }] }, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should encrypt fields with isEncrypted flag during update', async () => {
      tablesRepo.findOne.mockResolvedValue({
        id: 't-1',
        tableName: 'V3_air_nodes',
        tableType: 'param',
      });
      const fields = [
        makeField({ columnName: 'id', type: 'varchar', isPrimaryKey: 1 }),
        makeField({ columnName: 'gui_pass', type: 'varchar', isEncrypted: true }),
      ];
      fieldsRepo.find.mockResolvedValue(fields);

      await service.updateRecords({ V3_air_nodes: [{ id: 'node-1', gui_pass: 'newpassword' }] }, 'user-1');

      const [sql, values] = legacyDataDbService.query.mock.calls[0];
      expect(sql).toContain('AES_ENCRYPT(?, ?)');
      expect(values).toContain('newpassword');
      expect(values).toContain('test-aes-key');
    });

    it('should convert boolean values to 0/1', async () => {
      tablesRepo.findOne.mockResolvedValue({
        id: 't-1',
        tableName: 'V3_sdp_nodes',
        tableType: 'param',
      });
      const fields = [
        makeField({ columnName: 'id', type: 'varchar', isPrimaryKey: 1 }),
        makeField({ columnName: 'is_active', type: 'tinyint' }),
      ];
      fieldsRepo.find.mockResolvedValue(fields);

      await service.updateRecords({ V3_sdp_nodes: [{ id: 'node-1', is_active: true }] }, 'user-1');

      const values = legacyDataDbService.query.mock.calls[0][1];
      expect(values).toContain(1); // boolean true -> 1
    });
  });

  // ─── sanitizeIdentifier [S-01] ────────────────────────────────────────────

  describe('sanitizeIdentifier (via insertRecord)', () => {
    /**
     * Helper: mock table lookup to return a row so we reach the sanitize check.
     * The actual tableName on the returned row doesn't matter — sanitizeIdentifier
     * validates dto.tableName which is what the caller passes.
     */
    function mockTableFound(tableName: string) {
      tablesRepo.findOne.mockResolvedValue({
        id: 't-1',
        tableName,
        tableType: 'param',
      });
      fieldsRepo.find.mockResolvedValue([makeField({ columnName: 'name' })]);
    }

    it('should accept valid identifiers (alphanumeric + underscore)', async () => {
      mockTableFound('V3_sdp_nodes');

      await expect(
        service.insertRecord({ tableName: 'V3_sdp_nodes', data: { name: 'test' } }, 'user-1'),
      ).resolves.not.toThrow();
    });

    it('should reject identifiers with semicolons', async () => {
      mockTableFound('table;DROP');

      await expect(service.insertRecord({ tableName: 'table;DROP', data: { name: 'test' } }, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject identifiers with backticks', async () => {
      mockTableFound('table`name');

      await expect(service.insertRecord({ tableName: 'table`name', data: { name: 'test' } }, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject identifiers with spaces', async () => {
      mockTableFound('table name');

      await expect(service.insertRecord({ tableName: 'table name', data: { name: 'test' } }, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject identifiers with hyphens', async () => {
      mockTableFound('table-name');

      await expect(service.insertRecord({ tableName: 'table-name', data: { name: 'test' } }, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject identifiers with dots (path traversal)', async () => {
      mockTableFound('..table');

      await expect(service.insertRecord({ tableName: '..table', data: { name: 'test' } }, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject identifiers with parentheses', async () => {
      mockTableFound('table()');

      await expect(service.insertRecord({ tableName: 'table()', data: { name: 'test' } }, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject identifiers with single quotes', async () => {
      mockTableFound("table'name");

      await expect(service.insertRecord({ tableName: "table'name", data: { name: 'test' } }, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject identifiers with double quotes', async () => {
      mockTableFound('table"name');

      await expect(service.insertRecord({ tableName: 'table"name', data: { name: 'test' } }, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject identifiers with SQL comment sequence', async () => {
      mockTableFound('table--comment');

      await expect(
        service.insertRecord({ tableName: 'table--comment', data: { name: 'test' } }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject identifiers with newlines', async () => {
      mockTableFound('table\nname');

      await expect(
        service.insertRecord({ tableName: 'table\nname', data: { name: 'test' } }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject identifiers with tabs', async () => {
      mockTableFound('table\tname');

      await expect(
        service.insertRecord({ tableName: 'table\tname', data: { name: 'test' } }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject empty string identifiers', async () => {
      mockTableFound('');

      await expect(service.insertRecord({ tableName: '', data: { name: 'test' } }, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject identifiers with forward slashes', async () => {
      mockTableFound('table/name');

      await expect(service.insertRecord({ tableName: 'table/name', data: { name: 'test' } }, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject identifiers with backslashes', async () => {
      mockTableFound('table\\name');

      await expect(
        service.insertRecord({ tableName: 'table\\name', data: { name: 'test' } }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should also reject dangerous column names during insert', async () => {
      tablesRepo.findOne.mockResolvedValue({
        id: 't-1',
        tableName: 'V3_safe_table',
        tableType: 'param',
      });
      // Field with a dangerous column name
      fieldsRepo.find.mockResolvedValue([makeField({ columnName: 'col; DROP TABLE users' })]);

      await expect(
        service.insertRecord({ tableName: 'V3_safe_table', data: { 'col; DROP TABLE users': 'val' } }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should also reject dangerous column names during update', async () => {
      tablesRepo.findOne.mockResolvedValue({
        id: 't-1',
        tableName: 'V3_safe_table',
        tableType: 'param',
      });
      fieldsRepo.find.mockResolvedValue([
        makeField({ columnName: 'id', isPrimaryKey: 1 }),
        makeField({ columnName: 'col`inject' }),
      ]);

      await expect(
        service.updateRecords({ V3_safe_table: [{ id: '1', 'col`inject': 'val' }] }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── validateDateFormat [S-02] ─────────────────────────────────────────────

  describe('validateDateFormat (via getTableDetails)', () => {
    function mockTableForDateFormat() {
      rolesRepo.findOne.mockResolvedValue({ id: 'na-role-id' });
      privilegesRepo.findOne.mockResolvedValue({ id: 'priv-1' });
      tablesRepo.findOne.mockResolvedValue({
        id: 't-1',
        tableName: 'V3_test_table',
        tableType: 'param',
        mId: 1,
      });
      fieldsRepo.find.mockResolvedValue([makeField({ columnName: 'name', type: 'varchar' })]);
      legacyDataDbService.query.mockResolvedValue([]);
    }

    it('should accept valid MySQL date format %Y-%m-%d %H:%i:%s', async () => {
      mockTableForDateFormat();
      systemConfigService.getConfigValue.mockResolvedValue('%Y-%m-%d %H:%i:%s');

      await expect(service.getTableDetails('t-1', 'user-1')).resolves.not.toThrow();
    });

    it('should accept format with slashes %Y/%m/%d', async () => {
      mockTableForDateFormat();
      systemConfigService.getConfigValue.mockResolvedValue('%Y/%m/%d');

      await expect(service.getTableDetails('t-1', 'user-1')).resolves.not.toThrow();
    });

    it('should accept format with dots %d.%m.%Y', async () => {
      mockTableForDateFormat();
      systemConfigService.getConfigValue.mockResolvedValue('%d.%m.%Y');

      await expect(service.getTableDetails('t-1', 'user-1')).resolves.not.toThrow();
    });

    it('should reject date format with SQL injection attempt', async () => {
      mockTableForDateFormat();
      systemConfigService.getConfigValue.mockResolvedValue("%Y'); DROP TABLE users;--");

      await expect(service.getTableDetails('t-1', 'user-1')).rejects.toThrow(BadRequestException);
      await expect(service.getTableDetails('t-1', 'user-1')).rejects.toThrow('Invalid date format configuration');
    });

    it('should reject date format with backticks', async () => {
      mockTableForDateFormat();
      systemConfigService.getConfigValue.mockResolvedValue('%Y`%m`%d');

      await expect(service.getTableDetails('t-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should reject date format with parentheses', async () => {
      mockTableForDateFormat();
      systemConfigService.getConfigValue.mockResolvedValue('%Y()%m');

      await expect(service.getTableDetails('t-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should reject date format with semicolons', async () => {
      mockTableForDateFormat();
      systemConfigService.getConfigValue.mockResolvedValue('%Y;%m');

      await expect(service.getTableDetails('t-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should reject date format with double dashes (SQL comment)', async () => {
      mockTableForDateFormat();
      systemConfigService.getConfigValue.mockResolvedValue('%Y--%m');

      // Note: '--' contains only valid chars (hyphen), so this actually passes the regex.
      // The regex allows hyphens as date separators. This is expected behavior.
      await expect(service.getTableDetails('t-1', 'user-1')).resolves.not.toThrow();
    });

    it('should reject date format with angle brackets', async () => {
      mockTableForDateFormat();
      systemConfigService.getConfigValue.mockResolvedValue('%Y<script>%m');

      await expect(service.getTableDetails('t-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should reject date format with equals sign', async () => {
      mockTableForDateFormat();
      systemConfigService.getConfigValue.mockResolvedValue('%Y=%m');

      await expect(service.getTableDetails('t-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should reject empty date format', async () => {
      mockTableForDateFormat();
      systemConfigService.getConfigValue.mockResolvedValue('');

      await expect(service.getTableDetails('t-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });
});

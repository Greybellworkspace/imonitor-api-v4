import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodeDefinitionService } from './node-definition.service';
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

describe('NodeDefinitionService', () => {
  let service: NodeDefinitionService;
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
        NodeDefinitionService,
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

    service = module.get<NodeDefinitionService>(NodeDefinitionService);
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

  it('should have tableType set to "nodes"', () => {
    expect((service as any).tableType).toBe('nodes');
  });

  // ─── getAllTables ───────────────────────────────────────────────────────────

  describe('getAllTables', () => {
    it('should return node tables filtered by user privileges', async () => {
      rolesRepo.findOne.mockResolvedValue({ id: 'na-role-id' });
      privilegesRepo.find.mockResolvedValue([{ moduleId: 10 }, { moduleId: 20 }]);
      tablesRepo.find.mockResolvedValue([{ id: 'nt-1', tableName: 'V3_sdp_nodes', displayName: 'SDP Nodes' }]);

      const result = await service.getAllTables('user-1');

      expect(result).toEqual([{ id: 'nt-1', tableName: 'V3_sdp_nodes', displayName: 'SDP Nodes' }]);
      // Verify tableType filter is 'nodes' (not 'param')
      expect(tablesRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tableType: 'nodes' }),
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

    it('should deduplicate module IDs from privileges', async () => {
      rolesRepo.findOne.mockResolvedValue({ id: 'na-role-id' });
      privilegesRepo.find.mockResolvedValue([{ moduleId: 5 }, { moduleId: 5 }, { moduleId: 5 }]);
      tablesRepo.find.mockResolvedValue([]);

      await service.getAllTables('user-1');

      // The In() clause should contain deduplicated module IDs
      const findCall = tablesRepo.find.mock.calls[0][0];
      expect(findCall.where.mId._value).toEqual([5]);
    });
  });

  // ─── getTableDetails ────────────────────────────────────────────────────────

  describe('getTableDetails', () => {
    it('should return header and body for valid node table', async () => {
      mockTableAccess();
      tablesRepo.findOne.mockResolvedValue({
        id: 'nt-1',
        tableName: 'V3_sdp_nodes',
        tableType: 'nodes',
        mId: 10,
      });
      const fields = [
        makeField({ columnName: 'id', columnDisplayName: 'ID', type: 'varchar', priority_id: 1 }),
        makeField({ columnName: 'node_ip', columnDisplayName: 'Node IP', type: 'varchar', priority_id: 2 }),
        makeField({
          columnName: 'gui_pass',
          columnDisplayName: 'Password',
          type: 'varchar',
          priority_id: 3,
          isEncrypted: true,
        }),
      ];
      fieldsRepo.find.mockResolvedValue(fields);
      legacyDataDbService.query.mockResolvedValue([{ id: '1', node_ip: '10.0.0.1', gui_pass: 'decrypted_pass' }]);

      const result = await service.getTableDetails('nt-1', 'user-1');

      expect(result.header).toHaveLength(3);
      // id: hidden, not editable
      expect(result.header[0].hidden).toBe(true);
      expect(result.header[0].editable).toBe(false);
      // node_ip: visible, editable
      expect(result.header[1].hidden).toBe(false);
      expect(result.header[1].editable).toBe(true);
      // gui_pass: hidden, editable (isEncrypted)
      expect(result.header[2].hidden).toBe(true);
      expect(result.header[2].editable).toBe(true);
      expect(result.body).toHaveLength(1);
    });

    it('should throw NotFoundException when table does not exist', async () => {
      tablesRepo.findOne.mockResolvedValue(null);

      await expect(service.getTableDetails('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user lacks access to table module', async () => {
      rolesRepo.findOne.mockResolvedValue({ id: 'na-role-id' });
      privilegesRepo.findOne.mockResolvedValue(null); // no access
      tablesRepo.findOne.mockResolvedValue({
        id: 'nt-1',
        tableName: 'V3_sdp_nodes',
        tableType: 'nodes',
        mId: 99,
      });

      await expect(service.getTableDetails('nt-1', 'user-no-access')).rejects.toThrow(ForbiddenException);
    });

    it('should return empty header and body when table has no fields', async () => {
      mockTableAccess();
      tablesRepo.findOne.mockResolvedValue({
        id: 'nt-1',
        tableName: 'V3_empty',
        tableType: 'nodes',
        mId: 10,
      });
      fieldsRepo.find.mockResolvedValue([]);

      const result = await service.getTableDetails('nt-1', 'user-1');

      expect(result).toEqual({ header: [], body: [] });
    });

    it('should build LEFT JOINs for _by fields with user lookup', async () => {
      mockTableAccess();
      tablesRepo.findOne.mockResolvedValue({
        id: 'nt-1',
        tableName: 'V3_test_nodes',
        tableType: 'nodes',
        mId: 10,
      });
      const fields = [makeField({ columnName: 'created_by', type: 'varchar', priority_id: 1 })];
      fieldsRepo.find.mockResolvedValue(fields);
      legacyDataDbService.query.mockResolvedValue([]);

      await service.getTableDetails('nt-1', 'user-1');

      const [sql] = legacyDataDbService.query.mock.calls[0];
      expect(sql).toContain('LEFT JOIN');
      expect(sql).toContain('core_application_users');
      expect(sql).toContain('CONCAT');
    });
  });

  // ─── insertRecord ──────────────────────────────────────────────────────────

  describe('insertRecord', () => {
    it('should generate INSERT SQL with correct table name', async () => {
      tablesRepo.findOne.mockResolvedValue({
        id: 'nt-1',
        tableName: 'V3_sdp_nodes',
        tableType: 'nodes',
      });
      const fields = [
        makeField({ columnName: 'id', type: 'varchar', isPrimaryKey: 1 }),
        makeField({ columnName: 'node_ip', type: 'varchar' }),
      ];
      fieldsRepo.find.mockResolvedValue(fields);

      await service.insertRecord({ tableName: 'V3_sdp_nodes', data: { node_ip: '10.0.0.1' } }, 'user-1');

      const [sql] = legacyDataDbService.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO');
      expect(sql).toContain('V3_sdp_nodes');
    });

    it('should validate tableType is "nodes" by rejecting wrong type', async () => {
      tablesRepo.findOne.mockResolvedValue(null); // no match for tableType='nodes'

      await expect(
        service.insertRecord({ tableName: 'V3_param_only', data: { name: 'test' } }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should auto-generate UUID for id column', async () => {
      tablesRepo.findOne.mockResolvedValue({
        id: 'nt-1',
        tableName: 'V3_sdp_nodes',
        tableType: 'nodes',
      });
      const fields = [
        makeField({ columnName: 'id', type: 'varchar' }),
        makeField({ columnName: 'name', type: 'varchar' }),
      ];
      fieldsRepo.find.mockResolvedValue(fields);

      await service.insertRecord({ tableName: 'V3_sdp_nodes', data: { name: 'SDP-1' } }, 'user-1');

      const [sql, values] = legacyDataDbService.query.mock.calls[0];
      expect(sql).toContain('`id`');
      // First value should be a UUID (36 chars with dashes)
      expect(typeof values[0]).toBe('string');
      expect((values[0] as string).length).toBe(36);
    });
  });

  // ─── updateRecords ─────────────────────────────────────────────────────────

  describe('updateRecords', () => {
    it('should generate UPDATE SQL with audit fields', async () => {
      tablesRepo.findOne.mockResolvedValue({
        id: 'nt-1',
        tableName: 'V3_sdp_nodes',
        tableType: 'nodes',
      });
      const fields = [
        makeField({ columnName: 'id', type: 'varchar', isPrimaryKey: 1 }),
        makeField({ columnName: 'node_ip', type: 'varchar' }),
      ];
      fieldsRepo.find.mockResolvedValue(fields);

      await service.updateRecords({ V3_sdp_nodes: [{ id: 'node-1', node_ip: '10.0.0.2' }] }, 'admin-1');

      const [sql, values] = legacyDataDbService.query.mock.calls[0];
      expect(sql).toContain('UPDATE');
      expect(sql).toContain('`updated_by` = ?');
      expect(sql).toContain('`updated_date` = NOW()');
      expect(values).toContain('admin-1');
      expect(values).toContain('node-1');
    });

    it('should handle empty rows gracefully', async () => {
      await service.updateRecords({ V3_sdp_nodes: [] }, 'user-1');

      expect(legacyDataDbService.query).not.toHaveBeenCalled();
    });

    it('should handle non-array values gracefully', async () => {
      await service.updateRecords({ V3_sdp_nodes: 'not-an-array' as any }, 'user-1');

      expect(legacyDataDbService.query).not.toHaveBeenCalled();
    });

    it('should handle multiple tables in a single call', async () => {
      tablesRepo.findOne
        .mockResolvedValueOnce({ id: 'nt-1', tableName: 'V3_sdp_nodes', tableType: 'nodes' })
        .mockResolvedValueOnce({ id: 'nt-2', tableName: 'V3_air_nodes', tableType: 'nodes' });
      const fieldsA = [
        makeField({ columnName: 'id', type: 'varchar', isPrimaryKey: 1 }),
        makeField({ columnName: 'name', type: 'varchar' }),
      ];
      const fieldsB = [
        makeField({ columnName: 'id', type: 'varchar', isPrimaryKey: 1 }),
        makeField({ columnName: 'ip', type: 'varchar' }),
      ];
      fieldsRepo.find.mockResolvedValueOnce(fieldsA).mockResolvedValueOnce(fieldsB);

      await service.updateRecords(
        {
          V3_sdp_nodes: [{ id: 'n1', name: 'Updated SDP' }],
          V3_air_nodes: [{ id: 'n2', ip: '10.0.0.3' }],
        },
        'user-1',
      );

      expect(legacyDataDbService.query).toHaveBeenCalledTimes(2);
    });
  });
});

import { BadRequestException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { Repository, In, Not } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CoreModulesTables } from '../../database/entities/core-modules-tables.entity';
import { CoreTablesField } from '../../database/entities/core-tables-field.entity';
import { CoreParamsTableRelations } from '../../database/entities/core-params-table-relations.entity';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { CoreApplicationRoles } from '../../database/entities/core-application-roles.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { SystemConfigService } from './system-config.service';
import { EncryptionHelperService } from './encryption-helper.service';
import { ExportHelperService, ExcelSheet } from './export-helper.service';
import { DateHelperService, DATE_FULL_TIME } from './date-helper.service';
import { TabularHeaderDto, TabularObjectDto } from '../dto/tabular.dto';
import { DynamicTableListItemDto } from '../dto/dynamic-table.dto';
import { DynamicTableInsertDto } from '../dto/dynamic-table.dto';
import { generateGuid } from '../helpers/common.helper';

/** Allowlist of valid MySQL DATE_FORMAT tokens [S-02] */
const VALID_DATE_FORMAT = /^[%YmdHis\-\/: .]+$/;

/**
 * Abstract base class for dynamic table services (Parameters and NodeDefinition).
 *
 * Both modules share the same CRUD logic — they differ only in `tableType`.
 * Concrete subclasses set `tableType` and inject all dependencies via super().
 *
 * NOT decorated with @Injectable() — subclasses are the injectable services.
 */
export abstract class DynamicTableService {
  protected abstract readonly tableType: string;
  protected readonly logger = new Logger(this.constructor.name);

  /** Cached default role ID ("N/A") to avoid repeated DB queries [P-03] */
  private cachedDefaultRoleId: string | null = null;

  constructor(
    protected readonly tablesRepo: Repository<CoreModulesTables>,
    protected readonly fieldsRepo: Repository<CoreTablesField>,
    protected readonly relationsRepo: Repository<CoreParamsTableRelations>,
    protected readonly privilegesRepo: Repository<CorePrivileges>,
    protected readonly rolesRepo: Repository<CoreApplicationRoles>,
    protected readonly legacyDataDbService: LegacyDataDbService,
    protected readonly systemConfigService: SystemConfigService,
    protected readonly encryptionHelperService: EncryptionHelperService,
    protected readonly exportHelperService: ExportHelperService,
    protected readonly dateHelperService: DateHelperService,
    protected readonly configService: ConfigService,
  ) {}

  // ─── Public Methods ───────────────────────────────────────────────────

  /**
   * Get all tables of the configured tableType that the user has access to.
   * Replicates v3 getAllTables query with privilege filtering.
   */
  async getAllTables(userId: string): Promise<DynamicTableListItemDto[]> {
    // Get the default role ID (N/A) to exclude from privilege check [P-03: cached]
    const defaultRoleId = await this.getDefaultRoleId();

    // Get module IDs the user has access to (excluding default role)
    const privs = await this.privilegesRepo.find({
      where: { userId, roleId: Not(defaultRoleId) },
      select: { moduleId: true },
    });
    const moduleIds = [...new Set(privs.map((p) => p.moduleId))];

    if (moduleIds.length === 0) {
      return [];
    }

    // Get tables matching the tableType and user's accessible modules
    const tables = await this.tablesRepo.find({
      where: { tableType: this.tableType, mId: In(moduleIds) },
      select: { id: true, displayName: true, tableName: true },
      order: { displayName: 'ASC' },
    });

    return tables.map((t) => ({
      id: t.id,
      tableName: t.tableName,
      displayName: t.displayName,
    }));
  }

  /**
   * Get table details: header definitions + data rows from iMonitorData.
   * Builds dynamic SQL with visibility rules, encryption, and formatting.
   * [S-05] Requires userId for privilege verification.
   */
  async getTableDetails(tableId: string, userId: string): Promise<TabularObjectDto> {
    // 1. Get table metadata
    const tableRow = await this.tablesRepo.findOne({ where: { id: tableId } });
    if (!tableRow) {
      throw new NotFoundException('Table not found');
    }

    // 2. Verify user has access to this table's module [S-05]
    await this.verifyTableAccess(tableRow.mId, userId);

    // 3. Get field definitions ordered by priority
    const fields = await this.fieldsRepo.find({
      where: { tId: tableId },
      order: { priority_id: 'ASC' },
    });

    if (fields.length === 0) {
      return { header: [], body: [] };
    }

    // 4. Build header with visibility rules
    const header = this.buildHeader(fields);

    // 5. Build dynamic SELECT SQL
    const aesKey = await this.encryptionHelperService.getEncryptionKey();
    const dateFormat = (await this.systemConfigService.getConfigValue('dateFormat')) ?? '%Y-%m-%d %H:%i:%s';
    this.validateDateFormat(dateFormat); // [S-02]
    const coreDbName = this.sanitizeIdentifier(this.configService.get<string>('DB_NAME', 'iMonitorV3_1')); // [S-03]
    const tableName = this.sanitizeIdentifier(tableRow.tableName);

    const { sql, values } = this.buildSelectSql(tableName, fields, aesKey, dateFormat, coreDbName);

    // 6. Execute against iMonitorData
    const body = await this.legacyDataDbService.query<Record<string, unknown>>(sql, values);

    return { header, body };
  }

  /**
   * Insert a new record into a dynamic table in iMonitorData.
   * Generates UUID for id, sets creation metadata, encrypts password fields.
   */
  async insertRecord(dto: DynamicTableInsertDto, userId: string): Promise<void> {
    // 1. Validate tableName exists in core_modules_tables with correct tableType
    const tableRow = await this.tablesRepo.findOne({
      where: { tableName: dto.tableName, tableType: this.tableType },
    });
    if (!tableRow) {
      throw new BadRequestException(`Table '${dto.tableName}' not found or invalid type`);
    }

    // 2. Get fields for that table
    const fields = await this.fieldsRepo.find({ where: { tId: tableRow.id } });

    // 3. Prepare data with auto-generated values
    const aesKey = await this.encryptionHelperService.getEncryptionKey();
    const now = this.dateHelperService.formatDate(DATE_FULL_TIME);
    const tableName = this.sanitizeIdentifier(dto.tableName);

    const columns: string[] = [];
    const placeholders: string[] = [];
    const values: unknown[] = [];

    for (const field of fields) {
      const colName = this.sanitizeIdentifier(field.columnName); // [S-01]
      const colNameLower = colName.toLowerCase();

      if (colNameLower === 'id') {
        columns.push(`\`${colName}\``);
        placeholders.push('?');
        values.push(generateGuid());
      } else if (colNameLower === 'creation_date' || colNameLower === 'created_date') {
        columns.push(`\`${colName}\``);
        placeholders.push('?');
        values.push(now);
      } else if (colNameLower === 'created_by') {
        columns.push(`\`${colName}\``);
        placeholders.push('?');
        values.push(userId);
      } else if (dto.data[field.columnName] !== undefined) {
        columns.push(`\`${colName}\``);

        if (field.isEncrypted) {
          // [S-10] Use field.isEncrypted flag instead of column name heuristic
          placeholders.push('AES_ENCRYPT(?, ?)');
          values.push(dto.data[field.columnName], aesKey);
        } else {
          placeholders.push('?');
          values.push(dto.data[field.columnName]);
        }
      }
    }

    if (columns.length === 0) {
      throw new BadRequestException('No valid columns to insert');
    }

    const sql = `INSERT INTO \`${tableName}\` (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
    await this.legacyDataDbService.query(sql, values);
  }

  /**
   * Update records in dynamic tables in iMonitorData.
   * Body format: { [tableName]: Record<string, unknown>[] }
   */
  async updateRecords(body: Record<string, unknown[]>, userId: string): Promise<void> {
    const aesKey = await this.encryptionHelperService.getEncryptionKey();

    for (const [rawTableName, rows] of Object.entries(body)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;

      // 1. Validate tableName exists with correct tableType
      const tableRow = await this.tablesRepo.findOne({
        where: { tableName: rawTableName, tableType: this.tableType },
      });
      if (!tableRow) {
        throw new BadRequestException(`Table '${rawTableName}' not found or invalid type`);
      }

      // 2. Get fields for that table
      const fields = await this.fieldsRepo.find({ where: { tId: tableRow.id } });
      const tableName = this.sanitizeIdentifier(rawTableName);

      // 3. Find primary key field
      const pkField =
        fields.find((f) => f.isPrimaryKey === 1) ?? fields.find((f) => f.columnName.toLowerCase().includes('id'));
      if (!pkField) {
        throw new BadRequestException(`No primary key found for table '${tableName}'`);
      }
      const pkColName = this.sanitizeIdentifier(pkField.columnName); // [S-01]

      // 4. Update each row
      // TODO: batch updates for better performance [P-04]
      for (const rawRow of rows) {
        const row = rawRow as Record<string, unknown>;
        const pkValue = row[pkField.columnName];
        if (pkValue === undefined || pkValue === null) continue;

        const setClauses: string[] = [];
        const values: unknown[] = [];

        for (const field of fields) {
          const colName = this.sanitizeIdentifier(field.columnName); // [S-01]
          if (colName === pkColName) continue; // Skip PK column
          if (row[field.columnName] === undefined) continue;

          let value = row[field.columnName];

          // Type conversions
          if (typeof value === 'boolean') {
            value = value ? 1 : 0;
          }

          if (field.isEncrypted) {
            // [S-10] Use field.isEncrypted flag
            setClauses.push(`\`${colName}\` = AES_ENCRYPT(?, ?)`);
            values.push(value, aesKey);
          } else {
            setClauses.push(`\`${colName}\` = ?`);
            values.push(value);
          }
        }

        // Add audit fields
        setClauses.push('`updated_by` = ?');
        values.push(userId);
        setClauses.push('`updated_date` = NOW()');

        if (setClauses.length === 0) continue;

        values.push(pkValue);
        const sql = `UPDATE \`${tableName}\` SET ${setClauses.join(', ')} WHERE \`${pkColName}\` = ?`;
        await this.legacyDataDbService.query(sql, values);
      }
    }
  }

  /**
   * Export all accessible tables to a single Excel file (one sheet per table).
   */
  // TODO: batch optimization — currently N+1 queries per table [P-01]
  async exportAllToExcel(userId: string): Promise<string> {
    const tables = await this.getAllTables(userId);
    const sheets: ExcelSheet[] = [];

    for (const table of tables) {
      const details = await this.getTableDetails(table.id, userId);
      sheets.push({
        name: table.displayName,
        header: details.header.filter((h) => !h.hidden).map((h) => ({ text: h.text, datafield: h.datafield })),
        body: details.body,
      });
    }

    return this.exportHelperService.exportTabularToExcel(sheets);
  }

  /**
   * Export a single table to an Excel file.
   * [S-05] Requires userId for privilege verification.
   */
  async exportTableToExcel(tableId: string, userId: string): Promise<string> {
    const tableRow = await this.tablesRepo.findOne({
      where: { id: tableId },
      select: { displayName: true },
    });
    if (!tableRow) {
      throw new NotFoundException('Table not found');
    }

    const details = await this.getTableDetails(tableId, userId);
    const sheet: ExcelSheet = {
      name: tableRow.displayName,
      header: details.header.filter((h) => !h.hidden).map((h) => ({ text: h.text, datafield: h.datafield })),
      body: details.body,
    };

    return this.exportHelperService.exportTabularToExcel([sheet]);
  }

  // ─── Private Methods ──────────────────────────────────────────────────

  /**
   * Get and cache the default role ID ("N/A") [P-03].
   * Avoids hitting the database on every getAllTables() call.
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
   * Verify that the user has privilege to access a table's module [S-05].
   * Throws ForbiddenException if user lacks access.
   */
  private async verifyTableAccess(moduleId: number, userId: string): Promise<void> {
    const defaultRoleId = await this.getDefaultRoleId();
    const hasAccess = await this.privilegesRepo.findOne({
      where: { userId, moduleId, roleId: Not(defaultRoleId) },
      select: { id: true },
    });
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this table');
    }
  }

  /**
   * Validate that a date format string contains only safe MySQL format tokens [S-02].
   */
  private validateDateFormat(format: string): void {
    if (!VALID_DATE_FORMAT.test(format)) {
      this.logger.warn(`Invalid dateFormat in sys_config: ${format}`);
      throw new BadRequestException('Invalid date format configuration');
    }
  }

  /**
   * Build header definitions from field metadata with v3 visibility rules.
   *
   * Rules:
   * - id columns: hidden=true, editable=false
   * - datetime or *date* columns: hidden=false, editable=false
   * - *_by columns: hidden=false, editable=false
   * - isEncrypted fields: hidden=true, editable=true [S-10]
   * - All others: hidden=false, editable=true
   */
  private buildHeader(fields: CoreTablesField[]): TabularHeaderDto[] {
    return fields.map((field, index) => {
      const colName = field.columnName;
      const colNameLower = colName.toLowerCase();
      const header: TabularHeaderDto = {
        text: field.columnDisplayName || colName,
        datafield: colName,
        columnName: colName,
        aggregates: [],
        pinned: false,
        hidden: false,
        editable: true,
        columntype: field.type,
        index,
      };

      if (colNameLower === 'id') {
        header.hidden = true;
        header.editable = false;
      } else if (field.type === 'datetime' || colNameLower.includes('date')) {
        header.hidden = false;
        header.editable = false;
      } else if (colNameLower.endsWith('_by')) {
        header.hidden = false;
        header.editable = false;
      } else if (field.isEncrypted) {
        // [S-10] Use isEncrypted flag instead of column name heuristic
        header.hidden = true;
        header.editable = true;
      }

      return header;
    });
  }

  /**
   * Build dynamic SELECT SQL with:
   * - AES_DECRYPT for encrypted fields (using isEncrypted flag) [S-10]
   * - DATE_FORMAT for date fields (parameterized format) [S-02]
   * - LEFT JOINs for _by fields (user full name lookup) [P-02]
   * - IFNULL to replace nulls with empty strings
   * - All column names sanitized [S-01]
   * - coreDbName sanitized [S-03]
   */
  private buildSelectSql(
    tableName: string,
    fields: CoreTablesField[],
    aesKey: string,
    dateFormat: string,
    coreDbName: string,
  ): { sql: string; values: unknown[] } {
    const selectCols: string[] = [];
    const values: unknown[] = [];
    const byJoins: { alias: string; colName: string }[] = [];
    let joinIndex = 0;

    for (const field of fields) {
      const colName = this.sanitizeIdentifier(field.columnName); // [S-01]
      const colNameLower = colName.toLowerCase();

      if (field.isEncrypted) {
        // [S-10] Encrypted field: AES_DECRYPT
        selectCols.push(`IFNULL(CAST(AES_DECRYPT(t.\`${colName}\`, ?) AS CHAR), '') AS \`${colName}\``);
        values.push(aesKey);
      } else if (field.type === 'datetime' || colNameLower.includes('date')) {
        // Date field: DATE_FORMAT with parameterized format [S-02]
        selectCols.push(`IFNULL(DATE_FORMAT(t.\`${colName}\`, ?), '') AS \`${colName}\``);
        values.push(dateFormat);
      } else if (colNameLower.endsWith('_by')) {
        // [P-02] User reference: LEFT JOIN instead of correlated subquery
        const alias = `u${joinIndex++}`;
        byJoins.push({ alias, colName });
        selectCols.push(`IFNULL(CONCAT(${alias}.firstName, ' ', ${alias}.lastName), '') AS \`${colName}\``);
      } else {
        // Standard field
        selectCols.push(`IFNULL(t.\`${colName}\`, '') AS \`${colName}\``);
      }
    }

    // Build SQL with LEFT JOINs [P-02]
    let sql = `SELECT ${selectCols.join(', ')} FROM \`${tableName}\` t`;
    for (const join of byJoins) {
      sql += ` LEFT JOIN \`${coreDbName}\`.core_application_users ${join.alias} ON ${join.alias}.id = t.\`${join.colName}\``;
    }

    return { sql, values };
  }

  /**
   * Validate that a table/column identifier contains only safe characters.
   * Prevents SQL injection in dynamic table name references.
   */
  private sanitizeIdentifier(name: string): string {
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      throw new BadRequestException('Invalid identifier');
    }
    return name;
  }
}

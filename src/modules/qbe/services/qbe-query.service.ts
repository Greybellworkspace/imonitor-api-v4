import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { SystemConfigService } from '../../../shared/services/system-config.service';
import { AvailableRoles } from '../../../shared/enums/roles.enum';
import { ErrorMessages } from '../../../shared/constants/error-messages';
import { capitalize, generateHash } from '../../../shared/helpers/common.helper';
import {
  TimeFilters,
  TimeConvert,
  MaxIntervals,
  DateFormats,
  FieldTypes,
} from '../../reports/services/query-builder.service';
import { ITabularHeader, IFieldsArrayEntry } from '../../reports/dto/report-interfaces';
import { QbeRunDto } from '../dto';

/** Ref table key matching v3 REF_TABLE_KEY */
const REF_TABLE_KEY = 'refTable';

/** Regex for from/to date placeholders (with or without quotes) */
const FROM_DATE_REGEX = /_fromDate_|'_fromDate_'/g;
const TO_DATE_REGEX = /_toDate_|'_toDate_'/g;

@Injectable()
export class QbeQueryService {
  private readonly logger = new Logger(QbeQueryService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly legacyDataDb: LegacyDataDbService,
    private readonly dateHelper: DateHelperService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // SQL Validation
  // ---------------------------------------------------------------------------

  /** Validate that a SQL query is safe (SELECT only, no DML/DDL). */
  isQuerySafe(sql: string): boolean {
    const selectRegex = /^\s*SELECT\b/i;
    if (!selectRegex.test(sql)) {
      return false;
    }
    const injectionRegex = /(insert|update|delete|drop|alter)/i;
    if (injectionRegex.test(sql)) {
      return false;
    }
    return true;
  }

  /** Validate that SQL contains both _fromDate_ and _toDate_ placeholders. */
  isDateSafe(sql: string): void {
    const containsFrom = sql.match(FROM_DATE_REGEX) != null;
    const containsTo = sql.match(TO_DATE_REGEX) != null;

    if (!containsFrom && !containsTo) {
      throw new BadRequestException(QbeErrorMessages.DATES_KEYS_MISSING);
    }
    if (!containsFrom) {
      throw new BadRequestException(QbeErrorMessages.DATE_FROM_KEY_MISSING);
    }
    if (!containsTo) {
      throw new BadRequestException(QbeErrorMessages.DATE_TO_KEY_MISSING);
    }
  }

  /** Full safety check for saving a QBE (non-empty + SELECT-only + date placeholders). */
  checkQbeSafety(sql: string): void {
    if (sql.length === 0) {
      throw new BadRequestException(QbeErrorMessages.SQL_EMPTY);
    }
    if (!this.isQuerySafe(sql)) {
      throw new BadRequestException(QbeErrorMessages.UNSAFE_QUERY);
    }
    this.isDateSafe(sql);
  }

  // ---------------------------------------------------------------------------
  // Query Transformation
  // ---------------------------------------------------------------------------

  /**
   * Modify raw SQL: replace table names with fully qualified DB names,
   * map to hourly/daily variants based on timeFilter, replace date placeholders,
   * and validate user privileges for each table.
   */
  async modifyQuery(
    sql: string,
    timeFilter: string,
    fromDate: string,
    toDate: string,
    userId: string,
    isShared: boolean,
    forChecking = false,
  ): Promise<string> {
    const coreDbName = this.configService.get<string>('DB_NAME');
    const dataDbName = this.configService.get<string>('DB_DATA_NAME');

    // Fetch user's privileged tables with their hourly/daily variants and roles
    const tablesQuery = `SELECT
      mt.id,
      mt.tableName AS name,
      mt.tableHourName,
      mt.tableDayName,
      (SELECT Name FROM ${coreDbName}.core_application_roles WHERE Id =
        (SELECT RoleId FROM ${coreDbName}.core_privileges WHERE UserId = ? AND
          ModuleId = (SELECT mId FROM ${coreDbName}.core_modules_tables WHERE Id = mt.id))) AS role
    FROM ${coreDbName}.core_modules_tables mt
    WHERE mt.mId IN (SELECT moduleId FROM ${coreDbName}.core_privileges WHERE userId = ?)
      AND mt.tableName <> ?
    ORDER BY mt.displayName`;

    const sideTables = await this.dataSource.query(tablesQuery, [userId, userId, REF_TABLE_KEY]);

    const dailyMapping: Record<string, string> = {};
    const hourlyMapping: Record<string, string> = {};
    const tableRoles: Record<string, string> = {};
    const tableNames: string[] = [];

    for (const table of sideTables) {
      const name = (table.name as string).trim();
      tableNames.push(name);
      dailyMapping[name] = table.tableDayName || name;
      hourlyMapping[name] = table.tableHourName || name;
      tableRoles[name] = table.role || AvailableRoles.DEFAULT;
    }

    // Also get core table names (for cross-database references)
    const selectCoreTables = `SELECT table_name FROM information_schema.tables WHERE table_schema = ?`;
    const coreTables = await this.dataSource.query(selectCoreTables, [coreDbName]);
    const coreTableNames = coreTables.map((val: { table_name: string }) => val.table_name);

    const accessErrorMessage = forChecking
      ? ErrorMessages.USER_NOT_PRIVILEGED_TO_SAVE
      : QbeErrorMessages.TABLE_ACCESS_DENIED;

    // Replace FROM <table_name> with fully qualified database.table references
    const modifiedQuery = sql.replace(/from\s+(\w+)/gi, (match, tableName: string) => {
      const name = tableName.trim();
      if (tableNames.includes(name) || tableNames.includes(capitalize(name))) {
        const lookupName = tableNames.includes(name) ? name : capitalize(name);
        if (tableRoles[lookupName] === AvailableRoles.DEFAULT && isShared === false) {
          throw new BadRequestException(accessErrorMessage);
        }
        let newTableName = capitalize(lookupName);
        if (timeFilter === TimeFilters.hour) {
          newTableName = hourlyMapping[lookupName] || newTableName;
        } else if (timeFilter !== TimeFilters.minute) {
          newTableName = dailyMapping[lookupName] || newTableName;
        }
        return `FROM ${dataDbName}.${newTableName}`;
      } else if (coreTableNames.includes(name)) {
        return `FROM ${coreDbName}.${name}`;
      } else {
        throw new BadRequestException(QbeErrorMessages.TABLE_NOT_FOUND + `( ${match} )`);
      }
    });

    // Replace date placeholders with actual date values
    const dateModifiedQuery = modifiedQuery
      .replace(TO_DATE_REGEX, `'${toDate}'`)
      .replace(FROM_DATE_REGEX, `'${fromDate}'`);

    return dateModifiedQuery;
  }

  // ---------------------------------------------------------------------------
  // Query Execution (processQuery)
  // ---------------------------------------------------------------------------

  /**
   * Validate, transform, and execute a QBE query.
   * Returns header, fields, body, original query, and processed query.
   */
  async processQuery(
    sql: string,
    timeFilter: string,
    fromDate: string,
    toDate: string,
    userId: string,
    isShared: boolean,
  ): Promise<QbeRunDto> {
    // Step 1: Safety validation
    if (!this.isQuerySafe(sql)) {
      throw new BadRequestException(QbeErrorMessages.UNSAFE_QUERY);
    }
    this.isDateSafe(sql);

    // Step 2: Date format normalization + interval validation
    let converter = 1;
    let maxInterval: string | null = null;

    switch (timeFilter) {
      case TimeFilters.minute:
        maxInterval = MaxIntervals.maxHourInterval;
        converter = TimeConvert.MinutesAndHours;
        fromDate = this.dateHelper.formatDate(DateFormats.ReportFormatMinutes, this.dateHelper.parseISO(fromDate));
        toDate = this.dateHelper.formatDate(DateFormats.ReportFormatMinutes, this.dateHelper.parseISO(toDate));
        break;
      case TimeFilters.hour:
        maxInterval = MaxIntervals.maxHourInterval;
        converter = TimeConvert.MinutesAndHours;
        fromDate = this.dateHelper.formatDate(DateFormats.ReportFormatHourly, this.dateHelper.parseISO(fromDate));
        toDate = this.dateHelper.formatDate(
          DateFormats.ReportFormatHoulyEndOfHour,
          this.dateHelper.parseISO(toDate),
        );
        break;
      case TimeFilters.day:
      case TimeFilters.week:
      case TimeFilters.month:
      case TimeFilters.year:
        maxInterval = MaxIntervals.maxDailyInterval;
        converter = TimeConvert.DayAndAbove;
        fromDate = this.dateHelper.formatDate(DateFormats.ReportFormatDaily, this.dateHelper.parseISO(fromDate));
        toDate = this.dateHelper.formatDate(DateFormats.ReportFormatStartOfDate, this.dateHelper.parseISO(toDate));
        break;
      default:
        throw new BadRequestException(QbeErrorMessages.INCORRECT_TIME_FILTER);
    }

    // Validate date interval against system config
    const allowedInterval = await this.systemConfig.getConfigValue(maxInterval);
    const dateDiff = (new Date(toDate).getTime() - new Date(fromDate).getTime()) / converter;
    if (allowedInterval && dateDiff > parseInt(allowedInterval, 10)) {
      throw new BadRequestException(QbeErrorMessages.INTERVAL_OUT_OF_RANGE);
    }

    // Step 3: Transform query (table resolution, date replacement, privilege check)
    const processedQuery = await this.modifyQuery(sql, timeFilter, fromDate, toDate, userId, isShared);

    // Step 4: Execute query via limited pool (nativeQuery)
    let result: unknown;
    try {
      result = await this.legacyDataDb.nativeQuery(processedQuery);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    // Step 5: Build header + fields from column metadata
    // nativeQuery returns [rows, fields] from mysql2
    const rows = Array.isArray(result) ? (result as unknown[])[0] : [];
    const columnMeta = Array.isArray(result) ? (result as unknown[])[1] : [];

    let fieldIndex = 1;
    const header: ITabularHeader[] = [];
    const fields: IFieldsArrayEntry[] = [];

    if (Array.isArray(columnMeta)) {
      for (const value of columnMeta) {
        const col = value as { name: string; encoding?: string };
        const displayName = col.name;
        const draggedId = await generateHash(displayName);

        // Determine field type from column metadata
        let type = FieldTypes.number;
        if (col.encoding === 'utf8') {
          type = FieldTypes.alpha;
        }
        if (displayName.toLowerCase().includes('date')) {
          type = FieldTypes.datetime;
        }

        header.push({
          text: displayName,
          datafield: displayName,
          aggregates: ['count'],
          pinned: false,
          hidden: false,
          index: fieldIndex,
          draggedId,
          headerColumnType: type,
        });

        fields.push({
          draggedId,
          columnDisplayName: displayName,
          type,
          isCustomColumn: false,
          operation: 'sum',
        });

        fieldIndex++;
      }
    }

    const body = Array.isArray(rows) ? (rows as unknown[]) : [];

    return {
      header,
      fields,
      body,
      query: sql,
      processedQuery,
    };
  }
}

// ---------------------------------------------------------------------------
// QBE-specific error messages (preserving v3 qbeMessages exactly)
// ---------------------------------------------------------------------------
export const QbeErrorMessages = {
  UNSAFE_QUERY: 'The query you are trying to execute is unsafe',
  SQL_EMPTY: 'please make sure to have an sql query before saving',
  DATES_KEYS_MISSING: 'Please make sure to use _fromDate_ and _toDate_ in your query',
  DATE_FROM_KEY_MISSING: 'The _fromDate_ key is missing from the query',
  DATE_TO_KEY_MISSING: 'The _toDate_ key is missing from the query',
  INCORRECT_TIME_FILTER: 'Incorrect time filter',
  TABLE_NOT_FOUND: 'incorrect table name: ',
  TABLE_ACCESS_DENIED: 'You are unauthorized to use one or more table',
  INTERVAL_OUT_OF_RANGE: 'Chosen interval is out of range\nPlease choose a smaller interval!',
  QBE_NOT_FOUND: 'Qbe does not exist',
  SHARED_QBE_NOT_FOUND: 'Shared Qbe does not exist',
} as const;

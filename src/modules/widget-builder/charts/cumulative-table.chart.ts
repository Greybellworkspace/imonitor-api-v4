/**
 * Cumulative Table chart generator — ported from v3 infrastructure/charts/cumulativeTable.chart.ts.
 *
 * Converts WB to report format with date field, uses generate() with
 * CumulativeIntervalAdjuster for time-based cumulation.
 */

import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import {
  IChartData,
  ICustomOperationColumn,
  IFieldsArrayEntry,
  ITabularHeader,
  ITabularOrderBy,
  IMinimalTabularTable,
} from '../../reports/dto/report-interfaces';
import {
  FieldTypes,
  TimeFilters,
  MaxIntervals,
  TimeIntervals,
  TimeConvert,
  DateFormats,
} from '../../reports/services/query-builder.service';
import { GenerateResultDto } from '../../reports/services/query-builder.service';
import { GenerateReportDto } from '../../reports/dto/generate-report.dto';
import { SPACE_COMMA_SPACE_KEY } from '../../reports/constants';
import { kpiCalculator, hotkeyTransform } from '../../reports/charts/chart-helpers';
import { constructTabularThreshold, IThresholdTime } from './threshold-helpers';

// Re-export SystemKeys dateFormat constant
const SYSTEM_DATE_FORMAT_1 = 'chartDateFormat';

export interface ICumulativeDataField {
  draggedId: string;
  hidden: boolean;
  pinned: boolean;
  threshold?: IThresholdTime & { colors?: Record<string, string> };
}

export interface ICumulativeTableChartOptions {
  dataFields: ICumulativeDataField[];
  timeFilter: string;
  backPeriod?: number;
  complete?: boolean;
  untilNow?: boolean;
  textTransform?: string;
}

export interface ICumulativeTableDeps {
  legacyDataDb: LegacyDataDbService;
  dateHelper: DateHelperService;
  coreDbName: string;
  /** Callback to call QueryBuilderService.generate() for the report-mode query */
  generateReport: (
    tabularObject: GenerateReportDto,
    maxInterval: string,
    timeFilter: string,
    dateFormat: string,
    converter: number,
  ) => Promise<GenerateResultDto>;
  /** Callback to fetch refTable ID */
  getRefTableId: () => Promise<string>;
  /** Callback to fetch date field info for a table */
  getDateFieldForTable: (
    tableId: string,
  ) => Promise<{ id: string; columnName: string; columnDisplayName: string } | null>;
}

/**
 * Adjust fromDate/toDate for cumulative table based on timeFilter and backPeriod.
 * Ported from v3 CumulativeIntervalAdjuster.
 */
function cumulativeIntervalAdjuster(
  chartOptions: ICumulativeTableChartOptions,
  generateObject: GenerateReportDto,
  dateHelper: DateHelperService,
): void {
  const backPeriod = chartOptions.backPeriod || 0;

  if (chartOptions.timeFilter === TimeFilters.hour) {
    const deductionHours = backPeriod - 1;
    if (chartOptions.complete) {
      generateObject.fromDate = dateHelper.formatDate(
        DateFormats.ReportFormatHourly,
        dateHelper.subtractDurationFromDate({ hours: deductionHours }),
      );
      if (chartOptions.untilNow) {
        generateObject.toDate = dateHelper.formatDate(DateFormats.ReportFormatMinutes);
      } else {
        generateObject.toDate = dateHelper.formatDate(
          DateFormats.ReportFormatHourly,
          dateHelper.subtractDurationFromDate({ hours: 1 }),
        );
      }
    } else {
      generateObject.fromDate = dateHelper.formatDate(
        DateFormats.ReportFormatMinutes,
        dateHelper.subtractDurationFromDate({ hours: backPeriod }),
      );
      generateObject.toDate = dateHelper.formatDate(DateFormats.ReportFormatMinutes);
    }
  } else if (chartOptions.timeFilter === TimeFilters.day) {
    if (chartOptions.complete) {
      generateObject.fromDate = dateHelper.formatDate(DateFormats.ReportFormatDaily);
      if (chartOptions.untilNow) {
        generateObject.toDate = dateHelper.formatDate(DateFormats.ReportFormatMinutes);
      } else {
        generateObject.toDate = dateHelper.formatDate(DateFormats.ReportFormatStartOfDate);
      }
    } else {
      generateObject.fromDate = dateHelper.formatDate(
        DateFormats.ReportFormatMinutes,
        dateHelper.subtractDurationFromDate({ hours: backPeriod }),
      );
      generateObject.toDate = dateHelper.formatDate(DateFormats.ReportFormatMinutes);
    }
  }
}

function generateGuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function generateWidgetCumulativeTable(
  generateObject: {
    tables: Array<IMinimalTabularTable>;
    orderBy: ITabularOrderBy[];
    operation: ICustomOperationColumn[];
    timeFilter?: string;
    [key: string]: unknown;
  },
  chartObject: IChartData,
  deps: ICumulativeTableDeps,
): Promise<IChartData> {
  const mainTable = 'mainResult';
  let isDateFieldAdded = false;
  const groupByStatements: string[] = [];
  const headers: ITabularHeader[] = [];
  const selectionQueryStatements: string[] = [];
  const options = chartObject['options'] as ICumulativeTableChartOptions;
  const lib = (chartObject as Record<string, unknown>)['lib'] as Record<string, unknown>;
  lib['calculatedThreshold'] = {};

  const refTableId = await deps.getRefTableId();

  for (const generateTable of generateObject.tables) {
    const dateField = generateTable.fields.find((f) => f.type === FieldTypes.datetime);

    if (generateTable.id !== refTableId && !dateField && !isDateFieldAdded) {
      const dateResult = await deps.getDateFieldForTable(generateTable.id);
      if (dateResult) {
        const dateDraggedId = generateGuid();
        generateTable.fields.push({
          draggedId: dateDraggedId,
          footerAggregation: ['0'],
          operation: '0',
          decimalNumbers: 0,
          thresholdUpperValue: 0,
          thresholdLowerValue: 0,
          dateFormat: SYSTEM_DATE_FORMAT_1,
          hidden: false,
          pinned: false,
          index: 0,
          id: dateResult.id,
          columnName: dateResult.columnName,
          columnDisplayName: dateResult.columnDisplayName,
          type: FieldTypes.datetime,
        } as unknown as import('../../reports/dto/report-interfaces').IReportField);

        isDateFieldAdded = true;
      }
      break;
    }
  }

  generateObject.timeFilter = TimeFilters.minute;

  const generateReportObject: GenerateReportDto = {
    fromDate: '',
    toDate: '',
    timeFilter: generateObject.timeFilter,
    ...generateObject,
  } as GenerateReportDto;

  cumulativeIntervalAdjuster(options, generateReportObject, deps.dateHelper);

  const generateResult = await deps.generateReport(
    generateReportObject,
    MaxIntervals.maxHourInterval,
    TimeIntervals.minute,
    '',
    TimeConvert.MinutesAndHours,
  );

  for (const dataField of options.dataFields) {
    const columnHeader = generateResult.header.find((f) => f.draggedId === dataField.draggedId);
    if (!columnHeader) continue;

    if (columnHeader.headerColumnType === FieldTypes.alpha || columnHeader.headerColumnType === FieldTypes.datetime) {
      selectionQueryStatements.push(`${mainTable}.\`${columnHeader.text}\` AS \`${columnHeader.text}\``);
      groupByStatements.push(`${mainTable}.\`${columnHeader.text}\``);
    } else if (columnHeader.headerColumnType === FieldTypes.number) {
      const correctedString = kpiCalculator(
        generateObject.tables.length,
        generateResult.fieldsArray as IFieldsArrayEntry[],
        generateObject.operation,
        dataField.draggedId,
        mainTable,
        `AS \`${columnHeader.text}\``,
      );
      selectionQueryStatements.push(correctedString);
    }

    columnHeader.hidden = dataField.hidden;
    columnHeader.pinned = dataField.pinned;
    headers.push(columnHeader);

    if (dataField.threshold) {
      const calculatedThreshold = constructTabularThreshold(dataField.threshold);
      if (calculatedThreshold) {
        (lib['calculatedThreshold'] as Record<string, unknown>)[dataField.draggedId] = {
          ...calculatedThreshold,
          colors: dataField.threshold.colors,
        };
      }
    }
  }

  let orderByString = '';
  if (generateObject.orderBy && generateObject.orderBy.length > 0) {
    orderByString += ' ORDER BY ';
    const orderByClauses: string[] = [];
    for (const column of generateObject.orderBy) {
      const isFieldUsed = options.dataFields.findIndex((f) => f.draggedId === column.draggedId);
      if (isFieldUsed >= 0) {
        const orderField = (generateResult.fieldsArray as IFieldsArrayEntry[]).find(
          (f) => f.draggedId === column.draggedId,
        );
        if (orderField) {
          orderByClauses.push(`\`${orderField.columnDisplayName}\` ${column.orderBy}`);
        }
      }
    }
    orderByString += orderByClauses.join(SPACE_COMMA_SPACE_KEY);
  }

  const groupByString = groupByStatements.length > 0 ? 'GROUP BY ' + groupByStatements.join(', ') : '';
  const finalQuery = `SELECT ${selectionQueryStatements.join(', ')} FROM (${generateResult.query}) AS ${mainTable} ${groupByString} ${orderByString}`;

  const body = await deps.legacyDataDb.query(finalQuery);

  lib['body'] = body;
  lib['header'] = headers;

  const transformedText = await hotkeyTransform(
    options.textTransform,
    { fromDate: generateReportObject.fromDate, toDate: generateReportObject.toDate },
    deps.legacyDataDb,
    deps.dateHelper,
    deps.coreDbName,
  );
  chartObject.name = transformedText || '';

  return chartObject;
}

/**
 * Widget Builder Trend chart generator — ported from v3 trend.chart.ts (generateWidgetTrend).
 *
 * Adds datetime field if missing, adjusts interval via TrendIntervalAdjuster,
 * then delegates to the Reports generateTrend function.
 */

import { BadRequestException } from '@nestjs/common';
import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { ErrorMessages } from '../../../shared/constants/error-messages';
import {
  IChartData,
  ICustomCompareColumn,
  ICustomOperationColumn,
  IMinimalTabularTable,
} from '../../reports/dto/report-interfaces';
import { FieldTypes } from '../../reports/services/query-builder.service';
import { GenerateResultDto } from '../../reports/services/query-builder.service';
import { GenerateReportDto } from '../../reports/dto/generate-report.dto';
import { generateTrend } from '../../reports/charts/trend.chart';
import { deepCopy } from '../../reports/charts/chart-helpers';

export interface IWidgetTrendChartOptions {
  labelFields: string[];
  dataFields: Array<{
    draggedId: string;
    dataId: string;
    type: string;
    color?: string;
    barWidth?: string;
    barGap?: string;
    symbolSize?: number;
    smooth?: boolean;
    showSymbol?: boolean;
    lineStyle?: Record<string, unknown>;
    step?: string;
    stacked?: boolean;
    filled?: boolean;
    areaGradient?: boolean;
    explode?: boolean;
    explodeBy?: string;
    serieIndexes?: number[];
    label?: Record<string, unknown>;
  }>;
  textTransform?: string;
  subTextTransform?: string;
  timeFilter: string;
  timeRange: number;
  completeDay?: boolean;
  incluceYear?: boolean;
}

export interface IWidgetTrendDeps {
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
 * TrendIntervalAdjuster - adjusts from/to dates for WB trend charts.
 * Ported from v3 chart.util.ts TrendIntervalAdjuster.
 */
function trendIntervalAdjuster(
  compareHours: number,
  completeDay: boolean,
  dateHelper: DateHelperService,
): { fromDate: string; toDate: string } {
  const deductionMinutes = compareHours * 60 - 1;

  if (completeDay) {
    const trendToDate = dateHelper.formatDate('yyyy-MM-dd 23:59');
    const trendFromDate = dateHelper.formatDate(
      'yyyy-MM-dd 00:00',
      dateHelper.subtractDurationFromDate({ minutes: deductionMinutes }, dateHelper.parseISO(trendToDate)),
    );
    return { fromDate: trendFromDate, toDate: trendToDate };
  }

  const trendToDate = dateHelper.formatDate('yyyy-MM-dd HH:mm');
  const trendFromDate = dateHelper.formatDate(
    'yyyy-MM-dd HH:mm',
    dateHelper.subtractDurationFromDate({ minutes: deductionMinutes }, dateHelper.parseISO(trendToDate)),
  );
  return { fromDate: trendFromDate, toDate: trendToDate };
}

function generateGuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function generateWidgetTrend(
  generateObject: {
    tables: Array<IMinimalTabularTable>;
    compare: ICustomCompareColumn[];
    operation: ICustomOperationColumn[];
    timeFilter?: string;
    [key: string]: unknown;
  },
  chartObject: IChartData,
  deps: IWidgetTrendDeps,
): Promise<IChartData> {
  const options = chartObject['options'] as IWidgetTrendChartOptions;

  const hasDuplicateFields = options.dataFields.some(
    (item, index) =>
      options.dataFields.findIndex(
        (dataId, foundIndex) => dataId.draggedId === item.draggedId && index !== foundIndex,
      ) !== -1,
  );
  if (hasDuplicateFields) {
    throw new BadRequestException(ErrorMessages.CHART_DUPLICATE_FIELD);
  }

  generateObject.timeFilter = options.timeFilter;
  const shouldIncludeYear = options.incluceYear || false;
  const tempChartObject = deepCopy(chartObject) as IChartData;
  const dateFormat = shouldIncludeYear ? 'chartYearlyDateFormat' : 'chartDateFormat';

  try {
    let isDateFieldAdded = false;
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
            dateFormat,
            hidden: false,
            pinned: false,
            index: 0,
            id: dateResult.id,
            columnName: dateResult.columnName,
            columnDisplayName: dateResult.columnDisplayName,
            type: FieldTypes.datetime,
          } as unknown as import('../../reports/dto/report-interfaces').IReportField);

          (tempChartObject['options'] as IWidgetTrendChartOptions).labelFields = [dateDraggedId];
          isDateFieldAdded = true;
          break;
        }
      }
    }
  } catch (_error) {
    throw new BadRequestException(ErrorMessages.CHART_TREND_ERROR);
  }

  const adjustedInterval = trendIntervalAdjuster(options.timeRange, options.completeDay || false, deps.dateHelper);

  const generateReportObject: GenerateReportDto = {
    fromDate: adjustedInterval.fromDate,
    toDate: adjustedInterval.toDate,
    timeFilter: generateObject.timeFilter,
    ...generateObject,
  } as GenerateReportDto;

  const generateResult = await deps.generateReport(generateReportObject, 'MaxHourInterval', 'minute', '', 3600000);

  const trendChart = await generateTrend(
    {
      query: generateResult.query,
      fieldsArray: generateResult.fieldsArray,
      tables: generateObject.tables,
      operation: generateObject.operation,
    },
    tempChartObject,
    adjustedInterval,
    generateObject.compare,
    deps.legacyDataDb,
    deps.dateHelper,
    deps.coreDbName,
  );

  (chartObject as Record<string, unknown>)['lib'] = (trendChart as Record<string, unknown>)['lib'];

  for (const dataField of (trendChart['options'] as IWidgetTrendChartOptions).dataFields) {
    const realField = options.dataFields.find((f) => f.draggedId === dataField.draggedId);
    if (realField) {
      realField.serieIndexes = [...(dataField.serieIndexes || [])];
    }
  }

  return chartObject;
}

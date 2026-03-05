/**
 * Compare Trend chart generator — ported from v3 infrastructure/charts/compareTrend.chart.ts.
 *
 * Adds compare columns dynamically, then delegates to generateTrend().
 */

import { BadRequestException } from '@nestjs/common';
import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { ErrorMessages } from '../../../shared/constants/error-messages';
import {
  IChartData,
  ICustomCompareColumn,
  ICustomControlColumn,
  ICustomOperationColumn,
  IMinimalTabularTable,
} from '../../reports/dto/report-interfaces';
import {
  FieldTypes,
  FieldFunctions,
  CustomColumnType,
  TimeIntervals,
} from '../../reports/services/query-builder.service';
import { GenerateResultDto } from '../../reports/services/query-builder.service';
import { GenerateReportDto } from '../../reports/dto/generate-report.dto';
import { generateTrend } from '../../reports/charts/trend.chart';
import { deepCopy, isUndefinedOrNull } from '../../reports/charts/chart-helpers';

export interface ICompareTrendChartOptions {
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
  backPeriod: number;
  completeDay?: boolean;
  incluceYear?: boolean;
}

export interface ICompareTrendDeps {
  legacyDataDb: LegacyDataDbService;
  dateHelper: DateHelperService;
  coreDbName: string;
  generateReport: (
    tabularObject: GenerateReportDto,
    maxInterval: string,
    timeFilter: string,
    dateFormat: string,
    converter: number,
  ) => Promise<GenerateResultDto>;
  getRefTableId: () => Promise<string>;
  getDateFieldForTable: (
    tableId: string,
  ) => Promise<{ id: string; columnName: string; columnDisplayName: string } | null>;
}

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

export async function generateWidgetCompareTrend(
  generateObject: {
    tables: Array<IMinimalTabularTable>;
    compare: ICustomCompareColumn[];
    operation: ICustomOperationColumn[];
    control: ICustomControlColumn[];
    priority?: ICustomControlColumn[];
    inclusion?: ICustomControlColumn[];
    timeFilter?: string;
    [key: string]: unknown;
  },
  chartObject: IChartData,
  deps: ICompareTrendDeps,
): Promise<IChartData> {
  const options = chartObject['options'] as ICompareTrendChartOptions;

  generateObject.timeFilter = options.timeFilter;

  const hasDuplicateFields = options.dataFields.some(
    (item, index) =>
      options.dataFields.findIndex((elt, foundIndex) => elt.draggedId === item.draggedId && index !== foundIndex) !==
      -1,
  );
  if (hasDuplicateFields) {
    throw new BadRequestException(ErrorMessages.CHART_DUPLICATE_FIELD);
  }

  const tempChartObject = deepCopy(chartObject) as IChartData;
  const shouldIncludeYear = options.incluceYear || false;
  const dateFormat = shouldIncludeYear ? 'chartYearlyDateFormat' : 'chartDateFormat';

  // Filter xAxis to primary only
  const tempLib = (tempChartObject as Record<string, unknown>)['lib'] as Record<string, unknown>;
  const xAxisArray = (tempLib['xAxis'] as Array<Record<string, unknown>>) || [];
  tempLib['xAxis'] = xAxisArray.filter(
    (axis) => !('primary' in axis) || (axis as Record<string, unknown>)['primary'] === true,
  );

  const temporaryFieldMapping: Record<string, string> = {};
  const compareColumns: Array<{
    draggedId: string;
    isCustom: boolean;
    usedColumnId: string;
    operation: string;
    columnDisplayName: string;
  }> = [];

  const allCustomFields = [
    ...generateObject.operation,
    ...generateObject.control,
    ...generateObject.compare,
    ...(generateObject.priority || []),
    ...(generateObject.inclusion || []),
  ];

  // Add new compare fields for each data field
  for (const dataField of options.dataFields) {
    const newCompareColumnId = generateGuid();

    if (allCustomFields.some((f) => f.draggedId === dataField.draggedId)) {
      const customFields = [...generateObject.operation, ...generateObject.control];
      const customField = customFields.find((f) => f.draggedId === dataField.draggedId);

      if (isUndefinedOrNull(customField)) {
        throw new BadRequestException(ErrorMessages.CHART_TREND_ERROR);
      }

      compareColumns.push({
        draggedId: newCompareColumnId,
        isCustom: true,
        usedColumnId: dataField.draggedId,
        operation: '',
        columnDisplayName: customField.columnDisplayName,
      });
    } else {
      let fieldFound = false;
      for (const generateTable of generateObject.tables) {
        if (fieldFound) break;
        for (const generateField of generateTable.fields) {
          if (generateField.draggedId === dataField.draggedId) {
            compareColumns.push({
              draggedId: newCompareColumnId,
              isCustom: false,
              usedColumnId: generateField.draggedId,
              operation: generateField.operation || '',
              columnDisplayName: generateField.columnDisplayName,
            });
            fieldFound = true;
            break;
          }
        }
      }
    }

    dataField.serieIndexes = [];
    temporaryFieldMapping[newCompareColumnId] = dataField.draggedId;

    const tempOptions = tempChartObject['options'] as ICompareTrendChartOptions;
    tempOptions.dataFields.push({
      draggedId: newCompareColumnId,
      explodeBy: dataField.explodeBy,
      explode: dataField.explode,
      lineStyle: dataField.lineStyle,
      type: dataField.type,
      dataId: dataField.dataId,
      serieIndexes: [],
      smooth: dataField.smooth,
      showSymbol: dataField.showSymbol,
      filled: dataField.filled,
      areaGradient: dataField.areaGradient,
      step: dataField.step,
      barWidth: dataField.barWidth,
      barGap: dataField.barGap,
      symbolSize: dataField.symbolSize,
      label: dataField.label,
    });
  }

  try {
    // Add compare columns to the generate object
    for (const compareField of compareColumns) {
      generateObject.compare.push({
        draggedId: compareField.draggedId,
        columnDisplayName: compareField.columnDisplayName + ' - ' + options.backPeriod + ' hours ago',
        timeFilter: TimeIntervals.hour,
        backPeriod: options.backPeriod,
        customColumn: compareField.isCustom,
        customColumnType: CustomColumnType.COMPARE,
        operation: FieldFunctions.sum,
        footerAggregation: [],
        withStatDate: true,
        dateFormat,
        hidden: false,
        pinned: false,
        isCustom: compareField.isCustom,
        tablesUsed: [],
        index: generateObject.compare.length,
        type: FieldTypes.number,
        usedColumnId: compareField.usedColumnId,
        trunc: false,
        round: false,
        trValue: 0,
      });
    }

    // Add date field if missing
    let isDateFieldAdded = false;
    for (const generateTable of generateObject.tables) {
      const dateField = generateTable.fields.find((f) => f.type === FieldTypes.datetime);
      const isAllAlphaTable = generateTable.fields.every((f) => f.type === FieldTypes.alpha);

      if (!isAllAlphaTable && !isDateFieldAdded) {
        if (!dateField) {
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

            (tempChartObject['options'] as ICompareTrendChartOptions).labelFields = [dateDraggedId];
            isDateFieldAdded = true;
          }
        }
        break;
      }
    }
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
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

  for (const dataField of (trendChart['options'] as ICompareTrendChartOptions).dataFields) {
    const realFieldId = temporaryFieldMapping[dataField.draggedId] || dataField.draggedId;
    const realField = options.dataFields.find((f) => f.draggedId === realFieldId);
    if (realField) {
      realField.serieIndexes = [...(realField.serieIndexes || []), ...(dataField.serieIndexes || [])];
    }
  }

  return chartObject;
}

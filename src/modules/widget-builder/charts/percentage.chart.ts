/**
 * Percentage (gauge) chart generator — ported from v3 infrastructure/charts/percentage.chart.ts.
 *
 * Computes (dataField*100)/totalField, applies threshold + formatting,
 * and populates the gauge chart data structure.
 */

import { BadRequestException } from '@nestjs/common';
import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { ErrorMessages } from '../../../shared/constants/error-messages';
import { IChartData, ICustomOperationColumn, IFieldsArrayEntry } from '../../reports/dto/report-interfaces';
import { FieldTypes, FieldFunctions } from '../../reports/services/query-builder.service';
import { dbIfNull } from '../../reports/utils/sql-helpers';
import {
  kpiCalculator,
  hotkeyTransform,
  normalizeChartValue,
  numberFormatter,
  humanReadableLargeNumber,
  isUndefinedOrNull,
} from '../../reports/charts/chart-helpers';
import {
  calculateThresholdResultByTimeAndTotal,
  ICalculatedThreshold,
  IThresholdTimeAndTotal,
} from './threshold-helpers';

export interface IPercentageChartOptions {
  totalField: string;
  dataField: string;
  color?: string;
  textTransform?: string;
  subTextTransform?: string;
  showInnerTitle?: boolean;
  detailOffsetCenter?: number[];
  titleOffsetCenter?: number[];
  format?: { type: string; value: number };
  value?: number;
  threshold?: IThresholdTimeAndTotal;
  calculatedThreshold?: ICalculatedThreshold;
}

export interface IPercentageGenerateResult {
  query: string;
  fieldsArray: IFieldsArrayEntry[];
  tables: unknown[];
  operation: ICustomOperationColumn[];
}

export async function generateWidgetPercentage(
  generateResult: IPercentageGenerateResult,
  chartObject: IChartData,
  legacyDataDb: LegacyDataDbService,
  dateHelper: DateHelperService,
  coreDbName: string,
): Promise<IChartData> {
  const DEFAULT_TRUNC = 4;
  const mainTable = 'percentageTable';
  const options = chartObject['options'] as IPercentageChartOptions;
  const lib = (chartObject as Record<string, unknown>)['lib'] as Record<string, unknown>;

  const totalField = generateResult.fieldsArray.find((f) => f.draggedId === options.totalField);
  const dataField = generateResult.fieldsArray.find((f) => f.draggedId === options.dataField);

  if (
    isUndefinedOrNull(totalField) ||
    isUndefinedOrNull(dataField) ||
    totalField.type !== FieldTypes.number ||
    dataField.type !== FieldTypes.number
  ) {
    throw new BadRequestException(ErrorMessages.CHART_NO_NUMBER_FIELD);
  }

  const totalFieldQuery = kpiCalculator(
    generateResult.tables.length,
    generateResult.fieldsArray,
    generateResult.operation,
    totalField.draggedId,
    mainTable,
    '',
  );
  const dataFieldQuery = kpiCalculator(
    generateResult.tables.length,
    generateResult.fieldsArray,
    generateResult.operation,
    dataField.draggedId,
    mainTable,
    '',
  );

  const finalQuery = `SELECT ${dbIfNull(totalFieldQuery, '0')} AS total, ${dbIfNull(dataFieldQuery, '0')} AS percentageValue FROM (${generateResult.query}) AS ${mainTable}`;
  const percentageQueryResult = await legacyDataDb.query<{ total: number; percentageValue: number }>(finalQuery);
  const percentageResult = percentageQueryResult[0] || { total: 0, percentageValue: 0 };

  let percentage = 100;
  if (isUndefinedOrNull(percentageResult.percentageValue) || isUndefinedOrNull(percentageResult.total)) {
    percentageResult.percentageValue = 0;
    percentage = 0;
    if (isUndefinedOrNull(percentageResult.total)) {
      percentage = 100;
      percentageResult.total = 0;
    }
  } else {
    percentage =
      percentageResult.total === 0 && percentageResult.percentageValue === 0
        ? 100
        : (percentageResult.percentageValue * 100) / percentageResult.total;
  }

  if (!isFinite(percentage)) percentage = 100;
  percentage = normalizeChartValue(percentage);

  const formatterType = options.format?.type || '';
  const formatValue = options.format?.value || DEFAULT_TRUNC;

  if (formatterType === FieldFunctions.truncate) {
    percentageResult.total = numberFormatter(percentageResult.total, formatterType, formatValue);
    percentage = numberFormatter(percentage, formatterType, formatValue);
    percentageResult.percentageValue = numberFormatter(percentageResult.percentageValue, formatterType, formatValue);
  } else if (formatterType === FieldFunctions.round) {
    percentageResult.total = numberFormatter(percentageResult.total, formatterType, formatValue);
    percentage = numberFormatter(percentage, formatterType, formatValue);
    percentageResult.percentageValue = numberFormatter(percentageResult.percentageValue, formatterType, formatValue);
  } else {
    percentageResult.total = numberFormatter(percentageResult.total, FieldFunctions.truncate, DEFAULT_TRUNC);
    percentage = numberFormatter(percentage, FieldFunctions.truncate, DEFAULT_TRUNC);
    percentageResult.percentageValue = numberFormatter(
      percentageResult.percentageValue,
      FieldFunctions.truncate,
      formatValue,
    );
  }

  const series = lib['series'] as Record<string, unknown>;
  const percentageSerieData = {
    detail: { offsetCenter: options.detailOffsetCenter },
    name: options.showInnerTitle
      ? humanReadableLargeNumber(percentageResult.percentageValue).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      : '',
    title: { offsetCenter: options.titleOffsetCenter },
    value: percentage,
  };
  options.value = percentage;

  if (options.subTextTransform === 'Subtitle' || options.subTextTransform === '') {
    (lib['title'] as Record<string, unknown>)['subtext'] = percentageResult.total
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  } else {
    (lib['title'] as Record<string, unknown>)['subtext'] = await hotkeyTransform(
      options.subTextTransform,
      { fromDate: null, toDate: null },
      legacyDataDb,
      dateHelper,
      coreDbName,
    );
  }

  (series['data'] as unknown[])[0] = percentageSerieData;
  delete (options as unknown as Record<string, unknown>)['calculatedThreshold'];
  delete ((series['progress'] as Record<string, unknown>)?.['itemStyle'] as Record<string, unknown>)?.['color'];

  (series['detail'] as Record<string, unknown>)['color'] = options.color;
  (series['title'] as Record<string, unknown>)['color'] = options.color;

  if (options.threshold) {
    const calculatedThreshold = calculateThresholdResultByTimeAndTotal(
      options.threshold,
      percentageResult.total,
      dateHelper,
    );
    (options as unknown as Record<string, unknown>)['calculatedThreshold'] = {
      ...calculatedThreshold,
      colors: options.threshold.colors,
    };
    const ct = (options as unknown as Record<string, unknown>)['calculatedThreshold'] as ICalculatedThreshold;
    const progressItemStyle =
      ((series['progress'] as Record<string, unknown>)?.['itemStyle'] as Record<string, unknown>) || {};
    if (percentage < ct.lowerRange) {
      (series['detail'] as Record<string, unknown>)['color'] = ct.colors!.lowerRange;
      (series['title'] as Record<string, unknown>)['color'] = ct.colors!.lowerRange;
      progressItemStyle['color'] = ct.colors!.lowerRange;
    } else if (percentage > ct.upperRange) {
      (series['detail'] as Record<string, unknown>)['color'] = ct.colors!.upperRange;
      (series['title'] as Record<string, unknown>)['color'] = ct.colors!.upperRange;
      progressItemStyle['color'] = ct.colors!.upperRange;
    } else {
      (series['detail'] as Record<string, unknown>)['color'] = ct.colors!.midRange;
      (series['title'] as Record<string, unknown>)['color'] = ct.colors!.midRange;
      progressItemStyle['color'] = ct.colors!.midRange;
    }
  }

  const dateObject = { fromDate: null, toDate: null };
  const transformedText = await hotkeyTransform(
    options.textTransform,
    dateObject,
    legacyDataDb,
    dateHelper,
    coreDbName,
  );
  chartObject.name = transformedText || '';
  (lib['title'] as Record<string, unknown>)['text'] = transformedText;

  return chartObject;
}

/**
 * Exploded Percentage chart generator — ported from v3 infrastructure/charts/explodedPercentage.chart.ts.
 *
 * Groups by explodeBy field, computes percentage per group.
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
import { calculateThresholdResultByTimeAndTotal, IThresholdTimeAndTotal } from './threshold-helpers';

export interface IExplodedPercentageChartOptions {
  totalField: string;
  dataField: string;
  explodeBy: string;
  color?: string;
  textTransform?: string;
  subTextTransform?: string;
  showInnerTitle?: boolean;
  detailOffsetCenter?: number[];
  titleOffsetCenter?: number[];
  format?: { type: string; value: number };
  threshold?: IThresholdTimeAndTotal;
}

export interface IExplodedPercentageGenerateResult {
  query: string;
  fieldsArray: IFieldsArrayEntry[];
  tables: unknown[];
  operation: ICustomOperationColumn[];
}

export async function generateWidgetExplodedPercentage(
  generateResult: IExplodedPercentageGenerateResult,
  chartObject: IChartData,
  legacyDataDb: LegacyDataDbService,
  dateHelper: DateHelperService,
  coreDbName: string,
): Promise<IChartData> {
  const DEFAULT_TRUNC = 4;
  const mainTable = 'percentageTable';
  const options = chartObject['options'] as IExplodedPercentageChartOptions;
  const lib = (chartObject as Record<string, unknown>)['lib'] as Record<string, unknown>;

  const totalField = generateResult.fieldsArray.find((f) => f.draggedId === options.totalField);
  const dataField = generateResult.fieldsArray.find((f) => f.draggedId === options.dataField);
  const explodedField = generateResult.fieldsArray.find((f) => f.draggedId === options.explodeBy)!;

  if (
    isUndefinedOrNull(totalField) ||
    isUndefinedOrNull(dataField) ||
    totalField.type !== FieldTypes.number ||
    dataField.type !== FieldTypes.number
  ) {
    throw new BadRequestException(ErrorMessages.CHART_NO_NUMBER_FIELD);
  }

  if (explodedField.type === FieldTypes.number) {
    throw new BadRequestException(ErrorMessages.CHART_FIELD_IS_MISSING);
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

  const finalQuery = `SELECT ${dbIfNull(`\`${explodedField.columnDisplayName}\``, '"NULL"')} AS explode, ${dbIfNull(totalFieldQuery, '0')} AS total, ${dbIfNull(dataFieldQuery, '0')} AS percentageValue FROM (${generateResult.query}) AS ${mainTable} GROUP BY \`${explodedField.columnDisplayName}\``;
  const percentageQueryResult = await legacyDataDb.query<{ total: number; percentageValue: number; explode: string }>(
    finalQuery,
  );

  const percentageOptionsArray: Array<Record<string, unknown>> = [];

  for (const percentageResult of percentageQueryResult) {
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
        DEFAULT_TRUNC,
      );
    }

    const percentageSerieData = {
      detail: { offsetCenter: options.detailOffsetCenter },
      name: options.showInnerTitle
        ? humanReadableLargeNumber(percentageResult.percentageValue).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
        : '',
      title: { offsetCenter: options.titleOffsetCenter },
      value: percentage,
    };

    const explodedData: Record<string, unknown> = {
      data: percentageSerieData,
      title: {
        text: percentageResult.explode,
        subtext: percentageResult.total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','),
      },
    };

    if (options.threshold) {
      const calculatedThreshold = calculateThresholdResultByTimeAndTotal(
        options.threshold,
        percentageResult.total,
        dateHelper,
      );
      explodedData['calculatedThreshold'] = {
        ...calculatedThreshold,
        colors: options.threshold.colors,
      };
    }

    percentageOptionsArray.push(explodedData);
  }

  (chartObject as Record<string, unknown>)['explodedData'] = percentageOptionsArray;

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
  (lib['title'] as Record<string, unknown>)['subtext'] = await hotkeyTransform(
    options.subTextTransform,
    dateObject,
    legacyDataDb,
    dateHelper,
    coreDbName,
  );

  return chartObject;
}

/**
 * Top Bar / Least Bar chart generator — ported from v3 infrastructure/charts/topBar.chart.ts.
 *
 * Top/least N bars with priority/inclusion custom columns, ORDER BY DESC/ASC + LIMIT.
 */

import { BadRequestException } from '@nestjs/common';
import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { ErrorMessages } from '../../../shared/constants/error-messages';
import { IChartData, ICustomOperationColumn, IFieldsArrayEntry } from '../../reports/dto/report-interfaces';
import { CustomColumnType } from '../../reports/services/query-builder.service';
import { SPACE_AND_SPACE_KEY } from '../../reports/constants';
import {
  kpiCalculator,
  hotkeyTransform,
  barLabelChanger,
  IBarSerie,
  isUndefinedOrNull,
} from '../../reports/charts/chart-helpers';
import {
  calculateThresholdResultByTime,
  constructThresholdResult,
  ICalculatedThreshold,
  IChartValueWithThreshold,
  IThresholdTime,
} from './threshold-helpers';

export interface ITopBarDataField {
  draggedId: string;
  type: string;
  color?: string;
  barWidth?: string;
  barGap?: string;
  smooth?: boolean;
  step?: string;
  lineStyle?: Record<string, unknown>;
  symbolSize?: number;
  showSymbol?: boolean;
  areaStyle?: Record<string, unknown> | null;
}

export interface ITopBarChartOptions {
  labelField: string;
  dataField: ITopBarDataField;
  barNumber: number;
  topBar?: boolean;
  leastBar?: boolean;
  textTransform?: string;
  subTextTransform?: string;
  barLabel?: string;
  barLabelBackgroundColor?: string;
  barLabelRotation?: number;
  threshold?: IThresholdTime;
  calculatedThreshold?: ICalculatedThreshold;
}

export interface ITopBarGenerateResult {
  query: string;
  fieldsArray: IFieldsArrayEntry[];
  tables: unknown[];
  operation: ICustomOperationColumn[];
}

export async function generateWidgetTopBar(
  generateResult: ITopBarGenerateResult,
  chartObject: IChartData,
  legacyDataDb: LegacyDataDbService,
  dateHelper: DateHelperService,
  coreDbName: string,
): Promise<IChartData> {
  const lib = (chartObject as Record<string, unknown>)['lib'] as Record<string, unknown>;
  lib['series'] = [];
  const options = chartObject['options'] as ITopBarChartOptions;

  const intermediateInclusionStatements: string[] = [];
  const intermediatePriorityGroupByValue: string[] = [];
  const topOrderByValues: string[] = [];
  const topPriorityOrderByValues: string[] = [];
  const intermediateOrderByValues: string[] = [];

  const mainTopTable = 'topTable';
  const mainIntermediateTable = 'intermediateTable';
  const dataAxisName = 'dataAxis';
  const labelAxisName = 'labelAxis';

  if (isUndefinedOrNull(options.labelField) || isUndefinedOrNull(options.dataField)) {
    throw new BadRequestException(ErrorMessages.CHART_FIELD_IS_MISSING);
  }

  delete (options as unknown as Record<string, unknown>)['calculatedThreshold'];
  if (options.threshold) {
    const calculatedThreshold = calculateThresholdResultByTime(options.threshold, dateHelper);
    if (calculatedThreshold) {
      (options as unknown as Record<string, unknown>)['calculatedThreshold'] = {
        ...calculatedThreshold,
        colors: options.threshold.colors,
      };
    }
  }

  const dataField = options.dataField;
  const dataFieldAxis = generateResult.fieldsArray.find((f) => f.draggedId === dataField.draggedId)!;

  if (options.topBar) {
    topOrderByValues.push(` ${mainTopTable}.\`${dataFieldAxis.columnDisplayName}\` DESC `);
    intermediateOrderByValues.push(` ${mainIntermediateTable}.\`${dataFieldAxis.columnDisplayName}\` DESC `);
  } else if (options.leastBar) {
    topOrderByValues.push(` ${mainTopTable}.\`${dataFieldAxis.columnDisplayName}\` `);
    intermediateOrderByValues.push(` ${mainIntermediateTable}.\`${dataFieldAxis.columnDisplayName}\` `);
  }

  for (const queryField of generateResult.fieldsArray) {
    if (queryField.customColumnType === CustomColumnType.PRIORITY) {
      topPriorityOrderByValues.push(` ${mainTopTable}.\`${queryField.columnDisplayName}\` DESC `);
      intermediatePriorityGroupByValue.push(` ${mainIntermediateTable}.\`${queryField.columnDisplayName}\` DESC `);
    } else if (queryField.customColumnType === CustomColumnType.INCLUSION) {
      intermediateInclusionStatements.push(`\`${queryField.columnDisplayName}\` <> 0`);
    }
  }

  const labelCorrectedString = kpiCalculator(
    generateResult.tables.length,
    generateResult.fieldsArray,
    generateResult.operation,
    options.labelField,
    mainTopTable,
    `AS ${labelAxisName}`,
    false,
  );
  const dataCorrectedString = kpiCalculator(
    generateResult.tables.length,
    generateResult.fieldsArray,
    generateResult.operation,
    dataField.draggedId,
    mainTopTable,
    `AS ${dataAxisName}`,
    false,
  );

  const externalOrderByComma = topOrderByValues.length > 0 && topPriorityOrderByValues.length > 0 ? ',' : '';
  const internalOrderByComma =
    intermediatePriorityGroupByValue.length > 0 && intermediateOrderByValues.length > 0 ? ',' : '';

  const internalOrderByValue = `${intermediatePriorityGroupByValue.join(',')} ${internalOrderByComma} ${intermediateOrderByValues.join(',')}`;
  const externalOrderByValue = `${topPriorityOrderByValues.join(',')} ${externalOrderByComma} ${topOrderByValues.join(',')}`;

  const intermediateInclusionString =
    intermediateInclusionStatements.length > 0
      ? `WHERE ${intermediateInclusionStatements.join(SPACE_AND_SPACE_KEY)}`
      : '';

  const whereCondition = `${mainIntermediateTable}.\`${dataFieldAxis.columnDisplayName}\` IS NOT NULL`;
  const finalWhereClause = intermediateInclusionString
    ? `${intermediateInclusionString} AND ${whereCondition}`
    : `WHERE ${whereCondition}`;

  const selectionQuery = `SELECT ${labelCorrectedString}, ${dataCorrectedString} FROM (SELECT * FROM (${generateResult.query}) AS ${mainIntermediateTable} ${finalWhereClause} ORDER BY ${internalOrderByValue}) AS ${mainTopTable} GROUP BY ${labelAxisName} ORDER BY ${externalOrderByValue} LIMIT ${options.barNumber}`;

  const dataAxisResults = await legacyDataDb.query<{ labelAxis: string; dataAxis: number }>(selectionQuery);
  const labelValues: string[] = [];
  const axisFinalData: Array<IChartValueWithThreshold> = [];
  for (const dataResult of dataAxisResults) {
    labelValues.push(dataResult.labelAxis);
    const value = constructThresholdResult(
      dataResult[dataAxisName],
      (options as unknown as Record<string, unknown>)['calculatedThreshold'] as ICalculatedThreshold,
    );
    axisFinalData.push(value);
  }

  const barSerie: IBarSerie = {
    draggedId: dataField.draggedId,
    name: dataFieldAxis.columnDisplayName,
    type: dataField.type,
    smooth: dataField.smooth,
    step: dataField.step,
    emphasis: {
      focus: 'series',
      itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' },
    },
    lineStyle: dataField.lineStyle,
    barGap: dataField.barGap,
    color: dataField.color,
    barWidth: dataField.barWidth,
    symbolSize: dataField.symbolSize,
    showSymbol: dataField.showSymbol,
    areaStyle: dataField.areaStyle,
    yAxisIndex: 0,
    xAxisIndex: 0,
    labelLine: { show: true },
    data: axisFinalData.reverse(),
  };

  const yAxis = lib['yAxis'] as Array<Record<string, unknown>>;
  yAxis[0]['data'] = labelValues.reverse();
  lib['series'] = [barSerie];

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

  barLabelChanger(
    options.barLabel || '',
    lib['series'] as IBarSerie[],
    false,
    options.barLabelBackgroundColor || '',
    options.barLabelRotation || 0,
  );

  return chartObject;
}

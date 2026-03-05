/**
 * Solo Bar chart generator — ported from v3 infrastructure/charts/soloBar.chart.ts.
 *
 * Groups by a label field and shows each group as an individual stacked bar.
 */

import { BadRequestException } from '@nestjs/common';
import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { ErrorMessages } from '../../../shared/constants/error-messages';
import { IChartData, IFieldsArrayEntry } from '../../reports/dto/report-interfaces';
import { FieldTypes, FieldFunctions } from '../../reports/services/query-builder.service';
import { hotkeyTransform, IBarSerie, isUndefinedOrNull } from '../../reports/charts/chart-helpers';
import {
  calculateThresholdResultByTime,
  constructThresholdResult,
  ICalculatedThreshold,
  IThresholdTime,
} from './threshold-helpers';

export interface ISoloBarDataField {
  draggedId: string;
  type: string;
  smooth?: boolean;
  step?: string;
  lineStyle?: Record<string, unknown>;
  barGap?: string;
  symbolSize?: number;
  showSymbol?: boolean;
  areaStyle?: Record<string, unknown> | null;
}

export interface ISoloBarChartOptions {
  labelField: string;
  dataField: ISoloBarDataField;
  barWidth?: string;
  textTransform?: string;
  subTextTransform?: string;
  threshold?: IThresholdTime;
  calculatedThreshold?: ICalculatedThreshold;
}

export interface ISoloBarGenerateResult {
  query: string;
  fieldsArray: IFieldsArrayEntry[];
}

export async function generateWidgetSoloBar(
  generateResult: ISoloBarGenerateResult,
  chartObject: IChartData,
  legacyDataDb: LegacyDataDbService,
  dateHelper: DateHelperService,
  coreDbName: string,
): Promise<IChartData> {
  const lib = (chartObject as Record<string, unknown>)['lib'] as Record<string, unknown>;
  lib['series'] = [];
  const mainTable = 'barTable';
  const labelAxisName = 'name';
  const dataAxisName = 'value';
  const chartQueryStatements: string[] = [];
  const groupByStatements: string[] = [];
  const options = chartObject['options'] as ISoloBarChartOptions;

  if (isUndefinedOrNull(options.labelField) || isUndefinedOrNull(options.dataField)) {
    throw new BadRequestException(ErrorMessages.CHART_FIELD_IS_MISSING);
  }

  const dataFieldAxis = options.dataField;

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

  const labelField = generateResult.fieldsArray.find((f) => f.draggedId === options.labelField)!;
  if (labelField.type !== FieldTypes.alpha) {
    throw new BadRequestException(ErrorMessages.CHART_FIELD_IS_MISSING);
  }
  chartQueryStatements.push(`${mainTable}.\`${labelField.columnDisplayName}\` AS ${labelAxisName}`);
  groupByStatements.push(`${mainTable}.\`${labelField.columnDisplayName}\``);

  const dataField = generateResult.fieldsArray.find((f) => f.draggedId === dataFieldAxis.draggedId)!;
  if (dataField.type !== FieldTypes.number) {
    throw new BadRequestException(ErrorMessages.CHART_FIELD_IS_MISSING);
  }
  chartQueryStatements.push(
    `${FieldFunctions.sum}(${mainTable}.\`${dataField.columnDisplayName}\`) AS ${dataAxisName}`,
  );

  const finalQuery = `SELECT ${chartQueryStatements.join(', ')} FROM (${generateResult.query}) AS ${mainTable} GROUP BY ${groupByStatements.join(', ')}`;
  const dataResults = await legacyDataDb.query<{ name: string; value: number }>(finalQuery);

  const serieData: IBarSerie[] = [];
  for (const dataResult of dataResults) {
    const value = constructThresholdResult(
      dataResult[dataAxisName],
      (options as unknown as Record<string, unknown>)['calculatedThreshold'] as ICalculatedThreshold,
    );

    serieData.push({
      draggedId: dataFieldAxis.draggedId,
      name: dataResult.name,
      type: dataFieldAxis.type,
      smooth: dataFieldAxis.smooth,
      step: dataFieldAxis.step,
      xAxisIndex: 0,
      yAxisIndex: 0,
      data: [value],
      stack: 'stacked',
      lineStyle: dataFieldAxis.lineStyle,
      labelLine: { show: true },
      barGap: dataFieldAxis.barGap,
      barWidth: options.barWidth,
      symbolSize: dataFieldAxis.symbolSize,
      showSymbol: dataFieldAxis.showSymbol,
      areaStyle: dataFieldAxis.areaStyle,
    });
  }

  lib['series'] = serieData;

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

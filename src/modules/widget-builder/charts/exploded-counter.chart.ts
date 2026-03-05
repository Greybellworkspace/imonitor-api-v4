/**
 * Exploded Counter chart generator — ported from v3 infrastructure/charts/explodedCounter.chart.ts.
 *
 * Groups by an explodeBy field and returns an array of counter data per group.
 */

import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { IChartData, IFieldsArrayEntry } from '../../reports/dto/report-interfaces';
import { dbIfNull } from '../../reports/utils/sql-helpers';
import { hotkeyTransform } from '../../reports/charts/chart-helpers';
import { calculateThresholdResultByTime, IThresholdTime } from './threshold-helpers';

export interface IExplodedCounterChartOptions {
  counterField: string;
  counterOperation: string;
  explodeBy: string;
  color?: string;
  textTransform?: string;
  subTextTransform?: string;
  showInnerTitle?: boolean;
  detailOffsetCenter?: number[];
  titleOffsetCenter?: number[];
  threshold?: IThresholdTime;
}

export interface IExplodedCounterGenerateResult {
  query: string;
  fieldsArray: IFieldsArrayEntry[];
}

export async function generateWidgetExplodedCounter(
  generateResult: IExplodedCounterGenerateResult,
  chartObject: IChartData,
  legacyDataDb: LegacyDataDbService,
  dateHelper: DateHelperService,
  coreDbName: string,
): Promise<IChartData> {
  const mainTable = 'counterTable';
  const selectionField = 'count';
  const options = chartObject['options'] as IExplodedCounterChartOptions;
  const lib = (chartObject as Record<string, unknown>)['lib'] as Record<string, unknown>;

  const counterField = generateResult.fieldsArray.find((f) => f.draggedId === options.counterField)!;
  const explodedField = generateResult.fieldsArray.find((f) => f.draggedId === options.explodeBy)!;

  const selectColumn1 = `${dbIfNull(`${options.counterOperation}(\`${counterField.columnDisplayName}\`)`, '0')} AS ${selectionField},`;
  const selectColumn2 = `${dbIfNull(`\`${explodedField.columnDisplayName}\``, '"NULL"')} AS explode`;
  const dataQuery = `SELECT ${selectColumn1} ${selectColumn2} FROM (${generateResult.query}) AS ${mainTable} GROUP BY \`${explodedField.columnDisplayName}\``;

  const explodedCounterQueryResult = await legacyDataDb.query<{ count: number; explode: string }>(dataQuery);

  const explodedCounterArray: Array<Record<string, unknown>> = [];
  for (const counterResult of explodedCounterQueryResult) {
    const counterValue = counterResult[selectionField];

    const counterSeriesData = {
      detail: { offsetCenter: options.detailOffsetCenter },
      name: options.showInnerTitle ? counterField.columnDisplayName : '',
      title: { offsetCenter: options.titleOffsetCenter },
      value: counterValue,
    };

    const explodedData: Record<string, unknown> = {
      data: counterSeriesData,
      title: { text: counterResult.explode },
    };

    if (options.threshold) {
      const calculatedThreshold = calculateThresholdResultByTime(options.threshold, dateHelper);
      if (calculatedThreshold) {
        explodedData['calculatedThreshold'] = {
          ...calculatedThreshold,
          colors: options.threshold.colors,
        };
      }
    }

    explodedCounterArray.push(explodedData);
  }

  (chartObject as Record<string, unknown>)['explodedData'] = explodedCounterArray;

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

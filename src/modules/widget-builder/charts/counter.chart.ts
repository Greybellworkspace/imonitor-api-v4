/**
 * Counter chart generator — ported from v3 infrastructure/charts/counter.chart.ts.
 *
 * Wraps the WB query as a subquery, selects counterOperation(counterField),
 * applies threshold coloring, and populates the counter data structure.
 */

import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { IChartData, IFieldsArrayEntry, ITabularHeader } from '../../reports/dto/report-interfaces';
import { dbIfNull } from '../../reports/utils/sql-helpers';
import { hotkeyTransform } from '../../reports/charts/chart-helpers';
import { calculateThresholdResultByTime, ICalculatedThreshold, IThresholdTime } from './threshold-helpers';

export interface ICounterChartOptions {
  counterField: string;
  counterOperation: string;
  color?: string;
  textTransform?: string;
  subTextTransform?: string;
  showInnerTitle?: boolean;
  detailOffsetCenter?: number[];
  titleOffsetCenter?: number[];
  threshold?: IThresholdTime;
  calculatedThreshold?: ICalculatedThreshold;
}

export interface ICounterGenerateResult {
  query: string;
  fieldsArray: IFieldsArrayEntry[];
  header: ITabularHeader[];
}

export async function generateWidgetCounter(
  generateResult: ICounterGenerateResult,
  chartObject: IChartData,
  legacyDataDb: LegacyDataDbService,
  dateHelper: DateHelperService,
  coreDbName: string,
): Promise<IChartData> {
  const mainTable = 'counterTable';
  const selectionField = 'count';
  const options = chartObject['options'] as ICounterChartOptions;
  const lib = (chartObject as Record<string, unknown>)['lib'] as Record<string, unknown>;

  const counterField = generateResult.fieldsArray.find((f) => f.draggedId === options.counterField)!;

  // Build WHERE clause to exclude NULL numeric fields
  const numericDataFields = generateResult.header.filter((h) => h.headerColumnType === 'number').map((h) => h);
  const whereClause = numericDataFields.map((h) => `AND ${mainTable}.\`${h.text}\` IS NOT NULL`).join(' ');

  const selectColumn = dbIfNull(`${options.counterOperation}(\`${counterField.columnDisplayName}\`)`, '0');
  const dataQuery = `SELECT ${selectColumn} AS ${selectionField} FROM (${generateResult.query}) AS ${mainTable} WHERE ${mainTable}.\`${counterField.columnDisplayName}\` IS NOT NULL ${whereClause}`;

  const counterQueryResult = await legacyDataDb.query<{ count: number }>(dataQuery);
  const counterValue = counterQueryResult[0]?.count ?? 0;

  const series = lib['series'] as Record<string, unknown>;
  const progressSerieData = {
    detail: { offsetCenter: options.detailOffsetCenter },
    name: options.showInnerTitle ? counterField.columnDisplayName : '',
    title: { offsetCenter: options.titleOffsetCenter },
    value: counterValue,
  };
  (series['data'] as unknown[])[0] = progressSerieData;

  delete (options as unknown as Record<string, unknown>)['calculatedThreshold'];
  delete (series['detail'] as Record<string, unknown>)?.['color'];
  delete (series['title'] as Record<string, unknown>)?.['color'];

  (series['detail'] as Record<string, unknown>)['color'] = options.color;
  (series['title'] as Record<string, unknown>)['color'] = options.color;

  if (options.threshold) {
    const calculatedThreshold = calculateThresholdResultByTime(options.threshold, dateHelper);
    if (calculatedThreshold) {
      (options as unknown as Record<string, unknown>)['calculatedThreshold'] = {
        ...calculatedThreshold,
        colors: options.threshold.colors,
      };
      const ct = (options as unknown as Record<string, unknown>)['calculatedThreshold'] as ICalculatedThreshold;
      if (counterValue < ct.lowerRange) {
        (series['detail'] as Record<string, unknown>)['color'] = ct.colors!.lowerRange;
        (series['title'] as Record<string, unknown>)['color'] = ct.colors!.lowerRange;
      } else if (counterValue > ct.upperRange) {
        (series['detail'] as Record<string, unknown>)['color'] = ct.colors!.upperRange;
        (series['title'] as Record<string, unknown>)['color'] = ct.colors!.upperRange;
      } else {
        (series['detail'] as Record<string, unknown>)['color'] = ct.colors!.midRange;
        (series['title'] as Record<string, unknown>)['color'] = ct.colors!.midRange;
      }
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
  (lib['title'] as Record<string, unknown>)['subtext'] = await hotkeyTransform(
    options.subTextTransform,
    dateObject,
    legacyDataDb,
    dateHelper,
    coreDbName,
  );

  return chartObject;
}

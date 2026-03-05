/**
 * Tabular chart generator — ported from v3 infrastructure/charts/tabular.chart.ts.
 *
 * Selects specific dataFields, applies KPI calculator for numeric fields,
 * and returns body+header.
 */

import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import {
  IChartData,
  ICustomOperationColumn,
  IFieldsArrayEntry,
  ITabularHeader,
  ITabularOrderBy,
} from '../../reports/dto/report-interfaces';
import { FieldTypes } from '../../reports/services/query-builder.service';
import { SPACE_COMMA_SPACE_KEY } from '../../reports/constants';
import { kpiCalculator, hotkeyTransform } from '../../reports/charts/chart-helpers';
import { constructTabularThreshold, IThresholdTime } from './threshold-helpers';

export interface ITabularDataField {
  draggedId: string;
  hidden: boolean;
  pinned: boolean;
  threshold?: IThresholdTime & { colors?: Record<string, string> };
}

export interface ITabularChartOptions {
  dataFields: ITabularDataField[];
  textTransform?: string;
}

export interface ITabularGenerateResult {
  query: string;
  fieldsArray: IFieldsArrayEntry[];
  header: ITabularHeader[];
  tables: unknown[];
  operation: ICustomOperationColumn[];
}

export async function generateWidgetTabular(
  generateResult: ITabularGenerateResult,
  chartObject: IChartData,
  orderBy: ITabularOrderBy[],
  legacyDataDb: LegacyDataDbService,
  dateHelper: DateHelperService,
  coreDbName: string,
): Promise<IChartData> {
  const selectionQueryStatements: string[] = [];
  const groupByStatements: string[] = [];
  const mainTable = 'mainResult';
  const headers: ITabularHeader[] = [];
  const options = chartObject['options'] as ITabularChartOptions;
  const lib = (chartObject as Record<string, unknown>)['lib'] as Record<string, unknown>;
  lib['calculatedThreshold'] = {};

  for (const dataField of options.dataFields) {
    const columnHeader = generateResult.header.find((f) => f.draggedId === dataField.draggedId);
    if (!columnHeader) continue;

    if (columnHeader.headerColumnType === FieldTypes.alpha || columnHeader.headerColumnType === FieldTypes.datetime) {
      selectionQueryStatements.push(`${mainTable}.\`${columnHeader.text}\` AS \`${columnHeader.text}\``);
      groupByStatements.push(`${mainTable}.\`${columnHeader.text}\``);
    } else if (columnHeader.headerColumnType === FieldTypes.number) {
      const correctedString = kpiCalculator(
        generateResult.tables.length,
        generateResult.fieldsArray,
        generateResult.operation,
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
  if (orderBy && orderBy.length > 0) {
    orderByString += ' ORDER BY ';
    const orderByClauses: string[] = [];
    for (const column of orderBy) {
      const isFieldUsed = options.dataFields.findIndex((f) => f.draggedId === column.draggedId);
      if (isFieldUsed >= 0) {
        const orderField = generateResult.fieldsArray.find((f) => f.draggedId === column.draggedId);
        if (orderField) {
          orderByClauses.push(`\`${orderField.columnDisplayName}\` ${column.orderBy}`);
        }
      }
    }
    orderByString += orderByClauses.join(SPACE_COMMA_SPACE_KEY);
  }

  const groupByString = groupByStatements.length > 0 ? 'GROUP BY ' + groupByStatements.join(', ') : '';
  const finalQuery = `SELECT ${selectionQueryStatements.join(', ')} FROM (${generateResult.query}) AS ${mainTable} ${groupByString} ${orderByString}`;

  const body = await legacyDataDb.query(finalQuery);

  lib['body'] = body;
  lib['header'] = headers;

  const transformedText = await hotkeyTransform(
    options.textTransform,
    { fromDate: null, toDate: null },
    legacyDataDb,
    dateHelper,
    coreDbName,
  );
  chartObject.name = transformedText || '';

  return chartObject;
}

/**
 * Top/Least Table chart generator — ported from v3 infrastructure/charts/topLeastTable.chart.ts.
 *
 * UNION ALL of top N + separator (NULL row) + least N rows.
 */

import { BadRequestException } from '@nestjs/common';
import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { ErrorMessages } from '../../../shared/constants/error-messages';
import {
  IChartData,
  ICustomOperationColumn,
  IFieldsArrayEntry,
  ITabularHeader,
} from '../../reports/dto/report-interfaces';
import { CustomColumnType } from '../../reports/services/query-builder.service';
import { SPACE_AND_SPACE_KEY } from '../../reports/constants';
import { kpiCalculator, hotkeyTransform, isUndefinedOrNull } from '../../reports/charts/chart-helpers';
import { constructTabularThreshold, IThresholdTime } from './threshold-helpers';

export interface ITopLeastLabelField {
  draggedId: string;
  hidden: boolean;
  pinned: boolean;
}

export interface ITopLeastDataField {
  draggedId: string;
  hidden: boolean;
  pinned: boolean;
  threshold?: IThresholdTime & { colors?: Record<string, string> };
}

export interface ITopLeastTableChartOptions {
  labelField: ITopLeastLabelField;
  dataField: ITopLeastDataField;
  rowNumber?: number;
  textTransform?: string;
}

export interface ITopLeastTableGenerateResult {
  query: string;
  fieldsArray: IFieldsArrayEntry[];
  header: ITabularHeader[];
  tables: unknown[];
  operation: ICustomOperationColumn[];
}

export async function generateWidgetTopLeastTable(
  generateResult: ITopLeastTableGenerateResult,
  chartObject: IChartData,
  legacyDataDb: LegacyDataDbService,
  dateHelper: DateHelperService,
  coreDbName: string,
): Promise<IChartData> {
  const selectionQueryStatements: string[] = [];
  const headers: ITabularHeader[] = [];
  const intermediateInclusionStatements: string[] = [];
  const intermediatePriorityGroupByValue: string[] = [];
  const topPriorityOrderByValues: string[] = [];
  const nullSelectionStatements: string[] = [];
  const mainTopTable = 'topTable';
  const mainIntermediateTable = 'intermediateTable';
  const options = chartObject['options'] as ITopLeastTableChartOptions;
  const lib = (chartObject as Record<string, unknown>)['lib'] as Record<string, unknown>;
  lib['calculatedThreshold'] = {};

  if (isUndefinedOrNull(options.labelField)) {
    throw new BadRequestException(ErrorMessages.CHART_FIELD_IS_MISSING);
  }
  if (isUndefinedOrNull(options.dataField)) {
    throw new BadRequestException(ErrorMessages.CHART_NO_NUMBER_FIELD);
  }

  for (const queryField of generateResult.fieldsArray) {
    if (queryField.customColumnType === CustomColumnType.PRIORITY) {
      topPriorityOrderByValues.push(` ${mainTopTable}.\`${queryField.columnDisplayName}\` DESC `);
      intermediatePriorityGroupByValue.push(` ${mainIntermediateTable}.\`${queryField.columnDisplayName}\` DESC `);
    } else if (queryField.customColumnType === CustomColumnType.INCLUSION) {
      intermediateInclusionStatements.push(`\`${queryField.columnDisplayName}\` <> 0`);
    }
  }

  // Label field
  const labelField = options.labelField;
  const labelColumnHeader = generateResult.header.find((f) => f.draggedId === labelField.draggedId)!;
  selectionQueryStatements.push(`${mainTopTable}.\`${labelColumnHeader.text}\` AS \`${labelColumnHeader.text}\``);
  const topGroupByStatement = `GROUP BY ${mainTopTable}.\`${labelColumnHeader.text}\``;
  nullSelectionStatements.push(`NULL AS \`${labelColumnHeader.text}\``);
  labelColumnHeader.hidden = labelField.hidden;
  labelColumnHeader.pinned = labelField.pinned;
  headers.push(labelColumnHeader);

  // Data field
  const dataField = options.dataField;
  const dataColumnHeader = generateResult.header.find((f) => f.draggedId === dataField.draggedId)!;
  nullSelectionStatements.push(`NULL AS \`${dataColumnHeader.text}\``);
  const correctedString = kpiCalculator(
    generateResult.tables.length,
    generateResult.fieldsArray,
    generateResult.operation,
    dataField.draggedId,
    mainTopTable,
    `AS \`${dataColumnHeader.text}\``,
  );
  selectionQueryStatements.push(correctedString);
  const topOrderByValue = `${mainTopTable}.\`${dataColumnHeader.text}\``;
  const intermediateOrderByValue = `${mainIntermediateTable}.\`${dataColumnHeader.text}\``;
  dataColumnHeader.hidden = dataField.hidden;
  dataColumnHeader.pinned = dataField.pinned;
  headers.push(dataColumnHeader);

  if (dataField.threshold) {
    const calculatedThreshold = constructTabularThreshold(dataField.threshold);
    if (calculatedThreshold) {
      (lib['calculatedThreshold'] as Record<string, unknown>)[dataField.draggedId] = {
        ...calculatedThreshold,
        colors: dataField.threshold.colors,
      };
    }
  }

  const intermediateWhereClause =
    intermediateInclusionStatements.length > 0
      ? 'WHERE ' +
        intermediateInclusionStatements.join(SPACE_AND_SPACE_KEY) +
        ' AND ' +
        mainIntermediateTable +
        '.`' +
        dataColumnHeader.text +
        '` IS NOT NULL'
      : 'WHERE ' + mainIntermediateTable + '.`' + dataColumnHeader.text + '` IS NOT NULL';

  const limitNumber = isUndefinedOrNull(options.rowNumber) ? 5 : options.rowNumber;
  const externalOrderByComma = topOrderByValue.length > 0 && topPriorityOrderByValues.length > 0 ? ',' : '';
  const internalOrderByComma =
    intermediatePriorityGroupByValue.length > 0 && intermediateOrderByValue.length > 0 ? ',' : '';

  const internalOrderByVal = `${intermediatePriorityGroupByValue.join(',')} ${internalOrderByComma} ${intermediateOrderByValue}`;
  const externalOrderByVal = `${topPriorityOrderByValues.join(',')} ${externalOrderByComma} ${topOrderByValue}`;

  const finalQuery = `
    (
      SELECT ${selectionQueryStatements.join(',')}
      FROM (SELECT * FROM (${generateResult.query}) AS ${mainIntermediateTable} ${intermediateWhereClause}
      ORDER BY ${internalOrderByVal} DESC) AS ${mainTopTable}
      ${topGroupByStatement}
      ORDER BY ${externalOrderByVal} DESC
      LIMIT ${limitNumber}
    )
    UNION ALL
    (
      SELECT ${nullSelectionStatements.join(',')}
      FROM (SELECT * FROM (${generateResult.query}) AS ${mainIntermediateTable} ${intermediateWhereClause}
      ORDER BY ${internalOrderByVal} DESC) AS ${mainTopTable}
      ORDER BY ${externalOrderByVal} DESC
      LIMIT 1
    )
    UNION ALL
    (
      SELECT ${selectionQueryStatements.join(',')}
      FROM (SELECT * FROM (${generateResult.query}) AS ${mainIntermediateTable} ${intermediateWhereClause}
      ORDER BY ${internalOrderByVal}) AS ${mainTopTable}
      ${topGroupByStatement}
      ORDER BY ${externalOrderByVal}
      LIMIT ${limitNumber}
    )
  `;

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

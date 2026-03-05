import {
  IReportGlobalFilter,
  IReportOptions,
  IMinimalTabularTable,
  ITabularOrderBy,
  ICustomControlColumn,
  ICustomOperationColumn,
  ICustomCompareColumn,
  IChartData,
  IFieldsArrayEntry,
  ITabularHeader,
} from '../../reports/dto/report-interfaces';

/** Full widget builder response (getById, getSharedById) */
export interface WidgetBuilderResponseDto {
  id: string;
  name: string;
  ownerId: string;
  globalFilter: IReportGlobalFilter;
  options: IReportOptions;
  isFavorite: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  limit: number;
  tables: Array<IMinimalTabularTable>;
  orderBy: Array<ITabularOrderBy>;
  control: Array<ICustomControlColumn>;
  operation: Array<ICustomOperationColumn>;
  compare: Array<ICustomCompareColumn>;
  priority: Array<ICustomControlColumn>;
  inclusion: Array<ICustomControlColumn>;
  globalOrderIndex: number;
  charts: Array<IChartData>;
}

/** List view (lightweight, no nested chart/table details) */
export interface ListWidgetBuildersDto {
  id: string;
  name: string;
  isFavorite: boolean;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
  isDefault: boolean;
  ownerId: string;
  owner: string;
}

/** Tabular query result returned by executeQuery */
export interface ExecuteWbQueryResultDto {
  header: Array<ITabularHeader>;
  fieldsArray: Array<IFieldsArrayEntry>;
  body: Array<Record<string, unknown>>;
}

/** Widget builder access check response */
export interface WidgetBuilderAccessDto {
  widgetBuilderId: string;
  shared: boolean;
}

/** Privileged tables for side menu */
export interface SideTablesDto {
  tables: Array<{
    id: string;
    displayName: string;
    role: string;
    fields: Array<{
      id: string;
      node: string;
      columnDisplayName: string;
      type: string;
      operation: string;
    }>;
  }>;
}

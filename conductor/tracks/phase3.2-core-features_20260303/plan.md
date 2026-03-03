# Implementation Plan: Phase 3.2 — Core Features (Modules, Parameters, NodeDefinition)

**Track ID:** phase3.2-core-features_20260303
**Spec:** [spec.md](./spec.md)
**Created:** 2026-03-03
**Status:** [x] Complete

## Overview

Migrate 3 modules (16 endpoints) with shared infrastructure for dynamic table queries. The approach: (1) register missing entities globally, (2) build shared encryption + dynamic table helpers, (3) implement Modules module, (4) implement shared DynamicTableService base, (5) implement Parameters and NodeDefinition modules extending the shared base, (6) add unit tests.

**Branch:** `migration/phase-3.2-core-features`

## Phase 1: Infrastructure — Entity Registration & Shared Helpers

Register missing entities in CoreDataModule and add shared encryption/dynamic-table utilities.

### Tasks

- [x]Task 1.1: Update `CoreDataModule` to register `CoreModulesTables`, `CoreTablesField`, `CoreParamsTableRelations` as globally available repositories
- [x]Task 1.2: Add `EncryptionHelperService` to `SharedModule` — wraps AES encrypt/decrypt using key from `SystemConfigService.get('aesEncryptionKey')`, provides `dbEncryptExpression(column)` and `dbDecryptExpression(column)` for SQL fragment generation
- [x]Task 1.3: Add shared DTOs to `src/shared/dto/`: `TabularHeaderDto` (text, datafield, aggregates, pinned, hidden, editable, columntype, headerColumnType, index), `TabularObjectDto` (header + body), `DynamicTableInsertDto` (tableName + data with class-validator), `DynamicTableListItemDto` (id, tableName, displayName)
- [x]Task 1.4: Add `ExportHelperService` to `SharedModule` — wraps ExcelJS workbook creation, provides `exportTabularToExcel(sheets: {name, header, body}[]): Promise<string>` returning file path

### Verification

- [x]`npm run build` passes with new registrations and services
- [x]Existing 214 tests still pass

## Phase 2: Modules Module

Implement the 4 GET endpoints for module/menu metadata queries.

### Tasks

- [x]Task 2.1: Create `src/modules/modules/` directory with `modules.module.ts`, `modules.controller.ts`, `modules.service.ts`
- [x]Task 2.2: Implement `ModulesService` with 4 methods:
  - `getModulesWithReports(userId: string)` — query `core_modules` JOIN `core_report_module` JOIN `core_privileges` filtered by user access
  - `getModulesWithWidgetBuilders(userId: string)` — query `core_modules` JOIN `core_widget_builder_module` JOIN `core_privileges` filtered by user access
  - `getReportsByModuleId(moduleId: string, userId: string)` — query `core_report` JOIN `core_report_module` WHERE moduleId, filtered by user access
  - `getWidgetBuildersByModuleId(moduleId: string, userId: string)` — query `core_widget_builder` JOIN `core_widget_builder_module` WHERE moduleId, filtered by user access
- [x]Task 2.3: Implement `ModulesController` with Swagger decorators:
  - `GET /api/v1/modules/reports` → `getModulesWithReports`
  - `GET /api/v1/modules/widgetbuilders` → `getModulesWithWidgetBuilders`
  - `GET /api/v1/modules/:id/report` → `getReportsByModuleId`
  - `GET /api/v1/modules/:id/widgetbuilder` → `getWidgetBuildersByModuleId`
- [x]Task 2.4: Add response DTOs: `ModuleListItemDto`, `ReportListItemDto`, `WidgetBuilderListItemDto`
- [x]Task 2.5: Register `ModulesModule` in `AppModule`

### Verification

- [x]`npm run build` passes
- [x]All existing tests still pass

## Phase 3: DynamicTableService Base — Shared Parameters/NodeDefinition Logic

Extract the shared pattern into a reusable abstract service that both Parameters and NodeDefinition extend.

### Tasks

- [x]Task 3.1: Create `src/shared/services/dynamic-table.service.ts` — abstract class `DynamicTableService` with:
  - Constructor deps: `CoreModulesTables` repo, `CoreTablesField` repo, `CorePrivileges` repo, `LegacyDataDbService`, `EncryptionHelperService`, `SystemConfigService`, `ExportHelperService`
  - Abstract property: `tableType: string` (overridden by subclasses as 'param' or 'nodes')
  - `getAllTables(userId: string): Promise<DynamicTableListItemDto[]>` — SELECT from `core_modules_tables` WHERE tableType = this.tableType, filtered by user privileges
  - `getTableDetails(tableId: string): Promise<TabularObjectDto>` — fetch table metadata + fields, build header array with visibility rules, construct dynamic SQL with encryption/date-formatting/user-lookup, execute against `LegacyDataDbService`
  - `insertRecord(dto: DynamicTableInsertDto, userId: string): Promise<void>` — generate UUID, set audit fields, encrypt password fields, INSERT via `LegacyDataDbService`
  - `updateRecords(body: Record<string, any[]>, userId: string): Promise<void>` — iterate tables/rows, handle type conversions, encrypt passwords, UPDATE via `LegacyDataDbService`
  - `exportAllToExcel(userId: string): Promise<string>` — get all tables → get details for each → export via `ExportHelperService`
  - `exportTableToExcel(tableId: string): Promise<string>` — get single table details → export via `ExportHelperService`
- [x]Task 3.2: Implement field visibility rules in `DynamicTableService.getTableDetails()`:
  - ID columns (`columnName` contains 'id'): `hidden=true, editable=false`
  - Date columns (`columnName` contains 'date'): `hidden=false, editable=false`
  - By columns (`columnName` ends with '_by'): `hidden=false, editable=false`
  - Password columns (`columnName` contains 'pass'): `hidden=true, editable=true`
  - All others: `hidden=false, editable=true`
- [x]Task 3.3: Implement dynamic SQL construction in `getTableDetails()`:
  - `AES_DECRYPT(column, key)` for encrypted fields
  - Date formatting per `core_sys_config.dateFormat1`
  - `(SELECT CONCAT(firstName,' ',lastName) FROM core_application_users WHERE id=t.created_by)` for _by fields
  - Replace NULL values with empty strings in results

### Verification

- [x]`npm run build` passes
- [x]Abstract class compiles correctly with proper generics

## Phase 4: Parameters Module

Implement the 6 endpoints for parameter table management.

### Tasks

- [x]Task 4.1: Create `src/modules/parameters/` directory with `parameters.module.ts`, `parameters.controller.ts`, `parameters.service.ts`
- [x]Task 4.2: Implement `ParametersService extends DynamicTableService` — set `tableType = 'param'`, inject all required deps and pass to super
- [x]Task 4.3: Implement `ParametersController` with Swagger decorators:
  - `GET /api/v1/paramstable` → `getAllTables(userId)`
  - `GET /api/v1/paramstable/export/excel` → `exportAllToExcel(userId)` (MUST be before `:id` route)
  - `GET /api/v1/paramstable/export/excel/:id` → `exportTableToExcel(id)`
  - `GET /api/v1/paramstable/:id` → `getTableDetails(id)`
  - `POST /api/v1/paramstable` → `insertRecord(body, userId)`
  - `PUT /api/v1/paramstable` → `updateRecords(body, userId)`
- [x]Task 4.4: Register `ParametersModule` in `AppModule`

### Verification

- [x]`npm run build` passes
- [x]All existing tests still pass

## Phase 5: NodeDefinition Module

Implement the 6 endpoints for node definition table management.

### Tasks

- [x]Task 5.1: Create `src/modules/node-definition/` directory with `node-definition.module.ts`, `node-definition.controller.ts`, `node-definition.service.ts`
- [x]Task 5.2: Implement `NodeDefinitionService extends DynamicTableService` — set `tableType = 'nodes'`, inject all required deps and pass to super
- [x]Task 5.3: Implement `NodeDefinitionController` with Swagger decorators:
  - `GET /api/v1/nodedefinition` → `getAllTables(userId)`
  - `GET /api/v1/nodedefinition/export/excel` → `exportAllToExcel(userId)` (MUST be before `:id` route)
  - `GET /api/v1/nodedefinition/export/excel/:id` → `exportTableToExcel(id)`
  - `GET /api/v1/nodedefinition/:id` → `getTableDetails(id)`
  - `POST /api/v1/nodedefinition` → `insertRecord(body, userId)`
  - `PUT /api/v1/nodedefinition` → `updateRecords(body, userId)`
- [x]Task 5.4: Register `NodeDefinitionModule` in `AppModule`

### Verification

- [x]`npm run build` passes
- [x]All existing tests still pass

## Phase 6: Unit Tests

Add unit tests for all new services following established patterns.

### Tasks

- [x]Task 6.1: Write `EncryptionHelperService` tests — verify encrypt/decrypt SQL fragment generation, key retrieval from config
- [x]Task 6.2: Write `ExportHelperService` tests — verify Excel file creation with mocked ExcelJS
- [x]Task 6.3: Write `ModulesService` tests — mock repos, verify 4 query methods return correct data with privilege filtering
- [x]Task 6.4: Write `ParametersService` tests — mock repos + `LegacyDataDbService`, verify all 6 operations (list, details, insert, update, export-all, export-single)
- [x]Task 6.5: Write `NodeDefinitionService` tests — same as 6.4 but with `tableType = 'nodes'`
- [x]Task 6.6: Write DTO validation tests for `DynamicTableInsertDto` — verify `tableName` and `data` are required

### Verification

- [x]`npm run build` passes
- [x]`npm run lint` passes
- [x]`npm test` passes — all existing + new tests
- [x]No regressions in Phase 3.1 tests

## Phase 7: Final Commit & Merge

### Tasks

- [x]Task 7.1: Run full verification (`build` + `lint` + `test`), commit final state
- [x]Task 7.2: Update `core_minimum_privileges` seed data if needed for new routes
- [x]Task 7.3: Update CLAUDE.md migration progress table (Phase 3.2 → Done)

### Verification

- [x]`npm run build` passes
- [x]`npm run lint` passes
- [x]`npm test` passes with all new + existing tests
- [x]Git branch `migration/phase-3.2-core-features` ready for merge to main

## Final Verification

- [x]All 14 acceptance criteria from spec.md met
- [x]All 16 endpoints implemented with correct paths and HTTP methods
- [x]Tests passing (existing 214 + new tests)
- [x]Build and lint clean
- [x]Ready for merge to main and tag `v0.3.2-migration-phase3.2`

---

_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._

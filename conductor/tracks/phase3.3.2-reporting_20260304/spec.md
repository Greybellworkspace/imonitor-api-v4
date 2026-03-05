# Specification: Phase 3.3.2 — WidgetBuilder, QBE & Remaining Reporting

**Track ID:** phase3.3.2-reporting_20260304
**Type:** Feature
**Created:** 2026-03-04
**Status:** Draft

## Summary

Migrate the WidgetBuilder module (32 endpoints, 15 chart types), QBE module (14 endpoints, 7 chart types), and extract dedicated query-building services for each — continuing the Phase 3.3 reporting group after Phase 3.3.1 (Reports) is complete.

## Context

Phase 3.3.1 delivered the Reports module with `QueryBuilderService.generateQuery()`, chart generators, and 11 export endpoints. WidgetBuilder and QBE share chart generation infrastructure but have **distinct query-building logic**:

- **WidgetBuilder** uses `QueryBuilderService.generateWIdgetBuilder()` — similar to Reports but with different field handling and 15 chart types (superset of Reports' 7).
- **QBE** does NOT use QueryBuilder at all — it accepts user-provided raw SQL, validates it (SELECT only, no DML/DDL), replaces date placeholders (`_fromDate_`, `_toDate_`), and verifies table access privileges via `modifyQuery()`.
- Neither WidgetBuilder nor QBE have export endpoints in v3.

## User Story

As a management stakeholder/NOC engineer, I want to build custom widget charts and query data via QBE so that I can create personalized dashboards and ad-hoc data views without developer intervention.

## Acceptance Criteria

- [ ] WidgetBuilder CRUD endpoints fully migrated (create, read, update, delete, list, favorites, transfer ownership, share, access check, rename, close tab)
- [ ] WidgetBuilder chart generation endpoints migrated (all 15 chart types + tabular)
- [ ] WidgetBuilder module associations and used-tables endpoints working
- [ ] QBE endpoints fully migrated (14 endpoints — CRUD, run, tables, 7 chart types)
- [ ] Dedicated `WidgetBuilderQueryService` extracted (not reusing Reports' QueryBuilderService directly)
- [ ] Dedicated `QbeQueryService` extracted for raw SQL validation, date replacement, and privilege checking
- [ ] All endpoints match v3 request/response contracts for backward compatibility
- [ ] Unit tests for all new services, controllers, and DTOs
- [ ] `npm run build`, `npm run lint`, and `npm test` all pass

## Dependencies

All completed:
- Phase 3.3.1 (Reports) — chart generators, export helpers, report entities
- Phase 2 (Core Architecture) — guards, interceptors, shared module
- Phase 3.1 (Auth & Users) — auth system, user entities
- Phase 3.2 (Core Features) — modules entities and service

## Out of Scope

- Dashboard module (Phase 3.4)
- DataAnalysis module (Phase 3.4)
- RotatingDashboard module (Phase 3.4)
- Socket.IO gateways (Phase 4 — widget chart generation via WebSocket comes later)
- QueryBuilder refactoring / SQL injection fixes (Phase 7 — faithfully port existing logic)
- Everything outside Phase 3.3

## Technical Notes

### WidgetBuilder — v3 Source Reference

- **Controller**: `src/application/api/v1/widgetBuilder/widgetBuilder.controller.ts` (463 lines)
- **Service**: `src/infrastructure/services/widgetBuilder.service.ts` (1,200+ lines)
- **Query method**: `QueryBuilderService.generateWIdgetBuilder()` — different from `generateQuery()` used by Reports

**32 Endpoints:**

| Group | Method | Path | Purpose |
|-------|--------|------|---------|
| CRUD | POST | `/api/v1/widgetbuilder` | Save new |
| | GET | `/api/v1/widgetbuilder` | List user's |
| | GET | `/api/v1/widgetbuilder/:id` | Get by ID |
| | PUT | `/api/v1/widgetbuilder/:id` | Update |
| | DELETE | `/api/v1/widgetbuilder/:id` | Delete |
| Sharing | GET | `/api/v1/widgetbuilder/shared/:id` | Get shared |
| | POST | `/api/v1/widgetbuilder/shared/:id` | Save shared |
| | POST | `/api/v1/widgetbuilder/:id/share` | Share |
| Mgmt | GET | `/api/v1/widgetbuilder/privileges/tables` | Privileged tables |
| | PUT | `/api/v1/widgetbuilder/favorite/:id` | Toggle favorite |
| | PUT | `/api/v1/widgetbuilder/transfer/ownership` | Change owner |
| | PUT | `/api/v1/widgetbuilder/rename` | Rename |
| | GET | `/api/v1/widgetbuilder/access/:id` | Check access |
| | GET | `/api/v1/widgetbuilder/closetab/:wbId/:chartId` | Close tab |
| Generate | POST | `/api/v1/widgetbuilder/generate/tabular` | Tabular results |
| | POST | `/api/v1/widgetbuilder/generate/pie` | Pie |
| | POST | `/api/v1/widgetbuilder/generate/doughnut` | Doughnut |
| | POST | `/api/v1/widgetbuilder/generate/bar/vertical` | Vertical bar |
| | POST | `/api/v1/widgetbuilder/generate/bar/horizontal` | Horizontal bar |
| | POST | `/api/v1/widgetbuilder/generate/bar/solo` | Solo bar |
| | POST | `/api/v1/widgetbuilder/generate/bar/top` | Top bar |
| | POST | `/api/v1/widgetbuilder/generate/percentage` | Percentage |
| | POST | `/api/v1/widgetbuilder/generate/percentage/exploded` | Exploded percentage |
| | POST | `/api/v1/widgetbuilder/generate/progress` | Progress |
| | POST | `/api/v1/widgetbuilder/generate/progress/exploded` | Exploded progress |
| | POST | `/api/v1/widgetbuilder/generate/trend` | Trend |
| | POST | `/api/v1/widgetbuilder/generate/trend/compare` | Compare trend |
| | POST | `/api/v1/widgetbuilder/generate/counter` | Counter |
| | POST | `/api/v1/widgetbuilder/generate/counter/exploded` | Exploded counter |
| | POST | `/api/v1/widgetbuilder/generate/table` | Table chart |
| | POST | `/api/v1/widgetbuilder/generate/table/topleast` | Top/least table |
| | POST | `/api/v1/widgetbuilder/generate/table/cumulative` | Cumulative table |

### QBE — v3 Source Reference

- **Controller**: `src/application/api/v1/qbe/qbe.controller.ts` (232 lines)
- **Service**: `src/infrastructure/services/qbe.service.ts` (712 lines)
- **Query method**: Direct SQL validation + execution (no QueryBuilder)

**14 Endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/qbe` | Save QBE query |
| GET | `/api/v1/qbe/:id` | Get by ID |
| PUT | `/api/v1/qbe/:id` | Update |
| GET | `/api/v1/qbe/shared/:id` | Get shared |
| POST | `/api/v1/qbe/shared/:id` | Save shared |
| POST | `/api/v1/qbe/run` | Execute query |
| GET | `/api/v1/qbe/tables` | Available tables |
| POST | `/api/v1/qbe/generate/pie` | Pie chart |
| POST | `/api/v1/qbe/generate/doughnut` | Doughnut chart |
| POST | `/api/v1/qbe/generate/trend` | Trend chart |
| POST | `/api/v1/qbe/generate/bar/vertical` | Vertical bar |
| POST | `/api/v1/qbe/generate/bar/horizontal` | Horizontal bar |
| POST | `/api/v1/qbe/generate/progress` | Progress |
| POST | `/api/v1/qbe/generate/progress/exploded` | Exploded progress |

### Query Building — Separation Strategy

| Module | Service | Logic |
|--------|---------|-------|
| Reports | `QueryBuilderService` (existing from 3.3.1) | `generateQuery()` — complex SQL from UI field selections |
| WidgetBuilder | `WidgetBuilderQueryService` (new) | `generateWidgetBuilderQuery()` — similar pattern but different field handling, extracted from `generateWIdgetBuilder()` |
| QBE | `QbeQueryService` (new) | `validateAndExecute()` — raw SQL validation (SELECT only), date placeholder replacement, table privilege verification via `modifyQuery()` |

Shared chart generation functions from Phase 3.3.1 (`chart-helpers/`) are reused by all three modules.

### Entities (already exist from Phase 1)

- `core_widget_builder` — main widget builder entity
- `core_widget_builder_charts` — chart instances (FK → widget builder)
- `core_widget_builder_module` — module associations (FK → widget builder, FK → modules)
- `core_widget_builder_used_tables` — used table tracking (FK → widget builder)
- `core_dashboard_widget_builder` — dashboard-widget join (FK → dashboard, FK → widget builder)

No new entities needed for QBE — it stores queries in the existing report/widget infrastructure or standalone.

---

_Generated by Conductor. Review and edit as needed._

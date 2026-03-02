# Phase 1: Code Quality & Architecture Review

## Code Quality Findings

### Critical (6)

| ID | Finding | File | Description |
|----|---------|------|-------------|
| C-1 | JWT Auth Guard accepts all tokens | `auth/guards/jwt-auth.guard.ts:38` | Returns `true` unconditionally — any Bearer token bypasses auth. Should throw `NotImplementedException` to fail-closed. |
| C-2 | Connection leak in `query()` | `legacy-data-db.service.ts:14-29`, `legacy-etl-db.service.ts:11-26` | `connection.release()` not in `finally` block. If `JSON.parse` throws, connection leaks. |
| C-3 | `multipleStatements: true` enables SQL injection stacking | `legacy-data-db.module.ts:23`, `legacy-etl-db.module.ts:22` | Combined with `nativeQuery()` raw SQL passthrough, this amplifies injection from data read to arbitrary DDL/DML. |
| C-4 | `nativeQuery()` exposes unguarded raw SQL | `legacy-data-db.service.ts:40-42` | No error handling, no logging, returns `Promise<unknown>`. Raw escape hatch with no safety. |
| C-5 | No graceful shutdown for legacy DB pools | `legacy-data-db.module.ts`, `legacy-etl-db.module.ts` | `OnModuleDestroy` imported but never implemented. Orphaned connections accumulate on MariaDB after worker restarts. |
| C-6 | Presto client instantiated per query | `legacy-presto.service.ts:19-52` | `new Client(...)` on every `query()` call. No connection reuse, no pooling. |

### High (9)

| ID | Finding | File | Description |
|----|---------|------|-------------|
| H-1 | Massive code duplication between legacy DB services | `legacy-data-db.service.ts`, `legacy-etl-db.service.ts` | ~50 lines of identical query/multiQuery/affectedQuery/execute logic. Extract `BaseLegacyDbService`. |
| H-2 | `JSON.parse(JSON.stringify(...))` for cloning results | `legacy-data-db.service.ts:17,33`, `legacy-etl-db.service.ts:14,30` | Destroys Date objects, doubles memory, adds CPU overhead. Use `structuredClone()` or spread. |
| H-3 | Missing bootstrap error handling | `main.ts:7-31` | No try/catch on `bootstrap()`. Unhandled promise rejection on startup failure. `bootstrap()` not awaited in non-cluster mode. |
| H-4 | `process.exit(1)` without graceful drain | `cluster.service.ts:47-49` | uncaughtException kills in-flight requests, skips OnModuleDestroy hooks, leaks connections. |
| H-5 | Winston logger is module-level singleton | `logger.service.ts:59-113` | Created at import time outside DI. Reads `process.env` directly, not testable, not configurable. |
| H-6 | Correlation ID not propagated to logger | `correlation-id.middleware.ts`, `logger.service.ts` | UUID generated per request but never stored in AsyncLocalStorage. Logger cannot access it. |
| H-7 | Presto reuses DB_HOST/DB_PORT | `legacy-presto.module.ts:16-19` | Presto runs on different host/port than MariaDB. Needs dedicated PRESTO_HOST/PRESTO_PORT env vars. |
| H-8 | Missing `unhandledRejection` handler | `cluster.service.ts` | Only handles `uncaughtException`. Unhandled rejections crash workers silently in Node 15+. |
| H-9 | Sticky session HTTP server never listens | `cluster.service.ts:20-23` | `httpServer.listen()` never called. setupMaster is inert. Workers create independent NestJS listeners. |

### Medium (12)

| ID | Finding | File | Description |
|----|---------|------|-------------|
| M-1 | Inconsistent boolean vs number for `tinyint` | Multiple entities | Some `tinyint(1)` typed as `boolean`, others as `number`. Standardize on `boolean`. |
| M-2 | Inconsistent naming conventions | Multiple entities | PascalCase (`CorePrivileges.Id`), mixed case (`createdAT`), snake_case (`log_time`) across entities. |
| M-3 | Backtick-wrapped DB name defaults | `env.validation.ts:13-15` | Defaults include backticks requiring `.replace()` in consumers. Remove backticks. |
| M-4 | Logger levels skip level 1 | `logger.service.ts:5-13` | Gap from `emerg:0` to `error:2`. Non-standard. |
| M-5 | Entity glob via `__dirname` | `database.module.ts:17` | Breaks under bundling. Use `autoLoadEntities: true`. |
| M-6 | `typeCast` callback duplicated 3x | Legacy DB modules | Same function in 3 pool configs. Extract to shared constant. |
| M-7 | Pool sizes not environment-configurable | All DB modules | `connectionLimit: 15` hardcoded. With 4 workers × 3 pools = 180 connections. |
| M-8 | `MAIL_AUTH_PASSWROD` typo preserved | `env.validation.ts:29` | Migration is ideal time to fix. Support both names temporarily. |
| M-9 | Redis `set()` falsy check for TTL | `redis.service.ts:15-21` | `if (ttlSeconds)` is falsy for `0`. Use `!== undefined`. |
| M-10 | Entity classes use plural names | All 71 entities | `CoreApplicationUsers` instead of singular `CoreApplicationUser`. |
| M-11 | `DatabaseModule` not Global (inconsistent) | `database.module.ts` | Legacy modules are `@Global()` but TypeORM module is not. |
| M-12 | No health check endpoint | All modules | `RedisService.isHealthy()` exists but no `/health` controller or `@nestjs/terminus`. |

### Low (8)

| ID | Finding | File | Description |
|----|---------|------|-------------|
| L-1 | Unused `OnModuleDestroy` import | `legacy-data-db.module.ts:1` | Imported but never used. |
| L-2 | `createServer` import unused in workers | `cluster.service.ts:4` | Only used in primary branch. |
| L-3 | `ipAddress` varchar(16) too short for IPv6 | `core-rate-limiter.entity.ts:13` | IPv6 needs varchar(45). |
| L-4 | `@Injectable()` on static-only class | `cluster.service.ts:7-8` | ClusterService only has static methods. |
| L-5 | Env var naming inconsistency | `env.validation.ts` | Mix of SCREAMING_SNAKE and camelCase. |
| L-6 | Rate limit config validated but not used | `env.validation.ts:37-39` | No throttler or rate limiter configured. |
| L-7 | `verbose()` maps to `info` level | `logger.service.ts:146` | Should map to `debug` or lower. |
| L-8 | No migration strategy for PK-less tables | `core-automated-report.entity.ts` | TypeORM CRUD unsafe on tables with no real PK. |

## Architecture Findings

### Critical (1)

| ID | Finding | File | Description |
|----|---------|------|-------------|
| A-1 | TypeScript strict mode disabled | `tsconfig.json` | `strictNullChecks: false`, `noImplicitAny: false`. Undermines the entire migration motivation. Enable `strict: true` now before any service code. |

### High (4)

| ID | Finding | File | Description |
|----|---------|------|-------------|
| A-2 | Flat entity folder won't scale | `src/database/entities/` (71 files) | All entities in one directory. Phase 3 modules should own their entities. Reorganize into domain subfolders. |
| A-3 | Missing FK relationships in entities | Multiple entities | Cross-referencing MIGRATION.md's 30 FKs: several `@ManyToOne`/`@OneToMany` declarations missing (dashboard-chart, widget-builder, observability). |
| A-4 | Column type mismatches with schema | Multiple entities | `text` used where schema says `longtext` for large JSON columns (dashboard options, report tables/filters). Risk of silent 64KB truncation. |
| A-5 | Connection release not in finally (same as C-2) | Legacy DB services | Architectural risk: connection pool exhaustion under sustained error conditions. |

### Medium (4)

| ID | Finding | File | Description |
|----|---------|------|-------------|
| A-6 | PK-less table entities risk wrong-row updates | 4 entity files | `CoreChartIdMapping`, `CoreObservabilityDashboardError`, `CoreUcipErrorCodes`, `CoreAutomatedReport` have synthetic PKs with possible duplicates. |
| A-7 | Inconsistent boolean typing (same as M-1) | Multiple entities | `tinyint(1)` typed as both `boolean` and `number` across entities. |
| A-8 | EventEmitterModule imported but unused | `app.module.ts:3,16` | Dead code in Phase 1. Acceptable as forward scaffolding. |
| A-9 | AuthModule not Global | `auth.module.ts` | Will need `@UseGuards(JwtAuthGuard)` in all 25 modules. Should use `APP_GUARD` pattern. |

### Positive Observations

1. `synchronize: false` and `migrationsRun: false` — prevents accidental schema modification
2. Separate legacy DB modules — correct decision to keep raw SQL for iMonitorData/EtlV3_2
3. Global module decorators used correctly on infrastructure modules
4. Entity JSDoc comments on schema deviations — excellent maintainability
5. Env validation with `abortEarly: false` — reports all errors at once
6. Cluster auto-restart with worker count tracking — prevents fork-bombs
7. TypeORM enum usage — compile-time safety for UserTheme, ReportTimeFilter, etc.
8. RedisService implements OnModuleDestroy — proper cleanup lifecycle
9. Path aliases in tsconfig — clean imports for future modules

## Critical Issues for Phase 2 Context

These findings from Phase 1 should inform the Security & Performance review:

1. **Security**: JWT guard accepts all tokens (C-1), `multipleStatements: true` (C-3), unguarded `nativeQuery()` (C-4), TypeScript strict mode off (A-1)
2. **Performance**: `JSON.parse(JSON.stringify())` on every query (H-2), Presto client per-query instantiation (C-6), connection pool leaks (C-2), hardcoded pool sizes (M-7)
3. **Reliability**: No graceful shutdown on legacy pools (C-5), no unhandledRejection handler (H-8), bootstrap without error handling (H-3), sticky sessions not wired (H-9)
4. **Observability**: Correlation IDs not in logs (H-6), logger outside DI (H-5), no health check endpoint (M-12)

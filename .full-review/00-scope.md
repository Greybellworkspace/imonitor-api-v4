# Review Scope

## Target

Full Phase 1 scaffolding of iMonitor API v4 — a NestJS migration from Express.js v3. Covers all source code in `./imonitor-api-v4/src/` including: app bootstrap, config validation, TypeORM database module with 71 entity files (51 iMonitorV3_1 tables), 3 legacy database modules (iMonitorData, EtlV3_2, Presto), Redis module, Node.js clustering service, Winston logger with daily rotation, auth guard skeleton, and correlation ID middleware.

## Files

### Core Application (4 files)
- `src/main.ts` — Bootstrap with clustering
- `src/app.module.ts` — Root module wiring all imports
- `src/config/env.validation.ts` — Joi env var validation schema
- `src/cluster/cluster.service.ts` — Node.js cluster with sticky sessions

### Database Layer (79 files)
- `src/database/database.module.ts` — TypeORM MariaDB connection
- `src/database/entities/*.entity.ts` — 71 TypeORM entity files
- `src/database/legacy-data-db/` — mysql2 dual-pool for iMonitorData (2 files)
- `src/database/legacy-etl-db/` — mysql2 pool for EtlV3_2 (2 files)
- `src/database/legacy-presto/` — Presto client wrapper (2 files)

### Redis (3 files)
- `src/redis/redis.module.ts` — Global ioredis module
- `src/redis/redis.service.ts` — Redis operations wrapper
- `src/redis/redis.constants.ts` — Injection token

### Logger (3 files)
- `src/logger/logger.module.ts` — Global logger module
- `src/logger/logger.service.ts` — Winston-backed NestJS LoggerService
- `src/logger/correlation-id.middleware.ts` — Request correlation ID middleware

### Auth (2 files)
- `src/auth/auth.module.ts` — Auth module placeholder
- `src/auth/guards/jwt-auth.guard.ts` — Skeleton JWT guard

**Total: 91 TypeScript files**

## Flags

- Security Focus: no
- Performance Critical: no
- Strict Mode: no
- Framework: NestJS (auto-detected)

## Review Phases

1. Code Quality & Architecture
2. Security & Performance
3. Testing & Documentation
4. Best Practices & Standards
5. Consolidated Report

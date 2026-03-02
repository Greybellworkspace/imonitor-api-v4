# Phase 2: Security & Performance Review

## Security Findings

### Critical (4)

| ID | Finding | CVSS | CWE | File | Description |
|----|---------|------|-----|------|-------------|
| S-C1 | JWT Auth Guard accepts all tokens | 9.8 | CWE-287 | `auth/guards/jwt-auth.guard.ts:38` | Returns `true` unconditionally. `Authorization: Bearer anything` bypasses all auth. Must throw `NotImplementedException` or reject in production. |
| S-C2 | `multipleStatements: true` amplifies SQL injection | 9.8 | CWE-89 | `legacy-data-db.module.ts:23`, `legacy-etl-db.module.ts:22` | Allows chaining arbitrary SQL (DROP, INSERT, exfil) if any injection point exists. Disable on default pools. |
| S-C3 | `nativeQuery()` unguarded raw SQL | 9.1 | CWE-89, CWE-749 | `legacy-data-db.service.ts:40-42` | Public method on globally-exported service. No validation, no logging, returns `unknown`. |
| S-C4 | Missing `.dockerignore` leaks secrets | 8.6 | CWE-200 | `Dockerfile:34` | `COPY . /usr/src/app` copies `.env`, `.git`, credentials into container image. Anyone with registry access can extract secrets. |

### High (9)

| ID | Finding | CVSS | CWE | File | Description |
|----|---------|------|-----|------|-------------|
| S-H1 | TypeScript strict mode disabled | 7.5 | CWE-476 | `tsconfig.json:15-17` | `strictNullChecks: false`, `noImplicitAny: false`. Null dereferences undetected at compile time. |
| S-H2 | No graceful shutdown for legacy DB pools | 7.1 | CWE-404 | Legacy DB modules | OnModuleDestroy not implemented. Worker restarts leak up to 45 connections each. |
| S-H3 | Presto accepts raw SQL without parameterization | 8.1 | CWE-89 | `legacy-presto.service.ts:19-52` | No input validation or guardrails. CDR data exfiltration possible. |
| S-H4 | No CORS configuration | 7.4 | CWE-942 | `main.ts` | `cors` installed but not applied. Defaults to allow all origins. |
| S-H5 | No global ValidationPipe | 7.5 | CWE-20 | `main.ts` | `class-validator` installed but no pipe registered. All request bodies accepted raw. |
| S-H6 | Helmet not applied | 6.5 | CWE-693 | `main.ts` | `helmet` installed but never used. Missing HSTS, X-Content-Type-Options, CSP headers. |
| S-H7 | Connection leak — release not in finally | 7.0 | CWE-404 | Legacy DB services | If `JSON.parse` throws, connection leaks from pool. |
| S-H8 | Redis port exposed to host network | 7.2 | CWE-668 | `docker-compose.yml:33-34` | Port 8005 mapped to host. Bind to `127.0.0.1:8005:6379` instead. |
| S-H9 | uncaughtException exits without cleanup | 6.8 | CWE-460 | `cluster.service.ts:47-49` | `process.exit(1)` skips OnModuleDestroy hooks. |

### Medium (11)

| ID | Finding | File | Description |
|----|---------|------|-------------|
| S-M1 | DB passwords allow empty strings | `env.validation.ts:7,10` | `Joi.string().allow('')` in production. Enforce min length. |
| S-M2 | Redis password defaults empty | `env.validation.ts:34` | Empty default. Require in production. |
| S-M3 | JWT_KEY no minimum length | `env.validation.ts:23` | HMAC-SHA256 needs 32+ bytes. Add `.min(32)`. |
| S-M4 | Correlation ID accepted from client | `correlation-id.middleware.ts:9-11` | No validation. Log injection via crafted IDs. Validate UUID format. |
| S-M5 | JSON deep clone — OOM DoS risk | Legacy DB services | 100MB result → 300MB+ memory. Use `structuredClone()`. |
| S-M6 | Presto client per query | `legacy-presto.service.ts` | File descriptor exhaustion under load. |
| S-M7 | `sourceMap: true` in production | `tsconfig.json:10` | Exposes original source. Disable for production builds. |
| S-M8 | Docker runs as root | `Dockerfile` | No `USER` directive. Container escape → root privileges. |
| S-M9 | Redis image pinned to 7.0.4 (2022) | `docker-compose.yml:30` | Multiple CVEs since. Update to 7.2+. |
| S-M10 | No rate limiting middleware | `main.ts`, `env.validation.ts:37-39` | Config validated but not applied. Unlimited requests per client. |
| S-M11 | Missing `enableShutdownHooks()` | `main.ts` | OnModuleDestroy hooks never fire on SIGTERM/SIGINT. |

### Low (5)

| ID | Finding | Description |
|----|---------|-------------|
| S-L1 | `passwordHash` column varchar(100) | Too short for Argon2. Increase to 255. |
| S-L2 | IP address varchar(16) | Too short for IPv6 (needs 45). |
| S-L3 | Docker Compose `version` deprecated | Remove `version: '3.8'`. |
| S-L4 | `MAIL_AUTH_PASSWROD` typo preserved | Confusion risk. Fix during migration. |
| S-L5 | Logger level 1 missing | Gap from emerg(0) to error(2). |

## Performance Findings

### Critical (3)

| ID | Finding | File | Impact |
|----|---------|------|--------|
| P-C1 | `JSON.parse(JSON.stringify())` on every query | Legacy DB services | 2x memory per result set. Destroys Date/Buffer/BigInt types. 50-200ms latency on large results. Blocks event loop. |
| P-C2 | Connection pool leak risk | Legacy DB services | `connection.release()` not in `finally`. Under sustained errors, pool exhausts → cascading failures. |
| P-C3 | Presto client instantiated per query | `legacy-presto.service.ts:19-52` | Full TCP handshake per query. Port exhaustion risk under load. |

### High (4)

| ID | Finding | File | Impact |
|----|---------|------|--------|
| P-H1 | Hardcoded `connectionLimit: 15` | All DB modules | CPUS=4 → 240 connections. MariaDB default max_connections=151. `ER_CON_COUNT_ERROR`. |
| P-H2 | Sticky session server never listens | `cluster.service.ts:20-23` | Dead code. Workers create independent listeners. Socket.IO non-functional in cluster mode. |
| P-H3 | Correlation IDs not in logs | Logger + middleware | Impossible to trace requests through system. 5min debug → multi-hour search. |
| P-H4 | Missing graceful shutdown for DB pools | Legacy DB modules + `main.ts` | In-flight queries aborted. Connections in TIME_WAIT. Cumulative leak on deployments. |

### Medium (5)

| ID | Finding | File | Impact |
|----|---------|------|--------|
| P-M1 | `multipleStatements: true` | Legacy DB modules | SQL injection amplification. Create dedicated pool for multiQuery only. |
| P-M2 | Redis `scan()` unbounded array | `redis.service.ts:27-36` | Broad patterns on large Redis → OOM crash. Add `maxKeys` limit. |
| P-M3 | Presto accumulates all rows in memory | `legacy-presto.service.ts:30-46` | Millions of CDR rows → OOM. `push(...data)` can overflow call stack. |
| P-M4 | Winston logger outside DI | `logger.service.ts:59` | Module-level singleton. Untestable. Reads `process.env` directly. All workers write same files (I/O contention). |
| P-M5 | ClusterService static logger | `cluster.service.ts:9` | NestJS Logger before Winston configured → inconsistent log format during startup. |

### Low (3)

| ID | Finding | File | Impact |
|----|---------|------|--------|
| P-L1 | TypeORM entity loading via glob | `database.module.ts:17` | 100-500ms startup per worker for filesystem glob of 71 files. |
| P-L2 | Unnecessary array spread on params | Legacy DB services | `[...values]` creates copy on every query. Negligible for small arrays, measurable for batch ops. |
| P-L3 | Missing `enableShutdownHooks()` | `main.ts` | OnModuleDestroy cleanup is dead code without this. |

## Critical Issues for Phase 3 Context

These findings affect testing and documentation requirements:

1. **Testing**: JWT guard cannot be tested for real auth (S-C1). No ValidationPipe means DTO validation untestable (S-H5). TypeScript non-strict means null paths undetected (S-H1). Connection leak scenarios need integration tests (P-C2).
2. **Documentation**: `.dockerignore` must be documented (S-C4). Pool sizing calculation needs operational docs (P-H1). `multipleStatements` risk needs developer security guidelines. Rate limiting config needs implementation docs (S-M10).
3. **Operational**: Missing `/health` endpoint blocks Kubernetes readiness probes. Missing `enableShutdownHooks()` blocks graceful deployment. Redis port exposure needs network security documentation.

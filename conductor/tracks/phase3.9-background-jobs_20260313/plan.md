# Implementation Plan: Phase 3.9 — Background Jobs

**Track ID:** phase3.9-background-jobs_20260313
**Spec:** [spec.md](./spec.md)
**Created:** 2026-03-13
**Status:** [~] In Progress

## Overview

Create `SchedulerModule` using `@nestjs/schedule` with 6 cron jobs mirroring v3's `startup.ts`, and implement 6 new worker scripts in `src/scripts/worker/` using the same `child_process` IPC pattern established in Phase 3.7. Workers are plain TypeScript files outside NestJS DI — they open direct DB connections via mysql2. Unit tests cover the scheduler service cron methods via mocked child_process.

Branch: `migration/phase-3.9-background-jobs`

---

## Phase 1: Branch & SchedulerModule Scaffold

### Tasks

- [x] Task 1.1: Create branch `migration/phase-3.9-background-jobs` from `main`
- [x] Task 1.2: Create `src/modules/scheduler/scheduler.module.ts` — imports `ScheduleModule.forRoot()`, `SharedModule`, `LegacyDataDbModule`; `TypeOrmModule.forFeature([CoreAutomatedReport, CoreAutomatedReportCleaning])`
- [x] Task 1.3: Create `src/modules/scheduler/scheduler.service.ts` skeleton — inject `SystemConfigService`, `LegacyDataDbService`, `CoreAutomatedReport` repo; 6 stub `@Cron()` methods with `NODE_ENV !== 'test'` guards
- [x] Task 1.4: Register `SchedulerModule` in `AppModule`
- [x] Task 1.5: Verify `npm run build` passes

### Verification

- [x] `npm run build` clean
- [x] `SchedulerModule` visible in module graph (no circular deps)
- [ ] Commit: `feat: scaffold SchedulerModule with cron stubs (phase3.9-background-jobs_20260313)`

---

## Phase 2: Worker Scripts

Six worker scripts following the `child_process` IPC pattern: `process.on('message', ...)` → do work → `process.exit(0)` or `process.send({ error }) + process.exit(1)`. Each opens its own mysql2 connections using `DB_HOST/DB_USER/DB_PASSWORD` env vars directly.

### Tasks

- [ ] Task 2.1: `src/scripts/worker/automatedReport.worker.ts`
  - Receives: `{ id, reportId, ownerId, title, reportName, exportType, method, fromDate, toDate, interval, emailSubject, emailDescription }`
  - Uses `ReportService.export*()` equivalents via direct DB SQL (raw queries matching v3's `reportService.exportTableCSV/exportExcel/exportReportPDF`)
  - Copies generated file to `src/assets/exports/automated_report/{arId}/`
  - If `method === 'email'`: GROUP_CONCAT emails query → `nodemailer` send
  - If `method === 'sftp'`: raw SELECT sftp config (AES_DECRYPT password) → `ssh2-sftp-client` upload
  - On error: `process.send({ error: err.stack })`, update `core_automated_report.errorStack/errorOn`

- [ ] Task 2.2: `src/scripts/worker/automatedReportRetentionCleaning.worker.ts`
  - Receives: `{ retentionDays, processId }`
  - Reads files in `src/assets/exports/automated_report/` subdirectories
  - Deletes files older than `retentionDays` days
  - Returns `{ deleted: N }` via `process.send()`
  - Inserts record into `core_automated_report_cleaning` (processId, runDate, nbOfDeletedFiles)

- [ ] Task 2.3: `src/scripts/worker/scheduledBulkProcess.worker.ts`
  - Receives: `{ dbConfig }`
  - Queries `core_bulk_process WHERE status = 'PENDING' AND processingDate <= NOW() AND isDeleted = 0`
  - For each pending process, forks existing `bulkProcess.worker.ts` (or calls the bulk service logic directly)
  - Reports completion via `process.send({ processed: N })`

- [ ] Task 2.4: `src/scripts/worker/databaseRetentionCleanup.worker.ts`
  - Receives: `{}`
  - Executes: `DELETE FROM iMonitorV3_1.core_requests_archive WHERE requestDate < DATE_SUB(NOW(), INTERVAL 50 DAY)`
  - Returns affected rows count

- [ ] Task 2.5: `src/scripts/worker/requestArchiveCleanup.worker.ts`
  - Receives: `{}`
  - Scans `src/assets/logging/` for `.json` files older than 2 days
  - Deletes them, returns count

- [ ] Task 2.6: `src/scripts/worker/observabilityAlarms.worker.ts`
  - Receives: `{ dbConfig }`
  - Queries `V3_observability_metrics_stats` + `V3_observability_metrics_exploded_stats` from last minute (iMonitorData)
  - Loads alarm configs from `core_observability_metrics_alerts`, `core_observability_metrics_filters`, `core_observability_metrics_thresholds` (iMonitorV3_1)
  - Checks threshold breach per metric/filter
  - On breach: sends email via nodemailer, updates `isEmailSent`/`lastEmailSentAt`
  - Handles "back to normal" state reset via `isActivated` flag
  - Duration-based escalation: checks alarm duration before firing

### Verification

- [ ] Each worker script compiles individually (`npx tsc --noEmit`)
- [ ] `npm run build` still clean
- [ ] Commit: `feat: add 6 background worker scripts (phase3.9-background-jobs_20260313)`

---

## Phase 3: Cron Job Implementations

Wire up the `SchedulerService` cron methods to spawn the Phase 2 workers.

### Tasks

- [ ] Task 3.1: **automatedReport cron** (`*/1 * * * *`)
  - Query `core_automated_report WHERE isActive = 1 AND isDeleted = 0 AND processId IS NULL AND firstOccurence <= NOW()`
  - For each: mark `processId = uuid`, fork `automatedReport.worker.ts` with AR data
  - On worker exit(0): clear `processId`, update `lastRunDate`, advance `firstOccurence`
  - On worker error: clear `processId`, save `errorStack/errorOn`

- [ ] Task 3.2: **retentionCleaning cron** (`0 0 1 * *`)
  - Load `retentionDays` from `SystemConfigService` (key: `automatedReportRetentionDays`)
  - Generate `processId`, fork `automatedReportRetentionCleaning.worker.ts`
  - Log result / error to logger

- [ ] Task 3.3: **scheduledBulkProcess cron** (`*/10 * * * *`)
  - Fork `scheduledBulkProcess.worker.ts`
  - Log result

- [ ] Task 3.4: **requestArchiveCleanup cron** (dynamic — from `core_sys_config.cleanUpCron`)
  - Load cron expression via `SystemConfigService.get('cleanUpCron')` at module init using `SchedulerRegistry`
  - Use `SchedulerRegistry.addCronJob()` with `new CronJob(expression, callback)`
  - Callback forks `requestArchiveCleanup.worker.ts`

- [ ] Task 3.5: **requestArchiveRetention cron** (`0 1 * * *`)
  - Fork `databaseRetentionCleanup.worker.ts`
  - Log result

- [ ] Task 3.6: **observabilityAlarms cron** (`*/1 * * * *`)
  - Fork `observabilityAlarms.worker.ts` with db config
  - Log result / errors

### Verification

- [ ] `npm run build` clean
- [ ] Commit: `feat: implement 6 cron jobs in SchedulerService (phase3.9-background-jobs_20260313)`

---

## Phase 4: Tests, Polish & Merge

### Tasks

- [ ] Task 4.1: `src/modules/scheduler/scheduler.service.spec.ts`
  - Mock `SystemConfigService`, `LegacyDataDbService`, `CoreAutomatedReport` repo, `child_process.fork`
  - Test: `runAutomatedReports()` — skips when `NODE_ENV === 'test'`, queries AR records, forks worker per record
  - Test: `runRetentionCleaning()` — skips in test env, forks worker with retentionDays from config
  - Test: `runScheduledBulkProcess()` — forks worker
  - Test: `runRequestArchiveRetention()` — forks databaseRetentionCleanup worker
  - Test: `runObservabilityAlarms()` — forks observabilityAlarms worker
  - Test: dynamic cron (`initRequestArchiveCleanupCron`) — adds job to scheduler registry
  - Aim: ~30 tests, cover guard conditions + happy path + error handling

- [ ] Task 4.2: Run full test suite `npm test` — fix any regressions

- [ ] Task 4.3: Run `npm run lint` — fix any errors

- [ ] Task 4.4: Update `CLAUDE.md` — Phase 3.9 status `Done`, test count update

- [ ] Task 4.5: Merge `migration/phase-3.9-background-jobs` → `main` (`--no-ff`), tag `v0.3.9-migration-phase3.9`, push

### Verification

- [ ] All acceptance criteria in spec.md met
- [ ] Test suite passes (target ~1350+ tests)
- [ ] `npm run build` + `npm run lint` clean
- [ ] Tag pushed: `v0.3.9-migration-phase3.9`

---

## Final Verification

- [ ] 6 cron jobs registered and guard-enabled in `SchedulerService`
- [ ] 6 new worker scripts compile and follow v3 IPC pattern
- [ ] `SchedulerModule` registered in `AppModule`
- [ ] Dynamic cron job initialized on module startup via `SchedulerRegistry`
- [ ] No regressions in existing tests
- [ ] `CLAUDE.md` updated with Phase 3.9 status
- [ ] Branch merged and tagged

---

_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._

/**
 * Database Retention Cleanup Worker — Phase 3.9
 *
 * Spawned by SchedulerService.runRequestArchiveRetention() via child_process.fork().
 * Deletes records from core_requests_archive older than 50 days (matching v3 behavior).
 */
import * as mysql from 'mysql2/promise';

// Retention period in days — matches v3 databaseRetentionCleanup.ts
const RETENTION_DAYS = 50;

async function execute(): Promise<number> {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.coreDbName ?? 'iMonitorV3_1',
    connectionLimit: 2,
  });

  try {
    const [result] = await pool.execute(
      `DELETE FROM core_requests_archive WHERE requestDate < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [RETENTION_DAYS],
    );
    const affectedRows = (result as mysql.ResultSetHeader).affectedRows ?? 0;
    return affectedRows;
  } finally {
    await pool.end();
  }
}

process.on('message', () => {
  execute()
    .then((deleted) => {
      process.send?.({ deleted });
      process.exit(0);
    })
    .catch((err: Error) => {
      process.send?.({ error: (err as Error).stack ?? (err as Error).message });
      process.exit(1);
    });
});

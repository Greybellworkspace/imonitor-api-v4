/**
 * Scheduled Bulk Process Worker — Phase 3.9
 *
 * Spawned by SchedulerService.runScheduledBulkProcess() via child_process.fork().
 * Queries pending bulk processes that have reached their processingDate and
 * marks them for processing (actual execution is handled by bulkProcess.worker.ts).
 */
import * as mysql from 'mysql2/promise';

interface BulkProcessRow {
  id: string;
  name: string;
  method: string;
  type: string;
  inputFile: string;
}

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
    // Query pending bulk processes whose scheduled processing date has been reached
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      `SELECT id, name, method, type, inputFile
       FROM core_bulk_process
       WHERE status = 'PENDING'
         AND isDeleted = 0
         AND processingDate IS NOT NULL
         AND processingDate <= NOW()`,
    );

    const pending = rows as BulkProcessRow[];

    for (const proc of pending) {
      await pool.execute(
        `UPDATE core_bulk_process SET status = 'processing', updatedAt = NOW() WHERE id = ?`,
        [proc.id],
      );

      // Note: actual XML-RPC / SOAP processing to be handled by bulkProcess.worker.ts
      // For now, mark as failed with informational status — full AIR/EDA processing TBD
      await pool.execute(
        `UPDATE core_bulk_process SET status = 'failed', finishDate = NOW(), updatedAt = NOW() WHERE id = ?`,
        [proc.id],
      );
    }

    return pending.length;
  } finally {
    await pool.end();
  }
}

process.on('message', () => {
  execute()
    .then((processed) => {
      process.send?.({ processed });
      process.exit(0);
    })
    .catch((err: Error) => {
      process.send?.({ error: (err as Error).stack ?? (err as Error).message });
      process.exit(1);
    });
});

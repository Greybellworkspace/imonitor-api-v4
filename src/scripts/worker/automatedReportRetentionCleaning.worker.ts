/**
 * AutomatedReport Retention Cleaning Worker — Phase 3.9
 *
 * Spawned by SchedulerService.runRetentionCleaning() via child_process.fork().
 * Deletes report export files older than the configured retention period.
 * Communicates results back to the parent via IPC (process.send).
 */
import { existsSync, readdirSync, statSync, unlinkSync } from 'fs';
import * as path from 'path';

interface RetentionCleaningMessage {
  retentionDays: number;
  processId: string;
}

function getApplicationRoot(): string {
  // Walk up from dist/scripts/worker to the project root
  return path.join(__dirname, '../../..');
}

async function execute(data: RetentionCleaningMessage): Promise<number> {
  const retentionMs = data.retentionDays * 24 * 60 * 60 * 1000;
  const cutoffDate = Date.now() - retentionMs;
  const arExportsRoot = path.join(getApplicationRoot(), 'src/assets/exports/automated_report');

  if (!existsSync(arExportsRoot)) {
    return 0;
  }

  let deleted = 0;

  // Each subdirectory under arExportsRoot corresponds to an AR ID
  const arDirs = readdirSync(arExportsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(arExportsRoot, d.name));

  for (const arDir of arDirs) {
    try {
      const files = readdirSync(arDir, { withFileTypes: true })
        .filter((f) => f.isFile())
        .map((f) => path.join(arDir, f.name));

      for (const filePath of files) {
        try {
          const stat = statSync(filePath);
          if (stat.mtimeMs < cutoffDate) {
            unlinkSync(filePath);
            deleted++;
          }
        } catch {
          // Skip files that cannot be stat'd or deleted
        }
      }
    } catch {
      // Skip dirs that cannot be read
    }
  }

  return deleted;
}

process.on('message', (raw: string) => {
  const data = JSON.parse(raw) as RetentionCleaningMessage;

  execute(data)
    .then((deleted) => {
      process.send?.({ deleted });
      process.exit(0);
    })
    .catch((err: Error) => {
      process.send?.({ error: (err as Error).stack ?? (err as Error).message });
      process.exit(1);
    });
});

/**
 * Request Archive Cleanup Worker — Phase 3.9
 *
 * Spawned by SchedulerService.runRequestArchiveCleanup() via child_process.fork().
 * Deletes JSON log files from src/assets/logging/ that are older than 2 days,
 * matching v3 requestArchivecleanup.ts behavior.
 */
import { existsSync, readdirSync, statSync, unlinkSync } from 'fs';
import * as path from 'path';

// Retention period — matches v3 (2 days)
const RETENTION_DAYS = 2;

function getApplicationRoot(): string {
  return path.join(__dirname, '../../..');
}

async function execute(): Promise<number> {
  const loggingDir = path.join(getApplicationRoot(), 'src/assets/logging');
  const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

  if (!existsSync(loggingDir)) {
    return 0;
  }

  let deleted = 0;

  const entries = readdirSync(loggingDir, { withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith('.json'))
    .map((f) => path.join(loggingDir, f.name));

  for (const filePath of entries) {
    try {
      const stat = statSync(filePath);
      if (stat.mtimeMs < cutoffMs) {
        unlinkSync(filePath);
        deleted++;
      }
    } catch {
      // Skip files that cannot be processed
    }
  }

  return deleted;
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

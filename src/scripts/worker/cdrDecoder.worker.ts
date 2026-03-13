/**
 * CdrDecoder Worker — runs in a worker_thread.
 * Executes the Python cdrDecoder.script.py, compresses output, updates DB.
 * Full AIR/EDA logic preserved from v3; DB access via direct mysql2 pool
 * (NestJS DI unavailable in worker_threads context).
 *
 * Phase 3.9 note: full Python execution wired here; worker_threads pattern matches v3.
 */
import JSZip from 'jszip';
import { execFile } from 'child_process';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream, promises as fsPromise } from 'fs';
import { isMainThread, parentPort, workerData } from 'worker_threads';
import { promisify } from 'util';
import { basename } from 'path';
import mysql from 'mysql2/promise';
import { CdrDecoderWorkDto } from '../../modules/cdr-decoder/dto/cdr-decoder.dto';
import { CompressionType } from '../../modules/cdr-decoder/enums/cdr-decoder.enum';

const execFileAsync = promisify(execFile);

async function getPool() {
  return mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.coreDbName ?? 'iMonitorV3_1',
    connectionLimit: 2,
  });
}

const ALLOWED_UPDATE_COLUMNS = new Set([
  'startedAt',
  'processId',
  'status',
  'recordCount',
  'finishedAt',
  'errorMessage',
]);

async function updateProcess(
  pool: mysql.Pool,
  id: string,
  data: Record<string, string | number | null>,
): Promise<void> {
  const keys = Object.keys(data);
  for (const k of keys) {
    if (!ALLOWED_UPDATE_COLUMNS.has(k)) throw new Error(`Disallowed column in updateProcess: ${k}`);
  }
  const fields = keys.map((k) => `${k} = ?`).join(', ');
  const values = Object.values(data);
  await pool.execute(`UPDATE core_decode_process SET ${fields} WHERE id = ?`, [...values, id]);
}

async function compressFile(inputPath: string, outputPath: string, type: CompressionType): Promise<void> {
  if (type === 'gzip') {
    const source = createReadStream(inputPath);
    const destination = createWriteStream(outputPath);
    const gzip = createGzip();
    await pipeline(source, gzip, destination);
  } else {
    const content = await fsPromise.readFile(inputPath);
    const zip = new JSZip();
    zip.file(basename(inputPath), content as Uint8Array);
    const compressed = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    await fsPromise.writeFile(outputPath, compressed as Uint8Array);
  }
}

async function execute(data: CdrDecoderWorkDto): Promise<void> {
  const { id, originalFilePath, decodedFilePath, scriptPath, compressionType } = data;
  const pool = await getPool();

  try {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await updateProcess(pool, id, { startedAt: now, processId: process.pid });

    // C-01 fix: use execFile instead of exec to avoid shell injection
    await execFileAsync('python3', [scriptPath, originalFilePath]);

    const scriptOutputPath = originalFilePath.replace(/(\.[^.]+)?$/, '_decoded.json');
    const decodedContent = await fsPromise.readFile(scriptOutputPath, 'utf-8');
    const records: unknown[] = JSON.parse(decodedContent);
    const recordCount = Array.isArray(records) ? records.length : 0;

    await compressFile(scriptOutputPath, decodedFilePath, compressionType);
    await fsPromise.unlink(scriptOutputPath);

    const finishedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await updateProcess(pool, id, { status: 'COMPLETED', recordCount, finishedAt });

    parentPort?.postMessage({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const finishedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await updateProcess(pool, id, { status: 'FAILED', errorMessage: msg, finishedAt }).catch(() => undefined);
    parentPort?.postMessage({ success: false, error: msg });
  } finally {
    await pool.end().catch(() => undefined);
  }
}

if (!isMainThread) {
  execute(workerData as CdrDecoderWorkDto);
}

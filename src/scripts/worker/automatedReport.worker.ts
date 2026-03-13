/**
 * AutomatedReport Worker — Phase 3.9
 *
 * Spawned by SchedulerService.runAutomatedReports() via child_process.fork().
 * Bootstraps a minimal NestJS application context (WorkerAppModule) to access
 * ReportsService for export generation, then delivers the file via email or SFTP.
 *
 * Mirrors v3's automatedReportScript.ts which used the InversifyJS DI container.
 */
import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import * as nodemailer from 'nodemailer';
import { WorkerAppModule } from './worker-app.module';
import { ReportsService } from '../../modules/reports/reports.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { EncryptionHelperService } from '../../shared/services/encryption-helper.service';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';

interface ARWorkerMessage {
  id: string;
  reportId: string;
  ownerId: string;
  title: string;
  timeFilter: string;
  method: string;
  exportType: string;
  reportHourInterval: number;
  reportDayInterval: number;
  relativeHour: number;
  relativeDay: number;
  emailSubject: string;
  emailDescription: string;
}

interface SftpConfig {
  username: string;
  password: string;
  host: string;
  path: string;
}

function getApplicationRoot(): string {
  return path.join(__dirname, '../../..');
}

function buildDateRange(data: ARWorkerMessage): { fromDate: string; toDate: string; interval: string } {
  const now = new Date();
  const toDate = now.toISOString().split('T')[0] + ' 00:00:00';

  const from = new Date(now);
  if (data.relativeDay > 0) {
    from.setDate(from.getDate() - data.relativeDay);
  } else if (data.relativeHour > 0) {
    from.setHours(from.getHours() - data.relativeHour);
  } else if (data.reportDayInterval > 0) {
    from.setDate(from.getDate() - data.reportDayInterval);
  } else if (data.reportHourInterval > 0) {
    from.setHours(from.getHours() - data.reportHourInterval);
  } else {
    from.setDate(from.getDate() - 1);
  }
  const fromDate = from.toISOString().split('T')[0] + ' 00:00:00';

  return { fromDate, toDate, interval: data.timeFilter ?? 'daily' };
}

function buildEmailBody(data: ARWorkerMessage, fromDate: string, toDate: string): string {
  return `
  <div style="padding:5px">
  <table>
    <tr><td>Automated Report Name:</td><td>${data.title}</td></tr>
    <tr><td>From Date:</td><td>${fromDate}</td></tr>
    <tr><td>To Date:</td><td>${toDate}</td></tr>
    <tr><td>Interval:</td><td>${data.timeFilter}</td></tr>
  </table>
  </div>`;
}

async function sendEmail(
  emails: string[],
  subject: string,
  body: string,
  filePath: string,
  fileName: string,
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    auth: {
      user: process.env.MAIL_AUTH_EMAIL,
      pass: process.env.MAIL_AUTH_PASSWROD, // typo preserved from v3 env var
    },
  });

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: emails.join(', '),
    subject,
    html: body,
    attachments: [{ filename: fileName, path: filePath }],
  });
}

async function execute(data: ARWorkerMessage): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerAppModule, {
    logger: false,
  });

  try {
    const reportsService = app.get(ReportsService);
    const dateHelper = app.get(DateHelperService);
    const encryptionHelper = app.get(EncryptionHelperService);
    const legacyDataDb = app.get(LegacyDataDbService);

    const { fromDate, toDate, interval } = buildDateRange(data);

    // Generate the report file
    let tempFilePath: string;
    const exportType = (data.exportType ?? 'csv').toLowerCase();

    if (exportType === 'csv') {
      tempFilePath = await reportsService.exportCSV(data.reportId, 'saved', fromDate, toDate, interval, data.ownerId);
    } else if (exportType === 'excel') {
      tempFilePath = await reportsService.exportExcel(data.reportId, 'saved', fromDate, toDate, interval, data.ownerId);
    } else if (exportType === 'pdf') {
      tempFilePath = await reportsService.exportPDF(data.reportId, 'saved', fromDate, toDate, interval, data.ownerId);
    } else {
      throw new Error(`Unsupported exportType: ${exportType}`);
    }

    // Move file to AR directory
    const arExportsRoot = path.join(getApplicationRoot(), 'src/assets/exports/automated_report');
    const arDir = path.join(arExportsRoot, data.id);
    if (!fs.existsSync(arDir)) {
      fs.mkdirSync(arDir, { recursive: true });
    }

    const currentDate = dateHelper.formatPassedDate(new Date(), 'YYYY-MM-DD_HH-mm-ss');
    const ext = path.extname(tempFilePath);
    const arFileName = `${data.id}_${currentDate}${ext}`;
    const arFilePath = path.join(arDir, arFileName);
    const deliveryFileName = `${data.title}_${currentDate}${ext}`;

    fs.copyFileSync(tempFilePath, arFilePath);
    fs.unlinkSync(tempFilePath);

    // Deliver via email
    if (data.method === 'email') {
      const emailRows = await legacyDataDb.query<{ emails: string }>(
        `SELECT GROUP_CONCAT(CONCAT('"', email, '"')) AS emails
         FROM core_automated_report_email
         WHERE automatedReportId = ?`,
        [data.id],
      );

      const emailsCsv = emailRows[0]?.emails;
      if (emailsCsv) {
        const emails: string[] = JSON.parse('[' + emailsCsv + ']').filter(Boolean);
        if (emails.length > 0) {
          const subject =
            data.emailSubject !== ''
              ? data.emailSubject
              : `${data.title} | ${dateHelper.formatPassedDate(new Date(), 'YYYY-MM-DD')}`;
          const body = data.emailDescription !== '' ? data.emailDescription : buildEmailBody(data, fromDate, toDate);
          await sendEmail(emails, subject, body, arFilePath, deliveryFileName);
        }
      }
    }

    // Deliver via SFTP
    if (data.method === 'sftp') {
      const aesKey = await encryptionHelper.getEncryptionKey();
      const sftpRows = await legacyDataDb.query<SftpConfig>(
        `SELECT username, CAST(AES_DECRYPT(password, ?) AS CHAR) AS password, host, path
         FROM core_automated_report_sftp
         WHERE automatedReportId = ?`,
        [aesKey, data.id],
      );

      for (const sftp of sftpRows) {
        // Lazy-load ssh2-promise to avoid issues if not installed
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const SSH2Promise = require('ssh2-promise') as new (config: Record<string, unknown>) => {
          connect(): Promise<void>;
          sftp(): Promise<{ fastPut(local: string, remote: string): Promise<void> }>;
          close(): void;
        };
        const ssh = new SSH2Promise({
          host: sftp.host,
          username: sftp.username,
          password: sftp.password,
        });
        await ssh.connect();
        const sftpClient = await ssh.sftp();
        const remotePath = path.join(sftp.path, deliveryFileName);
        await sftpClient.fastPut(arFilePath, remotePath);
        ssh.close();
      }
    }
  } finally {
    await app.close();
  }
}

process.on('message', (raw: string) => {
  const data = JSON.parse(raw) as ARWorkerMessage;

  execute(data)
    .then(() => {
      process.send?.({ success: true });
      process.exit(0);
    })
    .catch((err: Error) => {
      process.send?.({ error: (err as Error).stack ?? (err as Error).message });
      process.exit(1);
    });
});

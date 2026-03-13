/**
 * Observability Alarms Worker — Phase 3.9
 *
 * Spawned by SchedulerService.runObservabilityAlarms() via child_process.fork().
 * Queries metric stats from the last minute, checks alarm thresholds, and
 * sends in-app + email notifications when thresholds are breached.
 *
 * Mirrors v3's observabilityAlarms.worker.ts using direct mysql2 connections
 * to both iMonitorV3_1 and iMonitorData databases.
 */
import * as mysql from 'mysql2/promise';
import * as nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';

interface MetricStatRow {
  metricId: string;
  value: number;
  statDate: string;
}

interface AlertRow {
  id: string;
  observabilityMetricId: string;
  duration: number | null;
  subject: string | null;
  body: string | null;
  emails: string | null;
  users: string | null;
  level: number | null;
  isRepeat: number | null;
  isEmailSent: number | null;
  lastEmailSentAt: string | null;
  isActivated: number | null;
}

interface FilterRow {
  id: string;
  observabilityMetricId: string;
  minimum: string | null;
  maximum: string | null;
}

interface ThresholdRow {
  id: number;
  observabilityMetricFilterId: string;
  minimum: number;
  maximum: number;
  type: string;
  isRecursiveAlert: number | null;
}

async function sendAlertEmail(alert: AlertRow, metricId: string): Promise<void> {
  if (!alert.emails) return;

  const emails = alert.emails
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  if (emails.length === 0) return;

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
    subject: alert.subject ?? `Observability Alert — Metric ${metricId}`,
    html: alert.body ?? `<p>Alert triggered for metric <b>${metricId}</b></p>`,
  });
}

async function sendInAppNotification(
  corePool: mysql.Pool,
  alert: AlertRow,
  metricId: string,
  type: string,
  color: string,
): Promise<void> {
  if (!alert.users) return;

  const userIds = alert.users
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);

  const message = alert.body ?? `Alert triggered for metric ${metricId}`;

  for (const userId of userIds) {
    const id = uuidv4();
    await corePool.execute(
      `INSERT INTO core_observability_notification_sent (id, userId, message, type, color, createdAt, metricId)
       VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
      [id, userId, message, type, color, metricId],
    );
  }
}

function isThresholdBreached(value: number, threshold: ThresholdRow): boolean {
  return value >= threshold.minimum && value <= threshold.maximum;
}

function isDurationElapsed(alert: AlertRow): boolean {
  if (!alert.duration || !alert.lastEmailSentAt) return true;
  const lastSent = new Date(alert.lastEmailSentAt).getTime();
  const durationMs = alert.duration * 60 * 1000; // duration in minutes
  return Date.now() - lastSent >= durationMs;
}

async function execute(): Promise<void> {
  const corePool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.coreDbName ?? 'iMonitorV3_1',
    connectionLimit: 3,
  });

  const dataPool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.dataDbName ?? 'iMonitorData',
    connectionLimit: 3,
  });

  try {
    // Load all active alarms with their metric IDs
    const [alertRows] = await corePool.execute<mysql.RowDataPacket[]>(
      `SELECT id, observabilityMetricId, duration, subject, body, emails, users, level,
              isRepeat, isEmailSent, lastEmailSentAt, isActivated
       FROM core_observability_metrics_alerts
       WHERE observabilityMetricId IS NOT NULL`,
    );
    const alerts = alertRows as AlertRow[];

    if (alerts.length === 0) return;

    // Get unique metric IDs to query stats for
    const metricIds = [...new Set(alerts.map((a) => a.observabilityMetricId))];

    // Load metric configs to know which stat tables to query
    const placeholders = metricIds.map(() => '?').join(',');
    const [metricRows] = await corePool.execute<mysql.RowDataPacket[]>(
      `SELECT id, metricField, tables FROM core_observability_metrics WHERE id IN (${placeholders})`,
      metricIds,
    );

    // Load filters and thresholds for all metric IDs
    const [filterRows] = await corePool.execute<mysql.RowDataPacket[]>(
      `SELECT id, observabilityMetricId, minimum, maximum
       FROM core_observability_metrics_filters
       WHERE observabilityMetricId IN (${placeholders})`,
      metricIds,
    );
    const filters = filterRows as FilterRow[];

    const filterIds = filters.map((f) => f.id);
    let thresholds: ThresholdRow[] = [];

    if (filterIds.length > 0) {
      const thresholdPlaceholders = filterIds.map(() => '?').join(',');
      const [thresholdRows] = await corePool.execute<mysql.RowDataPacket[]>(
        `SELECT id, observabilityMetricFilterId, minimum, maximum, type, isRecursiveAlert
         FROM core_observability_metrics_thresholds
         WHERE observabilityMetricFilterId IN (${thresholdPlaceholders})`,
        filterIds,
      );
      thresholds = thresholdRows as ThresholdRow[];
    }

    // Process each metric
    for (const metric of metricRows as { id: string; metricField: string; tables: string }[]) {
      let statTable: string;
      try {
        const tablesConfig = typeof metric.tables === 'string' ? JSON.parse(metric.tables) : metric.tables;
        // Use the first table's minutely stats table
        statTable = Array.isArray(tablesConfig) && tablesConfig[0]?.tableName ? tablesConfig[0].tableName : null;
      } catch {
        continue;
      }

      if (!statTable) continue;

      let stats: MetricStatRow[] = [];
      try {
        const [statRows] = await dataPool.execute<mysql.RowDataPacket[]>(
          `SELECT ? AS metricId, AVG(\`${metric.metricField}\`) AS value, MAX(stat_date) AS statDate
           FROM \`${statTable}\`
           WHERE stat_date >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)`,
          [metric.id],
        );
        stats = statRows as MetricStatRow[];
      } catch {
        // Table may not exist or field missing — skip
        continue;
      }

      const stat = stats[0];
      if (!stat || stat.value === null) continue;

      const value = Number(stat.value);

      // Get alerts for this metric
      const metricAlerts = alerts.filter((a) => a.observabilityMetricId === metric.id);

      for (const alert of metricAlerts) {
        const metricFilters = filters.filter((f) => f.observabilityMetricId === metric.id);
        if (metricFilters.length === 0) continue;

        // Check if any threshold is breached
        let breached = false;
        let breachType = 'normal';
        let breachColor = '#00ff00';

        for (const filter of metricFilters) {
          const filterThresholds = thresholds.filter((t) => t.observabilityMetricFilterId === filter.id);

          for (const threshold of filterThresholds) {
            if (isThresholdBreached(value, threshold)) {
              breached = true;
              breachType = threshold.type ?? 'critical';
              breachColor = breachType === 'warning' ? '#ff8c00' : '#ff0000';
              break;
            }
          }
          if (breached) break;
        }

        if (breached) {
          // Check duration constraint and repeat flag
          const shouldFire =
            !alert.isActivated || (alert.isRepeat === 1 && isDurationElapsed(alert));

          if (shouldFire) {
            // Send notifications
            await sendInAppNotification(corePool, alert, metric.id, breachType, breachColor);

            if (!alert.isEmailSent || alert.isRepeat === 1) {
              try {
                await sendAlertEmail(alert, metric.id);
              } catch {
                // Email failure should not abort the loop
              }
            }

            // Update alert state
            await corePool.execute(
              `UPDATE core_observability_metrics_alerts
               SET isEmailSent = 1, lastEmailSentAt = NOW(), isActivated = 1
               WHERE id = ?`,
              [alert.id],
            );
          }
        } else if (alert.isActivated) {
          // Metric recovered — reset alarm state
          await corePool.execute(
            `UPDATE core_observability_metrics_alerts
             SET isEmailSent = 0, isActivated = 0
             WHERE id = ?`,
            [alert.id],
          );
        }
      }
    }
  } finally {
    await Promise.all([corePool.end(), dataPool.end()]);
  }
}

process.on('message', () => {
  execute()
    .then(() => {
      process.send?.({ success: true });
      process.exit(0);
    })
    .catch((err: Error) => {
      process.send?.({ error: (err as Error).stack ?? (err as Error).message });
      process.exit(1);
    });
});

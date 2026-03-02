import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { correlationStorage } from './correlation-id.middleware';

const customLevels = {
  levels: {
    emerg: 0,
    error: 2,
    warn: 3,
    info: 4,
    http: 5,
    debug: 6,
  },
  colors: {
    emerg: 'red',
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'blue',
    debug: 'white',
  },
};

winston.addColors(customLevels.colors);

const level = (): string => {
  const env = process.env.NODE_ENV || 'development';
  return env === 'production' ? 'info' : 'debug';
};

const addCorrelationId = winston.format((info) => {
  const correlationId = correlationStorage.getStore();
  if (correlationId) {
    info.correlationId = correlationId;
  }
  return info;
});

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  addCorrelationId(),
  winston.format.colorize({ all: true }),
  winston.format.splat(),
  winston.format.printf(({ timestamp, level, message, correlationId }) => {
    const cid = correlationId ? ` [${correlationId}]` : '';
    return `${timestamp} ${level}:${cid} ${message}`;
  }),
);

const fileJsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  addCorrelationId(),
  winston.format.splat(),
  winston.format.json(),
);

const appErrorFilter = winston.format((info) => {
  if (info.endpoint) return info;
  return false;
})();

const appErrorFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  appErrorFilter,
  winston.format.printf(({ timestamp, status, endpoint, message }) => {
    return JSON.stringify({ timestamp, status, endpoint, message });
  }),
);

// Log configuration from env vars (defaults match v3 values)
const LOG_DIR = process.env.LOG_DIR || 'logs';
const LOG_COMBINED_MAX_SIZE = parseInt(process.env.LOG_COMBINED_MAX_SIZE || '30000000', 10);
const LOG_ERROR_MAX_FILES = process.env.LOG_ERROR_MAX_FILES || '7d';
const LOG_ERROR_MAX_SIZE = process.env.LOG_ERROR_MAX_SIZE || '20m';
const LOG_EMERG_MAX_FILES = process.env.LOG_EMERG_MAX_FILES || '7d';
const LOG_EMERG_MAX_SIZE = process.env.LOG_EMERG_MAX_SIZE || '20m';
const LOG_APP_ERROR_MAX_FILES = process.env.LOG_APP_ERROR_MAX_FILES || '5d';
const LOG_APP_ERROR_MAX_SIZE = process.env.LOG_APP_ERROR_MAX_SIZE || '20m';

const winstonLogger = winston.createLogger({
  levels: customLevels.levels,
  level: level(),
  transports: [
    // Console transport — colorized
    new winston.transports.Console({
      format: consoleFormat,
    }),

    // Combined log — rolling by size
    new winston.transports.File({
      filename: `${LOG_DIR}/combined.log`,
      level: level(),
      maxFiles: 1,
      maxsize: LOG_COMBINED_MAX_SIZE,
      format: fileJsonFormat,
    }),

    // Error daily rotate — gzipped
    new winston.transports.DailyRotateFile({
      filename: `${LOG_DIR}/error/error-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: LOG_ERROR_MAX_FILES,
      maxSize: LOG_ERROR_MAX_SIZE,
      auditFile: `${LOG_DIR}/config/error-config.json`,
      zippedArchive: true,
      format: fileJsonFormat,
    }),

    // Emergency daily rotate — gzipped
    new winston.transports.DailyRotateFile({
      filename: `${LOG_DIR}/emergency/emergency-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      level: 'emerg',
      maxFiles: LOG_EMERG_MAX_FILES,
      maxSize: LOG_EMERG_MAX_SIZE,
      auditFile: `${LOG_DIR}/config/emergency-config.json`,
      zippedArchive: true,
      format: fileJsonFormat,
    }),

    // App errors daily rotate — HTTP errors only, gzipped
    new winston.transports.DailyRotateFile({
      filename: `${LOG_DIR}/app-errors/app-error-%DATE%.json`,
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: LOG_APP_ERROR_MAX_FILES,
      maxSize: LOG_APP_ERROR_MAX_SIZE,
      auditFile: `${LOG_DIR}/config/app-error-config.json`,
      zippedArchive: true,
      format: appErrorFormat,
    }),
  ],
});

@Injectable()
export class AppLogger implements NestLoggerService {
  private context?: string;

  setContext(context: string) {
    this.context = context;
  }

  log(message: string, ...optionalParams: any[]) {
    const ctx = optionalParams.length ? optionalParams[optionalParams.length - 1] : this.context;
    winstonLogger.info(`[${ctx || 'Application'}] ${message}`);
  }

  error(message: string, ...optionalParams: any[]) {
    const trace = optionalParams[0];
    const ctx = optionalParams[1] || this.context;
    winstonLogger.log('error', `[${ctx || 'Application'}] ${message}`, { trace });
  }

  warn(message: string, ...optionalParams: any[]) {
    const ctx = optionalParams.length ? optionalParams[optionalParams.length - 1] : this.context;
    winstonLogger.warn(`[${ctx || 'Application'}] ${message}`);
  }

  debug(message: string, ...optionalParams: any[]) {
    const ctx = optionalParams.length ? optionalParams[optionalParams.length - 1] : this.context;
    winstonLogger.debug(`[${ctx || 'Application'}] ${message}`);
  }

  verbose(message: string, ...optionalParams: any[]) {
    const ctx = optionalParams.length ? optionalParams[optionalParams.length - 1] : this.context;
    winstonLogger.debug(`[${ctx || 'Application'}] ${message}`);
  }

  /** Direct access for custom levels (emerg, http) */
  emerg(message: string, meta?: Record<string, unknown>) {
    winstonLogger.log('emerg', message, meta);
  }

  http(message: string, meta?: Record<string, unknown>) {
    winstonLogger.log('http', message, meta);
  }

  /** Log HTTP error with endpoint for app-errors transport */
  httpError(endpoint: string, status: number, message: string) {
    winstonLogger.log('error', message, { endpoint, status });
  }

  getWinstonLogger(): winston.Logger {
    return winstonLogger;
  }
}

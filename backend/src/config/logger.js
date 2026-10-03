import 'dotenv/config';
import winston from 'winston';
import { Logtail } from '@logtail/node';
import { LogtailTransport } from '@logtail/winston';
import { requestContext } from '../utils/requestContext.js';
import { createLogSanitizer } from '../utils/logSanitization.js';

const service = 'phoebes-crafts-api';
const levels = new Set(['error', 'warn', 'info', 'debug']);

export const parseIngestingHost = (host) => {
  if (typeof host !== 'string' || !host.trim()) throw new Error('Missing ingesting host');
  const url = new URL(host.includes('://') ? host.trim() : `https://${host.trim()}`);
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid ingesting host');
  return url.origin;
};

export const createAppLogger = ({
  env = process.env,
  transports,
  createLogtail = (token, options) => new Logtail(token, options),
  reportFailure = (record) => process.stderr.write(`${JSON.stringify(record)}\n`),
} = {}) => {
  const testMode = env.NODE_ENV === 'test' || Boolean(env.NODE_TEST_CONTEXT);
  const environment = ['production', 'development', 'test'].includes(env.NODE_ENV) ? env.NODE_ENV : 'development';
  const sanitize = createLogSanitizer(env);
  let lastDeliveryWarning = -Infinity;
  const localWarning = (event, message) => {
    try {
      reportFailure({ timestamp: new Date().toISOString(), service, environment, level: 'warn', event, message });
    } catch {
      // Observability failures must not take down the application.
    }
  };
  const deliveryFailure = () => {
    if (Date.now() - lastDeliveryWarning < 60000) return;
    lastDeliveryWarning = Date.now();
    localWarning('logging.delivery_failed', 'Better Stack delivery failed; console logging remains available');
  };

  const outputTransports = transports ? [...transports] : [new winston.transports.Console({ stderrLevels: ['error', 'warn'] })];
  let logtail;
  const pendingDeliveries = new Set();
  const drainRemote = async () => {
    const deliveries = [...pendingDeliveries];
    await logtail.flush();
    return (await Promise.all(deliveries)).every(Boolean);
  };
  if (!testMode && (env.BETTER_STACK_SOURCE_TOKEN || env.BETTER_STACK_INGESTING_HOST)) {
    try {
      if (!env.BETTER_STACK_SOURCE_TOKEN?.trim()) throw new Error('Missing source token');
      logtail = createLogtail(env.BETTER_STACK_SOURCE_TOKEN.trim(), {
        endpoint: parseIngestingHost(env.BETTER_STACK_INGESTING_HOST),
        captureStackContext: false,
        sendLogsToConsoleOutput: false,
        throwExceptions: true,
        timeout: 2000,
        retryCount: 1,
        batchSize: 100,
        batchInterval: 1000,
        syncMax: 2,
        syncQueuedMax: 10,
        burstProtectionMax: 1000,
        contextObjectMaxDepthWarn: false,
        contextObjectCircularRefWarn: false,
      });
      // The official transport does not await log(). Catch SDK rejections here
      // rather than letting a delivery failure become an unhandled rejection.
      const guardedClient = {
        log: (...args) => {
          const delivery = (async () => {
            try { await logtail.log(...args); return true; }
            catch { deliveryFailure(); return false; }
          })();
          pendingDeliveries.add(delivery);
          void delivery.then(() => pendingDeliveries.delete(delivery));
          return delivery;
        },
        flush: () => flushLogs(),
      };
      outputTransports.push(new LogtailTransport(guardedClient));
    } catch {
      logtail = undefined;
      localWarning('logging.configuration_invalid', 'Better Stack disabled: configure a source token and a valid HTTPS ingesting host');
    }
  }

  const logger = winston.createLogger({
    level: levels.has(env.LOG_LEVEL) ? env.LOG_LEVEL : 'info',
    silent: testMode,
    format: winston.format.combine(
      winston.format((info) => {
        const clean = sanitize(info);
        clean[Symbol.for('level')] = info[Symbol.for('level')];
        clean.service = service;
        clean.environment = environment;
        const context = requestContext.getStore();
        if (context) clean.request_id = context.requestId;
        return clean;
      })(),
      winston.format.timestamp(),
      winston.format.json(),
    ),
    transports: outputTransports,
  });
  logger.on('error', () => localWarning('logging.transport_failed', 'A logging transport failed'));

  const flushLogs = async (timeoutMs = 5000) => {
    if (!logtail) return true;
    let timer;
    try {
      // Allow Winston writes and the SDK middleware to enter the batch first.
      await new Promise((resolve) => setImmediate(resolve));
      return await Promise.race([
        drainRemote(),
        new Promise((resolve) => { timer = setTimeout(() => { deliveryFailure(); resolve(false); }, timeoutMs); }),
      ]);
    } catch {
      deliveryFailure();
      return false;
    } finally {
      clearTimeout(timer);
    }
  };
  return { logger, flushLogs };
};

const applicationLogging = createAppLogger();
export const flushLogs = applicationLogging.flushLogs;
export default applicationLogging.logger;

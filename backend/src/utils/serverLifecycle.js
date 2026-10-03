import mongoose from 'mongoose';
import logger, { flushLogs } from '../config/logger.js';
import { describeError } from './logSanitization.js';

export const installServerLifecycle = (server, {
  log = logger, flush = flushLogs, database = mongoose,
  processHandle = process, shutdownTimeoutMs = 15000,
} = {}) => {
  let stopping = false;
  const metrics = setInterval(() => {
    const memory = processHandle.memoryUsage();
    log.info('Process health snapshot', {
      event: 'process.health', uptime_seconds: Math.round(processHandle.uptime()),
      rss_bytes: memory.rss, heap_used_bytes: memory.heapUsed,
      database_connected: database.connection.readyState === 1,
    });
  }, 60000);
  metrics.unref();

  const shutdown = async (reason, exitCode = 0) => {
    if (stopping) return;
    stopping = true;
    clearInterval(metrics);
    log.info('Backend shutdown started', { event: 'server.shutdown_started', reason });
    const deadline = setTimeout(() => {
      log.error('Backend shutdown timed out', { event: 'server.shutdown_timeout' });
      void flush(1000).catch(() => {}).finally(() => processHandle.exit(1));
    }, shutdownTimeoutMs);
    deadline.unref();
    try {
      await new Promise((resolve, reject) => server.close((error) => {
        if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
        else resolve();
      }));
    } catch (error) {
      exitCode = 1;
      log.error('Backend shutdown failed', { event: 'server.shutdown_failed', ...describeError(error) });
    }
    try { await database.disconnect(); }
    catch (error) {
      exitCode = 1;
      log.error('Database shutdown failed', { event: 'database.shutdown_failed', ...describeError(error) });
    }
    if (!exitCode) log.info('Backend shutdown completed', { event: 'server.shutdown_completed' });
    try { await flush(3000); }
    catch { exitCode = 1; }
    finally {
      clearTimeout(deadline);
      dispose();
      processHandle.exit(exitCode);
    }
  };

  const onTerm = () => { void shutdown('SIGTERM'); };
  const onInt = () => { void shutdown('SIGINT'); };
  const onRejection = (error) => {
    log.error('Unhandled promise rejection', { event: 'process.unhandled_rejection', ...describeError(error) });
    void shutdown('unhandled_rejection', 1);
  };
  const onException = (error) => {
    log.error('Uncaught exception', { event: 'process.uncaught_exception', ...describeError(error) });
    void shutdown('uncaught_exception', 1);
  };
  const onServerError = (error) => {
    log.error('HTTP server failed', { event: 'server.error', ...describeError(error) });
    void shutdown('server_error', 1);
  };
  const onDisconnected = () => {
    if (!stopping) log.warn('MongoDB disconnected', { event: 'database.disconnected' });
  };
  const onReconnected = () => log.info('MongoDB reconnected', { event: 'database.reconnected' });
  const onDatabaseError = (error) => log.error('MongoDB operation failed', { event: 'database.error', ...describeError(error) });
  const handlers = [
    [processHandle, 'SIGTERM', onTerm], [processHandle, 'SIGINT', onInt],
    [processHandle, 'unhandledRejection', onRejection], [processHandle, 'uncaughtException', onException],
    [server, 'error', onServerError],
    [database.connection, 'disconnected', onDisconnected],
    [database.connection, 'reconnected', onReconnected], [database.connection, 'error', onDatabaseError],
  ];
  for (const [emitter, event, handler] of handlers) emitter.on(event, handler);
  const dispose = () => {
    clearInterval(metrics);
    for (const [emitter, event, handler] of handlers) emitter.removeListener(event, handler);
  };
  return { shutdown, dispose };
};

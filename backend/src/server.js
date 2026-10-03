import 'dotenv/config';
import connectMongoDB from './config/db.js';
import logger, { flushLogs } from './config/logger.js';
import { describeError } from './utils/logSanitization.js';
import { installServerLifecycle } from './utils/serverLifecycle.js';

const PORT = process.env.PORT || 5001;

try {
  // Import configuration inside the startup boundary so validation failures
  // receive safe logs and pending logs can be flushed before exiting.
  const { default: app } = await import('./app.js');
  await connectMongoDB();
  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info('Backend listening', { event: 'server.started', port: Number(PORT) });
  });
  installServerLifecycle(server);
} catch (error) {
  logger.error('Backend startup failed', { event: 'server.startup_failed', ...describeError(error) });
  await flushLogs(3000);
  process.exit(1);
}

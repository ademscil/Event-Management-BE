const http = require('http');
const https = require('https');
const app = require('./src/app');
const config = require('./src/config');
const logger = require('./src/config/logger');
const db = require('./src/database/connection');
const { getTLSConfig } = require('./src/config/security');
const { handleUnhandledRejection, handleUncaughtException } = require('./src/middleware/errorHandler');
const scheduledOperationsProcessor = require('./src/services/scheduledOperationsProcessor');

/**
 * Create HTTP or HTTPS server based on configuration
 */
function createServer() {
  if (config.https.enabled) {
    logger.info('Creating HTTPS server...');
    const tlsConfig = getTLSConfig();
    return https.createServer(tlsConfig, app);
  } else {
    logger.info('Creating HTTP server...');
    return http.createServer(app);
  }
}

/**
 * Delay helper
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let scheduledProcessorStarted = false;

async function verifyDatabaseWithRetry() {
  const retryEnabled = config.startup?.dbRetryEnabled !== false;
  const retryIntervalMs = config.startup?.dbRetryIntervalMs || 5000;
  const maxAttempts = Number(config.startup?.dbRetryMaxAttempts || 0);
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      await db.getPool();
      logger.info('Database connection verified');
      return;
    } catch (error) {
      logger.error('Database verification failed on startup', {
        attempt,
        retryEnabled,
        maxAttempts,
        message: error.message,
      });

      if (!retryEnabled || (maxAttempts > 0 && attempt >= maxAttempts)) {
        throw error;
      }

      logger.warn(`Retrying database connection in ${retryIntervalMs}ms...`);
      await wait(retryIntervalMs);
    }
  }
}

function ensureScheduledProcessorStarted() {
  if (scheduledProcessorStarted) {
    return;
  }

  scheduledOperationsProcessor.start();
  scheduledProcessorStarted = true;
  logger.info('Scheduled operations processor initialized');

  scheduledOperationsProcessor.triggerProcessing().catch((error) => {
    logger.error('Initial scheduled operations trigger failed:', error);
  });
}

/**
 * Start server
 */
async function startServer() {
  try {
    const server = createServer();

    server.listen(config.port, async () => {
      const protocol = config.https.enabled ? 'https' : 'http';
      logger.info(`CSI Portal API server running on port ${config.port}`);
      logger.info(`Environment: ${config.env}`);
      logger.info(`Protocol: ${protocol.toUpperCase()}`);
      logger.info(`Base URL: ${config.baseUrl}`);
      logger.info(`Admin Panel: ${protocol}://localhost:${config.port}/admin/login`);
      logger.info(`API Endpoint: ${protocol}://localhost:${config.port}/api/v1`);

      try {
        await verifyDatabaseWithRetry();
        ensureScheduledProcessorStarted();
      } catch (error) {
        logger.error('Server started without active database connectivity', {
          message: error.message,
        });

        if (config.env !== 'development') {
          process.exit(1);
        }
      }
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${config.port} is already in use`);
      } else if (error.code === 'EACCES') {
        logger.error(`Port ${config.port} requires elevated privileges`);
      } else {
        logger.error('Server error:', error);
      }
      process.exit(1);
    });

    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', handleUnhandledRejection);

// Handle uncaught exceptions
process.on('uncaughtException', handleUncaughtException);

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  scheduledOperationsProcessor.stop();
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  scheduledOperationsProcessor.stop();
  await db.close();
  process.exit(0);
});

// Start the server
startServer();

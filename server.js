const http = require('http');
const https = require('https');
const app = require('./src/app');
const config = require('./src/config');
const logger = require('./src/config/logger');
const db = require('./src/database/connection');
const { getTLSConfig } = require('./src/config/security');
const { handleUnhandledRejection, handleUncaughtException } = require('./src/middleware/errorHandler');

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
 * Start server
 */
async function startServer() {
  try {
    // Test database connection
    await db.getPool();
    logger.info('Database connection verified');

    // Create server (HTTP or HTTPS)
    const server = createServer();

    // Start listening
    server.listen(config.port, () => {
      const protocol = config.https.enabled ? 'https' : 'http';
      logger.info(`CSI Portal API server running on port ${config.port}`);
      logger.info(`Environment: ${config.env}`);
      logger.info(`Protocol: ${protocol.toUpperCase()}`);
      logger.info(`Base URL: ${config.baseUrl}`);
      logger.info(`Admin Panel: ${protocol}://localhost:${config.port}/admin/login`);
      logger.info(`API Endpoint: ${protocol}://localhost:${config.port}/api/v1`);
    });

    // Handle server errors
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
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await db.close();
  process.exit(0);
});

// Start the server
startServer();

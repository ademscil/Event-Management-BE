const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('./index');

// Ensure logs directory exists
const logsDir = path.dirname(config.logging.file);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Custom log format
 */
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(({ timestamp, level, message, service, ...metadata }) => {
    let msg = `${timestamp} [${level.toUpperCase()}] [${service}]: ${message}`;
    
    // Add metadata if present
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    
    return msg;
  })
);

/**
 * Winston logger configuration
 */
const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { 
    service: 'csi-portal',
    environment: config.env,
    hostname: require('os').hostname()
  },
  transports: [
    // Write all logs to file
    new winston.transports.File({ 
      filename: path.join(config.logging.file),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Write errors to separate file
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
      tailable: true
    }),
    
    // Write warnings to separate file
    new winston.transports.File({ 
      filename: path.join(logsDir, 'warn.log'), 
      level: 'warn',
      maxsize: 5242880,
      maxFiles: 5,
      tailable: true
    })
  ],
  
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'exceptions.log'),
      maxsize: 5242880,
      maxFiles: 3
    })
  ],
  
  rejectionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'rejections.log'),
      maxsize: 5242880,
      maxFiles: 3
    })
  ]
});

// If not in production, also log to console with colors
if (config.env !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      customFormat
    )
  }));
}

/**
 * Create child logger with additional context
 * @param {Object} metadata - Additional metadata
 * @returns {winston.Logger}
 */
logger.child = function(metadata) {
  return winston.createLogger({
    level: this.level,
    format: this.format,
    defaultMeta: { ...this.defaultMeta, ...metadata },
    transports: this.transports
  });
};

/**
 * Log performance metrics
 * @param {string} operation - Operation name
 * @param {number} duration - Duration in milliseconds
 * @param {Object} metadata - Additional metadata
 */
logger.performance = function(operation, duration, metadata = {}) {
  this.info(`Performance: ${operation}`, {
    operation,
    duration: `${duration}ms`,
    ...metadata
  });
};

/**
 * Log database query
 * @param {string} query - SQL query
 * @param {number} duration - Duration in milliseconds
 * @param {Object} params - Query parameters
 */
logger.query = function(query, duration, params = {}) {
  if (config.logging.level === 'debug') {
    this.debug('Database query', {
      query: query.substring(0, 200), // Limit query length
      duration: `${duration}ms`,
      params: Object.keys(params).length > 0 ? params : undefined
    });
  }
};

/**
 * Log security event
 * @param {string} event - Security event type
 * @param {Object} details - Event details
 */
logger.security = function(event, details = {}) {
  this.warn(`Security: ${event}`, {
    securityEvent: event,
    ...details
  });
};

/**
 * Log audit event
 * @param {string} action - Action performed
 * @param {Object} details - Action details
 */
logger.audit = function(action, details = {}) {
  this.info(`Audit: ${action}`, {
    auditAction: action,
    ...details
  });
};

/**
 * Stream for Morgan HTTP logger
 */
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

module.exports = logger;

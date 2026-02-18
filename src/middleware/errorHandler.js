const logger = require('../config/logger');
const config = require('../config');

/**
 * Custom error classes for different error types
 */

class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, errors = []) {
    super(message, 400);
    this.errors = errors;
    this.name = 'ValidationError';
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', originalError = null) {
    super(message, 500, false);
    this.originalError = originalError;
    this.name = 'DatabaseError';
  }
}

class ExternalServiceError extends AppError {
  constructor(message = 'External service error', service = 'unknown') {
    super(message, 503, false);
    this.service = service;
    this.name = 'ExternalServiceError';
  }
}

/**
 * Map common error types to HTTP status codes
 * @param {Error} error - Error object
 * @returns {number} HTTP status code
 */
function getStatusCode(error) {
  // If error already has a status code, use it
  if (error.statusCode) {
    return error.statusCode;
  }

  // Map error types to status codes
  if (error.name === 'ValidationError') {
    return 400;
  }

  if (error.name === 'UnauthorizedError' || error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    return 401;
  }

  if (error.name === 'ForbiddenError') {
    return 403;
  }

  if (error.name === 'NotFoundError') {
    return 404;
  }

  if (error.name === 'ConflictError') {
    return 409;
  }

  // SQL Server errors
  if (error.code === 'EREQUEST' || error.code === 'ECONNREFUSED') {
    return 503;
  }

  // Default to 500 for unknown errors
  return 500;
}

/**
 * Determine if error should be logged as error or warning
 * @param {number} statusCode - HTTP status code
 * @returns {boolean} True if should log as error
 */
function shouldLogAsError(statusCode) {
  // 4xx errors are client errors (warnings)
  // 5xx errors are server errors (errors)
  return statusCode >= 500;
}

/**
 * Format error response based on environment
 * @param {Error} error - Error object
 * @param {number} statusCode - HTTP status code
 * @returns {Object} Formatted error response
 */
function formatErrorResponse(error, statusCode) {
  const isDevelopment = config.env !== 'production';

  // Base error response
  const response = {
    error: {
      message: error.message || 'An error occurred',
      type: error.name || 'Error',
      statusCode: statusCode
    }
  };

  // Add validation errors if present
  if (error.errors && Array.isArray(error.errors)) {
    response.error.validationErrors = error.errors;
  }

  // Add additional details in development
  if (isDevelopment) {
    response.error.stack = error.stack;
    
    if (error.originalError) {
      response.error.originalError = {
        message: error.originalError.message,
        code: error.originalError.code
      };
    }

    if (error.service) {
      response.error.service = error.service;
    }
  }

  // In production, sanitize error messages for 5xx errors
  if (!isDevelopment && statusCode >= 500) {
    response.error.message = 'Internal server error';
    delete response.error.stack;
  }

  return response;
}

/**
 * Global error handling middleware
 * This should be the last middleware in the chain
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function errorHandler(err, req, res, next) {
  // Determine status code
  const statusCode = getStatusCode(err);

  // Log error
  const logLevel = shouldLogAsError(statusCode) ? 'error' : 'warn';
  logger[logLevel]('Request error:', {
    error: err.message,
    name: err.name,
    statusCode: statusCode,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?.userId,
    username: req.user?.username,
    stack: err.stack
  });

  // Format error response
  const response = formatErrorResponse(err, statusCode);

  // Send response
  res.status(statusCode).json(response);
}

/**
 * Async error wrapper to catch errors in async route handlers
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Wrapped function
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Handle 404 errors (route not found)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      message: 'Route not found',
      type: 'NotFoundError',
      statusCode: 404,
      path: req.path,
      method: req.method
    }
  });
}

/**
 * Handle unhandled promise rejections
 * @param {Error} error - Error object
 */
function handleUnhandledRejection(error) {
  logger.error('Unhandled promise rejection:', {
    error: error.message,
    stack: error.stack
  });

  // In production, you might want to gracefully shutdown
  if (config.env === 'production') {
    logger.error('Shutting down due to unhandled rejection');
    process.exit(1);
  }
}

/**
 * Handle uncaught exceptions
 * @param {Error} error - Error object
 */
function handleUncaughtException(error) {
  logger.error('Uncaught exception:', {
    error: error.message,
    stack: error.stack
  });

  // Always exit on uncaught exception
  logger.error('Shutting down due to uncaught exception');
  process.exit(1);
}

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  ExternalServiceError,
  
  // Middleware
  errorHandler,
  asyncHandler,
  notFoundHandler,
  
  // Process error handlers
  handleUnhandledRejection,
  handleUncaughtException
};

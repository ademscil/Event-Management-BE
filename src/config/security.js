const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const config = require('./index');
const logger = require('./logger');

/**
 * Security configuration module
 * Configures TLS/HTTPS, CORS, rate limiting, and CSRF protection
 */

/**
 * Configure CORS
 * @returns {Function} CORS middleware
 */
function configureCORS() {
  const corsOptions = {
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }

      const allowedOrigins = config.security.corsOrigin === '*' 
        ? [origin] 
        : config.security.corsOrigin.split(',').map(o => o.trim());

      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn('CORS blocked request from origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'X-Requested-With'
    ],
    exposedHeaders: ['X-CSRF-Token'],
    maxAge: 86400 // 24 hours
  };

  return cors(corsOptions);
}

/**
 * Configure Helmet security headers
 * @returns {Function} Helmet middleware
 */
function configureHelmet() {
  return helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://fonts.bunny.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.bunny.net"],
        fontSrc: ["'self'", "https://fonts.bunny.net"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: config.isProduction() ? [] : null
      }
    },
    
    // HTTP Strict Transport Security (HSTS)
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    
    // X-Frame-Options
    frameguard: {
      action: 'deny'
    },
    
    // X-Content-Type-Options
    noSniff: true,
    
    // X-XSS-Protection
    xssFilter: true,
    
    // Referrer-Policy
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin'
    },
    
    // Hide X-Powered-By header
    hidePoweredBy: true
  });
}

/**
 * Configure rate limiting
 * @returns {Function} Rate limit middleware
 */
function configureRateLimit() {
  return rateLimit({
    windowMs: config.security.rateLimitWindowMs,
    max: config.security.rateLimitMaxRequests,
    message: {
      error: 'Too Many Requests',
      message: 'Too many requests from this IP, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method
      });
      
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Too many requests from this IP, please try again later'
      });
    },
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path === '/api/v1/health';
    }
  });
}

/**
 * Configure strict rate limiting for authentication endpoints
 * @returns {Function} Rate limit middleware
 */
function configureAuthRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: {
      error: 'Too Many Login Attempts',
      message: 'Too many login attempts, please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful logins
    handler: (req, res) => {
      logger.warn('Auth rate limit exceeded', {
        ip: req.ip,
        username: req.body?.username
      });
      
      res.status(429).json({
        error: 'Too Many Login Attempts',
        message: 'Too many login attempts, please try again after 15 minutes'
      });
    }
  });
}

/**
 * Get TLS/HTTPS configuration
 * @returns {Object|null} TLS options or null if HTTPS disabled
 */
function getTLSConfig() {
  if (!config.https.enabled) {
    return null;
  }

  const fs = require('fs');
  const path = require('path');

  try {
    // Read certificate files
    const key = fs.readFileSync(path.resolve(config.https.keyPath), 'utf8');
    const cert = fs.readFileSync(path.resolve(config.https.certPath), 'utf8');

    logger.info('TLS/HTTPS configuration loaded');

    return {
      key,
      cert,
      // TLS 1.2 minimum
      minVersion: 'TLSv1.2',
      // Cipher suites (strong ciphers only)
      ciphers: [
        'ECDHE-ECDSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-ECDSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-ECDSA-CHACHA20-POLY1305',
        'ECDHE-RSA-CHACHA20-POLY1305',
        'DHE-RSA-AES128-GCM-SHA256',
        'DHE-RSA-AES256-GCM-SHA384'
      ].join(':'),
      // Prefer server cipher order
      honorCipherOrder: true
    };
  } catch (error) {
    logger.error('Failed to load TLS certificates:', error);
    throw new Error('TLS configuration failed: ' + error.message);
  }
}

/**
 * Validate security configuration
 */
function validateSecurityConfig() {
  const warnings = [];
  const errors = [];

  // Check production security settings
  if (config.isProduction()) {
    if (!config.https.enabled) {
      warnings.push('HTTPS is disabled in production environment');
    }

    if (config.security.corsOrigin === '*') {
      warnings.push('CORS is set to allow all origins in production');
    }

    if (config.jwt.secret && config.jwt.secret.length < 32) {
      errors.push('JWT secret must be at least 32 characters in production');
    }

    if (config.security.rateLimitMaxRequests > 200) {
      warnings.push('Rate limit is set very high for production');
    }
  }

  // Log warnings
  warnings.forEach(warning => {
    logger.warn('Security configuration warning:', warning);
  });

  // Throw errors
  if (errors.length > 0) {
    throw new Error('Security configuration errors:\n' + errors.join('\n'));
  }

  logger.info('Security configuration validated');
}

/**
 * Apply security middleware to Express app
 * @param {Express} app - Express application
 */
function applySecurityMiddleware(app) {
  logger.info('Applying security middleware...');

  // Validate configuration
  validateSecurityConfig();

  // Trust proxy (for rate limiting and IP detection behind load balancer)
  if (config.isProduction()) {
    app.set('trust proxy', 1);
  }

  // Helmet security headers
  app.use(configureHelmet());

  // CORS
  app.use(configureCORS());

  // Rate limiting (global)
  app.use(configureRateLimit());

  logger.info('Security middleware applied successfully');
}

module.exports = {
  configureCORS,
  configureHelmet,
  configureRateLimit,
  configureAuthRateLimit,
  getTLSConfig,
  validateSecurityConfig,
  applySecurityMiddleware
};

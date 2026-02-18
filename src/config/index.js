const path = require('path');
const fs = require('fs');

/**
 * Load environment-specific configuration
 * Priority: .env.{NODE_ENV} > .env > defaults
 */
function loadEnvironmentConfig() {
  const env = process.env.NODE_ENV || 'development';
  const envFiles = [
    path.resolve(process.cwd(), `.env.${env}`),
    path.resolve(process.cwd(), '.env')
  ];

  // Load environment files in order
  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      require('dotenv').config({ path: envFile });
      console.log(`Loaded configuration from: ${envFile}`);
      break;
    }
  }
}

// Load environment configuration
loadEnvironmentConfig();

/**
 * Application configuration module
 * Loads and validates environment variables
 */
const config = {
  // Server Configuration
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',

  // Database Configuration
  database: {
    server: process.env.DB_SERVER,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT, 10) || 1433,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
      enableArithAbort: true,
      connectionTimeout: 30000,
      requestTimeout: 30000
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  },

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET,
    expiration: process.env.JWT_EXPIRATION || '8h',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d'
  },

  // LDAP Configuration
  ldap: {
    url: process.env.LDAP_URL,
    baseDN: process.env.LDAP_BASE_DN,
    bindDN: process.env.LDAP_BIND_DN,
    bindPassword: process.env.LDAP_BIND_PASSWORD
  },

  // Email Configuration
  email: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    },
    from: process.env.SMTP_FROM
  },

  // SAP Integration
  sap: {
    apiUrl: process.env.SAP_API_URL,
    apiKey: process.env.SAP_API_KEY,
    syncSchedule: process.env.SAP_SYNC_SCHEDULE || '0 2 * * *'
  },

  // Session Configuration
  session: {
    timeoutMinutes: parseInt(process.env.SESSION_TIMEOUT_MINUTES, 10) || 30,
    maxDurationHours: parseInt(process.env.SESSION_MAX_DURATION_HOURS, 10) || 8
  },

  // Security Configuration
  security: {
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    corsOrigin: process.env.CORS_ORIGIN || '*'
  },

  // TLS/HTTPS Configuration
  https: {
    enabled: process.env.HTTPS_ENABLED === 'true',
    keyPath: process.env.HTTPS_KEY_PATH,
    certPath: process.env.HTTPS_CERT_PATH
  },

  // File Upload Configuration
  upload: {
    directory: process.env.UPLOAD_DIR || 'public/uploads',
    maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log'
  }
};

/**
 * Validate required configuration
 */
function validateConfig() {
  const errors = [];
  
  // Required fields
  const required = {
    'database.server': config.database.server,
    'database.user': config.database.user,
    'database.password': config.database.password,
    'database.database': config.database.database,
    'jwt.secret': config.jwt.secret
  };

  // Check required fields
  for (const [key, value] of Object.entries(required)) {
    if (!value || value === '') {
      errors.push(`Missing required configuration: ${key}`);
    }
  }

  // Validate JWT secret strength in production
  if (config.env === 'production' && config.jwt.secret && config.jwt.secret.length < 32) {
    errors.push('JWT secret must be at least 32 characters in production');
  }

  // Validate port range
  if (config.port < 1 || config.port > 65535) {
    errors.push(`Invalid port number: ${config.port}`);
  }

  // Validate session configuration
  if (config.session.timeoutMinutes < 1 || config.session.timeoutMinutes > 1440) {
    errors.push('Session timeout must be between 1 and 1440 minutes');
  }

  if (config.session.maxDurationHours < 1 || config.session.maxDurationHours > 24) {
    errors.push('Session max duration must be between 1 and 24 hours');
  }

  // Validate HTTPS configuration in production
  if (config.env === 'production' && !config.https.enabled) {
    console.warn('WARNING: HTTPS is disabled in production environment');
  }

  if (config.https.enabled) {
    if (!config.https.keyPath || !config.https.certPath) {
      errors.push('HTTPS key and certificate paths are required when HTTPS is enabled');
    }
  }

  // Validate file upload configuration
  if (config.upload.maxFileSizeMB < 1 || config.upload.maxFileSizeMB > 100) {
    errors.push('Max file size must be between 1 and 100 MB');
  }

  // Throw error if validation fails
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Get configuration value by path
 * @param {string} path - Dot-separated path (e.g., 'database.server')
 * @returns {*} Configuration value
 */
function get(path) {
  const keys = path.split('.');
  let value = config;
  
  for (const key of keys) {
    value = value[key];
    if (value === undefined) {
      return undefined;
    }
  }
  
  return value;
}

/**
 * Check if running in production
 * @returns {boolean}
 */
function isProduction() {
  return config.env === 'production';
}

/**
 * Check if running in development
 * @returns {boolean}
 */
function isDevelopment() {
  return config.env === 'development';
}

/**
 * Check if running in staging
 * @returns {boolean}
 */
function isStaging() {
  return config.env === 'staging';
}

// Validate on load
try {
  validateConfig();
  console.log(`Configuration loaded successfully for environment: ${config.env}`);
} catch (error) {
  console.error('Configuration validation failed:', error.message);
  process.exit(1);
}

module.exports = config;
module.exports.get = get;
module.exports.isProduction = isProduction;
module.exports.isDevelopment = isDevelopment;
module.exports.isStaging = isStaging;
module.exports.validate = validateConfig;

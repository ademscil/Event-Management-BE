const logger = require('../config/logger');

/**
 * CSRF Token Management
 * Simple token-based CSRF protection without cookies
 * Tokens are generated and validated via headers
 */

const crypto = require('crypto');

// Store for CSRF tokens (in production, use Redis or database)
const csrfTokenStore = new Map();

// Token expiration time (1 hour)
const TOKEN_EXPIRATION = 60 * 60 * 1000;

/**
 * Generate CSRF token
 * @returns {string} CSRF token
 */
function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Middleware to generate and send CSRF token
 * Use this on GET requests that render forms
 */
function csrfTokenGenerator(req, res, next) {
  // Generate token
  const token = generateCsrfToken();
  const expiresAt = Date.now() + TOKEN_EXPIRATION;
  
  // Store token with expiration
  csrfTokenStore.set(token, {
    userId: req.user?.userId || 'anonymous',
    expiresAt: expiresAt,
    ip: req.ip
  });
  
  // Clean up expired tokens periodically
  if (Math.random() < 0.01) { // 1% chance to trigger cleanup
    cleanupExpiredTokens();
  }
  
  // Send token in response header
  res.setHeader('X-CSRF-Token', token);
  
  next();
}

/**
 * Middleware to validate CSRF token
 * Use this on state-changing requests (POST, PUT, PATCH, DELETE)
 */
function csrfProtection(req, res, next) {
  // Skip CSRF for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  // Get token from header
  const token = req.headers['x-csrf-token'] || req.headers['X-CSRF-Token'];
  
  if (!token) {
    logger.warn('CSRF token missing', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    
    return res.status(403).json({
      error: 'CSRF token missing',
      message: 'CSRF token is required for this operation'
    });
  }
  
  // Validate token
  const tokenData = csrfTokenStore.get(token);
  
  if (!tokenData) {
    logger.warn('Invalid CSRF token', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    
    return res.status(403).json({
      error: 'Invalid CSRF token',
      message: 'CSRF token is invalid or expired'
    });
  }
  
  // Check expiration
  if (Date.now() > tokenData.expiresAt) {
    csrfTokenStore.delete(token);
    
    logger.warn('Expired CSRF token', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    
    return res.status(403).json({
      error: 'Expired CSRF token',
      message: 'CSRF token has expired, please refresh and try again'
    });
  }
  
  // Validate IP (optional, can be disabled for mobile apps)
  if (tokenData.ip !== req.ip) {
    logger.warn('CSRF token IP mismatch', {
      tokenIp: tokenData.ip,
      requestIp: req.ip,
      path: req.path,
      method: req.method
    });
    
    // Don't fail on IP mismatch, just log it
    // Some users may have dynamic IPs
  }
  
  // Token is valid, remove it (one-time use)
  csrfTokenStore.delete(token);
  
  next();
}

/**
 * Clean up expired tokens
 */
function cleanupExpiredTokens() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [token, data] of csrfTokenStore.entries()) {
    if (now > data.expiresAt) {
      csrfTokenStore.delete(token);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    logger.debug(`Cleaned up ${cleaned} expired CSRF tokens`);
  }
}

/**
 * SQL Injection Prevention
 * Middleware to detect and block potential SQL injection attempts
 */
function sqlInjectionProtection(req, res, next) {
  // High-confidence SQL injection patterns.
  // Keep this strict enough for attacks but avoid blocking normal free-text input.
  const sqlPatterns = [
    /('|"|`)\s*(or|and)\s+('|"|`)?\d+\s*=\s*('|"|`)?\d+/i,
    /\bunion\s+all?\s+select\b/i,
    /\b(select|insert|update|delete|drop|create|alter|exec|execute)\b[\s\S]{0,40}\b(from|into|set|table)\b/i,
    /(--|\/\*|\*\/)/,
    /\b(waitfor\s+delay|xp_cmdshell|sp_executesql)\b/i
  ];
  
  // Check all input sources
  const inputs = [
    ...Object.values(req.body || {}),
    ...Object.values(req.query || {}),
    ...Object.values(req.params || {})
  ];
  
  for (const input of inputs) {
    if (typeof input === 'string') {
      for (const pattern of sqlPatterns) {
        if (pattern.test(input)) {
          logger.warn('Potential SQL injection attempt detected', {
            ip: req.ip,
            path: req.path,
            method: req.method,
            input: input.substring(0, 100) // Log first 100 chars
          });
          
          return res.status(400).json({
            error: 'Invalid input',
            message: 'Input contains potentially dangerous SQL patterns'
          });
        }
      }
    }
  }
  
  next();
}

/**
 * XSS Protection
 * Middleware to sanitize input and prevent XSS attacks
 */
function xssProtection(req, res, next) {
  // XSS patterns
  const xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // Event handlers like onclick=
    /<embed/gi,
    /<object/gi
  ];
  
  // Sanitize function
  function sanitize(obj) {
    if (typeof obj === 'string') {
      let sanitized = obj;
      
      for (const pattern of xssPatterns) {
        if (pattern.test(sanitized)) {
          logger.warn('Potential XSS attempt detected', {
            ip: req.ip,
            path: req.path,
            method: req.method,
            input: sanitized.substring(0, 100)
          });
          
          // Remove dangerous content
          sanitized = sanitized.replace(pattern, '');
        }
      }
      
      return sanitized;
    } else if (Array.isArray(obj)) {
      return obj.map(sanitize);
    } else if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitize(value);
      }
      return sanitized;
    }
    
    return obj;
  }
  
  // Sanitize all inputs
  if (req.body) {
    req.body = sanitize(req.body);
  }
  if (req.query) {
    req.query = sanitize(req.query);
  }
  if (req.params) {
    req.params = sanitize(req.params);
  }
  
  next();
}

/**
 * Content Type Validation
 * Ensure requests have appropriate content types
 */
function contentTypeValidation(req, res, next) {
  // Only validate POST, PUT, PATCH requests
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
    return next();
  }
  
  const contentType = req.headers['content-type'];
  
  // Allow JSON and form data
  const allowedTypes = [
    'application/json',
    'application/x-www-form-urlencoded',
    'multipart/form-data'
  ];
  
  if (!contentType || !allowedTypes.some(type => contentType.includes(type))) {
    logger.warn('Invalid content type', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      contentType: contentType
    });
    
    return res.status(415).json({
      error: 'Unsupported Media Type',
      message: 'Content-Type must be application/json or multipart/form-data'
    });
  }
  
  next();
}

/**
 * Request Size Limit Validation
 * Additional validation beyond body-parser limits
 */
function requestSizeValidation(maxSize = 10 * 1024 * 1024) { // 10MB default
  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    
    if (contentLength > maxSize) {
      logger.warn('Request size exceeds limit', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        contentLength: contentLength,
        maxSize: maxSize
      });
      
      return res.status(413).json({
        error: 'Payload Too Large',
        message: `Request size exceeds maximum allowed size of ${maxSize / 1024 / 1024}MB`
      });
    }
    
    next();
  };
}

/**
 * IP Whitelist/Blacklist
 * Restrict access based on IP addresses
 */
function ipFilter(options = {}) {
  const { whitelist = [], blacklist = [] } = options;
  
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    
    // Check blacklist first
    if (blacklist.length > 0 && blacklist.includes(ip)) {
      logger.warn('Blocked IP address', {
        ip: ip,
        path: req.path,
        method: req.method
      });
      
      return res.status(403).json({
        error: 'Access Denied',
        message: 'Your IP address has been blocked'
      });
    }
    
    // Check whitelist if configured
    if (whitelist.length > 0 && !whitelist.includes(ip)) {
      logger.warn('IP not in whitelist', {
        ip: ip,
        path: req.path,
        method: req.method
      });
      
      return res.status(403).json({
        error: 'Access Denied',
        message: 'Your IP address is not authorized'
      });
    }
    
    next();
  };
}

/**
 * Security Headers Middleware
 * Add additional security headers
 */
function securityHeaders(req, res, next) {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS filter
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
}

/**
 * Sanitize file uploads
 * Validate file types and prevent malicious uploads
 */
function fileUploadSecurity(allowedTypes = []) {
  return (req, res, next) => {
    if (!req.files || Object.keys(req.files).length === 0) {
      return next();
    }
    
    // Check each uploaded file
    for (const [fieldName, file] of Object.entries(req.files)) {
      const fileArray = Array.isArray(file) ? file : [file];
      
      for (const uploadedFile of fileArray) {
        // Check file type
        if (allowedTypes.length > 0) {
          const mimeType = uploadedFile.mimetype;
          
          if (!allowedTypes.includes(mimeType)) {
            logger.warn('Invalid file type uploaded', {
              ip: req.ip,
              fieldName: fieldName,
              mimeType: mimeType,
              allowedTypes: allowedTypes
            });
            
            return res.status(400).json({
              error: 'Invalid file type',
              message: `File type ${mimeType} is not allowed`
            });
          }
        }
        
        // Check for executable extensions
        const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.php', '.asp', '.jsp'];
        const fileName = uploadedFile.name.toLowerCase();
        
        if (dangerousExtensions.some(ext => fileName.endsWith(ext))) {
          logger.warn('Dangerous file extension detected', {
            ip: req.ip,
            fileName: fileName
          });
          
          return res.status(400).json({
            error: 'Invalid file',
            message: 'Executable files are not allowed'
          });
        }
      }
    }
    
    next();
  };
}

module.exports = {
  // CSRF Protection
  csrfTokenGenerator,
  csrfProtection,
  
  // Input Validation
  sqlInjectionProtection,
  xssProtection,
  contentTypeValidation,
  requestSizeValidation,
  
  // Access Control
  ipFilter,
  
  // Headers
  securityHeaders,
  
  // File Upload
  fileUploadSecurity
};

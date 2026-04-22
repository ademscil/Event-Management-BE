/**
 * Audit Helper Functions
 * Utilities for extracting audit context from requests
 */

/**
 * Extract audit context from Express request
 * @param {Object} req - Express request object
 * @returns {Object} Audit context with userId, username, ipAddress, userAgent
 */
function getAuditContext(req) {
  return {
    userId: req.user?.userId || null,
    username: String(req.user?.username || req.user?.displayName || req.body?.username || '').trim() || 'system',
    ipAddress: getIpAddress(req),
    userAgent: getUserAgent(req)
  };
}

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'currentpassword',
  'newpassword',
  'confirmpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'secret'
]);

function sanitizeAuditPayload(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeAuditPayload);
  }

  if (typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, nestedValue]) => {
      const normalizedKey = String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
      acc[key] = SENSITIVE_KEYS.has(normalizedKey)
        ? '[REDACTED]'
        : sanitizeAuditPayload(nestedValue);
      return acc;
    }, {});
  }

  return value;
}

/**
 * Extract IP address from request
 * @param {Object} req - Express request object
 * @returns {string} IP address
 */
function getIpAddress(req) {
  return req.ip || 
         req.headers['x-forwarded-for']?.split(',')[0] || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress ||
         'unknown';
}

/**
 * Extract user agent from request
 * @param {Object} req - Express request object
 * @returns {string} User agent
 */
function getUserAgent(req) {
  return req.headers['user-agent'] || 'unknown';
}

/**
 * Extract user info from request
 * @param {Object} req - Express request object
 * @returns {Object} User info with userId and username
 */
function getUserInfo(req) {
  return {
    userId: req.user?.userId || null,
    username: String(req.user?.username || req.user?.displayName || req.body?.username || '').trim() || 'system'
  };
}

module.exports = {
  getAuditContext,
  getIpAddress,
  getUserAgent,
  getUserInfo,
  sanitizeAuditPayload
};

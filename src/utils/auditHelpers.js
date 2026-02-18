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
    username: req.user?.username || 'anonymous',
    ipAddress: getIpAddress(req),
    userAgent: getUserAgent(req)
  };
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
    username: req.user?.username || 'anonymous'
  };
}

module.exports = {
  getAuditContext,
  getIpAddress,
  getUserAgent,
  getUserInfo
};

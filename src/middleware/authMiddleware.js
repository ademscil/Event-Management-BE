const authService = require('../services/authService');
const logger = require('../config/logger');

/**
 * Role definitions
 */
const ROLES = {
  SUPER_ADMIN: 'SuperAdmin',
  ADMIN_EVENT: 'AdminEvent',
  IT_LEAD: 'ITLead',
  DEPARTMENT_HEAD: 'DepartmentHead'
};

/**
 * Permission matrix defining what each role can access
 */
const PERMISSIONS = {
  // User Management
  'users:read': [ROLES.SUPER_ADMIN],
  'users:create': [ROLES.SUPER_ADMIN],
  'users:update': [ROLES.SUPER_ADMIN],
  'users:delete': [ROLES.SUPER_ADMIN],

  // Master Data Management
  'master-data:read': [ROLES.ADMIN_EVENT, ROLES.SUPER_ADMIN],
  'master-data:create': [ROLES.ADMIN_EVENT],
  'master-data:update': [ROLES.ADMIN_EVENT],
  'master-data:delete': [ROLES.ADMIN_EVENT],

  // Mapping Management
  'mappings:read': [ROLES.ADMIN_EVENT, ROLES.SUPER_ADMIN],
  'mappings:create': [ROLES.ADMIN_EVENT],
  'mappings:update': [ROLES.ADMIN_EVENT],
  'mappings:delete': [ROLES.ADMIN_EVENT],

  // Survey Management
  'surveys:read': [ROLES.ADMIN_EVENT, ROLES.SUPER_ADMIN, ROLES.IT_LEAD, ROLES.DEPARTMENT_HEAD],
  'surveys:create': [ROLES.ADMIN_EVENT, ROLES.SUPER_ADMIN],
  'surveys:update': [ROLES.ADMIN_EVENT, ROLES.SUPER_ADMIN],
  'surveys:delete': [ROLES.ADMIN_EVENT, ROLES.SUPER_ADMIN],
  'surveys:activate': [ROLES.ADMIN_EVENT],

  // Response Management
  'responses:read': [ROLES.ADMIN_EVENT, ROLES.IT_LEAD, ROLES.DEPARTMENT_HEAD],
  'responses:propose-takeout': [ROLES.ADMIN_EVENT],

  // Approval Management
  'approvals:read': [ROLES.ADMIN_EVENT, ROLES.IT_LEAD],
  'approvals:approve': [ROLES.IT_LEAD],
  'approvals:reject': [ROLES.IT_LEAD],

  // Best Comments
  'best-comments:read': [ROLES.ADMIN_EVENT, ROLES.IT_LEAD, ROLES.DEPARTMENT_HEAD],
  'best-comments:create': [ROLES.ADMIN_EVENT],
  'best-comments:delete': [ROLES.ADMIN_EVENT],
  'best-comments:feedback': [ROLES.IT_LEAD],

  // Reports
  'reports:read': [ROLES.ADMIN_EVENT, ROLES.SUPER_ADMIN, ROLES.IT_LEAD, ROLES.DEPARTMENT_HEAD],
  'reports:export': [ROLES.ADMIN_EVENT, ROLES.SUPER_ADMIN, ROLES.IT_LEAD, ROLES.DEPARTMENT_HEAD],

  // Email Operations
  'emails:send': [ROLES.ADMIN_EVENT],

  // Audit Logs
  'audit:read': [ROLES.SUPER_ADMIN],

  // SAP Integration
  'sap:sync': [ROLES.ADMIN_EVENT, ROLES.SUPER_ADMIN]
};

/**
 * Extract token from Authorization header
 * @param {Object} req - Express request object
 * @returns {string|null}
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return null;
  }

  // Support both "Bearer <token>" and just "<token>"
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return authHeader;
}

/**
 * Middleware to require authentication
 * Validates JWT token and attaches user info to request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
async function requireAuth(req, res, next) {
  try {
    // Extract token from header
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No authentication token provided'
      });
    }

    // Validate token
    const validation = await authService.validateToken(token);

    if (!validation.isValid) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: validation.errorMessage || 'Invalid or expired token'
      });
    }

    // Attach user info to request
    req.user = validation.user;
    req.token = token;

    // Log authenticated request
    logger.debug(`Authenticated request from user: ${req.user.username} (${req.user.role})`);

    next();

  } catch (error) {
    logger.error('Authentication middleware error:', error);
    return res.status(500).json({
      error: 'Authentication error',
      message: 'An error occurred during authentication'
    });
  }
}

/**
 * Middleware to require specific role(s)
 * Must be used after requireAuth middleware
 * @param {...string} allowedRoles - Roles that are allowed to access the route
 * @returns {Function} Express middleware function
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated'
      });
    }

    // Check if user has one of the allowed roles
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Access denied for user ${req.user.username} (${req.user.role}) - Required roles: ${allowedRoles.join(', ')}`);
      
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this resource'
      });
    }

    next();
  };
}

/**
 * Middleware to require specific permission
 * Must be used after requireAuth middleware
 * @param {string} permission - Permission required (e.g., 'surveys:create')
 * @returns {Function} Express middleware function
 */
function requirePermission(permission) {
  return (req, res, next) => {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated'
      });
    }

    // Check if permission exists
    if (!PERMISSIONS[permission]) {
      logger.error(`Unknown permission: ${permission}`);
      return res.status(500).json({
        error: 'Configuration error',
        message: 'Invalid permission configuration'
      });
    }

    // Check if user's role has the permission
    const allowedRoles = PERMISSIONS[permission];
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Access denied for user ${req.user.username} (${req.user.role}) - Required permission: ${permission}`);
      
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to perform this action'
      });
    }

    next();
  };
}

/**
 * Check if user has permission (utility function)
 * @param {string} role - User's role
 * @param {string} permission - Permission to check
 * @returns {boolean}
 */
function hasPermission(role, permission) {
  if (!PERMISSIONS[permission]) {
    return false;
  }

  return PERMISSIONS[permission].includes(role);
}

/**
 * Middleware to check if user is Super Admin
 * Must be used after requireAuth middleware
 */
const requireSuperAdmin = requireRole(ROLES.SUPER_ADMIN);

/**
 * Middleware to check if user is Admin Event
 * Must be used after requireAuth middleware
 */
const requireAdminEvent = requireRole(ROLES.ADMIN_EVENT);

/**
 * Middleware to check if user is IT Lead
 * Must be used after requireAuth middleware
 */
const requireITLead = requireRole(ROLES.IT_LEAD);

/**
 * Middleware to check if user is Department Head
 * Must be used after requireAuth middleware
 */
const requireDepartmentHead = requireRole(ROLES.DEPARTMENT_HEAD);

/**
 * Middleware to check if user is Admin Event or Super Admin
 * Must be used after requireAuth middleware
 */
const requireAdminOrSuperAdmin = requireRole(ROLES.ADMIN_EVENT, ROLES.SUPER_ADMIN);

/**
 * Optional authentication middleware
 * Validates token if present but doesn't require it
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
async function optionalAuth(req, res, next) {
  try {
    const token = extractToken(req);

    if (token) {
      const validation = await authService.validateToken(token);

      if (validation.isValid) {
        req.user = validation.user;
        req.token = token;
      }
    }

    next();

  } catch (error) {
    logger.error('Optional authentication middleware error:', error);
    next();
  }
}

module.exports = {
  requireAuth,
  requireRole,
  requirePermission,
  requireSuperAdmin,
  requireAdminEvent,
  requireITLead,
  requireDepartmentHead,
  requireAdminOrSuperAdmin,
  optionalAuth,
  hasPermission,
  ROLES,
  PERMISSIONS
};

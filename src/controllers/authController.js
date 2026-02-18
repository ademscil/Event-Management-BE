const { body, validationResult } = require('express-validator');
const authService = require('../services/authService');
const logger = require('../config/logger');

/**
 * Validation rules for login
 */
const loginValidation = [
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 3, max: 50 }).withMessage('Username must be between 3 and 50 characters'),
  body('password')
    .notEmpty().withMessage('Password is required')
];

/**
 * Validation rules for token refresh
 */
const refreshValidation = [
  body('refreshToken')
    .notEmpty().withMessage('Refresh token is required')
];

/**
 * Login controller
 * POST /api/auth/login
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function login(req, res) {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { username, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent');

    // Attempt login
    const result = await authService.login(username, password, ipAddress, userAgent);

    if (!result.success) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: result.errorMessage
      });
    }

    // Return success response
    res.json({
      success: true,
      token: result.token,
      refreshToken: result.refreshToken,
      user: {
        userId: result.user.userId,
        username: result.user.username,
        displayName: result.user.displayName,
        email: result.user.email,
        role: result.user.role
      }
    });

  } catch (error) {
    logger.error('Login controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred during login'
    });
  }
}

/**
 * Logout controller
 * POST /api/auth/logout
 * Requires authentication
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function logout(req, res) {
  try {
    const token = req.token;

    if (!token) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'No token provided'
      });
    }

    // Revoke token
    const success = await authService.logout(token);

    if (!success) {
      return res.status(500).json({
        error: 'Logout failed',
        message: 'Failed to invalidate session'
      });
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    logger.error('Logout controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred during logout'
    });
  }
}

/**
 * Validate token controller
 * GET /api/auth/validate
 * Requires authentication
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function validate(req, res) {
  try {
    // If we reach here, token is valid (requireAuth middleware passed)
    res.json({
      valid: true,
      user: {
        userId: req.user.userId,
        username: req.user.username,
        displayName: req.user.displayName,
        email: req.user.email,
        role: req.user.role
      }
    });

  } catch (error) {
    logger.error('Validate controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred during validation'
    });
  }
}

/**
 * Refresh token controller
 * POST /api/auth/refresh
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function refresh(req, res) {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { refreshToken } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent');

    // Refresh token
    const result = await authService.refreshToken(refreshToken, ipAddress, userAgent);

    if (!result.success) {
      return res.status(401).json({
        error: 'Token refresh failed',
        message: result.errorMessage
      });
    }

    // Return success response
    res.json({
      success: true,
      token: result.token,
      refreshToken: result.refreshToken,
      user: {
        userId: result.user.userId,
        username: result.user.username,
        displayName: result.user.displayName,
        email: result.user.email,
        role: result.user.role
      }
    });

  } catch (error) {
    logger.error('Refresh controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred during token refresh'
    });
  }
}

/**
 * Get current user info controller
 * GET /api/auth/me
 * Requires authentication
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getCurrentUser(req, res) {
  try {
    res.json({
      user: {
        userId: req.user.userId,
        username: req.user.username,
        displayName: req.user.displayName,
        email: req.user.email,
        role: req.user.role
      }
    });

  } catch (error) {
    logger.error('Get current user controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching user info'
    });
  }
}

module.exports = {
  login,
  logout,
  validate,
  refresh,
  getCurrentUser,
  loginValidation,
  refreshValidation
};

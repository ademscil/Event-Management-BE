const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');
const { auditAuthMiddleware, auditLogoutMiddleware } = require('../middleware/auditLogger');

/**
 * Authentication Routes
 * Base path: /api/auth
 */

/**
 * @route   POST /api/auth/login
 * @desc    Login with username and password
 * @access  Public
 */
router.post('/login', auditAuthMiddleware, authController.loginValidation, authController.login);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout and invalidate session
 * @access  Private
 */
router.post('/logout', requireAuth, auditLogoutMiddleware, authController.logout);

/**
 * @route   GET /api/auth/validate
 * @desc    Validate current token
 * @access  Private
 */
router.get('/validate', requireAuth, authController.validate);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public
 */
router.post('/refresh', authController.refreshValidation, authController.refresh);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user information
 * @access  Private
 */
router.get('/me', requireAuth, authController.getCurrentUser);

module.exports = router;

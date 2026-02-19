const { body, param, query, validationResult } = require('express-validator');
const userService = require('../services/userService');
const logger = require('../config/logger');
const ExcelJS = require('exceljs');

/**
 * Validation rules for creating a user
 */
const createUserValidation = [
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 3, max: 50 }).withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores'),
  body('displayName')
    .trim()
    .notEmpty().withMessage('Display name is required')
    .isLength({ min: 1, max: 200 }).withMessage('Display name must be between 1 and 200 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format'),
  body('role')
    .notEmpty().withMessage('Role is required')
    .isIn(['SuperAdmin', 'AdminEvent', 'ITLead', 'DepartmentHead']).withMessage('Invalid role'),
  body('useLDAP')
    .optional()
    .isBoolean().withMessage('useLDAP must be a boolean'),
  body('password')
    .optional()
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('npk')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 }).withMessage('NPK must be between 1 and 50 characters'),
  body('businessUnitId')
    .optional()
    .isUUID().withMessage('Business Unit ID must be a valid UUID'),
  body('divisionId')
    .optional()
    .isUUID().withMessage('Division ID must be a valid UUID'),
  body('departmentId')
    .optional()
    .isUUID().withMessage('Department ID must be a valid UUID'),
  body('functionIds')
    .optional()
    .isArray().withMessage('Function IDs must be an array')
];

/**
 * Validation rules for updating a user
 */
const updateUserValidation = [
  param('id').isUUID().withMessage('User ID must be a valid UUID'),
  body('displayName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 }).withMessage('Display name must be between 1 and 200 characters'),
  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Invalid email format'),
  body('role')
    .optional()
    .isIn(['SuperAdmin', 'AdminEvent', 'ITLead', 'DepartmentHead']).withMessage('Invalid role'),
  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive must be a boolean'),
  body('npk')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 }).withMessage('NPK must be between 1 and 50 characters'),
  body('businessUnitId')
    .optional()
    .isUUID().withMessage('Business Unit ID must be a valid UUID'),
  body('divisionId')
    .optional()
    .isUUID().withMessage('Division ID must be a valid UUID'),
  body('departmentId')
    .optional()
    .isUUID().withMessage('Department ID must be a valid UUID'),
  body('functionIds')
    .optional()
    .isArray().withMessage('Function IDs must be an array')
];

/**
 * Validation rules for toggling LDAP
 */
const toggleLDAPValidation = [
  param('id').isUUID().withMessage('User ID must be a valid UUID'),
  body('useLDAP')
    .isBoolean().withMessage('useLDAP must be a boolean')
];

/**
 * Validation rules for setting password
 */
const setPasswordValidation = [
  param('id').isUUID().withMessage('User ID must be a valid UUID'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
];

/**
 * Create a new user
 * POST /api/v1/users
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createUser(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userData = req.body;
    const result = await userService.createUser(userData);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: result
    });

  } catch (error) {
    logger.error('Create user controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while creating user'
    });
  }
}

/**
 * Get all users
 * GET /api/v1/users
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getUsers(req, res) {
  try {
    const { role, isActive, search, includeInactive, departmentId } = req.query;
    
    const filter = {};
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) filter.search = search;
    if (includeInactive !== undefined) filter.includeInactive = includeInactive === 'true';
    if (departmentId) filter.departmentId = departmentId;

    const users = await userService.getUsers(filter);

    res.json({
      success: true,
      users
    });

  } catch (error) {
    logger.error('Get users controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching users'
    });
  }
}

/**
 * Get user by ID
 * GET /api/v1/users/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getUserById(req, res) {
  try {
    const userId = req.params.id;
    const user = await userService.getUserById(userId);

    if (!user) {
      return res.status(404).json({
        error: 'Not found',
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    logger.error('Get user by ID controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching user'
    });
  }
}

/**
 * Update user
 * PUT /api/v1/users/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function updateUser(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.params.id;
    const updates = req.body;

    const result = await userService.updateUser(userId, updates);

    res.json({
      success: true,
      message: 'User updated successfully',
      user: result
    });

  } catch (error) {
    logger.error('Update user controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while updating user'
    });
  }
}

/**
 * Deactivate user (soft delete)
 * DELETE /api/v1/users/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function deactivateUser(req, res) {
  try {
    const userId = req.params.id;
    const result = await userService.deactivateUser(userId);

    res.json({
      success: true,
      message: 'User deactivated successfully',
      user: result
    });

  } catch (error) {
    logger.error('Deactivate user controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while deactivating user'
    });
  }
}

/**
 * Toggle user LDAP authentication
 * PATCH /api/v1/users/:id/ldap
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function toggleUserLDAP(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.params.id;
    const { useLDAP } = req.body;

    const result = await userService.toggleUserLDAP(userId, useLDAP);

    res.json({
      success: true,
      message: 'LDAP setting updated successfully',
      user: result
    });

  } catch (error) {
    logger.error('Toggle LDAP controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while toggling LDAP'
    });
  }
}

/**
 * Set user password (for non-LDAP users)
 * PATCH /api/v1/users/:id/password
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function setUserPassword(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.params.id;
    const { password } = req.body;

    await userService.setUserPassword(userId, password);

    res.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    logger.error('Set password controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while setting password'
    });
  }
}

async function downloadUserTemplate(req, res) {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('MasterUserTemplate');

    worksheet.columns = [
      { header: 'Username', key: 'username', width: 20 },
      { header: 'DisplayName', key: 'displayName', width: 28 },
      { header: 'Email', key: 'email', width: 32 },
      { header: 'Role', key: 'role', width: 18 },
      { header: 'IsActive', key: 'isActive', width: 12 },
      { header: 'UseLDAP', key: 'useLdap', width: 12 },
      { header: 'Password', key: 'password', width: 20 }
    ];

    worksheet.addRow({
      username: '2091',
      displayName: 'Firman',
      email: 'firman@company.co.id',
      role: 'AdminEvent',
      isActive: 'true',
      useLdap: 'false',
      password: 'admin123'
    });

    worksheet.getRow(1).font = { bold: true };

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="master-user-template.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('Download user template controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while generating template'
    });
  }
}

module.exports = {
  createUser,
  getUsers,
  downloadUserTemplate,
  getUserById,
  updateUser,
  deactivateUser,
  toggleUserLDAP,
  setUserPassword,
  createUserValidation,
  updateUserValidation,
  toggleLDAPValidation,
  setPasswordValidation
};

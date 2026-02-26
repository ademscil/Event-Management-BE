const { body, param, validationResult } = require('express-validator');
const functionService = require('../services/functionService');
const logger = require('../config/logger');

/**
 * Validation rules for creating a function
 */
const createFunctionValidation = [
  body('code')
    .trim()
    .notEmpty().withMessage('Code is required')
    .isLength({ min: 2, max: 20 }).withMessage('Code must be between 2 and 20 characters')
    .matches(/^[a-zA-Z0-9-]+$/).withMessage('Code can only contain letters, numbers, and hyphens'),
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 1, max: 200 }).withMessage('Name must be between 1 and 200 characters')
];

/**
 * Validation rules for updating a function
 */
const updateFunctionValidation = [
  param('id').isUUID().withMessage('Function ID must be a valid UUID'),
  body('code')
    .optional()
    .trim()
    .isLength({ min: 2, max: 20 }).withMessage('Code must be between 2 and 20 characters')
    .matches(/^[a-zA-Z0-9-]+$/).withMessage('Code can only contain letters, numbers, and hyphens'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 }).withMessage('Name must be between 1 and 200 characters'),
  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive must be boolean')
];

/**
 * Create a new function
 * POST /api/v1/functions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createFunction(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { code, name } = req.body;
    const result = await functionService.createFunction({ code, name });

    if (!result.success) {
      return res.status(400).json({
        error: 'Function creation failed',
        message: result.errorMessage
      });
    }

    res.status(201).json({
      success: true,
      message: 'Function created successfully',
      function: result.function
    });

  } catch (error) {
    logger.error('Create function controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while creating function'
    });
  }
}

/**
 * Get all functions
 * GET /api/v1/functions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getFunctions(req, res) {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const functions = await functionService.getFunctions({ includeInactive });

    res.json({
      success: true,
      functions
    });

  } catch (error) {
    logger.error('Get functions controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching functions'
    });
  }
}

/**
 * Get function by ID
 * GET /api/v1/functions/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getFunctionById(req, res) {
  try {
    const functionId = req.params.id;
    const func = await functionService.getFunctionById(functionId);

    if (!func) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Function not found'
      });
    }

    res.json({
      success: true,
      function: func
    });

  } catch (error) {
    logger.error('Get function by ID controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching function'
    });
  }
}

/**
 * Update function
 * PUT /api/v1/functions/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function updateFunction(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const functionId = req.params.id;
    const updates = req.body;

    const result = await functionService.updateFunction(functionId, updates);

    if (!result.success) {
      return res.status(400).json({
        error: 'Function update failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Function updated successfully',
      function: result.function
    });

  } catch (error) {
    logger.error('Update function controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while updating function'
    });
  }
}

/**
 * Delete function
 * DELETE /api/v1/functions/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function deleteFunction(req, res) {
  try {
    const functionId = req.params.id;
    const result = await functionService.deleteFunction(functionId);

    if (!result.success) {
      return res.status(400).json({
        error: 'Function deletion failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Function deleted successfully'
    });

  } catch (error) {
    logger.error('Delete function controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while deleting function'
    });
  }
}

module.exports = {
  createFunction,
  getFunctions,
  getFunctionById,
  updateFunction,
  deleteFunction,
  createFunctionValidation,
  updateFunctionValidation
};

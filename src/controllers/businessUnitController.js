const { body, param, validationResult } = require('express-validator');
const businessUnitService = require('../services/businessUnitService');
const logger = require('../config/logger');

/**
 * Validation rules for creating a business unit
 */
const createBusinessUnitValidation = [
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
 * Validation rules for updating a business unit
 */
const updateBusinessUnitValidation = [
  param('id').isUUID().withMessage('Business Unit ID must be a valid UUID'),
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
 * Create a new business unit
 * POST /api/v1/business-units
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createBusinessUnit(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { code, name } = req.body;
    const result = await businessUnitService.createBusinessUnit({ code, name });

    if (!result.success) {
      return res.status(400).json({
        error: 'Business unit creation failed',
        message: result.errorMessage
      });
    }

    res.status(201).json({
      success: true,
      message: 'Business unit created successfully',
      businessUnit: result.businessUnit
    });

  } catch (error) {
    logger.error('Create business unit controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while creating business unit'
    });
  }
}

/**
 * Get all business units
 * GET /api/v1/business-units
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getBusinessUnits(req, res) {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const businessUnits = await businessUnitService.getBusinessUnits({ includeInactive });

    res.json({
      success: true,
      businessUnits
    });

  } catch (error) {
    logger.error('Get business units controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching business units'
    });
  }
}

/**
 * Get business unit by ID
 * GET /api/v1/business-units/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getBusinessUnitById(req, res) {
  try {
    const buId = req.params.id;
    const businessUnit = await businessUnitService.getBusinessUnitById(buId);

    if (!businessUnit) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Business unit not found'
      });
    }

    res.json({
      success: true,
      businessUnit
    });

  } catch (error) {
    logger.error('Get business unit by ID controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching business unit'
    });
  }
}

/**
 * Update business unit
 * PUT /api/v1/business-units/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function updateBusinessUnit(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const buId = req.params.id;
    const updates = req.body;

    const result = await businessUnitService.updateBusinessUnit(buId, updates);

    if (!result.success) {
      return res.status(400).json({
        error: 'Business unit update failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Business unit updated successfully',
      businessUnit: result.businessUnit
    });

  } catch (error) {
    logger.error('Update business unit controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while updating business unit'
    });
  }
}

/**
 * Delete business unit
 * DELETE /api/v1/business-units/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function deleteBusinessUnit(req, res) {
  try {
    const buId = req.params.id;
    const result = await businessUnitService.deleteBusinessUnit(buId);

    if (!result.success) {
      return res.status(400).json({
        error: 'Business unit deletion failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Business unit deleted successfully'
    });

  } catch (error) {
    logger.error('Delete business unit controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while deleting business unit'
    });
  }
}

module.exports = {
  createBusinessUnit,
  getBusinessUnits,
  getBusinessUnitById,
  updateBusinessUnit,
  deleteBusinessUnit,
  createBusinessUnitValidation,
  updateBusinessUnitValidation
};


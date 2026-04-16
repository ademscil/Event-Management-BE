const { body, param, query, validationResult } = require('express-validator');
const divisionService = require('../services/divisionService');
const logger = require('../config/logger');

function handleServiceError(res, error, fallbackMessage) {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    logger.error(fallbackMessage, error);
    return res.status(500).json({
      error: 'Internal server error',
      message: fallbackMessage
    });
  }

  return res.status(statusCode).json({
    error: error.name || 'Request failed',
    message: error.message
  });
}

/**
 * Validation rules for creating a division
 */
const createDivisionValidation = [
  body('code')
    .trim()
    .notEmpty().withMessage('Code is required')
    .isLength({ min: 2, max: 20 }).withMessage('Code must be between 2 and 20 characters')
    .matches(/^[a-zA-Z0-9-]+$/).withMessage('Code can only contain letters, numbers, and hyphens'),
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 1, max: 200 }).withMessage('Name must be between 1 and 200 characters'),
  body('businessUnitId')
    .notEmpty().withMessage('Business Unit ID is required')
    .isUUID().withMessage('Business Unit ID must be a valid UUID')
];

/**
 * Validation rules for updating a division
 */
const updateDivisionValidation = [
  param('id').isUUID().withMessage('Division ID must be a valid UUID'),
  body('code')
    .optional()
    .trim()
    .isLength({ min: 2, max: 20 }).withMessage('Code must be between 2 and 20 characters')
    .matches(/^[a-zA-Z0-9-]+$/).withMessage('Code can only contain letters, numbers, and hyphens'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 }).withMessage('Name must be between 1 and 200 characters'),
  body('businessUnitId')
    .optional()
    .isUUID().withMessage('Business Unit ID must be a valid UUID'),
  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive must be boolean')
];

/**
 * Create a new division
 * POST /api/v1/divisions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createDivision(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const divisionData = req.body;
    const division = await divisionService.createDivision(divisionData);

    res.status(201).json({
      success: true,
      message: 'Division created successfully',
      division
    });

  } catch (error) {
    return handleServiceError(res, error, 'An error occurred while creating division');
  }
}

/**
 * Get all divisions or divisions by business unit
 * GET /api/v1/divisions?businessUnitId=1
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getDivisions(req, res) {
  try {
    const { businessUnitId } = req.query;
    const includeInactive = req.query.includeInactive === 'true';

    let divisions;
    if (businessUnitId) {
      divisions = await divisionService.getDivisionsByBusinessUnit(businessUnitId, { includeInactive });
    } else {
      divisions = await divisionService.getDivisions({ includeInactive });
    }

    res.json({
      success: true,
      divisions
    });

  } catch (error) {
    logger.error('Get divisions controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching divisions'
    });
  }
}

/**
 * Get division by ID
 * GET /api/v1/divisions/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getDivisionById(req, res) {
  try {
    const divisionId = req.params.id;
    const division = await divisionService.getDivisionById(divisionId);

    if (!division) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Division not found'
      });
    }

    res.json({
      success: true,
      division
    });

  } catch (error) {
    logger.error('Get division by ID controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching division'
    });
  }
}

/**
 * Update division
 * PUT /api/v1/divisions/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function updateDivision(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const divisionId = req.params.id;
    const updates = req.body;

    const division = await divisionService.updateDivision(divisionId, updates);

    res.json({
      success: true,
      message: 'Division updated successfully',
      division
    });

  } catch (error) {
    return handleServiceError(res, error, 'An error occurred while updating division');
  }
}

/**
 * Delete division
 * DELETE /api/v1/divisions/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function deleteDivision(req, res) {
  try {
    const divisionId = req.params.id;
    await divisionService.deleteDivision(divisionId);

    res.json({
      success: true,
      message: 'Division deleted successfully'
    });

  } catch (error) {
    return handleServiceError(res, error, 'An error occurred while deleting division');
  }
}

module.exports = {
  createDivision,
  getDivisions,
  getDivisionById,
  updateDivision,
  deleteDivision,
  createDivisionValidation,
  updateDivisionValidation
};


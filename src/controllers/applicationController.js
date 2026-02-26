const { body, param, validationResult } = require('express-validator');
const applicationService = require('../services/applicationService');
const logger = require('../config/logger');

/**
 * Validation rules for creating an application
 */
const createApplicationValidation = [
  body('code')
    .trim()
    .notEmpty().withMessage('Code is required')
    .isLength({ min: 2, max: 20 }).withMessage('Code must be between 2 and 20 characters')
    .matches(/^[a-zA-Z0-9-]+$/).withMessage('Code can only contain letters, numbers, and hyphens'),
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 1, max: 200 }).withMessage('Name must be between 1 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must not exceed 500 characters'),
  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive must be boolean')
];

/**
 * Validation rules for updating an application
 */
const updateApplicationValidation = [
  param('id').isUUID().withMessage('Application ID must be a valid UUID'),
  body('code')
    .optional()
    .trim()
    .isLength({ min: 2, max: 20 }).withMessage('Code must be between 2 and 20 characters')
    .matches(/^[a-zA-Z0-9-]+$/).withMessage('Code can only contain letters, numbers, and hyphens'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 }).withMessage('Name must be between 1 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must not exceed 500 characters')
];

/**
 * Create a new application
 * POST /api/v1/applications
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createApplication(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const applicationData = req.body;
    const result = await applicationService.createApplication(applicationData);

    if (!result.success) {
      return res.status(400).json({
        error: 'Application creation failed',
        message: result.errorMessage
      });
    }

    res.status(201).json({
      success: true,
      message: 'Application created successfully',
      application: result.application
    });

  } catch (error) {
    logger.error('Create application controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while creating application'
    });
  }
}

/**
 * Get all applications
 * GET /api/v1/applications
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getApplications(req, res) {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const applications = await applicationService.getApplications({ includeInactive });

    res.json({
      success: true,
      applications
    });

  } catch (error) {
    logger.error('Get applications controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching applications'
    });
  }
}

/**
 * Get application by ID
 * GET /api/v1/applications/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getApplicationById(req, res) {
  try {
    const applicationId = req.params.id;
    const application = await applicationService.getApplicationById(applicationId);

    if (!application) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Application not found'
      });
    }

    res.json({
      success: true,
      application
    });

  } catch (error) {
    logger.error('Get application by ID controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching application'
    });
  }
}

/**
 * Update application
 * PUT /api/v1/applications/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function updateApplication(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const applicationId = req.params.id;
    const updates = req.body;

    const result = await applicationService.updateApplication(applicationId, updates);

    if (!result.success) {
      return res.status(400).json({
        error: 'Application update failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Application updated successfully',
      application: result.application
    });

  } catch (error) {
    logger.error('Update application controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while updating application'
    });
  }
}

/**
 * Delete application
 * DELETE /api/v1/applications/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function deleteApplication(req, res) {
  try {
    const applicationId = req.params.id;
    const result = await applicationService.deleteApplication(applicationId);

    if (!result.success) {
      return res.status(400).json({
        error: 'Application deletion failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Application deleted successfully'
    });

  } catch (error) {
    logger.error('Delete application controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while deleting application'
    });
  }
}

module.exports = {
  createApplication,
  getApplications,
  getApplicationById,
  updateApplication,
  deleteApplication,
  createApplicationValidation,
  updateApplicationValidation
};

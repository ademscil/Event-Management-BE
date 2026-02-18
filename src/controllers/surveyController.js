const { body, param, query, validationResult } = require('express-validator');
const surveyService = require('../services/surveyService');
const logger = require('../config/logger');
const multer = require('multer');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

/**
 * Validation rules for creating a survey
 */
const createSurveyValidation = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 1, max: 200 }).withMessage('Title must be between 1 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Description must not exceed 1000 characters'),
  body('startDate')
    .notEmpty().withMessage('Start date is required')
    .isISO8601().withMessage('Invalid start date format'),
  body('endDate')
    .notEmpty().withMessage('End date is required')
    .isISO8601().withMessage('Invalid end date format'),
  body('status')
    .optional()
    .isIn(['Draft', 'Active', 'Closed', 'Archived']).withMessage('Invalid status'),
  body('targetRespondents')
    .optional()
    .isInt({ min: 0 }).withMessage('Target respondents must be a positive integer'),
  body('targetScore')
    .optional()
    .isFloat({ min: 0, max: 10 }).withMessage('Target score must be between 0 and 10')
];

/**
 * Validation rules for updating a survey
 */
const updateSurveyValidation = [
  param('id').isUUID().withMessage('Survey ID must be a valid UUID'),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 }).withMessage('Title must be between 1 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Description must not exceed 1000 characters'),
  body('startDate')
    .optional()
    .isISO8601().withMessage('Invalid start date format'),
  body('endDate')
    .optional()
    .isISO8601().withMessage('Invalid end date format'),
  body('status')
    .optional()
    .isIn(['Draft', 'Active', 'Closed', 'Archived']).withMessage('Invalid status'),
  body('targetRespondents')
    .optional()
    .isInt({ min: 0 }).withMessage('Target respondents must be a positive integer'),
  body('targetScore')
    .optional()
    .isFloat({ min: 0, max: 10 }).withMessage('Target score must be between 0 and 10')
];

/**
 * Create a new survey
 * POST /api/v1/surveys
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createSurvey(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const surveyData = {
      ...req.body,
      createdBy: req.user?.userId
    };

    const result = await surveyService.createSurvey(surveyData);

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      survey: result
    });

  } catch (error) {
    logger.error('Create survey controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while creating survey'
    });
  }
}

/**
 * Get all surveys
 * GET /api/v1/surveys
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getSurveys(req, res) {
  try {
    const { status, assignedAdminId, search } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    if (assignedAdminId) filter.assignedAdminId = assignedAdminId;
    if (search) filter.search = search;

    const surveys = await surveyService.getSurveys(filter);

    res.json({
      success: true,
      surveys
    });

  } catch (error) {
    logger.error('Get surveys controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching surveys'
    });
  }
}

/**
 * Get survey by ID
 * GET /api/v1/surveys/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getSurveyById(req, res) {
  try {
    const surveyId = req.params.id;
    const survey = await surveyService.getSurveyById(surveyId);

    if (!survey) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Survey not found'
      });
    }

    res.json({
      success: true,
      survey
    });

  } catch (error) {
    logger.error('Get survey by ID controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching survey'
    });
  }
}

/**
 * Update survey
 * PUT /api/v1/surveys/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function updateSurvey(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const surveyId = req.params.id;
    const updates = req.body;

    const result = await surveyService.updateSurvey(surveyId, updates);

    res.json({
      success: true,
      message: 'Event updated successfully',
      survey: result
    });

  } catch (error) {
    logger.error('Update survey controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while updating survey'
    });
  }
}

/**
 * Delete survey
 * DELETE /api/v1/surveys/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function deleteSurvey(req, res) {
  try {
    const surveyId = req.params.id;
    const result = await surveyService.deleteSurvey(surveyId);

    if (!result) {
      return res.status(400).json({
        error: 'Event deletion failed',
        message: 'Event deletion failed'
      });
    }

    res.json({
      success: true,
      message: 'Event deleted successfully'
    });

  } catch (error) {
    logger.error('Delete survey controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while deleting survey'
    });
  }
}

/**
 * Update survey configuration
 * PATCH /api/v1/surveys/:id/config
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function updateSurveyConfig(req, res) {
  try {
    const surveyId = req.params.id;
    const config = req.body;

    const result = await surveyService.updateSurveyConfig(surveyId, config);

    res.json({
      success: true,
      message: 'Survey configuration updated successfully',
      config: result
    });

  } catch (error) {
    logger.error('Update survey config controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while updating configuration'
    });
  }
}

/**
 * Generate survey preview
 * GET /api/v1/surveys/:id/preview
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function generatePreview(req, res) {
  try {
    const surveyId = req.params.id;
    const preview = await surveyService.generatePreview(surveyId);

    if (!preview) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Survey not found'
      });
    }

    res.json({
      success: true,
      preview
    });

  } catch (error) {
    logger.error('Generate preview controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while generating preview'
    });
  }
}

/**
 * Generate survey link
 * POST /api/v1/surveys/:id/link
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function generateSurveyLink(req, res) {
  try {
    const surveyId = req.params.id;
    const { shortenUrl } = req.body;

    const result = await surveyService.generateSurveyLink(surveyId, shortenUrl);

    res.json({
      success: true,
      surveyLink: result.surveyLink,
      shortenedLink: result.shortenedLink
    });

  } catch (error) {
    logger.error('Generate survey link controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while generating link'
    });
  }
}

/**
 * Generate QR code
 * POST /api/v1/surveys/:id/qrcode
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function generateQRCode(req, res) {
  try {
    const surveyId = req.params.id;
    const result = await surveyService.generateQRCode(surveyId);

    res.json({
      success: true,
      qrCodeDataUrl: result
    });

  } catch (error) {
    logger.error('Generate QR code controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while generating QR code'
    });
  }
}

/**
 * Generate embed code
 * POST /api/v1/surveys/:id/embed
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function generateEmbedCode(req, res) {
  try {
    const surveyId = req.params.id;
    const result = await surveyService.generateEmbedCode(surveyId);

    res.json({
      success: true,
      embedCode: result
    });

  } catch (error) {
    logger.error('Generate embed code controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while generating embed code'
    });
  }
}

/**
 * Schedule blast
 * POST /api/v1/surveys/:id/schedule-blast
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function scheduleBlast(req, res) {
  try {
    const surveyId = req.params.id;
    const request = {
      ...req.body,
      surveyId,
      createdBy: req.user?.userId
    };

    const result = await surveyService.scheduleBlast(request);

    res.status(201).json({
      success: true,
      message: 'Blast scheduled successfully',
      operation: result
    });

  } catch (error) {
    logger.error('Schedule blast controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while scheduling blast'
    });
  }
}

/**
 * Schedule reminder
 * POST /api/v1/surveys/:id/schedule-reminder
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function scheduleReminder(req, res) {
  try {
    const surveyId = req.params.id;
    const request = {
      ...req.body,
      surveyId,
      createdBy: req.user?.userId
    };

    const result = await surveyService.scheduleReminder(request);

    res.status(201).json({
      success: true,
      message: 'Reminder scheduled successfully',
      operation: result
    });

  } catch (error) {
    logger.error('Schedule reminder controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while scheduling reminder'
    });
  }
}

/**
 * Get scheduled operations
 * GET /api/v1/surveys/:id/scheduled-operations
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getScheduledOperations(req, res) {
  try {
    const surveyId = req.params.id;
    const { type, status } = req.query;

    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;

    const operations = await surveyService.getScheduledOperations(surveyId, filter);

    res.json({
      success: true,
      operations
    });

  } catch (error) {
    logger.error('Get scheduled operations controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching scheduled operations'
    });
  }
}

/**
 * Cancel scheduled operation
 * DELETE /api/v1/surveys/scheduled-operations/:operationId
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function cancelScheduledOperation(req, res) {
  try {
    const operationId = req.params.operationId;
    const result = await surveyService.cancelScheduledOperation(operationId);

    res.json({
      success: true,
      message: 'Scheduled operation cancelled successfully',
      operation: result
    });

  } catch (error) {
    logger.error('Cancel scheduled operation controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while cancelling operation'
    });
  }
}

/**
 * Upload hero image
 * POST /api/v1/surveys/:id/upload/hero
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function uploadHeroImage(req, res) {
  try {
    const surveyId = req.params.id;
    
    if (!req.file) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Image file is required'
      });
    }

    const result = await surveyService.uploadHeroImage(surveyId, req.file);

    res.json({
      success: true,
      message: 'Hero image uploaded successfully',
      imageUrl: result.HeroImageUrl
    });

  } catch (error) {
    logger.error('Upload hero image controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while uploading image'
    });
  }
}

/**
 * Upload logo
 * POST /api/v1/surveys/:id/upload/logo
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function uploadLogo(req, res) {
  try {
    const surveyId = req.params.id;
    
    if (!req.file) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Image file is required'
      });
    }

    const result = await surveyService.uploadLogo(surveyId, req.file);

    res.json({
      success: true,
      message: 'Logo uploaded successfully',
      imageUrl: result.LogoUrl
    });

  } catch (error) {
    logger.error('Upload logo controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while uploading logo'
    });
  }
}

/**
 * Upload background image
 * POST /api/v1/surveys/:id/upload/background
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function uploadBackgroundImage(req, res) {
  try {
    const surveyId = req.params.id;
    
    if (!req.file) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Image file is required'
      });
    }

    const result = await surveyService.uploadBackgroundImage(surveyId, req.file);

    res.json({
      success: true,
      message: 'Background image uploaded successfully',
      imageUrl: result.BackgroundImageUrl
    });

  } catch (error) {
    logger.error('Upload background image controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while uploading background image'
    });
  }
}

module.exports = {
  createSurvey,
  getSurveys,
  getSurveyById,
  updateSurvey,
  deleteSurvey,
  updateSurveyConfig,
  generatePreview,
  generateSurveyLink,
  generateQRCode,
  generateEmbedCode,
  scheduleBlast,
  scheduleReminder,
  getScheduledOperations,
  cancelScheduledOperation,
  uploadHeroImage,
  uploadLogo,
  uploadBackgroundImage,
  createSurveyValidation,
  updateSurveyValidation,
  upload
};

const { body, param, query, validationResult } = require('express-validator');
const responseService = require('../services/responseService');
const logger = require('../config/logger');

/**
 * Validation rules for submitting a response
 */
const submitResponseValidation = [
  body('surveyId')
    .notEmpty().withMessage('Survey ID is required')
    .isUUID().withMessage('Survey ID must be a valid UUID'),
  body('respondent.email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format'),
  body('respondent.name')
    .notEmpty().withMessage('Name is required')
    .trim()
    .isLength({ min: 1, max: 200 }).withMessage('Name must be between 1 and 200 characters'),
  body('respondent.businessUnitId')
    .optional({ values: 'falsy' })
    .isUUID().withMessage('Business Unit ID must be a valid UUID'),
  body('respondent.divisionId')
    .optional({ values: 'falsy' })
    .isUUID().withMessage('Division ID must be a valid UUID'),
  body('respondent.departmentId')
    .optional({ values: 'falsy' })
    .isUUID().withMessage('Department ID must be a valid UUID'),
  body('selectedApplicationIds')
    .isArray().withMessage('Selected applications must be an array')
    .notEmpty().withMessage('At least one application must be selected')
    .custom((ids) => ids.every((id) => typeof id === 'string' && /^[0-9a-fA-F-]{36}$/.test(id)))
    .withMessage('Each selected application ID must be a valid UUID'),
  body('responses')
    .isArray().withMessage('Responses must be an array')
    .notEmpty().withMessage('At least one response is required')
];

/**
 * Get survey form
 * GET /api/v1/responses/survey/:surveyId/form
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getSurveyForm(req, res) {
  try {
    const surveyId = req.params.surveyId;
    const form = await responseService.getSurveyForm(surveyId);

    if (!form) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Survey not found or not active'
      });
    }

    res.json({
      success: true,
      form
    });

  } catch (error) {
    logger.error('Get survey form controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching survey form'
    });
  }
}

/**
 * Get available applications for a survey
 * GET /api/v1/responses/survey/:surveyId/applications?departmentId=1
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getAvailableApplications(req, res) {
  try {
    const surveyId = req.params.surveyId;
    const departmentId = req.query.departmentId;
    const functionId = req.query.functionId;

    const applications = await responseService.getAvailableApplications(surveyId, departmentId, functionId);

    res.json({
      success: true,
      applications
    });

  } catch (error) {
    logger.error('Get available applications controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching applications'
    });
  }
}

/**
 * Submit survey response
 * POST /api/v1/responses
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function submitResponse(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const responseData = {
      ...req.body,
      ipAddress: req.ip || req.connection.remoteAddress
    };

    const result = await responseService.submitResponse(responseData);

    if (!result.success) {
      return res.status(400).json({
        error: 'Response submission failed',
        message: result.errorMessage
      });
    }

    res.status(201).json({
      success: true,
      message: 'Response submitted successfully',
      responseId: result.responseId
    });

  } catch (error) {
    logger.error('Submit response controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while submitting response'
    });
  }
}

/**
 * Check for duplicate response
 * POST /api/v1/responses/check-duplicate
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function checkDuplicateResponse(req, res) {
  try {
    const { surveyId, email, applicationId, applicationIds } = req.body;
    const normalizedApplicationIds = Array.isArray(applicationIds)
      ? applicationIds.filter(Boolean)
      : (applicationId ? [applicationId] : []);

    if (!surveyId || !email || normalizedApplicationIds.length === 0) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Survey ID, email, and application ID are required'
      });
    }

    let duplicateFound = false;
    for (const appId of normalizedApplicationIds) {
      // eslint-disable-next-line no-await-in-loop
      const isDuplicate = await responseService.checkDuplicateResponse(surveyId, email, appId);
      if (isDuplicate) {
        duplicateFound = true;
        break;
      }
    }

    res.json({
      success: true,
      isDuplicate: duplicateFound,
      message: duplicateFound ? 'Duplicate response found for one or more applications' : 'No duplicate response'
    });

  } catch (error) {
    logger.error('Check duplicate response controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while checking for duplicates'
    });
  }
}

/**
 * Get responses with filters
 * GET /api/v1/responses
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getResponses(req, res) {
  try {
    const { surveyId, departmentId, applicationId, status, search } = req.query;

    const filter = {};
    if (surveyId) filter.surveyId = parseInt(surveyId);
    if (departmentId) filter.departmentId = parseInt(departmentId);
    if (applicationId) filter.applicationId = parseInt(applicationId);
    if (status) filter.status = status;
    if (search) filter.search = search;

    const responses = await responseService.getResponses(filter);

    res.json({
      success: true,
      responses
    });

  } catch (error) {
    logger.error('Get responses controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching responses'
    });
  }
}

/**
 * Get response by ID
 * GET /api/v1/responses/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getResponseById(req, res) {
  try {
    const responseId = parseInt(req.params.id);
    const response = await responseService.getResponseById(responseId);

    if (!response) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Response not found'
      });
    }

    res.json({
      success: true,
      response
    });

  } catch (error) {
    logger.error('Get response by ID controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching response'
    });
  }
}

/**
 * Get response statistics
 * GET /api/v1/responses/survey/:surveyId/statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getResponseStatistics(req, res) {
  try {
    const surveyId = req.params.surveyId;
    const statistics = await responseService.getResponseStatistics(surveyId);

    res.json({
      success: true,
      statistics
    });

  } catch (error) {
    logger.error('Get response statistics controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching statistics'
    });
  }
}

module.exports = {
  getSurveyForm,
  getAvailableApplications,
  submitResponse,
  checkDuplicateResponse,
  getResponses,
  getResponseById,
  getResponseStatistics,
  submitResponseValidation
};

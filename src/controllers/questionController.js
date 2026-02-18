const { body, param, validationResult } = require('express-validator');
const surveyService = require('../services/surveyService');
const logger = require('../config/logger');

/**
 * Validation rules for adding a question
 */
const addQuestionValidation = [
  body('type')
    .notEmpty().withMessage('Question type is required')
    .isIn(['HeroCover', 'Text', 'MultipleChoice', 'Checkbox', 'Dropdown', 'MatrixLikert', 'Rating', 'Date', 'Signature'])
    .withMessage('Invalid question type'),
  body('promptText')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Prompt text must not exceed 500 characters'),
  body('subtitle')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Subtitle must not exceed 200 characters'),
  body('isMandatory')
    .optional()
    .isBoolean().withMessage('isMandatory must be a boolean'),
  body('displayOrder')
    .optional()
    .isInt({ min: 0 }).withMessage('Display order must be a non-negative integer'),
  body('pageNumber')
    .optional()
    .isInt({ min: 1 }).withMessage('Page number must be a positive integer'),
  body('layoutOrientation')
    .optional()
    .isIn(['vertical', 'horizontal']).withMessage('Invalid layout orientation')
];

/**
 * Validation rules for updating a question
 */
const updateQuestionValidation = [
  param('id').isInt().withMessage('Question ID must be an integer'),
  body('type')
    .optional()
    .isIn(['HeroCover', 'Text', 'MultipleChoice', 'Checkbox', 'Dropdown', 'MatrixLikert', 'Rating', 'Date', 'Signature'])
    .withMessage('Invalid question type'),
  body('promptText')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Prompt text must not exceed 500 characters'),
  body('subtitle')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Subtitle must not exceed 200 characters'),
  body('isMandatory')
    .optional()
    .isBoolean().withMessage('isMandatory must be a boolean'),
  body('displayOrder')
    .optional()
    .isInt({ min: 0 }).withMessage('Display order must be a non-negative integer'),
  body('pageNumber')
    .optional()
    .isInt({ min: 1 }).withMessage('Page number must be a positive integer'),
  body('layoutOrientation')
    .optional()
    .isIn(['vertical', 'horizontal']).withMessage('Invalid layout orientation')
];

/**
 * Validation rules for reordering questions
 */
const reorderQuestionsValidation = [
  param('surveyId').isInt().withMessage('Survey ID must be an integer'),
  body('questionOrders')
    .isArray().withMessage('Question orders must be an array')
    .notEmpty().withMessage('Question orders cannot be empty')
];

/**
 * Add a question to a survey
 * POST /api/v1/surveys/:surveyId/questions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function addQuestion(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const surveyId = parseInt(req.params.surveyId);
    const questionData = req.body;

    const result = await surveyService.addQuestion(surveyId, questionData);

    if (!result.success) {
      return res.status(400).json({
        error: 'Question creation failed',
        message: result.errorMessage
      });
    }

    res.status(201).json({
      success: true,
      message: 'Question added successfully',
      question: result.question
    });

  } catch (error) {
    logger.error('Add question controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while adding question'
    });
  }
}

/**
 * Get questions by survey
 * GET /api/v1/surveys/:surveyId/questions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getQuestionsBySurvey(req, res) {
  try {
    const surveyId = parseInt(req.params.surveyId);
    const questions = await surveyService.getQuestionsBySurvey(surveyId);

    res.json({
      success: true,
      questions
    });

  } catch (error) {
    logger.error('Get questions by survey controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching questions'
    });
  }
}

/**
 * Update a question
 * PUT /api/v1/questions/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function updateQuestion(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const questionId = parseInt(req.params.id);
    const updates = req.body;

    const result = await surveyService.updateQuestion(questionId, updates);

    if (!result.success) {
      return res.status(400).json({
        error: 'Question update failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Question updated successfully',
      question: result.question
    });

  } catch (error) {
    logger.error('Update question controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while updating question'
    });
  }
}

/**
 * Delete a question
 * DELETE /api/v1/questions/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function deleteQuestion(req, res) {
  try {
    const questionId = parseInt(req.params.id);
    const result = await surveyService.deleteQuestion(questionId);

    if (!result.success) {
      return res.status(400).json({
        error: 'Question deletion failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Question deleted successfully'
    });

  } catch (error) {
    logger.error('Delete question controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while deleting question'
    });
  }
}

/**
 * Reorder questions in a survey
 * PUT /api/v1/surveys/:surveyId/questions/reorder
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function reorderQuestions(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const surveyId = parseInt(req.params.surveyId);
    const { questionOrders } = req.body;

    const result = await surveyService.reorderQuestions(surveyId, questionOrders);

    if (!result.success) {
      return res.status(400).json({
        error: 'Question reordering failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Questions reordered successfully'
    });

  } catch (error) {
    logger.error('Reorder questions controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while reordering questions'
    });
  }
}

/**
 * Upload question image
 * POST /api/v1/questions/:id/upload/image
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function uploadQuestionImage(req, res) {
  try {
    const questionId = parseInt(req.params.id);
    
    if (!req.file) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Image file is required'
      });
    }

    const result = await surveyService.uploadQuestionImage(questionId, req.file);

    if (!result.success) {
      return res.status(400).json({
        error: 'Image upload failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Question image uploaded successfully',
      imageUrl: result.imageUrl
    });

  } catch (error) {
    logger.error('Upload question image controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while uploading image'
    });
  }
}

/**
 * Upload option image
 * POST /api/v1/questions/:id/upload/option/:optionIndex
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function uploadOptionImage(req, res) {
  try {
    const questionId = parseInt(req.params.id);
    const optionIndex = parseInt(req.params.optionIndex);
    
    if (!req.file) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Image file is required'
      });
    }

    const result = await surveyService.uploadOptionImage(questionId, optionIndex, req.file);

    if (!result.success) {
      return res.status(400).json({
        error: 'Image upload failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Option image uploaded successfully',
      imageUrl: result.imageUrl
    });

  } catch (error) {
    logger.error('Upload option image controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while uploading option image'
    });
  }
}

module.exports = {
  addQuestion,
  getQuestionsBySurvey,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  uploadQuestionImage,
  uploadOptionImage,
  addQuestionValidation,
  updateQuestionValidation,
  reorderQuestionsValidation
};

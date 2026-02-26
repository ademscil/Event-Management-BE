const { body, param, validationResult } = require('express-validator');
const surveyService = require('../services/surveyService');
const logger = require('../config/logger');

/**
 * Validation rules for adding a question
 */
const addQuestionValidation = [
  body('surveyId').optional().isUUID().withMessage('Survey ID must be a valid UUID'),
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
  param('id').isUUID().withMessage('Question ID must be a valid UUID'),
  body('surveyId').optional().isUUID().withMessage('Survey ID must be a valid UUID'),
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
  body('surveyId').isUUID().withMessage('Survey ID must be a valid UUID'),
  body('questionOrders')
    .isArray().withMessage('Question orders must be an array')
    .notEmpty().withMessage('Question orders cannot be empty')
];

/**
 * Add a question to a survey
 * POST /api/v1/questions
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

    const surveyId = req.params.surveyId || req.body.surveyId;
    const questionData = req.body;
    const question = await surveyService.addQuestion(surveyId, questionData);

    res.status(201).json({
      success: true,
      message: 'Question added successfully',
      question
    });
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
      return res.status(400).json({
        error: 'Question creation failed',
        message: error.message
      });
    }

    logger.error('Add question controller error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while adding question'
    });
  }
}

/**
 * Get questions by survey
 * GET /api/v1/questions/survey/:surveyId
 */
async function getQuestionsBySurvey(req, res) {
  try {
    const surveyId = req.params.surveyId || req.body.surveyId;
    const questions = await surveyService.getQuestionsBySurvey(surveyId);

    return res.json({
      success: true,
      questions
    });
  } catch (error) {
    logger.error('Get questions by survey controller error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching questions'
    });
  }
}

/**
 * Update a question
 * PUT /api/v1/questions/:id
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

    const questionId = req.params.id;
    const updates = req.body;
    const question = await surveyService.updateQuestion(questionId, updates);

    return res.json({
      success: true,
      message: 'Question updated successfully',
      question
    });
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
      return res.status(400).json({
        error: 'Question update failed',
        message: error.message
      });
    }

    logger.error('Update question controller error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while updating question'
    });
  }
}

/**
 * Delete a question
 * DELETE /api/v1/questions/:id
 */
async function deleteQuestion(req, res) {
  try {
    const questionId = req.params.id;
    const deleted = await surveyService.deleteQuestion(questionId);

    if (!deleted) {
      return res.status(400).json({
        error: 'Question deletion failed',
        message: 'Question was not deleted'
      });
    }

    return res.json({
      success: true,
      message: 'Question deleted successfully'
    });
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
      return res.status(400).json({
        error: 'Question deletion failed',
        message: error.message
      });
    }

    logger.error('Delete question controller error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while deleting question'
    });
  }
}

/**
 * Reorder questions in a survey
 * PATCH /api/v1/questions/reorder
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

    const { surveyId, questionOrders } = req.body;
    const questions = await surveyService.reorderQuestions(surveyId, questionOrders);

    return res.json({
      success: true,
      message: 'Questions reordered successfully',
      questions
    });
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
      return res.status(400).json({
        error: 'Question reordering failed',
        message: error.message
      });
    }

    logger.error('Reorder questions controller error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while reordering questions'
    });
  }
}

/**
 * Upload question image
 * POST /api/v1/questions/:id/upload/image
 */
async function uploadQuestionImage(req, res) {
  try {
    const questionId = req.params.id;

    if (!req.file) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Image file is required'
      });
    }

    const imageUrl = await surveyService.uploadQuestionImage(questionId, req.file);

    return res.json({
      success: true,
      message: 'Question image uploaded successfully',
      imageUrl
    });
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
      return res.status(400).json({
        error: 'Image upload failed',
        message: error.message
      });
    }

    logger.error('Upload question image controller error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while uploading image'
    });
  }
}

/**
 * Upload option image
 * POST /api/v1/questions/:id/upload/option/:optionIndex
 */
async function uploadOptionImage(req, res) {
  try {
    const questionId = req.params.id;
    const optionIndex = parseInt(req.params.optionIndex, 10);

    if (!req.file) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Image file is required'
      });
    }

    const imageUrl = await surveyService.uploadOptionImage(questionId, optionIndex, req.file);

    return res.json({
      success: true,
      message: 'Option image uploaded successfully',
      imageUrl
    });
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
      return res.status(400).json({
        error: 'Image upload failed',
        message: error.message
      });
    }

    logger.error('Upload option image controller error:', error);
    return res.status(500).json({
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

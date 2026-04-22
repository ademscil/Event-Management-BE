const { body, param, query, validationResult } = require('express-validator');
const emailService = require('../services/emailService');
const logger = require('../config/logger');

function handleEmailError(res, error, fallbackMessage) {
  const message = error?.message || fallbackMessage;

  if (/not found/i.test(message)) {
    return res.status(404).json({
      error: 'Not found',
      message
    });
  }

  if (/validation|required|invalid|ended|no recipients/i.test(message)) {
    return res.status(400).json({
      error: 'Validation failed',
      message
    });
  }

  logger.error(fallbackMessage, error);
  return res.status(500).json({
    error: 'Internal server error',
    message: fallbackMessage
  });
}

/**
 * Send survey blast
 * POST /api/v1/emails/blast
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function sendSurveyBlast(req, res) {
  try {
    const request = req.body;
    const result = await emailService.sendSurveyBlast(request);

    res.json({
      success: true,
      message: 'Survey blast sent successfully',
      total: result.total,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped || 0,
      errors: result.errors || [],
      detail: result.message || null
    });

  } catch (error) {
    return handleEmailError(res, error, 'An error occurred while sending survey blast');
  }
}

/**
 * Get target recipients
 * POST /api/v1/emails/target-recipients
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getTargetRecipients(req, res) {
  try {
    const criteria = req.body;
    const recipients = await emailService.getTargetRecipients(criteria);

    res.json({
      success: true,
      recipients,
      count: recipients.length
    });

  } catch (error) {
    logger.error('Get target recipients controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching recipients'
    });
  }
}

/**
 * Send reminders
 * POST /api/v1/emails/reminders
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function sendReminders(req, res) {
  try {
    const request = req.body;
    const result = await emailService.sendReminders(request);

    res.json({
      success: true,
      message: 'Reminders sent successfully',
      total: result.total,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped || 0,
      errors: result.errors || [],
      detail: result.message || null
    });

  } catch (error) {
    return handleEmailError(res, error, 'An error occurred while sending reminders');
  }
}

/**
 * Get non-respondents
 * GET /api/v1/emails/non-respondents/:surveyId
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getNonRespondents(req, res) {
  try {
    const surveyId = String(req.params.surveyId || '').trim();
    const nonRespondents = await emailService.getNonRespondents(surveyId);

    res.json({
      success: true,
      nonRespondents,
      count: nonRespondents.length
    });

  } catch (error) {
    return handleEmailError(res, error, 'An error occurred while fetching non-respondents');
  }
}

/**
 * Send approval notification
 * POST /api/v1/emails/approval-notification
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function sendApprovalNotification(req, res) {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Notification payload is required'
      });
    }

    const result = await emailService.sendApprovalNotification(req.body);

    if (!result.success) {
      return res.status(400).json({
        error: 'Notification sending failed',
        message: result.error
      });
    }

    res.json({
      success: true,
      message: 'Approval notification sent successfully'
    });

  } catch (error) {
    return handleEmailError(res, error, 'An error occurred while sending notification');
  }
}

/**
 * Send rejection notification
 * POST /api/v1/emails/rejection-notification
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function sendRejectionNotification(req, res) {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Notification payload is required'
      });
    }

    const result = await emailService.sendRejectionNotification(req.body);

    if (!result.success) {
      return res.status(400).json({
        error: 'Notification sending failed',
        message: result.error
      });
    }

    res.json({
      success: true,
      message: 'Rejection notification sent successfully'
    });

  } catch (error) {
    return handleEmailError(res, error, 'An error occurred while sending notification');
  }
}

/**
 * Get email template
 * GET /api/v1/emails/templates/:templateName
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getTemplate(req, res) {
  try {
    const templateName = req.params.templateName;
    const template = await emailService.getTemplate(templateName);

    if (!template) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Template not found'
      });
    }

    res.json({
      success: true,
      template
    });

  } catch (error) {
    logger.error('Get template controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching template'
    });
  }
}

module.exports = {
  sendSurveyBlast,
  getTargetRecipients,
  sendReminders,
  getNonRespondents,
  sendApprovalNotification,
  sendRejectionNotification,
  getTemplate
};

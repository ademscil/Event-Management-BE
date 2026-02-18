const { body, param, query, validationResult } = require('express-validator');
const approvalService = require('../services/approvalService');
const logger = require('../config/logger');

/**
 * Propose takeout for question
 * POST /api/v1/approvals/propose-takeout
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function proposeTakeoutForQuestion(req, res) {
  try {
    const { responseId, questionId, reason } = req.body;
    const proposedBy = req.user?.userId;

    if (!responseId || !questionId || !reason) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Response ID, question ID, and reason are required'
      });
    }

    const result = await approvalService.proposeTakeoutForQuestion({
      responseId: parseInt(responseId),
      questionId: parseInt(questionId),
      reason,
      proposedBy
    });

    if (!result.success) {
      return res.status(400).json({
        error: 'Propose takeout failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Takeout proposed successfully'
    });

  } catch (error) {
    logger.error('Propose takeout controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while proposing takeout'
    });
  }
}

/**
 * Bulk propose takeout
 * POST /api/v1/approvals/bulk-propose-takeout
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function bulkProposeTakeout(req, res) {
  try {
    const { responseIds, questionIds, reason } = req.body;
    const proposedBy = req.user?.userId;

    const result = await approvalService.bulkProposeTakeout(responseIds, questionIds, reason, proposedBy);

    if (!result.success) {
      return res.status(400).json({
        error: 'Bulk propose takeout failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Bulk takeout proposed successfully',
      count: result.count
    });

  } catch (error) {
    logger.error('Bulk propose takeout controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while proposing bulk takeout'
    });
  }
}

/**
 * Cancel proposed takeout
 * DELETE /api/v1/approvals/propose-takeout
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function cancelProposedTakeout(req, res) {
  try {
    const { responseId, questionId } = req.body;

    const result = await approvalService.cancelProposedTakeoutForQuestion(
      parseInt(responseId),
      parseInt(questionId)
    );

    if (!result.success) {
      return res.status(400).json({
        error: 'Cancel takeout failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Proposed takeout cancelled successfully'
    });

  } catch (error) {
    logger.error('Cancel proposed takeout controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while cancelling takeout'
    });
  }
}

/**
 * Approve proposed takeout
 * POST /api/v1/approvals/approve
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function approveProposedTakeout(req, res) {
  try {
    const { responseId, questionId, reason } = req.body;
    const approvedBy = req.user?.userId;

    const result = await approvalService.approveProposedTakeout(
      parseInt(responseId),
      parseInt(questionId),
      approvedBy,
      reason
    );

    if (!result.success) {
      return res.status(400).json({
        error: 'Approval failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Takeout approved successfully'
    });

  } catch (error) {
    logger.error('Approve takeout controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while approving takeout'
    });
  }
}

/**
 * Reject proposed takeout
 * POST /api/v1/approvals/reject
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function rejectProposedTakeout(req, res) {
  try {
    const { responseId, questionId, reason } = req.body;
    const rejectedBy = req.user?.userId;

    if (!reason) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Reason is required for rejection'
      });
    }

    const result = await approvalService.rejectProposedTakeout(
      parseInt(responseId),
      parseInt(questionId),
      rejectedBy,
      reason
    );

    if (!result.success) {
      return res.status(400).json({
        error: 'Rejection failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Takeout rejected successfully'
    });

  } catch (error) {
    logger.error('Reject takeout controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while rejecting takeout'
    });
  }
}

/**
 * Get pending approvals for IT Lead
 * GET /api/v1/approvals/pending
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getPendingApprovals(req, res) {
  try {
    const itLeadUserId = req.user?.userId;
    const approvals = await approvalService.getPendingApprovalsForITLead(itLeadUserId);

    res.json({
      success: true,
      approvals
    });

  } catch (error) {
    logger.error('Get pending approvals controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching pending approvals'
    });
  }
}

/**
 * Mark as best comment
 * POST /api/v1/approvals/best-comments
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function markAsBestComment(req, res) {
  try {
    const { responseId, questionId } = req.body;

    const result = await approvalService.markAsBestComment(
      parseInt(responseId),
      parseInt(questionId)
    );

    if (!result.success) {
      return res.status(400).json({
        error: 'Mark best comment failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Marked as best comment successfully'
    });

  } catch (error) {
    logger.error('Mark best comment controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while marking best comment'
    });
  }
}

/**
 * Unmark best comment
 * DELETE /api/v1/approvals/best-comments
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function unmarkBestComment(req, res) {
  try {
    const { responseId, questionId } = req.body;

    const result = await approvalService.unmarkBestComment(
      parseInt(responseId),
      parseInt(questionId)
    );

    if (!result.success) {
      return res.status(400).json({
        error: 'Unmark best comment failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Best comment unmarked successfully'
    });

  } catch (error) {
    logger.error('Unmark best comment controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while unmarking best comment'
    });
  }
}

/**
 * Get best comments
 * GET /api/v1/approvals/best-comments
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getBestComments(req, res) {
  try {
    const { surveyId, functionId } = req.query;

    const filter = {};
    if (surveyId) filter.surveyId = parseInt(surveyId);
    if (functionId) filter.functionId = parseInt(functionId);

    const comments = await approvalService.getBestComments(filter);

    res.json({
      success: true,
      comments
    });

  } catch (error) {
    logger.error('Get best comments controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching best comments'
    });
  }
}

/**
 * Submit best comment feedback
 * POST /api/v1/approvals/best-comments/feedback
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function submitBestCommentFeedback(req, res) {
  try {
    const { responseId, questionId, feedbackText } = req.body;
    const itLeadUserId = req.user?.userId;

    const feedback = {
      responseId: parseInt(responseId),
      questionId: parseInt(questionId),
      itLeadUserId,
      feedbackText
    };

    const result = await approvalService.submitBestCommentFeedback(feedback);

    if (!result.success) {
      return res.status(400).json({
        error: 'Feedback submission failed',
        message: result.errorMessage
      });
    }

    res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      feedback: result.feedback
    });

  } catch (error) {
    logger.error('Submit feedback controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while submitting feedback'
    });
  }
}

/**
 * Get approval statistics
 * GET /api/v1/approvals/statistics/:surveyId
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getApprovalStatistics(req, res) {
  try {
    const surveyId = parseInt(req.params.surveyId);
    const statistics = await approvalService.getApprovalStatistics(surveyId);

    res.json({
      success: true,
      statistics
    });

  } catch (error) {
    logger.error('Get approval statistics controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching statistics'
    });
  }
}

module.exports = {
  proposeTakeoutForQuestion,
  bulkProposeTakeout,
  cancelProposedTakeout,
  approveProposedTakeout,
  rejectProposedTakeout,
  getPendingApprovals,
  markAsBestComment,
  unmarkBestComment,
  getBestComments,
  submitBestCommentFeedback,
  getApprovalStatistics
};

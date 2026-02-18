/**
 * Approval Service
 * Handles approval workflow for survey responses
 */

const sql = require('mssql');
const { getPool } = require('../database/connection');
const logger = require('../config/logger');

/**
 * Custom error classes
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}

class UnauthorizedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Response status enum
 */
const ResponseStatus = {
  ACTIVE: 'Active',
  PROPOSED_TAKEOUT: 'ProposedTakeout',
  TAKEN_OUT: 'TakenOut',
  REJECTED: 'Rejected'
};

/**
 * Approval action enum
 */
const ApprovalAction = {
  PROPOSED: 'Proposed',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled'
};

class ApprovalService {
  constructor() {
    this.pool = null;
  }

  async initialize() {
    if (!this.pool) {
      this.pool = await getPool();
    }
  }

  async proposeTakeoutForQuestion(request) {
    await this.initialize();
    const { responseId, questionId, reason, proposedBy } = request;

    if (!responseId || !questionId || !reason || !proposedBy) {
      throw new ValidationError('ResponseId, QuestionId, Reason, and ProposedBy are required');
    }

    try {
      const transaction = new sql.Transaction(this.pool);
      await transaction.begin();

      try {
        const checkResult = await transaction.request()
          .input('responseId', sql.UniqueIdentifier, responseId)
          .input('questionId', sql.UniqueIdentifier, questionId)
          .query(`
            SELECT QuestionResponseId, TakeoutStatus
            FROM QuestionResponses
            WHERE ResponseId = @responseId AND QuestionId = @questionId
          `);

        if (checkResult.recordset.length === 0) {
          throw new NotFoundError('Question response not found');
        }

        const questionResponse = checkResult.recordset[0];
        const previousStatus = questionResponse.TakeoutStatus;

        await transaction.request()
          .input('responseId', sql.UniqueIdentifier, responseId)
          .input('questionId', sql.UniqueIdentifier, questionId)
          .input('status', sql.NVarChar, ResponseStatus.PROPOSED_TAKEOUT)
          .input('reason', sql.NVarChar, reason)
          .input('proposedBy', sql.UniqueIdentifier, proposedBy)
          .input('proposedAt', sql.DateTime2, new Date())
          .query(`
            UPDATE QuestionResponses
            SET TakeoutStatus = @status,
                TakeoutReason = @reason,
                ProposedBy = @proposedBy,
                ProposedAt = @proposedAt
            WHERE ResponseId = @responseId AND QuestionId = @questionId
          `);

        await transaction.request()
          .input('questionResponseId', sql.UniqueIdentifier, questionResponse.QuestionResponseId)
          .input('action', sql.NVarChar, ApprovalAction.PROPOSED)
          .input('performedBy', sql.UniqueIdentifier, proposedBy)
          .input('reason', sql.NVarChar, reason)
          .input('previousStatus', sql.NVarChar, previousStatus)
          .input('newStatus', sql.NVarChar, ResponseStatus.PROPOSED_TAKEOUT)
          .query(`
            INSERT INTO ApprovalHistory (QuestionResponseId, Action, PerformedBy, Reason, PreviousStatus, NewStatus)
            VALUES (@questionResponseId, @action, @performedBy, @reason, @previousStatus, @newStatus)
          `);

        await transaction.commit();
        logger.info(`Takeout proposed for question response: ${questionResponse.QuestionResponseId}`);

        return {
          success: true,
          questionResponseId: questionResponse.QuestionResponseId,
          status: ResponseStatus.PROPOSED_TAKEOUT
        };
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error('Error proposing takeout for question:', error);
      throw error;
    }
  }

  async cancelProposedTakeoutForQuestion(responseId, questionId, cancelledBy) {
    await this.initialize();

    if (!responseId || !questionId || !cancelledBy) {
      throw new ValidationError('ResponseId, QuestionId, and CancelledBy are required');
    }

    try {
      const transaction = new sql.Transaction(this.pool);
      await transaction.begin();

      try {
        const checkResult = await transaction.request()
          .input('responseId', sql.UniqueIdentifier, responseId)
          .input('questionId', sql.UniqueIdentifier, questionId)
          .query(`
            SELECT QuestionResponseId, TakeoutStatus
            FROM QuestionResponses
            WHERE ResponseId = @responseId AND QuestionId = @questionId
          `);

        if (checkResult.recordset.length === 0) {
          throw new NotFoundError('Question response not found');
        }

        const questionResponse = checkResult.recordset[0];
        const previousStatus = questionResponse.TakeoutStatus;

        if (previousStatus !== ResponseStatus.PROPOSED_TAKEOUT) {
          throw new ValidationError('Can only cancel proposed takeouts');
        }

        await transaction.request()
          .input('responseId', sql.UniqueIdentifier, responseId)
          .input('questionId', sql.UniqueIdentifier, questionId)
          .input('status', sql.NVarChar, ResponseStatus.ACTIVE)
          .query(`
            UPDATE QuestionResponses
            SET TakeoutStatus = @status,
                TakeoutReason = NULL,
                ProposedBy = NULL,
                ProposedAt = NULL
            WHERE ResponseId = @responseId AND QuestionId = @questionId
          `);

        await transaction.request()
          .input('questionResponseId', sql.UniqueIdentifier, questionResponse.QuestionResponseId)
          .input('action', sql.NVarChar, ApprovalAction.CANCELLED)
          .input('performedBy', sql.UniqueIdentifier, cancelledBy)
          .input('previousStatus', sql.NVarChar, previousStatus)
          .input('newStatus', sql.NVarChar, ResponseStatus.ACTIVE)
          .query(`
            INSERT INTO ApprovalHistory (QuestionResponseId, Action, PerformedBy, Reason, PreviousStatus, NewStatus)
            VALUES (@questionResponseId, @action, @performedBy, NULL, @previousStatus, @newStatus)
          `);

        await transaction.commit();
        logger.info(`Proposed takeout cancelled for question response: ${questionResponse.QuestionResponseId}`);

        return {
          success: true,
          questionResponseId: questionResponse.QuestionResponseId,
          status: ResponseStatus.ACTIVE
        };
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error('Error cancelling proposed takeout:', error);
      throw error;
    }
  }

  async bulkProposeTakeout(responseIds, questionIds, reason, proposedBy) {
    await this.initialize();
    if (!responseIds || !Array.isArray(responseIds) || responseIds.length === 0) {
      throw new ValidationError('ResponseIds array is required');
    }
    if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
      throw new ValidationError('QuestionIds array is required');
    }
    if (!reason || !proposedBy) {
      throw new ValidationError('Reason and ProposedBy are required');
    }
    const results = { success: [], failed: [] };
    for (const responseId of responseIds) {
      for (const questionId of questionIds) {
        try {
          await this.proposeTakeoutForQuestion({ responseId, questionId, reason, proposedBy });
          results.success.push({ responseId, questionId });
        } catch (error) {
          results.failed.push({ responseId, questionId, error: error.message });
        }
      }
    }
    return results;
  }

  async getRespondents(filter = {}) {
    await this.initialize();
    const { surveyId, duplicateFilter = 'all', applicationId, departmentId } = filter;
    if (!surveyId) {
      throw new ValidationError('SurveyId is required');
    }
    try {
      let query = `
        SELECT r.ResponseId, r.RespondentEmail, r.RespondentName, r.ApplicationId,
               a.Name as ApplicationName, r.DepartmentId, d.Name as DepartmentName,
               r.SubmittedAt,
               COUNT(*) OVER (PARTITION BY r.RespondentEmail, r.ApplicationId) as DuplicateCount
        FROM Responses r
        INNER JOIN Applications a ON r.ApplicationId = a.ApplicationId
        INNER JOIN Departments d ON r.DepartmentId = d.DepartmentId
        WHERE r.SurveyId = @surveyId
      `;
      const request = this.pool.request();
      request.input('surveyId', sql.UniqueIdentifier, surveyId);
      if (applicationId) {
        query += ' AND r.ApplicationId = @applicationId';
        request.input('applicationId', sql.UniqueIdentifier, applicationId);
      }
      if (departmentId) {
        query += ' AND r.DepartmentId = @departmentId';
        request.input('departmentId', sql.UniqueIdentifier, departmentId);
      }
      query += ' ORDER BY r.SubmittedAt DESC';
      const result = await request.query(query);
      let respondents = result.recordset;
      if (duplicateFilter === 'duplicate') {
        respondents = respondents.filter(r => r.DuplicateCount > 1);
      } else if (duplicateFilter === 'unique') {
        respondents = respondents.filter(r => r.DuplicateCount === 1);
      }
      respondents.forEach(r => { r.IsDuplicate = r.DuplicateCount > 1; });
      return respondents;
    } catch (error) {
      logger.error('Error getting respondents:', error);
      throw error;
    }
  }

  async approveProposedTakeout(responseId, questionId, approvedBy, reason = null) {
    await this.initialize();
    if (!responseId || !questionId || !approvedBy) {
      throw new ValidationError('ResponseId, QuestionId, and ApprovedBy are required');
    }
    try {
      const transaction = new sql.Transaction(this.pool);
      await transaction.begin();
      try {
        const checkResult = await transaction.request()
          .input('responseId', sql.UniqueIdentifier, responseId)
          .input('questionId', sql.UniqueIdentifier, questionId)
          .query(`SELECT QuestionResponseId, TakeoutStatus FROM QuestionResponses
                  WHERE ResponseId = @responseId AND QuestionId = @questionId`);
        if (checkResult.recordset.length === 0) {
          throw new NotFoundError('Question response not found');
        }
        const questionResponse = checkResult.recordset[0];
        const previousStatus = questionResponse.TakeoutStatus;
        if (previousStatus !== ResponseStatus.PROPOSED_TAKEOUT) {
          throw new ValidationError('Can only approve proposed takeouts');
        }
        await transaction.request()
          .input('responseId', sql.UniqueIdentifier, responseId)
          .input('questionId', sql.UniqueIdentifier, questionId)
          .input('status', sql.NVarChar, ResponseStatus.TAKEN_OUT)
          .input('reviewedBy', sql.UniqueIdentifier, approvedBy)
          .input('reviewedAt', sql.DateTime2, new Date())
          .query(`UPDATE QuestionResponses SET TakeoutStatus = @status, ReviewedBy = @reviewedBy,
                  ReviewedAt = @reviewedAt WHERE ResponseId = @responseId AND QuestionId = @questionId`);
        await transaction.request()
          .input('questionResponseId', sql.UniqueIdentifier, questionResponse.QuestionResponseId)
          .input('action', sql.NVarChar, ApprovalAction.APPROVED)
          .input('performedBy', sql.UniqueIdentifier, approvedBy)
          .input('reason', sql.NVarChar, reason)
          .input('previousStatus', sql.NVarChar, previousStatus)
          .input('newStatus', sql.NVarChar, ResponseStatus.TAKEN_OUT)
          .query(`INSERT INTO ApprovalHistory (QuestionResponseId, Action, PerformedBy, Reason, PreviousStatus, NewStatus)
                  VALUES (@questionResponseId, @action, @performedBy, @reason, @previousStatus, @newStatus)`);
        await transaction.commit();
        return { success: true, questionResponseId: questionResponse.QuestionResponseId, status: ResponseStatus.TAKEN_OUT };
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error('Error approving proposed takeout:', error);
      throw error;
    }
  }

  async rejectProposedTakeout(responseId, questionId, rejectedBy, reason) {
    await this.initialize();
    if (!responseId || !questionId || !rejectedBy || !reason) {
      throw new ValidationError('ResponseId, QuestionId, RejectedBy, and Reason are required');
    }
    try {
      const transaction = new sql.Transaction(this.pool);
      await transaction.begin();
      try {
        const checkResult = await transaction.request()
          .input('responseId', sql.UniqueIdentifier, responseId)
          .input('questionId', sql.UniqueIdentifier, questionId)
          .query(`SELECT QuestionResponseId, TakeoutStatus FROM QuestionResponses
                  WHERE ResponseId = @responseId AND QuestionId = @questionId`);
        if (checkResult.recordset.length === 0) {
          throw new NotFoundError('Question response not found');
        }
        const questionResponse = checkResult.recordset[0];
        const previousStatus = questionResponse.TakeoutStatus;
        if (previousStatus !== ResponseStatus.PROPOSED_TAKEOUT) {
          throw new ValidationError('Can only reject proposed takeouts');
        }
        await transaction.request()
          .input('responseId', sql.UniqueIdentifier, responseId)
          .input('questionId', sql.UniqueIdentifier, questionId)
          .input('status', sql.NVarChar, ResponseStatus.ACTIVE)
          .input('reviewedBy', sql.UniqueIdentifier, rejectedBy)
          .input('reviewedAt', sql.DateTime2, new Date())
          .query(`UPDATE QuestionResponses SET TakeoutStatus = @status, TakeoutReason = NULL,
                  ProposedBy = NULL, ProposedAt = NULL, ReviewedBy = @reviewedBy, ReviewedAt = @reviewedAt
                  WHERE ResponseId = @responseId AND QuestionId = @questionId`);
        await transaction.request()
          .input('questionResponseId', sql.UniqueIdentifier, questionResponse.QuestionResponseId)
          .input('action', sql.NVarChar, ApprovalAction.REJECTED)
          .input('performedBy', sql.UniqueIdentifier, rejectedBy)
          .input('reason', sql.NVarChar, reason)
          .input('previousStatus', sql.NVarChar, previousStatus)
          .input('newStatus', sql.NVarChar, ResponseStatus.ACTIVE)
          .query(`INSERT INTO ApprovalHistory (QuestionResponseId, Action, PerformedBy, Reason, PreviousStatus, NewStatus)
                  VALUES (@questionResponseId, @action, @performedBy, @reason, @previousStatus, @newStatus)`);
        await transaction.commit();
        return { success: true, questionResponseId: questionResponse.QuestionResponseId, status: ResponseStatus.ACTIVE };
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error('Error rejecting proposed takeout:', error);
      throw error;
    }
  }

  async bulkApprove(responseIds, questionIds, approvedBy, reason = null) {
    await this.initialize();
    if (!responseIds || !Array.isArray(responseIds) || responseIds.length === 0) {
      throw new ValidationError('ResponseIds array is required');
    }
    if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
      throw new ValidationError('QuestionIds array is required');
    }
    if (!approvedBy) {
      throw new ValidationError('ApprovedBy is required');
    }
    const results = { success: [], failed: [] };
    for (const responseId of responseIds) {
      for (const questionId of questionIds) {
        try {
          await this.approveProposedTakeout(responseId, questionId, approvedBy, reason);
          results.success.push({ responseId, questionId });
        } catch (error) {
          results.failed.push({ responseId, questionId, error: error.message });
        }
      }
    }
    return results;
  }

  async bulkReject(responseIds, questionIds, rejectedBy, reason) {
    await this.initialize();
    if (!responseIds || !Array.isArray(responseIds) || responseIds.length === 0) {
      throw new ValidationError('ResponseIds array is required');
    }
    if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
      throw new ValidationError('QuestionIds array is required');
    }
    if (!rejectedBy || !reason) {
      throw new ValidationError('RejectedBy and Reason are required');
    }
    const results = { success: [], failed: [] };
    for (const responseId of responseIds) {
      for (const questionId of questionIds) {
        try {
          await this.rejectProposedTakeout(responseId, questionId, rejectedBy, reason);
          results.success.push({ responseId, questionId });
        } catch (error) {
          results.failed.push({ responseId, questionId, error: error.message });
        }
      }
    }
    return results;
  }

  async getPendingApprovalsForITLead(itLeadUserId, filter = {}) {
    await this.initialize();
    if (!itLeadUserId) {
      throw new ValidationError('ITLeadUserId is required');
    }
    try {
      let query = `
        SELECT qr.QuestionResponseId, qr.ResponseId, qr.QuestionId, qr.TextValue, qr.NumericValue,
               qr.CommentValue, qr.TakeoutStatus, qr.TakeoutReason, qr.ProposedAt,
               q.PromptText as QuestionText, r.RespondentEmail, r.RespondentName,
               a.Name as ApplicationName, d.Name as DepartmentName, f.FunctionId, f.Name as FunctionName,
               proposer.DisplayName as ProposedByName
        FROM QuestionResponses qr
        INNER JOIN Questions q ON qr.QuestionId = q.QuestionId
        INNER JOIN Responses r ON qr.ResponseId = r.ResponseId
        INNER JOIN Applications a ON r.ApplicationId = a.ApplicationId
        INNER JOIN Departments d ON r.DepartmentId = d.DepartmentId
        INNER JOIN FunctionApplicationMappings fam ON a.ApplicationId = fam.ApplicationId
        INNER JOIN Functions f ON fam.FunctionId = f.FunctionId
        LEFT JOIN Users proposer ON qr.ProposedBy = proposer.UserId
        WHERE qr.TakeoutStatus = @status AND f.ITDeptHeadUserId = @itLeadUserId
      `;
      const request = this.pool.request();
      request.input('status', sql.NVarChar, ResponseStatus.PROPOSED_TAKEOUT);
      request.input('itLeadUserId', sql.UniqueIdentifier, itLeadUserId);
      if (filter.surveyId) {
        query += ' AND q.SurveyId = @surveyId';
        request.input('surveyId', sql.UniqueIdentifier, filter.surveyId);
      }
      if (filter.functionId) {
        query += ' AND f.FunctionId = @functionId';
        request.input('functionId', sql.UniqueIdentifier, filter.functionId);
      }
      query += ' ORDER BY qr.ProposedAt DESC';
      const result = await request.query(query);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting pending approvals for IT Lead:', error);
      throw error;
    }
  }

  async getProposedTakeouts(filter = {}) {
    await this.initialize();
    try {
      let query = `
        SELECT qr.QuestionResponseId, qr.ResponseId, qr.QuestionId, qr.CommentValue,
               qr.TakeoutStatus, qr.TakeoutReason, qr.ProposedAt,
               q.PromptText as QuestionText, r.RespondentEmail, r.RespondentName,
               a.Name as ApplicationName, d.Name as DepartmentName,
               s.SurveyId, s.Title as SurveyTitle,
               proposer.DisplayName as ProposedByName
        FROM QuestionResponses qr
        INNER JOIN Questions q ON qr.QuestionId = q.QuestionId
        INNER JOIN Surveys s ON q.SurveyId = s.SurveyId
        INNER JOIN Responses r ON qr.ResponseId = r.ResponseId
        INNER JOIN Applications a ON r.ApplicationId = a.ApplicationId
        INNER JOIN Departments d ON r.DepartmentId = d.DepartmentId
        LEFT JOIN Users proposer ON qr.ProposedBy = proposer.UserId
        WHERE 1=1
      `;
      const request = this.pool.request();
      if (filter.surveyId) {
        query += ' AND s.SurveyId = @surveyId';
        request.input('surveyId', sql.UniqueIdentifier, filter.surveyId);
      }
      if (filter.applicationId) {
        query += ' AND r.ApplicationId = @applicationId';
        request.input('applicationId', sql.UniqueIdentifier, filter.applicationId);
      }
      if (filter.departmentId) {
        query += ' AND r.DepartmentId = @departmentId';
        request.input('departmentId', sql.UniqueIdentifier, filter.departmentId);
      }
      if (filter.functionId) {
        query += ` AND EXISTS (SELECT 1 FROM FunctionApplicationMappings fam
                   WHERE fam.ApplicationId = r.ApplicationId AND fam.FunctionId = @functionId)`;
        request.input('functionId', sql.UniqueIdentifier, filter.functionId);
      }
      if (filter.status) {
        query += ' AND qr.TakeoutStatus = @status';
        request.input('status', sql.NVarChar, filter.status);
      } else {
        query += ' AND qr.TakeoutStatus = @status';
        request.input('status', sql.NVarChar, ResponseStatus.PROPOSED_TAKEOUT);
      }
      query += ' ORDER BY qr.ProposedAt DESC';
      const result = await request.query(query);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting proposed takeouts:', error);
      throw error;
    }
  }

  async markAsBestComment(responseId, questionId, markedBy) {
    await this.initialize();
    if (!responseId || !questionId || !markedBy) {
      throw new ValidationError('ResponseId, QuestionId, and MarkedBy are required');
    }
    try {
      const checkResult = await this.pool.request()
        .input('responseId', sql.UniqueIdentifier, responseId)
        .input('questionId', sql.UniqueIdentifier, questionId)
        .query(`SELECT QuestionResponseId, IsBestComment, CommentValue FROM QuestionResponses
                WHERE ResponseId = @responseId AND QuestionId = @questionId`);
      if (checkResult.recordset.length === 0) {
        throw new NotFoundError('Question response not found');
      }
      const questionResponse = checkResult.recordset[0];
      if (!questionResponse.CommentValue) {
        throw new ValidationError('Cannot mark as best comment - no comment exists');
      }
      if (questionResponse.IsBestComment) {
        throw new ValidationError('Already marked as best comment');
      }
      await this.pool.request()
        .input('responseId', sql.UniqueIdentifier, responseId)
        .input('questionId', sql.UniqueIdentifier, questionId)
        .query(`UPDATE QuestionResponses SET IsBestComment = 1
                WHERE ResponseId = @responseId AND QuestionId = @questionId`);
      return { success: true, questionResponseId: questionResponse.QuestionResponseId, isBestComment: true };
    } catch (error) {
      logger.error('Error marking as best comment:', error);
      throw error;
    }
  }

  async unmarkBestComment(responseId, questionId, unmarkedBy) {
    await this.initialize();
    if (!responseId || !questionId || !unmarkedBy) {
      throw new ValidationError('ResponseId, QuestionId, and UnmarkedBy are required');
    }
    try {
      const checkResult = await this.pool.request()
        .input('responseId', sql.UniqueIdentifier, responseId)
        .input('questionId', sql.UniqueIdentifier, questionId)
        .query(`SELECT QuestionResponseId, IsBestComment FROM QuestionResponses
                WHERE ResponseId = @responseId AND QuestionId = @questionId`);
      if (checkResult.recordset.length === 0) {
        throw new NotFoundError('Question response not found');
      }
      const questionResponse = checkResult.recordset[0];
      if (!questionResponse.IsBestComment) {
        throw new ValidationError('Not marked as best comment');
      }
      await this.pool.request()
        .input('responseId', sql.UniqueIdentifier, responseId)
        .input('questionId', sql.UniqueIdentifier, questionId)
        .query(`UPDATE QuestionResponses SET IsBestComment = 0
                WHERE ResponseId = @responseId AND QuestionId = @questionId`);
      return { success: true, questionResponseId: questionResponse.QuestionResponseId, isBestComment: false };
    } catch (error) {
      logger.error('Error unmarking best comment:', error);
      throw error;
    }
  }

  async getBestComments(filter = {}) {
    await this.initialize();
    try {
      let query = `
        SELECT qr.QuestionResponseId, qr.ResponseId, qr.QuestionId, qr.CommentValue, qr.NumericValue,
               q.PromptText as QuestionText, r.RespondentEmail, r.RespondentName,
               a.Name as ApplicationName, d.Name as DepartmentName, r.SubmittedAt,
               s.SurveyId, s.Title as SurveyTitle
        FROM QuestionResponses qr
        INNER JOIN Questions q ON qr.QuestionId = q.QuestionId
        INNER JOIN Surveys s ON q.SurveyId = s.SurveyId
        INNER JOIN Responses r ON qr.ResponseId = r.ResponseId
        INNER JOIN Applications a ON r.ApplicationId = a.ApplicationId
        INNER JOIN Departments d ON r.DepartmentId = d.DepartmentId
        WHERE qr.IsBestComment = 1
      `;
      const request = this.pool.request();
      if (filter.surveyId) {
        query += ' AND s.SurveyId = @surveyId';
        request.input('surveyId', sql.UniqueIdentifier, filter.surveyId);
      }
      if (filter.applicationId) {
        query += ' AND r.ApplicationId = @applicationId';
        request.input('applicationId', sql.UniqueIdentifier, filter.applicationId);
      }
      if (filter.departmentId) {
        query += ' AND r.DepartmentId = @departmentId';
        request.input('departmentId', sql.UniqueIdentifier, filter.departmentId);
      }
      if (filter.functionId) {
        query += ` AND EXISTS (SELECT 1 FROM FunctionApplicationMappings fam
                   WHERE fam.ApplicationId = r.ApplicationId AND fam.FunctionId = @functionId)`;
        request.input('functionId', sql.UniqueIdentifier, filter.functionId);
      }
      query += ' ORDER BY r.SubmittedAt DESC';
      const result = await request.query(query);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting best comments:', error);
      throw error;
    }
  }

  async submitBestCommentFeedback(feedback) {
    await this.initialize();
    const { questionResponseId, itLeadUserId, feedbackText } = feedback;
    if (!questionResponseId || !itLeadUserId || !feedbackText) {
      throw new ValidationError('QuestionResponseId, ITLeadUserId, and FeedbackText are required');
    }
    try {
      const checkResult = await this.pool.request()
        .input('questionResponseId', sql.UniqueIdentifier, questionResponseId)
        .query(`SELECT IsBestComment FROM QuestionResponses WHERE QuestionResponseId = @questionResponseId`);
      if (checkResult.recordset.length === 0) {
        throw new NotFoundError('Question response not found');
      }
      if (!checkResult.recordset[0].IsBestComment) {
        throw new ValidationError('Question response is not marked as best comment');
      }
      const existingFeedback = await this.pool.request()
        .input('questionResponseId', sql.UniqueIdentifier, questionResponseId)
        .input('itLeadUserId', sql.UniqueIdentifier, itLeadUserId)
        .query(`SELECT FeedbackId FROM BestCommentFeedback
                WHERE QuestionResponseId = @questionResponseId AND ITLeadUserId = @itLeadUserId`);
      if (existingFeedback.recordset.length > 0) {
        await this.pool.request()
          .input('feedbackId', sql.UniqueIdentifier, existingFeedback.recordset[0].FeedbackId)
          .input('feedbackText', sql.NVarChar, feedbackText)
          .input('updatedAt', sql.DateTime2, new Date())
          .query(`UPDATE BestCommentFeedback SET FeedbackText = @feedbackText, UpdatedAt = @updatedAt
                  WHERE FeedbackId = @feedbackId`);
        return { success: true, feedbackId: existingFeedback.recordset[0].FeedbackId, updated: true };
      } else {
        const result = await this.pool.request()
          .input('questionResponseId', sql.UniqueIdentifier, questionResponseId)
          .input('itLeadUserId', sql.UniqueIdentifier, itLeadUserId)
          .input('feedbackText', sql.NVarChar, feedbackText)
          .query(`INSERT INTO BestCommentFeedback (QuestionResponseId, ITLeadUserId, FeedbackText)
                  OUTPUT INSERTED.FeedbackId VALUES (@questionResponseId, @itLeadUserId, @feedbackText)`);
        return { success: true, feedbackId: result.recordset[0].FeedbackId, updated: false };
      }
    } catch (error) {
      logger.error('Error submitting best comment feedback:', error);
      throw error;
    }
  }

  async getBestCommentFeedback(questionResponseId) {
    await this.initialize();
    if (!questionResponseId) {
      throw new ValidationError('QuestionResponseId is required');
    }
    try {
      const result = await this.pool.request()
        .input('questionResponseId', sql.UniqueIdentifier, questionResponseId)
        .query(`SELECT bcf.FeedbackId, bcf.FeedbackText, bcf.CreatedAt, bcf.UpdatedAt,
                       u.DisplayName as ITLeadName, u.Email as ITLeadEmail
                FROM BestCommentFeedback bcf
                INNER JOIN Users u ON bcf.ITLeadUserId = u.UserId
                WHERE bcf.QuestionResponseId = @questionResponseId
                ORDER BY bcf.CreatedAt DESC`);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting best comment feedback:', error);
      throw error;
    }
  }

  async getBestCommentsWithFeedback(filter = {}) {
    await this.initialize();
    try {
      let query = `
        SELECT qr.QuestionResponseId, qr.CommentValue, qr.NumericValue,
               q.PromptText as QuestionText, r.RespondentEmail, r.RespondentName,
               a.Name as ApplicationName, d.Name as DepartmentName, r.SubmittedAt,
               s.SurveyId, s.Title as SurveyTitle,
               bcf.FeedbackText, bcf.CreatedAt as FeedbackCreatedAt,
               u.DisplayName as ITLeadName, f.FunctionId, f.Name as FunctionName
        FROM QuestionResponses qr
        INNER JOIN Questions q ON qr.QuestionId = q.QuestionId
        INNER JOIN Surveys s ON q.SurveyId = s.SurveyId
        INNER JOIN Responses r ON qr.ResponseId = r.ResponseId
        INNER JOIN Applications a ON r.ApplicationId = a.ApplicationId
        INNER JOIN Departments d ON r.DepartmentId = d.DepartmentId
        LEFT JOIN BestCommentFeedback bcf ON qr.QuestionResponseId = bcf.QuestionResponseId
        LEFT JOIN Users u ON bcf.ITLeadUserId = u.UserId
        LEFT JOIN FunctionApplicationMappings fam ON a.ApplicationId = fam.ApplicationId
        LEFT JOIN Functions f ON fam.FunctionId = f.FunctionId
        WHERE qr.IsBestComment = 1
      `;
      const request = this.pool.request();
      if (filter.surveyId) {
        query += ' AND s.SurveyId = @surveyId';
        request.input('surveyId', sql.UniqueIdentifier, filter.surveyId);
      }
      if (filter.functionId) {
        query += ' AND f.FunctionId = @functionId';
        request.input('functionId', sql.UniqueIdentifier, filter.functionId);
      }
      if (filter.departmentId) {
        query += ' AND r.DepartmentId = @departmentId';
        request.input('departmentId', sql.UniqueIdentifier, filter.departmentId);
      }
      query += ' ORDER BY r.SubmittedAt DESC';
      const result = await request.query(query);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting best comments with feedback:', error);
      throw error;
    }
  }

  async getApprovalStatistics(surveyId, options = {}) {
    await this.initialize();
    if (!surveyId) {
      throw new ValidationError('SurveyId is required');
    }
    try {
      let query = `
        SELECT qr.TakeoutStatus, COUNT(*) as Count, q.QuestionId, q.PromptText as QuestionText
        FROM QuestionResponses qr
        INNER JOIN Questions q ON qr.QuestionId = q.QuestionId
        INNER JOIN Responses r ON qr.ResponseId = r.ResponseId
        WHERE q.SurveyId = @surveyId
      `;
      const request = this.pool.request();
      request.input('surveyId', sql.UniqueIdentifier, surveyId);
      if (options.questionId) {
        query += ' AND q.QuestionId = @questionId';
        request.input('questionId', sql.UniqueIdentifier, options.questionId);
      }
      if (options.applicationId) {
        query += ' AND r.ApplicationId = @applicationId';
        request.input('applicationId', sql.UniqueIdentifier, options.applicationId);
      }
      if (options.departmentId) {
        query += ' AND r.DepartmentId = @departmentId';
        request.input('departmentId', sql.UniqueIdentifier, options.departmentId);
      }
      query += ' GROUP BY qr.TakeoutStatus, q.QuestionId, q.PromptText ORDER BY q.QuestionId';
      const result = await request.query(query);
      const statsByQuestion = {};
      result.recordset.forEach(row => {
        if (!statsByQuestion[row.QuestionId]) {
          statsByQuestion[row.QuestionId] = {
            questionId: row.QuestionId,
            questionText: row.QuestionText,
            active: 0,
            proposedTakeout: 0,
            takenOut: 0,
            rejected: 0,
            total: 0
          };
        }
        const stats = statsByQuestion[row.QuestionId];
        stats.total += row.Count;
        if (row.TakeoutStatus === ResponseStatus.ACTIVE) stats.active = row.Count;
        else if (row.TakeoutStatus === ResponseStatus.PROPOSED_TAKEOUT) stats.proposedTakeout = row.Count;
        else if (row.TakeoutStatus === ResponseStatus.TAKEN_OUT) stats.takenOut = row.Count;
        else if (row.TakeoutStatus === ResponseStatus.REJECTED) stats.rejected = row.Count;
      });
      const overallResult = await request.query(`
        SELECT qr.TakeoutStatus, COUNT(*) as Count
        FROM QuestionResponses qr
        INNER JOIN Questions q ON qr.QuestionId = q.QuestionId
        INNER JOIN Responses r ON qr.ResponseId = r.ResponseId
        WHERE q.SurveyId = @surveyId
        ${options.questionId ? 'AND q.QuestionId = @questionId' : ''}
        ${options.applicationId ? 'AND r.ApplicationId = @applicationId' : ''}
        ${options.departmentId ? 'AND r.DepartmentId = @departmentId' : ''}
        GROUP BY qr.TakeoutStatus
      `);
      const overall = { active: 0, proposedTakeout: 0, takenOut: 0, rejected: 0, total: 0 };
      overallResult.recordset.forEach(row => {
        overall.total += row.Count;
        if (row.TakeoutStatus === ResponseStatus.ACTIVE) overall.active = row.Count;
        else if (row.TakeoutStatus === ResponseStatus.PROPOSED_TAKEOUT) overall.proposedTakeout = row.Count;
        else if (row.TakeoutStatus === ResponseStatus.TAKEN_OUT) overall.takenOut = row.Count;
        else if (row.TakeoutStatus === ResponseStatus.REJECTED) overall.rejected = row.Count;
      });
      return { surveyId, overall, byQuestion: Object.values(statsByQuestion) };
    } catch (error) {
      logger.error('Error getting approval statistics:', error);
      throw error;
    }
  }
}

module.exports = new ApprovalService();
module.exports.ApprovalService = ApprovalService;
module.exports.ResponseStatus = ResponseStatus;
module.exports.ApprovalAction = ApprovalAction;
module.exports.ValidationError = ValidationError;
module.exports.NotFoundError = NotFoundError;
module.exports.UnauthorizedError = UnauthorizedError;

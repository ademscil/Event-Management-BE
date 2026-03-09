/**
 * Approval Service
 * Handles approval workflow for survey responses
 */

const sql = require('mssql');
const db = require('../database/connection');
const logger = require('../config/logger');
const publishCycleService = require('./publishCycleService');

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
const TakeoutStatus = {
  ACTIVE: 'Active',
  PROPOSED_TAKEOUT: 'ProposedTakeout',
  TAKEN_OUT: 'TakenOut',
  REJECTED: 'Rejected'
};

const ResponseApprovalStatus = {
  SUBMITTED: 'Submitted',
  REJECTED_BY_ADMIN: 'RejectedByAdmin',
  PENDING_IT_LEAD: 'PendingITLead',
  PENDING_ADMIN_TAKEOUT_DECISION: 'PendingAdminTakeoutDecision',
  APPROVED_FINAL: 'ApprovedFinal'
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
    this.responsesHasApprovalStatus = null;
  }

  async initialize() {
    if (!this.pool) {
      this.pool = await db.getPool();
    }
  }

  async applyCurrentCycleFilter(request, query, surveyId, responseAlias = 'r') {
    if (!surveyId) return query;
    const currentCycle = await publishCycleService.getCurrentCycle(this.pool, surveyId);
    if (!currentCycle?.PublishCycleId) return query;
    if (!request.parameters || !request.parameters.publishCycleId) {
      request.input('publishCycleId', sql.UniqueIdentifier, currentCycle.PublishCycleId);
    }
    return `${query} AND ${responseAlias}.PublishCycleId = @publishCycleId`;
  }

  async hasResponseApprovalStatusColumn() {
    if (typeof this.responsesHasApprovalStatus === 'boolean') {
      return this.responsesHasApprovalStatus;
    }

    const result = await this.pool.request()
      .input('columnName', sql.NVarChar(128), 'ResponseApprovalStatus')
      .query(`
        SELECT COUNT(*) as Cnt
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Responses'
          AND COLUMN_NAME = @columnName
      `);

    this.responsesHasApprovalStatus = Number(result.recordset?.[0]?.Cnt || 0) > 0;
    return this.responsesHasApprovalStatus;
  }

  async getResponseApprovalStatus(executor, responseId) {
    const result = await executor.request()
      .input('responseId', sql.UniqueIdentifier, responseId)
      .query(`
        SELECT ResponseApprovalStatus
        FROM Responses
        WHERE ResponseId = @responseId
      `);

    if (result.recordset.length === 0) {
      throw new NotFoundError(`Response ${responseId} not found`);
    }

    return result.recordset[0].ResponseApprovalStatus || ResponseApprovalStatus.SUBMITTED;
  }

  async updateResponseApprovalStatus(transaction, responseId, status, fields = {}) {
    const request = transaction.request()
      .input('responseId', sql.UniqueIdentifier, responseId)
      .input('status', sql.NVarChar(50), status);

    const updates = ['ResponseApprovalStatus = @status'];

    if (Object.prototype.hasOwnProperty.call(fields, 'adminReviewedBy')) {
      request.input('adminReviewedBy', sql.UniqueIdentifier, fields.adminReviewedBy || null);
      updates.push('AdminReviewedBy = @adminReviewedBy');
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'adminReviewedAt')) {
      request.input('adminReviewedAt', sql.DateTime2, fields.adminReviewedAt || null);
      updates.push('AdminReviewedAt = @adminReviewedAt');
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'adminReviewReason')) {
      request.input('adminReviewReason', sql.NVarChar(sql.MAX), fields.adminReviewReason || null);
      updates.push('AdminReviewReason = @adminReviewReason');
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'itLeadReviewedBy')) {
      request.input('itLeadReviewedBy', sql.UniqueIdentifier, fields.itLeadReviewedBy || null);
      updates.push('ITLeadReviewedBy = @itLeadReviewedBy');
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'itLeadReviewedAt')) {
      request.input('itLeadReviewedAt', sql.DateTime2, fields.itLeadReviewedAt || null);
      updates.push('ITLeadReviewedAt = @itLeadReviewedAt');
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'itLeadReviewReason')) {
      request.input('itLeadReviewReason', sql.NVarChar(sql.MAX), fields.itLeadReviewReason || null);
      updates.push('ITLeadReviewReason = @itLeadReviewReason');
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'finalizedAt')) {
      request.input('finalizedAt', sql.DateTime2, fields.finalizedAt || null);
      updates.push('FinalizedAt = @finalizedAt');
    }

    await request.query(`
      UPDATE Responses
      SET ${updates.join(', ')}
      WHERE ResponseId = @responseId
    `);
  }

  async finalizeResponseIfReady(transaction, responseId, adminUserId, reason = null) {
    const remaining = await transaction.request()
      .input('responseId', sql.UniqueIdentifier, responseId)
      .input('pendingStatus', sql.NVarChar(50), TakeoutStatus.PROPOSED_TAKEOUT)
      .query(`
        SELECT COUNT(*) AS PendingCount
        FROM QuestionResponses
        WHERE ResponseId = @responseId
          AND TakeoutStatus = @pendingStatus
      `);

    const pendingCount = Number(remaining.recordset?.[0]?.PendingCount || 0);
    if (pendingCount > 0) {
      return false;
    }

    await this.updateResponseApprovalStatus(transaction, responseId, ResponseApprovalStatus.APPROVED_FINAL, {
      adminReviewedBy: adminUserId || null,
      adminReviewedAt: new Date(),
      adminReviewReason: reason || null,
      finalizedAt: new Date()
    });
    return true;
  }

  async proposeTakeoutForQuestion(request) {
    await this.initialize();
    const { responseId, questionId, reason, proposedBy } = request;

    if (!responseId || !questionId || !reason || !proposedBy) {
      throw new ValidationError('ResponseId, QuestionId, Reason, and ProposedBy are required');
    }

    try {
      const hasApprovalStatus = await this.hasResponseApprovalStatusColumn();
      const transaction = new sql.Transaction(this.pool);
      await transaction.begin();

      try {
        if (hasApprovalStatus) {
          const responseStatus = await this.getResponseApprovalStatus(transaction, responseId);
          if (![ResponseApprovalStatus.PENDING_IT_LEAD, ResponseApprovalStatus.PENDING_ADMIN_TAKEOUT_DECISION].includes(responseStatus)) {
            throw new ValidationError('Response belum berada di tahap review IT Lead');
          }
        }

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
          .input('status', sql.NVarChar, TakeoutStatus.PROPOSED_TAKEOUT)
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
          .input('newStatus', sql.NVarChar, TakeoutStatus.PROPOSED_TAKEOUT)
          .query(`
            INSERT INTO ApprovalHistory (QuestionResponseId, Action, PerformedBy, Reason, PreviousStatus, NewStatus)
            VALUES (@questionResponseId, @action, @performedBy, @reason, @previousStatus, @newStatus)
          `);

        if (hasApprovalStatus) {
          await this.updateResponseApprovalStatus(
            transaction,
            responseId,
            ResponseApprovalStatus.PENDING_ADMIN_TAKEOUT_DECISION,
            {
              itLeadReviewedBy: proposedBy,
              itLeadReviewedAt: new Date(),
              itLeadReviewReason: reason,
              finalizedAt: null
            }
          );
        }

        await transaction.commit();
        logger.info(`Takeout proposed for question response: ${questionResponse.QuestionResponseId}`);

        return {
          success: true,
          questionResponseId: questionResponse.QuestionResponseId,
          status: TakeoutStatus.PROPOSED_TAKEOUT
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
      const hasApprovalStatus = await this.hasResponseApprovalStatusColumn();
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

        if (previousStatus !== TakeoutStatus.PROPOSED_TAKEOUT) {
          throw new ValidationError('Can only cancel proposed takeouts');
        }

        await transaction.request()
          .input('responseId', sql.UniqueIdentifier, responseId)
          .input('questionId', sql.UniqueIdentifier, questionId)
          .input('status', sql.NVarChar, TakeoutStatus.ACTIVE)
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
          .input('newStatus', sql.NVarChar, TakeoutStatus.ACTIVE)
          .query(`
            INSERT INTO ApprovalHistory (QuestionResponseId, Action, PerformedBy, Reason, PreviousStatus, NewStatus)
            VALUES (@questionResponseId, @action, @performedBy, NULL, @previousStatus, @newStatus)
          `);

        if (hasApprovalStatus) {
          const remaining = await transaction.request()
            .input('responseId', sql.UniqueIdentifier, responseId)
            .input('pendingStatus', sql.NVarChar(50), TakeoutStatus.PROPOSED_TAKEOUT)
            .query(`
              SELECT COUNT(*) AS PendingCount
              FROM QuestionResponses
              WHERE ResponseId = @responseId
                AND TakeoutStatus = @pendingStatus
            `);

          if (Number(remaining.recordset?.[0]?.PendingCount || 0) === 0) {
            await this.updateResponseApprovalStatus(
              transaction,
              responseId,
              ResponseApprovalStatus.PENDING_IT_LEAD,
              {
                itLeadReviewedBy: null,
                itLeadReviewedAt: null,
                itLeadReviewReason: null,
                finalizedAt: null
              }
            );
          }
        }

        await transaction.commit();
        logger.info(`Proposed takeout cancelled for question response: ${questionResponse.QuestionResponseId}`);

        return {
          success: true,
          questionResponseId: questionResponse.QuestionResponseId,
          status: TakeoutStatus.ACTIVE
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

  async approveInitialResponses(responseIds, approvedBy, reason = null) {
    await this.initialize();
    if (!Array.isArray(responseIds) || responseIds.length === 0 || !approvedBy) {
      throw new ValidationError('ResponseIds and ApprovedBy are required');
    }

    const hasApprovalStatus = await this.hasResponseApprovalStatusColumn();
    if (!hasApprovalStatus) {
      throw new ValidationError('Schema approval response belum siap. Jalankan migration terbaru terlebih dahulu.');
    }

    const transaction = new sql.Transaction(this.pool);
    await transaction.begin();
    try {
      const now = new Date();
      const results = [];
      for (const responseId of responseIds) {
        const checkResult = await transaction.request()
          .input('responseId', sql.UniqueIdentifier, responseId)
          .query(`
            SELECT ResponseId, ResponseApprovalStatus
            FROM Responses
            WHERE ResponseId = @responseId
          `);

        if (checkResult.recordset.length === 0) {
          throw new NotFoundError(`Response ${responseId} not found`);
        }

        const currentStatus = checkResult.recordset[0].ResponseApprovalStatus || ResponseApprovalStatus.SUBMITTED;
        if (currentStatus !== ResponseApprovalStatus.SUBMITTED) {
          throw new ValidationError(`Response ${responseId} sudah diproses sebelumnya`);
        }

        await transaction.request()
          .input('responseId', sql.UniqueIdentifier, responseId)
          .input('status', sql.NVarChar, ResponseApprovalStatus.PENDING_IT_LEAD)
          .input('adminReviewedBy', sql.UniqueIdentifier, approvedBy)
          .input('adminReviewedAt', sql.DateTime2, now)
          .input('adminReviewReason', sql.NVarChar(sql.MAX), reason)
          .query(`
            UPDATE Responses
            SET ResponseApprovalStatus = @status,
                AdminReviewedBy = @adminReviewedBy,
                AdminReviewedAt = @adminReviewedAt,
                AdminReviewReason = @adminReviewReason
            WHERE ResponseId = @responseId
          `);

        results.push({ responseId, status: ResponseApprovalStatus.PENDING_IT_LEAD });
      }

      await transaction.commit();
      return { success: true, updated: results };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async rejectInitialResponses(responseIds, rejectedBy, reason) {
    await this.initialize();
    if (!Array.isArray(responseIds) || responseIds.length === 0 || !rejectedBy || !reason) {
      throw new ValidationError('ResponseIds, RejectedBy, and Reason are required');
    }

    const hasApprovalStatus = await this.hasResponseApprovalStatusColumn();
    if (!hasApprovalStatus) {
      throw new ValidationError('Schema approval response belum siap. Jalankan migration terbaru terlebih dahulu.');
    }

    const transaction = new sql.Transaction(this.pool);
    await transaction.begin();
    try {
      const now = new Date();
      const results = [];
      for (const responseId of responseIds) {
        const checkResult = await transaction.request()
          .input('responseId', sql.UniqueIdentifier, responseId)
          .query(`
            SELECT ResponseId, ResponseApprovalStatus
            FROM Responses
            WHERE ResponseId = @responseId
          `);

        if (checkResult.recordset.length === 0) {
          throw new NotFoundError(`Response ${responseId} not found`);
        }

        const currentStatus = checkResult.recordset[0].ResponseApprovalStatus || ResponseApprovalStatus.SUBMITTED;
        if (currentStatus !== ResponseApprovalStatus.SUBMITTED) {
          throw new ValidationError(`Response ${responseId} sudah diproses sebelumnya`);
        }

        await transaction.request()
          .input('responseId', sql.UniqueIdentifier, responseId)
          .input('status', sql.NVarChar, ResponseApprovalStatus.REJECTED_BY_ADMIN)
          .input('adminReviewedBy', sql.UniqueIdentifier, rejectedBy)
          .input('adminReviewedAt', sql.DateTime2, now)
          .input('adminReviewReason', sql.NVarChar(sql.MAX), reason)
          .query(`
            UPDATE Responses
            SET ResponseApprovalStatus = @status,
                AdminReviewedBy = @adminReviewedBy,
                AdminReviewedAt = @adminReviewedAt,
                AdminReviewReason = @adminReviewReason
            WHERE ResponseId = @responseId
          `);

        results.push({ responseId, status: ResponseApprovalStatus.REJECTED_BY_ADMIN });
      }

      await transaction.commit();
      return { success: true, updated: results };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async approveFinalResponses(responseIds, approvedBy, reason = null) {
    await this.initialize();
    if (!Array.isArray(responseIds) || responseIds.length === 0 || !approvedBy) {
      throw new ValidationError('ResponseIds and ApprovedBy are required');
    }

    const hasApprovalStatus = await this.hasResponseApprovalStatusColumn();
    if (!hasApprovalStatus) {
      throw new ValidationError('Schema approval response belum siap. Jalankan migration terbaru terlebih dahulu.');
    }

    const transaction = new sql.Transaction(this.pool);
    await transaction.begin();
    try {
      const now = new Date();
      const results = [];

      for (const responseId of responseIds) {
        const checkResult = await transaction.request()
          .input('responseId', sql.UniqueIdentifier, responseId)
          .query(`
            SELECT ResponseId, ResponseApprovalStatus
            FROM Responses
            WHERE ResponseId = @responseId
          `);

        if (checkResult.recordset.length === 0) {
          throw new NotFoundError(`Response ${responseId} not found`);
        }

        const currentStatus = checkResult.recordset[0].ResponseApprovalStatus || ResponseApprovalStatus.SUBMITTED;
        if (currentStatus !== ResponseApprovalStatus.PENDING_IT_LEAD) {
          throw new ValidationError(`Response ${responseId} belum siap untuk approval final IT Lead`);
        }

        await this.updateResponseApprovalStatus(
          transaction,
          responseId,
          ResponseApprovalStatus.APPROVED_FINAL,
          {
            itLeadReviewedBy: approvedBy,
            itLeadReviewedAt: now,
            itLeadReviewReason: reason || null,
            finalizedAt: now
          }
        );

        results.push({ responseId, status: ResponseApprovalStatus.APPROVED_FINAL });
      }

      await transaction.commit();
      return { success: true, updated: results };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async getRespondents(filter = {}) {
    await this.initialize();
    const { surveyId, duplicateFilter = 'all', applicationId, departmentId } = filter;
    if (!surveyId) {
      throw new ValidationError('SurveyId is required');
    }
    try {
      const hasApprovalStatus = await this.hasResponseApprovalStatusColumn();
      let query = `
        SELECT r.ResponseId, r.RespondentEmail, r.RespondentName, r.ApplicationId,
               a.Name as ApplicationName, r.DepartmentId, d.Name as DepartmentName,
               r.SubmittedAt,
               ${hasApprovalStatus ? 'r.ResponseApprovalStatus,' : `'Submitted' as ResponseApprovalStatus,`}
               COUNT(*) OVER (PARTITION BY r.RespondentEmail, r.ApplicationId) as DuplicateCount
        FROM Responses r
        INNER JOIN Applications a ON r.ApplicationId = a.ApplicationId
        INNER JOIN Departments d ON r.DepartmentId = d.DepartmentId
        WHERE r.SurveyId = @surveyId
      `;
      const request = this.pool.request();
      request.input('surveyId', sql.UniqueIdentifier, surveyId);
      query = await this.applyCurrentCycleFilter(request, query, surveyId);
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
      const hasApprovalStatus = await this.hasResponseApprovalStatusColumn();
      const transaction = new sql.Transaction(this.pool);
      await transaction.begin();
      try {
        if (hasApprovalStatus) {
          const responseStatus = await this.getResponseApprovalStatus(transaction, responseId);
          if (responseStatus !== ResponseApprovalStatus.PENDING_ADMIN_TAKEOUT_DECISION) {
            throw new ValidationError('Response belum berada di tahap keputusan takeout Admin Event');
          }
        }

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
        if (previousStatus !== TakeoutStatus.PROPOSED_TAKEOUT) {
          throw new ValidationError('Can only approve proposed takeouts');
        }
        await transaction.request()
          .input('responseId', sql.UniqueIdentifier, responseId)
          .input('questionId', sql.UniqueIdentifier, questionId)
          .input('status', sql.NVarChar, TakeoutStatus.TAKEN_OUT)
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
          .input('newStatus', sql.NVarChar, TakeoutStatus.TAKEN_OUT)
          .query(`INSERT INTO ApprovalHistory (QuestionResponseId, Action, PerformedBy, Reason, PreviousStatus, NewStatus)
                  VALUES (@questionResponseId, @action, @performedBy, @reason, @previousStatus, @newStatus)`);

        if (hasApprovalStatus) {
          await this.finalizeResponseIfReady(transaction, responseId, approvedBy, reason || null);
        }

        await transaction.commit();
        return { success: true, questionResponseId: questionResponse.QuestionResponseId, status: TakeoutStatus.TAKEN_OUT };
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
      const hasApprovalStatus = await this.hasResponseApprovalStatusColumn();
      const transaction = new sql.Transaction(this.pool);
      await transaction.begin();
      try {
        if (hasApprovalStatus) {
          const responseStatus = await this.getResponseApprovalStatus(transaction, responseId);
          if (responseStatus !== ResponseApprovalStatus.PENDING_ADMIN_TAKEOUT_DECISION) {
            throw new ValidationError('Response belum berada di tahap keputusan takeout Admin Event');
          }
        }

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
        if (previousStatus !== TakeoutStatus.PROPOSED_TAKEOUT) {
          throw new ValidationError('Can only reject proposed takeouts');
        }
        await transaction.request()
          .input('responseId', sql.UniqueIdentifier, responseId)
          .input('questionId', sql.UniqueIdentifier, questionId)
          .input('status', sql.NVarChar, TakeoutStatus.ACTIVE)
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
          .input('newStatus', sql.NVarChar, TakeoutStatus.ACTIVE)
          .query(`INSERT INTO ApprovalHistory (QuestionResponseId, Action, PerformedBy, Reason, PreviousStatus, NewStatus)
                  VALUES (@questionResponseId, @action, @performedBy, @reason, @previousStatus, @newStatus)`);

        if (hasApprovalStatus) {
          await this.finalizeResponseIfReady(transaction, responseId, rejectedBy, reason);
        }

        await transaction.commit();
        return { success: true, questionResponseId: questionResponse.QuestionResponseId, status: TakeoutStatus.ACTIVE };
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
      const hasApprovalStatus = await this.hasResponseApprovalStatusColumn();
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
        WHERE f.ITDeptHeadUserId = @itLeadUserId
      `;
      const request = this.pool.request();
      request.input('itLeadUserId', sql.UniqueIdentifier, itLeadUserId);
      if (hasApprovalStatus) {
        query += ' AND r.ResponseApprovalStatus = @responseApprovalStatus';
        request.input('responseApprovalStatus', sql.NVarChar(50), ResponseApprovalStatus.PENDING_IT_LEAD);
      }
      if (filter.surveyId) {
        query += ' AND q.SurveyId = @surveyId';
        request.input('surveyId', sql.UniqueIdentifier, filter.surveyId);
        query = await this.applyCurrentCycleFilter(request, query, filter.surveyId);
      }
      if (filter.functionId) {
        query += ' AND f.FunctionId = @functionId';
        request.input('functionId', sql.UniqueIdentifier, filter.functionId);
      }
      query += ' ORDER BY r.SubmittedAt DESC, q.DisplayOrder ASC';
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
      const hasApprovalStatus = await this.hasResponseApprovalStatusColumn();
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
      if (hasApprovalStatus) {
        query += ' AND r.ResponseApprovalStatus = @responseApprovalStatus';
        request.input('responseApprovalStatus', sql.NVarChar(50), ResponseApprovalStatus.PENDING_ADMIN_TAKEOUT_DECISION);
      }
      if (filter.surveyId) {
        query += ' AND s.SurveyId = @surveyId';
        request.input('surveyId', sql.UniqueIdentifier, filter.surveyId);
        query = await this.applyCurrentCycleFilter(request, query, filter.surveyId);
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
        request.input('status', sql.NVarChar, TakeoutStatus.PROPOSED_TAKEOUT);
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

  async getCommentsForSelection(filter = {}) {
    await this.initialize();
    try {
      const hasApprovalStatus = await this.hasResponseApprovalStatusColumn();
      let query = `
        SELECT qr.QuestionResponseId, qr.ResponseId, qr.QuestionId, qr.CommentValue, qr.NumericValue,
               qr.IsBestComment, q.PromptText as QuestionText, q.DisplayOrder as QuestionOrder,
               r.RespondentEmail, r.RespondentName, r.SubmittedAt,
               a.ApplicationId, a.Name as ApplicationName,
               d.DepartmentId, d.Name as DepartmentName,
               s.SurveyId, s.Title as SurveyTitle,
               f.FunctionId, f.Name as FunctionName
        FROM QuestionResponses qr
        INNER JOIN Questions q ON qr.QuestionId = q.QuestionId
        INNER JOIN Surveys s ON q.SurveyId = s.SurveyId
        INNER JOIN Responses r ON qr.ResponseId = r.ResponseId
        INNER JOIN Applications a ON r.ApplicationId = a.ApplicationId
        INNER JOIN Departments d ON r.DepartmentId = d.DepartmentId
        LEFT JOIN FunctionApplicationMappings fam ON a.ApplicationId = fam.ApplicationId
        LEFT JOIN Functions f ON fam.FunctionId = f.FunctionId
        WHERE qr.CommentValue IS NOT NULL
          AND LTRIM(RTRIM(qr.CommentValue)) <> ''
      `;

      const request = this.pool.request();
      if (hasApprovalStatus) {
        query += ' AND r.ResponseApprovalStatus = @responseApprovalStatus';
        request.input('responseApprovalStatus', sql.NVarChar(50), ResponseApprovalStatus.APPROVED_FINAL);
      }
      if (filter.surveyId) {
        query += ' AND s.SurveyId = @surveyId';
        request.input('surveyId', sql.UniqueIdentifier, filter.surveyId);
        query = await this.applyCurrentCycleFilter(request, query, filter.surveyId);
      }
      if (filter.functionId) {
        query += ' AND f.FunctionId = @functionId';
        request.input('functionId', sql.UniqueIdentifier, filter.functionId);
      }
      if (filter.departmentId) {
        query += ' AND d.DepartmentId = @departmentId';
        request.input('departmentId', sql.UniqueIdentifier, filter.departmentId);
      }
      if (filter.applicationId) {
        query += ' AND a.ApplicationId = @applicationId';
        request.input('applicationId', sql.UniqueIdentifier, filter.applicationId);
      }

      query += ' ORDER BY r.SubmittedAt DESC, q.DisplayOrder ASC';
      const result = await request.query(query);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting comments for selection:', error);
      throw error;
    }
  }

  async getBestComments(filter = {}) {
    await this.initialize();
    try {
      const hasApprovalStatus = await this.hasResponseApprovalStatusColumn();
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
      if (hasApprovalStatus) {
        query += ' AND r.ResponseApprovalStatus = @responseApprovalStatus';
        request.input('responseApprovalStatus', sql.NVarChar(50), ResponseApprovalStatus.APPROVED_FINAL);
      }
      if (filter.surveyId) {
        query += ' AND s.SurveyId = @surveyId';
        request.input('surveyId', sql.UniqueIdentifier, filter.surveyId);
        query = await this.applyCurrentCycleFilter(request, query, filter.surveyId);
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
    let { questionResponseId } = feedback;
    const { responseId, questionId, itLeadUserId, feedbackText } = feedback;
    if (!itLeadUserId || !feedbackText) {
      throw new ValidationError('ITLeadUserId and FeedbackText are required');
    }

    if (!questionResponseId && responseId && questionId) {
      const resolved = await this.pool.request()
        .input('responseId', sql.UniqueIdentifier, responseId)
        .input('questionId', sql.UniqueIdentifier, questionId)
        .query(`
          SELECT TOP 1 QuestionResponseId
          FROM QuestionResponses
          WHERE ResponseId = @responseId
            AND QuestionId = @questionId
        `);
      questionResponseId = resolved.recordset?.[0]?.QuestionResponseId || null;
    }

    if (!questionResponseId) {
      throw new ValidationError('QuestionResponseId is required');
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
      const hasApprovalStatus = await this.hasResponseApprovalStatusColumn();
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
      if (hasApprovalStatus) {
        query += ' AND r.ResponseApprovalStatus = @responseApprovalStatus';
        request.input('responseApprovalStatus', sql.NVarChar(50), ResponseApprovalStatus.APPROVED_FINAL);
      }
      if (filter.surveyId) {
        query += ' AND s.SurveyId = @surveyId';
        request.input('surveyId', sql.UniqueIdentifier, filter.surveyId);
        query = await this.applyCurrentCycleFilter(request, query, filter.surveyId);
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
      const hasApprovalStatus = await this.hasResponseApprovalStatusColumn();
      let query = `
        SELECT qr.TakeoutStatus, COUNT(*) as Count, q.QuestionId, q.PromptText as QuestionText
        FROM QuestionResponses qr
        INNER JOIN Questions q ON qr.QuestionId = q.QuestionId
        INNER JOIN Responses r ON qr.ResponseId = r.ResponseId
        WHERE q.SurveyId = @surveyId
      `;
      const request = this.pool.request();
      request.input('surveyId', sql.UniqueIdentifier, surveyId);
      query = await this.applyCurrentCycleFilter(request, query, surveyId);
      if (hasApprovalStatus) {
        query += ' AND r.ResponseApprovalStatus = @responseApprovalStatus';
        request.input('responseApprovalStatus', sql.NVarChar(50), ResponseApprovalStatus.APPROVED_FINAL);
      }
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
        if (row.TakeoutStatus === TakeoutStatus.ACTIVE) stats.active = row.Count;
        else if (row.TakeoutStatus === TakeoutStatus.PROPOSED_TAKEOUT) stats.proposedTakeout = row.Count;
        else if (row.TakeoutStatus === TakeoutStatus.TAKEN_OUT) stats.takenOut = row.Count;
        else if (row.TakeoutStatus === TakeoutStatus.REJECTED) stats.rejected = row.Count;
      });
      const overallQuery = await this.applyCurrentCycleFilter(request, `
        SELECT qr.TakeoutStatus, COUNT(*) as Count
        FROM QuestionResponses qr
        INNER JOIN Questions q ON qr.QuestionId = q.QuestionId
        INNER JOIN Responses r ON qr.ResponseId = r.ResponseId
        WHERE q.SurveyId = @surveyId
        ${options.questionId ? 'AND q.QuestionId = @questionId' : ''}
        ${options.applicationId ? 'AND r.ApplicationId = @applicationId' : ''}
        ${options.departmentId ? 'AND r.DepartmentId = @departmentId' : ''}
        GROUP BY qr.TakeoutStatus
      `, surveyId);
      const overallResult = await request.query(overallQuery);
      const overall = { active: 0, proposedTakeout: 0, takenOut: 0, rejected: 0, total: 0 };
      overallResult.recordset.forEach(row => {
        overall.total += row.Count;
        if (row.TakeoutStatus === TakeoutStatus.ACTIVE) overall.active = row.Count;
        else if (row.TakeoutStatus === TakeoutStatus.PROPOSED_TAKEOUT) overall.proposedTakeout = row.Count;
        else if (row.TakeoutStatus === TakeoutStatus.TAKEN_OUT) overall.takenOut = row.Count;
        else if (row.TakeoutStatus === TakeoutStatus.REJECTED) overall.rejected = row.Count;
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
module.exports.TakeoutStatus = TakeoutStatus;
module.exports.ResponseApprovalStatus = ResponseApprovalStatus;
module.exports.ApprovalAction = ApprovalAction;
module.exports.ValidationError = ValidationError;
module.exports.NotFoundError = NotFoundError;
module.exports.UnauthorizedError = UnauthorizedError;


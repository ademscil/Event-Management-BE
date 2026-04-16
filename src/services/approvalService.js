const sql = require('../database/sql-client');
/**
 * Approval Service
 * Handles approval workflow for survey responses
 */


  
const db = require('../database/connection');
const logger = require('../config/logger');
const publishCycleService = require('./publishCycleService');
const {
  ApprovalAction,
  NotFoundError,
  ResponseApprovalStatus,
  TakeoutStatus,
  UnauthorizedError,
  ValidationError
} = require('./approval-service/constants');
const {
  applyCurrentCycleFilter,
  assertAdminEventCanAccessResponse,
  assertAdminEventCanAccessSurvey,
  assertITLeadCanAccessResponse,
  finalizeResponseIfReady,
  getResponseApprovalStatus,
  getResponseRoutingRequirement,
  updateResponseApprovalStatus
} = require('./approval-service/workflow');
const {
  getBestCommentFeedback,
  markAsBestComment,
  submitBestCommentFeedback,
  unmarkBestComment
} = require('./approval-service/best-comments');
const {
  getBestComments,
  getBestCommentsWithFeedback,
  getCommentsForSelection
} = require('./approval-service/comments');
const {
  approveProposedTakeout: approveProposedTakeoutHelper,
  bulkTakeoutAction,
  cancelProposedTakeoutForQuestion: cancelProposedTakeoutForQuestionHelper,
  proposeTakeoutForQuestion: proposeTakeoutForQuestionHelper,
  rejectProposedTakeout: rejectProposedTakeoutHelper
} = require('./approval-service/takeout-actions');
const {
  resolveSurveyIdentifier
} = require('./survey-service/read-model');

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
    return applyCurrentCycleFilter(this.pool, request, query, surveyId, responseAlias);
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
    return getResponseApprovalStatus(executor, responseId);
  }

  async getResponseRoutingRequirement(executor, responseId) {
    return getResponseRoutingRequirement(executor, responseId);
  }

  async updateResponseApprovalStatus(transaction, responseId, status, fields = {}) {
    return updateResponseApprovalStatus(transaction, responseId, status, fields);
  }

  async assertAdminEventCanAccessSurvey(executor, surveyId, adminUserId) {
    return assertAdminEventCanAccessSurvey(executor, surveyId, adminUserId);
  }

  async assertAdminEventCanAccessResponse(executor, responseId, adminUserId) {
    return assertAdminEventCanAccessResponse(executor, responseId, adminUserId);
  }

  async assertITLeadCanAccessResponse(executor, responseId, itLeadUserId) {
    return assertITLeadCanAccessResponse(executor, responseId, itLeadUserId);
  }

  async finalizeResponseIfReady(transaction, responseId, adminUserId, reason = null) {
    return finalizeResponseIfReady(transaction, responseId, adminUserId, reason);
  }

  async proposeTakeoutForQuestion(request) {
    await this.initialize();
    try {
      const result = await proposeTakeoutForQuestionHelper({
        ApprovalAction,
        ResponseApprovalStatus,
        TakeoutStatus,
        ValidationError,
        NotFoundError,
        hasResponseApprovalStatusColumn: this.hasResponseApprovalStatusColumn.bind(this),
        assertITLeadCanAccessResponse: this.assertITLeadCanAccessResponse.bind(this),
        getResponseApprovalStatus: this.getResponseApprovalStatus.bind(this),
        updateResponseApprovalStatus: this.updateResponseApprovalStatus.bind(this),
        pool: this.pool,
        sql
      }, request);
      logger.info(`Takeout proposed for question response: ${result.questionResponseId}`);
      return result;
    } catch (error) {
      logger.error('Error proposing takeout for question:', error);
      throw error;
    }
  }

  async cancelProposedTakeoutForQuestion(responseId, questionId, cancelledBy, cancelledByRole = null) {
    await this.initialize();
    try {
      const result = await cancelProposedTakeoutForQuestionHelper({
        ApprovalAction,
        ResponseApprovalStatus,
        TakeoutStatus,
        ValidationError,
        NotFoundError,
        hasResponseApprovalStatusColumn: this.hasResponseApprovalStatusColumn.bind(this),
        assertITLeadCanAccessResponse: this.assertITLeadCanAccessResponse.bind(this),
        updateResponseApprovalStatus: this.updateResponseApprovalStatus.bind(this),
        pool: this.pool,
        sql
      }, responseId, questionId, cancelledBy, cancelledByRole);
      logger.info(`Proposed takeout cancelled for question response: ${result.questionResponseId}`);
      return result;
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
    const items = responseIds.flatMap((responseId) => questionIds.map((questionId) => ({ responseId, questionId })));
    return bulkTakeoutAction(items, ({ responseId, questionId }) =>
      this.proposeTakeoutForQuestion({ responseId, questionId, reason, proposedBy })
    );
  }

  async approveInitialResponses(responseIds, approvedBy, reason = null, approvedByRole = null) {
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
        if (approvedByRole === 'AdminEvent') {
          await this.assertAdminEventCanAccessResponse(transaction, responseId, approvedBy);
        }

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

        const routing = await this.getResponseRoutingRequirement(transaction, responseId);
        const nextStatus = routing.requiresITLead
          ? ResponseApprovalStatus.PENDING_IT_LEAD
          : ResponseApprovalStatus.APPROVED_FINAL;

        await transaction.request()
          .input('responseId', sql.UniqueIdentifier, responseId)
          .input('status', sql.NVarChar, nextStatus)
          .input('adminReviewedBy', sql.UniqueIdentifier, approvedBy)
          .input('adminReviewedAt', sql.DateTime2, now)
          .input('adminReviewReason', sql.NVarChar(sql.MAX), reason)
          .input('finalizedAt', sql.DateTime2, nextStatus === ResponseApprovalStatus.APPROVED_FINAL ? now : null)
          .query(`
            UPDATE Responses
            SET ResponseApprovalStatus = @status,
                AdminReviewedBy = @adminReviewedBy,
                AdminReviewedAt = @adminReviewedAt,
                AdminReviewReason = @adminReviewReason,
                FinalizedAt = @finalizedAt
            WHERE ResponseId = @responseId
          `);

        results.push({
          responseId,
          surveyId: routing.surveyId,
          status: nextStatus,
          requiresITLead: routing.requiresITLead,
        });
      }

      await transaction.commit();
      return {
        success: true,
        updated: results,
        summary: {
          sentToITLead: results.filter((item) => item.status === ResponseApprovalStatus.PENDING_IT_LEAD).length,
          finalizedByAdmin: results.filter((item) => item.status === ResponseApprovalStatus.APPROVED_FINAL).length,
        },
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async rejectInitialResponses(responseIds, rejectedBy, reason, rejectedByRole = null) {
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
        if (rejectedByRole === 'AdminEvent') {
          await this.assertAdminEventCanAccessResponse(transaction, responseId, rejectedBy);
        }

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

  async approveFinalResponses(responseIds, approvedBy, reason = null, approvedByRole = null) {
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
        if (approvedByRole === 'ITLead') {
          await this.assertITLeadCanAccessResponse(transaction, responseId, approvedBy);
        }

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
    const { surveyId, duplicateFilter = 'all', applicationId, departmentId, requesterUserId, requesterRole } = filter;
    if (!surveyId) {
      throw new ValidationError('SurveyId is required');
    }
    try {
      const resolvedSurveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, surveyId);
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
      request.input('surveyId', sql.UniqueIdentifier, resolvedSurveyId);
      if (requesterRole === 'AdminEvent' && requesterUserId) {
        await this.assertAdminEventCanAccessSurvey(this.pool, resolvedSurveyId, requesterUserId);
      }
      query = await this.applyCurrentCycleFilter(request, query, resolvedSurveyId);
      if (hasApprovalStatus) {
        query += ' AND r.ResponseApprovalStatus = @responseApprovalStatus';
        request.input('responseApprovalStatus', sql.NVarChar(50), ResponseApprovalStatus.SUBMITTED);
      }
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

  async approveProposedTakeout(responseId, questionId, approvedBy, reason = null, approvedByRole = null) {
    await this.initialize();
    try {
      return await approveProposedTakeoutHelper({
        ApprovalAction,
        ResponseApprovalStatus,
        TakeoutStatus,
        ValidationError,
        NotFoundError,
        hasResponseApprovalStatusColumn: this.hasResponseApprovalStatusColumn.bind(this),
        assertAdminEventCanAccessResponse: this.assertAdminEventCanAccessResponse.bind(this),
        getResponseApprovalStatus: this.getResponseApprovalStatus.bind(this),
        finalizeResponseIfReady: this.finalizeResponseIfReady.bind(this),
        pool: this.pool,
        sql
      }, responseId, questionId, approvedBy, reason, approvedByRole);
    } catch (error) {
      logger.error('Error approving proposed takeout:', error);
      throw error;
    }
  }

  async rejectProposedTakeout(responseId, questionId, rejectedBy, reason, rejectedByRole = null) {
    await this.initialize();
    try {
      return await rejectProposedTakeoutHelper({
        ApprovalAction,
        ResponseApprovalStatus,
        TakeoutStatus,
        ValidationError,
        NotFoundError,
        hasResponseApprovalStatusColumn: this.hasResponseApprovalStatusColumn.bind(this),
        assertAdminEventCanAccessResponse: this.assertAdminEventCanAccessResponse.bind(this),
        getResponseApprovalStatus: this.getResponseApprovalStatus.bind(this),
        finalizeResponseIfReady: this.finalizeResponseIfReady.bind(this),
        pool: this.pool,
        sql
      }, responseId, questionId, rejectedBy, reason, rejectedByRole);
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
    const items = responseIds.flatMap((responseId) => questionIds.map((questionId) => ({ responseId, questionId })));
    return bulkTakeoutAction(items, ({ responseId, questionId }) =>
      this.approveProposedTakeout(responseId, questionId, approvedBy, reason)
    );
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
    const items = responseIds.flatMap((responseId) => questionIds.map((questionId) => ({ responseId, questionId })));
    return bulkTakeoutAction(items, ({ responseId, questionId }) =>
      this.rejectProposedTakeout(responseId, questionId, rejectedBy, reason)
    );
  }

  async getPendingApprovalsForITLead(itLeadUserId, filter = {}) {
    await this.initialize();
    if (!itLeadUserId) {
      throw new ValidationError('ITLeadUserId is required');
    }
    try {
      const hasApprovalStatus = await this.hasResponseApprovalStatusColumn();
      const functionFilterExists = filter.functionId
        ? ` AND EXISTS (
              SELECT 1
              FROM FunctionApplicationMappings famFilter
              INNER JOIN Functions fFilter ON famFilter.FunctionId = fFilter.FunctionId
              WHERE famFilter.ApplicationId = r.ApplicationId
                AND fFilter.ITLeadUserId = @itLeadUserId
                AND fFilter.FunctionId = @functionId
            )`
        : '';
      let query = `
        SELECT qr.QuestionResponseId, qr.ResponseId, qr.QuestionId, qr.TextValue, qr.NumericValue,
               qr.CommentValue, qr.TakeoutStatus, qr.TakeoutReason, qr.ProposedAt,
               q.PromptText as QuestionText, r.RespondentEmail, r.RespondentName,
               a.Name as ApplicationName, d.Name as DepartmentName,
               functionInfo.FunctionId, functionInfo.FunctionName,
               proposer.DisplayName as ProposedByName
        FROM QuestionResponses qr
        INNER JOIN Questions q ON qr.QuestionId = q.QuestionId
        INNER JOIN Responses r ON qr.ResponseId = r.ResponseId
        INNER JOIN Applications a ON r.ApplicationId = a.ApplicationId
        INNER JOIN Departments d ON r.DepartmentId = d.DepartmentId
        OUTER APPLY (
          SELECT
            MIN(f.FunctionId) AS FunctionId,
            STUFF((
              SELECT DISTINCT '; ' + f2.Name
              FROM FunctionApplicationMappings fam2
              INNER JOIN Functions f2 ON fam2.FunctionId = f2.FunctionId
              WHERE fam2.ApplicationId = a.ApplicationId
                AND f2.ITLeadUserId = @itLeadUserId
                ${filter.functionId ? 'AND f2.FunctionId = @functionId' : ''}
              FOR XML PATH(''), TYPE
            ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS FunctionName
          FROM FunctionApplicationMappings famx
          INNER JOIN Functions f ON famx.FunctionId = f.FunctionId
          WHERE famx.ApplicationId = a.ApplicationId
            AND f.ITLeadUserId = @itLeadUserId
            ${filter.functionId ? 'AND f.FunctionId = @functionId' : ''}
        ) functionInfo
        LEFT JOIN Users proposer ON qr.ProposedBy = proposer.UserId
        WHERE functionInfo.FunctionId IS NOT NULL
          ${functionFilterExists}
      `;
      const request = this.pool.request();
      request.input('itLeadUserId', sql.UniqueIdentifier, itLeadUserId);
      if (hasApprovalStatus) {
        query += ' AND r.ResponseApprovalStatus = @responseApprovalStatus';
        request.input('responseApprovalStatus', sql.NVarChar(50), ResponseApprovalStatus.PENDING_IT_LEAD);
      }
      if (filter.surveyId) {
        const resolvedSurveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, filter.surveyId);
        query += ' AND q.SurveyId = @surveyId';
        request.input('surveyId', sql.UniqueIdentifier, resolvedSurveyId);
        query = await this.applyCurrentCycleFilter(request, query, resolvedSurveyId);
      }
      if (filter.functionId) {
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
      const { requesterUserId, requesterRole } = filter;
      const functionFilterExists = filter.functionId
        ? ` AND EXISTS (
              SELECT 1
              FROM FunctionApplicationMappings famFilter
              WHERE famFilter.ApplicationId = r.ApplicationId
                AND famFilter.FunctionId = @functionId
            )`
        : '';
      let query = `
        SELECT qr.QuestionResponseId, qr.ResponseId, qr.QuestionId, qr.CommentValue,
               qr.TakeoutStatus, qr.TakeoutReason, qr.ProposedAt,
               q.PromptText as QuestionText, r.RespondentEmail, r.RespondentName,
               a.Name as ApplicationName, d.Name as DepartmentName,
               s.SurveyId, s.Title as SurveyTitle,
               functionInfo.FunctionId, functionInfo.FunctionName,
               proposer.DisplayName as ProposedByName
        FROM QuestionResponses qr
        INNER JOIN Questions q ON qr.QuestionId = q.QuestionId
        INNER JOIN Surveys s ON q.SurveyId = s.SurveyId
        INNER JOIN Responses r ON qr.ResponseId = r.ResponseId
        INNER JOIN Applications a ON r.ApplicationId = a.ApplicationId
        INNER JOIN Departments d ON r.DepartmentId = d.DepartmentId
        OUTER APPLY (
          SELECT
            MIN(f.FunctionId) AS FunctionId,
            STUFF((
              SELECT DISTINCT '; ' + f2.Name
              FROM FunctionApplicationMappings fam2
              INNER JOIN Functions f2 ON fam2.FunctionId = f2.FunctionId
              WHERE fam2.ApplicationId = a.ApplicationId
                ${filter.functionId ? 'AND f2.FunctionId = @functionId' : ''}
              FOR XML PATH(''), TYPE
            ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS FunctionName
          FROM FunctionApplicationMappings famx
          INNER JOIN Functions f ON famx.FunctionId = f.FunctionId
          WHERE famx.ApplicationId = a.ApplicationId
            ${filter.functionId ? 'AND f.FunctionId = @functionId' : ''}
        ) functionInfo
        LEFT JOIN Users proposer ON qr.ProposedBy = proposer.UserId
        WHERE 1=1
          AND functionInfo.FunctionId IS NOT NULL
          ${functionFilterExists}
      `;
      const request = this.pool.request();
      if (hasApprovalStatus) {
        query += ' AND r.ResponseApprovalStatus = @responseApprovalStatus';
        request.input('responseApprovalStatus', sql.NVarChar(50), ResponseApprovalStatus.PENDING_ADMIN_TAKEOUT_DECISION);
      }
      if (filter.surveyId) {
        const resolvedSurveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, filter.surveyId);
        if (requesterRole === 'AdminEvent' && requesterUserId) {
          await this.assertAdminEventCanAccessSurvey(this.pool, resolvedSurveyId, requesterUserId);
        }
        query += ' AND s.SurveyId = @surveyId';
        request.input('surveyId', sql.UniqueIdentifier, resolvedSurveyId);
        query = await this.applyCurrentCycleFilter(request, query, resolvedSurveyId);
      }
      if (requesterRole === 'AdminEvent' && requesterUserId) {
        query += ` AND (
          s.AssignedAdminId = @requesterUserId
          OR EXISTS (
            SELECT 1
            FROM SurveyAdminAssignments saa
            WHERE saa.SurveyId = s.SurveyId
              AND saa.AdminUserId = @requesterUserId
          )
        )`;
        request.input('requesterUserId', sql.UniqueIdentifier, requesterUserId);
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
    try {
      return await markAsBestComment(
        this.pool,
        sql,
        { NotFoundError, ValidationError },
        responseId,
        questionId,
        markedBy,
      );
    } catch (error) {
      logger.error('Error marking as best comment:', error);
      throw error;
    }
  }

  async unmarkBestComment(responseId, questionId, unmarkedBy) {
    await this.initialize();
    try {
      return await unmarkBestComment(
        this.pool,
        sql,
        { NotFoundError, ValidationError },
        responseId,
        questionId,
        unmarkedBy,
      );
    } catch (error) {
      logger.error('Error unmarking best comment:', error);
      throw error;
    }
  }

  async getCommentsForSelection(filter = {}) {
    await this.initialize();
    try {
      const normalizedFilter = { ...filter };
      if (normalizedFilter.surveyId) {
        normalizedFilter.surveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, normalizedFilter.surveyId);
      }
      return await getCommentsForSelection(
        this.pool,
        sql,
        ResponseApprovalStatus,
        this.applyCurrentCycleFilter.bind(this),
        this.hasResponseApprovalStatusColumn.bind(this),
        normalizedFilter,
      );
    } catch (error) {
      logger.error('Error getting comments for selection:', error);
      throw error;
    }
  }

  async getBestComments(filter = {}) {
    await this.initialize();
    try {
      const normalizedFilter = { ...filter };
      if (normalizedFilter.surveyId) {
        normalizedFilter.surveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, normalizedFilter.surveyId);
      }
      return await getBestComments(
        this.pool,
        sql,
        ResponseApprovalStatus,
        this.applyCurrentCycleFilter.bind(this),
        this.hasResponseApprovalStatusColumn.bind(this),
        normalizedFilter,
      );
    } catch (error) {
      logger.error('Error getting best comments:', error);
      throw error;
    }
  }

  async submitBestCommentFeedback(feedback) {
    await this.initialize();
    try {
      return await submitBestCommentFeedback(
        this.pool,
        sql,
        { NotFoundError, ValidationError },
        feedback,
      );
    } catch (error) {
      logger.error('Error submitting best comment feedback:', error);
      throw error;
    }
  }

  async getBestCommentFeedback(questionResponseId) {
    await this.initialize();
    try {
      return await getBestCommentFeedback(
        this.pool,
        sql,
        { ValidationError },
        questionResponseId,
      );
    } catch (error) {
      logger.error('Error getting best comment feedback:', error);
      throw error;
    }
  }

  async getBestCommentsWithFeedback(filter = {}) {
    await this.initialize();
    try {
      const normalizedFilter = { ...filter };
      if (normalizedFilter.surveyId) {
        normalizedFilter.surveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, normalizedFilter.surveyId);
      }
      return await getBestCommentsWithFeedback(
        this.pool,
        sql,
        ResponseApprovalStatus,
        this.applyCurrentCycleFilter.bind(this),
        this.hasResponseApprovalStatusColumn.bind(this),
        normalizedFilter,
      );
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
      const resolvedSurveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, surveyId);
      const hasApprovalStatus = await this.hasResponseApprovalStatusColumn();
      let query = `
        SELECT qr.TakeoutStatus, COUNT(*) as Count, q.QuestionId, q.PromptText as QuestionText
        FROM QuestionResponses qr
        INNER JOIN Questions q ON qr.QuestionId = q.QuestionId
        INNER JOIN Responses r ON qr.ResponseId = r.ResponseId
        WHERE q.SurveyId = @surveyId
      `;
      const request = this.pool.request();
      request.input('surveyId', sql.UniqueIdentifier, resolvedSurveyId);
      query = await this.applyCurrentCycleFilter(request, query, resolvedSurveyId);
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
      `, resolvedSurveyId);
      const overallResult = await request.query(overallQuery);
      const overall = { active: 0, proposedTakeout: 0, takenOut: 0, rejected: 0, total: 0 };
      overallResult.recordset.forEach(row => {
        overall.total += row.Count;
        if (row.TakeoutStatus === TakeoutStatus.ACTIVE) overall.active = row.Count;
        else if (row.TakeoutStatus === TakeoutStatus.PROPOSED_TAKEOUT) overall.proposedTakeout = row.Count;
        else if (row.TakeoutStatus === TakeoutStatus.TAKEN_OUT) overall.takenOut = row.Count;
        else if (row.TakeoutStatus === TakeoutStatus.REJECTED) overall.rejected = row.Count;
      });
      return { surveyId: resolvedSurveyId, overall, byQuestion: Object.values(statsByQuestion) };
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



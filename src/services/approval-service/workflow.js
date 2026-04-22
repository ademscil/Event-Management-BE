const sql = require('../../database/sql-client');
const publishCycleService = require('../publishCycleService');
const {
  NotFoundError,
  ResponseApprovalStatus,
  TakeoutStatus,
  UnauthorizedError
} = require('./constants');

async function applyCurrentCycleFilter(pool, request, query, surveyId, responseAlias = 'r') {
  if (!surveyId) return query;
  const currentCycle = await publishCycleService.getCurrentCycle(pool, surveyId);
  if (!currentCycle?.PublishCycleId) return query;
  if (!request.parameters || !request.parameters.publishCycleId) {
    request.input('publishCycleId', sql.UniqueIdentifier, currentCycle.PublishCycleId);
  }
  return `${query} AND ${responseAlias}.PublishCycleId = @publishCycleId`;
}

async function getResponseApprovalStatus(executor, responseId) {
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

async function getResponseRoutingRequirement(executor, responseId) {
  const result = await executor.request()
    .input('responseId', sql.UniqueIdentifier, responseId)
    .query(`
      SELECT
        r.ResponseId,
        r.SurveyId,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM Questions q
            WHERE q.SurveyId = r.SurveyId
              AND (
                LOWER(CAST(ISNULL(q.Options, '') AS NVARCHAR(MAX))) LIKE '%app_department%'
                OR LOWER(CAST(ISNULL(q.Options, '') AS NVARCHAR(MAX))) LIKE '%app_function%'
              )
          ) THEN CAST(1 AS BIT)
          ELSE CAST(0 AS BIT)
        END AS RequiresITLead
      FROM Responses r
      WHERE r.ResponseId = @responseId
    `);

  if (result.recordset.length === 0) {
    throw new NotFoundError(`Response ${responseId} not found`);
  }

  return {
    surveyId: result.recordset[0].SurveyId,
    requiresITLead: Boolean(result.recordset[0].RequiresITLead),
  };
}

async function updateResponseApprovalStatus(transaction, responseId, status, fields = {}) {
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

async function assertAdminEventCanAccessSurvey(executor, surveyId, adminUserId) {
  const result = await executor.request()
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .input('adminUserId', sql.UniqueIdentifier, adminUserId)
    .query(`
      SELECT TOP 1 s.SurveyId
      FROM Surveys s
      LEFT JOIN SurveyAdminAssignments saa
        ON saa.SurveyId = s.SurveyId
       AND saa.AdminUserId = @adminUserId
      WHERE s.SurveyId = @surveyId
        AND (s.AssignedAdminId = @adminUserId OR saa.AdminUserId IS NOT NULL)
    `);

  if (result.recordset.length === 0) {
    throw new UnauthorizedError('Admin Event tidak memiliki akses ke event ini');
  }
}

async function assertAdminEventCanAccessResponse(executor, responseId, adminUserId) {
  const result = await executor.request()
    .input('responseId', sql.UniqueIdentifier, responseId)
    .input('adminUserId', sql.UniqueIdentifier, adminUserId)
    .query(`
      SELECT TOP 1 r.ResponseId
      FROM Responses r
      INNER JOIN Surveys s ON s.SurveyId = r.SurveyId
      LEFT JOIN SurveyAdminAssignments saa
        ON saa.SurveyId = s.SurveyId
       AND saa.AdminUserId = @adminUserId
      WHERE r.ResponseId = @responseId
        AND (s.AssignedAdminId = @adminUserId OR saa.AdminUserId IS NOT NULL)
    `);

  if (result.recordset.length === 0) {
    throw new UnauthorizedError('Admin Event tidak memiliki akses ke response ini');
  }
}

async function assertITLeadCanAccessResponse(executor, responseId, itLeadUserId) {
  const result = await executor.request()
    .input('responseId', sql.UniqueIdentifier, responseId)
    .input('itLeadUserId', sql.UniqueIdentifier, itLeadUserId)
    .query(`
      SELECT TOP 1 r.ResponseId
      FROM Responses r
      INNER JOIN FunctionApplicationMappings fam ON fam.ApplicationId = r.ApplicationId
      INNER JOIN Functions f ON f.FunctionId = fam.FunctionId
      WHERE r.ResponseId = @responseId
        AND f.ITLeadUserId = @itLeadUserId
    `);

  if (result.recordset.length === 0) {
    throw new UnauthorizedError('IT Lead tidak memiliki akses ke response ini');
  }
}

async function finalizeResponseIfReady(transaction, responseId, adminUserId, reason = null) {
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

  await updateResponseApprovalStatus(transaction, responseId, ResponseApprovalStatus.APPROVED_FINAL, {
    adminReviewedBy: adminUserId || null,
    adminReviewedAt: new Date(),
    adminReviewReason: reason || null,
    finalizedAt: new Date()
  });
  return true;
}

module.exports = {
  applyCurrentCycleFilter,
  assertAdminEventCanAccessResponse,
  assertAdminEventCanAccessSurvey,
  assertITLeadCanAccessResponse,
  finalizeResponseIfReady,
  getResponseApprovalStatus,
  getResponseRoutingRequirement,
  updateResponseApprovalStatus
};

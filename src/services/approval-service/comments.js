async function getCommentsForSelection(pool, sql, ResponseApprovalStatus, applyCurrentCycleFilter, hasResponseApprovalStatusColumn, filter = {}) {
  const hasApprovalStatus = await hasResponseApprovalStatusColumn();
  const functionFilterExists = filter.functionId
    ? ` AND EXISTS (
          SELECT 1
          FROM FunctionApplicationMappings famFilter
          WHERE famFilter.ApplicationId = a.ApplicationId
            AND famFilter.FunctionId = @functionId
        )`
    : '';
  let query = `
    SELECT qr.QuestionResponseId, qr.ResponseId, qr.QuestionId, qr.CommentValue, qr.NumericValue,
           qr.IsBestComment, q.PromptText as QuestionText, q.DisplayOrder as QuestionOrder,
           r.RespondentEmail, r.RespondentName, r.SubmittedAt,
           a.ApplicationId, a.Name as ApplicationName,
           d.DepartmentId, d.Name as DepartmentName,
           s.SurveyId, s.Title as SurveyTitle,
           functionInfo.FunctionId, functionInfo.FunctionName
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
    WHERE qr.CommentValue IS NOT NULL
      AND LTRIM(RTRIM(qr.CommentValue)) <> ''
      AND functionInfo.FunctionId IS NOT NULL
      ${functionFilterExists}
  `;

  const request = pool.request();
  if (hasApprovalStatus) {
    query += ' AND r.ResponseApprovalStatus = @responseApprovalStatus';
    request.input('responseApprovalStatus', sql.NVarChar(50), ResponseApprovalStatus.APPROVED_FINAL);
  }
  if (filter.surveyId) {
    query += ' AND s.SurveyId = @surveyId';
    request.input('surveyId', sql.UniqueIdentifier, filter.surveyId);
    query = await applyCurrentCycleFilter(request, query, filter.surveyId);
  }
  if (filter.functionId) {
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
}

async function getBestComments(pool, sql, ResponseApprovalStatus, applyCurrentCycleFilter, hasResponseApprovalStatusColumn, filter = {}) {
  const hasApprovalStatus = await hasResponseApprovalStatusColumn();
  const functionFilterExists = filter.functionId
    ? ` AND EXISTS (
          SELECT 1
          FROM FunctionApplicationMappings famFilter
          WHERE famFilter.ApplicationId = r.ApplicationId
            AND famFilter.FunctionId = @functionId
        )`
    : '';
  let query = `
    SELECT qr.QuestionResponseId, qr.ResponseId, qr.QuestionId, qr.CommentValue, qr.NumericValue,
           q.PromptText as QuestionText, r.RespondentEmail, r.RespondentName,
           a.Name as ApplicationName, d.Name as DepartmentName, r.SubmittedAt,
           s.SurveyId, s.Title as SurveyTitle,
           functionInfo.FunctionId, functionInfo.FunctionName
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
    WHERE qr.IsBestComment = 1
      AND functionInfo.FunctionId IS NOT NULL
      ${functionFilterExists}
  `;

  const request = pool.request();
  if (hasApprovalStatus) {
    query += ' AND r.ResponseApprovalStatus = @responseApprovalStatus';
    request.input('responseApprovalStatus', sql.NVarChar(50), ResponseApprovalStatus.APPROVED_FINAL);
  }
  if (filter.surveyId) {
    query += ' AND s.SurveyId = @surveyId';
    request.input('surveyId', sql.UniqueIdentifier, filter.surveyId);
    query = await applyCurrentCycleFilter(request, query, filter.surveyId);
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
  query += ' ORDER BY r.SubmittedAt DESC';
  const result = await request.query(query);
  return result.recordset;
}

async function getBestCommentsWithFeedback(pool, sql, ResponseApprovalStatus, applyCurrentCycleFilter, hasResponseApprovalStatusColumn, filter = {}) {
  const hasApprovalStatus = await hasResponseApprovalStatusColumn();
  const functionFilterExists = filter.functionId
    ? ` AND EXISTS (
          SELECT 1
          FROM FunctionApplicationMappings famFilter
          WHERE famFilter.ApplicationId = a.ApplicationId
            AND famFilter.FunctionId = @functionId
        )`
    : '';
  let query = `
    SELECT qr.QuestionResponseId, qr.CommentValue, qr.NumericValue,
           q.PromptText as QuestionText, r.RespondentEmail, r.RespondentName,
           a.Name as ApplicationName, d.Name as DepartmentName, r.SubmittedAt,
           s.SurveyId, s.Title as SurveyTitle,
           bcf.FeedbackText, bcf.CreatedAt as FeedbackCreatedAt,
           u.DisplayName as ITLeadName, functionInfo.FunctionId, functionInfo.FunctionName
    FROM QuestionResponses qr
    INNER JOIN Questions q ON qr.QuestionId = q.QuestionId
    INNER JOIN Surveys s ON q.SurveyId = s.SurveyId
    INNER JOIN Responses r ON qr.ResponseId = r.ResponseId
    INNER JOIN Applications a ON r.ApplicationId = a.ApplicationId
    INNER JOIN Departments d ON r.DepartmentId = d.DepartmentId
    LEFT JOIN BestCommentFeedback bcf ON qr.QuestionResponseId = bcf.QuestionResponseId
    LEFT JOIN Users u ON bcf.ITLeadUserId = u.UserId
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
    WHERE qr.IsBestComment = 1
      AND functionInfo.FunctionId IS NOT NULL
      ${functionFilterExists}
  `;

  const request = pool.request();
  if (hasApprovalStatus) {
    query += ' AND r.ResponseApprovalStatus = @responseApprovalStatus';
    request.input('responseApprovalStatus', sql.NVarChar(50), ResponseApprovalStatus.APPROVED_FINAL);
  }
  if (filter.surveyId) {
    query += ' AND s.SurveyId = @surveyId';
    request.input('surveyId', sql.UniqueIdentifier, filter.surveyId);
    query = await applyCurrentCycleFilter(request, query, filter.surveyId);
  }
  if (filter.functionId) {
    request.input('functionId', sql.UniqueIdentifier, filter.functionId);
  }
  if (filter.departmentId) {
    query += ' AND r.DepartmentId = @departmentId';
    request.input('departmentId', sql.UniqueIdentifier, filter.departmentId);
  }
  query += ' ORDER BY r.SubmittedAt DESC';
  const result = await request.query(query);
  return result.recordset;
}

module.exports = {
  getBestComments,
  getBestCommentsWithFeedback,
  getCommentsForSelection
};

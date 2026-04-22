async function getTakeoutComparisonTable(createRequest, sql, surveyId, functionId = null) {
  const request = await createRequest();
  request.input('surveyId', sql.UniqueIdentifier, surveyId);
  let query = `
    SELECT
      a.ApplicationId,
      a.Name AS ApplicationName,
      SUM(CASE WHEN qr.TakeoutStatus = 'TakenOut' THEN 1 ELSE 0 END) AS TakenOutCount,
      SUM(CASE WHEN qr.TakeoutStatus = 'Active' THEN 1 ELSE 0 END) AS RemainingCount
    FROM QuestionResponses qr
    INNER JOIN Responses r ON qr.ResponseId = r.ResponseId
    INNER JOIN Applications a ON r.ApplicationId = a.ApplicationId
    WHERE r.SurveyId = @surveyId
  `;
  if (functionId) {
    query += `
      AND EXISTS (
        SELECT 1 FROM FunctionApplicationMappings fam
        WHERE fam.ApplicationId = a.ApplicationId
          AND fam.FunctionId = @functionId
      )
    `;
    request.input('functionId', sql.UniqueIdentifier, functionId);
  }
  query += `
    GROUP BY a.ApplicationId, a.Name
    ORDER BY a.Name
  `;
  const result = await request.query(query);
  return result.recordset;
}

async function getDepartmentHeadReview(createRequest, sql, departmentId, surveyId) {
  const result = await (await createRequest())
    .input('departmentId', sql.UniqueIdentifier, departmentId)
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query(`
      SELECT 
        a.ApplicationId,
        a.Name AS ApplicationName,
        COUNT(DISTINCT r.ResponseId) AS ResponseCount,
        AVG(CAST(qr.NumericValue AS FLOAT)) AS AverageScore
      FROM Responses r
      INNER JOIN Applications a ON r.ApplicationId = a.ApplicationId
      LEFT JOIN QuestionResponses qr ON qr.ResponseId = r.ResponseId AND qr.NumericValue IS NOT NULL
      WHERE r.DepartmentId = @departmentId
        AND r.SurveyId = @surveyId
      GROUP BY a.ApplicationId, a.Name
      ORDER BY a.Name
    `);
  return result.recordset;
}

async function getScoresByFunction(createRequest, sql, departmentId, surveyId) {
  const result = await (await createRequest())
    .input('departmentId', sql.UniqueIdentifier, departmentId)
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query(`
      SELECT
        f.FunctionId,
        f.Name AS FunctionName,
        AVG(CAST(qr.NumericValue AS FLOAT)) AS AverageScore
      FROM Responses r
      INNER JOIN Applications a ON r.ApplicationId = a.ApplicationId
      INNER JOIN FunctionApplicationMappings fam ON fam.ApplicationId = a.ApplicationId
      INNER JOIN Functions f ON f.FunctionId = fam.FunctionId
      INNER JOIN QuestionResponses qr ON qr.ResponseId = r.ResponseId
      WHERE r.DepartmentId = @departmentId
        AND r.SurveyId = @surveyId
        AND qr.NumericValue IS NOT NULL
      GROUP BY f.FunctionId, f.Name
      ORDER BY f.Name
    `);
  return result.recordset;
}

async function getApprovedTakeouts(createRequest, sql, departmentId, surveyId) {
  const result = await (await createRequest())
    .input('departmentId', sql.UniqueIdentifier, departmentId)
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query(`
      SELECT
        qr.QuestionResponseId,
        a.Name AS ApplicationName,
        q.PromptText,
        qr.TakeoutReason,
        qr.ApprovedAt
      FROM QuestionResponses qr
      INNER JOIN Responses r ON qr.ResponseId = r.ResponseId
      INNER JOIN Applications a ON r.ApplicationId = a.ApplicationId
      INNER JOIN Questions q ON q.QuestionId = qr.QuestionId
      WHERE r.DepartmentId = @departmentId
        AND r.SurveyId = @surveyId
        AND qr.TakeoutStatus = 'TakenOut'
      ORDER BY a.Name, q.DisplayOrder
    `);
  return result.recordset;
}

module.exports = {
  getApprovedTakeouts,
  getDepartmentHeadReview,
  getScoresByFunction,
  getTakeoutComparisonTable
};

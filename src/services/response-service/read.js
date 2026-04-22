async function getResponses(createRequest, sql, logger, filter = {}) {
  logger.info('Getting responses with filter', { filter });

  let query = `
    SELECT 
      r.ResponseId,
      r.SurveyId,
      r.RespondentName,
      r.RespondentEmail,
      r.BusinessUnitId,
      r.DivisionId,
      r.DepartmentId,
      r.ApplicationId,
      r.SubmittedAt,
      r.IpAddress,
      s.Title as SurveyTitle,
      bu.Name as BusinessUnitName,
      d.Name as DivisionName,
      dept.Name as DepartmentName,
      a.Name as ApplicationName,
      a.Code as ApplicationCode
    FROM Responses r
    INNER JOIN Surveys s ON r.SurveyId = s.SurveyId
    LEFT JOIN BusinessUnits bu ON r.BusinessUnitId = bu.BusinessUnitId
    LEFT JOIN Divisions d ON r.DivisionId = d.DivisionId
    LEFT JOIN Departments dept ON r.DepartmentId = dept.DepartmentId
    LEFT JOIN Applications a ON r.ApplicationId = a.ApplicationId
    WHERE 1=1
  `;

  const request = await createRequest();
  if (filter.surveyId) {
    query += ' AND r.SurveyId = @surveyId';
    request.input('surveyId', sql.UniqueIdentifier, filter.surveyId);
  }
  if (filter.departmentId) {
    query += ' AND r.DepartmentId = @departmentId';
    request.input('departmentId', sql.UniqueIdentifier, filter.departmentId);
  }
  if (filter.applicationId) {
    query += ' AND r.ApplicationId = @applicationId';
    request.input('applicationId', sql.UniqueIdentifier, filter.applicationId);
  }
  if (filter.businessUnitId) {
    query += ' AND r.BusinessUnitId = @businessUnitId';
    request.input('businessUnitId', sql.UniqueIdentifier, filter.businessUnitId);
  }
  if (filter.divisionId) {
    query += ' AND r.DivisionId = @divisionId';
    request.input('divisionId', sql.UniqueIdentifier, filter.divisionId);
  }
  if (filter.email) {
    query += ' AND LOWER(r.RespondentEmail) LIKE @email';
    request.input('email', sql.NVarChar(200), `%${filter.email.toLowerCase()}%`);
  }
  if (filter.startDate) {
    query += ' AND r.SubmittedAt >= @startDate';
    request.input('startDate', sql.DateTime, filter.startDate);
  }
  if (filter.endDate) {
    query += ' AND r.SubmittedAt <= @endDate';
    request.input('endDate', sql.DateTime, filter.endDate);
  }

  query += ' ORDER BY r.SubmittedAt DESC';
  const result = await request.query(query);
  return result.recordset.map((row) => ({
    responseId: row.ResponseId,
    surveyId: row.SurveyId,
    surveyTitle: row.SurveyTitle,
    respondentName: row.RespondentName,
    respondentEmail: row.RespondentEmail,
    businessUnitId: row.BusinessUnitId,
    businessUnitName: row.BusinessUnitName,
    divisionId: row.DivisionId,
    divisionName: row.DivisionName,
    departmentId: row.DepartmentId,
    departmentName: row.DepartmentName,
    applicationId: row.ApplicationId,
    applicationName: row.ApplicationName,
    applicationCode: row.ApplicationCode,
    submittedAt: row.SubmittedAt,
    ipAddress: row.IpAddress
  }));
}

async function getResponseById(createRequest, sql, errors, logger, hasQuestionResponseApplicationIdColumn, responseId) {
  const { NotFoundError, ValidationError } = errors;
  logger.info(`Getting response by ID: ${responseId}`);

  if (!responseId) {
    throw new ValidationError('Response ID is required');
  }

  const responseResult = await (await createRequest())
    .input('responseId', sql.UniqueIdentifier, responseId)
    .query(`
      SELECT 
        r.ResponseId,
        r.SurveyId,
        r.RespondentName,
        r.RespondentEmail,
        r.BusinessUnitId,
        r.DivisionId,
        r.DepartmentId,
        r.ApplicationId,
        r.SubmittedAt,
        r.IpAddress,
        s.Title as SurveyTitle,
        bu.Name as BusinessUnitName,
        d.Name as DivisionName,
        dept.Name as DepartmentName,
        a.Name as ApplicationName,
        a.Code as ApplicationCode
      FROM Responses r
      INNER JOIN Surveys s ON r.SurveyId = s.SurveyId
      LEFT JOIN BusinessUnits bu ON r.BusinessUnitId = bu.BusinessUnitId
      LEFT JOIN Divisions d ON r.DivisionId = d.DivisionId
      LEFT JOIN Departments dept ON r.DepartmentId = dept.DepartmentId
      LEFT JOIN Applications a ON r.ApplicationId = a.ApplicationId
      WHERE r.ResponseId = @responseId
    `);

  if (responseResult.recordset.length === 0) {
    throw new NotFoundError(`Response with ID ${responseId} not found`);
  }

  const response = responseResult.recordset[0];
  const hasQuestionResponseApplicationId = await hasQuestionResponseApplicationIdColumn();
  const questionResponsesResult = await (await createRequest())
    .input('responseId', sql.UniqueIdentifier, responseId)
    .query(`
      SELECT 
        qr.QuestionResponseId,
        qr.ResponseId,
        qr.QuestionId,
        ${hasQuestionResponseApplicationId ? 'qr.ApplicationId' : 'CAST(NULL AS UNIQUEIDENTIFIER) AS ApplicationId'},
        qr.TextValue,
        qr.NumericValue,
        qr.DateValue,
        qr.MatrixValues,
        qr.CommentValue,
        qr.TakeoutStatus,
        qr.TakeoutReason,
        qr.ProposedBy,
        qr.ProposedAt,
        qr.ReviewedBy,
        qr.ReviewedAt,
        qr.IsBestComment,
        q.Type as QuestionType,
        q.PromptText as QuestionText,
        q.DisplayOrder
      FROM QuestionResponses qr
      INNER JOIN Questions q ON qr.QuestionId = q.QuestionId
      WHERE qr.ResponseId = @responseId
      ORDER BY q.DisplayOrder
    `);

  const questionResponses = questionResponsesResult.recordset.map((qr) => ({
    questionResponseId: qr.QuestionResponseId,
    responseId: qr.ResponseId,
    questionId: qr.QuestionId,
    applicationId: qr.ApplicationId,
    questionType: qr.QuestionType,
    questionText: qr.QuestionText,
    displayOrder: qr.DisplayOrder,
    value: {
      textValue: qr.TextValue,
      numericValue: qr.NumericValue,
      dateValue: qr.DateValue,
      matrixValues: qr.MatrixValues ? JSON.parse(qr.MatrixValues) : null,
      commentValue: qr.CommentValue
    },
    takeoutStatus: qr.TakeoutStatus,
    takeoutReason: qr.TakeoutReason,
    proposedBy: qr.ProposedBy,
    proposedAt: qr.ProposedAt,
    reviewedBy: qr.ReviewedBy,
    reviewedAt: qr.ReviewedAt,
    isBestComment: qr.IsBestComment
  }));

  return {
    responseId: response.ResponseId,
    surveyId: response.SurveyId,
    surveyTitle: response.SurveyTitle,
    respondentName: response.RespondentName,
    respondentEmail: response.RespondentEmail,
    businessUnitId: response.BusinessUnitId,
    businessUnitName: response.BusinessUnitName,
    divisionId: response.DivisionId,
    divisionName: response.DivisionName,
    departmentId: response.DepartmentId,
    departmentName: response.DepartmentName,
    applicationId: response.ApplicationId,
    applicationName: response.ApplicationName,
    applicationCode: response.ApplicationCode,
    submittedAt: response.SubmittedAt,
    ipAddress: response.IpAddress,
    questionResponses
  };
}

async function getResponseStatistics(createRequest, sql, errors, logger, hasQuestionResponseTakeoutStatusColumn, surveyId) {
  const { ValidationError } = errors;
  logger.info(`Getting response statistics for surveyId: ${surveyId}`);

  if (!surveyId) {
    throw new ValidationError('Survey ID is required');
  }

  const totalResult = await (await createRequest())
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query(`
      SELECT COUNT(DISTINCT ResponseId) as TotalResponses
      FROM Responses
      WHERE SurveyId = @surveyId
    `);

  const byDepartmentResult = await (await createRequest())
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query(`
      SELECT 
        dept.DepartmentId,
        dept.Name as DepartmentName,
        COUNT(DISTINCT r.ResponseId) as ResponseCount
      FROM Responses r
      INNER JOIN Departments dept ON r.DepartmentId = dept.DepartmentId
      WHERE r.SurveyId = @surveyId
      GROUP BY dept.DepartmentId, dept.Name
      ORDER BY dept.Name
    `);

  const byApplicationResult = await (await createRequest())
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query(`
      SELECT 
        a.ApplicationId,
        a.Name as ApplicationName,
        a.Code as ApplicationCode,
        COUNT(DISTINCT r.ResponseId) as ResponseCount
      FROM Responses r
      INNER JOIN Applications a ON r.ApplicationId = a.ApplicationId
      WHERE r.SurveyId = @surveyId
      GROUP BY a.ApplicationId, a.Name, a.Code
      ORDER BY a.Name
    `);

  const hasTakeoutStatus = await hasQuestionResponseTakeoutStatusColumn();
  const avgRatingsResult = await (await createRequest())
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query(`
      SELECT 
        q.QuestionId,
        q.PromptText,
        MIN(q.DisplayOrder) as DisplayOrder,
        AVG(CAST(qr.NumericValue as FLOAT)) as AverageRating,
        COUNT(*) as ResponseCount
      FROM QuestionResponses qr
      INNER JOIN Questions q ON qr.QuestionId = q.QuestionId
      INNER JOIN Responses r ON qr.ResponseId = r.ResponseId
      WHERE r.SurveyId = @surveyId
        AND q.Type IN ('Rating', 'MatrixLikert')
        AND qr.NumericValue IS NOT NULL
        ${hasTakeoutStatus ? "AND qr.TakeoutStatus = 'Active'" : ''}
      GROUP BY q.QuestionId, q.PromptText
      ORDER BY MIN(q.DisplayOrder)
    `);

  const takeoutResult = hasTakeoutStatus
    ? await (await createRequest())
      .input('surveyId', sql.UniqueIdentifier, surveyId)
      .query(`
        SELECT 
          COUNT(CASE WHEN TakeoutStatus = 'Active' THEN 1 END) as ActiveCount,
          COUNT(CASE WHEN TakeoutStatus = 'ProposedTakeout' THEN 1 END) as ProposedCount,
          COUNT(CASE WHEN TakeoutStatus = 'TakenOut' THEN 1 END) as TakenOutCount
        FROM QuestionResponses qr
        INNER JOIN Responses r ON qr.ResponseId = r.ResponseId
        WHERE r.SurveyId = @surveyId
      `)
    : { recordset: [{ ActiveCount: 0, ProposedCount: 0, TakenOutCount: 0 }] };

  return {
    totalResponses: totalResult.recordset[0].TotalResponses,
    byDepartment: byDepartmentResult.recordset.map((row) => ({
      departmentId: row.DepartmentId,
      departmentName: row.DepartmentName,
      responseCount: row.ResponseCount
    })),
    byApplication: byApplicationResult.recordset.map((row) => ({
      applicationId: row.ApplicationId,
      applicationName: row.ApplicationName,
      applicationCode: row.ApplicationCode,
      responseCount: row.ResponseCount
    })),
    averageRatings: avgRatingsResult.recordset.map((row) => ({
      questionId: row.QuestionId,
      questionText: row.PromptText,
      averageRating: row.AverageRating,
      responseCount: row.ResponseCount
    })),
    takeoutStatistics: {
      active: takeoutResult.recordset[0].ActiveCount,
      proposed: takeoutResult.recordset[0].ProposedCount,
      takenOut: takeoutResult.recordset[0].TakenOutCount
    }
  };
}

module.exports = {
  getResponseById,
  getResponseStatistics,
  getResponses
};

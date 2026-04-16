function normalizeOptionalString(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'object') {
    if (typeof value.url === 'string') {
      return value.url;
    }
    if (typeof value.src === 'string') {
      return value.src;
    }
  }

  return null;
}

async function addQuestion(db, sql, logger, errors, validators, surveyId, data) {
  const { NotFoundError, ValidationError } = errors;
  const { validateLayoutOrientation, validateQuestionType } = validators;
  const pool = await db.getPool();

  if (!data.type) {
    throw new ValidationError('Question type is required');
  }
  if (!data.createdBy) {
    throw new ValidationError('CreatedBy is required');
  }

  validateQuestionType(data.type);
  if (data.layoutOrientation) {
    validateLayoutOrientation(data.layoutOrientation);
  }

  const surveyCheck = await pool.request()
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query('SELECT SurveyId, Status FROM Surveys WHERE SurveyId = @surveyId');
  if (surveyCheck.recordset.length === 0) {
    throw new NotFoundError('Survey not found');
  }

  let displayOrder = data.displayOrder;
  if (displayOrder === undefined || displayOrder === null) {
    const orderResult = await pool.request()
      .input('surveyId', sql.UniqueIdentifier, surveyId)
      .query('SELECT ISNULL(MAX(DisplayOrder), 0) + 1 as NextOrder FROM Questions WHERE SurveyId = @surveyId');
    displayOrder = orderResult.recordset[0].NextOrder;
  }

  const pageNumber = data.pageNumber || 1;
  if (pageNumber < 1) {
    throw new ValidationError('Page number must be at least 1');
  }

  const optionsJson = data.options ? JSON.stringify(data.options) : null;
  const result = await pool.request()
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .input('type', sql.NVarChar(50), data.type)
    .input('promptText', sql.NVarChar(sql.MAX), normalizeOptionalString(data.promptText) ?? '')
    .input('subtitle', sql.NVarChar(500), normalizeOptionalString(data.subtitle))
    .input('imageUrl', sql.NVarChar(500), normalizeOptionalString(data.imageUrl))
    .input('isMandatory', sql.Bit, data.isMandatory || false)
    .input('displayOrder', sql.Int, displayOrder)
    .input('pageNumber', sql.Int, pageNumber)
    .input('layoutOrientation', sql.NVarChar(20), data.layoutOrientation || null)
    .input('options', sql.NVarChar(sql.MAX), optionsJson)
    .input('commentRequiredBelowRating', sql.Int, data.commentRequiredBelowRating || null)
    .input('createdBy', sql.UniqueIdentifier, data.createdBy)
    .query(`
      INSERT INTO Questions (
        SurveyId, Type, PromptText, Subtitle, ImageUrl,
        IsMandatory, DisplayOrder, PageNumber, LayoutOrientation,
        Options, CommentRequiredBelowRating, CreatedBy, CreatedAt
      )
      OUTPUT INSERTED.*
      VALUES (
        @surveyId, @type, @promptText, @subtitle, @imageUrl,
        @isMandatory, @displayOrder, @pageNumber, @layoutOrientation,
        @options, @commentRequiredBelowRating, @createdBy, GETDATE()
      )
    `);

  const question = result.recordset[0];
  if (question.Options) {
    question.Options = JSON.parse(question.Options);
  }

  logger.info('Question added', { questionId: question.QuestionId, surveyId });
  return question;
}

async function updateQuestion(db, sql, logger, errors, validators, questionId, data) {
  const { NotFoundError, ValidationError } = errors;
  const { validateLayoutOrientation, validateQuestionType } = validators;
  const pool = await db.getPool();

  const questionCheck = await pool.request()
    .input('questionId', sql.UniqueIdentifier, questionId)
    .query('SELECT QuestionId, SurveyId FROM Questions WHERE QuestionId = @questionId');
  if (questionCheck.recordset.length === 0) {
    throw new NotFoundError('Question not found');
  }

  if (data.type) {
    validateQuestionType(data.type);
  }
  if (data.layoutOrientation) {
    validateLayoutOrientation(data.layoutOrientation);
  }

  const updateFields = [];
  const request = pool.request();
  request.input('questionId', sql.UniqueIdentifier, questionId);

  if (data.type !== undefined) {
    updateFields.push('Type = @type');
    request.input('type', sql.NVarChar(50), data.type);
  }
  if (data.promptText !== undefined) {
    updateFields.push('PromptText = @promptText');
    request.input('promptText', sql.NVarChar(sql.MAX), normalizeOptionalString(data.promptText) ?? '');
  }
  if (data.subtitle !== undefined) {
    updateFields.push('Subtitle = @subtitle');
    request.input('subtitle', sql.NVarChar(500), normalizeOptionalString(data.subtitle));
  }
  if (data.imageUrl !== undefined) {
    updateFields.push('ImageUrl = @imageUrl');
    request.input('imageUrl', sql.NVarChar(500), normalizeOptionalString(data.imageUrl));
  }
  if (data.isMandatory !== undefined) {
    updateFields.push('IsMandatory = @isMandatory');
    request.input('isMandatory', sql.Bit, data.isMandatory);
  }
  if (data.displayOrder !== undefined) {
    updateFields.push('DisplayOrder = @displayOrder');
    request.input('displayOrder', sql.Int, data.displayOrder);
  }
  if (data.pageNumber !== undefined) {
    if (data.pageNumber < 1) {
      throw new ValidationError('Page number must be at least 1');
    }
    updateFields.push('PageNumber = @pageNumber');
    request.input('pageNumber', sql.Int, data.pageNumber);
  }
  if (data.layoutOrientation !== undefined) {
    updateFields.push('LayoutOrientation = @layoutOrientation');
    request.input('layoutOrientation', sql.NVarChar(20), data.layoutOrientation);
  }
  if (data.options !== undefined) {
    updateFields.push('Options = @options');
    request.input('options', sql.NVarChar(sql.MAX), data.options ? JSON.stringify(data.options) : null);
  }
  if (data.commentRequiredBelowRating !== undefined) {
    updateFields.push('CommentRequiredBelowRating = @commentRequiredBelowRating');
    request.input('commentRequiredBelowRating', sql.Int, data.commentRequiredBelowRating);
  }

  if (updateFields.length === 0) {
    throw new ValidationError('No fields to update');
  }

  if (data.updatedBy) {
    updateFields.push('UpdatedBy = @updatedBy');
    request.input('updatedBy', sql.UniqueIdentifier, data.updatedBy);
  }
  updateFields.push('UpdatedAt = GETDATE()');

  const result = await request.query(`
    UPDATE Questions
    SET ${updateFields.join(', ')}
    OUTPUT INSERTED.*
    WHERE QuestionId = @questionId
  `);

  const question = result.recordset[0];
  if (question.Options) {
    question.Options = JSON.parse(question.Options);
  }

  logger.info('Question updated', { questionId });
  return question;
}

async function deleteQuestion(db, sql, logger, errors, questionId) {
  const { NotFoundError } = errors;
  const pool = await db.getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();
    const request = new sql.Request(transaction);

    const questionCheck = await request
      .input('questionId', sql.UniqueIdentifier, questionId)
      .query('SELECT QuestionId, SurveyId FROM Questions WHERE QuestionId = @questionId');
    if (questionCheck.recordset.length === 0) {
      throw new NotFoundError('Question not found');
    }

    await request
      .input('responseQuestionId', sql.UniqueIdentifier, questionId)
      .query('DELETE FROM QuestionResponses WHERE QuestionId = @responseQuestionId');

    const result = await request
      .input('deleteQuestionId', sql.UniqueIdentifier, questionId)
      .query('DELETE FROM Questions WHERE QuestionId = @deleteQuestionId');

    await transaction.commit();
    logger.info('Question deleted', { questionId });
    return result.rowsAffected[0] > 0;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (_) {}
    throw error;
  }
}

async function reorderQuestions(db, sql, logger, errors, surveyId, questionOrders) {
  const { NotFoundError, ValidationError } = errors;
  const pool = await db.getPool();
  const transaction = new sql.Transaction(pool);

  if (!Array.isArray(questionOrders) || questionOrders.length === 0) {
    throw new ValidationError('Question orders array is required');
  }

  const surveyCheck = await pool.request()
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query('SELECT SurveyId FROM Surveys WHERE SurveyId = @surveyId');
  if (surveyCheck.recordset.length === 0) {
    throw new NotFoundError('Survey not found');
  }

  await transaction.begin();
  try {
    for (const item of questionOrders) {
      if (!item.questionId || item.displayOrder === undefined) {
        throw new ValidationError('Each item must have questionId and displayOrder');
      }
      await new sql.Request(transaction)
        .input('questionId', sql.UniqueIdentifier, item.questionId)
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .input('displayOrder', sql.Int, item.displayOrder)
        .query(`
          UPDATE Questions
          SET DisplayOrder = @displayOrder, UpdatedAt = GETDATE()
          WHERE QuestionId = @questionId AND SurveyId = @surveyId
        `);
    }

    await transaction.commit();
    logger.info('Questions reordered', { surveyId, count: questionOrders.length });

    const result = await pool.request()
      .input('surveyId', sql.UniqueIdentifier, surveyId)
      .query(`
        SELECT QuestionId, DisplayOrder
        FROM Questions
        WHERE SurveyId = @surveyId
        ORDER BY DisplayOrder
      `);

    return result.recordset;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function getQuestionsBySurvey(db, sql, surveyId) {
  const pool = await db.getPool();
  const result = await pool.request()
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query(`
      SELECT * FROM Questions
      WHERE SurveyId = @surveyId
      ORDER BY PageNumber, DisplayOrder
    `);

  return result.recordset.map((question) => {
    if (question.Options) {
      question.Options = JSON.parse(question.Options);
    }
    return question;
  });
}

module.exports = {
  addQuestion,
  deleteQuestion,
  getQuestionsBySurvey,
  reorderQuestions,
  updateQuestion
};

async function markAsBestComment(pool, sql, errors, responseId, questionId, markedBy) {
  const { NotFoundError, ValidationError } = errors;

  if (!responseId || !questionId || !markedBy) {
    throw new ValidationError('ResponseId, QuestionId, and MarkedBy are required');
  }

  const checkResult = await pool.request()
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

  await pool.request()
    .input('responseId', sql.UniqueIdentifier, responseId)
    .input('questionId', sql.UniqueIdentifier, questionId)
    .query(`UPDATE QuestionResponses SET IsBestComment = 1
            WHERE ResponseId = @responseId AND QuestionId = @questionId`);

  return {
    success: true,
    questionResponseId: questionResponse.QuestionResponseId,
    isBestComment: true
  };
}

async function unmarkBestComment(pool, sql, errors, responseId, questionId, unmarkedBy) {
  const { NotFoundError, ValidationError } = errors;

  if (!responseId || !questionId || !unmarkedBy) {
    throw new ValidationError('ResponseId, QuestionId, and UnmarkedBy are required');
  }

  const checkResult = await pool.request()
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

  await pool.request()
    .input('responseId', sql.UniqueIdentifier, responseId)
    .input('questionId', sql.UniqueIdentifier, questionId)
    .query(`UPDATE QuestionResponses SET IsBestComment = 0
            WHERE ResponseId = @responseId AND QuestionId = @questionId`);

  return {
    success: true,
    questionResponseId: questionResponse.QuestionResponseId,
    isBestComment: false
  };
}

async function submitBestCommentFeedback(pool, sql, errors, feedback) {
  const { NotFoundError, ValidationError } = errors;
  let { questionResponseId } = feedback;
  const { responseId, questionId, itLeadUserId, feedbackText } = feedback;

  if (!itLeadUserId || !feedbackText) {
    throw new ValidationError('ITLeadUserId and FeedbackText are required');
  }

  if (!questionResponseId && responseId && questionId) {
    const resolved = await pool.request()
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

  const checkResult = await pool.request()
    .input('questionResponseId', sql.UniqueIdentifier, questionResponseId)
    .query(`SELECT IsBestComment FROM QuestionResponses WHERE QuestionResponseId = @questionResponseId`);

  if (checkResult.recordset.length === 0) {
    throw new NotFoundError('Question response not found');
  }
  if (!checkResult.recordset[0].IsBestComment) {
    throw new ValidationError('Question response is not marked as best comment');
  }

  const existingFeedback = await pool.request()
    .input('questionResponseId', sql.UniqueIdentifier, questionResponseId)
    .input('itLeadUserId', sql.UniqueIdentifier, itLeadUserId)
    .query(`SELECT FeedbackId FROM BestCommentFeedback
            WHERE QuestionResponseId = @questionResponseId AND ITLeadUserId = @itLeadUserId`);

  if (existingFeedback.recordset.length > 0) {
    await pool.request()
      .input('feedbackId', sql.UniqueIdentifier, existingFeedback.recordset[0].FeedbackId)
      .input('feedbackText', sql.NVarChar, feedbackText)
      .input('updatedAt', sql.DateTime2, new Date())
      .query(`UPDATE BestCommentFeedback SET FeedbackText = @feedbackText, UpdatedAt = @updatedAt
              WHERE FeedbackId = @feedbackId`);

    return {
      success: true,
      feedbackId: existingFeedback.recordset[0].FeedbackId,
      updated: true
    };
  }

  const result = await pool.request()
    .input('questionResponseId', sql.UniqueIdentifier, questionResponseId)
    .input('itLeadUserId', sql.UniqueIdentifier, itLeadUserId)
    .input('feedbackText', sql.NVarChar, feedbackText)
    .query(`INSERT INTO BestCommentFeedback (QuestionResponseId, ITLeadUserId, FeedbackText)
            OUTPUT INSERTED.FeedbackId VALUES (@questionResponseId, @itLeadUserId, @feedbackText)`);

  return {
    success: true,
    feedbackId: result.recordset[0].FeedbackId,
    updated: false
  };
}

async function getBestCommentFeedback(pool, sql, errors, questionResponseId) {
  const { ValidationError } = errors;

  if (!questionResponseId) {
    throw new ValidationError('QuestionResponseId is required');
  }

  const result = await pool.request()
    .input('questionResponseId', sql.UniqueIdentifier, questionResponseId)
    .query(`SELECT bcf.FeedbackId, bcf.FeedbackText, bcf.CreatedAt, bcf.UpdatedAt,
                   u.DisplayName as ITLeadName, u.Email as ITLeadEmail
            FROM BestCommentFeedback bcf
            INNER JOIN Users u ON bcf.ITLeadUserId = u.UserId
            WHERE bcf.QuestionResponseId = @questionResponseId
            ORDER BY bcf.CreatedAt DESC`);

  return result.recordset;
}

module.exports = {
  getBestCommentFeedback,
  markAsBestComment,
  submitBestCommentFeedback,
  unmarkBestComment
};

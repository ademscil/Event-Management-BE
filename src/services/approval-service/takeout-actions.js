async function proposeTakeoutForQuestion(context, request) {
  const {
    ApprovalAction,
    ResponseApprovalStatus,
    TakeoutStatus,
    ValidationError,
    NotFoundError,
    hasResponseApprovalStatusColumn,
    assertITLeadCanAccessResponse,
    getResponseApprovalStatus,
    updateResponseApprovalStatus,
    pool,
    sql
  } = context;
  const { responseId, questionId, reason, proposedBy, proposedByRole } = request;

  if (!responseId || !questionId || !reason || !proposedBy) {
    throw new ValidationError('ResponseId, QuestionId, Reason, and ProposedBy are required');
  }

  const hasApprovalStatus = await hasResponseApprovalStatusColumn();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    if (proposedByRole === 'ITLead') {
      await assertITLeadCanAccessResponse(transaction, responseId, proposedBy);
    }

    if (hasApprovalStatus) {
      const responseStatus = await getResponseApprovalStatus(transaction, responseId);
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
      await updateResponseApprovalStatus(
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

    return {
      success: true,
      questionResponseId: questionResponse.QuestionResponseId,
      status: TakeoutStatus.PROPOSED_TAKEOUT
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function cancelProposedTakeoutForQuestion(context, responseId, questionId, cancelledBy, cancelledByRole = null) {
  const {
    ApprovalAction,
    ResponseApprovalStatus,
    TakeoutStatus,
    ValidationError,
    NotFoundError,
    hasResponseApprovalStatusColumn,
    assertITLeadCanAccessResponse,
    updateResponseApprovalStatus,
    pool,
    sql
  } = context;

  if (!responseId || !questionId || !cancelledBy) {
    throw new ValidationError('ResponseId, QuestionId, and CancelledBy are required');
  }

  const hasApprovalStatus = await hasResponseApprovalStatusColumn();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    if (cancelledByRole === 'ITLead') {
      await assertITLeadCanAccessResponse(transaction, responseId, cancelledBy);
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
        await updateResponseApprovalStatus(
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

    return {
      success: true,
      questionResponseId: questionResponse.QuestionResponseId,
      status: TakeoutStatus.ACTIVE
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function approveProposedTakeout(context, responseId, questionId, approvedBy, reason = null, approvedByRole = null) {
  const {
    ApprovalAction,
    ResponseApprovalStatus,
    TakeoutStatus,
    ValidationError,
    NotFoundError,
    hasResponseApprovalStatusColumn,
    assertAdminEventCanAccessResponse,
    getResponseApprovalStatus,
    finalizeResponseIfReady,
    pool,
    sql
  } = context;

  if (!responseId || !questionId || !approvedBy) {
    throw new ValidationError('ResponseId, QuestionId, and ApprovedBy are required');
  }

  const hasApprovalStatus = await hasResponseApprovalStatusColumn();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    if (approvedByRole === 'AdminEvent') {
      await assertAdminEventCanAccessResponse(transaction, responseId, approvedBy);
    }

    if (hasApprovalStatus) {
      const responseStatus = await getResponseApprovalStatus(transaction, responseId);
      if (responseStatus !== ResponseApprovalStatus.PENDING_ADMIN_TAKEOUT_DECISION) {
        throw new ValidationError('Response belum berada di tahap keputusan takeout Admin Event');
      }
    }

    const checkResult = await transaction.request()
      .input('responseId', sql.UniqueIdentifier, responseId)
      .input('questionId', sql.UniqueIdentifier, questionId)
      .query(`
        SELECT QuestionResponseId, TakeoutStatus FROM QuestionResponses
        WHERE ResponseId = @responseId AND QuestionId = @questionId
      `);

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
      .query(`
        UPDATE QuestionResponses
        SET TakeoutStatus = @status, ReviewedBy = @reviewedBy, ReviewedAt = @reviewedAt
        WHERE ResponseId = @responseId AND QuestionId = @questionId
      `);

    await transaction.request()
      .input('questionResponseId', sql.UniqueIdentifier, questionResponse.QuestionResponseId)
      .input('action', sql.NVarChar, ApprovalAction.APPROVED)
      .input('performedBy', sql.UniqueIdentifier, approvedBy)
      .input('reason', sql.NVarChar, reason)
      .input('previousStatus', sql.NVarChar, previousStatus)
      .input('newStatus', sql.NVarChar, TakeoutStatus.TAKEN_OUT)
      .query(`
        INSERT INTO ApprovalHistory (QuestionResponseId, Action, PerformedBy, Reason, PreviousStatus, NewStatus)
        VALUES (@questionResponseId, @action, @performedBy, @reason, @previousStatus, @newStatus)
      `);

    if (hasApprovalStatus) {
      await finalizeResponseIfReady(transaction, responseId, approvedBy, reason || null);
    }

    await transaction.commit();
    return { success: true, questionResponseId: questionResponse.QuestionResponseId, status: TakeoutStatus.TAKEN_OUT };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function rejectProposedTakeout(context, responseId, questionId, rejectedBy, reason, rejectedByRole = null) {
  const {
    ApprovalAction,
    ResponseApprovalStatus,
    TakeoutStatus,
    ValidationError,
    NotFoundError,
    hasResponseApprovalStatusColumn,
    assertAdminEventCanAccessResponse,
    getResponseApprovalStatus,
    finalizeResponseIfReady,
    pool,
    sql
  } = context;

  if (!responseId || !questionId || !rejectedBy || !reason) {
    throw new ValidationError('ResponseId, QuestionId, RejectedBy, and Reason are required');
  }

  const hasApprovalStatus = await hasResponseApprovalStatusColumn();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    if (rejectedByRole === 'AdminEvent') {
      await assertAdminEventCanAccessResponse(transaction, responseId, rejectedBy);
    }

    if (hasApprovalStatus) {
      const responseStatus = await getResponseApprovalStatus(transaction, responseId);
      if (responseStatus !== ResponseApprovalStatus.PENDING_ADMIN_TAKEOUT_DECISION) {
        throw new ValidationError('Response belum berada di tahap keputusan takeout Admin Event');
      }
    }

    const checkResult = await transaction.request()
      .input('responseId', sql.UniqueIdentifier, responseId)
      .input('questionId', sql.UniqueIdentifier, questionId)
      .query(`
        SELECT QuestionResponseId, TakeoutStatus FROM QuestionResponses
        WHERE ResponseId = @responseId AND QuestionId = @questionId
      `);

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
      .query(`
        UPDATE QuestionResponses
        SET TakeoutStatus = @status, TakeoutReason = NULL,
            ProposedBy = NULL, ProposedAt = NULL, ReviewedBy = @reviewedBy, ReviewedAt = @reviewedAt
        WHERE ResponseId = @responseId AND QuestionId = @questionId
      `);

    await transaction.request()
      .input('questionResponseId', sql.UniqueIdentifier, questionResponse.QuestionResponseId)
      .input('action', sql.NVarChar, ApprovalAction.REJECTED)
      .input('performedBy', sql.UniqueIdentifier, rejectedBy)
      .input('reason', sql.NVarChar, reason)
      .input('previousStatus', sql.NVarChar, previousStatus)
      .input('newStatus', sql.NVarChar, TakeoutStatus.ACTIVE)
      .query(`
        INSERT INTO ApprovalHistory (QuestionResponseId, Action, PerformedBy, Reason, PreviousStatus, NewStatus)
        VALUES (@questionResponseId, @action, @performedBy, @reason, @previousStatus, @newStatus)
      `);

    if (hasApprovalStatus) {
      await finalizeResponseIfReady(transaction, responseId, rejectedBy, reason);
    }

    await transaction.commit();
    return { success: true, questionResponseId: questionResponse.QuestionResponseId, status: TakeoutStatus.ACTIVE };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function bulkTakeoutAction(items, action) {
  const results = { success: [], failed: [] };
  for (const item of items) {
    try {
      await action(item);
      results.success.push(item);
    } catch (error) {
      results.failed.push({ ...item, error: error.message });
    }
  }
  return results;
}

module.exports = {
  approveProposedTakeout,
  bulkTakeoutAction,
  cancelProposedTakeoutForQuestion,
  proposeTakeoutForQuestion,
  rejectProposedTakeout
};

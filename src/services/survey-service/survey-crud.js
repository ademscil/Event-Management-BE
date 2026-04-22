async function createSurvey(db, sql, logger, publishCycleService, ValidationError, helpers, data) {
  const { normalizeAssignedAdminIds, syncSurveyAdminAssignments, validateAssignedAdmins, validateDates } = helpers;
  const pool = await db.getPool();
  const transaction = new sql.Transaction(pool);

  try {
    if (!data.title || data.title.trim().length === 0) {
      throw new ValidationError('Title is required');
    }
    if (data.title.length > 500) {
      throw new ValidationError('Title must not exceed 500 characters');
    }
    if (!data.createdBy) {
      throw new ValidationError('CreatedBy is required');
    }
    if (data.startDate && data.endDate) {
      validateDates(data.startDate, data.endDate);
    }

    const hasAssignmentPayload = data.assignedAdminIds !== undefined || data.assignedAdminId !== undefined;
    const assignedAdminIds = hasAssignmentPayload ? normalizeAssignedAdminIds(data) : null;
    if (assignedAdminIds && assignedAdminIds.length > 0) {
      await validateAssignedAdmins(pool, assignedAdminIds);
    }

    if (data.targetScore !== undefined && data.targetScore !== null) {
      if (data.targetScore < 0 || data.targetScore > 10) {
        throw new ValidationError('Target score must be between 0 and 10');
      }
    }

    await transaction.begin();

    const surveyResult = await new sql.Request(transaction)
      .input('title', sql.NVarChar(500), data.title)
      .input('description', sql.NVarChar(sql.MAX), data.description || null)
      .input('startDate', sql.NVarChar(32), data.startDate || null)
      .input('endDate', sql.NVarChar(32), data.endDate || null)
      .input('status', sql.NVarChar(50), 'Draft')
      .input('assignedAdminId', sql.UniqueIdentifier, data.assignedAdminId || null)
      .input('targetRespondents', sql.Int, data.targetRespondents || null)
      .input('targetScore', sql.Decimal(5, 2), data.targetScore || null)
      .input('duplicatePreventionEnabled', sql.Bit, data.duplicatePreventionEnabled !== false)
      .input('createdBy', sql.UniqueIdentifier, data.createdBy)
      .query(`
        IF (
          (OBJECT_ID(N'dbo.Events', N'U') IS NOT NULL AND COL_LENGTH('dbo.Events', 'EventTypeId') IS NOT NULL)
        ) AND OBJECT_ID(N'dbo.EventTypes', N'U') IS NOT NULL
        BEGIN
          INSERT INTO Events (
            Title, Description, StartDate, EndDate, Status,
            AssignedAdminId, TargetRespondents, TargetScore,
            DuplicatePreventionEnabled, CreatedBy, CreatedAt, EventTypeId
          )
          OUTPUT INSERTED.*
          VALUES (
            @title, @description, CONVERT(DATETIME2, @startDate, 126), CONVERT(DATETIME2, @endDate, 126), @status,
            @assignedAdminId, @targetRespondents, @targetScore,
            @duplicatePreventionEnabled, @createdBy, GETDATE(),
            (SELECT TOP 1 EventTypeId FROM EventTypes WHERE Code = 'SURVEY' AND IsActive = 1)
          )
        END
        ELSE
        BEGIN
          INSERT INTO Events (
            Title, Description, StartDate, EndDate, Status,
            AssignedAdminId, TargetRespondents, TargetScore,
            DuplicatePreventionEnabled, CreatedBy, CreatedAt
          )
          OUTPUT INSERTED.*
          VALUES (
            @title, @description, CONVERT(DATETIME2, @startDate, 126), CONVERT(DATETIME2, @endDate, 126), @status,
            @assignedAdminId, @targetRespondents, @targetScore,
            @duplicatePreventionEnabled, @createdBy, GETDATE()
          )
        END
      `);

    const survey = surveyResult.recordset[0];

    if (assignedAdminIds) {
      await syncSurveyAdminAssignments(transaction, survey.SurveyId, assignedAdminIds);
    }

    const config = data.configuration || {};
    const configResult = await new sql.Request(transaction)
      .input('surveyId', sql.UniqueIdentifier, survey.SurveyId)
      .input('heroTitle', sql.NVarChar(500), config.heroTitle || null)
      .input('heroSubtitle', sql.NVarChar(500), config.heroSubtitle || null)
      .input('heroImageUrl', sql.NVarChar(500), config.heroImageUrl || null)
      .input('logoUrl', sql.NVarChar(500), config.logoUrl || null)
      .input('backgroundColor', sql.NVarChar(50), config.backgroundColor || null)
      .input('backgroundImageUrl', sql.NVarChar(500), config.backgroundImageUrl || null)
      .input('primaryColor', sql.NVarChar(50), config.primaryColor || null)
      .input('secondaryColor', sql.NVarChar(50), config.secondaryColor || null)
      .input('fontFamily', sql.NVarChar(100), config.fontFamily || null)
      .input('buttonStyle', sql.NVarChar(50), config.buttonStyle || null)
      .input('showProgressBar', sql.Bit, config.showProgressBar !== false)
      .input('showPageNumbers', sql.Bit, config.showPageNumbers !== false)
      .input('multiPage', sql.Bit, config.multiPage === true)
      .query(`
        INSERT INTO EventConfiguration (
          SurveyId, HeroTitle, HeroSubtitle, HeroImageUrl, LogoUrl,
          BackgroundColor, BackgroundImageUrl, PrimaryColor, SecondaryColor,
          FontFamily, ButtonStyle, ShowProgressBar, ShowPageNumbers, MultiPage,
          CreatedAt
        )
        OUTPUT INSERTED.*
        VALUES (
          @surveyId, @heroTitle, @heroSubtitle, @heroImageUrl, @logoUrl,
          @backgroundColor, @backgroundImageUrl, @primaryColor, @secondaryColor,
          @fontFamily, @buttonStyle, @showProgressBar, @showPageNumbers, @multiPage,
          GETDATE()
        )
      `);

    await transaction.commit();
    logger.info('Survey created', { surveyId: survey.SurveyId, title: data.title });

    return {
      ...survey,
      configuration: configResult.recordset[0]
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function updateSurvey(db, sql, logger, publishCycleService, errors, helpers, surveyId, data) {
  const { NotFoundError, ValidationError } = errors;
  const {
    normalizeAssignedAdminIds,
    resolveUpdatedSchedule,
    syncSurveyAdminAssignments,
    validateAssignedAdmins,
    validateStatus
  } = helpers;

  const pool = await db.getPool();
  const transaction = new sql.Transaction(pool);

  const surveyCheck = await pool.request()
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query('SELECT SurveyId, Status, StartDate, EndDate FROM Events WHERE SurveyId = @surveyId');

  if (surveyCheck.recordset.length === 0) {
    throw new NotFoundError('Survey not found');
  }

  if (data.status) {
    validateStatus(data.status);
  }
  const { nextStartDate, nextEndDate, nextStatus } = resolveUpdatedSchedule(
    surveyCheck.recordset[0],
    data,
  );
  const hasAssignmentPayload = data.assignedAdminIds !== undefined || data.assignedAdminId !== undefined;
  const assignedAdminIds = hasAssignmentPayload ? normalizeAssignedAdminIds(data) : null;
  if (assignedAdminIds && assignedAdminIds.length > 0) {
    await validateAssignedAdmins(pool, assignedAdminIds);
  }
  if (data.targetScore !== undefined && data.targetScore !== null) {
    if (data.targetScore < 0 || data.targetScore > 10) {
      throw new ValidationError('Target score must be between 0 and 10');
    }
  }

  const updateFields = [];
  if (data.title !== undefined) {
    if (!data.title || data.title.trim().length === 0) {
      throw new ValidationError('Title cannot be empty');
    }
    if (data.title.length > 500) {
      throw new ValidationError('Title must not exceed 500 characters');
    }
    updateFields.push('Title = @title');
  }
  if (data.description !== undefined) updateFields.push('Description = @description');
  if (data.startDate !== undefined) updateFields.push('StartDate = CONVERT(DATETIME2, @startDate, 126)');
  if (data.endDate !== undefined) updateFields.push('EndDate = CONVERT(DATETIME2, @endDate, 126)');
  if (data.status !== undefined) updateFields.push('Status = @status');
  if (data.assignedAdminId !== undefined) updateFields.push('AssignedAdminId = @assignedAdminId');
  if (data.targetRespondents !== undefined) updateFields.push('TargetRespondents = @targetRespondents');
  if (data.targetScore !== undefined) updateFields.push('TargetScore = @targetScore');
  if (data.duplicatePreventionEnabled !== undefined) updateFields.push('DuplicatePreventionEnabled = @duplicatePreventionEnabled');

  if (updateFields.length === 0) {
    throw new ValidationError('No fields to update');
  }

  await transaction.begin();
  try {
    const request = new sql.Request(transaction);
    request.input('surveyId', sql.UniqueIdentifier, surveyId);
    if (data.title !== undefined) request.input('title', sql.NVarChar(500), data.title);
    if (data.description !== undefined) request.input('description', sql.NVarChar(sql.MAX), data.description);
    if (data.startDate !== undefined) request.input('startDate', sql.NVarChar(32), nextStartDate);
    if (data.endDate !== undefined) request.input('endDate', sql.NVarChar(32), nextEndDate);
    if (data.status !== undefined) request.input('status', sql.NVarChar(50), nextStatus);
    if (data.assignedAdminId !== undefined) request.input('assignedAdminId', sql.UniqueIdentifier, data.assignedAdminId);
    if (data.targetRespondents !== undefined) request.input('targetRespondents', sql.Int, data.targetRespondents);
    if (data.targetScore !== undefined) request.input('targetScore', sql.Decimal(5, 2), data.targetScore);
    if (data.duplicatePreventionEnabled !== undefined) request.input('duplicatePreventionEnabled', sql.Bit, data.duplicatePreventionEnabled);
    if (data.updatedBy) {
      updateFields.push('UpdatedBy = @updatedBy');
      request.input('updatedBy', sql.UniqueIdentifier, data.updatedBy);
    }
    updateFields.push('UpdatedAt = GETDATE()');

    const result = await request.query(`
      UPDATE Events
      SET ${updateFields.join(', ')}
      OUTPUT INSERTED.*
      WHERE SurveyId = @surveyId
    `);

    if (assignedAdminIds) {
      await syncSurveyAdminAssignments(transaction, surveyId, assignedAdminIds);
    }

    const previousStatus = surveyCheck.recordset[0].Status;
    if (nextStatus === 'Active' && previousStatus !== 'Active') {
      await publishCycleService.activateNewCycle(transaction, surveyId, data.updatedBy || null);
    }

    await transaction.commit();
    logger.info('Survey updated', { surveyId });
    return result.recordset[0];
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function deleteSurvey(db, sql, logger, errors, surveyId) {
  const { NotFoundError, ValidationError } = errors;
  const pool = await db.getPool();

  const surveyCheck = await pool.request()
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query('SELECT SurveyId FROM Events WHERE SurveyId = @surveyId');
  if (surveyCheck.recordset.length === 0) {
    throw new NotFoundError('Survey not found');
  }

  const responseCheck = await pool.request()
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query('SELECT COUNT(*) as count FROM Responses WHERE SurveyId = @surveyId');
  if (responseCheck.recordset[0].count > 0) {
    throw new ValidationError('Cannot delete survey: responses exist');
  }

  const assignmentDeleteResult = await pool.request()
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query('DELETE FROM EventAdminAssignments WHERE SurveyId = @surveyId');

  const result = await pool.request()
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query('DELETE FROM Events WHERE SurveyId = @surveyId');

  const affectedRows = result?.rowsAffected?.[0] ?? assignmentDeleteResult?.rowsAffected?.[0] ?? 0;
  logger.info('Survey deleted', { surveyId });
  return affectedRows > 0;
}

module.exports = {
  createSurvey,
  deleteSurvey,
  updateSurvey
};

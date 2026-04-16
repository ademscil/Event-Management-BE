const sql = require('../../database/sql-client');
const { NotFoundError, ValidationError } = require('./errors');

async function syncSurveyConfiguration(transaction, surveyId, configuration) {
  const configCheck = await new sql.Request(transaction)
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query('SELECT ConfigId FROM SurveyConfiguration WHERE SurveyId = @surveyId');

  if (configuration) {
    const config = configuration;

    if (configCheck.recordset.length > 0) {
      const updateFields = [];
      const request = new sql.Request(transaction);
      request.input('surveyId', sql.UniqueIdentifier, surveyId);

      if (config.heroTitle !== undefined) {
        updateFields.push('HeroTitle = @heroTitle');
        request.input('heroTitle', sql.NVarChar(500), config.heroTitle);
      }

      if (config.heroSubtitle !== undefined) {
        updateFields.push('HeroSubtitle = @heroSubtitle');
        request.input('heroSubtitle', sql.NVarChar(500), config.heroSubtitle);
      }

      if (config.heroImageUrl !== undefined) {
        updateFields.push('HeroImageUrl = @heroImageUrl');
        request.input('heroImageUrl', sql.NVarChar(500), config.heroImageUrl);
      }

      if (config.logoUrl !== undefined) {
        updateFields.push('LogoUrl = @logoUrl');
        request.input('logoUrl', sql.NVarChar(500), config.logoUrl);
      }

      if (config.backgroundColor !== undefined) {
        updateFields.push('BackgroundColor = @backgroundColor');
        request.input('backgroundColor', sql.NVarChar(50), config.backgroundColor);
      }

      if (config.backgroundImageUrl !== undefined) {
        updateFields.push('BackgroundImageUrl = @backgroundImageUrl');
        request.input('backgroundImageUrl', sql.NVarChar(500), config.backgroundImageUrl);
      }

      if (config.primaryColor !== undefined) {
        updateFields.push('PrimaryColor = @primaryColor');
        request.input('primaryColor', sql.NVarChar(50), config.primaryColor);
      }

      if (config.secondaryColor !== undefined) {
        updateFields.push('SecondaryColor = @secondaryColor');
        request.input('secondaryColor', sql.NVarChar(50), config.secondaryColor);
      }

      if (config.fontFamily !== undefined) {
        updateFields.push('FontFamily = @fontFamily');
        request.input('fontFamily', sql.NVarChar(100), config.fontFamily);
      }

      if (config.buttonStyle !== undefined) {
        updateFields.push('ButtonStyle = @buttonStyle');
        request.input('buttonStyle', sql.NVarChar(50), config.buttonStyle);
      }

      if (config.showProgressBar !== undefined) {
        updateFields.push('ShowProgressBar = @showProgressBar');
        request.input('showProgressBar', sql.Bit, config.showProgressBar);
      }

      if (config.showPageNumbers !== undefined) {
        updateFields.push('ShowPageNumbers = @showPageNumbers');
        request.input('showPageNumbers', sql.Bit, config.showPageNumbers);
      }

      if (config.multiPage !== undefined) {
        updateFields.push('MultiPage = @multiPage');
        request.input('multiPage', sql.Bit, config.multiPage);
      }

      if (updateFields.length > 0) {
        updateFields.push('UpdatedAt = GETDATE()');
        await request.query(`
          UPDATE SurveyConfiguration
          SET ${updateFields.join(', ')}
          WHERE SurveyId = @surveyId
        `);
      }
      return;
    }

    await new sql.Request(transaction)
      .input('surveyId', sql.UniqueIdentifier, surveyId)
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
        INSERT INTO SurveyConfiguration (
          SurveyId, HeroTitle, HeroSubtitle, HeroImageUrl, LogoUrl,
          BackgroundColor, BackgroundImageUrl, PrimaryColor, SecondaryColor,
          FontFamily, ButtonStyle, ShowProgressBar, ShowPageNumbers, MultiPage,
          CreatedAt
        )
        VALUES (
          @surveyId, @heroTitle, @heroSubtitle, @heroImageUrl, @logoUrl,
          @backgroundColor, @backgroundImageUrl, @primaryColor, @secondaryColor,
          @fontFamily, @buttonStyle, @showProgressBar, @showPageNumbers, @multiPage,
          GETDATE()
        )
      `);
    return;
  }

  if (configCheck.recordset.length === 0) {
    await new sql.Request(transaction)
      .input('surveyId', sql.UniqueIdentifier, surveyId)
      .input('showProgressBar', sql.Bit, true)
      .input('showPageNumbers', sql.Bit, true)
      .input('multiPage', sql.Bit, false)
      .query(`
        INSERT INTO SurveyConfiguration (
          SurveyId, ShowProgressBar, ShowPageNumbers, MultiPage, CreatedAt
        )
        VALUES (
          @surveyId, @showProgressBar, @showPageNumbers, @multiPage, GETDATE()
        )
      `);
  }
}

async function syncSurveyQuestions(transaction, surveyId, questions, isUpdate, userId, validateQuestionType, validateLayoutOrientation) {
  if (!questions || !Array.isArray(questions)) {
    return;
  }

  if (isUpdate) {
    const existingQuestionsResult = await new sql.Request(transaction)
      .input('surveyId', sql.UniqueIdentifier, surveyId)
      .query('SELECT QuestionId FROM Questions WHERE SurveyId = @surveyId');

    const existingQuestionIds = existingQuestionsResult.recordset.map(q => q.QuestionId);
    const providedQuestionIds = questions
      .filter(q => q.QuestionId)
      .map(q => q.QuestionId);

    for (const existingId of existingQuestionIds) {
      if (!providedQuestionIds.includes(existingId)) {
        await new sql.Request(transaction)
          .input('questionId', sql.UniqueIdentifier, existingId)
          .query('DELETE FROM Questions WHERE QuestionId = @questionId');
      }
    }
  }

  for (const question of questions) {
    validateQuestionType(question.type);

    if (question.layoutOrientation) {
      validateLayoutOrientation(question.layoutOrientation);
    }

    const optionsJson = question.options ? JSON.stringify(question.options) : null;

    if (question.QuestionId) {
      await new sql.Request(transaction)
        .input('questionId', sql.UniqueIdentifier, question.QuestionId)
        .input('type', sql.NVarChar(50), question.type)
        .input('promptText', sql.NVarChar(sql.MAX), question.promptText)
        .input('subtitle', sql.NVarChar(500), question.subtitle || null)
        .input('imageUrl', sql.NVarChar(500), question.imageUrl || null)
        .input('isMandatory', sql.Bit, question.isMandatory || false)
        .input('displayOrder', sql.Int, question.displayOrder)
        .input('pageNumber', sql.Int, question.pageNumber || 1)
        .input('layoutOrientation', sql.NVarChar(20), question.layoutOrientation || null)
        .input('options', sql.NVarChar(sql.MAX), optionsJson)
        .input('commentRequiredBelowRating', sql.Int, question.commentRequiredBelowRating || null)
        .input('updatedBy', sql.UniqueIdentifier, userId)
        .query(`
          UPDATE Questions
          SET Type = @type, PromptText = @promptText, Subtitle = @subtitle,
              ImageUrl = @imageUrl, IsMandatory = @isMandatory,
              DisplayOrder = @displayOrder, PageNumber = @pageNumber,
              LayoutOrientation = @layoutOrientation, Options = @options,
              CommentRequiredBelowRating = @commentRequiredBelowRating,
              UpdatedBy = @updatedBy, UpdatedAt = GETDATE()
          WHERE QuestionId = @questionId
        `);
      continue;
    }

    await new sql.Request(transaction)
      .input('surveyId', sql.UniqueIdentifier, surveyId)
      .input('type', sql.NVarChar(50), question.type)
      .input('promptText', sql.NVarChar(sql.MAX), question.promptText)
      .input('subtitle', sql.NVarChar(500), question.subtitle || null)
      .input('imageUrl', sql.NVarChar(500), question.imageUrl || null)
      .input('isMandatory', sql.Bit, question.isMandatory || false)
      .input('displayOrder', sql.Int, question.displayOrder)
      .input('pageNumber', sql.Int, question.pageNumber || 1)
      .input('layoutOrientation', sql.NVarChar(20), question.layoutOrientation || null)
      .input('options', sql.NVarChar(sql.MAX), optionsJson)
      .input('commentRequiredBelowRating', sql.Int, question.commentRequiredBelowRating || null)
      .input('createdBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO Questions (
          SurveyId, Type, PromptText, Subtitle, ImageUrl,
          IsMandatory, DisplayOrder, PageNumber, LayoutOrientation,
          Options, CommentRequiredBelowRating, CreatedBy, CreatedAt
        )
        VALUES (
          @surveyId, @type, @promptText, @subtitle, @imageUrl,
          @isMandatory, @displayOrder, @pageNumber, @layoutOrientation,
          @options, @commentRequiredBelowRating, @createdBy, GETDATE()
        )
      `);
  }
}

async function updateSurveyCore(transaction, data, existingSurvey, dependencies) {
  const {
    normalizeDateValue,
    validateDates,
    validatePublishWindow,
    validateStatus
  } = dependencies;

  const nextStartDate = data.startDate !== undefined
    ? normalizeDateValue(data.startDate, 'start date')
    : (existingSurvey.StartDate ? new Date(existingSurvey.StartDate) : null);
  const nextEndDate = data.endDate !== undefined
    ? normalizeDateValue(data.endDate, 'end date')
    : (existingSurvey.EndDate ? new Date(existingSurvey.EndDate) : null);
  const nextStatus = data.status !== undefined ? data.status : existingSurvey.Status;

  if (nextStartDate && nextEndDate) {
    validateDates(nextStartDate, nextEndDate);
  }

  validatePublishWindow(nextStatus, nextStartDate, nextEndDate);

  const updateFields = [];
  const request = new sql.Request(transaction);
  request.input('surveyId', sql.UniqueIdentifier, data.surveyId);

  if (data.title !== undefined) {
    if (!data.title || data.title.trim().length === 0) {
      throw new ValidationError('Title cannot be empty');
    }
    if (data.title.length > 500) {
      throw new ValidationError('Title must not exceed 500 characters');
    }
    updateFields.push('Title = @title');
    request.input('title', sql.NVarChar(500), data.title);
  }

  if (data.description !== undefined) {
    updateFields.push('Description = @description');
    request.input('description', sql.NVarChar(sql.MAX), data.description);
  }

  if (data.startDate !== undefined) {
    updateFields.push('StartDate = @startDate');
    request.input('startDate', sql.DateTime2, nextStartDate);
  }

  if (data.endDate !== undefined) {
    updateFields.push('EndDate = @endDate');
    request.input('endDate', sql.DateTime2, nextEndDate);
  }

  if (data.status !== undefined) {
    validateStatus(data.status);
    updateFields.push('Status = @status');
    request.input('status', sql.NVarChar(50), data.status);
  }

  if (data.assignedAdminId !== undefined) {
    updateFields.push('AssignedAdminId = @assignedAdminId');
    request.input('assignedAdminId', sql.UniqueIdentifier, data.assignedAdminId);
  }

  if (data.targetRespondents !== undefined) {
    updateFields.push('TargetRespondents = @targetRespondents');
    request.input('targetRespondents', sql.Int, data.targetRespondents);
  }

  if (data.targetScore !== undefined) {
    if (data.targetScore !== null && (data.targetScore < 0 || data.targetScore > 10)) {
      throw new ValidationError('Target score must be between 0 and 10');
    }
    updateFields.push('TargetScore = @targetScore');
    request.input('targetScore', sql.Decimal(5, 2), data.targetScore);
  }

  if (data.duplicatePreventionEnabled !== undefined) {
    updateFields.push('DuplicatePreventionEnabled = @duplicatePreventionEnabled');
    request.input('duplicatePreventionEnabled', sql.Bit, data.duplicatePreventionEnabled);
  }

  if (updateFields.length > 0) {
    updateFields.push('UpdatedBy = @updatedBy');
    updateFields.push('UpdatedAt = GETDATE()');
    request.input('updatedBy', sql.UniqueIdentifier, data.userId);

    const surveyResult = await request.query(`
      UPDATE Surveys
      SET ${updateFields.join(', ')}
      OUTPUT INSERTED.*
      WHERE SurveyId = @surveyId
    `);

    return surveyResult.recordset[0];
  }

  const surveyResult = await new sql.Request(transaction)
    .input('surveyId', sql.UniqueIdentifier, data.surveyId)
    .query('SELECT * FROM Surveys WHERE SurveyId = @surveyId');

  return surveyResult.recordset[0];
}

async function createSurveyCore(transaction, data, dependencies) {
  const {
    normalizeDateValue,
    validateDates,
    validatePublishWindow
  } = dependencies;

  if (!data.title || data.title.trim().length === 0) {
    throw new ValidationError('Title is required');
  }

  if (data.title.length > 500) {
    throw new ValidationError('Title must not exceed 500 characters');
  }

  if (!data.startDate || !data.endDate) {
    throw new ValidationError('Start date and end date are required');
  }

  const startDate = normalizeDateValue(data.startDate, 'start date');
  const endDate = normalizeDateValue(data.endDate, 'end date');
  validateDates(startDate, endDate);
  validatePublishWindow(data.status || 'Draft', startDate, endDate);

  if (data.targetScore !== undefined && data.targetScore !== null) {
    if (data.targetScore < 0 || data.targetScore > 10) {
      throw new ValidationError('Target score must be between 0 and 10');
    }
  }

  const surveyResult = await new sql.Request(transaction)
    .input('title', sql.NVarChar(500), data.title)
    .input('description', sql.NVarChar(sql.MAX), data.description || null)
    .input('startDate', sql.DateTime2, startDate)
    .input('endDate', sql.DateTime2, endDate)
    .input('status', sql.NVarChar(50), data.status || 'Draft')
    .input('assignedAdminId', sql.UniqueIdentifier, data.assignedAdminId || null)
    .input('targetRespondents', sql.Int, data.targetRespondents || null)
    .input('targetScore', sql.Decimal(5, 2), data.targetScore || null)
    .input('duplicatePreventionEnabled', sql.Bit, data.duplicatePreventionEnabled !== false)
    .input('createdBy', sql.UniqueIdentifier, data.userId)
    .query(`
      IF (
        (OBJECT_ID(N'dbo.Events', N'U') IS NOT NULL AND COL_LENGTH('dbo.Events', 'EventTypeId') IS NOT NULL)
        OR (OBJECT_ID(N'dbo.Surveys', N'U') IS NOT NULL AND COL_LENGTH('dbo.Surveys', 'EventTypeId') IS NOT NULL)
      ) AND OBJECT_ID(N'dbo.EventTypes', N'U') IS NOT NULL
      BEGIN
        INSERT INTO Surveys (
          Title, Description, StartDate, EndDate, Status,
          AssignedAdminId, TargetRespondents, TargetScore,
          DuplicatePreventionEnabled, CreatedBy, CreatedAt, EventTypeId
        )
        OUTPUT INSERTED.*
        VALUES (
          @title, @description, @startDate, @endDate, @status,
          @assignedAdminId, @targetRespondents, @targetScore,
          @duplicatePreventionEnabled, @createdBy, GETDATE(),
          (SELECT TOP 1 EventTypeId FROM EventTypes WHERE Code = 'SURVEY' AND IsActive = 1)
        )
      END
      ELSE
      BEGIN
        INSERT INTO Surveys (
          Title, Description, StartDate, EndDate, Status,
          AssignedAdminId, TargetRespondents, TargetScore,
          DuplicatePreventionEnabled, CreatedBy, CreatedAt
        )
        OUTPUT INSERTED.*
        VALUES (
          @title, @description, @startDate, @endDate, @status,
          @assignedAdminId, @targetRespondents, @targetScore,
          @duplicatePreventionEnabled, @createdBy, GETDATE()
        )
      END
    `);

  return surveyResult.recordset[0];
}

async function loadExistingSurveyForSave(transaction, surveyId) {
  const surveyCheck = await new sql.Request(transaction)
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query('SELECT SurveyId, Status, StartDate, EndDate FROM Surveys WHERE SurveyId = @surveyId');

  if (surveyCheck.recordset.length === 0) {
    throw new NotFoundError('Survey not found');
  }

  return surveyCheck.recordset[0];
}

module.exports = {
  createSurveyCore,
  loadExistingSurveyForSave,
  syncSurveyConfiguration,
  syncSurveyQuestions,
  updateSurveyCore
};
